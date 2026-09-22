import { newId } from './id';
import { SqlBindValue, SqlExecutor } from './executor';
import { EVENING_META_STEMS, EVENING_PRACTICE_SEED_STEMS, PROGRAMME_SEED_STEMS, programmeStemCategory, RETIRED_SEED_STEMS, TimeOfDay, WEEKLY_META_STEM } from './seed/stems';
import { DEFAULT_SETTINGS, Settings } from './seed/settings';
import { nowEventTime } from './time';
import { EndReason, SessionOrigin } from '@/session/sessionMachine';
import { BadgeSession } from '@/session/badges';
import { PROGRAMME_WEEK_CAP } from '@/session/program';

/**
 * t10 (packet 3, owner decision 2026-09-22): a session with zero non-empty
 * endings is still saved (§6.3.8 "nothing is discarded, ever"; §6.3.9 early
 * Done unchanged) but NEVER counts as complete. Every read whose semantics
 * are "completed session(s)" carries this predicate: at least one non-deleted
 * ending with at least one non-space character (SQLite TRIM strips spaces, so
 * a whitespace-only field reads as empty — the shape a first keypress plus a
 * timer expiry leaves behind, ADR-0003). Read-time only: no column, no
 * migration, nothing stored (§13.7). The anchor read
 * (`getFirstProgrammeSitting`) deliberately does NOT carry it — the programme
 * starts when the user first sits down, whether or not that sitting produced
 * text.
 */
const HAS_NON_EMPTY_ENDING = `EXISTS (
  SELECT 1 FROM endings e
  WHERE e.session_id = s.id AND e.deleted_at IS NULL AND TRIM(e.text) <> ''
)`;

/** Every user-facing table, in the order the debug dump shows them. */
export const ALL_TABLES = [
  'stems',
  'sessions',
  'endings',
  'reviews',
  'settings',
  'notification_schedule',
  'schema_meta',
] as const;
export type TableName = (typeof ALL_TABLES)[number];

export interface StemRow {
  id: string;
  text: string;
  origin: 'seed' | 'user' | 'imported' | 'meta';
  category: string | null;
  weight: number;
  /** Morning/evening pivot (migration 0003): which fixed daily notification this stem belongs to. Null for the weekly meta-stem and any pre-pivot row never backfilled (DECISIONS.md 2026-09-14); the two evening reflection meta-stems carry 'evening' (issue 06) — tagged at seed, never drawn by a practice. */
  time_of_day: TimeOfDay | null;
}

export interface LibraryStemRow extends StemRow {
  active: number; // 0/1
  deleted_at: string | null;
  created_at: string;
  /** Programme week (migration 0004): 1–30 for seed programme stems, null otherwise. Read-path only (issue 03's week filter); never written here. */
  weekNumber: number | null;
}

export interface SessionRow {
  id: string;
  stem_id: string;
  stem_text_snapshot: string;
  origin: SessionOrigin;
  target_endings: number;
  timer_seconds: number;
  uncensored_mode: number;
  started_at: string;
  first_keypress_at: string | null;
  ended_at: string | null;
  end_reason: EndReason | null;
  last_activity_at: string | null;
  tz: string;
  offset_min: number;
  device_locale: string;
}

export interface EndingRow {
  id: string;
  session_id: string;
  ordinal: number;
  text: string;
  started_at: string;
  submitted_at: string | null;
  backspace_count: number;
}

/** One row of the reverse-chronological history list (§6.7): a session plus enough stem context to display and filter without a second query per row. */
export interface HistorySessionRow {
  id: string;
  stem_id: string;
  stem_text_snapshot: string;
  category: string | null;
  origin: SessionOrigin;
  started_at: string;
  ended_at: string | null;
  end_reason: EndReason | null;
}

/** §6.7 filters for the history list. Any field omitted/undefined is not applied. */
export interface HistoryFilters {
  stemId?: string;
  category?: string;
  /** Inclusive UTC ISO-8601 bounds on `sessions.started_at`. */
  dateFrom?: string;
  dateTo?: string;
}

/** One matching ending from `Repository.searchEndings`, with enough session context to display and to jump to the session it came from. */
export interface EndingSearchResult {
  endingId: string;
  sessionId: string;
  ordinal: number;
  text: string;
  startedAt: string;
  stemTextSnapshot: string;
  sessionStartedAt: string;
}

/**
 * Turns free text into an FTS5 `MATCH` query: each whitespace-separated
 * term, double-quoted so FTS5's own query syntax (`*`, `-`, `NEAR`, `"`,
 * column filters, …) in the user's search text is treated as literal
 * content rather than a syntax error or an unintended operator, ANDed
 * together (FTS5's implicit default) so a multi-word search narrows, not
 * widens. Empty/whitespace-only input yields `null` (nothing to search).
 */
function toFtsMatchQuery(raw: string): string | null {
  const terms = raw
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  return terms.length > 0 ? terms.join(' AND ') : null;
}

export type NotificationScheduleState = 'pending' | 'fired' | 'cancelled' | 'superseded';

export interface NotificationScheduleRow {
  id: string;
  scheduled_for: string; // UTC
  stem_id: string | null;
  os_identifier: string | null;
  state: NotificationScheduleState;
  created_at: string;
}

/**
 * Reads and writes shared by first-launch seeding and the debug dump
 * screen. Deliberately thin: M2+ tickets add session/ending/review
 * read-write methods as those features are built, rather than speculating
 * on their shape here.
 */
export class Repository {
  constructor(private readonly db: SqlExecutor) {}

  /** True once any stem exists — i.e. seeding has already run. */
  hasStems(): boolean {
    const row = this.db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM stems', []);
    return (row?.count ?? 0) > 0;
  }

  /**
   * Inserts the seed corpus and default settings on first launch. Idempotent:
   * a no-op if stems already exist, so it's safe to call on every app start.
   *
   * The corpus, per spec §5 as amended 2026-09-15 (ADR-0005):
   * 1. the official Sentence Completion I programme — every stem of Weeks
   *    1–30, byte-for-byte from the canonical snapshot, stored WITHOUT the
   *    trailing terminator (`stem_terminator` is appended at render),
   *    `time_of_day = 'morning'`, each tagged with its `week_number` and
   *    its §5.2 category via the week→pillar mapping (`programmeStemCategory`,
   *    issue 04);
   * 2. the official weekly reflection stem, seeded once with
   *    `is_weekly_meta = 1`, `week_number = NULL`, `time_of_day = NULL`;
   * 3. the two evening-review meta-stems (`origin = 'meta'`, inactive),
   *    tagged `time_of_day = 'evening'` (issue 06) so the library's
   *    Evening filter matches them;
   * 4. the 26 retired v1 originals — soft-deleted AT SEED TIME
   *    (`deleted_at` set, `active = 0`): present for provenance/exports,
   *    never active, never shown in the library (spec §5.3);
   * 5. the evening practice starter set (issue 17, 2026-09-18 owner
   *    decision): seven app-original evening practice stems, seeded
   *    ACTIVE and `time_of_day = 'evening'` — real content for the
   *    library's Evening filter and the evening practice surface. The
   *    §5.4 meta-stems (item 3) keep their resting role beside them.
   *    Installs predating the set receive these rows through migration
   *    0007 instead — seeding happens once per install, and this method
   *    never re-runs on a database that already has stems.
   */
  seedIfEmpty(): void {
    if (this.hasStems()) return;

    this.db.withTransactionSync(() => {
      // Issue 09 (v14-feedback): hybrid week unlock — fresh installs seed
      // ONLY week 1 active, weeks 2..30 resting. Programme stems are inserted
      // in week order (seed array is week-sorted), so we activate the first
      // week's stems and rest the rest.
      for (const stem of PROGRAMME_SEED_STEMS) {
        const { at, tz, offsetMin } = nowEventTime();
        // Activate only week 1; all later weeks rest.
        const active = stem.weekNumber === 1 ? 1 : 0;
        this.db.runSync(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
           VALUES (?, ?, 'seed', ?, 'en', 1.0, ?, ?, ?, ?, 'morning', ?, 0)`,
          [newId(), stem.text, programmeStemCategory(stem.weekNumber, stem.text), active, at, tz, offsetMin, stem.weekNumber],
        );
      }

      // The official weekly reflection stem (§5.4 #1). A real `stems` row
      // because `sessions.stem_id` is a foreign key (spec §4.2) and the
      // weekly reflection completion is "a normal timed session" (§6.5.2).
      // Unlike the evening meta-stems below it is `origin = 'seed'` and
      // `active = 1` — the 2026-09-15 amendment makes it the scheduled
      // weekly reflection's own stem (ADR-0005), reached via
      // `is_weekly_meta = 1`, never via the generic active-stem reads
      // (guarded below).
      {
        const { at, tz, offsetMin } = nowEventTime();
        this.db.runSync(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
           VALUES (?, ?, 'seed', NULL, 'en', 1.0, 1, ?, ?, ?, NULL, NULL, 1)`,
          [newId(), WEEKLY_META_STEM, at, tz, offsetMin],
        );
      }

      // Evening-review meta-stems (§5.4, minus the weekly one) are a
      // distinct concept from stems (CONTEXT.md: "used only in review..."),
      // not a category of them — seeded with `active = 0` so they can never
      // surface via the practice draws or `listActiveStems`, and `origin =
      // 'meta'` so the review/rotation reads can tell them apart. Since
      // issue 06 they carry `time_of_day = 'evening'` and ARE shown in the
      // stem library (§6.6) as resting, evening-tagged rows — the Evening
      // filter matches them; no draw ever picks them.
      for (const text of EVENING_META_STEMS) {
        const { at, tz, offsetMin } = nowEventTime();
        this.db.runSync(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
           VALUES (?, ?, 'meta', NULL, 'en', 1.0, 0, ?, ?, ?, 'evening', NULL, 0)`,
          [newId(), text, at, tz, offsetMin],
        );
      }

      // Retired v1 originals (spec §5.3, struck 2026-09-15): soft-deleted
      // at seed time — the append-only way to ship provenance without ever
      // surfacing them (§4.1, §4.5: exports keep the flag intact).
      for (const stem of RETIRED_SEED_STEMS) {
        const { at, tz, offsetMin } = nowEventTime();
        this.db.runSync(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta, deleted_at)
           VALUES (?, ?, 'seed', ?, 'en', 1.0, 0, ?, ?, ?, ?, NULL, 0, ?)`,
          [newId(), stem.text, stem.category, at, tz, offsetMin, stem.timeOfDay, at],
        );
      }

      // The evening practice starter set (issue 17, 2026-09-18 owner
      // decision): app-original placeholder text (spec §5.1 clean — never
      // programme or Branden text, never transcribed from any source),
      // seeded ACTIVE and evening-tagged so the Evening filter and the
      // evening practice surface real content; the meta-stems above keep
      // their resting role beside them. week_number NULL keeps the rows
      // outside the programme, so week-set activation never touches them.
      // Installs predating the set receive these rows through migration
      // 0007 — seeding happens once per install, never again.
      for (const stem of EVENING_PRACTICE_SEED_STEMS) {
        const { at, tz, offsetMin } = nowEventTime();
        this.db.runSync(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day, week_number, is_weekly_meta)
           VALUES (?, ?, 'seed', ?, 'en', 1.0, 1, ?, ?, ?, 'evening', NULL, 0)`,
          [newId(), stem.text, stem.category, at, tz, offsetMin],
        );
      }

      // INSERT OR IGNORE: migration 0004 (which runs before this on every
      // open) already inserted the four §7 keys it added — on a fresh
      // install those rows exist by the time seeding runs.
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        const { at } = nowEventTime();
        this.db.runSync(
          'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
          [key, JSON.stringify(value), at],
        );
      }
    });
  }

  /** Every row of every table, for the debug dump screen. Includes soft-deleted rows. */
  dumpAllTables(): Record<TableName, Record<string, unknown>[]> {
    const result = {} as Record<TableName, Record<string, unknown>[]>;
    for (const table of ALL_TABLES) {
      result[table] = this.db.getAllSync<Record<string, unknown>>(`SELECT * FROM ${table}`, []);
    }
    return result;
  }

  /**
   * All §7 settings, decoded, falling back to spec defaults for any key not
   * yet seeded. Excludes the app-internal UI-state keys `onboarding_completed`
   * and `intro_completed` (see `isOnboardingComplete`/`isIntroComplete`) —
   * they live in the same table but are not §7's user-facing tunables, so
   * they must never appear on the typed `Settings` object callers
   * destructure.
   */
  getSettings(): Settings {
    const rows = this.db.getAllSync<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key NOT IN ('onboarding_completed', 'intro_completed')",
      [],
    );
    const values = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    return { ...DEFAULT_SETTINGS, ...values };
  }

  /**
   * Upserts one settings key (§7), JSON-encoded, stamping `updated_at`.
   * `INSERT ... ON CONFLICT` rather than update-then-maybe-insert because
   * `seedIfEmpty` always writes every key up front, but this stays correct
   * even if that invariant ever changes.
   */
  setSetting(key: keyof Settings, value: Settings[keyof Settings]): void {
    const { at } = nowEventTime();
    this.db.runSync(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), at],
    );
  }

  /**
   * Whether onboarding (§6.1) has already been shown. Stored as a plain
   * `settings` row (`onboarding_completed`) — deliberately not part of the
   * `Settings` interface/`DEFAULT_SETTINGS`, since it isn't one of §7's
   * user-facing tunables, just app-internal "has this run once" state. The
   * `settings` table is a free-form key/value store; this reuses it rather
   * than adding a schema column or table for one boolean.
   */
  isOnboardingComplete(): boolean {
    const row = this.db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'onboarding_completed'", []);
    return row ? JSON.parse(row.value) === true : false;
  }

  setOnboardingComplete(): void {
    const { at } = nowEventTime();
    this.db.runSync(
      `INSERT INTO settings (key, value, updated_at) VALUES ('onboarding_completed', 'true', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [at],
    );
  }

  // ── c03 (official-programme round): intro-completion marker ────────────
  // Coordinator-approved out-of-map excursion (hub FLAG 2026-09-16, APPROVED
  // 09:54): additive only, byte-for-byte the documented `onboarding_completed`
  // pattern above — a plain settings-table row, deliberately outside the §7
  // `Settings` interface, riding §8 export/import the same way. Gates the
  // first-run introduction (§7, ADR-0005: evening practice "asked once at
  // first launch"), which must be shown once — never derived from
  // `evening_practice_enabled`, whose default equals one of its answers.

  /**
   * Whether the one-question first-run introduction (§7, ADR-0005) has
   * already been answered or skipped. Stored as a plain `settings` row
   * (`intro_completed`) — the same app-internal "has this run once" pattern
   * as `onboarding_completed`, not one of §7's tunables. Both first-run
   * stages must be tracked independently: an upgrader completes onboarding
   * in a previous app version but still gets asked the intro question once.
   */
  isIntroComplete(): boolean {
    const row = this.db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'intro_completed'", []);
    return row ? JSON.parse(row.value) === true : false;
  }

  setIntroComplete(): void {
    const { at } = nowEventTime();
    this.db.runSync(
      `INSERT INTO settings (key, value, updated_at) VALUES ('intro_completed', 'true', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [at],
    );
  }
  // ── end c03 intro-completion marker ────────────────────────────────────

  /**
   * The one legitimate hard wipe (spec §9, §13.5): deletes every row of
   * every user-data table — children before parents so this is correct
   * whether or not the connection enforces foreign keys, same ordering
   * `applyImport`'s replace mode uses — then re-seeds to factory state.
   * `schema_meta` is left alone: it's migration bookkeeping, not user data,
   * and wiping it would make the app think it needs to migrate from
   * scratch on next open. Cancelling pending OS notifications is the
   * caller's job (`src/notifications/scheduler.ts` owns that side effect).
   */
  deleteAllData(): void {
    this.db.withTransactionSync(() => {
      for (const table of ['endings', 'notification_schedule', 'reviews', 'sessions', 'stems', 'settings'] as const) {
        this.db.execSync(`DELETE FROM ${table}`);
      }
    });
    this.seedIfEmpty();
  }

  /**
   * Active, non-deleted stems, for generic session start and stem reads.
   * Excludes the weekly meta-stem (`is_weekly_meta = 1`, migration 0004):
   * it is review machinery (§6.5), reached only through its flag — it must
   * never surface in a practice draw or a generic stem list.
   */
  listActiveStems(): StemRow[] {
    return this.db.getAllSync<StemRow>(
      "SELECT id, text, origin, category, weight, time_of_day FROM stems WHERE active = 1 AND deleted_at IS NULL AND is_weekly_meta = 0 ORDER BY created_at",
      [],
    );
  }

  /** Active, non-deleted stems tagged for the given time of day (migration 0003), for the two fixed daily notifications. Ordered by `id` (UUIDv7, chronological) for a deterministic draw. */
  getActiveStemsForTimeOfDay(timeOfDay: TimeOfDay): StemRow[] {
    return this.db.getAllSync<StemRow>(
      'SELECT id, text, origin, category, weight, time_of_day FROM stems WHERE active = 1 AND deleted_at IS NULL AND time_of_day = ? ORDER BY id',
      [timeOfDay],
    );
  }

  /**
   * Every stem, including archived and soft-deleted ones, for the stem
   * library (§6.6) — the library filters/searches client-side over this,
   * unlike `listActiveStems`'s narrow session-start use. Includes the two
   * evening meta-stems (issue 06, owner feedback "there are no evening
   * stems"): they surface as resting, evening-tagged rows the Evening
   * filter matches — still `active = 0`, so no practice draw or generic
   * active-stem read ever picks them. The weekly meta-stem
   * (`is_weekly_meta = 1`, seeded `origin = 'seed'`) stays excluded: it is
   * the scheduled weekly reflection's own stem (§6.5), not an evening one,
   * and review machinery is not editable/browsable like a regular stem.
   */
  listAllStems(): LibraryStemRow[] {
    return this.db.getAllSync<LibraryStemRow>(
      // week_number rides along (read-path, issue 03): the library's week
      // filter buckets every row — resting and soft-deleted included — by
      // its programme week. Schema untouched.
      "SELECT id, text, origin, category, weight, time_of_day, active, deleted_at, created_at, week_number as weekNumber FROM stems WHERE is_weekly_meta = 0 ORDER BY created_at DESC",
      [],
    );
  }

  // -------------------------------------------------------------------
  // Official-programme reads (issue 02-program-engine; coordinator
  // pre-approval in the round hub: read-path additions ONLY — the cycle's
  // only writes are `createReview` on reflection completion and the
  // ADR-0005-sanctioned `program_week_override` setting via `setSetting`).
  // Week/calendar arithmetic deliberately stays OUT of SQL: these reads
  // return raw §4.1.3 event triples and rows, and `src/session/program.ts`
  // (pure, unit-tested) does the Mon–Sun bucketing.
  // -------------------------------------------------------------------

  /**
   * The §6.2 derivation anchor: the earliest non-deleted session ever
   * written on a programme stem (`week_number IS NOT NULL`), with its
   * stored UTC offset so the caller can place it in its own local calendar
   * week. Null before the first programme practice — the derived week stays
   * 1 until the programme itself has started, however many reflections
   * predate it.
   */
  getFirstProgrammeSitting(): { startedAt: string; offsetMin: number } | null {
    return (
      this.db.getFirstSync<{ startedAt: string; offsetMin: number }>(
        `SELECT s.started_at as startedAt, s.offset_min as offsetMin
         FROM sessions s JOIN stems st ON st.id = s.stem_id
         WHERE s.deleted_at IS NULL AND st.week_number IS NOT NULL
         ORDER BY s.started_at ASC
         LIMIT 1`,
        [],
      ) ?? null
    );
  }

  /**
   * Every completed weekly reflection (§6.5.1): a finished (`ended_at` set)
   * `origin='review'` session on the weekly meta-stem with at least one
   * non-empty ending (t10 owner decision 2026-09-22 — a zero-content
   * reflection is saved but must not advance the programme week). The caller
   * buckets these into Mon–Sun week keys (`eventWeekMondayKey`) to derive the
   * programme week — an in-progress session is not yet a completed
   * reflection and must not advance anything.
   */
  listCompletedWeeklyReflections(): { startedAt: string; offsetMin: number }[] {
    return this.db.getAllSync<{ startedAt: string; offsetMin: number }>(
      `SELECT s.started_at as startedAt, s.offset_min as offsetMin
       FROM sessions s JOIN stems st ON st.id = s.stem_id
       WHERE s.deleted_at IS NULL AND s.ended_at IS NOT NULL
         AND s.origin = 'review' AND st.is_weekly_meta = 1
         AND ${HAS_NON_EMPTY_ENDING}
       ORDER BY s.started_at ASC`,
      [],
    );
  }

  /**
   * Every completed evening reflection (§6.2/§6.5.2): a finished
   * `origin='review'` session on either evening meta-stem with at least one
   * non-empty ending (t10 owner decision 2026-09-22 — saved, never complete).
   * Drives the deterministic stem alternation (count parity,
   * `eveningReflectionStemIndex`) and the evening card's done state.
   * On-demand reviews (§6.5.3) that used an evening meta-stem land in the
   * same set — they are indistinguishable by design (same storage path,
   * §6.5.2) and merely shift which stem is next, never the programme week.
   */
  listCompletedEveningReflections(): { startedAt: string; offsetMin: number }[] {
    return this.db.getAllSync<{ startedAt: string; offsetMin: number }>(
      `SELECT s.started_at as startedAt, s.offset_min as offsetMin
       FROM sessions s JOIN stems st ON st.id = s.stem_id
       WHERE s.deleted_at IS NULL AND s.ended_at IS NOT NULL
         AND s.origin = 'review' AND st.origin = 'meta' AND st.is_weekly_meta = 0
         AND ${HAS_NON_EMPTY_ENDING}
       ORDER BY s.started_at ASC`,
      [],
    );
  }

  /**
   * The active programme stems of one week (1–30), in seed order — the
   * morning practice's queue (§6.2) and the one-off week practice's queue.
   * Seed order is INSERTION order (`rowid`: the seed inserts stems
   * sequentially, and import re-inserts in file order, preserving relative
   * order). `created_at` is NOT a reliable key — all seed rows share
   * milliseconds, and the UUIDv7 `id` tiebreaker orders same-ms ids by
   * random bits (c06 finding F7).
   */
  getProgrammeStemsForWeek(week: number): StemRow[] {
    if (!Number.isInteger(week) || week < 1 || week > PROGRAMME_WEEK_CAP) return [];
    return this.db.getAllSync<StemRow>(
      `SELECT id, text, origin, category, weight, time_of_day FROM stems
       WHERE active = 1 AND deleted_at IS NULL AND week_number = ?
       ORDER BY rowid`,
      [week],
    );
  }

  /**
   * Every non-deleted programme stem with its week number, ordered by week
   * then seed order — the programme page's Week 1–30 grouping (§6.6).
   * Resting stems are INCLUDED since issue 04's week-set activation
   * (coordinator-approved hub FLAG 2026-09-16): activation deliberately
   * rests 29 of 30 weeks, and the programme page must still show every
   * week's full block for its one-off practice. The rotation's own reads
   * stay active-filtered (`getProgrammeStemsForWeek`). Seed order is
   * insertion order (`rowid`, per getProgrammeStemsForWeek; c06 finding F7).
   */
  listProgrammeStems(): (StemRow & { weekNumber: number })[] {
    return this.db.getAllSync<StemRow & { weekNumber: number }>(
      `SELECT id, text, origin, category, weight, time_of_day, week_number as weekNumber FROM stems
       WHERE deleted_at IS NULL AND week_number IS NOT NULL
       ORDER BY week_number, rowid`,
      [],
    );
  }

  // -------------------------------------------------------------------
  // t04 (v12-feedback round, issue 04): week-set activation + the one-off
  // week visit. `active` is the §4.1 state column and the week-set write
  // is allowed state mutation — history rows are never touched,
  // soft-deletes are never touched, and rows outside the programme
  // (`week_number IS NULL`: user/imported stems, the weekly meta-stem,
  // the retired v1 originals, the evening meta-stems) are never in scope.
  // -------------------------------------------------------------------

  /**
   * Week-set activation (issue 09, v14-feedback): CUMULATIVE unlock.
   * Makes weeks 1..week the programme's active weeks — all programme stems
   * whose `week_number <= week` get `active = 1`, all others (including week
   * itself if it was previously locked) get `active = 0`. This implements
   * the hybrid unlock rule: auto-unlock on prior week completion (derived
   week advances → unlock 1..N) plus manual enable ("make this my week" on
   week M → unlock 1..M). Weeks never re-lock once unlocked.
   *
   * Called at every point the effective week can change: setting or clearing
   * `program_week_override` (the programme page) and completing a weekly
   * reflection (write.tsx — override-clear back to the derived week, or a
   * derived advance). Idempotent; out-of-range weeks are a no-op,
   * same guard as `getProgrammeStemsForWeek`.
   */
  setProgrammeWeekActive(week: number): void {
    if (!Number.isInteger(week) || week < 1 || week > PROGRAMME_WEEK_CAP) return;
    // Activate weeks 1..target; rest every higher week. Scoped to programme
    // rows: user stems, the weekly meta-stem and the evening meta-stems have
    // `week_number IS NULL` and keep their own active flags.
    this.db.runSync(
      'UPDATE stems SET active = CASE WHEN week_number <= ? THEN 1 ELSE 0 END WHERE week_number IS NOT NULL',
      [week],
    );
  }

  /**
   * Every non-deleted programme stem of one week, resting included, in seed
   * order — the one-off week practice's queue (§6.2 `origin='manual'`, the
   * programme page's "write this week's practice"). An explicit whole-block
   * visit is activation-state-agnostic (hub FLAG-ANSWER 2026-09-16): unlike
   * `getProgrammeStemsForWeek` (the rotation's queue), it must not empty out
   * because week-set activation rested the week, and it deliberately does
   * not trample per-stem resting in the rotation either — the two reads
   * answer different questions. Soft-deleted stems stay excluded everywhere.
   */
  getProgrammeWeekBlock(week: number): StemRow[] {
    if (!Number.isInteger(week) || week < 1 || week > PROGRAMME_WEEK_CAP) return [];
    return this.db.getAllSync<StemRow>(
      `SELECT id, text, origin, category, weight, time_of_day FROM stems
       WHERE deleted_at IS NULL AND week_number = ?
       ORDER BY rowid`,
      [week],
    );
  }

  /**
   * Week-set unlock threshold: returns the highest `week_number` that has any
   * active stems. If no programme stems are active, returns 0. This is used
   * by `applyWeekSetActivation` to preserve existing unlock state when
   * migrating from the old single-week model to the new cumulative model
   * (issue 09).
   */
  getHighestUnlockedWeek(): number {
    const row = this.db.getFirstSync<{ week: number }>(
      `SELECT week_number as week FROM stems
       WHERE week_number IS NOT NULL AND active = 1
       ORDER BY week_number DESC
       LIMIT 1`,
      [],
    );
    return row?.week ?? 0;
  }

  /**
   * The weekly meta-stem row (`is_weekly_meta = 1`, §5.4 #1/ADR-0005) — the
   * scheduled weekly reflection's own stem, reached only through this flag,
   * never a generic practice draw.
   */
  getWeeklyMetaStem(): StemRow | null {
    return (
      this.db.getFirstSync<StemRow>(
        'SELECT id, text, origin, category, weight, time_of_day FROM stems WHERE is_weekly_meta = 1 LIMIT 1',
        [],
      ) ?? null
    );
  }

  /**
   * The weekly reflection's re-read (§6.5.1): every non-deleted session on
   * the given programme week's stems that has at least one non-deleted
   * ending, chronological, with endings in ordinal order. The programme
   * week is a stem block (`week_number`), not a date range — the reflection
   * is self-paced, so "week N's endings" means what was written on week N's
   * stems, whenever that happened. Same two-step shape as
   * `listSessionsForReview`.
   */
  listSessionsForProgrammeWeek(week: number): { session: SessionRow; endings: EndingRow[] }[] {
    if (!Number.isInteger(week) || week < 1 || week > PROGRAMME_WEEK_CAP) return [];
    const sessionIds = this.db
      .getAllSync<{ id: string }>(
        `SELECT DISTINCT s.id as id
         FROM sessions s
         JOIN stems st ON st.id = s.stem_id
         JOIN endings e ON e.session_id = s.id
         WHERE s.deleted_at IS NULL AND e.deleted_at IS NULL AND st.week_number = ?
         ORDER BY s.started_at`,
        [week],
      )
      .map((r) => r.id);
    return sessionIds
      .map((id) => this.getSessionDetail(id))
      .filter((d): d is { session: SessionRow; endings: EndingRow[] } => d !== null);
  }

  /**
   * The evening reflection's re-read (§6.2/§6.5.2): non-deleted sessions on
   * non-deleted morning-tagged stems with at least one non-deleted ending
   * started in `[dayStart, dayEnd)` — the caller passes today's local-day
   * bounds in UTC ISO (`utcBoundsOfLocalDay`). Scoped to `time_of_day =
   * 'morning'` stems: the evening sits down to reflect the morning's
   * practice, not everything touched today. The stem join carries its own
   * `deleted_at IS NULL` (issue 10): a stem soft-deleted between the
   * morning's writing and the evening's reflection must not surface in the
   * reread — the endings stay in history/exports (§4.1.5), the practice
   * surface just stops showing them.
   */
  listSessionsForDayMorning(dayStart: string, dayEnd: string): { session: SessionRow; endings: EndingRow[] }[] {
    const sessionIds = this.db
      .getAllSync<{ id: string }>(
        `SELECT DISTINCT s.id as id
         FROM sessions s
         JOIN stems st ON st.id = s.stem_id
         JOIN endings e ON e.session_id = s.id
         WHERE s.deleted_at IS NULL AND e.deleted_at IS NULL AND st.deleted_at IS NULL
           AND st.time_of_day = 'morning'
           AND e.started_at >= ? AND e.started_at < ?
         ORDER BY s.started_at`,
        [dayStart, dayEnd],
      )
      .map((r) => r.id);
    return sessionIds
      .map((id) => this.getSessionDetail(id))
      .filter((d): d is { session: SessionRow; endings: EndingRow[] } => d !== null);
  }

  /**
   * How many DISTINCT stems of the given programme week have at least one
   * completed (ended) session started in `[dayStart, dayEnd)` — the Home
   * week card's "practice done for today" signal, compared against the
   * week's stem count (§6.2: the practice is complete once every stem in
   * the set has been written).
   */
  countProgrammeStemsCompletedInRange(week: number, dayStart: string, dayEnd: string): number {
    if (!Number.isInteger(week) || week < 1 || week > PROGRAMME_WEEK_CAP) return 0;
    // t10 (owner decision 2026-09-22): a stem is "completed today" only by a
    // session with at least one non-empty ending — a timer-expired empty
    // session on the last stem no longer reads as "Morning practice complete".
    const row = this.db.getFirstSync<{ count: number }>(
      `SELECT COUNT(DISTINCT s.stem_id) as count
       FROM sessions s JOIN stems st ON st.id = s.stem_id
       WHERE s.deleted_at IS NULL AND s.ended_at IS NOT NULL AND st.week_number = ?
         AND s.started_at >= ? AND s.started_at < ?
         AND ${HAS_NON_EMPTY_ENDING}`,
      [week, dayStart, dayEnd],
    );
    return row?.count ?? 0;
  }

  /**
   * The 3 §5.4 review meta-stems, each with the real `stems.id` a review
   * session's `stem_id` FK needs. Since migration 0004 the weekly one is
   * `origin = 'seed'` (tagged `is_weekly_meta = 1`), so the filter is the
   * disjunction — spec §5.4: all three remain available to on-demand
   * review. Seeded order (weekly first) is preserved by `created_at`.
   */
  listMetaStems(): StemRow[] {
    return this.db.getAllSync<StemRow>(
      "SELECT id, text, origin, category, weight, time_of_day FROM stems WHERE origin = 'meta' OR is_weekly_meta = 1 ORDER BY created_at",
      [],
    );
  }

  /**
   * Recent session starts (stem id, its category, when started), for the
   * weighted selection's recency/category penalties (§6.2). 14 days covers
   * the widest window either penalty looks at; the caller doesn't need
   * anything older.
   */
  getRecentStemUsage(): { stemId: string; category: string | null; startedAt: string }[] {
    return this.db.getAllSync<{ stemId: string; category: string | null; startedAt: string }>(
      `SELECT s.stem_id as stemId, st.category as category, s.started_at as startedAt
       FROM sessions s
       JOIN stems st ON st.id = s.stem_id
       WHERE s.deleted_at IS NULL AND s.started_at >= ?
       ORDER BY s.started_at DESC`,
      [new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()],
    );
  }

  /** Every non-deleted stem's text, for the "not a verbatim duplicate" check (§6.6). */
  listStemTexts(): string[] {
    return this.db
      .getAllSync<{ text: string }>("SELECT text FROM stems WHERE deleted_at IS NULL AND origin != 'meta'", [])
      .map((r) => r.text);
  }

  /**
   * Adds a stem the user wrote or pasted (§6.6). Caller validates first
   * (`validateStemText`) — this just persists. `origin` is `'user'` for a
   * single add, `'imported'` for bulk import. `timeOfDay` (morning/evening
   * pivot, migration 0003) defaults to null — a user stem not tagged to
   * either period never surfaces in a practice via `getActiveStemsForTimeOfDay`,
   * same as a pre-pivot row (DECISIONS.md 2026-09-14: no backfill).
   */
  addStem(input: {
    text: string;
    category: string | null;
    origin: 'user' | 'imported';
    timeOfDay?: TimeOfDay | null;
  }): string {
    const id = newId();
    const { at, tz, offsetMin } = nowEventTime();
    this.db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min, time_of_day)
       VALUES (?, ?, ?, ?, 'en', 1.0, 1, ?, ?, ?, ?)`,
      [id, input.text, input.origin, input.category, at, tz, offsetMin, input.timeOfDay ?? null],
    );
    return id;
  }

  /**
   * Bulk import (§6.6): one `addStem` per line, all `origin='imported'`.
   * The caller is responsible for showing a preview + count before calling
   * this — it commits unconditionally.
   */
  bulkImportStems(lines: readonly string[], category: string | null, timeOfDay: TimeOfDay | null = null): number {
    let count = 0;
    this.db.withTransactionSync(() => {
      for (const text of lines) {
        this.addStem({ text, category, origin: 'imported', timeOfDay });
        count++;
      }
    });
    return count;
  }

  /**
   * Edits a stem's text/category/time-of-day in place. Sessions keep their
   * `stem_text_snapshot` (§4.4) — this never touches `sessions`, so past
   * sessions stay attributed to the wording shown at the time.
   */
  updateStem(id: string, input: { text: string; category: string | null; timeOfDay?: TimeOfDay | null }): void {
    this.db.runSync('UPDATE stems SET text = ?, category = ?, time_of_day = ? WHERE id = ?', [
      input.text,
      input.category,
      input.timeOfDay ?? null,
      id,
    ]);
  }

  /** Archive/unarchive (§6.6's primary destructive action — reversible, unlike delete). */
  setStemActive(id: string, active: boolean): void {
    this.db.runSync('UPDATE stems SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
  }

  /** Soft-delete: past sessions keep their snapshot and remain in history/export. */
  softDeleteStem(id: string, at: string): void {
    this.db.runSync('UPDATE stems SET deleted_at = ? WHERE id = ?', [at, id]);
  }

  /** Three-way weight control (§6.6) — callers pass one of WEIGHT_BY_SETTING's values, never a raw float. */
  setStemWeight(id: string, weight: number): void {
    this.db.runSync('UPDATE stems SET weight = ? WHERE id = ?', [weight, id]);
  }

  /**
   * Inserts the `sessions` row at Start (spec §6.3.1 — nothing is timed
   * before this). `started_at` is provided by the caller so the pure
   * session machine and the persisted row share exactly one clock reading.
   */
  createSession(input: {
    stemId: string;
    stemTextSnapshot: string;
    origin: SessionOrigin;
    targetEndings: number;
    timerSeconds: number;
    uncensoredMode: boolean;
    startedAt: string;
    deviceLocale: string;
    /** Set when `origin === 'notification'`: the row this session was opened from (§6.4). */
    notificationId?: string;
    notifiedAt?: string;
  }): string {
    const id = newId();
    const { tz, offsetMin } = nowEventTime(new Date(input.startedAt));
    this.db.runSync(
      `INSERT INTO sessions
         (id, stem_id, stem_text_snapshot, origin, target_endings, timer_seconds, uncensored_mode,
          started_at, last_activity_at, tz, offset_min, device_locale, notification_id, notified_at, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.stemId,
        input.stemTextSnapshot,
        input.origin,
        input.targetEndings,
        input.timerSeconds,
        input.uncensoredMode ? 1 : 0,
        input.startedAt,
        input.startedAt,
        tz,
        offsetMin,
        input.deviceLocale,
        input.notificationId ?? null,
        input.notifiedAt ?? null,
        input.notificationId ? input.startedAt : null,
      ],
    );
    return id;
  }

  /**
   * First keystroke into a field (ADR-0003): creates its `endings` row and,
   * if this is the session's first keypress at all, stamps
   * `sessions.first_keypress_at`. A no-op if the row already exists.
   */
  recordFirstKeypress(sessionId: string, ordinal: number, at: string): void {
    const existing = this.db.getFirstSync<{ id: string }>(
      'SELECT id FROM endings WHERE session_id = ? AND ordinal = ?',
      [sessionId, ordinal],
    );
    if (existing) return;

    this.db.withTransactionSync(() => {
      this.db.runSync(
        `INSERT INTO endings (id, session_id, ordinal, text, started_at, submitted_at, backspace_count)
         VALUES (?, ?, ?, '', ?, NULL, 0)`,
        [newId(), sessionId, ordinal, at],
      );
      this.db.runSync(
        `UPDATE sessions SET last_activity_at = ?,
           first_keypress_at = COALESCE(first_keypress_at, ?)
         WHERE id = ?`,
        [at, at, sessionId],
      );
    });
  }

  /** Debounced autosave of the active field's text (ADR-0003) and its backspace count. */
  autosaveEndingText(sessionId: string, ordinal: number, text: string, backspaceDelta: number, at: string): void {
    this.db.withTransactionSync(() => {
      this.db.runSync(
        'UPDATE endings SET text = ?, backspace_count = backspace_count + ? WHERE session_id = ? AND ordinal = ?',
        [text, backspaceDelta, sessionId, ordinal],
      );
      this.db.runSync('UPDATE sessions SET last_activity_at = ? WHERE id = ?', [at, sessionId]);
    });
  }

  /** Submits a field (return key / Next), stamping `submitted_at` (§6.3.4). */
  submitEnding(sessionId: string, ordinal: number, at: string): void {
    this.db.withTransactionSync(() => {
      this.db.runSync('UPDATE endings SET submitted_at = ? WHERE session_id = ? AND ordinal = ?', [
        at,
        sessionId,
        ordinal,
      ]);
      this.db.runSync('UPDATE sessions SET last_activity_at = ? WHERE id = ?', [at, sessionId]);
    });
  }

  /**
   * Ends the session. Any open ending (submitted_at IS NULL) is closed with
   * `submitted_at = at` without touching its text — nothing is discarded,
   * ever (§6.3.8), including a half-typed final ending.
   */
  finalizeSession(sessionId: string, reason: EndReason, at: string): void {
    this.db.withTransactionSync(() => {
      this.db.runSync('UPDATE endings SET submitted_at = ? WHERE session_id = ? AND submitted_at IS NULL', [
        at,
        sessionId,
      ]);
      this.db.runSync('UPDATE sessions SET ended_at = ?, end_reason = ?, last_activity_at = ? WHERE id = ?', [
        at,
        reason,
        at,
        sessionId,
      ]);
    });
  }

  /**
   * The one session still open (`ended_at IS NULL`), if any — there is
   * never more than one, since starting a session requires finishing or
   * finalizing the last. Used on app launch/foreground to apply ADR-0001.
   */
  getOpenSession(): { session: SessionRow; endings: EndingRow[] } | null {
    const session = this.db.getFirstSync<SessionRow>('SELECT * FROM sessions WHERE ended_at IS NULL LIMIT 1', []);
    if (!session) return null;

    const endings = this.db.getAllSync<EndingRow>('SELECT * FROM endings WHERE session_id = ? ORDER BY ordinal', [
      session.id,
    ]);
    return { session, endings };
  }

  /**
   * Reverse-chronological session list for history (§6.7), filtered by stem,
   * category, and/or a date range on `started_at`. Soft-deleted sessions are
   * never returned — deletion hides from the UI, it does not remove the row
   * (§4.1.5); export and the DB itself still see them.
   *
   * t10 (owner decision 2026-09-22): zero-ending sessions never count as
   * complete, so they are excluded here too — this one query feeds the home
   * "N sessions this week" counter and its `Review available` gate (the C10
   * silent-counted-save and C11 counted-abandoned defects), and the history
   * listing carries the same rule so every consumer inherits it. The rows
   * themselves are untouched: still saved, still in `dumpAllTables`/export,
   * still visible in a session's own detail. Open sessions with content keep
   * counting (unchanged behavior — this ticket rules on endings, not on
   * `ended_at`).
   */
  listSessionsForHistory(filters: HistoryFilters = {}): HistorySessionRow[] {
    const clauses = ['s.deleted_at IS NULL', HAS_NON_EMPTY_ENDING];
    const params: SqlBindValue[] = [];

    if (filters.stemId) {
      clauses.push('s.stem_id = ?');
      params.push(filters.stemId);
    }
    if (filters.category) {
      clauses.push('st.category = ?');
      params.push(filters.category);
    }
    if (filters.dateFrom) {
      clauses.push('s.started_at >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      clauses.push('s.started_at <= ?');
      params.push(filters.dateTo);
    }

    return this.db.getAllSync<HistorySessionRow>(
      `SELECT s.id, s.stem_id, s.stem_text_snapshot, st.category, s.origin, s.started_at, s.ended_at, s.end_reason
       FROM sessions s
       JOIN stems st ON st.id = s.stem_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY s.started_at DESC`,
      params,
    );
  }

  /** One session (for the detail screen) and all its endings, chronological. Null if soft-deleted or missing. */
  getSessionDetail(sessionId: string): { session: SessionRow; endings: EndingRow[] } | null {
    const session = this.db.getFirstSync<SessionRow>('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL', [
      sessionId,
    ]);
    if (!session) return null;

    const endings = this.db.getAllSync<EndingRow>(
      'SELECT * FROM endings WHERE session_id = ? AND deleted_at IS NULL ORDER BY ordinal',
      [sessionId],
    );
    return { session, endings };
  }

  /** Every distinct, non-null stem category that has at least one non-deleted session — for the history category filter. */
  listHistoryCategories(): string[] {
    return this.db
      .getAllSync<{ category: string }>(
        `SELECT DISTINCT st.category as category
         FROM sessions s JOIN stems st ON st.id = s.stem_id
         WHERE s.deleted_at IS NULL AND st.category IS NOT NULL
         ORDER BY st.category`,
        [],
      )
      .map((r) => r.category);
  }

  /** Every distinct stem that has at least one non-deleted session — for the history stem filter. Uses the current stem text, not any one session's snapshot. */
  listHistoryStems(): { id: string; text: string }[] {
    return this.db.getAllSync<{ id: string; text: string }>(
      `SELECT DISTINCT st.id as id, st.text as text
       FROM sessions s JOIN stems st ON st.id = s.stem_id
       WHERE s.deleted_at IS NULL
       ORDER BY st.text`,
      [],
    );
  }

  /** Soft-deletes a session (§6.7: "option to soft-delete the session"). The row and its endings stay in the DB and in export. */
  softDeleteSession(id: string, at: string): void {
    this.db.runSync('UPDATE sessions SET deleted_at = ? WHERE id = ?', [at, id]);
  }

  /**
   * Full-text search across everything the user has written (§6.7, ticket
   * 12), via the `endings_fts` FTS5 index (migration 0002). Soft-deleted
   * endings and endings belonging to a soft-deleted session are excluded at
   * query time, the same place every other read excludes them — the FTS
   * index itself mirrors `endings.text` unconditionally (see the migration's
   * own comment for why).
   */
  searchEndings(query: string): EndingSearchResult[] {
    const match = toFtsMatchQuery(query);
    if (!match) return [];

    return this.db.getAllSync<EndingSearchResult>(
      `SELECT e.id as endingId, e.session_id as sessionId, e.ordinal, e.text, e.started_at as startedAt,
              s.stem_text_snapshot as stemTextSnapshot, s.started_at as sessionStartedAt
       FROM endings_fts f
       JOIN endings e ON e.rowid = f.rowid
       JOIN sessions s ON s.id = e.session_id
       WHERE endings_fts MATCH ? AND e.deleted_at IS NULL AND s.deleted_at IS NULL
       ORDER BY e.started_at DESC`,
      [match],
    );
  }

  /**
   * Rebuilds `endings_fts` from `endings` from scratch. The triggers
   * (migration 0002) keep the index in sync on every write this app makes;
   * this is the escape hatch for anything that writes to `endings` outside
   * them — import/restore (ticket 15) is the intended caller.
   */
  rebuildEndingsFts(): void {
    this.db.runSync("INSERT INTO endings_fts(endings_fts) VALUES ('rebuild')", []);
  }

  /**
   * Every session with at least one ending in `[periodStart, periodEnd)`
   * (§6.5 step 1: "every ending written in the selected period, grouped by
   * session, chronological"), each with its endings in ordinal order.
   * Sessions themselves are ordered chronologically by `started_at`; within
   * a session, endings are already chronological by construction (ordinal).
   * Soft-deleted sessions/endings are excluded, same convention as history.
   */
  listSessionsForReview(periodStart: string, periodEnd: string): { session: SessionRow; endings: EndingRow[] }[] {
    const sessionIds = this.db
      .getAllSync<{ id: string }>(
        `SELECT DISTINCT s.id as id
         FROM sessions s JOIN endings e ON e.session_id = s.id
         WHERE s.deleted_at IS NULL AND e.deleted_at IS NULL
           AND e.started_at >= ? AND e.started_at < ?
         ORDER BY s.started_at`,
        [periodStart, periodEnd],
      )
      .map((r) => r.id);

    return sessionIds.map((id) => this.getSessionDetail(id)).filter((d): d is { session: SessionRow; endings: EndingRow[] } => d !== null);
  }

  /**
   * Stores the result of a review (§6.5 step 3): the exact sessions
   * re-read, the period, which meta-stem was used, and the meta-stem
   * session's own endings joined into one `reflection_text` — the meta-stem
   * response is a normal session under the hood (its own `sessions`/
   * `endings` rows, `origin='review'`), and this denormalises that result
   * onto the review row itself, mirroring `stem_text_snapshot`'s reasoning
   * (spec §4.4): a review's own record of what was written shouldn't shift
   * if something upstream ever changed.
   */
  createReview(input: {
    periodStart: string;
    periodEnd: string;
    sessionIds: readonly string[];
    metaStemText: string;
    reflectionText: string | null;
    createdAt: string;
  }): string {
    const id = newId();
    const { tz, offsetMin } = nowEventTime(new Date(input.createdAt));
    this.db.runSync(
      `INSERT INTO reviews (id, period_start, period_end, session_ids, reflection_text, meta_stem_text, created_at, tz, offset_min)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.periodStart,
        input.periodEnd,
        JSON.stringify(input.sessionIds),
        input.reflectionText,
        input.metaStemText,
        input.createdAt,
        tz,
        offsetMin,
      ],
    );
    return id;
  }

  /** `created_at` of the most recent non-deleted review, or null if none yet — for the "offered once a week" check (§6.5). */
  getLastReviewAt(): string | null {
    const row = this.db.getFirstSync<{ created_at: string }>(
      'SELECT created_at FROM reviews WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [],
    );
    return row?.created_at ?? null;
  }

  /** Rows still `pending` — the OS scheduler's own notion of "not yet fired or cancelled" (§6.4). */
  listPendingNotifications(): NotificationScheduleRow[] {
    return this.db.getAllSync<NotificationScheduleRow>(
      "SELECT * FROM notification_schedule WHERE state = 'pending' ORDER BY scheduled_for",
      [],
    );
  }

  /**
   * Records a notification the scheduler just asked `expo-notifications` to
   * fire (§6.4: "Record every scheduled notification in
   * notification_schedule"). `stemId` is chosen at schedule time via the
   * weighted draw (06) — deep-linking on tap reads it back rather than
   * re-drawing, so what fires is what the user opens.
   */
  insertScheduledNotification(input: { scheduledFor: string; stemId: string | null; osIdentifier: string }): string {
    const id = newId();
    const { at } = nowEventTime();
    this.db.runSync(
      `INSERT INTO notification_schedule (id, scheduled_for, stem_id, os_identifier, state, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, input.scheduledFor, input.stemId, input.osIdentifier, at],
    );
    return id;
  }

  /** Marks rows cancelled — superseded by a fresh reschedule, or past the horizon. Append-only: a state flag, not a delete. */
  cancelPendingNotifications(ids: readonly string[]): void {
    if (ids.length === 0) return;
    this.db.withTransactionSync(() => {
      for (const id of ids) {
        this.db.runSync("UPDATE notification_schedule SET state = 'cancelled' WHERE id = ?", [id]);
      }
    });
  }

  /**
   * Best-effort reconciliation (§6.4 "reconcile state on foreground"): any
   * row still marked `pending` whose `scheduled_for` has already passed is
   * relabelled `fired`. Local notifications don't call back on delivery, so
   * this is inferred from the clock, not observed — good enough for a
   * record that's descriptive, never load-bearing for app behaviour.
   */
  markPastPendingAsFired(now: string): void {
    this.db.runSync("UPDATE notification_schedule SET state = 'fired' WHERE state = 'pending' AND scheduled_for <= ?", [
      now,
    ]);
  }

  /**
   * Every completed, non-deleted session with its category, uncensored/
   * target/tz fields, and its non-deleted endings — the one shape both
   * `badges.ts` and `progressStats.ts` derive from (gamification proposal
   * §4/§5 cycle 1). "Completed" means `ended_at IS NOT NULL` AND at least one
   * non-empty ending (t10 owner decision 2026-09-22 — a zero-content session
   * earns no badge, no streak day, no progress total): an open session in
   * progress never counts toward a badge or a streak either. Endings are
   * unfiltered by `submitted_at` — `finalizeSession` always closes any open
   * ending before setting `ended_at` (nothing discarded, §6.3.8), so every
   * endings row on a completed session is already final.
   */
  listSessionsForStats(): BadgeSession[] {
    const sessions = this.db.getAllSync<{
      id: string;
      stem_id: string;
      category: string | null;
      origin: SessionOrigin;
      target_endings: number;
      uncensored_mode: number;
      started_at: string;
      ended_at: string;
      end_reason: EndReason;
      tz: string;
      offset_min: number;
    }>(
      `SELECT s.id, s.stem_id, st.category, s.origin, s.target_endings, s.uncensored_mode,
              s.started_at, s.ended_at, s.end_reason, s.tz, s.offset_min
       FROM sessions s
       JOIN stems st ON st.id = s.stem_id
       WHERE s.deleted_at IS NULL AND s.ended_at IS NOT NULL
         AND ${HAS_NON_EMPTY_ENDING}
       ORDER BY s.started_at`,
      [],
    );

    return sessions.map((s) => ({
      id: s.id,
      stemId: s.stem_id,
      category: s.category,
      origin: s.origin,
      targetEndings: s.target_endings,
      uncensoredMode: s.uncensored_mode === 1,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      endReason: s.end_reason,
      tz: s.tz,
      offsetMin: s.offset_min,
      endings: this.db
        .getAllSync<{ text: string }>(
          'SELECT text FROM endings WHERE session_id = ? AND deleted_at IS NULL ORDER BY ordinal',
          [s.id],
        )
        .map((e) => ({ text: e.text })),
    }));
  }

  /** One notification row by its `expo-notifications` identifier — used to resolve a tapped notification's stem. */
  getNotificationByOsIdentifier(osIdentifier: string): NotificationScheduleRow | null {
    return this.db.getFirstSync<NotificationScheduleRow>('SELECT * FROM notification_schedule WHERE os_identifier = ?', [
      osIdentifier,
    ]);
  }
}

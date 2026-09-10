import { newId } from './id';
import { SqlBindValue, SqlExecutor } from './executor';
import { META_STEMS, SEED_STEMS } from './seed/stems';
import { DEFAULT_SETTINGS, Settings } from './seed/settings';
import { nowEventTime } from './time';
import { EndReason, SessionOrigin } from '@/session/sessionMachine';

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
}

export interface LibraryStemRow extends StemRow {
  active: number; // 0/1
  deleted_at: string | null;
  created_at: string;
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
   * Inserts the seed stems and default settings on first launch. Idempotent:
   * a no-op if stems already exist, so it's safe to call on every app start.
   */
  seedIfEmpty(): void {
    if (this.hasStems()) return;

    this.db.withTransactionSync(() => {
      for (const stem of SEED_STEMS) {
        const { at, tz, offsetMin } = nowEventTime();
        this.db.runSync(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min)
           VALUES (?, ?, 'seed', ?, 'en', 1.0, 1, ?, ?, ?)`,
          [newId(), stem.text, stem.category, at, tz, offsetMin],
        );
      }

      // Meta-stems (§5.4) are a distinct concept from stems (CONTEXT.md:
      // "used only in review... avoid: review prompt"), not a category of
      // them — seeded with `active = 0` so they can never surface via
      // weighted selection (§6.2) or `listActiveStems`, and `origin =
      // 'meta'` so `listAllStems` (the stem library) can exclude them by
      // construction. They still need a real `stems` row because
      // `sessions.stem_id` is a foreign key (spec §4.2) and review's
      // meta-stem completion is "a normal timed session" (§6.5.2) with a
      // real `sessions` row like any other.
      for (const text of META_STEMS) {
        const { at, tz, offsetMin } = nowEventTime();
        this.db.runSync(
          `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min)
           VALUES (?, ?, 'meta', NULL, 'en', 1.0, 0, ?, ?, ?)`,
          [newId(), text, at, tz, offsetMin],
        );
      }

      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        const { at } = nowEventTime();
        this.db.runSync('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
          key,
          JSON.stringify(value),
          at,
        ]);
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

  /** All settings, decoded, falling back to spec defaults for any key not yet seeded. */
  getSettings(): Settings {
    const rows = this.db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM settings', []);
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

  /** Active, non-deleted stems, for session start and the stem library. */
  listActiveStems(): StemRow[] {
    return this.db.getAllSync<StemRow>(
      "SELECT id, text, origin, category, weight FROM stems WHERE active = 1 AND deleted_at IS NULL ORDER BY created_at",
      [],
    );
  }

  /**
   * Every stem, including archived and soft-deleted ones, for the stem
   * library (§6.6) — the library filters/searches client-side over this,
   * unlike `listActiveStems`'s narrow session-start use. Excludes
   * `origin = 'meta'`: meta-stems (§5.4) are a distinct concept, used only
   * in review, and never editable/browsable/writable-on-demand like a
   * regular stem.
   */
  listAllStems(): LibraryStemRow[] {
    return this.db.getAllSync<LibraryStemRow>(
      "SELECT id, text, origin, category, weight, active, deleted_at, created_at FROM stems WHERE origin != 'meta' ORDER BY created_at DESC",
      [],
    );
  }

  /** The 3 seeded meta-stems (§5.4), each with the real `stems.id` a review session's `stem_id` FK needs. */
  listMetaStems(): StemRow[] {
    return this.db.getAllSync<StemRow>(
      "SELECT id, text, origin, category, weight FROM stems WHERE origin = 'meta' ORDER BY created_at",
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
   * single add, `'imported'` for bulk import.
   */
  addStem(input: { text: string; category: string | null; origin: 'user' | 'imported' }): string {
    const id = newId();
    const { at, tz, offsetMin } = nowEventTime();
    this.db.runSync(
      `INSERT INTO stems (id, text, origin, category, language, weight, active, created_at, created_tz, created_offset_min)
       VALUES (?, ?, ?, ?, 'en', 1.0, 1, ?, ?, ?)`,
      [id, input.text, input.origin, input.category, at, tz, offsetMin],
    );
    return id;
  }

  /**
   * Bulk import (§6.6): one `addStem` per line, all `origin='imported'`.
   * The caller is responsible for showing a preview + count before calling
   * this — it commits unconditionally.
   */
  bulkImportStems(lines: readonly string[], category: string | null): number {
    let count = 0;
    this.db.withTransactionSync(() => {
      for (const text of lines) {
        this.addStem({ text, category, origin: 'imported' });
        count++;
      }
    });
    return count;
  }

  /**
   * Edits a stem's text/category in place. Sessions keep their
   * `stem_text_snapshot` (§4.4) — this never touches `sessions`, so past
   * sessions stay attributed to the wording shown at the time.
   */
  updateStem(id: string, input: { text: string; category: string | null }): void {
    this.db.runSync('UPDATE stems SET text = ?, category = ? WHERE id = ?', [input.text, input.category, id]);
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
   */
  listSessionsForHistory(filters: HistoryFilters = {}): HistorySessionRow[] {
    const clauses = ['s.deleted_at IS NULL'];
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

  /** One notification row by its `expo-notifications` identifier — used to resolve a tapped notification's stem. */
  getNotificationByOsIdentifier(osIdentifier: string): NotificationScheduleRow | null {
    return this.db.getFirstSync<NotificationScheduleRow>('SELECT * FROM notification_schedule WHERE os_identifier = ?', [
      osIdentifier,
    ]);
  }
}

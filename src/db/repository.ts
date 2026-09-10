import { newId } from './id';
import { SqlExecutor } from './executor';
import { SEED_STEMS } from './seed/stems';
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
  origin: 'seed' | 'user' | 'imported';
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
   * unlike `listActiveStems`'s narrow session-start use.
   */
  listAllStems(): LibraryStemRow[] {
    return this.db.getAllSync<LibraryStemRow>(
      'SELECT id, text, origin, category, weight, active, deleted_at, created_at FROM stems ORDER BY created_at DESC',
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
      .getAllSync<{ text: string }>('SELECT text FROM stems WHERE deleted_at IS NULL', [])
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
  }): string {
    const id = newId();
    const { tz, offsetMin } = nowEventTime(new Date(input.startedAt));
    this.db.runSync(
      `INSERT INTO sessions
         (id, stem_id, stem_text_snapshot, origin, target_endings, timer_seconds, uncensored_mode,
          started_at, last_activity_at, tz, offset_min, device_locale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
}

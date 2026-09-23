/**
 * Adversarial export round trip (issue 20, night N3): spec §8's lossless
 * guarantee under stress. Each corpus class below is one test following the
 * §8 round-trip shape — export, wipe, import, export again, byte-identical
 * JSON modulo `exported_at` — with corpora chosen to stress byte fidelity:
 * unicode extremes, 10k-char endings, a 200-stem library, every
 * end-reason, soft-deleted rows, timezone edges (§4.1.3's three-way time),
 * NULL-able columns, control characters, and the CSV projection.
 *
 * Two deliberate sharpenings over `roundTrip.test.ts`:
 * - the first export is re-imported from its SERIALIZED bytes
 *   (`serializeJsonBundle` → `parseJsonBundle`), not from the in-memory
 *   bundle — the file is the medium a user restores from, so the JSON
 *   escaping itself is under test;
 * - beside §8's byte-identity, the database's five exported tables must be
 *   value-identical before and after (dump-level equality closes the gap a
 *   pair of equal JSON strings could theoretically hide).
 *
 * Fixture rows that no Repository code path can produce (exotic tz/offset
 * triples, every-nullable-at-NULL states, a soft-deleted ending) are
 * inserted directly, over the same `COLUMNS` constant the schema-parity
 * test pins to the DDL — so a future column addition updates the fixtures
 * compiler-side instead of silently drifting.
 *
 * Charter constraint (issue 20): this suite is test infrastructure only —
 * `src/export/*` and `src/db/*` are untouched; an adversarial case that
 * fails is a FINDING (issue 20 Comments), never a night patch.
 *
 * Scoped out deliberately (probe evidence in issue 20 Comments): embedded
 * NUL bytes and lone surrogates. Neither survives the *node:sqlite
 * binding/read layer* (NUL truncates the read at the binding, lone
 * surrogates never reach the DB as themselves), so the database cannot
 * hold them and §8 — losslessness with respect to the database — has
 * nothing to carry. Everything that IS representable in the database is
 * below.
 */
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../../db/migrate';
import { Repository } from '../../db/repository';
import { nodeSqliteExecutor } from '../../db/testSupport/nodeSqliteExecutor';
import { CURRENT_SCHEMA_VERSION } from '../../db/migrations';
import { SqlBindValue, SqlExecutor } from '../../db/executor';
import { COLUMNS as IMPORT_COLUMNS, applyImport } from '../importBundle';
import { buildJsonBundle, ExportBundle, parseJsonBundle, serializeJsonBundle } from '../jsonBundle';
import { buildCsvFiles, COLUMNS as CSV_COLUMNS } from '../csvBundle';

function freshRepository(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  const repo = new Repository(executor);
  repo.seedIfEmpty();
  return { db: raw, repo };
}

function exportNow(repo: Repository, exportedAt: string): ExportBundle {
  return buildJsonBundle(repo.dumpAllTables(), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: '1.0.0',
    exportedAt,
    exportedTz: 'Europe/Berlin',
  });
}

/** The five exported tables (§8's bundle), freshly read from the live database. */
function corpusDump(repo: Repository) {
  const dump = repo.dumpAllTables();
  return {
    stems: dump.stems,
    sessions: dump.sessions,
    endings: dump.endings,
    reviews: dump.reviews,
    settings: dump.settings,
  };
}

const FIRST_EXPORTED_AT = '2026-09-10T14:03:22.418Z';
const SECOND_EXPORTED_AT = '2026-09-11T00:00:00.000Z';

/**
 * Normalises the one field §8 exempts. Only the top-level `exported_at`
 * carries unescaped quotes around its value: every quote inside a row's
 * text is serialised as `\"`, so the pattern cannot false-match row data.
 */
function stripExportedAt(json: string): string {
  return json.replace(/"exported_at": "[^"]*"/, '"exported_at": "<NORMALIZED>"');
}

/**
 * The full §8 round trip through the file bytes: export → serialize →
 * wipe (replace-mode import of an empty bundle) → parse the serialized
 * file → import (replace) → export again. Asserts byte-identity modulo
 * `exported_at`, AND that the five exported tables are value-identical
 * before and after. Returns the bundles for class-specific assertions.
 */
function expectLosslessRoundTrip(repo: Repository, executor: SqlExecutor) {
  const dumpBefore = corpusDump(repo);
  const firstBundle = exportNow(repo, FIRST_EXPORTED_AT);
  const firstJson = serializeJsonBundle(firstBundle);

  applyImport(
    executor,
    {
      export_version: 1,
      schema_version: CURRENT_SCHEMA_VERSION,
      app_version: '1.0.0',
      exported_at: 'wipe',
      exported_tz: 'UTC',
      stems: [],
      sessions: [],
      endings: [],
      reviews: [],
      settings: [],
    },
    'replace',
  );
  expect(repo.listAllStems()).toHaveLength(0); // the wipe was real

  applyImport(executor, parseJsonBundle(firstJson), 'replace');
  repo.rebuildEndingsFts();

  const secondBundle = exportNow(repo, SECOND_EXPORTED_AT);
  const secondJson = serializeJsonBundle(secondBundle);

  expect(stripExportedAt(secondJson)).toBe(stripExportedAt(firstJson)); // §8's assertion, on the file bytes
  expect(corpusDump(repo)).toEqual(dumpBefore); // the database itself restored exactly

  expect(secondBundle.stems).toEqual(firstBundle.stems);
  expect(secondBundle.sessions).toEqual(firstBundle.sessions);
  expect(secondBundle.endings).toEqual(firstBundle.endings);
  expect(secondBundle.reviews).toEqual(firstBundle.reviews);
  expect(secondBundle.settings).toEqual(firstBundle.settings);

  return { firstBundle, secondBundle };
}

// ── fixture builders ────────────────────────────────────────────────────

type ImportTable = keyof typeof IMPORT_COLUMNS;

/** Direct INSERT over the parity-tested column list, for states no Repository path produces (see file header). */
function insertDirect(executor: SqlExecutor, table: ImportTable, row: Record<string, unknown>): void {
  const columns = IMPORT_COLUMNS[table];
  const values: SqlBindValue[] = columns.map((c) => {
    const value = row[c];
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    throw new Error(`Fixture column "${c}" has an unsupported fixture type: ${typeof value}`);
  });
  executor.runSync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);
}

function makeStemRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'stem-fixture',
    text: 'A fixture stem…',
    origin: 'user',
    category: null,
    language: 'en',
    weight: 1.0,
    active: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    created_tz: 'UTC',
    created_offset_min: 0,
    deleted_at: null,
    time_of_day: null,
    week_number: null,
    is_weekly_meta: 0,
    activation_provenance: 'user', // migration 0008: NOT NULL DEFAULT 'user' — insertDirect maps undefined to NULL, which the column rejects
    ...overrides,
  };
}

function makeSessionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'session-fixture',
    stem_id: 'stem-fixture',
    stem_text_snapshot: 'The stem shown at the time',
    origin: 'manual',
    target_endings: 3,
    timer_seconds: 90,
    uncensored_mode: 0,
    started_at: '2026-09-05T08:00:00.000Z',
    first_keypress_at: null,
    ended_at: null,
    end_reason: null,
    notification_id: null,
    notified_at: null,
    opened_at: null,
    last_activity_at: null,
    tz: 'UTC',
    offset_min: 0,
    device_locale: 'en-US',
    deleted_at: null,
    programme_on: 1, // migration 0008: NOT NULL DEFAULT 1 — insertDirect maps undefined to NULL, which the column rejects
    ...overrides,
  };
}

function makeEndingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ending-fixture',
    session_id: 'session-fixture',
    ordinal: 1,
    text: 'A fixture ending.',
    started_at: '2026-09-05T08:00:05.000Z',
    submitted_at: '2026-09-05T08:00:15.000Z',
    backspace_count: 0,
    was_revised: 0,
    deleted_at: null,
    ...overrides,
  };
}

function makeReviewRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'review-fixture',
    period_start: '2026-09-01T00:00:00.000Z',
    period_end: '2026-09-08T00:00:00.000Z',
    session_ids: '["session-fixture"]', // §4.2: a JSON array of session ids, stored as text
    reflection_text: 'A reflection.',
    meta_stem_text: 'What pattern do you notice…',
    created_at: '2026-09-08T09:00:00.000Z',
    tz: 'UTC',
    offset_min: 0,
    deleted_at: null,
    ...overrides,
  };
}

function rowById(rows: Record<string, unknown>[], id: string): Record<string, unknown> {
  const row = rows.find((r) => r.id === id);
  expect(row).toBeDefined();
  return row!;
}

describe('adversarial export round trip — §8 lossless under stress (issue 20)', () => {
  it('class 1 — unicode extremes: RTL, combining marks, ZWJ emoji, CJK, astral plane; NFC and NFD stay distinct', () => {
    const { db, repo } = freshRepository();

    // NFC and NFD encodings of the same word must remain two different
    // byte strings across the round trip (§8: never normalise).
    const nfc: string = 'café'; // U+00E9, precomposed
    const nfd: string = 'cafe\u0301'; // e + U+0301 combining acute
    expect(nfc === nfd).toBe(false);
    expect(nfc.normalize('NFC')).toBe(nfd.normalize('NFC')); // same abstract word, different bytes

    const combiningStack = 'z\u0337\u0321a\u0323\u032Dl\u0336\u031Dg\u0348\u030Bo\u033B\u0327'; // stacked combining marks (zalgo-style)
    const rtlBidi = '\u202Bفي البدء كان النص\u202C; עברית; 3 × 4 = 12; \u200Fmarker';
    const zwjSequences = '👨\u200D👩\u200D👧\u200D👦 🧑\u{1F3FD}\u200D🚀 \u{1F1FF}\u{1F1E6} 👩\u200D❤️\u200D💋\u200D👨';
    const cjk = '日本語のテキスト、中文测试与「直角引号」、한국어 텍스트。Ｆｕｌｌｗｉｄｔｈ１２３\u3000 Ideographic space above.';
    const astral = '𝔸𝕞𝕡𝕖𝕣𝕤𝕒𝕟𝕕 𐐔𐐩𐑌𐐮𐑅 𐍈 (non-BMP, outside the emoji planes)';

    const stemNfc = repo.addStem({ text: nfc, category: null, origin: 'user' });
    const stemNfd = repo.addStem({ text: nfd, category: null, origin: 'user' });
    const stemZalgo = repo.addStem({ text: combiningStack, category: null, origin: 'user' });

    const sessionId = repo.createSession({
      stemId: stemZalgo,
      stemTextSnapshot: `${combiningStack} / ${rtlBidi}`,
      origin: 'manual',
      targetEndings: 5,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-05T08:00:00.000Z',
      deviceLocale: 'ar-EG',
    });

    const corpusEndings = [rtlBidi, zwjSequences, cjk, astral, `${nfd} ≠ ${nfc}`];
    corpusEndings.forEach((text, index) => {
      const ordinal = index + 1;
      repo.recordFirstKeypress(sessionId, ordinal, '2026-09-05T08:00:10.000Z');
      repo.autosaveEndingText(sessionId, ordinal, text, index, '2026-09-05T08:00:20.000Z');
      repo.submitEnding(sessionId, ordinal, '2026-09-05T08:00:30.000Z');
    });
    repo.finalizeSession(sessionId, 'user_done', '2026-09-05T08:01:00.000Z');

    const { secondBundle } = expectLosslessRoundTrip(repo, nodeSqliteExecutor(db));

    // Every corpus family survives byte-for-byte; the two encodings of the
    // same word remain present and remain DIFFERENT.
    const texts = secondBundle.endings.map((e) => e.text as string).sort();
    expect(texts).toEqual([...corpusEndings].sort());
    expect(secondBundle.stems.find((s) => s.id === stemNfc)!.text).toBe(nfc);
    expect(secondBundle.stems.find((s) => s.id === stemNfd)!.text).toBe(nfd);
    expect((secondBundle.stems.find((s) => s.id === stemNfc)!.text as string) === (secondBundle.stems.find((s) => s.id === stemNfd)!.text as string)).toBe(false);
    expect(secondBundle.sessions[0].stem_text_snapshot).toBe(`${combiningStack} / ${rtlBidi}`);
  });

  it('class 2 — a single 10,000-character ending survives the round trip', () => {
    const { db, repo } = freshRepository();

    const unit = 'אַף עַל פִּי, “בֹּקֶר” — ño\u0301o 👨\u200D👩\u200D👧\u200D👦 三\u3000é\u0301\n';
    const repeats = Math.floor(10000 / unit.length);
    const padding = 10000 - repeats * unit.length;
    const huge = unit.repeat(repeats) + 'x'.repeat(padding);
    expect(huge.length).toBe(10000); // the corpus class itself: 10k chars in ONE ending

    const stemId = repo.addStem({ text: 'A stem for the long ending', category: null, origin: 'user' });
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'A stem for the long ending',
      origin: 'manual',
      targetEndings: 1,
      timerSeconds: 90,
      uncensoredMode: false,
      startedAt: '2026-09-05T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-05T08:00:05.000Z');
    repo.autosaveEndingText(sessionId, 1, huge, 0, '2026-09-05T08:00:10.000Z');
    repo.submitEnding(sessionId, 1, '2026-09-05T08:00:15.000Z');
    repo.finalizeSession(sessionId, 'user_done', '2026-09-05T08:01:00.000Z');

    const { secondBundle } = expectLosslessRoundTrip(repo, nodeSqliteExecutor(db));

    const restored = secondBundle.endings.find((e) => e.text === huge);
    expect(restored).toBeDefined();
    expect((restored!.text as string).length).toBe(10000);
    expect((restored!.text as string).slice(-40)).toBe(huge.slice(-40)); // not a truncated prefix
  });

  it('class 3 — a 200-stem library imports back row-for-row, order included', () => {
    const { db, repo } = freshRepository();

    const seedCount = repo.dumpAllTables().stems.length;
    const library = Array.from({ length: 200 }, (_, i) => {
      const sample = ['é — Unicode line', '日本語の行', 'مرحبا بالعالم', `plain line ${i}`][i % 4];
      return `Imported stem ${i + 1}/200: ${sample}`;
    });
    expect(repo.bulkImportStems(library, null, null)).toBe(200);

    // w1-t7 (s1-F7): the dead active-stem read is deleted — fixture reads
    // derive the same set from listAllStems.
    const stemId = repo.listAllStems().filter((s) => s.active !== 0 && s.deleted_at === null)[0].id;
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'Practicing over the imported library',
      origin: 'manual',
      targetEndings: 2,
      timerSeconds: 90,
      uncensoredMode: false,
      startedAt: '2026-09-05T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-05T08:00:05.000Z');
    repo.autosaveEndingText(sessionId, 1, 'first of the mass library', 1, '2026-09-05T08:00:10.000Z');
    repo.finalizeSession(sessionId, 'abandoned', '2026-09-05T08:00:30.000Z');

    const { secondBundle } = expectLosslessRoundTrip(repo, nodeSqliteExecutor(db));

    expect(secondBundle.stems).toHaveLength(seedCount + 200);
    const restoredTexts = secondBundle.stems.map((s) => s.text as string);
    for (const line of library) {
      expect(restoredTexts).toContain(line);
    }
    const importedRows = secondBundle.stems.filter((s) => s.origin === 'imported');
    expect(importedRows).toHaveLength(200);
    // The bulk import stamps every row with the same-millisecond clock
    // reading: row order after the round trip comes from the bundle, and
    // the first imported row must still be the first line written.
    expect(importedRows[0].text as string).toContain('Imported stem 1/200');
  });

  it('class 4 — every end-reason round-trips, including a timeout that struck mid-word', () => {
    const { db, repo } = freshRepository();

    const stemId = repo.addStem({ text: 'Before the word was finished…', category: null, origin: 'user' });

    // 'timeout': ending 2 is a half-typed word closed by the session end
    // (§6.3.8: nothing discarded — the text stays exactly as typed).
    const timeoutSession = repo.createSession({
      stemId,
      stemTextSnapshot: 'Before the word was finished…',
      origin: 'notification',
      targetEndings: 2,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-05T07:00:00.000Z',
      deviceLocale: 'en-US',
      notificationId: 'notif-1',
      notifiedAt: '2026-09-05T07:00:00.000Z',
    });
    repo.recordFirstKeypress(timeoutSession, 1, '2026-09-05T07:00:05.000Z');
    repo.autosaveEndingText(timeoutSession, 1, 'First ending, complete.', 2, '2026-09-05T07:00:20.000Z');
    repo.submitEnding(timeoutSession, 1, '2026-09-05T07:00:25.000Z');
    repo.recordFirstKeypress(timeoutSession, 2, '2026-09-05T07:00:30.000Z');
    repo.autosaveEndingText(timeoutSession, 2, 'and the timer struck mid-sent', 4, '2026-09-05T07:00:59.000Z');
    repo.finalizeSession(timeoutSession, 'timeout', '2026-09-05T07:01:00.000Z');

    // 'user_done': fully submitted.
    const userDoneSession = repo.createSession({
      stemId,
      stemTextSnapshot: 'Before the word was finished…',
      origin: 'manual',
      targetEndings: 1,
      timerSeconds: 90,
      uncensoredMode: false,
      startedAt: '2026-09-05T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(userDoneSession, 1, '2026-09-05T08:00:05.000Z');
    repo.autosaveEndingText(userDoneSession, 1, 'Done by choice.', 0, '2026-09-05T08:00:10.000Z');
    repo.submitEnding(userDoneSession, 1, '2026-09-05T08:00:10.000Z');
    repo.finalizeSession(userDoneSession, 'user_done', '2026-09-05T08:00:20.000Z');

    // 'abandoned': a half-written ending, closed without submit.
    const abandonedSession = repo.createSession({
      stemId,
      stemTextSnapshot: 'Before the word was finished…',
      origin: 'manual',
      targetEndings: 6,
      timerSeconds: 90,
      uncensoredMode: false,
      startedAt: '2026-09-05T09:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(abandonedSession, 1, '2026-09-05T09:00:05.000Z');
    repo.autosaveEndingText(abandonedSession, 1, 'walked away mid', 3, '2026-09-05T09:00:10.000Z');
    repo.finalizeSession(abandonedSession, 'abandoned', '2026-09-05T09:00:40.000Z');

    // The never-ended state: ended_at NULL, end_reason NULL — an open
    // session is still a row the export must carry.
    const openSession = repo.createSession({
      stemId,
      stemTextSnapshot: 'Before the word was finished…',
      origin: 'manual',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: false,
      startedAt: '2026-09-05T10:00:00.000Z',
      deviceLocale: 'en-US',
    });

    // A session the user never typed in at all.
    const neverTyped = repo.createSession({
      stemId,
      stemTextSnapshot: 'Before the word was finished…',
      origin: 'notification',
      targetEndings: 3,
      timerSeconds: 90,
      uncensoredMode: false,
      startedAt: '2026-09-05T11:00:00.000Z',
      deviceLocale: 'en-US',
    });

    const { secondBundle } = expectLosslessRoundTrip(repo, nodeSqliteExecutor(db));

    const reasonOf = (id: string) => secondBundle.sessions.find((s) => s.id === id)?.end_reason;
    expect(reasonOf(timeoutSession)).toBe('timeout');
    expect(reasonOf(userDoneSession)).toBe('user_done');
    expect(reasonOf(abandonedSession)).toBe('abandoned');
    expect(reasonOf(openSession)).toBeNull();
    expect(reasonOf(neverTyped)).toBeNull();

    const midWord = secondBundle.endings.find((e) => e.text === 'and the timer struck mid-sent');
    expect(midWord).toBeDefined();
    expect(midWord!.submitted_at).toBe('2026-09-05T07:01:00.000Z'); // closed by the timeout, text untouched
  });

  it('class 5 — soft-deleted rows of every table survive with deleted_at intact', () => {
    const { db, repo } = freshRepository();
    const executor = nodeSqliteExecutor(db);

    // A soft-deleted user stem.
    const stemId = repo.addStem({ text: 'Written, then retracted', category: null, origin: 'user' });
    repo.softDeleteStem(stemId, '2026-09-06T12:00:00.000Z');

    // A soft-deleted session — its endings intentionally remain
    // non-deleted (deleting a session never cascades; §4.1: "written and
    // retracted" is itself a signal the export must preserve).
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'Written, then retracted',
      origin: 'manual',
      targetEndings: 2,
      timerSeconds: 90,
      uncensoredMode: false,
      startedAt: '2026-09-05T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    repo.recordFirstKeypress(sessionId, 1, '2026-09-05T08:00:05.000Z');
    repo.autosaveEndingText(sessionId, 1, 'Still here after the session was deleted.', 0, '2026-09-05T08:00:10.000Z');
    repo.softDeleteSession(sessionId, '2026-09-06T12:30:00.000Z');

    // A soft-deleted ENDING (no app path sets this today — the §4.2 column
    // exists, so an analysis can meet it; direct insert, not repo state).
    // And a soft-deleted REVIEW.
    insertDirect(executor, 'stems', makeStemRow({ id: 'stem-direct-1', text: 'direct' }));
    insertDirect(executor, 'sessions', makeSessionRow({ id: 'session-direct-1', stem_id: 'stem-direct-1' }));
    insertDirect(
      executor,
      'endings',
      makeEndingRow({ id: 'ending-deleted', session_id: 'session-direct-1', text: 'An ending retracted on its own.', deleted_at: '2026-09-07T00:00:00.000Z' }),
    );
    const reviewId = repo.createReview({
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-09-08T00:00:00.000Z',
      sessionIds: [sessionId],
      metaStemText: 'What pattern do you notice…',
      reflectionText: null,
      createdAt: '2026-09-08T09:00:00.000Z',
    });
    executor.runSync('UPDATE reviews SET deleted_at = ? WHERE id = ?', ['2026-09-09T00:00:00.000Z', reviewId]);

    const { secondBundle } = expectLosslessRoundTrip(repo, executor);

    expect(secondBundle.stems.find((s) => s.id === stemId)!.deleted_at).toBe('2026-09-06T12:00:00.000Z');
    expect(secondBundle.sessions.find((s) => s.id === sessionId)!.deleted_at).toBe('2026-09-06T12:30:00.000Z');
    expect(secondBundle.endings.find((e) => e.id === 'ending-deleted')!.deleted_at).toBe('2026-09-07T00:00:00.000Z');
    expect(secondBundle.reviews.find((r) => r.id === reviewId)!.deleted_at).toBe('2026-09-09T00:00:00.000Z');
    // The session's own ending was NOT deleted with it — and survives too.
    expect(secondBundle.endings.find((e) => e.session_id === sessionId)!.deleted_at).toBeNull();
    // Plus the seed's soft-deleted-at-seed-time rows (retired v1 originals).
    expect(secondBundle.stems.filter((s) => s.deleted_at !== null).length).toBeGreaterThanOrEqual(27);
  });

  it('class 6 — timezone edges: UTC+14, UTC−12, spring-forward gap, fall-back overlap, epoch-adjacent instants', () => {
    const { db, repo } = freshRepository();
    const executor = nodeSqliteExecutor(db);

    // Written directly because the Repository stamps tz/offset from the
    // machine clock; these triples must survive AS STORED — the exporter
    // may not re-derive or normalise an offset (§4.1.3).
    insertDirect(executor, 'stems', makeStemRow({ id: 'stem-kiritimati', created_tz: 'Pacific/Kiritimati', created_offset_min: 840 }));
    insertDirect(
      executor,
      'sessions',
      makeSessionRow({ id: 'sess-kiritimati', stem_id: 'stem-kiritimati', tz: 'Pacific/Kiritimati', offset_min: 840 }), // UTC+14, Line Islands
    );
    insertDirect(
      executor,
      'sessions',
      makeSessionRow({ id: 'sess-gmt-minus-12', stem_id: 'stem-kiritimati', tz: 'Etc/GMT+12', offset_min: -720 }), // UTC−12 (POSIX sign inversion)
    );
    insertDirect(
      executor,
      'sessions',
      // 2026-03-29 01:30Z with the pre-jump offset: local 02:30 fell inside
      // Berlin's spring-forward gap and never existed — a triple a buggy
      // writer could store; export must carry it verbatim either way.
      makeSessionRow({ id: 'sess-dst-gap', stem_id: 'stem-kiritimati', started_at: '2026-03-29T01:30:00.000Z', tz: 'Europe/Berlin', offset_min: 60 }),
    );
    insertDirect(
      executor,
      'sessions',
      // Fall-back overlap: 2026-10-25 01:15Z is 03:15 CEST on the first pass
      // and 02:15 CET on the second — offset 120 pins the first reading.
      makeSessionRow({ id: 'sess-dst-overlap', stem_id: 'stem-kiritimati', started_at: '2026-10-25T01:15:00.000Z', tz: 'Europe/Berlin', offset_min: 120 }),
    );
    insertDirect(
      executor,
      'sessions',
      makeSessionRow({ id: 'sess-epoch', stem_id: 'stem-kiritimati', started_at: '1970-01-01T00:00:00.000Z', tz: 'UTC', offset_min: 0 }),
    );
    insertDirect(
      executor,
      'sessions',
      makeSessionRow({
        id: 'sess-pre-epoch',
        stem_id: 'stem-kiritimati',
        started_at: '1969-12-31T23:59:59.999Z',
        tz: 'America/Anchorage',
        offset_min: -600, // pre-1983 Alaska (Bering Standard) offset
      }),
    );
    insertDirect(
      executor,
      'reviews',
      makeReviewRow({ id: 'review-kiritimati', created_at: '1970-01-01T00:00:00.000Z', tz: 'Pacific/Kiritimati', offset_min: 840 }),
    );

    const { secondBundle } = expectLosslessRoundTrip(repo, executor);

    expect(rowById(secondBundle.sessions, 'sess-kiritimati').offset_min).toBe(840);
    expect(rowById(secondBundle.sessions, 'sess-gmt-minus-12').offset_min).toBe(-720);
    expect(rowById(secondBundle.sessions, 'sess-dst-gap').offset_min).toBe(60);
    expect(rowById(secondBundle.sessions, 'sess-dst-gap').started_at).toBe('2026-03-29T01:30:00.000Z');
    expect(rowById(secondBundle.sessions, 'sess-dst-overlap').offset_min).toBe(120);
    expect(rowById(secondBundle.sessions, 'sess-epoch').offset_min).toBe(0);
    expect(rowById(secondBundle.sessions, 'sess-epoch').started_at).toBe('1970-01-01T00:00:00.000Z');
    expect(rowById(secondBundle.sessions, 'sess-pre-epoch').offset_min).toBe(-600);
    expect(rowById(secondBundle.sessions, 'sess-pre-epoch').tz).toBe('America/Anchorage');
    expect(rowById(secondBundle.reviews, 'review-kiritimati').offset_min).toBe(840);
    expect(rowById(secondBundle.reviews, 'review-kiritimati').created_at).toBe('1970-01-01T00:00:00.000Z');
    expect(rowById(secondBundle.stems, 'stem-kiritimati').created_offset_min).toBe(840);
  });

  it('class 7 — every nullable column carries NULL and non-NULL states without conflating them', () => {
    const { db, repo } = freshRepository();
    const executor = nodeSqliteExecutor(db);

    // An all-null user stem (category, time_of_day, week_number, deleted_at).
    const stemId = repo.addStem({ text: 'A user stem with no metadata', category: null, origin: 'user' });

    // A session where EVERY nullable column is NULL — only reachable by
    // direct insert (createSession stamps last_activity_at; imports of old
    // bundles can produce it). All nullable columns at NULL is a state the
    // export must represent as null, not as the column's absence or an
    // empty string.
    insertDirect(executor, 'sessions', makeSessionRow({ id: 'sess-all-null', stem_id: stemId, last_activity_at: null }));
    // …with an ending begun but never submitted (submitted_at NULL) and an
    // empty-text ending: empty string must not collapse into NULL.
    insertDirect(
      executor,
      'endings',
      makeEndingRow({ id: 'ending-empty-unsubmitted', session_id: 'sess-all-null', text: '', submitted_at: null }),
    );
    // A review with a NULL reflection_text.
    insertDirect(executor, 'reviews', makeReviewRow({ id: 'review-null-reflection', reflection_text: null }));
    // Contrast rows: the same tables with every nullable set.
    insertDirect(
      executor,
      'sessions',
      makeSessionRow({
        id: 'sess-all-set',
        stem_id: stemId,
        first_keypress_at: '2026-09-05T08:00:05.000Z',
        ended_at: '2026-09-05T08:01:00.000Z',
        end_reason: 'user_done',
        notification_id: 'notif-1',
        notified_at: '2026-09-05T08:00:00.000Z',
        opened_at: '2026-09-05T08:00:07.000Z',
        last_activity_at: '2026-09-05T08:01:00.000Z',
      }),
    );

    const { secondBundle } = expectLosslessRoundTrip(repo, executor);

    const allNull = rowById(secondBundle.sessions, 'sess-all-null');
    for (const column of ['first_keypress_at', 'ended_at', 'end_reason', 'notification_id', 'notified_at', 'opened_at', 'last_activity_at', 'deleted_at']) {
      expect(allNull[column]).toBeNull();
    }
    const allSet = rowById(secondBundle.sessions, 'sess-all-set');
    for (const column of ['first_keypress_at', 'ended_at', 'end_reason', 'notification_id', 'notified_at', 'opened_at', 'last_activity_at']) {
      expect(allSet[column]).not.toBeNull();
    }
    const emptyText = rowById(secondBundle.endings, 'ending-empty-unsubmitted');
    expect(emptyText.text).toBe(''); // empty string ≠ NULL after the round trip
    expect(emptyText.submitted_at).toBeNull();
    expect(rowById(secondBundle.reviews, 'review-null-reflection').reflection_text).toBeNull();
    // The same tables also carry a fully-set ending for contrast.
    expect(secondBundle.endings.find((e) => e.submitted_at === null)).toBeDefined();
  });

  it('class 8 — control characters and newlines: CRLF, bare CR, tabs, escapes, line/paragraph separators, BOM, DEL, trailing and only-newline text', () => {
    const { db, repo } = freshRepository();
    const executor = nodeSqliteExecutor(db);

    const controlTexts = [
      'line one\r\nline two', // CRLF
      'line one\nline two', // bare LF
      'line one\rline two', // bare CR (old-Mac line ending, CSV-hostile)
      'tab\tseparated\tvalues',
      'vertical\u000Btab and\u000Cform feed',
      'ANSI escape: \u001B[31mred\u001B[0m',
      'U+2028 line sep U+2029 paragraph sep reset',
      'zero\u200Bwidth\u200Cnon-joiner\u2060word joiner',
      'BOM mid-string: ﻿here',
      'DEL char: \u007F',
      'ends with a newline:\n',
      '\r\n\r\n', // nothing but newlines
      'no trailing newline',
    ];

    const stemId = repo.addStem({ text: 'A stem\twith\ttabs\nand a newline', category: null, origin: 'user' });
    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'snapshot\u2028with separators',
      origin: 'manual',
      targetEndings: controlTexts.length,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-05T08:00:00.000Z',
      deviceLocale: 'en-US',
    });
    controlTexts.forEach((text, index) => {
      const ordinal = index + 1;
      repo.recordFirstKeypress(sessionId, ordinal, '2026-09-05T08:00:05.000Z');
      repo.autosaveEndingText(sessionId, ordinal, text, index, '2026-09-05T08:00:10.000Z');
      repo.submitEnding(sessionId, ordinal, '2026-09-05T08:00:20.000Z');
    });
    repo.finalizeSession(sessionId, 'timeout', '2026-09-05T08:02:00.000Z');

    // A settings row whose raw stored value carries a literal newline and
    // quotes — the KV table stores text as-is, so export must too.
    insertDirect(executor, 'settings', {
      key: 'adversarial_raw_value',
      value: 'line one\nline "two"\r\nline\tthree',
      updated_at: '2026-09-05T08:00:00.000Z',
    });

    const { secondBundle } = expectLosslessRoundTrip(repo, executor);

    const restored = secondBundle.endings.map((e) => e.text as string).sort();
    expect(restored).toEqual([...controlTexts].sort());
    expect(secondBundle.settings.find((s) => s.key === 'adversarial_raw_value')!.value).toBe(
      'line one\nline "two"\r\nline\tthree',
    );
  });

  it('class 9 — the CSV projection survives a hostile corpus through an independent RFC 4180 reader (§8.3)', () => {
    const hostileRows: Record<string, unknown>[] = [
      {
        id: 'row-1',
        text: 'plain text',
        origin: 'user',
        category: null,
        language: 'en',
        weight: 1.0,
        active: 1,
        created_at: '2026-09-05T08:00:00.000Z',
        created_tz: 'Europe/Berlin',
        created_offset_min: 120,
        deleted_at: null,
        time_of_day: null,
        week_number: null,
        is_weekly_meta: 0,
      },
      {
        id: 'row-2',
        text: 'He said "hello", twice;\nthen a newline,\rthen CR only,\r\nand CRLF.',
        origin: 'seed',
        category: 'purpose',
        language: 'en',
        weight: 0.5,
        active: 0,
        created_at: '2026-09-05T08:00:00.000Z',
        created_tz: 'Pacific/Kiritimati',
        created_offset_min: 840,
        deleted_at: null,
        time_of_day: null,
        week_number: 3,
        is_weekly_meta: 0,
      },
      {
        id: 'row-3',
        text: ' leading and trailing spaces kept \t and an embedded "quote" and a, comma',
        origin: 'imported',
        category: null,
        language: 'en',
        weight: 1.7976931348623157e308,
        active: 1,
        created_at: '2026-09-05T08:00:00.000Z',
        created_tz: 'Etc/GMT+12',
        created_offset_min: -720,
        deleted_at: '2026-09-06T00:00:00.000Z',
        time_of_day: 'morning',
        week_number: null,
        is_weekly_meta: 1,
      },
      {
        id: 'row-4',
        text: '👨\u200D👩\u200D👧\u200D👦 family, cafe\u0301, 日本語, नमस्ते — all in one field',
        origin: 'seed',
        category: 'awareness',
        language: 'en',
        weight: 0.25,
        active: 0,
        created_at: '1970-01-01T00:00:00.000Z',
        created_tz: 'UTC',
        created_offset_min: 0,
        deleted_at: null,
        time_of_day: null,
        week_number: null,
        is_weekly_meta: 0,
      },
    ];
    const dump = {
      stems: hostileRows,
      sessions: [] as Record<string, unknown>[],
      endings: [] as Record<string, unknown>[],
      reviews: [] as Record<string, unknown>[],
      settings: [] as Record<string, unknown>[],
      notification_schedule: [] as Record<string, unknown>[],
      schema_meta: [] as Record<string, unknown>[],
    };

    const files = buildCsvFiles(dump);
    const stemsCsv = files.find((f) => f.name === 'stems.csv')!;
    // §8.3: UTF-8 with BOM omitted — the file must not start with U+FEFF.
    expect(stemsCsv.content.charCodeAt(0)).not.toBe(0xfeff);
    expect(files.map((f) => f.name)).toContain('README.md');

    // Parse the CSV back with an independent RFC 4180 reader and compare to
    // the rows that went in: fields equal (null/undefined → empty field),
    // quotes doubled and un-doubled, newlines preserved inside quotes.
    const parsed = parseCsv(stemsCsv.content);
    expect(parsed[0]).toEqual([...CSV_COLUMNS.stems]);
    const dataRows = parsed.slice(1);
    expect(dataRows).toHaveLength(hostileRows.length);

    const projected = hostileRows.map((row) =>
      CSV_COLUMNS.stems.map((c) => {
        const value = row[c];
        return value === undefined || value === null ? '' : String(value);
      }),
    );
    expect(dataRows).toEqual(projected);
  });
});

/** Minimal RFC 4180 reader, used only to verify the CSV projection from the outside. */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r' && input[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 2;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

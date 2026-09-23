/**
 * The anti-typo guard for the official programme seed (spec §5.1 as
 * amended 2026-09-15, ADR-0005), with the issue-10 content overlay.
 *
 * Parses the canonical verbatim snapshot with its OWN parser, independent
 * of `seed/stems.ts` (separate file read, separate week-block logic), and
 * asserts the seed matches it byte-for-byte — text, week assignment, and
 * ordering within each week. Any hand-edit drift in the seed content fails
 * here; conversely, a malformed snapshot fails the parser-sanity tests
 * below rather than silently comparing empty sets.
 *
 * Issue 10 (programme text not published with the repo): the snapshot is
 * owner-local and untracked, so the snapshot-dependent suites are gated on
 * its presence and SKIP with a labeled reason without it (fresh clone, CI).
 * Everything corpus-derived — seeding behaviour, tags, category resolution,
 * structural pins — runs in BOTH modes against whatever content module the
 * loader resolved (owner-local licensed text or the committed example).
 *
 * The snapshot lives at `.scratch/official-program/official-program-
 * verbatim.txt` (untracked; kept on disk locally). Seeds are transcribed
 * from it, never from the live page or memory.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { CURRENT_SCHEMA_VERSION } from '../migrations';
import { Repository } from '../repository';
import { EVENING_META_STEMS, EVENING_PRACTICE_SEED_STEMS, PROGRAMME_SEED_STEMS, programmeStemCategory, PROGRAMME_WEEK_CATEGORY, RETIRED_SEED_STEMS, StemCategory, WEEKLY_META_STEM } from '../seed/stems';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';

const SNAPSHOT_PATH = path.join(__dirname, '..', '..', '..', '.scratch', 'official-program', 'official-program-verbatim.txt');
const TERMINATOR = '…'; // the snapshot's trailing ellipsis: a single U+2026 character

/** Owner mode: the canonical snapshot is on disk (issue 10 — untracked, owner-local). */
const SNAPSHOT_PRESENT = fs.existsSync(SNAPSHOT_PATH);

/** Appended to gated suite names so a skip reason is visible in the jest output. */
const SKIP_NOTE = SNAPSHOT_PRESENT ? '' : ' — SKIPPED: canonical snapshot not on disk (owner-local content; see README, "Seed content")';

/** Snapshot-dependent suites run only in owner mode; the name carries the skip reason. */
const describeWithSnapshot = SNAPSHOT_PRESENT ? describe : describe.skip;

interface SnapshotWeek {
  week: number;
  /** Stem lines exactly as the snapshot writes them: with the trailing terminator. */
  stems: string[];
}

interface ParsedSnapshot {
  weeks: SnapshotWeek[];
  /** The instructions section's weekly reflection line, terminator stripped. */
  weeklyReflection: string;
}

/**
 * Strict snapshot parser. A week block starts at a bare `Week N` line and
 * runs to the next such line; inside a block, non-empty lines ending in the
 * terminator are stems. The first non-stem line after stems (the site
 * footer: "Home", "About", …) ends the programme for good — any later
 * stem-looking line is a parse error, not programme content.
 *
 * The instructions section's weekly reflection line is anchored
 * structurally, not by quoting programme text (issue 10): before the first
 * Week block the snapshot contains exactly two terminator-terminated lines
 * — the method's worked example stem and the weekly reflection stem's
 * introduction — and the weekly reflection is the LAST of them. The
 * parser-sanity suite pins this shape; a snapshot that breaks it fails
 * loudly here instead of comparing against a wrong anchor.
 */
function parseSnapshot(raw: string): ParsedSnapshot {
  const weeks: SnapshotWeek[] = [];
  let current: SnapshotWeek | null = null;
  let footer = false;
  let weeklyReflection: string | null = null;

  for (const line of raw.split('\n')) {
    const header = /^Week (\d+)$/.exec(line);
    if (header) {
      if (weeklyReflection === null) {
        throw new Error('snapshot has no weekly reflection line before its first Week block');
      }
      const week = Number(header[1]);
      const previous = weeks[weeks.length - 1];
      if (previous && week !== previous.week + 1) {
        throw new Error(`snapshot week blocks out of order: Week ${week} after Week ${previous.week}`);
      }
      current = { week, stems: [] };
      weeks.push(current);
    } else if (current === null && line.endsWith(TERMINATOR)) {
      // Instructions section: the last terminator line before the first
      // Week block is the weekly reflection stem (see doc comment).
      weeklyReflection = line.slice(0, -TERMINATOR.length);
    } else if (current !== null && !footer && line.trim() && !line.endsWith(TERMINATOR)) {
      footer = true; // first non-stem line inside a block: the site footer begins
    }

    if (current === null || footer) continue;
    if (!line.trim()) continue;
    if (line.endsWith(TERMINATOR)) {
      current.stems.push(line);
    }
  }

  if (weeklyReflection === null) throw new Error('snapshot has no weekly reflection line in its instructions section');
  return { weeks, weeklyReflection };
}

function expectedProgramme(parsed: ParsedSnapshot): { week: number; textWithTerminator: string }[] {
  return parsed.weeks.flatMap((w) => w.stems.map((textWithTerminator) => ({ week: w.week, textWithTerminator })));
}

/** Memoized lazy parse: gated suites only touch the snapshot inside `it` bodies. */
let cachedSnapshot: ParsedSnapshot | null = null;
function snapshot(): ParsedSnapshot {
  if (cachedSnapshot === null) {
    cachedSnapshot = parseSnapshot(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
  }
  return cachedSnapshot;
}

function freshDatabase(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  return { db: raw, repo: new Repository(executor) };
}

describeWithSnapshot(`programme snapshot parser (the guard must itself be sound)${SKIP_NOTE}`, () => {
  it('finds exactly weeks 1–30 in order', () => {
    const parsed = snapshot();
    expect(parsed.weeks.map((w) => w.week)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('finds 4–7 stems in every week block (the programme\'s documented shape; Week 30\'s synthesis week carries seven)', () => {
    const parsed = snapshot();
    for (const week of parsed.weeks) {
      expect(week.stems.length).toBeGreaterThanOrEqual(4);
      expect(week.stems.length).toBeLessThanOrEqual(7);
      for (const stem of week.stems) {
        expect(stem.length).toBeGreaterThan(TERMINATOR.length);
        expect(stem.endsWith(TERMINATOR + TERMINATOR)).toBe(false);
      }
    }
  });

  it('parses 142 programme stems in total', () => {
    const parsed = snapshot();
    expect(expectedProgramme(parsed)).toHaveLength(142);
  });

  it('anchors the weekly reflection on a line that occurs exactly once in the snapshot', () => {
    const parsed = snapshot();
    expect(parsed.weeklyReflection.length).toBeGreaterThan(0);
    const occurrences = fs
      .readFileSync(SNAPSHOT_PATH, 'utf-8')
      .split('\n')
      .filter((line) => line === parsed.weeklyReflection + TERMINATOR);
    expect(occurrences).toHaveLength(1);
  });
});

describe('seed content module resolves (both modes — issue 10)', () => {
  it('loads a non-empty corpus and weekly stem, whether owner-local or example', () => {
    expect(PROGRAMME_SEED_STEMS.length).toBeGreaterThan(0);
    expect(WEEKLY_META_STEM.length).toBeGreaterThan(0);
    // The terminator is appended at render time; stored text never carries it.
    expect(WEEKLY_META_STEM.endsWith(TERMINATOR)).toBe(false);
    expect(WEEKLY_META_STEM).toBe(WEEKLY_META_STEM.trim());
  });

  it('stores programme stems without the terminator, whitespace, or newlines', () => {
    for (const stem of PROGRAMME_SEED_STEMS) {
      expect(stem.text.endsWith(TERMINATOR)).toBe(false);
      expect(stem.text.endsWith('...')).toBe(false);
      expect(stem.text.endsWith('—')).toBe(false);
      expect(stem.text).toBe(stem.text.trim());
      expect(stem.text).not.toMatch(/[\n\r]/);
      expect(stem.text.length).toBeGreaterThan(0);
      expect(Number.isInteger(stem.weekNumber)).toBe(true);
      expect(stem.weekNumber).toBeGreaterThanOrEqual(1);
      expect(stem.weekNumber).toBeLessThanOrEqual(30);
    }
  });

  it('ships the weekly stem exactly once across the whole seed module', () => {
    expect(PROGRAMME_SEED_STEMS.some((s) => s.text === WEEKLY_META_STEM)).toBe(false);
    expect(RETIRED_SEED_STEMS.some((s) => s.text === WEEKLY_META_STEM)).toBe(false);
    expect(EVENING_META_STEMS).toHaveLength(2);
    expect(EVENING_META_STEMS).not.toContain(WEEKLY_META_STEM);
  });

  it('keeps the 26 retired v1 originals structurally intact (spec §5.3, retired list)', () => {
    expect(RETIRED_SEED_STEMS).toHaveLength(26);
    const validCategories = new Set(['awareness', 'self_acceptance', 'responsibility', 'assertiveness', 'purpose', 'integrity', null]);
    for (const stem of RETIRED_SEED_STEMS) {
      expect(stem.text).toBe(stem.text.trim());
      expect(stem.text.endsWith(TERMINATOR)).toBe(false);
      expect(stem.text.endsWith('...')).toBe(false);
      expect(validCategories.has(stem.category)).toBe(true);
      expect(stem.timeOfDay === 'morning' || stem.timeOfDay === 'evening').toBe(true);
    }
    const texts = new Set(RETIRED_SEED_STEMS.map((s) => s.text));
    expect(texts.size).toBe(26); // no duplicates
  });

  it('every programme stem resolves to one of the six §5.2 categories (issue 04)', () => {
    const valid = new Set(['awareness', 'self_acceptance', 'responsibility', 'assertiveness', 'purpose', 'integrity']);
    for (const stem of PROGRAMME_SEED_STEMS) {
      const category = programmeStemCategory(stem.weekNumber, stem.text);
      expect(valid.has(category as StemCategory)).toBe(true);
    }
  });
});

describeWithSnapshot(`programme seed transcription (byte-for-byte vs the canonical snapshot, spec §5.1 / ADR-0005)${SKIP_NOTE}`, () => {
  it('seeds exactly as many programme stems as the snapshot holds', () => {
    const expected = expectedProgramme(snapshot());
    expect(PROGRAMME_SEED_STEMS).toHaveLength(expected.length);
  });

  it('matches the snapshot byte-for-byte, week assignment and within-week order included', () => {
    const expected = expectedProgramme(snapshot());
    for (let i = 0; i < expected.length; i++) {
      const seed = PROGRAMME_SEED_STEMS[i];
      const want = expected[i];
      // The exact byte-level statement: stored text + terminator == snapshot line.
      expect(seed.text + TERMINATOR).toBe(want.textWithTerminator);
      expect(seed.weekNumber).toBe(want.week);
      expect(seed.text).toBe(want.textWithTerminator.slice(0, -TERMINATOR.length));
    }
  });

  it('seeds the weekly reflection stem exactly as the snapshot\'s instructions write it', () => {
    expect(WEEKLY_META_STEM).toBe(snapshot().weeklyReflection);
  });

  it('covers every week 1–30 with no gaps', () => {
    const weeks = new Set(PROGRAMME_SEED_STEMS.map((s) => s.weekNumber));
    expect([...weeks].sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('the week→pillar mapping covers exactly weeks 1–30 (issue 04)', () => {
    expect(Object.keys(PROGRAMME_WEEK_CATEGORY).map(Number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });

  it('exactly the 9 exception stems whose category differs from their week default resolve away from it (issue 04)', () => {
    // t04's exceptions table holds 10 keys covering 11 stems ("I am
    // becoming aware" recurs in Weeks 11 and 23); two of the Week 30
    // exceptions resolve to the same pillar as their week default, so the
    // observable override count is 9 — pinned here against the snapshot
    // corpus without quoting any programme text (issue 10).
    const expected = expectedProgramme(snapshot());
    const overridden = expected.filter(({ week, textWithTerminator }) => {
      const text = textWithTerminator.slice(0, -TERMINATOR.length);
      return programmeStemCategory(week, text) !== PROGRAMME_WEEK_CATEGORY[week];
    });
    expect(overridden).toHaveLength(9);
    for (const { week, textWithTerminator } of overridden) {
      expect(programmeStemCategory(week, textWithTerminator.slice(0, -TERMINATOR.length))).not.toBeNull();
    }
  });
});

describe('fresh-install seed lands the programme in the database (both modes)', () => {
  it('inserts the programme in seed (insertion) order, tagged per week', () => {
    const { db, repo } = freshDatabase();
    repo.seedIfEmpty();

    const rows = db
      .prepare(
        `SELECT text, week_number, is_weekly_meta, origin, category, active, time_of_day, deleted_at
         FROM stems WHERE week_number IS NOT NULL ORDER BY rowid`,
      )
      .all() as {
      text: string;
      week_number: number;
      is_weekly_meta: number;
      origin: string;
      category: string | null;
      active: number;
      time_of_day: string | null;
      deleted_at: string | null;
    }[];

    expect(rows).toHaveLength(PROGRAMME_SEED_STEMS.length);
    for (let i = 0; i < PROGRAMME_SEED_STEMS.length; i++) {
      expect(rows[i].text).toBe(PROGRAMME_SEED_STEMS[i].text);
      expect(rows[i].week_number).toBe(PROGRAMME_SEED_STEMS[i].weekNumber);
      expect(rows[i].is_weekly_meta).toBe(0);
      expect(rows[i].origin).toBe('seed');
      // Issue 04: each programme stem carries its week's pillar (per-stem
      // exceptions included) straight from the seed — no post-seed backfill.
      // The lookup uses the row's stored text (terminator already stripped).
      expect(rows[i].category).toBe(programmeStemCategory(rows[i].week_number, rows[i].text));
      // Issue 09: only week 1 stems active, weeks 2..30 resting.
      expect(rows[i].active).toBe(rows[i].week_number === 1 ? 1 : 0);
      expect(rows[i].time_of_day).toBe('morning');
      expect(rows[i].deleted_at).toBeNull();
    }
  });

  it('seeds exactly one active weekly meta-stem, plus the two inactive evening meta-stems, plus the evening practice starter set, plus the 26 soft-deleted retired originals — and nothing else', () => {
    const { db, repo } = freshDatabase();
    repo.seedIfEmpty();

    const weekly = db
      .prepare(
        `SELECT text, origin, category, active, time_of_day, week_number, deleted_at
         FROM stems WHERE is_weekly_meta = 1`,
      )
      .all() as {
      text: string;
      origin: string;
      category: string | null;
      active: number;
      time_of_day: string | null;
      week_number: number | null;
      deleted_at: string | null;
    }[];
    expect(weekly).toHaveLength(1);
    expect(weekly[0].text).toBe(WEEKLY_META_STEM);
    expect(weekly[0].origin).toBe('seed');
    expect(weekly[0].category).toBeNull();
    expect(weekly[0].active).toBe(1);
    expect(weekly[0].time_of_day).toBeNull();
    expect(weekly[0].week_number).toBeNull();
    expect(weekly[0].deleted_at).toBeNull();

    const eveningMetas = db.prepare("SELECT text, active FROM stems WHERE origin = 'meta'").all() as {
      text: string;
      active: number;
    }[];
    expect(eveningMetas.map((r) => r.text).sort()).toEqual([...EVENING_META_STEMS].sort());
    expect(eveningMetas.every((r) => r.active === 0)).toBe(true);

    const retired = db
      .prepare('SELECT text, active, deleted_at FROM stems WHERE deleted_at IS NOT NULL ORDER BY rowid')
      .all() as { text: string; active: number; deleted_at: string | null }[];
    expect(retired).toHaveLength(26);
    expect(retired.map((r) => r.text)).toEqual(RETIRED_SEED_STEMS.map((s) => s.text));
    expect(retired.every((r) => r.active === 0 && r.deleted_at !== null)).toBe(true);

    // Nothing else: the whole corpus + 1 weekly + 2 evening metas + the
    // starter set + 26 retired.
    expect((db.prepare('SELECT COUNT(*) AS c FROM stems').get() as { c: number }).c).toBe(
      PROGRAMME_SEED_STEMS.length + 1 + 2 + EVENING_PRACTICE_SEED_STEMS.length + RETIRED_SEED_STEMS.length,
    );
  });

  it('seeds the evening practice starter set active and evening-tagged (issue 17)', () => {
    const { db, repo } = freshDatabase();
    repo.seedIfEmpty();

    const rows = db
      .prepare(
        `SELECT text, origin, category, active, time_of_day, week_number, is_weekly_meta, deleted_at
         FROM stems WHERE time_of_day = 'evening' AND active = 1 ORDER BY rowid`,
      )
      .all() as {
      text: string;
      origin: string;
      category: string | null;
      active: number;
      time_of_day: string | null;
      week_number: number | null;
      is_weekly_meta: number;
      deleted_at: string | null;
    }[];

    // The seed's only active evening rows are the starter set, in seed order.
    expect(rows).toHaveLength(EVENING_PRACTICE_SEED_STEMS.length);
    for (let i = 0; i < EVENING_PRACTICE_SEED_STEMS.length; i++) {
      expect(rows[i].text).toBe(EVENING_PRACTICE_SEED_STEMS[i].text);
      expect(rows[i].origin).toBe('seed');
      expect(rows[i].category).toBe(EVENING_PRACTICE_SEED_STEMS[i].category);
      expect(rows[i].active).toBe(1);
      expect(rows[i].time_of_day).toBe('evening');
      expect(rows[i].week_number).toBeNull();
      expect(rows[i].is_weekly_meta).toBe(0);
      expect(rows[i].deleted_at).toBeNull();
    }

    // The §5.4 meta-stems keep their resting role beside the set: still
    // inactive, so no practice draw ever picks them (issue 06's contract).
    const resting = db.prepare("SELECT COUNT(*) AS c FROM stems WHERE origin = 'meta' AND active = 0").get() as {
      c: number;
    };
    expect(resting.c).toBe(EVENING_META_STEMS.length);
  });

  it('reaches the current schema version on a fresh install', () => {
    const { db, repo } = freshDatabase();
    repo.seedIfEmpty();
    const meta = db.prepare('SELECT schema_version FROM schema_meta WHERE id = 1').get() as { schema_version: number };
    expect(meta.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describeWithSnapshot(`fresh-install seed is byte-identical to the canonical snapshot${SKIP_NOTE}`, () => {
  it('inserts the programme byte-for-byte in snapshot (insertion) order', () => {
    const { db, repo } = freshDatabase();
    repo.seedIfEmpty();

    const rows = db
      .prepare(`SELECT text, week_number FROM stems WHERE week_number IS NOT NULL ORDER BY rowid`)
      .all() as { text: string; week_number: number }[];

    const expected = expectedProgramme(snapshot());
    expect(rows).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(rows[i].text + TERMINATOR).toBe(expected[i].textWithTerminator);
      expect(rows[i].week_number).toBe(expected[i].week);
    }
  });
});

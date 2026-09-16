/**
 * The anti-typo guard for the official programme seed (spec §5.1 as
 * amended 2026-09-15, ADR-0005).
 *
 * Parses the committed verbatim snapshot with its OWN parser, independent
 * of `seed/stems.ts` (separate file read, separate week-block logic), and
 * asserts the seed matches it byte-for-byte — text, week assignment, and
 * ordering within each week. Any hand-edit drift in the seed file fails
 * here; conversely, a malformed snapshot fails the parser-sanity tests
 * below rather than silently comparing empty sets.
 *
 * The canonical snapshot is immutable round history: `.scratch/official-
 * program/official-program-verbatim.txt`. Seeds are transcribed from it,
 * never from the live page or memory.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { CURRENT_SCHEMA_VERSION } from '../migrations';
import { Repository } from '../repository';
import { EVENING_META_STEMS, PROGRAMME_SEED_STEMS, RETIRED_SEED_STEMS, WEEKLY_META_STEM } from '../seed/stems';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';

const SNAPSHOT_PATH = path.join(__dirname, '..', '..', '..', '.scratch', 'official-program', 'official-program-verbatim.txt');
const TERMINATOR = '…'; // the snapshot's trailing ellipsis: a single U+2026 character

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
 */
function parseSnapshot(raw: string): ParsedSnapshot {
  const weeks: SnapshotWeek[] = [];
  let current: SnapshotWeek | null = null;
  let footer = false;
  let weeklyReflection: string | null = null;
  // Structural anchor for the weekly stem: the instructions line that
  // introduces it ("...write a minimum of six endings for this stem:").
  // The instructions also contain an EXAMPLE stem — "To me,
  // self-responsibility means…" — which must not be mistaken for the
  // weekly reflection, so "first stem-looking line" would be wrong.
  let previousLine = '';

  for (const line of raw.split('\n')) {
    const header = /^Week (\d+)$/.exec(line);
    if (header) {
      const week = Number(header[1]);
      const previous = weeks[weeks.length - 1];
      if (previous && week !== previous.week + 1) {
        throw new Error(`snapshot week blocks out of order: Week ${week} after Week ${previous.week}`);
      }
      current = { week, stems: [] };
      weeks.push(current);
    } else if (
      weeklyReflection === null &&
      current === null &&
      line.endsWith(TERMINATOR) &&
      previousLine.endsWith('write a minimum of six endings for this stem:')
    ) {
      weeklyReflection = line.slice(0, -TERMINATOR.length);
    } else if (current !== null && !footer && line.trim() && !line.endsWith(TERMINATOR)) {
      footer = true; // first non-stem line inside a block: the site footer begins
    }
    if (line.trim()) previousLine = line;

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

function freshDatabase(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  return { db: raw, repo: new Repository(executor) };
}

describe('programme snapshot parser (the guard must itself be sound)', () => {
  it('finds exactly weeks 1–30 in order', () => {
    const parsed = parseSnapshot(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    expect(parsed.weeks.map((w) => w.week)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('finds 4–7 stems in every week block (the programme\'s documented shape; Week 30\'s synthesis week carries seven)', () => {
    const parsed = parseSnapshot(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
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
    const parsed = parseSnapshot(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    expect(expectedProgramme(parsed)).toHaveLength(142);
  });
});

describe('programme seed transcription (byte-for-byte, spec §5.1 / ADR-0005)', () => {
  const parsed = parseSnapshot(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
  const expected = expectedProgramme(parsed);

  it('seeds exactly as many programme stems as the snapshot holds', () => {
    expect(PROGRAMME_SEED_STEMS).toHaveLength(expected.length);
  });

  it('matches the snapshot byte-for-byte, week assignment and within-week order included', () => {
    for (let i = 0; i < expected.length; i++) {
      const seed = PROGRAMME_SEED_STEMS[i];
      const want = expected[i];
      // The exact byte-level statement: stored text + terminator == snapshot line.
      expect(seed.text + TERMINATOR).toBe(want.textWithTerminator);
      expect(seed.weekNumber).toBe(want.week);
      expect(seed.text).toBe(want.textWithTerminator.slice(0, -TERMINATOR.length));
    }
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

  it('covers every week 1–30 with no gaps', () => {
    const weeks = new Set(PROGRAMME_SEED_STEMS.map((s) => s.weekNumber));
    expect([...weeks].sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('seeds the weekly reflection stem exactly as the snapshot\'s instructions write it', () => {
    expect(WEEKLY_META_STEM).toBe(parsed.weeklyReflection);
    expect(WEEKLY_META_STEM).toBe('If any of what I wrote this week is true, it might be helpful if I');
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
});

describe('fresh-install seed lands the programme in the database', () => {
  it('inserts the programme byte-for-byte in snapshot (insertion) order, tagged per week', () => {
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

    const expected = expectedProgramme(parseSnapshot(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')));
    expect(rows).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(rows[i].text + TERMINATOR).toBe(expected[i].textWithTerminator);
      expect(rows[i].week_number).toBe(expected[i].week);
      expect(rows[i].is_weekly_meta).toBe(0);
      expect(rows[i].origin).toBe('seed');
      expect(rows[i].category).toBeNull();
      expect(rows[i].active).toBe(1);
      expect(rows[i].time_of_day).toBe('morning');
      expect(rows[i].deleted_at).toBeNull();
    }
  });

  it('seeds exactly one active weekly meta-stem, plus the two inactive evening meta-stems, plus the 26 soft-deleted retired originals — and nothing else', () => {
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

    // Nothing else: 142 programme + 1 weekly + 2 evening metas + 26 retired.
    expect((db.prepare('SELECT COUNT(*) AS c FROM stems').get() as { c: number }).c).toBe(142 + 1 + 2 + 26);
  });

  it('reaches schema version 4 on a fresh install', () => {
    const { db, repo } = freshDatabase();
    repo.seedIfEmpty();
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    const meta = db.prepare('SELECT schema_version FROM schema_meta WHERE id = 1').get() as { schema_version: number };
    expect(meta.schema_version).toBe(4);
  });
});

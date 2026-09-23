/**
 * Pure unit tests for the §6.2 programme-week rule (ADR-0005): derivation
 * incl. cap + anchor edge cases, override precedence, the evening-stem
 * alternation, and the Mon–Sun calendar bucketing (including year
 * wraparound). No DB, no clock — every `now` is injected.
 */
import {
  PROGRAMME_WEEK_CAP,
  calendarWeeksBetween,
  countAnchoredReflectionWeeks,
  deriveProgramWeek,
  effectiveWeek,
  eveningReflectionStemIndex,
  eventLocalDateKey,
  eventWeekMondayKey,
  isWeeklyMetaDay,
  localDateKey,
  mondayOfWeek,
  parseLocalDateKey,
  utcBoundsOfLocalDay,
} from '@/session/program';

function localDate(y: number, m1: number, d: number, hours = 12): Date {
  return new Date(y, m1 - 1, d, hours, 0, 0, 0);
}

describe('program — calendar keys', () => {
  it('localDateKey renders a zero-padded local date', () => {
    expect(localDateKey(localDate(2026, 3, 7))).toBe('2026-03-07');
  });

  it('parseLocalDateKey accepts only YYYY-MM-DD', () => {
    expect(parseLocalDateKey('2026-09-16')).toEqual(localDate(2026, 9, 16, 0));
    expect(parseLocalDateKey('2026-9-16')).toBeNull();
    expect(parseLocalDateKey('not a date')).toBeNull();
    expect(parseLocalDateKey('')).toBeNull();
  });

  it('mondayOfWeek lands on the Monday of a Mon–Sun week, across year wraparound', () => {
    // 2025-12-29 is a Monday; 2026-01-04 its Sunday — one week spanning the
    // year boundary must bucket together.
    expect(localDateKey(mondayOfWeek(localDate(2025, 12, 29)))).toBe('2025-12-29');
    expect(localDateKey(mondayOfWeek(localDate(2026, 1, 4)))).toBe('2025-12-29');
    expect(localDateKey(mondayOfWeek(localDate(2026, 1, 5)))).toBe('2026-01-05');
    // A Sunday belongs to the week that STARTS six days earlier.
    expect(localDateKey(mondayOfWeek(localDate(2026, 9, 20)))).toBe('2026-09-14'); // 2026-09-20 is a Sunday
    expect(localDateKey(mondayOfWeek(localDate(2026, 9, 14)))).toBe('2026-09-14'); // its Monday
  });

  it('eventLocalDateKey reads the event wall clock, independent of the machine zone', () => {
    // 2026-06-01T23:30Z at UTC+2 (summer Berlin) is 2026-06-02 local.
    expect(eventLocalDateKey('2026-06-01T23:30:00.000Z', 120)).toBe('2026-06-02');
    // Same instant at UTC-7 is still 2026-06-01 local.
    expect(eventLocalDateKey('2026-06-01T23:30:00.000Z', -420)).toBe('2026-06-01');
  });

  it('eventWeekMondayKey buckets by the event wall week, across year wraparound and negative offsets', () => {
    // 2025-12-30T23:00Z at UTC+1 → 2025-12-31 (Wednesday) → Monday 2025-12-29.
    expect(eventWeekMondayKey('2025-12-30T23:00:00.000Z', 60)).toBe('2025-12-29');
    // 2026-01-03T23:00Z at UTC+1 → 2026-01-04 (Sunday) → same Monday 2025-12-29.
    expect(eventWeekMondayKey('2026-01-03T23:00:00.000Z', 60)).toBe('2025-12-29');
    // One calendar week later (Mon 2026-01-05) is a distinct week.
    expect(eventWeekMondayKey('2026-01-05T12:00:00.000Z', 60)).toBe('2026-01-05');
    // West of UTC: 2026-01-04T02:00Z at UTC-5 → 2026-01-03 (Saturday) → Monday 2025-12-29.
    expect(eventWeekMondayKey('2026-01-04T02:00:00.000Z', -300)).toBe('2025-12-29');
  });

  it('calendarWeeksBetween counts whole Mon–Sun weeks (0 = same week)', () => {
    expect(calendarWeeksBetween(localDate(2026, 9, 14), localDate(2026, 9, 14))).toBe(0);
    expect(calendarWeeksBetween(localDate(2026, 9, 14), localDate(2026, 9, 20))).toBe(0);
    expect(calendarWeeksBetween(localDate(2026, 9, 14), localDate(2026, 9, 21))).toBe(1);
    expect(calendarWeeksBetween(localDate(2026, 9, 21), localDate(2026, 9, 14))).toBe(-1);
    // Across the year boundary: 2025-12-29 Monday → 2026-01-05 Monday = 1.
    expect(calendarWeeksBetween(localDate(2025, 12, 29), localDate(2026, 1, 5))).toBe(1);
  });
});

describe('program — countAnchoredReflectionWeeks', () => {
  const anchor = '2026-09-14'; // a Monday

  it('counts distinct weeks on/after the anchor, deduplicating same-week reflections', () => {
    const keys = ['2026-09-14', '2026-09-14', '2026-09-21', '2026-10-05'];
    expect(countAnchoredReflectionWeeks(anchor, keys)).toBe(3);
  });

  it('never counts reflection weeks before the anchor week', () => {
    const keys = ['2026-01-05', '2026-03-02', '2026-09-14', '2026-09-21'];
    expect(countAnchoredReflectionWeeks(anchor, keys)).toBe(2);
  });

  it('counts nothing without an anchor', () => {
    expect(countAnchoredReflectionWeeks(null, ['2026-09-14', '2026-09-21'])).toBe(0);
  });

  it('handles an empty reflection list', () => {
    expect(countAnchoredReflectionWeeks(anchor, [])).toBe(0);
  });
});

describe('program — deriveProgramWeek (§6.2)', () => {
  const anchorDate = '2026-08-31'; // a Monday
  const farNow = localDate(2027, 6, 1); // comfortably past any cap test

  it('derives week 1 without a first programme practice, regardless of reflections', () => {
    expect(deriveProgramWeek(null, 12, farNow)).toBe(1);
    expect(deriveProgramWeek(undefined, 12, farNow)).toBe(1);
    expect(deriveProgramWeek('', 12, farNow)).toBe(1);
  });

  it('is 1 + the anchored distinct-week count', () => {
    expect(deriveProgramWeek(anchorDate, 0, farNow)).toBe(1);
    expect(deriveProgramWeek(anchorDate, 1, farNow)).toBe(2);
    expect(deriveProgramWeek(anchorDate, 4, farNow)).toBe(5);
  });

  it('caps at 30', () => {
    expect(deriveProgramWeek(anchorDate, 29, farNow)).toBe(30);
    expect(deriveProgramWeek(anchorDate, 100, farNow)).toBe(PROGRAMME_WEEK_CAP);
  });

  it('ignores a garbage anchor date', () => {
    expect(deriveProgramWeek('whenever', 9, farNow)).toBe(1);
  });

  it('clamps a corrupt count to the weeks actually elapsed since the anchor', () => {
    // Anchor Monday 2026-08-31; "now" is the Monday 3 weeks later → at most
    // 4 countable weeks (anchor week + 3), so an injected 50 yields 5, not 51.
    const now = localDate(2026, 9, 21);
    expect(deriveProgramWeek(anchorDate, 50, now)).toBe(5);
  });

  it('derives week 1 when the anchor sits in the future (clock skew)', () => {
    expect(deriveProgramWeek('2030-01-05', 3, farNow)).toBe(1);
  });
});

describe('program — effectiveWeek (override precedence)', () => {
  it('override wins when it is a usable week', () => {
    expect(effectiveWeek(3, 7)).toBe(7);
    expect(effectiveWeek(1, 30)).toBe(30);
  });

  it('falls back to the derived week on null or out-of-range overrides', () => {
    expect(effectiveWeek(3, null)).toBe(3);
    expect(effectiveWeek(3, undefined)).toBe(3);
    expect(effectiveWeek(3, 0)).toBe(3);
    expect(effectiveWeek(3, 31)).toBe(3);
    expect(effectiveWeek(3, -2)).toBe(3);
    expect(effectiveWeek(3, 7.5)).toBe(3);
    expect(effectiveWeek(3, Number.NaN)).toBe(3);
  });
});

describe('program — evening reflection alternation (§6.2)', () => {
  it('even count → stem A, odd → stem B', () => {
    expect(eveningReflectionStemIndex(0)).toBe(0);
    expect(eveningReflectionStemIndex(1)).toBe(1);
    expect(eveningReflectionStemIndex(2)).toBe(0);
    expect(eveningReflectionStemIndex(3)).toBe(1);
    expect(eveningReflectionStemIndex(40)).toBe(0);
  });
});

describe('program — isWeeklyMetaDay (§6.5.1 target-day card)', () => {
  it('matches the configured weekday, case-insensitively', () => {
    const sunday = localDate(2026, 9, 20); // a Sunday
    expect(isWeeklyMetaDay('sunday', sunday)).toBe(true);
    expect(isWeeklyMetaDay('Sunday', sunday)).toBe(true);
    expect(isWeeklyMetaDay('  sunday  ', sunday)).toBe(true);
    expect(isWeeklyMetaDay('monday', sunday)).toBe(false);
  });

  it('is false for missing or garbage settings — the card just never shows', () => {
    const sunday = localDate(2026, 9, 20);
    expect(isWeeklyMetaDay(null, sunday)).toBe(false);
    expect(isWeeklyMetaDay(undefined, sunday)).toBe(false);
    expect(isWeeklyMetaDay('', sunday)).toBe(false);
    expect(isWeeklyMetaDay('funday', sunday)).toBe(false);
  });
});

describe('program — utcBoundsOfLocalDay', () => {
  it('brackets the local day in UTC ISO, whatever zone the machine runs in', () => {
    const { start, end } = utcBoundsOfLocalDay(localDate(2026, 9, 16, 14));
    // The bounds are exactly local midnight → next local midnight, rendered in UTC.
    expect(start).toBe(new Date(2026, 8, 16).toISOString());
    expect(end).toBe(new Date(2026, 8, 17).toISOString());
    // The day's own instants fall inside the window (local last-instant,
    // computed zone-free).
    expect(Date.parse(start) <= Date.parse(new Date(2026, 8, 16, 12).toISOString())).toBe(true);
    expect(Date.parse(end) > Date.parse(new Date(2026, 8, 16, 23, 59, 59, 999).toISOString())).toBe(true);
  });
});

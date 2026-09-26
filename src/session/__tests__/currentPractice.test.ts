import { currentPracticePeriod, parseHmMinutes } from '@/session/currentPractice';

/**
 * Local-wall-clock helper: the rule reads `getHours()`/`getMinutes()`, so
 * tests build dates from local components (never ISO strings, which shift
 * across time zones). Every assertion below injects its `now` — none
 * depends on the real clock.
 */
const at = (hour: number, minute = 0): Date => new Date(2026, 8, 15, hour, minute); // 2026-09-15, local

describe('parseHmMinutes', () => {
  it('parses zero-padded and single-digit-hour H:MM/HH:MM times', () => {
    expect(parseHmMinutes('00:00')).toBe(0);
    expect(parseHmMinutes('08:00')).toBe(480);
    expect(parseHmMinutes('7:05')).toBe(425);
    expect(parseHmMinutes('23:59')).toBe(1439);
    expect(parseHmMinutes('21:00')).toBe(1260);
  });

  it('returns null on out-of-range hours or minutes', () => {
    expect(parseHmMinutes('24:00')).toBeNull();
    expect(parseHmMinutes('25:00')).toBeNull();
    expect(parseHmMinutes('08:60')).toBeNull();
    expect(parseHmMinutes('99:99')).toBeNull();
  });

  it('returns null on malformed shapes (strict, no trimming or leniency)', () => {
    expect(parseHmMinutes('')).toBeNull();
    expect(parseHmMinutes('8')).toBeNull();
    expect(parseHmMinutes('08:5')).toBeNull();
    expect(parseHmMinutes('08:00:00')).toBeNull();
    expect(parseHmMinutes('0800')).toBeNull();
    expect(parseHmMinutes('08-00')).toBeNull();
    expect(parseHmMinutes(' 08:00')).toBeNull();
    expect(parseHmMinutes('abc')).toBeNull();
  });

  it('returns null on non-string-shaped input instead of throwing', () => {
    expect(parseHmMinutes(undefined as unknown as string)).toBeNull();
    expect(parseHmMinutes(null as unknown as string)).toBeNull();
    expect(parseHmMinutes(123 as unknown as string)).toBeNull();
  });
});

describe('currentPracticePeriod', () => {
  describe('circular closest-of-two rule with the §7 defaults (08:00/21:00; 2026-09-26 owner decision, packet-12 B2)', () => {
    const morningHm = '08:00';
    const eveningHm = '21:00';

    it("is morning on the day arc nearer the morning alarm", () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(8, 0))).toBe('morning');
      expect(currentPracticePeriod(morningHm, eveningHm, at(14, 29))).toBe('morning');
    });

    it("is evening from the day-arc tie onward", () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(14, 30))).toBe('evening');
      expect(currentPracticePeriod(morningHm, eveningHm, at(21, 0))).toBe('evening');
      expect(currentPracticePeriod(morningHm, eveningHm, at(23, 59))).toBe('evening');
    });
  });

  // The owner's four stated times (packet-12 B2, alarms 08:00/21:00) plus the
  // wraparound boundary: the day circle has TWO tie points — 14:30 (the old
  // same-day midpoint) and 02:30 (its wraparound mirror through midnight).
  // Ties keep the >= convention: evening on both.
  describe('wraparound: closest-of-two across midnight (owner-stated times)', () => {
    const morningHm = '08:00';
    const eveningHm = '21:00';

    it('keeps 2:00 on the evening side (owner: "midnight still the evening")', () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(2, 0))).toBe('evening');
    });

    it('sends 4:00 to morning (owner)', () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(4, 0))).toBe('morning');
    });

    it('sends 10:00 to morning (owner)', () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(10, 0))).toBe('morning');
    });

    it('sends 18:00 to evening (owner)', () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(18, 0))).toBe('evening');
    });

    it('flips at the wraparound tie 02:30: evening at and before it, morning just after', () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(2, 29))).toBe('evening');
      expect(currentPracticePeriod(morningHm, eveningHm, at(2, 30))).toBe('evening'); // tie → evening
      expect(currentPracticePeriod(morningHm, eveningHm, at(2, 31))).toBe('morning');
    });

    it('keeps the day-arc tie 14:30 evening (the >= convention survives)', () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(14, 29))).toBe('morning');
      expect(currentPracticePeriod(morningHm, eveningHm, at(14, 30))).toBe('evening');
    });

    it('keeps midnight itself on the evening side (the arc runs through 0:00)', () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(0, 0))).toBe('evening');
      expect(currentPracticePeriod(morningHm, eveningHm, at(23, 59))).toBe('evening');
    });
  });

  it('honors the injected now: same config, different nows, different periods', () => {
    expect(currentPracticePeriod('06:00', '10:00', at(7, 0))).toBe('morning');
    expect(currentPracticePeriod('06:00', '10:00', at(9, 0))).toBe('evening');
  });

  describe('fallback to the old 17:00 rule on unparseable settings', () => {
    it.each([
      ['garbage', '21:00'],
      ['08:00', ''],
      ['25:00', '21:00'],
      ['08:00', '25:00'],
      ['08:60', '21:00'],
    ])('falls back for malformed input %p/%p', (morning, evening) => {
      expect(currentPracticePeriod(morning, evening, at(16, 59))).toBe('morning');
      expect(currentPracticePeriod(morning, evening, at(17, 0))).toBe('evening');
    });

    it('falls back when a setting is missing (null/undefined)', () => {
      expect(currentPracticePeriod(undefined, '21:00', at(17, 0))).toBe('evening');
      expect(currentPracticePeriod('08:00', null, at(16, 59))).toBe('morning');
      expect(currentPracticePeriod(undefined, undefined, at(17, 0))).toBe('evening');
      expect(currentPracticePeriod(undefined, undefined, at(16, 59))).toBe('morning');
    });
  });

  describe('degenerate wraparound config (morning > evening)', () => {
    // 22:00/02:00 sit 4h apart on the day circle; closest-of-two makes the
    // morning arc the (12:00, 22:00) half and the evening arc everything
    // else, with ties at 12:00 and 0:00 both falling to evening (the >=
    // convention). Deliberately one rule, no midnight special case — the
    // former plain-midpoint pin (11:59 → morning) is superseded by the
    // 2026-09-26 owner decision (packet-12 B2): 11:59 is 5h59m from 02:00
    // but 6h01m from 22:00, so the honest answer is evening.
    it('flips around midday with both ties on the evening side', () => {
      expect(currentPracticePeriod('22:00', '02:00', at(11, 59))).toBe('evening');
      expect(currentPracticePeriod('22:00', '02:00', at(12, 0))).toBe('evening'); // tie
      expect(currentPracticePeriod('22:00', '02:00', at(12, 1))).toBe('morning');
      expect(currentPracticePeriod('22:00', '02:00', at(13, 0))).toBe('morning');
      expect(currentPracticePeriod('22:00', '02:00', at(21, 59))).toBe('morning');
      expect(currentPracticePeriod('22:00', '02:00', at(22, 0))).toBe('morning'); // at the morning alarm
      expect(currentPracticePeriod('22:00', '02:00', at(0, 0))).toBe('evening'); // tie-adjacent arc
    });
  });

  describe('default now (real clock)', () => {
    it('uses the current time when now is omitted', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 8, 15, 14, 30)); // at the default midpoint
      try {
        expect(currentPracticePeriod('08:00', '21:00')).toBe('evening');
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

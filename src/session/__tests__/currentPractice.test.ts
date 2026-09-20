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
  describe('midpoint rule with the §7 defaults (08:00/21:00 → flips at 14:30)', () => {
    const morningHm = '08:00';
    const eveningHm = '21:00';

    it("is morning before the midpoint", () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(0, 0))).toBe('morning');
      expect(currentPracticePeriod(morningHm, eveningHm, at(8, 0))).toBe('morning');
      expect(currentPracticePeriod(morningHm, eveningHm, at(14, 29))).toBe('morning');
    });

    it("is evening at and after the midpoint", () => {
      expect(currentPracticePeriod(morningHm, eveningHm, at(14, 30))).toBe('evening');
      expect(currentPracticePeriod(morningHm, eveningHm, at(21, 0))).toBe('evening');
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
    // 22:00/02:00 → floor((1320 + 120) / 2) = 720 → flips at 12:00: the
    // plain midpoint arithmetic, deliberately with no midnight special case.
    it('flips at midday', () => {
      expect(currentPracticePeriod('22:00', '02:00', at(11, 59))).toBe('morning');
      expect(currentPracticePeriod('22:00', '02:00', at(12, 0))).toBe('evening');
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

import { clampSetting, isValidFixedTimes, isValidHHMM } from '../settingsValidation';

describe('clampSetting', () => {
  it('clamps to the range floor/ceiling', () => {
    expect(clampSetting('endings_per_session', 0)).toBe(6);
    expect(clampSetting('endings_per_session', 999)).toBe(10);
    expect(clampSetting('timer_seconds', 1)).toBe(30);
    expect(clampSetting('timer_seconds', 10000)).toBe(600);
    expect(clampSetting('sessions_per_day', -1)).toBe(0);
    expect(clampSetting('sessions_per_day', 100)).toBe(6);
    expect(clampSetting('stem_timer_seconds', 1)).toBe(20);
    expect(clampSetting('stem_timer_seconds', 999)).toBe(120);
  });

  it('passes through in-range values, rounding to an integer', () => {
    expect(clampSetting('endings_per_session', 8)).toBe(8);
    expect(clampSetting('timer_seconds', 90.6)).toBe(91);
    expect(clampSetting('stem_timer_seconds', 45)).toBe(45);
  });

  it('falls back to the range floor for non-finite input', () => {
    expect(clampSetting('sessions_per_day', NaN)).toBe(0);
  });
});

describe('isValidHHMM', () => {
  it('accepts valid 24h times', () => {
    expect(isValidHHMM('00:00')).toBe(true);
    expect(isValidHHMM('08:00')).toBe(true);
    expect(isValidHHMM('23:59')).toBe(true);
  });

  it('rejects malformed or out-of-range times', () => {
    expect(isValidHHMM('24:00')).toBe(false);
    expect(isValidHHMM('12:60')).toBe(false);
    expect(isValidHHMM('9:00')).toBe(false);
    expect(isValidHHMM('')).toBe(false);
    expect(isValidHHMM('abc')).toBe(false);
  });
});

describe('isValidFixedTimes', () => {
  it('accepts 1 to 4 valid times', () => {
    expect(isValidFixedTimes(['08:00'])).toBe(true);
    expect(isValidFixedTimes(['08:00', '21:00'])).toBe(true);
    expect(isValidFixedTimes(['06:00', '11:00', '16:00', '21:00'])).toBe(true);
  });

  it('rejects empty, more than 4, or any malformed entry', () => {
    expect(isValidFixedTimes([])).toBe(false);
    expect(isValidFixedTimes(['06:00', '10:00', '14:00', '18:00', '22:00'])).toBe(false);
    expect(isValidFixedTimes(['08:00', '25:00'])).toBe(false);
    expect(isValidFixedTimes(['8:00'])).toBe(false);
  });
});

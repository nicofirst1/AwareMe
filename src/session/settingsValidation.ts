/**
 * Range clamps for the numeric settings in spec §7. Pure so the screen and
 * a test can share the same bounds instead of re-typing them.
 */
export const SETTINGS_RANGES = {
  endings_per_session: { min: 6, max: 10 },
  timer_seconds: { min: 30, max: 600 },
  sessions_per_day: { min: 0, max: 6 },
  stem_timer_seconds: { min: 20, max: 120 },
} as const;

export function clampSetting(key: keyof typeof SETTINGS_RANGES, value: number): number {
  const { min, max } = SETTINGS_RANGES[key];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** "HH:MM", 00:00–23:59. Used to validate the notification window fields (§7 `windows`). */
export function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** §7 `notification_fixed_times`: 1-4 valid "HH:MM" times (spec §6.4 fixed mode, 2026-09-11 addition). */
export const FIXED_TIMES_RANGE = { min: 1, max: 4 } as const;

export function isValidFixedTimes(times: readonly string[]): boolean {
  return times.length >= FIXED_TIMES_RANGE.min && times.length <= FIXED_TIMES_RANGE.max && times.every(isValidHHMM);
}

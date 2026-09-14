/**
 * Range clamps for the numeric settings in spec §7. Pure so the screen and
 * a test can share the same bounds instead of re-typing them.
 */
export const SETTINGS_RANGES = {
  endings_per_session: { min: 6, max: 10 },
  timer_seconds: { min: 30, max: 600 },
  stem_timer_seconds: { min: 20, max: 120 },
} as const;

export function clampSetting(key: keyof typeof SETTINGS_RANGES, value: number): number {
  const { min, max } = SETTINGS_RANGES[key];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** "HH:MM", 00:00–23:59. Used to validate `morning_notification_time`/`evening_notification_time` (§7). */
export function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

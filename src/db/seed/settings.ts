/** Default settings, per spec.md §7. Values are JSON-encoded in the settings table. */
export const DEFAULT_SETTINGS: Readonly<Record<string, unknown>> = {
  endings_per_session: 6,
  timer_seconds: 90,
  review_timer_seconds: 180,
  uncensored_mode: true,
  sessions_per_day: 1,
  windows: [{ start: '08:00', end: '21:00' }],
  stem_terminator: '...',
  app_lock_enabled: false,
  weekly_review_prompt: true,
  theme: 'system',
};

/** How notification fire times are chosen (spec §6.4). `random` is the default and only mode the spec's randomness MUST covers; `fixed` is a 2026-09-11 user-directed addition (DECISIONS.md). */
export type NotificationMode = 'random' | 'fixed';

/** The shape of every settings row, decoded. Keys match spec.md §7. */
export interface Settings {
  endings_per_session: number;
  timer_seconds: number;
  review_timer_seconds: number;
  uncensored_mode: boolean;
  sessions_per_day: number;
  windows: { start: string; end: string }[];
  stem_terminator: string;
  app_lock_enabled: boolean;
  weekly_review_prompt: boolean;
  theme: string;
  /** Optional per-stem time limit, off by default; the writing screen doesn't consume it yet. */
  stem_timer_enabled: boolean;
  stem_timer_seconds: number;
  notification_mode: NotificationMode;
  /** Only used when `notification_mode === 'fixed'`; 1-4 "HH:MM" local times. */
  notification_fixed_times: string[];
}

/** Default settings, per spec.md §7. Values are JSON-encoded in the settings table. */
export const DEFAULT_SETTINGS: Readonly<Settings> = {
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
  stem_timer_enabled: false,
  stem_timer_seconds: 60,
  notification_mode: 'random',
  notification_fixed_times: ['08:00', '21:00'],
};

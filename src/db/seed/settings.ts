/** The shape of every settings row, decoded. Keys match spec.md §7, as amended by the morning/evening pivot (migration 0003, DECISIONS.md): two fixed daily notification times replace the random-window/fixed-mode settings. */
export interface Settings {
  endings_per_session: number;
  timer_seconds: number;
  review_timer_seconds: number;
  uncensored_mode: boolean;
  stem_terminator: string;
  app_lock_enabled: boolean;
  weekly_review_prompt: boolean;
  theme: string;
  /** Optional per-stem time limit, off by default; the writing screen doesn't consume it yet. */
  stem_timer_enabled: boolean;
  stem_timer_seconds: number;
  /** Local "HH:MM" fire time for the morning notification. */
  morning_notification_time: string;
  /** Local "HH:MM" fire time for the evening notification. */
  evening_notification_time: string;
}

/** Default settings, per spec.md §7 as amended by the morning/evening pivot. Values are JSON-encoded in the settings table. */
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  endings_per_session: 6,
  timer_seconds: 90,
  review_timer_seconds: 180,
  uncensored_mode: true,
  stem_terminator: '...',
  app_lock_enabled: false,
  weekly_review_prompt: true,
  theme: 'system',
  stem_timer_enabled: false,
  stem_timer_seconds: 60,
  morning_notification_time: '08:00',
  evening_notification_time: '21:00',
};

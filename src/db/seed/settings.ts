/** The shape of every settings row, decoded. Keys match spec.md §7, as amended by the morning/evening pivot (migration 0003, docs/DECISIONS.md): two fixed daily notification times replace the random-window/fixed-mode settings; and by the official-programme amendment (migration 0004, ADR-0005, 2026-09-15): evening-practice toggle, weekly reflection schedule, and the programme-week override. */
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
  /** 2026-09-15 addition (ADR-0005). Gates the evening reflection practice (§6.2) and the evening notification (§6.4). */
  evening_practice_enabled: boolean;
  /** 2026-09-15 addition. Day of the weekly reflection notification (§6.4); any weekday name, lowercase. */
  weekly_meta_day: string;
  /** 2026-09-15 addition. Local "HH:MM" fire time of the weekly reflection notification. */
  weekly_meta_time: string;
  /** 2026-09-15 addition. User-selected current programme week (1–30); null = derive from history (§6.2). Cleared when the selected week's reflection completes. */
  program_week_override: number | null;
}

/** Default settings, per spec.md §7 as amended by the morning/evening pivot and the official-programme amendment (ADR-0005). Values are JSON-encoded in the settings table. */
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  // 7 per owner feedback 2026-09-17 (v13 issue 03): onboarding's default
  // tab and this seed must read the same number (both changed together).
  endings_per_session: 7,
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
  evening_practice_enabled: true,
  weekly_meta_day: 'sunday',
  weekly_meta_time: '21:00',
  program_week_override: null,
};

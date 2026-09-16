/**
 * Notification scheduling (spec §6.4, morning/evening pivot 2026-09-14, see
 * DECISIONS.md and docs/adr/0004; weekly reflection added by the 2026-09-15
 * amendment, ADR-0005). Three repeating local notifications: one daily at
 * `morning_notification_time`, one daily at `evening_notification_time` —
 * the latter ONLY when `evening_practice_enabled` (§7) — and one weekly at
 * `weekly_meta_time` on `weekly_meta_day` (§7, default Sunday 21:00),
 * scheduled via `expo-notifications`' native triggers (`DAILY`,
 * `SchedulableTriggerInputTypes.DAILY`, `{ hour, minute }`; `WEEKLY`,
 * `{ weekday, hour, minute }` with 1 = Sunday). The OS repeats these in
 * local wall-clock time on its own: no fire-time math, no DST handling, no
 * rolling horizon, no 64-notification cap concern (this app only ever has
 * three notifications pending).
 *
 * Fixed identifiers (`MORNING_NOTIFICATION_ID`/`EVENING_NOTIFICATION_ID`/
 * `WEEKLY_NOTIFICATION_ID`) make rescheduling a simple cancel-all-then-
 * recreate rather than a diff against `notification_schedule` — with no
 * per-fire stem draw (§6.2), there is nothing left to pick at schedule
 * time, so that table sees no new writes from this file.
 */

import { getRepository, type TimeOfDay } from '@/db';
import { getNotifications } from './notificationsModule';

export const MORNING_NOTIFICATION_ID = 'six-endings/morning';
export const EVENING_NOTIFICATION_ID = 'six-endings/evening';
export const WEEKLY_NOTIFICATION_ID = 'six-endings/weekly';

/**
 * Neutral copy only (§6.4, unchanged by the amendment): notifications sit on
 * the lock screen, so the body MUST NOT contain stem text or user text.
 * Morning, evening, and the weekly reflection get distinct copy, all three
 * content-free.
 */
export const NOTIFICATION_TITLE = 'Six Endings';
export const MORNING_NOTIFICATION_BODY = 'Time for your morning practice.';
export const EVENING_NOTIFICATION_BODY = 'Time for your evening practice.';
export const WEEKLY_NOTIFICATION_BODY = 'Time for your weekly reflection.';

/** `data.period` marker carried by the weekly notification so a tap can be routed to the weekly reflection route (`/write?origin=weekly`) without naming any stem. */
export const WEEKLY_NOTIFICATION_DATA_PERIOD = 'weekly';

/** §7 `weekly_meta_day`: any weekday name, lowercase. */
export const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

/** expo-notifications' WEEKLY trigger numbers weekdays 1–7 with 1 = Sunday. */
const WEEKDAY_NUMBERS: Record<WeekdayName, number> = {
  sunday: 1,
  monday: 2,
  tuesday: 3,
  wednesday: 4,
  thursday: 5,
  friday: 6,
  saturday: 7,
};

/** An out-of-range/unknown stored day falls back to the §7 default (Sunday) rather than throwing at schedule time. */
function weekdayNumber(day: string): number {
  return WEEKDAY_NUMBERS[day as WeekdayName] ?? WEEKDAY_NUMBERS.sunday;
}

/** Marker carried in the notification's silent `data` payload so a tap can be told apart from other launches, and to say which period fired without naming any stem. */
export const NOTIFICATION_DATA_KIND = 'six-endings/writing-prompt';

/**
 * Requests notification permission with the honest explanation the
 * permission dialog itself provides no room for — spec §6.1 asks for that
 * explanation to live in onboarding copy, not here. Declining leaves
 * everything else in the app working normally (§6.4): this function only
 * ever returns whether it's now allowed, it never nags or re-prompts beyond
 * what iOS/Android themselves allow.
 *
 * Resolves `false` where the native module isn't available at all (Expo
 * Go) — same as "not granted" from this function's point of view.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function hasNotificationPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const status = await Notifications.getPermissionsAsync();
  return status.granted;
}

/**
 * Cancels every OS-scheduled notification outright — the "delete all data"
 * escape hatch (§9) needs this alongside `Repository.deleteAllData()` so a
 * wiped database doesn't leave notifications pending. Since this app only
 * ever schedules the two daily triggers and the one weekly trigger below,
 * an unconditional cancel-everything is equivalent to targeting just their
 * ids and simpler.
 */
export async function cancelAllPendingNotifications(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

function parseHHMM(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':').map(Number);
  return { hour, minute };
}

/**
 * (Re)schedules the fixed notifications from current settings: the daily
 * pair and the weekly reflection. Cancels this app's existing scheduled
 * notifications, then recreates the ones the current settings call for —
 * a plain replace, since there are only ever these three and no per-fire
 * stem to preserve. A no-op if notification permission isn't granted; the
 * caller is responsible for having asked.
 *
 * The evening notification is scheduled ONLY when `evening_practice_enabled`
 * is true (§7, ADR-0005 — it gates the evening reflection sitting §6.2 and
 * the evening notification §6.4 alike): the cancel-all above has already
 * removed a pending one by the time the toggle turns off. The weekly
 * reflection is NOT gated by that toggle — it belongs to the programme
 * (§6.5), not to the evening practice.
 *
 * Call on: app foreground, settings change (a time edited, the evening
 * toggle flipped, the weekly day/time changed), permission grant (§6.4) —
 * `useNotificationScheduler` wires the foreground trigger; the settings
 * screen and the first-run introduction call this after their writes.
 */
export async function rescheduleNotifications(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

  const granted = await hasNotificationPermission();
  await cancelAllPendingNotifications();
  if (!granted) return;

  const settings = getRepository().getSettings();

  const daily: { id: string; time: string; timeOfDay: TimeOfDay; body: string }[] = [
    { id: MORNING_NOTIFICATION_ID, time: settings.morning_notification_time, timeOfDay: 'morning', body: MORNING_NOTIFICATION_BODY },
  ];
  if (settings.evening_practice_enabled) {
    daily.push({
      id: EVENING_NOTIFICATION_ID,
      time: settings.evening_notification_time,
      timeOfDay: 'evening',
      body: EVENING_NOTIFICATION_BODY,
    });
  }

  for (const entry of daily) {
    const { hour, minute } = parseHHMM(entry.time);
    await Notifications.scheduleNotificationAsync({
      identifier: entry.id,
      content: {
        title: NOTIFICATION_TITLE,
        body: entry.body,
        data: { kind: NOTIFICATION_DATA_KIND, timeOfDay: entry.timeOfDay },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }

  const { hour, minute } = parseHHMM(settings.weekly_meta_time);
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_NOTIFICATION_ID,
    content: {
      title: NOTIFICATION_TITLE,
      body: WEEKLY_NOTIFICATION_BODY,
      data: { kind: NOTIFICATION_DATA_KIND, period: WEEKLY_NOTIFICATION_DATA_PERIOD },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: weekdayNumber(settings.weekly_meta_day),
      hour,
      minute,
    },
  });
}

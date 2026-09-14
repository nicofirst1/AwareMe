/**
 * Notification scheduling (spec §6.4, morning/evening pivot 2026-09-14, see
 * DECISIONS.md and docs/adr/0004). Two repeating daily local notifications —
 * one at `morning_notification_time`, one at `evening_notification_time` —
 * scheduled via `expo-notifications`' native `DAILY` trigger
 * (`SchedulableTriggerInputTypes.DAILY`, `{ hour, minute }`). The OS repeats
 * these in local wall-clock time on its own: no fire-time math, no DST
 * handling, no rolling horizon, no 64-notification cap concern (this app
 * only ever has two notifications pending).
 *
 * Fixed identifiers (`MORNING_NOTIFICATION_ID`/`EVENING_NOTIFICATION_ID`)
 * make rescheduling a simple cancel-by-id-then-recreate rather than a diff
 * against `notification_schedule` — with no per-fire stem draw (selection is
 * now "every active stem for the period", §6.2), there is nothing left to
 * pick at schedule time, so that table sees no new writes from this file.
 */

import { getRepository, type TimeOfDay } from '@/db';
import { getNotifications } from './notificationsModule';

export const MORNING_NOTIFICATION_ID = 'six-endings/morning';
export const EVENING_NOTIFICATION_ID = 'six-endings/evening';

/**
 * Neutral copy only (§6.4, unchanged by the pivot): notifications sit on the
 * lock screen, so the body MUST NOT contain stem text or user text. Morning
 * and evening get distinct copy, still both content-free.
 */
export const NOTIFICATION_TITLE = 'Six Endings';
export const MORNING_NOTIFICATION_BODY = 'Time for your morning practice.';
export const EVENING_NOTIFICATION_BODY = 'Time for your evening practice.';

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
 * ever schedules the two daily triggers below, an unconditional
 * cancel-everything is equivalent to targeting just their ids and simpler.
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
 * (Re)schedules the two fixed daily notifications from current settings.
 * Cancels this app's existing scheduled notifications, then recreates both
 * from `morning_notification_time`/`evening_notification_time` — a plain
 * replace, since there are only ever these two and no per-fire stem to
 * preserve. A no-op if notification permission isn't granted; the caller is
 * responsible for having asked.
 *
 * Call on: app foreground, settings change (a time edited), permission
 * grant (§6.4) — `useNotificationScheduler` wires those triggers.
 */
export async function rescheduleNotifications(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

  const granted = await hasNotificationPermission();
  await cancelAllPendingNotifications();
  if (!granted) return;

  const settings = getRepository().getSettings();

  const schedule: { id: string; time: string; timeOfDay: TimeOfDay; body: string }[] = [
    { id: MORNING_NOTIFICATION_ID, time: settings.morning_notification_time, timeOfDay: 'morning', body: MORNING_NOTIFICATION_BODY },
    { id: EVENING_NOTIFICATION_ID, time: settings.evening_notification_time, timeOfDay: 'evening', body: EVENING_NOTIFICATION_BODY },
  ];

  for (const entry of schedule) {
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
}

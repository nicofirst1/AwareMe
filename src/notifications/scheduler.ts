/**
 * Notification scheduling integration (spec §6.4, ticket 10). Thin glue
 * over the pure logic in `scheduling.ts`: reads settings + history from the
 * repository, computes the desired schedule and its diff against what's
 * actually pending, then drives `expo-notifications` and records every
 * scheduled row in `notification_schedule`. No UI, no React — `useNotificationScheduler`
 * (in `useNotifications.ts`) is the hook that calls this at the right times.
 */

import * as Notifications from 'expo-notifications';

import { getRepository } from '@/db';
import { nowEventTime } from '@/db/time';
import { selectStem } from '@/session/stemSelection';
import { diffSchedule, generateFireTimes, type PendingNotification } from './scheduling';

/**
 * Neutral copy only (§6.4): notifications sit on the lock screen, so the
 * body MUST NOT contain stem text or user text. Do not parameterise this
 * with anything drawn from the database.
 */
export const NOTIFICATION_TITLE = 'Six Endings';
export const NOTIFICATION_BODY = 'A sentence is waiting.';

/** Marker carried in the notification's silent `data` payload so a tap can be told apart from other launches. */
export const NOTIFICATION_DATA_KIND = 'six-endings/writing-prompt';

/**
 * Requests notification permission with the honest explanation the
 * permission dialog itself provides no room for — spec §6.1 asks for that
 * explanation to live in onboarding copy (ticket 17), not here. Declining
 * leaves everything else in the app working normally (§6.4): this function
 * only ever returns whether it's now allowed, it never nags or re-prompts
 * beyond what iOS/Android themselves allow.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function hasNotificationPermission(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  return status.granted;
}

/**
 * The full reschedule: recomputes the desired rolling schedule from current
 * settings, diffs it against what's actually still pending, cancels what's
 * superseded, and schedules what's missing — each newly scheduled fire time
 * picks its stem now (via the weighted draw, §6.2) and stores it on the
 * `notification_schedule` row, so a tap later just reads it back rather
 * than drawing again at open time.
 *
 * A no-op if notification permission isn't granted — the caller is
 * responsible for having asked; this function never prompts.
 *
 * Call on: app foreground, settings change, timezone change, permission
 * grant (§6.4) — `useNotificationScheduler` wires those triggers.
 */
export async function rescheduleNotifications(seed: number = Date.now()): Promise<void> {
  const repo = getRepository();
  const granted = await hasNotificationPermission();

  const { at: now } = nowEventTime();
  repo.markPastPendingAsFired(now);

  if (!granted) return;

  const settings = repo.getSettings();
  const desired = generateFireTimes({
    windows: settings.windows,
    sessionsPerDay: settings.sessions_per_day,
    now: new Date(now),
    seed,
  });

  const existingPending: PendingNotification[] = repo
    .listPendingNotifications()
    .map((row) => ({ id: row.id, scheduledFor: new Date(row.scheduled_for) }));

  const diff = diffSchedule(desired, existingPending);

  for (const row of repo.listPendingNotifications()) {
    if (diff.toCancel.includes(row.id)) {
      if (row.os_identifier) await Notifications.cancelScheduledNotificationAsync(row.os_identifier);
    }
  }
  repo.cancelPendingNotifications(diff.toCancel);

  const candidates = repo.listActiveStems();
  const history = repo.getRecentStemUsage();

  for (const fireTime of diff.toCreate) {
    const picked = selectStem(candidates, history, fireTime.toISOString(), Math.floor(Math.random() * 2 ** 31));
    const osIdentifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: NOTIFICATION_TITLE,
        body: NOTIFICATION_BODY,
        data: { kind: NOTIFICATION_DATA_KIND },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireTime,
      },
    });
    repo.insertScheduledNotification({
      scheduledFor: fireTime.toISOString(),
      stemId: picked?.id ?? null,
      osIdentifier,
    });
  }
}

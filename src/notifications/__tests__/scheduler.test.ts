/**
 * Notification scheduling (spec §6.4 as amended 2026-09-15, ADR-0005): the
 * two daily triggers (evening only when `evening_practice_enabled`) plus the
 * weekly reflection trigger (`weekly_meta_time` on `weekly_meta_day` via the
 * native WEEKLY repeat). Runs against a stubbed `expo-notifications` module
 * (via the lazy `notificationsModule` accessor) and a stubbed repository —
 * the assertions are on the exact `identifier`/`content`/`trigger` shapes
 * handed to `scheduleNotificationAsync`.
 */

import { DEFAULT_SETTINGS, type Settings } from '@/db';
import {
  EVENING_NOTIFICATION_ID,
  MORNING_NOTIFICATION_ID,
  WEEKLY_NOTIFICATION_BODY,
  WEEKLY_NOTIFICATION_ID,
  WEEKDAY_NAMES,
  rescheduleNotifications,
} from '@/notifications/scheduler';

const mockSchedule = jest.fn().mockResolvedValue('scheduled');
const mockCancelAll = jest.fn().mockResolvedValue(undefined);
const mockGetPermissions = jest.fn().mockResolvedValue({ granted: true });

let mockSettings: Settings = { ...DEFAULT_SETTINGS };

jest.mock('@/db', () => {
  const actual = jest.requireActual<typeof import('@/db')>('@/db');
  return {
    ...actual,
    getRepository: () => ({
      getSettings: () => ({ ...mockSettings }),
    }),
  };
});

jest.mock('@/notifications/notificationsModule', () => ({
  getNotifications: () => ({
    SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly' },
    scheduleNotificationAsync: (...args: unknown[]) => mockSchedule(...args),
    cancelAllScheduledNotificationsAsync: (...args: unknown[]) => mockCancelAll(...args),
    getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  }),
}));

type ScheduleCall = {
  identifier: string;
  content: { title: string; body: string; data: Record<string, string> };
  trigger: { type: string; weekday?: number; hour: number; minute: number };
};

const scheduledCalls = () => mockSchedule.mock.calls.map((call) => call[0] as ScheduleCall);
const callFor = (id: string) => scheduledCalls().find((call) => call.identifier === id);

describe('rescheduleNotifications', () => {
  beforeEach(() => {
    mockSettings = { ...DEFAULT_SETTINGS };
    mockSchedule.mockClear();
    mockCancelAll.mockClear();
    mockGetPermissions.mockClear().mockResolvedValue({ granted: true });
  });

  it('schedules the two daily notifications and the weekly reflection from default settings', async () => {
    await rescheduleNotifications();

    expect(mockCancelAll).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledTimes(3);

    const morning = callFor(MORNING_NOTIFICATION_ID);
    expect(morning?.content.data).toEqual({ kind: 'awareme/writing-prompt', timeOfDay: 'morning' });
    expect(morning?.trigger).toEqual({ type: 'daily', hour: 8, minute: 0 });

    const evening = callFor(EVENING_NOTIFICATION_ID);
    expect(evening?.content.data).toEqual({ kind: 'awareme/writing-prompt', timeOfDay: 'evening' });
    expect(evening?.trigger).toEqual({ type: 'daily', hour: 21, minute: 0 });

    const weekly = callFor(WEEKLY_NOTIFICATION_ID);
    expect(weekly?.content.body).toBe(WEEKLY_NOTIFICATION_BODY);
    expect(weekly?.content.data).toEqual({ kind: 'awareme/writing-prompt', period: 'weekly' });
    expect(weekly?.trigger).toEqual({ type: 'weekly', weekday: 1, hour: 21, minute: 0 });
  });

  it('schedules the evening notification ONLY when evening_practice_enabled is true (§7)', async () => {
    mockSettings = { ...mockSettings, evening_practice_enabled: false };
    await rescheduleNotifications();

    const ids = scheduledCalls().map((call) => call.identifier);
    expect(ids).toEqual([MORNING_NOTIFICATION_ID, WEEKLY_NOTIFICATION_ID]);
    expect(ids).not.toContain(EVENING_NOTIFICATION_ID);
  });

  it('maps every lowercase weekday name to the native WEEKLY weekday, 1 = Sunday', async () => {
    const expectedNumbers = [1, 2, 3, 4, 5, 6, 7]; // sunday..saturday, expo's WEEKLY convention
    for (const [index, day] of WEEKDAY_NAMES.entries()) {
      mockSchedule.mockClear();
      mockSettings = { ...mockSettings, weekly_meta_day: day };
      await rescheduleNotifications();
      expect(callFor(WEEKLY_NOTIFICATION_ID)?.trigger.weekday).toBe(expectedNumbers[index]);
    }
  });

  it('builds the weekly trigger from weekly_meta_time', async () => {
    mockSettings = { ...mockSettings, weekly_meta_time: '18:45', weekly_meta_day: 'wednesday' };
    await rescheduleNotifications();

    expect(callFor(WEEKLY_NOTIFICATION_ID)?.trigger).toEqual({ type: 'weekly', weekday: 4, hour: 18, minute: 45 });
  });

  it('falls back to the §7 default day (Sunday) if the stored day name is unknown', async () => {
    mockSettings = { ...mockSettings, weekly_meta_day: 'someday' };
    await rescheduleNotifications();

    expect(callFor(WEEKLY_NOTIFICATION_ID)?.trigger.weekday).toBe(1);
  });

  it('keeps every notification body content-free (§6.4 lock-screen privacy)', async () => {
    await rescheduleNotifications();

    for (const call of scheduledCalls()) {
      expect(call.content.body).toMatch(/^Time for your (morning|evening|weekly) (practice|reflection)\.$/);
      // The silent payload carries only fixed markers — never stem or user text.
      for (const value of Object.values(call.content.data)) {
        expect(['awareme/writing-prompt', 'morning', 'evening', 'weekly']).toContain(value);
      }
    }
  });

  it('schedules nothing when notification permission is not granted (but still cancels)', async () => {
    mockGetPermissions.mockResolvedValue({ granted: false });
    await rescheduleNotifications();

    expect(mockCancelAll).toHaveBeenCalledTimes(1);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

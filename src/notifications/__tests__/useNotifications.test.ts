/**
 * Notification tap routing (§6.4): the daily pair routes into that period's
 * practice (/write?timeOfDay=<period>&origin=notification); the weekly
 * reflection notification routes into c02's weekly route contract,
 * /write?origin=weekly, exactly. The listener is pulled out of the hook by
 * capturing what `addNotificationResponseReceivedListener` registers.
 */

import { renderHook } from '@testing-library/react-native';
import type { EventSubscription } from 'expo-modules-core';

import { useNotificationTapRouting } from '@/notifications/useNotifications';
import { NOTIFICATION_DATA_KIND, WEEKLY_NOTIFICATION_DATA_PERIOD } from '@/notifications/scheduler';

const mockPush = jest.fn();
const mockRemove = jest.fn();

let notificationListener: ((response: unknown) => void) | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/notifications/notificationsModule', () => ({
  getNotifications: () => ({
    setNotificationHandler: () => undefined,
    addNotificationResponseReceivedListener: (listener: (response: unknown) => void): EventSubscription => {
      notificationListener = listener;
      return { remove: mockRemove };
    },
  }),
}));

function tap(identifier: string, data: Record<string, string>): void {
  notificationListener?.({ notification: { request: { identifier, content: { data } } } });
}

beforeEach(() => {
  notificationListener = null;
  mockPush.mockClear();
  mockRemove.mockClear();
});

describe('useNotificationTapRouting', () => {
  it('routes a daily notification tap into that period practice with origin=notification', () => {
    renderHook(() => useNotificationTapRouting());

    tap('os-1', { kind: NOTIFICATION_DATA_KIND, timeOfDay: 'morning' });

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/write', params: { timeOfDay: 'morning', origin: 'notification' } });
  });

  it('routes the weekly reflection tap to /write?origin=weekly exactly (c02 contract)', () => {
    renderHook(() => useNotificationTapRouting());

    tap('os-2', { kind: NOTIFICATION_DATA_KIND, period: WEEKLY_NOTIFICATION_DATA_PERIOD });

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/write', params: { origin: 'weekly' } });
  });

  it('ignores taps with a foreign payload kind, and payloads with neither period nor timeOfDay', () => {
    renderHook(() => useNotificationTapRouting());

    tap('os-3', { kind: 'someone-else', timeOfDay: 'morning' });
    tap('os-4', { kind: NOTIFICATION_DATA_KIND });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not route the same OS identifier twice', () => {
    renderHook(() => useNotificationTapRouting());

    tap('os-5', { kind: NOTIFICATION_DATA_KIND, period: WEEKLY_NOTIFICATION_DATA_PERIOD });
    tap('os-5', { kind: NOTIFICATION_DATA_KIND, period: WEEKLY_NOTIFICATION_DATA_PERIOD });

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useNotificationTapRouting());
    unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});

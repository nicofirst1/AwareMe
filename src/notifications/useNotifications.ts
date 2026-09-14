import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import type { TimeOfDay } from '@/db';
import { getNotifications } from './notificationsModule';
import { rescheduleNotifications, NOTIFICATION_DATA_KIND } from './scheduler';

/**
 * Foreground presentation: notification content is already neutral (§6.4),
 * so there's nothing to hide by suppressing the banner while the app is
 * open — showing it is just an honest reflection of "yes, one fired". A
 * no-op where the native module isn't available (Expo Go, SDK 53+).
 */
getNotifications()?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Reconciles the notification schedule (§6.4: "Reschedule on: app
 * foreground, settings change, timezone change, permission grant") — on
 * mount and every time the app returns to the foreground. Does not request
 * permission itself; `requestNotificationPermission` (called from
 * onboarding, ticket 17) is what turns scheduling on in the first place.
 * A no-op, silently, if permission isn't granted.
 */
export function useNotificationScheduler(): void {
  useEffect(() => {
    // Scheduling is a background nicety, not core functionality (spec §9:
    // the app must work fully offline/standalone) — a failure here (e.g. no
    // native module on a bare simulator) must never crash app startup or a
    // foreground transition.
    const safeReschedule = () => {
      rescheduleNotifications().catch((error) => {
        if (__DEV__) console.warn('Notification reschedule failed:', error);
      });
    };
    safeReschedule();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') safeReschedule();
    });
    return () => sub.remove();
  }, []);
}

/**
 * Tapping a notification deep-links straight into that period's writing
 * sitting (§6.4, morning/evening pivot): the tap's silent `data.timeOfDay`
 * payload (not stem or user text — §6.4's lock-screen privacy rule) says
 * which of the two fixed daily notifications fired, and `/write` loads every
 * active stem for that period itself (§6.2). `origin='notification'` on each
 * resulting session comes from the `/write` route params this pushes.
 *
 * Installs nothing where the native module isn't available (Expo Go).
 */
export function useNotificationTapRouting(): void {
  const router = useRouter();
  const handledIds = useRef(new Set<string>());

  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications) return;

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { kind?: string; timeOfDay?: TimeOfDay } | undefined;
      if (data?.kind !== NOTIFICATION_DATA_KIND || !data.timeOfDay) return;

      const osIdentifier = response.notification.request.identifier;
      if (handledIds.current.has(osIdentifier)) return;
      handledIds.current.add(osIdentifier);

      router.push({
        pathname: '/write',
        params: { timeOfDay: data.timeOfDay, origin: 'notification' },
      });
    });
    return () => sub.remove();
  }, [router]);
}

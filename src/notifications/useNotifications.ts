import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import type { TimeOfDay } from '@/db';
import { getNotifications } from './notificationsModule';
import { rescheduleNotifications, NOTIFICATION_DATA_KIND, WEEKLY_NOTIFICATION_DATA_PERIOD } from './scheduler';

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
 * Tapping a notification deep-links into the practice it announced (§6.4):
 * the tap's silent `data` payload (not stem or user text — §6.4's lock-screen
 * privacy rule) says which fired. The two daily notifications carry
 * `timeOfDay` and push `/write?timeOfDay=<period>&origin=notification` —
 * `/write` loads every active stem for that period itself (§6.2). The weekly
 * reflection notification (§6.4 2026-09-15 amendment, ADR-0005) carries
 * `period: 'weekly'` and targets c02's weekly route contract exactly:
 * `/write?origin=weekly` — the route loads the weekly review itself; this
 * payload adds nothing textual.
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
      const data = response.notification.request.content.data as
        | { kind?: string; timeOfDay?: TimeOfDay; period?: string }
        | undefined;
      if (data?.kind !== NOTIFICATION_DATA_KIND) return;

      const osIdentifier = response.notification.request.identifier;
      if (handledIds.current.has(osIdentifier)) return;
      handledIds.current.add(osIdentifier);

      if (data.period === WEEKLY_NOTIFICATION_DATA_PERIOD) {
        router.push({ pathname: '/write', params: { origin: 'weekly' } });
        return;
      }

      if (!data.timeOfDay) return;
      router.push({
        pathname: '/write',
        params: { timeOfDay: data.timeOfDay, origin: 'notification' },
      });
    });
    return () => sub.remove();
  }, [router]);
}

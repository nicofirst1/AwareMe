import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getRepository } from '@/db';
import { rescheduleNotifications, NOTIFICATION_DATA_KIND } from './scheduler';

/**
 * Foreground presentation: notification content is already neutral (§6.4),
 * so there's nothing to hide by suppressing the banner while the app is
 * open — showing it is just an honest reflection of "yes, one fired".
 */
Notifications.setNotificationHandler({
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
 * Tapping a notification deep-links straight into a writing session on the
 * stem chosen for it at schedule time (§6.4, §6.2) — read back from
 * `notification_schedule` by the OS identifier the tap response carries,
 * never re-drawn at tap time. `origin='notification'` on the resulting
 * session comes from the `/write` route params this pushes.
 */
export function useNotificationTapRouting(): void {
  const router = useRouter();
  const handledIds = useRef(new Set<string>());

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.kind !== NOTIFICATION_DATA_KIND) return;

      const osIdentifier = response.notification.request.identifier;
      if (handledIds.current.has(osIdentifier)) return;
      handledIds.current.add(osIdentifier);

      const repo = getRepository();
      const row = repo.getNotificationByOsIdentifier(osIdentifier);
      if (!row?.stem_id) return; // nothing to open on — no stem was available when this fired

      router.push({
        pathname: '/write',
        params: {
          stemId: row.stem_id,
          origin: 'notification',
          notificationId: row.id,
          notifiedAt: row.scheduled_for,
        },
      });
    });
    return () => sub.remove();
  }, [router]);
}

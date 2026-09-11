/**
 * Lazy, cached accessor for `expo-notifications`. Expo Go on Android/SDK 53+
 * throws at import time (remote-notifications support was pulled from Expo
 * Go — a dev build is required), and since that import used to sit at the
 * top of `useNotifications.ts`, the throw killed evaluation of every route
 * module that transitively pulled it in, which took the whole router down.
 *
 * ponytail: `require` inside try/catch instead of a real optional-dependency
 * abstraction — one function, cached module-or-null, no interface needed for
 * a single caller shape. Callers treat `null` as "no native module here"
 * and no-op accordingly.
 */

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

export function getNotifications(): NotificationsModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('expo-notifications') as NotificationsModule;
    } catch (error) {
      if (__DEV__) console.warn('expo-notifications unavailable (likely Expo Go):', error);
      cached = null;
    }
  }
  return cached;
}

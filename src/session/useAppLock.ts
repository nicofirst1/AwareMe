import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getRepository } from '@/db';
import { nextLockState } from './appLock';

export type AppLockStatus =
  | { checking: true }
  | { checking: false; locked: false }
  | { checking: false; locked: true; authenticate: () => Promise<void> };

/**
 * App lock (spec §9, §7 `app_lock_enabled`, ticket 18). Thin glue over the
 * pure `nextLockState`: reads the setting and enrollment status from the
 * real world, tracks cold start / background-duration via `AppState`, and
 * calls `expo-local-authentication`'s system prompt to clear the lock.
 *
 * Graceful fallback (ticket 18: "never lock the user out of their data"):
 * if no biometric or device passcode is enrolled, the app never locks at
 * all, regardless of the setting — there would be no way to unlock it.
 */
export function useAppLock(): AppLockStatus {
  const [checking, setChecking] = useState(true);
  const [locked, setLocked] = useState(false);
  // A ref, not state: the AppState listener below is registered once and
  // must always read the current value, not the one closed over at mount.
  const canLock = useRef(false);
  const backgroundedAtMs = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const enabled = getRepository().getSettings().app_lock_enabled;
      // hasHardwareAsync + isEnrolledAsync, not getEnrolledLevelAsync alone:
      // a device with no scanner at all still resolves isEnrolledAsync()
      // false, but checking hardware explicitly documents intent and
      // matches expo-local-authentication's own recommended pattern.
      const enrolled = enabled && (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      if (cancelled) return;

      canLock.current = enrolled;
      setLocked(nextLockState(enrolled, false, { type: 'cold_start' }));
      setChecking(false);
    })();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        backgroundedAtMs.current = Date.now();
        return;
      }
      if (next === 'active' && backgroundedAtMs.current !== null) {
        const bgAt = backgroundedAtMs.current;
        backgroundedAtMs.current = null;
        setLocked((was) =>
          nextLockState(canLock.current, was, { type: 'foreground', backgroundedAtMs: bgAt, nowMs: Date.now() }),
        );
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const authenticate = async () => {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock AwareMe' });
    if (result.success) {
      setLocked(nextLockState(canLock.current, true, { type: 'authenticated' }));
    }
  };

  if (checking) return { checking: true };
  if (!locked) return { checking: false, locked: false };
  return { checking: false, locked: true, authenticate };
}

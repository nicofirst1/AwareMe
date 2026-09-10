/**
 * Pure app-lock state (spec §9, §7 `app_lock_enabled`, ticket 18). No
 * `expo-local-authentication`, no `AppState`, no wall clock here — the hook
 * in `src/session/useAppLock.ts` is the thin glue that supplies these from
 * the real clock and native module, so the actual lock decision is
 * reproducible and unit-testable without a device.
 */

/** Foreground-after-background only re-locks past this absence, per §9/ticket 18. */
export const FOREGROUND_LOCK_THRESHOLD_MS = 60 * 1000;

export type AppLockEvent =
  | { type: 'cold_start' }
  | { type: 'foreground'; backgroundedAtMs: number; nowMs: number }
  | { type: 'authenticated' };

/**
 * Whether the app should be locked (showing the lock screen, blocking the
 * rest of the UI) after `event`, given whether the setting is on and the
 * previous locked state. Cold start always locks when enabled — there is no
 * "previous state" to trust after a fresh process launch. Foregrounding
 * only locks if the app was backgrounded for at least
 * `FOREGROUND_LOCK_THRESHOLD_MS` (§9: "applied ... on foreground after 60
 * seconds") — a brief switch to another app (e.g. copying a code from
 * Messages) doesn't re-lock. `authenticated` always unlocks; it's the only
 * event that can.
 */
export function nextLockState(enabled: boolean, wasLocked: boolean, event: AppLockEvent): boolean {
  if (!enabled) return false;

  switch (event.type) {
    case 'cold_start':
      return true;
    case 'foreground':
      return wasLocked || event.nowMs - event.backgroundedAtMs >= FOREGROUND_LOCK_THRESHOLD_MS;
    case 'authenticated':
      return false;
  }
}

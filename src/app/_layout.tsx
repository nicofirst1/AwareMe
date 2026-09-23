import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { LockScreen } from '@/components/lock-screen';
import { AppStatusBar } from '@/components/app-status-bar';
import { getRepository } from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotificationScheduler, useNotificationTapRouting } from '@/notifications/useNotifications';
import { useAppLock } from '@/session/useAppLock';

/**
 * Gates every route behind the first-run flow, in two stages, except the
 * stage's own route. Stage 1: the five-tab onboarding (§6.1, ticket 17:
 * "shown once") — the fresh install's whole first-run flow, with the
 * evening-practice question folded in as tab 4 (v13 issue 03: asked
 * "towards the end, not before the actual intro"; footer Skip and Done
 * mark the intro marker too, so an early exit never loops the question
 * back). Stage 2: the standalone evening-practice card (/intro) — reachable
 * only when onboarding is already complete but the question was never
 * asked, which is exactly the upgrader case (they carry
 * `onboarding_completed` from v1 but have never been asked; asked exactly
 * once, via the card's own marker exits).
 *
 * Lives in the root layout, not `index.tsx`, because `index.test.tsx` is a
 * bare `render(<HomeScreen />)` with no navigation context — touching
 * `@/db`/`expo-sqlite` or `useRouter` from that screen at render time would
 * break it (see docs/DECISIONS.md's ticket-06 and ticket-13 entries for the same
 * constraint on other screens). The root layout is never rendered by that
 * test, so the check is safe here.
 */
function useFirstRunGate(): void {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const repo = getRepository();
    if (!repo.isOnboardingComplete()) {
      if (segments[0] !== 'onboarding') router.replace('/onboarding');
      return;
    }
    if (!repo.isIntroComplete()) {
      if (segments[0] !== 'intro') router.replace('/intro');
    }
  }, [router, segments]);
}

export default function RootLayout() {
  // The app-wide hook (not react-native's) so the root navigation theme follows the stored §7 `theme` setting, not just the OS scheme (theme fix, 2026-09-16 owner feedback; FLAG-ANSWER approved swap).
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  useNotificationScheduler();
  useNotificationTapRouting();
  useFirstRunGate();
  const lock = useAppLock();

  return (
    <ThemeProvider value={theme}>
      {/* One root-owned status bar: dark content on the light theme's cream
          surfaces, light content on dark (ticket t1, packet-3). */}
      <AppStatusBar />
      {lock.checking ? null : lock.locked ? <LockScreen onUnlock={lock.authenticate} /> : <Stack screenOptions={{ headerShown: false }} />}
    </ThemeProvider>
  );
}

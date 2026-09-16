import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { LockScreen } from '@/components/lock-screen';
import { getRepository } from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotificationScheduler, useNotificationTapRouting } from '@/notifications/useNotifications';
import { useAppLock } from '@/session/useAppLock';

/**
 * Gates every route behind the first-run flow, in two stages, except the
 * stage's own route. Stage 1: the one-question introduction (§7, ADR-0005:
 * evening practice "asked once at first launch") — before anything else, on
 * every launch until answered; upgraders included, since they carry
 * `onboarding_completed` from v1 but have never been asked (exactly why the
 * gate keys on the intro marker, not on onboarding). Stage 2: the existing
 * 4-step onboarding (§6.1, ticket 17: "shown once").
 *
 * Lives in the root layout, not `index.tsx`, because `index.test.tsx` is a
 * bare `render(<HomeScreen />)` with no navigation context — touching
 * `@/db`/`expo-sqlite` or `useRouter` from that screen at render time would
 * break it (see DECISIONS.md's ticket-06 and ticket-13 entries for the same
 * constraint on other screens). The root layout is never rendered by that
 * test, so the check is safe here.
 */
function useFirstRunGate(): void {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const repo = getRepository();
    if (!repo.isIntroComplete()) {
      if (segments[0] !== 'intro') router.replace('/intro');
      return;
    }
    const onOnboardingRoute = segments[0] === 'onboarding';
    if (!repo.isOnboardingComplete() && !onOnboardingRoute) {
      router.replace('/onboarding');
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
      {lock.checking ? null : lock.locked ? <LockScreen onUnlock={lock.authenticate} /> : <Stack screenOptions={{ headerShown: false }} />}
    </ThemeProvider>
  );
}

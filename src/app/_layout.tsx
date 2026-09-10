import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { getRepository } from '@/db';
import { useNotificationScheduler, useNotificationTapRouting } from '@/notifications/useNotifications';

/**
 * Gates every route behind onboarding (§6.1, ticket 17: "shown once")
 * except `/onboarding` itself. Lives in the root layout, not `index.tsx`,
 * because `index.test.tsx` is a bare `render(<HomeScreen />)` with no
 * navigation context — touching `@/db`/`expo-sqlite` or `useRouter` from
 * that screen at render time would break it (see DECISIONS.md's ticket-06
 * and ticket-13 entries for the same constraint on other screens). The
 * root layout is never rendered by that test, so the check is safe here.
 */
function useOnboardingGate(): void {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const onOnboardingRoute = segments[0] === 'onboarding';
    const complete = getRepository().isOnboardingComplete();
    if (!complete && !onOnboardingRoute) {
      router.replace('/onboarding');
    }
  }, [router, segments]);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useNotificationScheduler();
  useNotificationTapRouting();
  useOnboardingGate();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

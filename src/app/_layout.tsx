import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useNotificationScheduler, useNotificationTapRouting } from '@/notifications/useNotifications';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useNotificationScheduler();
  useNotificationTapRouting();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

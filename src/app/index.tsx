import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Six Endings</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          A quiet place to finish a sentence.
        </ThemedText>
        {__DEV__ && (
          <Link href="/debug">
            <ThemedText type="small" themeColor="textSecondary">
              Debug: dump all tables
            </ThemedText>
          </Link>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignSelf: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
  },
});

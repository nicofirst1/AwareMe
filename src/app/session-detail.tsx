import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, MinTouchTarget, Spacing } from '@/constants/theme';
import { EndingRow, getRepository, SessionRow } from '@/db';
import { nowEventTime } from '@/db/time';

/**
 * Session detail (§6.7): every ending in the session with its timing, and
 * the option to soft-delete the whole session. No evaluation UI — endings
 * are shown plainly, in the order they were written, with no scoring or
 * commentary (§13.6).
 */
export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<{ session: SessionRow; endings: EndingRow[] } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setDetail(getRepository().getSessionDetail(id));
    }, [id]),
  );

  if (!detail) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <BackHeader style={styles.backHeader} />
          <ThemedText type="default" themeColor="textSecondary" style={styles.notFound}>
            Session not found.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const { session, endings } = detail;

  const confirmDelete = () => {
    Alert.alert(
      'Delete this session?',
      'This session will no longer appear in your history. It is not erased — it stays in your data and in any export, marked as deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const { at } = nowEventTime();
            getRepository().softDeleteSession(session.id, at);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BackHeader style={styles.backHeader} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="stem">{session.stem_text_snapshot}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDateTime(session.started_at)}
            {session.end_reason ? ` · ${session.end_reason}` : ''}
          </ThemedText>

          <ThemedView style={styles.endingList}>
            {endings.map((e) => (
              <Card key={e.id} style={styles.endingRow}>
                <ThemedText type="stem">{e.text || '(nothing written)'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatTime(e.started_at)}
                  {e.submitted_at ? ` – ${formatTime(e.submitted_at)}` : ''} · {e.backspace_count} backspace
                  {e.backspace_count === 1 ? '' : 's'}
                </ThemedText>
              </Card>
            ))}
          </ThemedView>

          <Pressable onPress={confirmDelete} style={styles.deleteLink} accessibilityRole="button" hitSlop={12}>
            <ThemedText type="small" themeColor="textSecondary">
              Delete this session
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  backHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  notFound: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  endingList: {
    gap: Spacing.two,
  },
  endingRow: {
    gap: Spacing.half,
  },
  deleteLink: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
});

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { BadgeCard } from '@/components/badge-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { nowEventTime } from '@/db/time';
import { BADGES, computeEarnedBadgeIds, type BadgeId } from '@/session/badges';
import { computeProgressStats, type ProgressStats } from '@/session/progressStats';

interface ProgressData {
  earned: ReadonlySet<BadgeId>;
  stats: ProgressStats;
}

/** Everything here is read at focus time from existing rows — no derived value is ever stored (§13.7). */
function loadProgress(): ProgressData {
  const repo = getRepository();
  const sessions = repo.listSessionsForStats();
  const hasReview = repo.getLastReviewAt() !== null;
  const hasUserStem = repo.listAllStems().some((s) => s.origin === 'user' && s.deleted_at === null);
  const { at, offsetMin } = nowEventTime();

  return {
    earned: computeEarnedBadgeIds({ sessions, hasReview, hasUserStem }),
    stats: computeProgressStats(sessions, at, offsetMin),
  };
}

/**
 * Progress (gamification proposal §1.C/§3 cycle 3): the badge grid,
 * browsable any time, plus a quiet stats block — never pushed at the user,
 * reached only via Home's "Progress" tile. All 11 badges always render;
 * unearned ones stay visible (dimmed, per `BadgeCard`) rather than hidden,
 * so this reads as "not yet" and never as a checklist of failures (§13.4).
 * No numeric "N/11 badges" counter, per the proposal's evaluation-free
 * posture — the grid itself is the only tally.
 */
export default function ProgressScreen() {
  const [data, setData] = useState<ProgressData | null>(null);

  // Focus-based, not mount-only (2026-09-11 visual-test finding, same fix
  // as Home): a badge or a streak earned by a session just completed
  // elsewhere must show up on return here, not only on the app's first mount.
  useFocusEffect(
    useCallback(() => {
      try {
        setData(loadProgress());
      } catch {
        setData(null);
      }
    }, []),
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BackHeader style={styles.backHeader} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">Progress</ThemedText>

          {data && (
            <ThemedView style={styles.statsBlock}>
              <StatLine label="Sessions" value={data.stats.totalSessions} />
              <StatLine label="Endings" value={data.stats.totalEndings} />
              <StatLine label="Stems written on" value={data.stats.distinctStemsUsed} />
              <StatLine label="Longest streak" value={`${data.stats.longestStreak} day${data.stats.longestStreak === 1 ? '' : 's'}`} />
              {data.stats.currentStreak >= 3 && (
                <StatLine label="Current streak" value={`${data.stats.currentStreak} days`} />
              )}
            </ThemedView>
          )}

          <ThemedView style={styles.grid}>
            {BADGES.map((badge) => (
              <ThemedView key={badge.id} style={styles.gridItem}>
                <BadgeCard badge={badge} earned={data?.earned.has(badge.id) ?? false} />
              </ThemedView>
            ))}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <ThemedView style={styles.statLine}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default" themeColor="accent">
        {value}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  backHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  statsBlock: {
    gap: Spacing.one,
  },
  statLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  gridItem: {
    minWidth: '46%',
    flexGrow: 1,
  },
});

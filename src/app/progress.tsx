import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BadgeCard } from '@/components/badge-card';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
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
 *
 * Layout round 2026-09-15 (cycle 6, findings P1/P2; LC2/LC3/LC6/LC7):
 * `ScreenHeader` replaces the old BackHeader+title pair; the stats block and
 * the badge grid get `SectionHeader` eyebrows naming the screen's two
 * sections ("Totals" — the audit's suggested "This week" doesn't fit
 * all-time counts; "Badges"); stat values move from body-size `default` 16
 * to the `subtitle` role — LC6 assigns `subtitle` to stat values and keeps
 * `title` for ScreenHeader titles only — with the label as the dim element
 * and the values' existing `accent` color untouched (the color rounds'
 * work, P1). Copy stays descriptive (§13.4/§13.6): no counters, no
 * evaluation, absence never called out.
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
        <ScreenHeader title="Progress" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {data && (
            <ThemedView style={styles.statsBlock}>
              <SectionHeader label="Totals" />
              <StatLine label="Sessions" value={data.stats.totalSessions} />
              <StatLine label="Endings" value={data.stats.totalEndings} />
              <StatLine label="Stems written on" value={data.stats.distinctStemsUsed} />
              <StatLine label="Longest streak" value={`${data.stats.longestStreak} day${data.stats.longestStreak === 1 ? '' : 's'}`} />
              {data.stats.currentStreak >= 3 && (
                <StatLine label="Current streak" value={`${data.stats.currentStreak} days`} />
              )}
            </ThemedView>
          )}

          <ThemedView style={styles.badgesBlock}>
            <SectionHeader label="Badges" />
            <ThemedView style={styles.grid}>
              {BADGES.map((badge) => (
                <ThemedView key={badge.id} style={styles.gridItem}>
                  <BadgeCard badge={badge} earned={data?.earned.has(badge.id) ?? false} />
                </ThemedView>
              ))}
            </ThemedView>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * One stat row: dim `small` label left, confident `subtitle` (20/600)
 * value right (layout audit 2026-09-15, P1 — values were body-size 16).
 * Baseline-aligned so the 14pt label and the 20pt value share a text line.
 */
function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <ThemedView style={styles.statLine}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle" themeColor="accent">
        {value}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  // Section internals at the row gap (LC3): eyebrow, then stat rows /
  // badge grid 8pt apart. (Was a 4pt-pitch label:value list with no
  // section headers — P2.)
  statsBlock: {
    gap: Spacing.two,
  },
  badgesBlock: {
    gap: Spacing.two,
  },
  statLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
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

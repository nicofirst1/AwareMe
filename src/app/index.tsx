import { Ionicons } from '@expo/vector-icons';
import { useRouter, Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { getRepository } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { isWeeklyReviewDue } from '@/session/reviewPeriod';
import { selectStem } from '@/session/stemSelection';

/**
 * Picks a stem by the weighted rotation (§6.2) and navigates straight to
 * the writing session on it — "start now". Selection itself is the pure
 * `selectStem`; this is just the glue that supplies its (candidates,
 * history, now, seed) from the repository and the clock.
 */
function pickStemNow(): { id: string; text: string } | null {
  const repo = getRepository();
  const candidates = repo.listActiveStems();
  const history = repo.getRecentStemUsage();
  const picked = selectStem(candidates, history, new Date().toISOString(), Date.now());
  if (!picked) return null;
  const full = candidates.find((s) => s.id === picked.id);
  return full ? { id: full.id, text: full.text } : null;
}

interface HomeStatus {
  /** "N sessions this week" — omitted (not "0 sessions") when there are none: absence is never called out (§13.4/§13.6). */
  weekCount: number;
  /** Review is worth surfacing only when there's something to re-read and a week has passed since the last one. */
  reviewAvailable: boolean;
}

/** Everything here is read at render time from existing rows — no derived value is ever stored (§13.7). */
function loadHomeStatus(): HomeStatus {
  const repo = getRepository();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = repo.listSessionsForHistory({ dateFrom: weekAgo });
  const wasDue = isWeeklyReviewDue(repo.getLastReviewAt(), now.toISOString());
  return { weekCount: recent.length, reviewAvailable: wasDue && recent.length > 0 };
}

// Ionicons outline glyphs (2026-09-11, ui-audit-2026-09-11.md cycle 2) — a
// small scan anchor per tile so the six destinations aren't an undifferentiated
// wall of text (audit's index.tsx finding). Decorative only: each tile's
// accessible name still comes from its label text, not the icon.
const SECONDARY_LINKS = [
  { href: '/stems', label: 'Stems', icon: 'leaf-outline' },
  { href: '/history', label: 'History', icon: 'time-outline' },
  { href: '/review', label: 'Review', icon: 'glasses-outline' },
  { href: '/settings', label: 'Settings', icon: 'options-outline' },
  { href: '/export', label: 'Export', icon: 'share-outline' },
  { href: '/import', label: 'Import', icon: 'download-outline' },
] as const satisfies readonly { href: `/${string}`; label: string; icon: keyof typeof Ionicons.glyphMap }[];

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [status, setStatus] = useState<HomeStatus | null>(null);

  useEffect(() => {
    // A status line is a nicety, not a requirement — if it can't be read
    // (e.g. no DB available), show nothing rather than crash the home
    // screen or say something alarming (§13.4).
    try {
      setStatus(loadHomeStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  const startNow = () => {
    const stem = pickStemNow();
    if (!stem) return; // no stems at all — nothing to start
    router.push({ pathname: '/write', params: { stemId: stem.id } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.content}>
          <ThemedView style={styles.header}>
            <ThemedText type="title">Six Endings</ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              A quiet place to finish a sentence.
            </ThemedText>
          </ThemedView>

          <Button label="Start writing" onPress={startNow} variant="primary" style={styles.primaryButton} />

          {status && (status.weekCount > 0 || status.reviewAvailable) && (
            <ThemedView style={styles.statusBlock}>
              {status.weekCount > 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  {status.weekCount === 1 ? '1 session this week' : `${status.weekCount} sessions this week`}
                </ThemedText>
              )}
              {status.reviewAvailable && (
                <Link href="/review" style={styles.reviewLink}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Review available
                  </ThemedText>
                </Link>
              )}
            </ThemedView>
          )}

          <ThemedView style={styles.grid}>
            {SECONDARY_LINKS.map(({ href, label, icon }) => (
              <Link key={href} href={href} style={[styles.tile, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name={icon} size={20} color={theme.textSecondary} />
                <ThemedText type="default">{label}</ThemedText>
              </Link>
            ))}
          </ThemedView>

          {__DEV__ && (
            <Link href="/debug" style={styles.navLink}>
              <ThemedText type="small" themeColor="textSecondary">
                Debug: dump all tables
              </ThemedText>
            </Link>
          )}
        </ThemedView>
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
  },
  content: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    alignSelf: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  header: {
    gap: Spacing.one,
    alignItems: 'center',
  },
  primaryButton: {
    minHeight: MinTouchTarget * 1.3,
    width: '100%',
  },
  statusBlock: {
    gap: Spacing.half,
    alignItems: 'center',
  },
  reviewLink: {
    minHeight: MinTouchTarget,
    textAlignVertical: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  tile: {
    minHeight: MinTouchTarget,
    minWidth: '30%',
    flexGrow: 1,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  navLink: {
    minHeight: MinTouchTarget,
    textAlignVertical: 'center',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  CategoryColors,
  CelebrationColors,
  MaxContentWidth,
  MinTouchTarget,
  Radius,
  Spacing,
} from '@/constants/theme';
import { getRepository } from '@/db';
import { nowEventTime } from '@/db/time';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { computeStreaks } from '@/session/progressStats';
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
  /** Current consecutive-day streak — shown only at 3+ (gamification proposal §1.B), same quiet treatment as the lines above. */
  currentStreak: number;
}

/** Everything here is read at render time from existing rows — no derived value is ever stored (§13.7). */
function loadHomeStatus(): HomeStatus {
  const repo = getRepository();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = repo.listSessionsForHistory({ dateFrom: weekAgo });
  const wasDue = isWeeklyReviewDue(repo.getLastReviewAt(), now.toISOString());
  const { at, offsetMin } = nowEventTime(now);
  const { current } = computeStreaks(repo.listSessionsForStats(), at, offsetMin);
  return { weekCount: recent.length, reviewAvailable: wasDue && recent.length > 0, currentStreak: current };
}

// Ionicons outline glyphs (2026-09-11, ui-audit-2026-09-11.md cycle 2) — a
// small scan anchor per tile so the destinations aren't an undifferentiated
// wall of text (audit's index.tsx finding). Decorative only: each tile's
// accessible name still comes from its label text, not the icon.
//
// Per-tile hue (color-audit-2026-09-11.md §2A, "distribution not invention"
// — every hue below already exists in theme.ts, none new). One sentence of
// rationale each, no repeats across the eight tiles:
// - Stems: responsibility — tending your own raw material is an act of upkeep.
// - History: awareness — looking back at what you wrote is awareness turned backward.
// - Review: self_acceptance — rereading your own words unedited is self-acceptance in practice.
// - Progress: CelebrationColors.glow — the app's one sanctioned celebration hue, reserved for its one celebration screen.
// - Settings: integrity — configuring the app to match how you actually want it to behave is integrity's "align the system with the self".
// - Export: assertiveness — carrying your data out into the world is an assertive act.
// - Import: purpose — bringing a backup back in serves the continuity of why you're keeping this record at all.
// - About: accent — the same hue as the primary CTA, since this tile is about the app itself, not a category of writing.
const SECONDARY_LINKS = [
  { href: '/stems', label: 'Stems', icon: 'leaf-outline', color: CategoryColors.responsibility.light.text, colorDark: CategoryColors.responsibility.dark.text },
  { href: '/history', label: 'History', icon: 'time-outline', color: CategoryColors.awareness.light.text, colorDark: CategoryColors.awareness.dark.text },
  { href: '/review', label: 'Review', icon: 'glasses-outline', color: CategoryColors.self_acceptance.light.text, colorDark: CategoryColors.self_acceptance.dark.text },
  { href: '/progress', label: 'Progress', icon: 'trophy-outline', color: CelebrationColors.glow, colorDark: CelebrationColors.glow },
  { href: '/settings', label: 'Settings', icon: 'options-outline', color: CategoryColors.integrity.light.text, colorDark: CategoryColors.integrity.dark.text },
  { href: '/export', label: 'Export', icon: 'share-outline', color: CategoryColors.assertiveness.light.text, colorDark: CategoryColors.assertiveness.dark.text },
  { href: '/import', label: 'Import', icon: 'download-outline', color: CategoryColors.purpose.light.text, colorDark: CategoryColors.purpose.dark.text },
  { href: '/about', label: 'About', icon: 'information-circle-outline', color: 'accent', colorDark: 'accent' },
] as const satisfies readonly {
  href: `/${string}`;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  colorDark: string;
}[];

/** Resolves a `SECONDARY_LINKS` color entry for the current theme — either an
 * already-per-theme hex (category `.text`, or `CelebrationColors.glow`
 * repeated on both sides since it's theme-invariant) or the literal
 * `'accent'` sentinel meaning "read `theme.accent`" (About's tile). */
function resolveTileColor(color: string, accent: string): string {
  return color === 'accent' ? accent : color;
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const scheme = useColorScheme();
  const resolvedScheme = scheme === 'dark' ? 'dark' : 'light';
  const [status, setStatus] = useState<HomeStatus | null>(null);

  // Focus-based, not mount-only (2026-09-11 visual-test finding: completing
  // a session and navigating back here left the status block stale, since
  // a plain `useEffect` only ran once on first mount). `useFocusEffect`
  // calls `useNavigation()` internally, which throws outside a real
  // navigation tree — `index.test.tsx` mocks it to run once on mount
  // instead (same pattern `stems.test.tsx` already uses), so a bare
  // `render(<HomeScreen />)` still exercises this without a NavigationContainer.
  useFocusEffect(
    useCallback(() => {
      // A status line is a nicety, not a requirement — if it can't be read
      // (e.g. no DB available), show nothing rather than crash the home
      // screen or say something alarming (§13.4).
      try {
        setStatus(loadHomeStatus());
      } catch {
        setStatus(null);
      }
    }, []),
  );

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

          {status && (status.weekCount > 0 || status.reviewAvailable || status.currentStreak >= 3) && (
            <ThemedView style={styles.statusBlock}>
              {status.weekCount > 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  {status.weekCount === 1 ? '1 session this week' : `${status.weekCount} sessions this week`}
                </ThemedText>
              )}
              {/* Descriptive only, never bold/colored/badged (§13.4/§13.6 as
                  amended) — shown at 3+ so "1 day in a row" never reads as a
                  demand (gamification proposal §1.B). */}
              {status.currentStreak >= 3 && (
                <ThemedText type="small" themeColor="textSecondary">
                  {status.currentStreak} days in a row
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
            {SECONDARY_LINKS.map(({ href, label, icon, color, colorDark }) => (
              <Link
                key={href}
                href={href}
                style={[
                  styles.tile,
                  { backgroundColor: label === 'Progress' ? theme.accentMuted : theme.backgroundElement },
                ]}
              >
                <Ionicons
                  name={icon}
                  size={20}
                  color={resolveTileColor(resolvedScheme === 'dark' ? colorDark : color, theme.accent)}
                />
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

          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.footer}
            onPress={() => Linking.openURL('https://nicolobrandizzi.com/')}
            accessibilityRole="link"
          >
            Created by Nicolò Brandizzi
          </ThemedText>
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
  footer: {
    textAlign: 'center',
    minHeight: MinTouchTarget,
    textAlignVertical: 'center',
  },
});

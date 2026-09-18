import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CREATOR_SITE_URL, withAppTag } from '@/constants/links';
import {
  CategoryColors,
  CelebrationColors,
  MaxContentWidth,
  MinTouchTarget,
  Radius,
  Spacing,
} from '@/constants/theme';
import { getRepository, type TimeOfDay } from '@/db';
import { nowEventTime } from '@/db/time';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { currentSittingPeriod } from '@/session/currentSitting';
import { computeStreaks } from '@/session/progressStats';
import { readHomeProgrammeStatus, type HomeProgrammeStatus } from '@/session/programRead';
import { isWeeklyReviewDue } from '@/session/reviewPeriod';

/**
 * The render path's own period read (issue 03, owner decision 2026-09-15):
 * the highlighted sitting flips at the midpoint between the user's two
 * configured notification times (`currentSitting.ts`), not at a hardcoded
 * 17:00. Unlike `loadHomeStatus` this call is not behind the focus-effect
 * try/catch, so it guards the settings read itself — settings unreadable
 * (e.g. no DB in tests) must not crash the home screen (§13.4: a status
 * nicety never blocks the screen); the fallback is the module's own
 * hardcoded-17:00 rule via `currentSittingPeriod(undefined, undefined)`.
 */
function currentPeriodForRender(): TimeOfDay {
  try {
    const settings = getRepository().getSettings();
    return currentSittingPeriod(settings.morning_notification_time, settings.evening_notification_time);
  } catch {
    return currentSittingPeriod(undefined, undefined);
  }
}

interface HomeStatus extends HomeProgrammeStatus {
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
  return {
    ...readHomeProgrammeStatus(repo, now),
    weekCount: recent.length,
    reviewAvailable: wasDue && recent.length > 0,
    currentStreak: current,
  };
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

  const currentPeriod = currentPeriodForRender();

  const startSitting = (timeOfDay: TimeOfDay) => {
    router.push({ pathname: '/write', params: { timeOfDay } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Scrolls when content exceeds the viewport instead of center-
            clipping both ends (v13 issue 05): the app icon + title must be
            the first thing on screen on short devices too — measured on the
            320x640 audit AVD, the pre-icon layout already clipped the header
            and footer, invisibly, because overflow had nowhere to go. */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            {/* The app icon above the title (v13 issue 05): the same committed
                asset the native splash shows, at that splash's own imageWidth
                (app.json), so launcher → splash → home read as one identity.
                Decorative: no accessible name of its own, like the tile
                glyphs below — the header's name comes from its text. */}
            <Image
              // Relative, not the `@/assets` alias: the jest-expo tsconfig
              // mapping takes the first matching rule, and `@/*` (→ src/)
              // shadows `@/assets/*` there. Relative requires resolve in
              // metro AND jest; app.json's own asset lines are relative too.
              source={require('../../assets/images/icon.png')}
              style={styles.appIcon}
              testID="home-app-icon"
            />
            <ThemedText type="title">AwareMe</ThemedText>
            {/* Owner feedback 2026-09-16 (v12 issue 02): the old tagline read
                as "finish sentences" with no stated purpose. This names the
                practice's aim without hype (§10, §13.4); two alternatives are
                in the issue Comments for the owner to swap freely. */}
            <ThemedText type="default" themeColor="textSecondary">
              A daily practice for self-esteem, one sentence at a time.
            </ThemedText>
          </View>

          {/*
            The programme cards (issue 02, ADR-0005): the week card is the
            day's one dominant action — Week N of 30 with the sitting's size
            and its Start; the evening reflection (when
            `evening_practice_enabled`, §7) and the weekly reflection (on its
            target day, §7 `weekly_meta_day`) each get their own quiet card
            below. The current sitting period (midpoint of the user's two
            notification times, `currentSitting.ts`) still decides which
            card's button is primary. Inner rows are plain `View`s (issue 03):
            `ThemedView` painted `theme.background` inside the card's
            `backgroundElement` fill — the owner's "weird white background"
            strips.
          */}
          <Card style={styles.sittingCard}>
            <ThemedText type="eyebrow">
              {status ? `Week ${status.week.currentWeek} of 30` : 'Morning sitting'}
            </ThemedText>
            {status && status.week.override !== null && (
              <ThemedText type="small" themeColor="textSecondary">
                Your chosen week: it clears when its reflection completes.
              </ThemedText>
            )}
            {status && (
              <ThemedText type="subtitle">
                {status.morningDone
                  ? 'Morning sitting complete'
                  : status.weekStemCount === 1
                    ? '1 stem ready'
                    : `${status.weekStemCount} stems ready`}
              </ThemedText>
            )}

            <View style={styles.startRow}>
              <Button
                label="Start morning sitting"
                onPress={() => startSitting('morning')}
                variant={currentPeriod === 'morning' ? 'primary' : 'secondary'}
                style={styles.primaryButton}
              />
            </View>

            {status && (status.weekCount > 0 || status.reviewAvailable || status.currentStreak >= 3) && (
              <View style={styles.statusFooter}>
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
                {/* Links carry accessibilityRole="link" (BackHeader's documented
                    convention) plus an explicit label matching the visible
                    text, so an icon glyph never leaks into the screen
                    reader's name. Same pattern on every Link below. */}
                {status.reviewAvailable && (
                  <Link
                    href="/review"
                    style={styles.reviewRow}
                    accessibilityRole="link"
                    accessibilityLabel="Review available"
                  >
                    {/* `textSecondary`, not `accent` (2026-09-15 review finding): `accent`
                        text only clears AA against `background` (theme.ts's own comment),
                        not against the sitting card's `backgroundElement` fill — 4.35:1 in
                        light theme, under LC9's 4.5:1 floor. The chevron alone (a non-text
                        UI component, 3:1 floor) stays accent-colored for the row's tappable
                        affordance. */}
                    <ThemedText type="small" themeColor="textSecondary">
                      Review available
                    </ThemedText>
                    <Ionicons name="chevron-forward-outline" size={16} color={theme.accent} />
                  </Link>
                )}
              </View>
            )}
          </Card>

          {/* The evening reflection (§6.2/§6.5.2), only when enabled — today's
              morning endings read-only, then one alternating reflection stem.
              A done state, never a demand: the button stays, the day's
              completion is simply acknowledged (§13.4). */}
          {status?.eveningEnabled && (
            <Card style={styles.sittingCard}>
              <ThemedText type="eyebrow">Evening reflection</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {status.eveningDone
                  ? 'Reflected today'
                  : 'Reread this morning’s endings, then one reflection stem.'}
              </ThemedText>
              <View style={styles.startRow}>
                <Button
                  label="Begin evening reflection"
                  onPress={() => startSitting('evening')}
                  variant={currentPeriod === 'evening' ? 'primary' : 'secondary'}
                  style={styles.primaryButton}
                />
              </View>
            </Card>
          )}

          {/* The weekly reflection card on its target day (§6.5.1, §7
              `weekly_meta_day`). The deep link (/write?origin=weekly — c03's
              notification target) reaches the same flow any day. */}
          {status?.weeklyCardToday && (
            <Card style={styles.sittingCard}>
              <ThemedText type="eyebrow">Weekly reflection</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {status.weeklyDoneThisWeek
                  ? 'Reflected this week'
                  : `Week ${status.week.currentWeek}’s endings, then the weekly stem.`}
              </ThemedText>
              {!status.weeklyDoneThisWeek && (
                <View style={styles.startRow}>
                  <Button
                    label="Begin weekly reflection"
                    onPress={() => router.push({ pathname: '/write', params: { origin: 'weekly' } })}
                    variant="secondary"
                    style={styles.primaryButton}
                  />
                </View>
              )}
            </Card>
          )}

          {/* §6.2's calm completion nudge — only when this calendar week's
              reflection actually advanced the derived week, and never once the
              programme itself is complete (the line below covers that). */}
          {status?.nudge && !status.programmeComplete && (
            <ThemedText type="small" themeColor="textSecondary">
              {`Week ${status.nudge.completedWeek} complete. Week ${status.nudge.nextWeek} is ready.`}
            </ThemedText>
          )}

          {/* Week 30's completion state (§6.2/Q2): the programme ends calmly;
              the library is the way onward. */}
          {status?.programmeComplete && (
            <View style={styles.completionBlock}>
              <ThemedText type="small" themeColor="textSecondary">
                Week 30 complete. The library is yours from here.
              </ThemedText>
              <Link
                href="/stems"
                style={styles.reviewRow}
                accessibilityRole="link"
                accessibilityLabel="Browse the library"
              >
                <ThemedText type="small" themeColor="textSecondary">
                  Browse the library
                </ThemedText>
                <Ionicons name="chevron-forward-outline" size={16} color={theme.accent} />
              </Link>
            </View>
          )}

          <View style={styles.grid}>
            {SECONDARY_LINKS.map(({ href, label, icon, color, colorDark }) => (
              <Link
                key={href}
                href={href}
                // One shared fill for all eight tiles (v13 issue 05): the
                // 2026-09-11 audit's lone accentMuted Progress tile read as a
                // bug, not a hierarchy — no tile is singled out anymore.
                style={[styles.tile, { backgroundColor: theme.backgroundElement }]}
                accessibilityRole="link"
                accessibilityLabel={label}
              >
                <Ionicons
                  name={icon}
                  size={20}
                  color={resolveTileColor(resolvedScheme === 'dark' ? colorDark : color, theme.accent)}
                />
                <ThemedText type="default">{label}</ThemedText>
              </Link>
            ))}
          </View>

          {__DEV__ && (
            <Link
              href="/debug"
              style={styles.navLink}
              accessibilityRole="link"
              accessibilityLabel="Debug: dump all tables"
            >
              <ThemedText type="small" themeColor="textSecondary">
                Debug: dump all tables
              </ThemedText>
            </Link>
          )}

          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.footer}
            onPress={() => Linking.openURL(withAppTag(CREATOR_SITE_URL))}
            accessibilityRole="link"
          >
            Created by Nicolo’ Brandizzi
          </ThemedText>
        </ScrollView>
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
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
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
  appIcon: {
    width: 76,
    height: 76,
    borderRadius: Radius.large,
  },
  sittingCard: {
    gap: Spacing.two,
  },
  startRow: {
    gap: Spacing.two,
    width: '100%',
  },
  primaryButton: {
    minHeight: MinTouchTarget * 1.3,
    width: '100%',
  },
  statusFooter: {
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  completionBlock: {
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: MinTouchTarget,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'flex-start',
  },
  tile: {
    minHeight: MinTouchTarget,
    // Fixed (not min-) width with no flexGrow: a strict 3-column grid where
    // every tile is the same width regardless of how many tiles land in the
    // last row — the previous `minWidth: '30%'` + `flexGrow: 1` let a short
    // last row stretch wider than the rows above it (measured 3-3-2 ragged
    // grid, H3). 30% leaves room for the two 8pt row gaps within a 3-column
    // row at any supported screen width.
    width: '30%',
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

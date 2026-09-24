import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { SplashSequence } from '@/components/splash/SplashSequence';
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
import { currentPracticePeriod } from '@/session/currentPractice';
import { computeStreaks } from '@/session/progressStats';
import {
  readHomeProgrammeStatus,
  readMorningPracticeQueue,
  type HomeProgrammeStatus,
} from '@/session/programRead';
import { isWeeklyReviewDue } from '@/session/reviewPeriod';

/**
 * The render path's own period read (issue 03, owner decision 2026-09-15):
 * the highlighted practice flips at the midpoint between the user's two
 * configured notification times (`currentPractice.ts`), not at a hardcoded
 * 17:00. Unlike `loadHomeStatus` this call is not behind the focus-effect
 * try/catch, so it guards the settings read itself — settings unreadable
 * (e.g. no DB in tests) must not crash the home screen (§13.4: a status
 * nicety never blocks the screen); the fallback is the module's own
 * hardcoded-17:00 rule via `currentPracticePeriod(undefined, undefined)`.
 */
function currentPeriodForRender(): TimeOfDay {
  try {
    const settings = getRepository().getSettings();
    return currentPracticePeriod(settings.morning_notification_time, settings.evening_notification_time);
  } catch {
    return currentPracticePeriod(undefined, undefined);
  }
}

interface HomeStatus extends HomeProgrammeStatus {
  /** The composed morning practice's size (picks + gated block, readMorningPracticeQueue) — design §6.1's "N stems ready" reads the composition, not the week block alone. */
  readyCount: number;
  /** The Programme setting at read time — keys the off caption and the override line's off variant (D3's read-time honesty; the engine state itself is untouched). */
  programmeOn: boolean;
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
    readyCount: readMorningPracticeQueue(repo, now).length,
    programmeOn: repo.getSettings().programme,
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
  // Packet-10 t4 (owner mockup pick, 2026-09-24): the nav dock collapses
  // behind one Menu button, collapsed by DEFAULT, and the expanded state
  // persists across app opens as a settings KV row (`home_nav_expanded`,
  // DECISIONS: new settings are KV rows, not schema). Local state only —
  // the store is read on focus below and written on toggle.
  const [navExpanded, setNavExpanded] = useState(false);

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
      // The dock's stored expanded state: re-read on focus so a fresh app
      // open (and a return from another screen) reflects the persisted
      // choice. Unreadable settings keep the collapsed default — the dock's
      // state is the same class of nicety as the status line (§13.4).
      try {
        setNavExpanded(getRepository().getSettings().home_nav_expanded);
      } catch {
        // keep the default (collapsed)
      }
    }, []),
  );

  // One toggle for the whole dock (owner pick: collapsing only the
  // stems/history/review trio would leave five always-up tiles doing the
  // job the toggle retires — PROPOSAL.md scope 4). The write is best-effort:
  // if the DB is unavailable the toggle still works for this session and
  // the next open falls back to the stored/default state (§13.4).
  const toggleNavDock = useCallback(() => {
    const next = !navExpanded;
    setNavExpanded(next);
    try {
      getRepository().setSetting('home_nav_expanded', next);
    } catch {
      // Session-only toggle; persistence is a nicety, never a blocker (§13.4).
    }
  }, [navExpanded]);

  const currentPeriod = currentPeriodForRender();

  // Density-independent home header (packet-3 t2b, packet-2 C5 half): the
  // brand block used to be fixed-dp (76dp icon, 32/44 title) and demanded
  // more width than the viewport has below the 320dp floor — at the 440dpi
  // probe's ~116dp viewport the 68dp content column broke "AwareMe" mid-word
  // and clipped it to "Awa" (p2n-28a). The block now scales against the
  // measured window, capped at its designed sizes: at and above the 320dp
  // floor the scale is 1 and the rendering is unchanged; only narrower
  // probe-style viewports shrink it. ("AwareMe" measured 135dp wide at
  // fontSize 32 — p2n-08's heading bounds — hence the 135/32 fit check in
  // the test.) The same scale drives the dock tiles below: a fixed-dp dock
  // (three ~66dp rows ≈ 223dp) overflows a 186dp-tall probe viewport
  // entirely and pushes the header off-screen, so below the floor the
  // dock's fixed-dp chrome yields by the same factor. Card interiors are
  // NOT scaled — they are scroll content, not fixed chrome (t6's scope).
  const { width: windowWidth } = useWindowDimensions();
  const contentColumnWidth = Math.max(0, windowWidth - Spacing.four * 2);
  // Floor 0.40: at the 440dpi probe (~116dp viewport, ~74dp scroll area after
  // the dock) the scaled header block (padding + icon + title) fits the
  // initial viewport with the heading whole; 0.45 left the heading's bottom
  // ~12px at the fold. Only sub-146dp viewports ever go below scale 1.
  const headerScale = Math.min(1, Math.max(0.4, contentColumnWidth / (320 - Spacing.four * 2)));
  const appIconSize = Math.round(76 * headerScale);
  const titleFontSize = Math.round(32 * headerScale * 10) / 10;
  const titleLineHeight = Math.round(44 * headerScale * 10) / 10;
  const taglineFontSize = Math.round(16 * headerScale * 10) / 10;
  const taglineLineHeight = Math.round(24 * headerScale * 10) / 10;
  const dockIconSize = Math.round(20 * headerScale);
  const dockTileStyle = {
    minHeight: Math.round(MinTouchTarget * headerScale),
    paddingVertical: Spacing.two * headerScale,
  };
  const dockTileContentStyle = { gap: Spacing.half * headerScale };
  const dockTileIconStyle = {
    width: Math.round(24 * headerScale),
    height: Math.round(24 * headerScale),
  };
  const dockLabelStyle = {
    fontSize: taglineFontSize,
    lineHeight: taglineLineHeight,
  };
  // The Menu toggle rides the same dock scale as the tiles (fixed-dp chrome
  // yields below the 320dp floor; mockup menubar: 14px label, 13px chevron).
  const menuLabelFontSize = Math.round(14 * headerScale * 10) / 10;
  const menuLabelLineHeight = Math.round(20 * headerScale);
  const menuChevronSize = Math.round(13 * headerScale);
  // Three 30%-wide tiles plus two gaps must fit the column: gap ≤ 5% of the
  // grid width. At the 320dp floor that bound (13.6dp) sits above the
  // designed 8dp gap, so the rendering is exactly as before; below the floor
  // (the probe's ~68dp column) the gap yields instead of forcing the tiles
  // to wrap into two-per-row rows that overflow the viewport again.
  const dockGap = Math.min(Spacing.two, contentColumnWidth * 0.05);

  const startPractice = (timeOfDay: TimeOfDay) => {
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
          {/* Centering lives on this inner wrapper, not on the scroll's
              content container (packet-3 t2b): a `justifyContent: 'center'`
              directly on the overflowing content container distributes the
              overflow around the viewport center, pushing the header above
              the reachable scroll region (observed at the 440dpi probe: the
              heading rendered below the scroll fold, dump bounds inverted).
              The wrapper grows to its content, so an overflowing column lays
              out from the top (scrollable) while short content still centers. */}
          <View style={styles.contentInner}>
          <View style={styles.header}>
            {/* The app icon above the title (v13 issue 05): the launcher
                asset, so launcher → home read as one identity. (The native
                splash and the entrance overlay now use the borderless
                foreground artwork at a larger size — v14 issue 01 — but the
                header keeps the rounded tile treatment the home screen was
                designed around.) Decorative: no accessible name of its own,
                like the tile glyphs below — the header's name comes from its
                text. */}
            <Image
              // Relative, not the `@/assets` alias: the jest-expo tsconfig
              // mapping takes the first matching rule, and `@/*` (→ src/)
              // shadows `@/assets/*` there. Relative requires resolve in
              // metro AND jest; app.json's own asset lines are relative too.
              source={require('../../assets/images/icon.png')}
              style={[styles.appIcon, { width: appIconSize, height: appIconSize }]}
              testID="home-app-icon"
            />
            <ThemedText type="title" style={{ fontSize: titleFontSize, lineHeight: titleLineHeight }}>
              AwareMe
            </ThemedText>
            {/* Subtitle (packet-10 t4): the owner's wording, picked on the
                t1 mockup 2026-09-24 — replaces v12 issue 02's
                "self-esteem, one sentence at a time" line verbatim. */}
            <ThemedText type="default" themeColor="textSecondary" style={{ fontSize: taglineFontSize, lineHeight: taglineLineHeight }}>
              A daily practice for self-awareness
            </ThemedText>
          </View>

          {/*
            The programme cards (issue 02, ADR-0005): the week card is the
            day's one dominant action — Week N of 30 with the practice's size
            and its Start; the evening reflection (when
            `evening_practice_enabled`, §7) and the weekly reflection (on its
            target day, §7 `weekly_meta_day`) each get their own quiet card
            below. The current practice period (midpoint of the user's two
            notification times, `currentPractice.ts`) still decides which
            card's button is primary. Inner rows are plain `View`s (issue 03):
            `ThemedView` painted `theme.background` inside the card's
            `backgroundElement` fill — the owner's "weird white background"
            strips.
          */}
          <Card style={styles.practiceCard}>
            {/* The eyebrow is the quiet door to the weeks browser (design §6.1:
                Home had no path to /week; the stems screen's week door moved
                into its group header, so this link and the re-enable dialog
                are the two doors left). Same link anatomy as every Link
                below: role="link" + explicit label. */}
            {status ? (
              <Link
                href="/week"
                style={styles.eyebrowLink}
                accessibilityRole="link"
                accessibilityLabel="Open the programme weeks"
              >
                <ThemedText type="eyebrow">{`Week ${status.week.currentWeek} of 30`}</ThemedText>
              </Link>
            ) : (
              <ThemedText type="eyebrow">Morning practice</ThemedText>
            )}
            {status && status.week.override !== null && (
              <ThemedText type="small" themeColor="textSecondary">
                {/* The clearing sentence is an automation promise: while the
                    programme is off the completion effect skips the
                    override-clear (w2t2), so the off variant states the
                    truth instead — no promise automation doesn't keep. */}
                {status.programmeOn
                  ? 'Your chosen week: it clears when its reflection completes.'
                  : 'Your chosen week: it stays until you clear it.'}
              </ThemedText>
            )}
            {status && (
              <ThemedText type="subtitle">
                {status.morningDone
                  ? 'Morning practice complete'
                  : status.readyCount === 1
                    ? '1 stem ready'
                    : `${status.readyCount} stems ready`}
              </ThemedText>
            )}
            {status && !status.programmeOn && (
              <ThemedText type="small" themeColor="textSecondary">
                {/* D3's read-time honesty (design §6.1): the engine's off
                    state changes nothing, so the caption is what tells the
                    count's story — the practice below is the picks alone. */}
                Programme is off. Showing your picks.
              </ThemedText>
            )}

            <View style={styles.startRow}>
              <Button
                label="Start morning practice"
                onPress={() => startPractice('morning')}
                variant={currentPeriod === 'morning' ? 'primary' : 'secondary'}
                style={styles.primaryButton}
              />
            </View>

            {status && (
              <View style={styles.statusFooter}>
                {/* s1-F5 (packet-7 w2-t6, design §6.1): the week-advancement
                    rule becomes visible — one honest line, always present,
                    true in both programme states (only reflections completed
                    while the programme is on advance the week; D3's counting
                    rule in user words). */}
                <ThemedText type="small" themeColor="textSecondary">
                  Your week advances when you complete its weekly reflection while the programme is on. It never
                  moves on its own.
                </ThemedText>
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
                    {/* Packet-3 t6 (cluster 11, p2f-27): the link is an ACTION,
                        so its text reads full ink — distinct from the inert
                        metadata lines beside it, which keep `textSecondary`.
                        Accent stays off the text itself: it clears AA only on
                        `background`, not on the card's `backgroundElement`
                        fill (4.35:1, the 2026-09-15 review finding). The
                        chevron alone (a non-text UI component, 3:1 floor)
                        keeps the accent tappable affordance. */}
                    <ThemedText type="small">
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
            <Card style={styles.practiceCard}>
              <ThemedText type="eyebrow">Evening reflection</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {status.eveningDone
                  ? 'Reflected today'
                  : 'Reread today’s endings, then reflect, then your evening picks.'}
              </ThemedText>
              <View style={styles.startRow}>
                <Button
                  label="Begin evening reflection"
                  onPress={() => startPractice('evening')}
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
            <Card style={styles.practiceCard}>
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
                {/* Same action-link anatomy as Review available (packet-3 t6):
                    full ink for the tappable row, secondary ink stays
                    reserved for the inert lines. */}
                <ThemedText type="small">
                  Browse the library
                </ThemedText>
                <Ionicons name="chevron-forward-outline" size={16} color={theme.accent} />
              </Link>
            </View>
          )}

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
          </View>
        </ScrollView>

        {/*
          The nav dock (packet-3 t2a, packet-2 C1 REPRODUCED; collapsed by
          default per packet-10 t4, owner mockup pick): pinned BELOW the
          scrolling content, not the last block inside it. The grid used to
          scroll with the home content — on a 320x640 viewport it landed
          below the fold at initial scroll (first row ~83% clipped, a11y
          bounds inverted, 16/16 tap probes dead: p2n-08/09) while reading as
          a fixed tab bar; as a pinned bar it is reachable and tappable at
          any scroll position on any screen size, and it no longer floats
          mid-content when the page scrolls (packet-2's p2n-24 note). Since
          packet-10 t4 the whole dock (all eight tiles) collapses behind the
          Menu toggle — expanded shows the same grid with the same tile
          anatomy; the hairline top border stays pinned in both states.

          Moving it ABOVE the cards was rejected: it would push the day's
          primary action (the week card's Start CTA, §6.2) below the 320px
          fold — trading a secondary-nav defect for a primary-action one.
        */}
        <View style={[styles.dock, { borderColor: theme.border }]}>
          {navExpanded && (
            <View style={[styles.grid, styles.dockExpanded, { gap: dockGap }]}>
              {SECONDARY_LINKS.map(({ href, label, icon, color, colorDark }) => (
              <Link
                key={href}
                href={href}
                // One shared fill for all eight tiles (v13 issue 05): the
                // 2026-09-11 audit's lone accentMuted Progress tile read as a
                // bug, not a hierarchy — no tile is singled out anymore.
                style={[styles.tile, { backgroundColor: theme.backgroundElement }, dockTileStyle]}
                accessibilityRole="link"
                accessibilityLabel={label}
              >
                <View style={[styles.tileContent, dockTileContentStyle]}>
                  {/* Icon rendered as a View with fixed size to avoid
                      accessibility text contributions. The glyph is
                      decorative; the tile's accessible name comes from
                      Link's accessibilityLabel above (§13.5). */}
                  <View style={[styles.tileIcon, dockTileIconStyle]}>
                    <Ionicons
                      name={icon}
                      size={dockIconSize}
                      color={resolveTileColor(resolvedScheme === 'dark' ? colorDark : color, theme.accent)}
                    />
                  </View>
                  {/* numberOfLines={1} (v14 issue 12: a lone "s" of "Progress"
                      wrapped to a second line at narrow widths) — no tile label
                      may ever wrap. The freed-up horizontal padding (Spacing.one,
                      below) is what makes "Progress" actually fit on one line
                      at the 320pt floor, so this is a guarantee of last resort,
                      not the sizing fix itself. */}
                  <ThemedText
                    type="default"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[styles.tileLabel, dockLabelStyle]}
                  >
                    {label}
                  </ThemedText>
                </View>
              </Link>
              ))}
            </View>
          )}
          {/* The one Menu toggle (packet-10 t4, owner mockup): collapsed by
              default, expanded state persisted via `home_nav_expanded`.
              backgroundElement fill + medium radius per the approved mockup's
              menubar anatomy; the chevron marks the direction. The expanded
              state is exposed to assistive tech via accessibilityState. */}
          <Pressable
            onPress={toggleNavDock}
            style={[styles.menuButton, { backgroundColor: theme.backgroundElement }]}
            accessibilityRole="button"
            accessibilityLabel="Menu"
            accessibilityState={{ expanded: navExpanded }}
            testID="home-nav-menu"
          >
            {/* Decorative glyphs: the button's name is its label text (§13.5). */}
            <Ionicons name="menu-outline" size={dockIconSize} color={theme.text} />
            <ThemedText type="default" style={[styles.menuLabel, { fontSize: menuLabelFontSize, lineHeight: menuLabelLineHeight }]}>
              Menu
            </ThemedText>
            <Ionicons
              name={navExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={menuChevronSize}
              color={theme.textSecondary}
            />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* The animated entrance sequence (v14 issue 01): logo → AwareMe →
          quote, played once per app open. The component is self-dismissing
          (it renders null when done), so the home screen carries no splash
          state; it paints itself with the theme's background token over the
          full screen, above the SafeAreaView. */}
      <SplashSequence />
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
  dock: {
    // Hairline separation from the scrolling content above (theme token —
    // borderColor is applied inline where the theme is in scope).
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
    paddingHorizontal: Spacing.four,
    alignSelf: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    alignSelf: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  contentInner: {
    // The centering wrapper — see the render-site comment: centering on the
    // scroll's own content container makes overflow unreachable at the top.
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.four,
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
  practiceCard: {
    gap: Spacing.two,
  },
  eyebrowLink: {
    // The eyebrow is now the /week door (design §6.1) — same touch-floor as
    // every other link row on this screen (reviewRow, navLink, footer).
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  startRow: {
    // Packet-3 t6 (cluster 11, p2f-27): the state line must not read as the
    // CTA's caption. The card's base gap (Spacing.two) + this margin give
    // 16dp between the state headline and the action row — the action is
    // its own group, not part of the state block (the test pins the margin).
    marginTop: Spacing.two,
    gap: Spacing.two,
    width: '100%',
  },
  primaryButton: {
    minHeight: MinTouchTarget * 1.3,
    width: '100%',
  },
  statusFooter: {
    // Same group logic on the other side of the CTA (packet-3 t6, p2f-27):
    // 16dp below the button vs the 4dp the footer's own lines share, so the
    // quiet metadata reads as a third group — not as the button's caption.
    marginTop: Spacing.two,
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
  dockExpanded: {
    // Mockup .tilegrid margin-bottom:8px — the expanded grid sits one grid
    // gap above the Menu toggle.
    marginBottom: Spacing.two,
  },
  menuButton: {
    // The approved mockup's menubar: one backgroundElement bar, medium
    // radius (the tile radius), 44+ touch floor, centered glyph + label +
    // chevron. Press feedback mirrors Button secondary's pressed step.
    minHeight: MinTouchTarget,
    borderRadius: Radius.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  menuLabel: {
    fontWeight: '600',
  },
  tile: {
    minHeight: MinTouchTarget,
    // Fixed (not min-) width with no flexGrow: a strict 3-column grid where
    // every tile is the same width regardless of how many tiles land in the
    // last row — the previous `minWidth: '30%'` + `flexGrow: 1` let a short
    // last row stretch wider than the rows above it (measured 3-3-2 ragged
    // grid, H3). 30% leaves room for the two 8pt row gaps within a 3-column
    // row at any supported screen width. Vertical padding is Spacing.two
    // (packet-3 t2a): as a pinned dock the three rows live inside the
    // viewport alongside the content, so the rows stay compact (~62dp);
    // the 44dp touch floor still holds via minHeight.
    width: '30%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileContent: {
    // Container for icon + label to ensure proper layout at 320dp.
    // Flex column with center alignment; icon and label stack if needed
    // but label is constrained to single line to prevent wrap.
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  tileIcon: {
    // Fixed-size icon wrapper to avoid accessibility text contributions
    // and to ensure predictable layout at narrow widths.
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    // Explicit center alignment and single-line constraint (v14 issue 12).
    // Spacing.one padding + numberOfLines=1 guarantee no wrap at 320dp floor
    // (Progress ~55dp fits in ~82dp label box). ellipsizeMode on the Text
    // component itself is the safety net.
    textAlign: 'center',
    width: '100%',
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

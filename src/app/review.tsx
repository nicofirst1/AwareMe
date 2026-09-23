import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WriteActionBar } from '@/components/write-action-bar';
import { WriteTimerStrip } from '@/components/write-timer-strip';
import { MaxContentWidth, pressureColorAt, Spacing } from '@/constants/theme';
import { EndingRow, getRepository, SessionRow } from '@/db';
import { nowEventTime } from '@/db/time';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { formatMMSS } from '@/session/sessionMachine';
import {
  computeReviewPeriod,
  DEFAULT_REVIEW_PERIOD_DAYS,
  isWeeklyReviewDue,
  REVIEW_PERIOD_PRESETS,
  type ReviewPeriodPreset,
} from '@/session/reviewPeriod';
import { useWritingSession } from '@/session/useWritingSession';

type ReviewPhase = 'reread' | 'meta-stem' | 'done';

/**
 * Review mode (§6.5, ticket 13): read back everything written in a
 * selectable recent period, read-only and quiet — no evaluation, no
 * scoring — then complete one meta-stem as a normal timed session
 * (`origin='review'`, §6.5.2). "Offered once a week" is a single
 * unemphasised line on this screen itself (§13.4/§13.6 — descriptive,
 * never a badge or an obligation).
 *
 * Layout (layout-audit-2026-09-15, R1/R2): the period chips stay the
 * screen's top anchor and "Continue" moves to a pinned bottom action
 * position — it used to sit after the whole stream (~2,200pt down with a
 * five-session period), effectively unreachable. Session cards carry a
 * metadata header (date + ending count, descriptive only) and their endings
 * render dim below the serif stem with hairline dividers (LC5, write's W3
 * pattern) instead of differing from the stem by opacity alone.
 *
 * Type roles (packet-3 t7, rollup 12 / p2n-17): the screen once mixed five
 * scales (32/22/16/14/12) with the card metadata in 12px spaced caps — too
 * small to read. Every text node now sits in one of four DESIGN.md roles:
 * title (screen anchor), stem (the user's writing, the reserved serif),
 * small (metadata + the weekly-due helper line, 14 — the audit's own raise
 * from 10-12px), default (control labels and status copy). The card header
 * used the eyebrow role (12px caps) until this consolidation; DESIGN.md's
 * label-vs-helper rule governs label+helper pairs within a section, which
 * this screen has none of — the metadata line is standalone.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const session = useWritingSession();

  const [phase, setPhase] = useState<ReviewPhase>('reread');
  const [periodDays, setPeriodDays] = useState<ReviewPeriodPreset>(DEFAULT_REVIEW_PERIOD_DAYS);
  // A real `stems` row (origin='meta', §5.4) — its id is what the meta-stem
  // session's `stem_id` FK points to; picked once per screen visit.
  const [metaStem] = useState(() => {
    const options = getRepository().listMetaStems();
    return options[Math.floor(Math.random() * options.length)];
  });
  const [reviewedSessions, setReviewedSessions] = useState<{ session: SessionRow; endings: EndingRow[] }[]>(() => {
    const p = computeReviewPeriod(DEFAULT_REVIEW_PERIOD_DAYS, new Date().toISOString());
    return getRepository().listSessionsForReview(p.periodStart, p.periodEnd);
  });
  // Descriptive only, never urging (§13.4/§13.6) — "it has been a week"
  // rather than a badge, streak, or anything implying an obligation.
  const [wasDue] = useState(() => isWeeklyReviewDue(getRepository().getLastReviewAt(), new Date().toISOString()));

  const period = useMemo(() => computeReviewPeriod(periodDays, new Date().toISOString()), [periodDays]);

  const loadPeriod = (days: ReviewPeriodPreset) => {
    setPeriodDays(days);
    const p = computeReviewPeriod(days, new Date().toISOString());
    setReviewedSessions(getRepository().listSessionsForReview(p.periodStart, p.periodEnd));
  };

  const beginMetaStem = () => {
    setPhase('meta-stem');
    session.start({
      id: metaStem.id,
      text: metaStem.text,
      origin: 'review',
      configOverrides: { targetEndings: 1, timerSeconds: getRepository().getSettings().review_timer_seconds },
    });
  };

  // The meta-stem session finished (timeout, done, or abandoned-and-
  // resumed-elsewhere) — record the review with whatever was written,
  // nothing discarded, same rule as any other session (§6.3.8).
  useEffect(() => {
    if (phase !== 'meta-stem' || session.phase !== 'done' || !session.state) return;

    const reflectionText = session.state.endings[0]?.text ?? null;
    const { at } = nowEventTime();
    getRepository().createReview({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      sessionIds: reviewedSessions.map((r) => r.session.id),
      metaStemText: metaStem.text,
      reflectionText: reflectionText && reflectionText.length > 0 ? reflectionText : null,
      createdAt: at,
    });
    setPhase('done');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session.phase, session.state]);

  if (phase === 'meta-stem') {
    // Reuses the same writing-session UI primitives as a normal session —
    // review's meta-stem is deliberately "a normal timed session" (§6.5.2),
    // not a bespoke screen.
    return <MetaStemSession session={session} />;
  }

  if (phase === 'done') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Review" />
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <ThemedText type="default" themeColor="textSecondary">
              Session saved.
            </ThemedText>
            <Button label="Close" onPress={() => router.back()} />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Review" />
        <ScrollView style={styles.flexOne} contentContainerStyle={styles.scrollContent}>
          <ThemedView style={styles.periodSection}>
            {wasDue && (
              <ThemedText type="small" themeColor="textSecondary">
                It has been a week or more since your last review.
              </ThemedText>
            )}
            <ThemedView style={styles.periodRow}>
              {REVIEW_PERIOD_PRESETS.map((days) => (
                <FilterChip key={days} label={`${days} days`} selected={days === periodDays} onPress={() => loadPeriod(days)} />
              ))}
            </ThemedView>
          </ThemedView>

          {reviewedSessions.length === 0 ? (
            <EmptyState message="Nothing written in this period." />
          ) : (
            reviewedSessions.map(({ session: s, endings }) => (
              <Card key={s.id} style={styles.sessionBlock}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(s.started_at)} · {endings.length === 1 ? '1 ending' : `${endings.length} endings`}
                </ThemedText>
                <ThemedText type="stem">{s.stem_text_snapshot}</ThemedText>
                {endings.map((e) => (
                  <ThemedText
                    key={e.id}
                    type="stem"
                    themeColor="textSecondary"
                    style={[styles.ending, { borderTopColor: theme.border }]}
                  >
                    {e.text || '(nothing written)'}
                  </ThemedText>
                ))}
              </Card>
            ))
          )}
        </ScrollView>

        {/*
          Pinned bottom action (R1): the screen's one forward action, visible
          on first paint — it used to render after the entire reread stream,
          ~2.5 screens down. testID scopes the structural pinning assertion
          in review.test.tsx; visibility itself is acceptance-measured via
          frame dumps.
        */}
        <ThemedView style={styles.bottomBar} testID="review-bottom-bar">
          <Button label="Continue" onPress={beginMetaStem} />
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * The meta-stem, presented exactly like a normal writing session (§6.5.2) —
 * the same pinned primitives as `write.tsx` (cycle 2's `WriteTimerStrip` /
 * `WriteActionBar`), trimmed to what review needs: one field, no Start gate
 * (the timer begins with `beginMetaStem`), no "past endings" list (there's
 * only ever one), no per-stem counters, and no header exit while writing —
 * finishing ("Done") or backing out early is the single exit, same rule as
 * write's active session (§10/LC8).
 */
function MetaStemSession({ session }: { session: ReturnType<typeof useWritingSession> }) {
  const timerSeconds = session.state?.config.timerSeconds ?? 1;
  const stemTimerSeconds = session.state?.config.stemTimerSeconds ?? null;
  const progress = session.phase === 'active' ? Math.max(0, Math.min(1, session.remainingSeconds / timerSeconds)) : 0;
  // The per-stem timer drives the pressure cue when it's on (settings
  // apply to the meta-stem like any session); otherwise the session timer
  // does — same `pressureFraction` rule as write.tsx.
  const stemProgress =
    session.phase === 'active' && stemTimerSeconds && session.stemRemainingSeconds !== null
      ? Math.max(0, Math.min(1, session.stemRemainingSeconds / stemTimerSeconds))
      : null;
  const pressureFraction = stemProgress ?? progress;

  // §6.3.7's depleting-color cue (2026-09-15 owner decision, docs/DECISIONS.md at
  // merge): the top-strip MM:SS numerals carry the pressure gradient now
  // that the countdown Save button is gone — ambient urgency only, no
  // shaming copy (§13.4). Recomputed per render (the screen re-renders on
  // every timer tick), so no Animated value is needed; `undefined` outside
  // 'active' leaves the numerals in the theme's normal text color. Same
  // `pressureColorAt` mechanism as write.tsx.
  const resolvedScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const pressureColor = session.phase === 'active' ? pressureColorAt(1 - pressureFraction, resolvedScheme) : undefined;

  // Enter submits the ending — same trailing-newline path as write.tsx
  // (multiline field, so the return key usually arrives via onChangeText).
  const handleChangeText = (nextText: string) => {
    if (nextText.endsWith('\n')) {
      session.submitActive(nextText.slice(0, -1));
      return;
    }
    session.changeActiveText(nextText);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ThemedView style={styles.topStrip}>
            <WriteTimerStrip
              progress={session.phase === 'active' ? progress : undefined}
              timeLabel={session.phase === 'active' ? formatMMSS(session.remainingSeconds) : undefined}
              timeColor={pressureColor}
            />
          </ThemedView>

          <ScrollView style={styles.flexOne} contentContainerStyle={styles.metaScrollContent} keyboardShouldPersistTaps="handled">
            <ThemedText type="stem">{session.stemText}</ThemedText>
          </ScrollView>

          {session.phase === 'active' && (
            <ThemedView style={styles.bottomBar}>
              <WriteActionBar
                value={session.activeText}
                onChangeText={handleChangeText}
                onSubmitEditing={() => session.submitActive()}
                inputAccessibilityLabel="Your reflection"
                placeholder="Keep the pen moving."
                onDone={session.finishNow}
              />
            </ThemedView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flexOne: {
    flex: 1,
  },
  // LC3 section rhythm: 24 between sections (period band, cards), 8 inside
  // a card (LC4's internal gap).
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  periodSection: {
    gap: Spacing.one,
  },
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  sessionBlock: {
    gap: Spacing.two,
  },
  // R2/LC5: an ending is a dim, separated row under the serif stem — the
  // hairline top divider (decorative-only `border` token, see theme.ts)
  // replaces the old opacity-only differentiation.
  ending: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  // Pinned bottom (R1), same anatomy as write.tsx's bottom bar: SafeAreaView
  // insets the home indicator; this carries its own horizontal grid.
  bottomBar: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  // Pinned top strip for the meta-stem (LC8), same anatomy as write's.
  topStrip: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  metaScrollContent: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
});

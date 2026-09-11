import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/filter-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { EndingRow, getRepository, SessionRow } from '@/db';
import { nowEventTime } from '@/db/time';
import { useTheme } from '@/hooks/use-theme';
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
 * (`origin='review'`, default 180s). Available on demand from home
 * (`/review`, a plain link like History/Stems); "offered once a week" is a
 * single unemphasised line on this screen itself (§13.4/§13.6 — descriptive,
 * never a badge or a streak), not a separate prompt surface.
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
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <ThemedText type="default" themeColor="textSecondary">
              Saved.
            </ThemedText>
            <Pressable
              onPress={() => router.back()}
              style={[styles.button, { backgroundColor: theme.backgroundElement }]}
              accessibilityRole="button"
            >
              <ThemedText type="subtitle">Close</ThemedText>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">Review</ThemedText>
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

          {reviewedSessions.length === 0 ? (
            <ThemedText type="default" themeColor="textSecondary">
              Nothing written in this period.
            </ThemedText>
          ) : (
            reviewedSessions.map(({ session: s, endings }) => (
              <ThemedView key={s.id} style={styles.sessionBlock}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(s.started_at)}
                </ThemedText>
                <ThemedText type="stem">{s.stem_text_snapshot}</ThemedText>
                {endings.map((e) => (
                  <ThemedText key={e.id} type="stem" style={styles.ending}>
                    {e.text || '(nothing written)'}
                  </ThemedText>
                ))}
              </ThemedView>
            ))
          )}

          <Pressable
            onPress={beginMetaStem}
            style={[styles.button, { backgroundColor: theme.backgroundElement }]}
            accessibilityRole="button"
          >
            <ThemedText type="subtitle">Continue</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * The meta-stem, presented exactly like a normal writing session (§6.5.2)
 * — same primitives as `write.tsx`, trimmed to what review needs: one
 * field, no "past endings" list (there's only ever one), no separate exit
 * beyond finishing or backing out early.
 */
function MetaStemSession({ session }: { session: ReturnType<typeof useWritingSession> }) {
  const theme = useTheme();
  const timerSeconds = session.state?.config.timerSeconds ?? 1;
  const progress = session.phase === 'active' ? Math.max(0, Math.min(1, session.remainingSeconds / timerSeconds)) : 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="stem">{session.stemText}</ThemedText>

          {session.phase === 'active' && (
            <ThemedView
              type="backgroundElement"
              style={styles.progressTrack}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Time remaining"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            >
              <ThemedView type="backgroundSelected" style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </ThemedView>
          )}

          {session.phase === 'active' && (
            <>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={session.activeText}
                onChangeText={session.changeActiveText}
                onSubmitEditing={() => session.submitActive()}
                multiline
                blurOnSubmit={false}
                contextMenuHidden
                autoCorrect={false}
                accessibilityLabel="Your reflection"
                placeholder="Keep the pen moving."
                placeholderTextColor={theme.textSecondary}
              />
              <Pressable
                onPress={session.finishNow}
                style={[styles.button, { backgroundColor: theme.backgroundElement }]}
                accessibilityRole="button"
              >
                <ThemedText type="subtitle">Done</ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
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
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  sessionBlock: {
    gap: Spacing.one,
  },
  ending: {
    opacity: 0.85,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  input: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 34,
    minHeight: 80,
  },
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
});

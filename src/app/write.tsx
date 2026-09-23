import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useAnimatedValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BadgeCard } from '@/components/badge-card';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WriteActionBar } from '@/components/write-action-bar';
import { WriteTimerStrip } from '@/components/write-timer-strip';
import { MaxContentWidth, MinTouchTarget, pressureColorAt, Spacing } from '@/constants/theme';
import { getRepository, type EndingRow, type SessionRow, type StemRow, type TimeOfDay } from '@/db';
import { nowEventTime } from '@/db/time';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { BadgeDef } from '@/session/badges';
import { assembleNewlyEarnedBadges } from '@/session/badgeReveal';
import { PROGRAMME_WEEK_CAP, utcBoundsOfLocalDay } from '@/session/program';
import {
  applyWeekSetActivation,
  readEveningReflectionInputs,
  readMorningPracticeQueue,
  readProgrammeWeek,
  readWeeklyReflectionInputs,
  shouldClearOverride,
} from '@/session/programRead';
import { formatMMSS, sessionDurationLabel } from '@/session/sessionMachine';
import type { StemForSession } from '@/session/useWritingSession';
import { useWritingSession } from '@/session/useWritingSession';

/**
 * Parses the one-off week-practice param (`/write?week=N`, the stem library's
 * week page). Query params arrive as strings (or arrays); anything that
 * isn't an integer 1–30 is no param at all.
 */
function parseWeekParam(week?: string | string[]): number | null {
  const raw = Array.isArray(week) ? week[0] : week;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= PROGRAMME_WEEK_CAP ? n : null;
}

/**
 * ADR-0001 resume, extended for the programme (§6.2): if a session was left
 * open by a previous run, `useWritingSession`'s own mount effect resumes/
 * finalizes that one `sessions` row exactly as before — this only needs to
 * work out which practice the stem belongs to and where in its queue to pick
 * back up, so the remaining stems still get written rather than the practice
 * silently ending at one stem.
 *
 * Order of attempts:
 * 1. the effective programme week's morning practice (§6.2) — the common case;
 * 2. a one-off week practice from the library (`week` param) — the queue it
 *    was started from, which may differ from the current effective week if
 *    the override changed between kill and resume;
 * 3. a solo one-stem queue. The lookup here includes the meta-stems
 *    (`listMetaStems` covers `origin='meta'` AND the weekly meta-stem,
 *    neither of which `listAllStems` returns) — the c05-queued bug: an
 *    open review meta-stem session used to resume into an empty queue and
 *    the screen stuck on "No stems set" forever. Meta-stem open sessions
 *    are normally routed into their reflection flow before this fallback
 *    runs (see the mount effect); this is the safety net when the flow
 *    itself can't be reconstructed.
 */
function resumeQueue(repo: ReturnType<typeof getRepository>, openStemId: string, weekParam: number | null): { queue: StemRow[]; startIndex: number } {
  const { currentWeek } = readProgrammeWeek(repo);
  const weekQueue = repo.getProgrammeStemsForWeek(currentWeek);
  const index = weekQueue.findIndex((s) => s.id === openStemId);
  if (index >= 0) return { queue: weekQueue, startIndex: index };

  if (weekParam !== null) {
    // One-off week practice (issue 04): rebuild from the whole block, resting
    // included — the visit is activation-state-agnostic, so the resumed
    // queue matches the one it started from.
    const oneOff = repo.getProgrammeWeekBlock(weekParam);
    const oneOffIndex = oneOff.findIndex((s) => s.id === openStemId);
    if (oneOffIndex >= 0) return { queue: oneOff, startIndex: oneOffIndex };
  }

  const solo =
    repo.listMetaStems().find((s) => s.id === openStemId) ??
    repo.listAllStems().find((s) => s.id === openStemId && s.deleted_at === null);
  return { queue: solo ? [solo] : [], startIndex: 0 };
}

/** The two reflection flows that run inside this screen (§6.5.1/§6.5.2). */
type FlowKind = 'evening' | 'weekly';

interface ReflectionFlow {
  kind: FlowKind;
  /** 'reread': the read-only ending list with a Continue gate. 'writing': the meta-stem session. 'done': saved. */
  phase: 'reread' | 'writing' | 'done';
  /** The sessions the reread shows (§6.5: grouped by session, chronological, read-only). */
  reviewed: { session: SessionRow; endings: EndingRow[] }[];
  metaStem: StemRow;
  /** Weekly only: the programme week being reflected (for the reread copy and the review row). */
  week: number | null;
  /** Weekly only: the `program_week_override` currently selects this week — completing clears it (§6.2). */
  clearOverride: boolean;
}

/**
 * The writing screen (spec §6.3), now the host of every practice shape
 * (ADR-0004/ADR-0005): each is a queue of stems written one after another,
 * every stem still its own `sessions` row driven by the same
 * `useWritingSession` machinery — the shapes differ only in what fills the
 * queue and what surrounds it:
 *
 * - **Morning practice** (`timeOfDay=morning`, and the bare `/write` default):
 *   every active programme stem of the effective week (§6.2), seed order.
 * - **One-off week practice** (`week=N`, from the library's week page): that
 *   week's stems, `origin='manual'`, never in any rotation (§6.2).
 * - **Solo write** (`stemId`, from the stem library): one stem, `origin='manual'`.
 * - **Evening reflection** (`timeOfDay=evening`, only when
 *   `evening_practice_enabled`): today's morning endings read-only, then
 *   the alternating evening meta-stem as a timed session (`origin='review'`,
 *   §6.5.2). Completion records the review scoped to today's morning sessions.
 * - **Weekly reflection** (`origin=weekly` — the `/write?origin=weekly`
 *   deep link is c03's notification target, plus the Home weekend card): the
 *   effective programme week's endings read-only, then the weekly meta-stem
 *   (`review_timer_seconds`, §6.5.1). Completion records the review and —
 *   when the override selects this week — clears the override so the derived
 *   week takes over (§6.2).
 *
 * A session left open by a previous run always wins over the params
 * (ADR-0001: there is never more than one open session, and starting a new
 * one under it would orphan it): the mount effect routes it back into the
 * flow that owns its stem.
 */
export default function WriteScreen() {
  const { timeOfDay, stemId, origin, week } = useLocalSearchParams<{
    timeOfDay?: TimeOfDay;
    stemId?: string;
    origin?: string;
    week?: string | string[];
  }>();
  const router = useRouter();
  const theme = useTheme();
  // The pressure cue's endpoints are per-theme tokens (see `pressureColorAt`)
  // resolved once per render against the active color scheme. A hook, so it
  // stays above the early returns alongside the rest.
  const resolvedScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const session = useWritingSession();
  const inputRef = useRef<TextInput>(null);

  const [terminator, setTerminator] = useState('...');
  const [queue, setQueue] = useState<StemRow[] | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  // Which queue index `session.start()` has already been called for — -1
  // means none yet. A resumed session (ADR-0001) is seeded to its own
  // index directly, since `useWritingSession`'s mount effect already
  // brought it into 'active' without this screen calling `start()` itself.
  const [startedIndex, setStartedIndex] = useState(-1);
  // Non-null while a reflection flow (evening/weekly) owns the screen.
  const [flow, setFlow] = useState<ReflectionFlow | null>(null);
  // The evening card's off state (`evening_practice_enabled` false, §6.2/§7):
  // a calm explanation, never a gate error (§13.4).
  const [eveningOff, setEveningOff] = useState(false);

  const stemOrigin: StemForSession['origin'] = origin === 'notification' ? 'notification' : 'manual';
  const pendingStem = queue?.[queueIndex] ?? null;
  // §6.3.1: nothing is timed until Start is tapped — true for every stem in
  // the practice, not just the first. False while resuming into an
  // already-active session, and false once `start()` has been called for
  // the current index (whether still active or already 'done').
  const awaitingStart = pendingStem !== null && startedIndex < queueIndex;

  // Completion celebration (gamification proposal §1.A/§2, cycle 2): a
  // single calm settle on "Saved." — scale 0.92->1 + opacity 0->1, ~400ms,
  // friction-tuned to land without overshoot ("settle, don't bounce").
  // Shown once, after the whole practice completes — never between stems.
  const settleAnim = useAnimatedValue(0);
  // Badge reveal: fade + 8px upward slide, shared by every stacked badge
  // card (proposal §2) — they appear together, sequenced only against the
  // settle animation above, not staggered against each other.
  const badgeRevealAnim = useAnimatedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Loads the screen once on mount. An open session (ADR-0001) is routed by
  // its stem — the reflection flows resume straight into their writing
  // phase, everything else into its practice queue; params decide only when
  // nothing is open.
  useEffect(() => {
    const repo = getRepository();
    setTerminator(repo.getSettings().stem_terminator);
    setEveningOff(false);

    const open = repo.getOpenSession();
    if (open) {
      const openStemId = open.session.stem_id;
      const weekly = repo.getWeeklyMetaStem();
      if (weekly && openStemId === weekly.id) {
        const inputs = readWeeklyReflectionInputs(repo);
        if (inputs.metaStem) {
          setFlow({
            kind: 'weekly',
            phase: 'writing',
            reviewed: inputs.reviewed,
            metaStem: inputs.metaStem,
            week: inputs.week,
            clearOverride: shouldClearOverride(repo.getSettings().program_week_override, inputs.week),
          });
          setQueue(null);
          return;
        }
      }
      const eveningStem = repo.listMetaStems().find((s) => s.origin === 'meta' && s.id === openStemId);
      if (eveningStem) {
        const inputs = readEveningReflectionInputs(repo);
        setFlow({
          kind: 'evening',
          phase: 'writing',
          reviewed: inputs.reviewed,
          metaStem: eveningStem,
          week: null,
          clearOverride: false,
        });
        setQueue(null);
        return;
      }
      // practice resume — the safety net includes meta stems (the c05 bug fix).
      const resumed = resumeQueue(repo, openStemId, parseWeekParam(week));
      setQueue(resumed.queue);
      setQueueIndex(resumed.startIndex);
      setStartedIndex(resumed.startIndex);
      setFlow(null);
      return;
    }

    const enterFlow = (kind: FlowKind, phase: ReflectionFlow['phase']) => {
      if (kind === 'weekly') {
        const inputs = readWeeklyReflectionInputs(repo);
        if (!inputs.metaStem) {
          // Seed machinery missing (corrupted install): the honest empty
          // state, not a crash.
          setFlow(null);
          setQueue([]);
          return;
        }
        setFlow({
          kind,
          phase,
          reviewed: inputs.reviewed,
          metaStem: inputs.metaStem,
          week: inputs.week,
          clearOverride: shouldClearOverride(repo.getSettings().program_week_override, inputs.week),
        });
      } else {
        const inputs = readEveningReflectionInputs(repo);
        if (!inputs.metaStem) {
          setFlow(null);
          setQueue([]);
          return;
        }
        setFlow({
          kind,
          phase,
          reviewed: inputs.reviewed,
          metaStem: inputs.metaStem,
          week: null,
          clearOverride: false,
        });
      }
      setQueue(null);
    };

    if (origin === 'weekly') {
      enterFlow('weekly', 'reread');
    } else if (timeOfDay === 'evening') {
      if (!repo.getSettings().evening_practice_enabled) {
        setFlow(null);
        setQueue(null);
        setEveningOff(true);
        return;
      }
      enterFlow('evening', 'reread');
    } else if (timeOfDay === 'morning') {
      setFlow(null);
      setQueue(readMorningPracticeQueue(repo));
      setQueueIndex(0);
    } else {
      const weekNumber = parseWeekParam(week);
      if (weekNumber !== null) {
        // One-off practice on another week's block (§6.2: origin='manual',
        // never in any rotation). Whole block, resting included: an explicit
        // visit is activation-state-agnostic (issue 04, hub FLAG-ANSWER
        // 2026-09-16) — week-set activation governs the rotation, not visits.
        setFlow(null);
        setQueue(repo.getProgrammeWeekBlock(weekNumber));
        setQueueIndex(0);
      } else if (stemId) {
        const solo = repo.listAllStems().find((s) => s.id === stemId && s.deleted_at === null);
        setFlow(null);
        setQueue(solo ? [solo] : []);
        setQueueIndex(0);
      } else {
        // Bare /write (no params): the morning practice is the app's one
        // dominant action — default to it rather than a blank screen.
        setFlow(null);
        setQueue(readMorningPracticeQueue(repo));
        setQueueIndex(0);
      }
    }
  }, [timeOfDay, stemId, origin, week]);

  const isLastInQueue = queue !== null && queueIndex >= queue.length - 1;

  // Advances the queue pointer the moment one stem finishes, unless it was
  // the last — the whole-practice completion screen (with any badge reveal)
  // only renders on that last stem's 'done' phase (§6.3.11, proposal "never
  // between stems"). Advancing just moves the pointer; §6.3.1's Start
  // control (below, gated by `awaitingStart`) still holds the next stem's
  // timer until the user taps it, same as the first stem. Reflection flows
  // carry no queue — their own completion effect below handles 'done'.
  //
  // The advance is an adjustment of state in response to the shared session
  // machine's phase change, so it happens during render (React's documented
  // "adjusting state when a value changes" pattern) instead of in an
  // effect, which would commit the advanced pointer in a second cascading
  // pass. `prevSessionPhase` keeps the trigger to actual phase changes,
  // exactly as the former effect's dependency array did.
  const [prevSessionPhase, setPrevSessionPhase] = useState(session.phase);
  if (session.phase !== prevSessionPhase) {
    setPrevSessionPhase(session.phase);
    if (session.phase === 'done' && queue !== null && !flow && !isLastInQueue) {
      setQueueIndex((i) => i + 1);
    }
  }

  const startPendingStem = () => {
    if (!pendingStem) return;
    setStartedIndex(queueIndex);
    session.start({ id: pendingStem.id, text: pendingStem.text, origin: stemOrigin });
  };

  // Reflection completion (§6.5.1/§6.5.2): the meta-stem session finished
  // (timeout, done, or resumed-elsewhere) — record the review with whatever
  // was written, nothing discarded (§6.3.8), and clear the override when it
  // selected this week (§6.2). Runs once per flow: guarded on the flow's
  // own phase, which moves to 'done' here.
  useEffect(() => {
    if (!flow || flow.phase !== 'writing' || session.phase !== 'done' || !session.state) return;

    const repo = getRepository();
    const reflectionText = session.state.endings[0]?.text ?? null;
    // t10 (owner decision 2026-09-22): the reflection COMPLETES only when the
    // meta-stem session produced at least one non-empty ending — the same
    // predicate the repository's completed-session reads apply (whitespace
    // reads as empty). The review row below is still recorded with whatever
    // was written (nothing discarded, §6.3.8); only the completion-keyed
    // override-clear is gated on content.
    const reflectionHasContent = session.state.endings.some((e) => e.text.trim().length > 0);
    const { at } = nowEventTime();
    if (flow.kind === 'weekly') {
      // The re-read span: the reviewed sessions' own span (§4.2's
      // period_start/period_end hold "what was re-read"; a programme week
      // is a stem block, not a date range, so the span is theirs).
      const starts = flow.reviewed.map((r) => r.session.started_at).sort();
      repo.createReview({
        periodStart: starts[0] ?? at,
        periodEnd: at,
        sessionIds: flow.reviewed.map((r) => r.session.id),
        metaStemText: flow.metaStem.text,
        reflectionText: reflectionText && reflectionText.length > 0 ? reflectionText : null,
        createdAt: at,
      });
      if (flow.clearOverride && reflectionHasContent) {
        repo.setSetting('program_week_override', null);
      }
      // Week-set activation (issue 04, coordinator-approved hub FLAG
      // 2026-09-16): the effective week's stems are the active ones.
      // Re-applied on every weekly completion — the override just cleared
      // back to the derived week, or the derived week just advanced (no
      // override set). Without it, one override cycle would leave every
      // later derived week resting and the morning practice queue empty.
      applyWeekSetActivation(repo);
    } else {
      const { start, end } = utcBoundsOfLocalDay(new Date());
      repo.createReview({
        periodStart: start,
        periodEnd: end,
        sessionIds: flow.reviewed.map((r) => r.session.id),
        metaStemText: flow.metaStem.text,
        reflectionText: reflectionText && reflectionText.length > 0 ? reflectionText : null,
        createdAt: at,
      });
    }
    setFlow({ ...flow, phase: 'done' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.phase, flow?.kind, session.phase, session.state]);

  // Assembles the badge reveal for the *last* stem in the practice landing
  // on 'done' — see badgeReveal.ts for why "before" is derived by
  // excluding this session's id rather than reading before the save (the
  // save already happened by the time this phase renders). The assembly is
  // derived at render time instead of stored in state (set-state-in-effect
  // debt pass, issue 17): it is a pure read of what the repository already
  // holds, memoized on exactly the guards that decide it. Those guards:
  // the session is done and persisted (`sessionId`), the practice-final
  // position, the Start gate not pending (W4's guard, generalized — a
  // render can still carry the previous (non-final) stem's 'done' while
  // the pointer is mid-advance; without this guard that stale 'done'
  // would read as "the practice finished" one stem early), and no
  // reflection flow (flows reveal no badges — same as the review screen's
  // meta-stem, §6.5.2's "normal timed session", not a gamified one).
  const newlyEarnedBadges = useMemo<BadgeDef[]>(
    () =>
      session.phase === 'done' && session.sessionId && isLastInQueue && !awaitingStart && !flow
        ? assembleNewlyEarnedBadges(getRepository(), session.sessionId)
        : [],
    [session.phase, session.sessionId, isLastInQueue, awaitingStart, flow],
  );

  // Drives the settle animation and, sequenced ~300ms later, the badge
  // reveal's fade+slide — only for the practice's final 'done' (the one that
  // actually renders the completion block below). Reduced motion: skip
  // straight to the final state, no animation at all. Same `!awaitingStart`
  // guard as the badge-assembly effect above, and for the same reason.
  useEffect(() => {
    if (session.phase !== 'done' || !isLastInQueue || awaitingStart || flow) return;
    if (reduceMotion) {
      settleAnim.setValue(1);
      badgeRevealAnim.setValue(1);
      return;
    }
    settleAnim.setValue(0);
    badgeRevealAnim.setValue(0);
    Animated.spring(settleAnim, {
      toValue: 1,
      friction: 10,
      tension: 60,
      useNativeDriver: true,
    }).start();
    // Badge reveal starts ~300ms after the settle animation begins
    // (sequenced, not simultaneous — proposal §2).
    const badgeTimer = setTimeout(() => {
      Animated.timing(badgeRevealAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }, 300);
    return () => clearTimeout(badgeTimer);
  }, [session.phase, isLastInQueue, awaitingStart, flow, reduceMotion, settleAnim, badgeRevealAnim]);

  useEffect(() => {
    if (session.phase === 'active') {
      // Give the field a beat to mount before focusing.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [session.phase, session.state?.activeOrdinal]);

  // Packet-3 t5 (d10-04): when the session machine ends a session on its
  // own — the timer's timeout auto-advance, or Done — the focused field's
  // IME used to stay up over whatever came next (the next stem's prep
  // gate, or the completion block). Dismiss once per 'done' transition;
  // a no-op when no keyboard is showing. Covers the practice path and the
  // reflection flows alike — they share this hook.
  useEffect(() => {
    if (session.phase === 'done') Keyboard.dismiss();
  }, [session.phase]);

  if (eveningOff) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default" themeColor="textSecondary">
            Evening practice is turned off. You can turn it on in Settings.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (flow) {
    return (
      <ReflectionFlowView
        flow={flow}
        session={session}
        terminator={terminator}
        inputRef={inputRef}
        onBegin={() => {
          if (!flow.metaStem) return;
          const timerSeconds = getRepository().getSettings().review_timer_seconds;
          setFlow({ ...flow, phase: 'writing' });
          session.start({
            id: flow.metaStem.id,
            text: flow.metaStem.text,
            origin: 'review',
            configOverrides: { targetEndings: 1, timerSeconds },
          });
        }}
      />
    );
  }

  if (queue !== null && queue.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default" themeColor="textSecondary">
            No stems set for this time of day yet. Add one from the stem library.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (queue === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} />
      </ThemedView>
    );
  }

  const stemText = awaitingStart ? (pendingStem?.text ?? '') : (session.stemText ?? '');
  const targetEndings = session.state?.config.targetEndings ?? 0;

  const submittedEndings = session.state?.endings.filter((e) => e.submittedAt !== null) ?? [];

  const timerSeconds = session.state?.config.timerSeconds ?? 1;
  const stemTimerSeconds = session.state?.config.stemTimerSeconds ?? null;
  const progress = session.phase === 'active' ? Math.max(0, Math.min(1, session.remainingSeconds / timerSeconds)) : 0;
  const stemProgress =
    session.phase === 'active' && stemTimerSeconds && session.stemRemainingSeconds !== null
      ? Math.max(0, Math.min(1, session.stemRemainingSeconds / stemTimerSeconds))
      : null;
  const pressureFraction = stemProgress ?? progress;
  const pressureColor = session.phase === 'active' ? pressureColorAt(1 - pressureFraction, resolvedScheme) : undefined;

  // Enter submits the ending (2026-09-11 addition, §6.3.4): the input is
  // `multiline` so it wraps a long sentence, which means the platform
  // delivers the return key as a trailing "\n" via onChangeText rather than
  // firing onSubmitEditing (onSubmitEditing still covers iOS's fast path
  // when it does fire). Strip the newline and submit the result directly —
  // `submitActive`'s override param avoids racing the not-yet-committed
  // state that a separate `changeActiveText` call would leave stale.
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
          {/*
            Pinned top strip (LC8/W1/W2): the practice's position and the
            running session timer, below the safe area and outside the
            scrolling stack, so neither ever scrolls out of view. Doubles as
            write's "header" (LC2) — the exit affordance below is only shown
            before a stem's Start is tapped; once writing is under way,
            "Done" (in the pinned bottom bar) is the single exit affordance
            (§10), so an equally-visible second exit here would invite a
            session left dangling open.
          */}
          <ThemedView style={styles.topStrip}>
            {awaitingStart && (
              <ThemedView style={styles.exitRow}>
                <Pressable
                  onPress={() => router.back()}
                  hitSlop={12}
                  style={styles.exitButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Close
                  </ThemedText>
                </Pressable>
              </ThemedView>
            )}
            <WriteTimerStrip
              positionLabel={queue.length > 1 ? `Stem ${queueIndex + 1} of ${queue.length}` : undefined}
              progress={session.phase === 'active' ? progress : undefined}
              timeLabel={session.phase === 'active' ? formatMMSS(session.remainingSeconds) : undefined}
              timeColor={pressureColor}
            />
          </ThemedView>

          <ScrollView
            style={styles.flexOne}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText type="stem">
              {stemText}
              {terminator}
            </ThemedText>

            {/*
              Purpose framing (v12 issue 02, owner feedback 2026-09-16): one
              line saying what the exercise is for, and only at the Start
              gate (§13.4: nothing during writing that evaluates or
              distracts; §6.3 keeps the active-writing screen bare). Small,
              dimmed, copy-only, and gone the moment Start is tapped.
            */}
            {awaitingStart && (
              <ThemedText type="small" themeColor="textSecondary">
                A few minutes of unedited writing for self-awareness and self-esteem.
              </ThemedText>
            )}

            {/*
              Read-only text, not inputs: there is no control that lets the
              user navigate back into an earlier ending (§6.3.6). Hidden
              while `awaitingStart`: `session.state` still holds the *just-
              finished* stem's endings until `start()` runs for the pending
              one (W4) — showing them here would stack the previous stem's
              writing under the next stem's Start gate.
            */}
            {!awaitingStart &&
              submittedEndings.map((e) => (
                <ThemedText
                  key={e.ordinal}
                  type="stem"
                  themeColor="textSecondary"
                  style={[styles.pastEnding, { borderTopColor: theme.border }]}
                >
                  {e.text}
                </ThemedText>
              ))}
          </ScrollView>

          {/*
            Pinned bottom (LC8): whichever control belongs to the current
            moment — Start, the writing controls, or the completion block —
            occupies this one fixed slot above the keyboard, never after the
            scrolling stack.
          */}
          <ThemedView style={styles.bottomBar}>
            {awaitingStart && <Button label="Start" onPress={startPendingStem} />}

            {session.phase === 'active' && (
              <WriteActionBar
                inputRef={inputRef}
                value={session.activeText}
                onChangeText={handleChangeText}
                onSubmitEditing={() => session.submitActive()}
                stemProgress={stemProgress}
                onDone={session.finishNow}
                endingsWritten={submittedEndings.length}
                endingsTarget={targetEndings}
              />
            )}

            {session.phase === 'done' && isLastInQueue && !awaitingStart && (
              <ThemedView style={styles.doneBlock}>
                <Animated.View
                  style={{
                    opacity: settleAnim,
                    transform: [{ scale: settleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                  }}
                >
                  {/* Packet-3 t9 (routed from the t5 verdict via the t10 row,
                      packet-2 C8): the acknowledgment names its object — the
                      bare "Saved." said nothing. Quiet, no evaluation
                      (§13.4); settings' own saved notice keeps "Saved."
                      (different object, not this item). */}
                  <ThemedText type="default" themeColor="textSecondary">
                    Session saved.
                  </ThemedText>
                  {session.state?.endedAt && (
                    // Computed at read time from the session's own timestamps
                    // (§13.7 — never store a derived value); quiet, descriptive,
                    // no praise (§13.4).
                    <ThemedText type="small" themeColor="textSecondary">
                      {sessionDurationLabel(session.state.startedAt, session.state.endedAt, submittedEndings.length)}
                    </ThemedText>
                  )}
                </Animated.View>

                {/*
                  Badge reveal (gamification proposal §1.A/§1.B): only the
                  badges newly crossed by *this* completion, computed fresh
                  each render (§13.7) — reopening the app later shows nothing
                  here, which is correct, not a bug. Multiple new badges stack
                  vertically.
                */}
                {newlyEarnedBadges.length > 0 && (
                  <Animated.View
                    style={[
                      styles.badgeReveal,
                      {
                        opacity: badgeRevealAnim,
                        transform: [
                          { translateY: badgeRevealAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                        ],
                      },
                    ]}
                  >
                    {newlyEarnedBadges.map((badge) => (
                      <BadgeCard key={badge.id} badge={badge} earned />
                    ))}
                  </Animated.View>
                )}

                <Button label="Close" onPress={() => router.back()} />
              </ThemedView>
            )}
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * The reflection flows' reread phase and meta-stem session (§6.5): the
 * same pinned primitives as write's practice path and review's meta-stem
 * (`WriteTimerStrip` / `WriteActionBar`) — the reflection stem is
 * deliberately "a normal timed session" (§6.5.2), not a bespoke screen.
 * The reread is read-only (§6.5's quiet list: stem + dim endings), and the
 * exit affordance exists only before the reflection starts (§6.3.1:
 * nothing is timed until Start/Continue).
 */
function ReflectionFlowView({
  flow,
  session,
  terminator,
  inputRef,
  onBegin,
}: {
  flow: ReflectionFlow;
  session: ReturnType<typeof useWritingSession>;
  terminator: string;
  inputRef: React.RefObject<TextInput | null>;
  onBegin: () => void;
}) {
  const router = useRouter();
  const theme = useTheme();
  const resolvedScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  if (flow.phase === 'done') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView style={styles.scrollContent}>
            <ThemedText type="default" themeColor="textSecondary">
              Session saved.
            </ThemedText>
            <Button label="Close" onPress={() => router.back()} />
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (flow.phase === 'reread') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView style={styles.topStrip}>
            <ThemedView style={styles.exitRow}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={12}
                style={styles.exitButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <ThemedText type="small" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </ThemedView>
            <WriteTimerStrip
              positionLabel={flow.kind === 'weekly' ? `Week ${flow.week ?? '?'} review` : 'Evening reflection'}
            />
          </ThemedView>

          <ScrollView style={styles.flexOne} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {flow.reviewed.length === 0 ? (
              <ThemedText type="default" themeColor="textSecondary">
                {flow.kind === 'weekly'
                  ? `Nothing written in week ${flow.week ?? '?'} yet. The reflection is still open to you.`
                  : 'Nothing written this morning. The reflection is still open to you.'}
              </ThemedText>
            ) : (
              flow.reviewed.map(({ session: s, endings }) => (
                <Card key={s.id} style={styles.reviewedCard}>
                  <ThemedText type="eyebrow">
                    {formatDate(s.started_at)} · {endings.length === 1 ? '1 ending' : `${endings.length} endings`}
                  </ThemedText>
                  <ThemedText type="stem">{s.stem_text_snapshot}</ThemedText>
                  {endings.map((e) => (
                    <ThemedText
                      key={e.id}
                      type="stem"
                      themeColor="textSecondary"
                      style={[styles.pastEnding, { borderTopColor: theme.border }]}
                    >
                      {e.text || '(nothing written)'}
                    </ThemedText>
                  ))}
                </Card>
              ))
            )}
          </ScrollView>

          <ThemedView style={styles.bottomBar}>
            <Button label="Continue" onPress={onBegin} />
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // 'writing' — the meta-stem as a normal timed session (§6.5.2).
  const timerSeconds = session.state?.config.timerSeconds ?? 1;
  const stemTimerSeconds = session.state?.config.stemTimerSeconds ?? null;
  const progress = session.phase === 'active' ? Math.max(0, Math.min(1, session.remainingSeconds / timerSeconds)) : 0;
  const stemProgress =
    session.phase === 'active' && stemTimerSeconds && session.stemRemainingSeconds !== null
      ? Math.max(0, Math.min(1, session.stemRemainingSeconds / stemTimerSeconds))
      : null;
  const pressureFraction = stemProgress ?? progress;
  const pressureColor = session.phase === 'active' ? pressureColorAt(1 - pressureFraction, resolvedScheme) : undefined;

  const submittedEndings = session.state?.endings.filter((e) => e.submittedAt !== null) ?? [];

  // Enter submits the ending — same trailing-newline path as the practice
  // (§6.3.4's return key).
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
              positionLabel={flow.kind === 'weekly' ? `Week ${flow.week ?? '?'} reflection` : 'Evening reflection'}
              progress={session.phase === 'active' ? progress : undefined}
              timeLabel={session.phase === 'active' ? formatMMSS(session.remainingSeconds) : undefined}
              timeColor={pressureColor}
            />
          </ThemedView>

          <ScrollView style={styles.flexOne} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <ThemedText type="stem">
              {session.stemText ?? ''}
              {terminator}
            </ThemedText>
            {submittedEndings.map((e) => (
              <ThemedText
                key={e.ordinal}
                type="stem"
                themeColor="textSecondary"
                style={[styles.pastEnding, { borderTopColor: theme.border }]}
              >
                {e.text}
              </ThemedText>
            ))}
          </ScrollView>

          <ThemedView style={styles.bottomBar}>
            {session.phase === 'active' && (
              <WriteActionBar
                inputRef={inputRef}
                value={session.activeText}
                onChangeText={handleChangeText}
                onSubmitEditing={() => session.submitActive()}
                inputAccessibilityLabel="Your reflection"
                placeholder="Keep the pen moving."
                stemProgress={stemProgress}
                onDone={session.finishNow}
              />
            )}

            {session.phase === 'done' && (
              <ThemedView style={styles.doneBlock}>
                <ThemedText type="default" themeColor="textSecondary">
                  Session saved.
                </ThemedText>
                {/* The completion effect records the review row and flips the
                    flow to 'done' — this frame only shows while that is in
                    flight, so no extra control is offered here. */}
              </ThemedView>
            )}
          </ThemedView>
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
  // Pinned top (LC8): horizontal inset matches the scroll column below so
  // the strip's content lines up with the stem/endings edge (LC1's 24pt
  // grid); the scroll column carries its own top padding, so this only
  // needs bottom breathing room to separate from it.
  topStrip: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  reviewedCard: {
    gap: Spacing.two,
  },
  // Pinned bottom (LC8): `SafeAreaView` already insets the home indicator;
  // this only needs top breathing room to separate from the scroll column
  // and the `KeyboardAvoidingView` above adds the rest when the keyboard
  // shows.
  bottomBar: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  exitRow: {
    alignItems: 'flex-end',
  },
  exitButton: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  // W3: each previously-written ending is its own dim, separated row — a
  // hairline top divider (decorative-only `border` token, not a text
  // pairing — see theme.ts) rather than color/weight, so the stack reads as
  // ordered rows instead of one undifferentiated text block.
  pastEnding: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  doneBlock: {
    gap: Spacing.three,
  },
  badgeReveal: {
    gap: Spacing.two,
  },
});

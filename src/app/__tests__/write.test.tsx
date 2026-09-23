import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import WriteScreen from '@/app/write';
import { type Settings, type StemRow } from '@/db';
import type { BadgeSession } from '@/session/badges';

// Route params are per-test (morning practice, evening/weekly reflection,
// one-off week, solo write, bare deep link) — a mock-prefixed holder so
// jest.mock's factory can reach it despite hoisting.
const mockParams: { value: Record<string, string> } = { value: {} };

// One shared router spy (w1-t2): the empty state's way-back buttons navigate
// imperatively via router.push, so assertions need the component's push to BE
// a spy — a fresh object per call made it unreachable. Cleared per test.
const mockRouter = { back: jest.fn(), push: jest.fn() };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams.value,
  useRouter: () => mockRouter,
}));

function makeStem(id: string, text: string, weekNumber: number): StemRow {
  return { id, text, origin: 'seed', category: null, weight: 1, time_of_day: 'morning' };
}

// jest.mock()'s factory below can't close over module-scope variables unless
// they're prefixed `mock*` — see jest's hoisting rule.
const mockStemA = makeStem('stem-a', 'If I give this mock practice my full attention', 1);
const mockStemB = makeStem('stem-b', 'If I treat this mock test stem responsibly', 1);
const mockStemC = makeStem('stem-c', 'If I notice how this mock third stem reads', 1);
const mockWeek2Stem = makeStem('stem-w2', 'If this mock week-two stem behaves in tests', 2);
const mockUserStem = { ...makeStem('stem-user', 'My own made-up stem is', 0), origin: 'user' as const };
/** An evening-tagged pick: a real pick, but never in the morning queue (the solo-fallback test's stem). */
const mockEveningPick = { ...makeStem('stem-eve', 'My evening pick is', 0), origin: 'user' as const, time_of_day: 'evening' as const };
/** A D7 evening starter: seed-origin, evening-tagged, active — the starter set becomes evening pick material (design §8.1). */
const mockEveningStarter = { ...makeStem('stem-starter', 'My invented starter line for the mock evening is', 0), time_of_day: 'evening' as const };
const mockWeeklyMeta = makeStem('meta-weekly', 'If this mock weekly reflection stem renders its review', 0);
const mockEveningA = { ...makeStem('meta-evening-a', 'In my body right now I feel', 0), origin: 'meta' as const };
const mockEveningB = { ...makeStem('meta-evening-b', 'Right now I am aware of', 0), origin: 'meta' as const };

/** A session row left open seconds ago — ADR-0001's resumable shape. */
function openSessionRow(
  stemId: string,
  text: string,
  overrides: { secondsAgo?: number; origin?: string; targetEndings?: number } = {},
) {
  const now = Date.now();
  return {
    session: {
      id: 'open-session',
      stem_id: stemId,
      stem_text_snapshot: text,
      origin: overrides.origin ?? 'manual',
      target_endings: overrides.targetEndings ?? 6,
      timer_seconds: 600,
      uncensored_mode: 0,
      started_at: new Date(now - ((overrides.secondsAgo ?? 30) + 60) * 1000).toISOString(),
      first_keypress_at: null,
      ended_at: null,
      end_reason: null,
      last_activity_at: new Date(now - (overrides.secondsAgo ?? 30) * 1000).toISOString(),
      tz: 'Europe/Berlin',
      offset_min: 120,
      device_locale: 'en-US',
      deleted_at: null,
    },
    endings: [],
  };
}

const mockRepoState: {
  settings: Partial<Settings>;
  openSession: ReturnType<typeof openSessionRow> | null;
  firstPractice: { startedAt: string; offsetMin: number } | null;
  weeklyReflections: { startedAt: string; offsetMin: number }[];
  eveningReflections: { startedAt: string; offsetMin: number }[];
  reviewedMorning: { session: { id: string; started_at: string; stem_text_snapshot: string }; endings: { id: string; text: string }[] }[];
  reviewedWeek: { session: { id: string; started_at: string; stem_text_snapshot: string }; endings: { id: string; text: string }[] }[];
  createdSessions: { origin: string; stemId: string }[];
  createdReviews: { input: Record<string, unknown> }[];
  settingWrites: [string, unknown][];
  activationCalls: number[];
  /** w1-t2 empty-state seam: when non-null, getProgrammeStemsForWeek returns this — an emptied effective week (s1-F4) without coupling the test to week derivation. */
  weekStems: StemRow[] | null;
  /** w1-t4 seam: when non-null, listMetaStems returns this — the post-filter shape (a soft-deleted evening meta-stem's row excluded) without touching the shared default list other tests rely on. */
  metaStems: StemRow[] | null;
  /** w1-t4 seam: when non-null, listAllStems returns this — the real read's contract (every stem, soft-deleted included) so a deleted row is distinguishable from a missing one. */
  allStems: (StemRow & { active: number; deleted_at: string | null; created_at: string })[] | null;
  /** Badge-reveal seam (issue 17): rows `listSessionsForStats` would return, and whether the just-finalized session is wired into them. */
  priorStatsSessions: BadgeSession[];
  statsCompleteLastSession: boolean;
  lastCreatedSessionId: string | null;
} = {
  settings: {},
  openSession: null,
  firstPractice: null,
  weeklyReflections: [],
  eveningReflections: [],
  reviewedMorning: [],
  reviewedWeek: [],
  createdSessions: [],
  priorStatsSessions: [],
  statsCompleteLastSession: false,
  lastCreatedSessionId: null,
  createdReviews: [] as never as { input: Record<string, unknown> }[],
  settingWrites: [],
  activationCalls: [],
  weekStems: null,
  metaStems: null,
  allStems: null,
};

// The issue's standing note: the @/db jest mock must carry every repository
// method the screen's read paths call — the programme reads are all stubbed
// here (the reads against real SQLite live in programRepository.test.ts).
jest.mock('@/db', () => {
  const actual = jest.requireActual<typeof import('@/db')>('@/db');
  let nextSessionId = 0;
  return {
    ...actual,
    getRepository: () => ({
      getSettings: () => ({ ...actual.DEFAULT_SETTINGS, ...mockRepoState.settings }),
      getOpenSession: () => mockRepoState.openSession,
      // §6.2 week derivation inputs
      getFirstProgrammePractice: () => mockRepoState.firstPractice,
      listCompletedWeeklyReflections: () => mockRepoState.weeklyReflections,
      listCompletedEveningReflections: () => mockRepoState.eveningReflections,
      // Practices
      getProgrammeStemsForWeek: (week: number) =>
        mockRepoState.weekStems !== null
          ? mockRepoState.weekStems
          : week === 1
            ? [mockStemA, mockStemB, mockStemC]
            : week === 2
              ? [mockWeek2Stem]
              : [],
      // One-off week visit (issue 04): the whole block, resting included.
      getProgrammeWeekBlock: (week: number) =>
        week === 1 ? [mockStemA, mockStemB, mockStemC] : week === 2 ? [mockWeek2Stem] : [],
      listMetaStems: () => mockRepoState.metaStems ?? [mockWeeklyMeta, mockEveningA, mockEveningB],
      getWeeklyMetaStem: () => mockWeeklyMeta,
      // Reflection rereads
      listSessionsForDayMorning: () => mockRepoState.reviewedMorning,
      listSessionsForProgrammeWeek: () => mockRepoState.reviewedWeek,
      countProgrammeStemsCompletedInRange: () => 0,
      // Solo fallback + library single-stem writes. The w1-t4 seam stands in
      // for the real read's full shape (soft-deleted rows included) when a
      // test needs a deleted row visible to listAllStems but not listMetaStems.
      listAllStems: () =>
        mockRepoState.allStems ??
        [mockStemA, mockStemB, mockStemC, mockWeek2Stem, mockUserStem, mockEveningStarter, mockEveningPick].map((s) => ({
          ...s,
          active: 1,
          deleted_at: null,
          created_at: '2026-09-01T06:00:00.000Z',
        })),
      // Badge-reveal seam (issue 17): the completion screen's newly-earned
      // diff reads completed sessions, the last review, and user stems.
      // The just-finalized session is wired in only when a test asks for
      // it (statsCompleteLastSession) — its shape mirrors listSessionsForStats.
      listSessionsForStats: () => {
        if (!mockRepoState.lastCreatedSessionId || !mockRepoState.statsCompleteLastSession) return mockRepoState.priorStatsSessions;
        return [
          ...mockRepoState.priorStatsSessions,
          {
            id: mockRepoState.lastCreatedSessionId,
            stemId: 'stem-a',
            category: null,
            origin: 'manual' as const,
            targetEndings: 1,
            uncensoredMode: false,
            startedAt: '2026-09-01T06:00:00.000Z',
            endedAt: '2026-09-01T06:02:00.000Z',
            endReason: 'user_done' as const,
            tz: 'Europe/Berlin',
            offsetMin: 120,
            endings: [{ text: 'one submitted ending' }],
          },
        ];
      },
      getLastReviewAt: () => null,
      // Writes
      createSession: (input: { origin: string; stemId: string }) => {
        const id = `session-${++nextSessionId}`;
        mockRepoState.createdSessions.push({ origin: input.origin, stemId: input.stemId });
        mockRepoState.lastCreatedSessionId = id;
        return id;
      },
      createReview: (input: Record<string, unknown>) => {
        mockRepoState.createdReviews.push({ input });
        return 'review-1';
      },
      setSetting: (key: string, value: unknown) => {
        mockRepoState.settingWrites.push([key, value]);
      },
      setProgrammeWeekActive: (week: number) => {
        mockRepoState.activationCalls.push(week);
      },
      getHighestUnlockedWeek: () => 0,
      recordFirstKeypress: () => {},
      autosaveEndingText: () => {},
      submitEnding: () => {},
      finalizeSession: () => {},
    }),
  };
});

beforeEach(() => {
  mockParams.value = {};
  mockRepoState.settings = {};
  mockRepoState.openSession = null;
  mockRepoState.firstPractice = null;
  mockRepoState.weeklyReflections = [];
  mockRepoState.eveningReflections = [];
  mockRepoState.reviewedMorning = [];
  mockRepoState.reviewedWeek = [];
  mockRepoState.createdSessions = [];
  mockRepoState.priorStatsSessions = [];
  mockRepoState.statsCompleteLastSession = false;
  mockRepoState.lastCreatedSessionId = null;
  mockRepoState.createdReviews = [];
  mockRepoState.settingWrites = [];
  mockRepoState.activationCalls = [];
  mockRepoState.weekStems = null;
  mockRepoState.metaStems = null;
  mockRepoState.allStems = null;
  mockRouter.back.mockClear();
  mockRouter.push.mockClear();
});

describe('WriteScreen — practices', () => {
  // W4 regression (layout-audit-2026-09-15): `session.state.endings` isn't
  // cleared until the next `start()`, so the queue-advance effect used to
  // land on the next stem's Start gate with the *previous* stem's endings
  // still stacked underneath. write.tsx now hides the stack while
  // `awaitingStart` — this drives one stem to completion and asserts the
  // next stem's gate is clean.
  it('shows a clean Start gate for the next stem — no stale endings from the previous one', async () => {
    mockParams.value = { timeOfDay: 'morning' };
    mockRepoState.settings = { endings_per_session: 1 }; // one submitted ending completes each stem
    render(<WriteScreen />);

    await screen.findByText(/Stem 1 of 4/);
    await screen.findByText(/My own made-up stem is/);
    fireEvent.press(screen.getByText('Start'));

    const input = await screen.findByLabelText('Your ending');
    // 2026-09-15 owner decision (cycle 2): the countdown Save button is
    // gone — regression pin that it never reappears after Start. Submission
    // is the return key: the multiline field's trailing "\n" drives
    // `submitActive` (§6.3.4's "return key, or a Next control").
    expect(screen.queryByLabelText('Save this ending')).toBeNull();
    fireEvent.changeText(input, 'a stray thought I keep circling back to\n');

    await screen.findByText(/Stem 2 of 4/);
    await screen.findByText(/If I give this mock practice my full attention/);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.queryByText('a stray thought I keep circling back to')).toBeNull();
  });

  it('carries one line of purpose framing at the Start gate, absent during writing (v12 issue 02)', async () => {
    const purpose = 'A few minutes of unedited writing for self-awareness and self-esteem.';
    mockParams.value = { timeOfDay: 'morning' };
    render(<WriteScreen />);

    await screen.findByText(/Stem 1 of 4/);
    expect(screen.getByText(purpose)).toBeTruthy();

    // Active writing is bare (§6.3, §13.4): the purpose line belongs on the
    // gate only, never mid-flow.
    fireEvent.press(screen.getByText('Start'));
    await screen.findByLabelText('Your ending');
    expect(screen.queryByText(purpose)).toBeNull();
  });

  it('the morning practice composes picks first, then the effective week’s block (D1)', () => {
    mockParams.value = { timeOfDay: 'morning' };
    render(<WriteScreen />);
    expect(screen.getByText(/Stem 1 of 4/)).toBeTruthy();
    expect(screen.getByText(/My own made-up stem is/)).toBeTruthy();
  });

  it('a bare /write defaults to the morning practice instead of a blank screen', () => {
    render(<WriteScreen />);
    expect(screen.getByText(/My own made-up stem is/)).toBeTruthy();
  });

  it('one-off week practice: /write?week=2 loads that week’s block as manual sessions', () => {
    mockParams.value = { week: '2' };
    render(<WriteScreen />);
    expect(screen.getByText(/If this mock week-two stem behaves in tests/)).toBeTruthy();
    expect(mockRepoState.createdSessions).toEqual([]); // nothing created before Start (§6.3.1)
    fireEvent.press(screen.getByText('Start'));
    expect(mockRepoState.createdSessions).toEqual([{ origin: 'manual', stemId: mockWeek2Stem.id }]);
  });

  // w1-t2 (s1-F4 + s2-2, D5): the empty practice path stays reachable by
  // design — the guard keeps ≥1 stem active globally, so a week can empty
  // out (s5 #6). The screen must then name the real cause (not the old
  // "No stems set", which blamed the user's setup) and offer both ways back:
  // the stem library and the week screen, each firing its route.
  it('an emptied effective week names the cause and offers both ways back (w1-t2)', () => {
    mockParams.value = { timeOfDay: 'morning' };
    mockRepoState.weekStems = []; // the effective week's programme-stem read returns nothing
    mockRepoState.allStems = []; // …and no picks either — the queue is truly empty (D1 composition)
    render(<WriteScreen />);

    expect(screen.getByText('Nothing is active for this practice right now.')).toBeTruthy();
    expect(screen.queryByText(/No stems set for this time of day yet/)).toBeNull();

    fireEvent.press(screen.getByLabelText('Re-activate stems in the library'));
    expect(mockRouter.push).toHaveBeenCalledWith('/stems');
    fireEvent.press(screen.getByLabelText('Choose a different week'));
    expect(mockRouter.push).toHaveBeenCalledWith('/week');
  });

  it('resumes an interrupted practice at its position, not from the top (ADR-0001 + §6.2)', async () => {
    mockParams.value = { timeOfDay: 'morning' };
    mockRepoState.openSession = openSessionRow(mockStemB.id, mockStemB.text);
    render(<WriteScreen />);

    // The composed queue (D1): pick, block stems in seed order — B sits third.
    await screen.findByText(/Stem 3 of 4/);
    expect(screen.getByText(/If I treat this mock test stem responsibly/)).toBeTruthy();
    // Resumed sessions are already active — no Start gate on a running timer.
    expect(screen.getByLabelText('Your ending')).toBeTruthy();
  });

  it('resumes a pick into the composed morning practice, not the solo fallback (D1: one composition for start and resume)', async () => {
    mockRepoState.openSession = openSessionRow(mockUserStem.id, mockUserStem.text);
    render(<WriteScreen />);
    // The pick leads the composed queue — resuming it continues the practice,
    // it does not fall through to a one-stem solo queue.
    await screen.findByText(/Stem 1 of 4/);
    await screen.findByText(/My own made-up stem is/);
    expect(screen.getByLabelText('Your ending')).toBeTruthy();
  });

  it('resumes an evening-tagged solo library write as a one-stem queue (never in the morning composition)', async () => {
    mockRepoState.openSession = openSessionRow(mockEveningPick.id, mockEveningPick.text);
    render(<WriteScreen />);
    await screen.findByText(/My evening pick is/);
    expect(screen.getByLabelText('Your ending')).toBeTruthy();
  });
});

describe('WriteScreen — evening reflection (§6.2/§6.5.2)', () => {
  function reviewedMorning() {
    return [
      {
        session: { id: 'morning-1', started_at: '2026-09-16T06:00:00.000Z', stem_text_snapshot: 'If I give this mock practice my full attention' },
        endings: [{ id: 'e1', text: 'I noticed the light change on my desk' }],
      },
    ];
  }

  // w2-t5 / D7: the full evening composition — reread → reflection meta-stem
  // → the evening picks, as a flow-INTERNAL picks phase (the practice queue
  // renders the picks while the flow stays set, so the reflection's no-badge
  // semantics §6.5.2 hold). The review row records at reflection completion,
  // scoped to the REREAD's sessions — the picks are ordinary sessions
  // written after it and never widen the row.
  it('composes reread → reflection → evening picks (D7); the review row stays scoped to the reread and no badge arms', async () => {
    mockParams.value = { timeOfDay: 'evening' };
    mockRepoState.settings = { endings_per_session: 1 };
    mockRepoState.reviewedMorning = reviewedMorning() as never;
    // If the flow were nulled at the picks handoff, the final pick's done
    // WOULD assemble badges from this history — the null assertion below is
    // what pins the flow-internal phase (the declined queue-handoff shape).
    mockRepoState.statsCompleteLastSession = true;
    render(<WriteScreen />);

    // Reread phase: today's morning endings, read-only, then Continue.
    await screen.findByText(/If I give this mock practice my full attention/);
    expect(screen.getByText('I noticed the light change on my desk')).toBeTruthy();
    fireEvent.press(screen.getByText('Continue'));

    // The alternating reflection stem: first evening (count 0 → stem A).
    await screen.findByText(/In my body right now I feel/);
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'tired in a settled way\n');

    // D7: the flow-internal picks phase — the first evening pick's Start
    // gate (the starter, in listAllStems order), not the flow's done screen.
    await screen.findByText(/My invented starter line for the mock evening is/);
    expect(screen.getByText('Start')).toBeTruthy();
    // The review row recorded at reflection completion, scoped to the reread.
    expect(mockRepoState.createdReviews).toHaveLength(1);
    const review = mockRepoState.createdReviews[0].input;
    expect(review.sessionIds).toEqual(['morning-1']);
    expect(review.metaStemText).toBe(mockEveningA.text);
    expect(review.reflectionText).toBe('tired in a settled way');
    // The evening flow never touches the override (§6.2 clearing is weekly-only).
    expect(mockRepoState.settingWrites).toEqual([]);
    // Nothing created for the picks before their Start gate (§6.3.1) — the
    // only session so far is the meta-stem's own (the review machinery's).
    expect(mockRepoState.createdSessions).toEqual([{ origin: 'review', stemId: mockEveningA.id }]);
    fireEvent.press(screen.getByText('Start'));
    expect(mockRepoState.createdSessions).toEqual([
      { origin: 'review', stemId: mockEveningA.id },
      { origin: 'manual', stemId: mockEveningStarter.id },
    ]);

    // Pick 1 completes → pick 2's gate (the user pick), through the same queue.
    const pickInput = await screen.findByLabelText('Your ending');
    fireEvent.changeText(pickInput, 'one line about the day\n');
    await screen.findByText(/My evening pick is/);
    fireEvent.press(screen.getByText('Start'));
    const pickInput2 = await screen.findByLabelText('Your ending');
    fireEvent.changeText(pickInput2, 'another line about the evening\n');

    // The flow's done screen — and no badge reveal: the flow stayed set
    // through the picks (§6.5.2), so the celebration machinery never arms,
    // even though the final pick crossed first_words/six_endings above.
    await screen.findByText('Session saved.');
    expect(screen.queryByText('First Words')).toBeNull();
    expect(screen.queryByText('Six Endings')).toBeNull();
    // The picks added sessions, never a second review row.
    expect(mockRepoState.createdReviews).toHaveLength(1);
    expect(mockRepoState.createdSessions).toEqual([
      { origin: 'review', stemId: mockEveningA.id },
      { origin: 'manual', stemId: mockEveningStarter.id },
      { origin: 'manual', stemId: mockEveningPick.id },
    ]);
  });

  // D7's "always available" + the quiet-morning pin (:383-387) composed: with
  // NO evening-tagged picks the flow ends at the reflection — no picks stage
  // renders, no Start gate appears. Green on the pre-w2t5 tree by design
  // (the base flow had no picks stage at all); labeled guard, it pins the
  // empty-picks SHAPE against regressions in the new phase logic.
  it('an evening with no evening-tagged picks ends at the reflection — no picks stage (D7: the reflection stays available)', async () => {
    mockParams.value = { timeOfDay: 'evening' };
    mockRepoState.settings = { endings_per_session: 1 };
    mockRepoState.allStems = [mockStemA, mockUserStem].map((s) => ({
      ...s,
      active: 1,
      deleted_at: null,
      created_at: '2026-09-01T06:00:00.000Z',
    }));
    render(<WriteScreen />);

    await screen.findByText(/Nothing written this morning/);
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByText(/In my body right now I feel/);
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'settled\n');

    await screen.findByText('Session saved.');
    expect(screen.queryByText('Start')).toBeNull(); // no picks stage
    expect(mockRepoState.createdReviews).toHaveLength(1);
    // Only the meta-stem session was created (the review machinery's own);
    // the picks queue never filled.
    expect(mockRepoState.createdSessions).toEqual([{ origin: 'review', stemId: mockEveningA.id }]);
  });

  it('offers the reflection stem even on a quiet morning (no guilt, §13.4)', async () => {
    mockParams.value = { timeOfDay: 'evening' };
    render(<WriteScreen />);
    await screen.findByText(/Nothing written this morning/);
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByText(/In my body right now I feel/);
  });

  it('alternates: after one completed evening reflection, stem B is next', async () => {
    mockParams.value = { timeOfDay: 'evening' };
    mockRepoState.eveningReflections = [{ startedAt: '2026-09-15T19:00:00.000Z', offsetMin: 120 }];
    render(<WriteScreen />);
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByText(/Right now I am aware of/);
  });

  it('stays calm when evening practice is disabled (§6.2 gate lives here, c03 gates the notification)', () => {
    mockParams.value = { timeOfDay: 'evening' };
    mockRepoState.settings = { evening_practice_enabled: false };
    render(<WriteScreen />);
    expect(screen.getByText('Evening practice is turned off. You can turn it on in Settings.')).toBeTruthy();
    expect(screen.queryByText('Continue')).toBeNull();
  });
});

describe('WriteScreen — weekly reflection (/write?origin=weekly, §6.5.1)', () => {
  function reviewedWeek() {
    return [
      {
        session: { id: 'week1-1', started_at: '2026-09-14T06:00:00.000Z', stem_text_snapshot: 'If I give this mock practice my full attention' },
        endings: [{ id: 'e1', text: 'I actually looked up from my screen at lunch' }],
      },
    ];
  }

  it('reviews the week, then the weekly meta-stem, and clears a matching override on completion', async () => {
    mockParams.value = { origin: 'weekly' };
    mockRepoState.firstPractice = { startedAt: '2026-09-01T06:00:00.000Z', offsetMin: 120 };
    mockRepoState.reviewedWeek = reviewedWeek() as never;
    mockRepoState.settings = { program_week_override: 1 };
    render(<WriteScreen />);

    await screen.findByText(/Week 1 review/);
    await screen.findByText(/If I give this mock practice my full attention/);
    fireEvent.press(screen.getByText('Continue'));

    await screen.findByText(/If this mock weekly reflection stem renders its review/);
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'the week kept asking the same question\n');

    await screen.findByText('Session saved.');
    expect(mockRepoState.createdReviews).toHaveLength(1);
    const review = mockRepoState.createdReviews[0].input;
    expect(review.sessionIds).toEqual(['week1-1']);
    expect(review.metaStemText).toBe(mockWeeklyMeta.text);
    expect(review.reflectionText).toBe('the week kept asking the same question');
    // §6.2: completing the SELECTED week's reflection clears the override.
    expect(mockRepoState.settingWrites).toEqual([['program_week_override', null]]);
  });

  it('Programme off: the weekly completion records the review but writes NOTHING else (D3: no override-clear, no activation)', async () => {
    mockParams.value = { origin: 'weekly' };
    mockRepoState.firstPractice = { startedAt: '2026-09-01T06:00:00.000Z', offsetMin: 120 };
    mockRepoState.reviewedWeek = reviewedWeek() as never;
    mockRepoState.settings = { programme: false, program_week_override: 1 };
    render(<WriteScreen />);

    await screen.findByText(/Week 1 review/);
    fireEvent.press(screen.getByText('Continue'));
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'recorded while off\n');
    await screen.findByText('Session saved.');

    // Recording continues (D3): the review row lands.
    expect(mockRepoState.createdReviews).toHaveLength(1);
    // Zero state changes: the override survives AND no activation runs.
    expect(mockRepoState.settingWrites).toEqual([]);
    expect(mockRepoState.activationCalls).toEqual([]);
  });

  it('does not clear anything when no override is set', async () => {
    mockParams.value = { origin: 'weekly' };
    mockRepoState.reviewedWeek = reviewedWeek() as never;
    render(<WriteScreen />);
    fireEvent.press(screen.getByText('Continue'));
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'a reflection\n');
    await screen.findByText('Session saved.');
    expect(mockRepoState.createdReviews).toHaveLength(1);
    expect(mockRepoState.settingWrites).toEqual([]);
  });

  it('a zero-content reflection does not complete the week: override stays, review row still recorded (t10)', async () => {
    mockParams.value = { origin: 'weekly' };
    mockRepoState.firstPractice = { startedAt: '2026-09-01T06:00:00.000Z', offsetMin: 120 };
    mockRepoState.reviewedWeek = reviewedWeek() as never;
    mockRepoState.settings = { program_week_override: 1 };
    render(<WriteScreen />);

    await screen.findByText(/Week 1 review/);
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByText(/If this mock weekly reflection stem renders its review/);
    // Done with nothing typed: the meta-stem session ends zero-content (§6.3.9).
    fireEvent.press(screen.getByLabelText('Finish session'));

    await screen.findByText('Session saved.');
    // Nothing discarded: the review row is still recorded, reflection_text null.
    expect(mockRepoState.createdReviews).toHaveLength(1);
    expect(mockRepoState.createdReviews[0].input.reflectionText).toBeNull();
    // t10 (owner decision 2026-09-22): a zero-content reflection never counts
    // as complete — §6.2's override-clear must not fire. The repository's own
    // reads already exclude the session from the derivation; this guard keeps
    // the write path from clearing the user's selection on top of it.
    expect(mockRepoState.settingWrites).toEqual([]);
  });
});

describe('WriteScreen — open review sessions resume into their flow (c05-queued bug)', () => {
  it('an open weekly meta-stem session resumes into the weekly flow — never "No stems set"', async () => {
    // The c05 repro: kill the app during Review's meta-stem phase, then
    // open awareme://write (no params). The old resumeQueue built its
    // fallback from listAllStems, which excludes meta stems, so the screen
    // rendered the empty state forever until the row was closed by hand.
    mockRepoState.openSession = openSessionRow(mockWeeklyMeta.id, mockWeeklyMeta.text, { origin: 'review', targetEndings: 1 });
    render(<WriteScreen />);

    expect(screen.queryByText('No stems set for this time of day yet.')).toBeNull();
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'picked the reflection back up\n');
    // Finishing the resumed reflection still records the weekly review…
    await screen.findByText('Session saved.');
    expect(mockRepoState.createdReviews).toHaveLength(1);
    expect(mockRepoState.createdReviews[0].input.metaStemText).toBe(mockWeeklyMeta.text);
  });

  it('an open evening meta-stem session resumes into the evening flow', async () => {
    mockRepoState.openSession = openSessionRow(mockEveningA.id, mockEveningA.text, { origin: 'review', targetEndings: 1 });
    render(<WriteScreen />);

    expect(screen.queryByText('No stems set for this time of day yet.')).toBeNull();
    await screen.findByText(/In my body right now I feel/);
    expect(screen.getByLabelText('Your reflection')).toBeTruthy();
  });

  it('the open session wins over route params (never two open sessions)', async () => {
    mockParams.value = { timeOfDay: 'morning', origin: 'notification' };
    mockRepoState.openSession = openSessionRow(mockWeeklyMeta.id, mockWeeklyMeta.text, { origin: 'review', targetEndings: 1 });
    render(<WriteScreen />);
    // Still routed into the reflection flow — starting a fresh practice
    // under the open row would orphan it (ADR-0001).
    await screen.findByText(/If this mock weekly reflection stem renders its review/);
    expect(mockRepoState.createdSessions).toEqual([]);
  });

  // w1-t4 (s6-new-1 + s1-F6): the delete dialog promises "only removes it
  // from the library and future selection" (stem-edit.tsx) — an open
  // session on a since-deleted evening meta-stem must not wedge on the dead
  // row. The mount effect re-routes into the rotation's current survivor:
  // the user's in-progress reflection continues as the open session it
  // already is (nothing discarded — its own snapshot text stays on screen),
  // and the completed reflection records under the rotation's current
  // survivor. The mock's listMetaStems carries the post-filter shape (the
  // deleted row excluded), listAllStems still sees the soft-deleted row —
  // the real reads' contract.
  it('an open session on a deleted evening meta-stem continues its flow and records onto the survivor (w1-t4)', async () => {
    mockRepoState.metaStems = [mockWeeklyMeta, mockEveningB];
    mockRepoState.allStems = [
      ...[mockStemA, mockStemB, mockStemC, mockWeek2Stem, mockUserStem].map((s) => ({
        ...s,
        active: 1,
        deleted_at: null,
        created_at: '2026-09-01T06:00:00.000Z',
      })),
      { ...mockEveningA, active: 0, deleted_at: '2026-09-16T20:00:00.000Z', created_at: '2026-09-01T06:00:00.000Z' },
    ];
    mockRepoState.openSession = openSessionRow(mockEveningA.id, mockEveningA.text, { origin: 'review', targetEndings: 1 });
    render(<WriteScreen />);

    // The continued flow, not a fresh entry: the resumed session's own
    // snapshot prompt is live (nothing discarded), the writing input is
    // ready — no reread gate, no empty state.
    await screen.findByText(/In my body right now I feel/);
    expect(screen.getByLabelText('Your reflection')).toBeTruthy();
    expect(screen.queryByText('Continue')).toBeNull();
    expect(screen.queryByText('Nothing is active for this practice right now.')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Your reflection'), 'picked the reflection back up\n');
    // The completed reflection records onto the rotation's current survivor
    // — the deleted row draws nothing new into the rotation record. The
    // open session row itself completes as the user's own reflection:
    // nothing discarded, no second session started.
    await screen.findByText('Session saved.');
    expect(mockRepoState.createdReviews).toHaveLength(1);
    expect(mockRepoState.createdReviews[0].input.metaStemText).toBe(mockEveningB.text);
  });

  it('with no survivor left, an open session on a deleted evening meta-stem lands on the honest empty state (w1-t4 guard)', async () => {
    // Both evening meta-stems deleted: the rotation is empty, so the only
    // honest render is the w1-t2 empty state with its way-backs (D5 — the
    // empty path stays reachable by design). The abandoned open row still
    // exists in the DB; nothing discards it.
    mockRepoState.metaStems = [mockWeeklyMeta];
    mockRepoState.allStems = [
      ...[mockStemA, mockStemB, mockStemC, mockWeek2Stem, mockUserStem].map((s) => ({
        ...s,
        active: 1,
        deleted_at: null,
        created_at: '2026-09-01T06:00:00.000Z',
      })),
      { ...mockEveningA, active: 0, deleted_at: '2026-09-16T20:00:00.000Z', created_at: '2026-09-01T06:00:00.000Z' },
      { ...mockEveningB, active: 0, deleted_at: '2026-09-16T20:00:00.000Z', created_at: '2026-09-01T06:00:00.000Z' },
    ];
    mockRepoState.openSession = openSessionRow(mockEveningA.id, mockEveningA.text, { origin: 'review', targetEndings: 1 });
    render(<WriteScreen />);

    await screen.findByText('Nothing is active for this practice right now.');
    expect(screen.getByText('Re-activate stems in the library')).toBeTruthy();
    expect(screen.getByText('Choose a different week')).toBeTruthy();
  });
});

// Packet-3 t5: the writing input's field treatment (render-level pins live
// in write-action-bar.test.tsx), the IME surviving the timer-expiry
// auto-advance (d10-04), and the exit control's label/desc mismatch
// (p2n-10).
describe('WriteScreen — input field, keyboard, and exit-label alignment', () => {
  it('dismisses the keyboard when the session timer expires and auto-advances (d10-04)', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    mockParams.value = { timeOfDay: 'morning' };
    mockRepoState.settings = { timer_seconds: 1 };
    render(<WriteScreen />);

    await screen.findByText(/Stem 1 of 4/);
    fireEvent.press(screen.getByText('Start'));
    await screen.findByLabelText('Your ending');

    // The session hook's own 1s interval drains the 1s timer and finalizes
    // with end_reason 'timeout'; the screen auto-advances to the next
    // stem's Start gate. The IME must not ride along (d10-04).
    await screen.findByText(/Stem 2 of 4/, {}, { timeout: 4000 });
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('the prep gate exit control reads the same to eyes and screen readers (p2n-10)', async () => {
    mockParams.value = { timeOfDay: 'morning' };
    render(<WriteScreen />);
    await screen.findByText(/Stem 1 of 4/);

    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.queryByLabelText('Exit session')).toBeNull();
  });

  it('the reflection reread exit control reads the same to eyes and screen readers', async () => {
    mockParams.value = { timeOfDay: 'evening' };
    render(<WriteScreen />);
    await screen.findByText(/Evening reflection/);

    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.queryByLabelText('Exit reflection')).toBeNull();
  });
});


describe('WriteScreen — badge reveal on the completion screen (issue 17)', () => {
  // Gamification proposal §1.A/§1.B: the completion block reveals the
  // badges newly crossed by THIS practice's final session, computed fresh
  // each render (§13.7 — nothing stored). Zero coverage before the
  // 2026-09-16 lint disposition named the badge-reveal UI as a gap; these
  // tests drive real practices to 'done' through the mocked repository.

  it('reveals the badges the final session newly crosses', async () => {
    mockParams.value = { stemId: 'stem-a' };
    mockRepoState.settings = { endings_per_session: 1 };
    // No prior history: completing the practice crosses 'first_words' and
    // 'six_endings' (a one-ending session meets its one-ending target).
    mockRepoState.statsCompleteLastSession = true;
    render(<WriteScreen />);

    await screen.findByText(/If I give this mock practice my full attention/);
    fireEvent.press(screen.getByText('Start'));
    const input = await screen.findByLabelText('Your ending');
    fireEvent.changeText(input, 'one honest sentence about right now\n');

    await screen.findByText('Session saved.');
    expect(screen.getByText('First Words')).toBeTruthy();
    expect(screen.getByText('Six Endings')).toBeTruthy();
  });

  it('reveals nothing when the completion crosses no new threshold', async () => {
    mockParams.value = { stemId: 'stem-a' };
    mockRepoState.settings = { endings_per_session: 1 };
    mockRepoState.statsCompleteLastSession = true;
    // History already holds an identical completed session — nothing is
    // newly crossed by this one, so the completion block shows no badges
    // (the proposal's "empty when nothing newly crossed" common case).
    mockRepoState.priorStatsSessions = [priorCompletedSession('prior-session')];
    render(<WriteScreen />);

    await screen.findByText(/If I give this mock practice my full attention/);
    fireEvent.press(screen.getByText('Start'));
    const input = await screen.findByLabelText('Your ending');
    fireEvent.changeText(input, 'one honest sentence about right now\n');

    await screen.findByText('Session saved.');
    expect(screen.queryByText('First Words')).toBeNull();
    expect(screen.queryByText('Six Endings')).toBeNull();
  });

  it('never reveals between stems — only the practice-final done assembles badges', async () => {
    mockParams.value = { timeOfDay: 'morning' };
    mockRepoState.settings = { endings_per_session: 1 };
    mockRepoState.statsCompleteLastSession = true;
    render(<WriteScreen />);

    await screen.findByText(/Stem 1 of 4/);
    fireEvent.press(screen.getByText('Start'));
    const input = await screen.findByLabelText('Your ending');
    fireEvent.changeText(input, 'a stray thought I keep circling back to\n');

    // Stem 1 is done — 'First Words' has just been crossed by it — but the
    // practice is not finished: no completion block, no badge ("never
    // between stems", proposal §2), and the next gate is clean.
    await screen.findByText(/Stem 2 of 4/);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.queryByText('First Words')).toBeNull();
    expect(screen.queryByText('Session saved.')).toBeNull();
  });
});

/** A completed session row for the badge diff's "before" history. */
function priorCompletedSession(id: string): BadgeSession {
  return {
    id,
    stemId: 'stem-a',
    category: null,
    origin: 'manual',
    targetEndings: 1,
    uncensoredMode: false,
    startedAt: '2026-09-01T06:00:00.000Z',
    endedAt: '2026-09-01T06:02:00.000Z',
    endReason: 'user_done',
    tz: 'Europe/Berlin',
    offsetMin: 120,
    endings: [{ text: 'one submitted ending' }],
  };
}

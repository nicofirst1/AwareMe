import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import WriteScreen from '@/app/write';
import { type Settings, type StemRow } from '@/db';
import type { BadgeSession } from '@/session/badges';

// Route params are per-test (morning practice, evening/weekly reflection,
// one-off week, solo write, bare deep link) — a mock-prefixed holder so
// jest.mock's factory can reach it despite hoisting.
const mockParams: { value: Record<string, string> } = { value: {} };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams.value,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
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
const mockWeeklyMeta = makeStem('meta-weekly', 'If this mock weekly reflection stem renders its review', 0);
const mockEveningA = { ...makeStem('meta-evening-a', 'In my body right now I feel', 0), origin: 'meta' };
const mockEveningB = { ...makeStem('meta-evening-b', 'Right now I am aware of', 0), origin: 'meta' };

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
        week === 1 ? [mockStemA, mockStemB, mockStemC] : week === 2 ? [mockWeek2Stem] : [],
      // One-off week visit (issue 04): the whole block, resting included.
      getProgrammeWeekBlock: (week: number) =>
        week === 1 ? [mockStemA, mockStemB, mockStemC] : week === 2 ? [mockWeek2Stem] : [],
      listMetaStems: () => [mockWeeklyMeta, mockEveningA, mockEveningB],
      getWeeklyMetaStem: () => mockWeeklyMeta,
      // Reflection rereads
      listSessionsForDayMorning: () => mockRepoState.reviewedMorning,
      listSessionsForProgrammeWeek: () => mockRepoState.reviewedWeek,
      countProgrammeStemsCompletedInRange: () => 0,
      // Solo fallback + library single-stem writes
      listAllStems: () =>
        [mockStemA, mockStemB, mockStemC, mockWeek2Stem, mockUserStem].map((s) => ({
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

    await screen.findByText(/Stem 1 of 3/);
    await screen.findByText(/If I give this mock practice my full attention/);
    fireEvent.press(screen.getByText('Start'));

    const input = await screen.findByLabelText('Your ending');
    // 2026-09-15 owner decision (cycle 2): the countdown Save button is
    // gone — regression pin that it never reappears after Start. Submission
    // is the return key: the multiline field's trailing "\n" drives
    // `submitActive` (§6.3.4's "return key, or a Next control").
    expect(screen.queryByLabelText('Save this ending')).toBeNull();
    fireEvent.changeText(input, 'a stray thought I keep circling back to\n');

    await screen.findByText(/Stem 2 of 3/);
    await screen.findByText(/If I treat this mock test stem responsibly/);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.queryByText('a stray thought I keep circling back to')).toBeNull();
  });

  it('carries one line of purpose framing at the Start gate, absent during writing (v12 issue 02)', async () => {
    const purpose = 'A few minutes of unedited writing for self-awareness and self-esteem.';
    mockParams.value = { timeOfDay: 'morning' };
    render(<WriteScreen />);

    await screen.findByText(/Stem 1 of 3/);
    expect(screen.getByText(purpose)).toBeTruthy();

    // Active writing is bare (§6.3, §13.4): the purpose line belongs on the
    // gate only, never mid-flow.
    fireEvent.press(screen.getByText('Start'));
    await screen.findByLabelText('Your ending');
    expect(screen.queryByText(purpose)).toBeNull();
  });

  it('the morning practice is the effective programme week’s block, in seed order', () => {
    mockParams.value = { timeOfDay: 'morning' };
    render(<WriteScreen />);
    expect(screen.getByText(/Stem 1 of 3/)).toBeTruthy();
    expect(screen.getByText(/If I give this mock practice my full attention/)).toBeTruthy();
  });

  it('a bare /write defaults to the morning practice instead of a blank screen', () => {
    render(<WriteScreen />);
    expect(screen.getByText(/If I give this mock practice my full attention/)).toBeTruthy();
  });

  it('one-off week practice: /write?week=2 loads that week’s block as manual sessions', () => {
    mockParams.value = { week: '2' };
    render(<WriteScreen />);
    expect(screen.getByText(/If this mock week-two stem behaves in tests/)).toBeTruthy();
    expect(mockRepoState.createdSessions).toEqual([]); // nothing created before Start (§6.3.1)
    fireEvent.press(screen.getByText('Start'));
    expect(mockRepoState.createdSessions).toEqual([{ origin: 'manual', stemId: mockWeek2Stem.id }]);
  });

  it('resumes an interrupted practice at its position, not from the top (ADR-0001 + §6.2)', async () => {
    mockParams.value = { timeOfDay: 'morning' };
    mockRepoState.openSession = openSessionRow(mockStemB.id, mockStemB.text);
    render(<WriteScreen />);

    await screen.findByText(/Stem 2 of 3/);
    expect(screen.getByText(/If I treat this mock test stem responsibly/)).toBeTruthy();
    // Resumed sessions are already active — no Start gate on a running timer.
    expect(screen.getByLabelText('Your ending')).toBeTruthy();
  });

  it('resumes a solo library write as a one-stem queue', async () => {
    mockRepoState.openSession = openSessionRow(mockUserStem.id, mockUserStem.text);
    render(<WriteScreen />);
    await screen.findByText(/My own made-up stem is/);
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

  it('runs the review-today flow and records the review scoped to today’s morning sessions', async () => {
    mockParams.value = { timeOfDay: 'evening' };
    mockRepoState.reviewedMorning = reviewedMorning() as never;
    render(<WriteScreen />);

    // Reread phase: today's morning endings, read-only, then Continue.
    await screen.findByText(/If I give this mock practice my full attention/);
    expect(screen.getByText('I noticed the light change on my desk')).toBeTruthy();
    fireEvent.press(screen.getByText('Continue'));

    // The alternating reflection stem: first evening (count 0 → stem A).
    await screen.findByText(/In my body right now I feel/);
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'tired in a settled way\n');

    await screen.findByText('Session saved.');
    expect(mockRepoState.createdReviews).toHaveLength(1);
    const review = mockRepoState.createdReviews[0].input;
    expect(review.sessionIds).toEqual(['morning-1']);
    expect(review.metaStemText).toBe(mockEveningA.text);
    expect(review.reflectionText).toBe('tired in a settled way');
    // The evening flow never touches the override (§6.2 clearing is weekly-only).
    expect(mockRepoState.settingWrites).toEqual([]);
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

    await screen.findByText(/Stem 1 of 3/);
    fireEvent.press(screen.getByText('Start'));
    await screen.findByLabelText('Your ending');

    // The session hook's own 1s interval drains the 1s timer and finalizes
    // with end_reason 'timeout'; the screen auto-advances to the next
    // stem's Start gate. The IME must not ride along (d10-04).
    await screen.findByText(/Stem 2 of 3/, {}, { timeout: 4000 });
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('the prep gate exit control reads the same to eyes and screen readers (p2n-10)', async () => {
    mockParams.value = { timeOfDay: 'morning' };
    render(<WriteScreen />);
    await screen.findByText(/Stem 1 of 3/);

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

    await screen.findByText(/Stem 1 of 3/);
    fireEvent.press(screen.getByText('Start'));
    const input = await screen.findByLabelText('Your ending');
    fireEvent.changeText(input, 'a stray thought I keep circling back to\n');

    // Stem 1 is done — 'First Words' has just been crossed by it — but the
    // practice is not finished: no completion block, no badge ("never
    // between stems", proposal §2), and the next gate is clean.
    await screen.findByText(/Stem 2 of 3/);
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

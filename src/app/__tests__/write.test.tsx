import { fireEvent, render, screen } from '@testing-library/react-native';

import WriteScreen from '@/app/write';
import { DEFAULT_SETTINGS, type Settings, type StemRow } from '@/db';

// Route params are per-test (morning sitting, evening/weekly reflection,
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
const mockStemA = makeStem('stem-a', 'If I bring more awareness to my life today', 1);
const mockStemB = makeStem('stem-b', 'If I take more responsibility for my choices and actions today', 1);
const mockStemC = makeStem('stem-c', 'If I pay more attention to how I deal with people today', 1);
const mockWeek2Stem = makeStem('stem-w2', 'If I bring 5 percent more awareness to my important relationships', 2);
const mockUserStem = { ...makeStem('stem-user', 'My own made-up stem is', 0), origin: 'user' as const };
const mockWeeklyMeta = makeStem('meta-weekly', 'If any of what I wrote this week is true, it might be helpful if I', 0);
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
  firstSitting: { startedAt: string; offsetMin: number } | null;
  weeklyReflections: { startedAt: string; offsetMin: number }[];
  eveningReflections: { startedAt: string; offsetMin: number }[];
  reviewedMorning: { session: { id: string; started_at: string; stem_text_snapshot: string }; endings: { id: string; text: string }[] }[];
  reviewedWeek: { session: { id: string; started_at: string; stem_text_snapshot: string }; endings: { id: string; text: string }[] }[];
  createdSessions: { origin: string; stemId: string }[];
  createdReviews: { input: Record<string, unknown> }[];
  settingWrites: [string, unknown][];
} = {
  settings: {},
  openSession: null,
  firstSitting: null,
  weeklyReflections: [],
  eveningReflections: [],
  reviewedMorning: [],
  reviewedWeek: [],
  createdSessions: [],
  createdReviews: [] as never as { input: Record<string, unknown> }[],
  settingWrites: [],
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
      getFirstProgrammeSitting: () => mockRepoState.firstSitting,
      listCompletedWeeklyReflections: () => mockRepoState.weeklyReflections,
      listCompletedEveningReflections: () => mockRepoState.eveningReflections,
      // Sittings
      getProgrammeStemsForWeek: (week: number) =>
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
      // Writes
      createSession: (input: { origin: string; stemId: string }) => {
        mockRepoState.createdSessions.push({ origin: input.origin, stemId: input.stemId });
        return `session-${++nextSessionId}`;
      },
      createReview: (input: Record<string, unknown>) => {
        mockRepoState.createdReviews.push({ input });
        return 'review-1';
      },
      setSetting: (key: string, value: unknown) => {
        mockRepoState.settingWrites.push([key, value]);
      },
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
  mockRepoState.firstSitting = null;
  mockRepoState.weeklyReflections = [];
  mockRepoState.eveningReflections = [];
  mockRepoState.reviewedMorning = [];
  mockRepoState.reviewedWeek = [];
  mockRepoState.createdSessions = [];
  mockRepoState.createdReviews = [];
  mockRepoState.settingWrites = [];
});

describe('WriteScreen — sittings', () => {
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
    await screen.findByText(/If I bring more awareness to my life today/);
    fireEvent.press(screen.getByText('Start'));

    const input = await screen.findByLabelText('Your ending');
    // 2026-09-15 owner decision (cycle 2): the countdown Save button is
    // gone — regression pin that it never reappears after Start. Submission
    // is the return key: the multiline field's trailing "\n" drives
    // `submitActive` (§6.3.4's "return key, or a Next control").
    expect(screen.queryByLabelText('Save this ending')).toBeNull();
    fireEvent.changeText(input, 'a stray thought I keep circling back to\n');

    await screen.findByText(/Stem 2 of 3/);
    await screen.findByText(/If I take more responsibility for my choices and actions today/);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.queryByText('a stray thought I keep circling back to')).toBeNull();
  });

  it('the morning sitting is the effective programme week’s block, in seed order', () => {
    mockParams.value = { timeOfDay: 'morning' };
    render(<WriteScreen />);
    expect(screen.getByText(/Stem 1 of 3/)).toBeTruthy();
    expect(screen.getByText(/If I bring more awareness to my life today/)).toBeTruthy();
  });

  it('a bare /write defaults to the morning sitting instead of a blank screen', () => {
    render(<WriteScreen />);
    expect(screen.getByText(/If I bring more awareness to my life today/)).toBeTruthy();
  });

  it('one-off week sitting: /write?week=2 loads that week’s block as manual sessions', () => {
    mockParams.value = { week: '2' };
    render(<WriteScreen />);
    expect(screen.getByText(/If I bring 5 percent more awareness to my important relationships/)).toBeTruthy();
    expect(mockRepoState.createdSessions).toEqual([]); // nothing created before Start (§6.3.1)
    fireEvent.press(screen.getByText('Start'));
    expect(mockRepoState.createdSessions).toEqual([{ origin: 'manual', stemId: mockWeek2Stem.id }]);
  });

  it('resumes an interrupted sitting at its position, not from the top (ADR-0001 + §6.2)', async () => {
    mockParams.value = { timeOfDay: 'morning' };
    mockRepoState.openSession = openSessionRow(mockStemB.id, mockStemB.text);
    render(<WriteScreen />);

    await screen.findByText(/Stem 2 of 3/);
    expect(screen.getByText(/If I take more responsibility for my choices and actions today/)).toBeTruthy();
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
        session: { id: 'morning-1', started_at: '2026-09-16T06:00:00.000Z', stem_text_snapshot: 'If I bring more awareness to my life today' },
        endings: [{ id: 'e1', text: 'I noticed the light change on my desk' }],
      },
    ];
  }

  it('runs the review-today flow and records the review scoped to today’s morning sessions', async () => {
    mockParams.value = { timeOfDay: 'evening' };
    mockRepoState.reviewedMorning = reviewedMorning() as never;
    render(<WriteScreen />);

    // Reread phase: today's morning endings, read-only, then Continue.
    await screen.findByText(/If I bring more awareness to my life today/);
    expect(screen.getByText('I noticed the light change on my desk')).toBeTruthy();
    fireEvent.press(screen.getByText('Continue'));

    // The alternating reflection stem: first evening (count 0 → stem A).
    await screen.findByText(/In my body right now I feel/);
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'tired in a settled way\n');

    await screen.findByText('Saved.');
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
        session: { id: 'week1-1', started_at: '2026-09-14T06:00:00.000Z', stem_text_snapshot: 'If I bring more awareness to my life today' },
        endings: [{ id: 'e1', text: 'I actually looked up from my screen at lunch' }],
      },
    ];
  }

  it('reviews the week, then the weekly meta-stem, and clears a matching override on completion', async () => {
    mockParams.value = { origin: 'weekly' };
    mockRepoState.firstSitting = { startedAt: '2026-09-01T06:00:00.000Z', offsetMin: 120 };
    mockRepoState.reviewedWeek = reviewedWeek() as never;
    mockRepoState.settings = { program_week_override: 1 };
    render(<WriteScreen />);

    await screen.findByText(/Week 1 review/);
    await screen.findByText(/If I bring more awareness to my life today/);
    fireEvent.press(screen.getByText('Continue'));

    await screen.findByText(/If any of what I wrote this week is true/);
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'the week kept asking the same question\n');

    await screen.findByText('Saved.');
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
    await screen.findByText('Saved.');
    expect(mockRepoState.createdReviews).toHaveLength(1);
    expect(mockRepoState.settingWrites).toEqual([]);
  });
});

describe('WriteScreen — open review sessions resume into their flow (c05-queued bug)', () => {
  it('an open weekly meta-stem session resumes into the weekly flow — never "No stems set"', async () => {
    // The c05 repro: kill the app during Review's meta-stem phase, then
    // open sixendings://write (no params). The old resumeQueue built its
    // fallback from listAllStems, which excludes meta stems, so the screen
    // rendered the empty state forever until the row was closed by hand.
    mockRepoState.openSession = openSessionRow(mockWeeklyMeta.id, mockWeeklyMeta.text, { origin: 'review', targetEndings: 1 });
    render(<WriteScreen />);

    expect(screen.queryByText('No stems set for this time of day yet.')).toBeNull();
    const input = await screen.findByLabelText('Your reflection');
    fireEvent.changeText(input, 'picked the reflection back up\n');
    // Finishing the resumed reflection still records the weekly review…
    await screen.findByText('Saved.');
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
    // Still routed into the reflection flow — starting a fresh sitting
    // under the open row would orphan it (ADR-0001).
    await screen.findByText(/If any of what I wrote this week is true/);
    expect(mockRepoState.createdSessions).toEqual([]);
  });
});

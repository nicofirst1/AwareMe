import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';
import { DEFAULT_SETTINGS, type Settings } from '@/db';

// `useFocusEffect` (2026-09-11 visual-test fix: home status now refreshes on
// focus, not just mount) calls `useNavigation()` under the hood, which
// throws outside a real navigation tree — this bare `render(<HomeScreen />)`
// has none. Same fix as `stems.test.tsx`: run the effect once on mount
// instead, matching what happens on a real mount-while-focused, and keep
// `useRouter`/`Link` real since index.tsx's existing usage of them already
// works fine in this environment.
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), []),
  };
});

// Same pattern as `progress.test.tsx`: a minimal repository stub so the
// programme cards' read-time state (readHomeProgrammeStatus) has something
// real to render, instead of silently catching a throw from a real
// (unopenable-in-this-env) on-device DB. The issue's standing note — the
// @/db mock must carry every repository method the screen's read path
// calls — applies: the programme reads are all stubbed here (their SQL is
// exercised against real SQLite in programRepository.test.ts).
const mockRepository: {
  listSessionsForHistory: () => { id: string }[];
  getLastReviewAt: () => string | null;
  listSessionsForStats: () => { id: string }[];
  getFirstProgrammeSitting: () => { startedAt: string; offsetMin: number } | null;
  listCompletedWeeklyReflections: () => { startedAt: string; offsetMin: number }[];
  listCompletedEveningReflections: () => { startedAt: string; offsetMin: number }[];
  getProgrammeStemsForWeek: (week: number) => { id: string }[];
  countProgrammeStemsCompletedInRange: (week: number, start: string, end: string) => number;
  getSettings?: () => Settings;
} = {
  listSessionsForHistory: () => [{ id: 'session-1' }],
  getLastReviewAt: () => '2000-01-01T00:00:00.000Z',
  listSessionsForStats: () => [],
  getFirstProgrammeSitting: () => null,
  listCompletedWeeklyReflections: () => [],
  listCompletedEveningReflections: () => [],
  getProgrammeStemsForWeek: () => [{ id: 'stem-1' }],
  countProgrammeStemsCompletedInRange: () => 0,
  getSettings: () => DEFAULT_SETTINGS,
};

jest.mock('@/db', () => {
  const actual = jest.requireActual<typeof import('@/db')>('@/db');
  return {
    ...actual,
    getRepository: () => mockRepository,
  };
});

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const todayName = (): string => WEEKDAY_NAMES[new Date().getDay()];

describe('HomeScreen', () => {
  afterEach(() => {
    mockRepository.getSettings = () => DEFAULT_SETTINGS;
  });

  it('renders the week card with the derived week, stem count, and a review row', () => {
    render(<HomeScreen />);
    // Fresh install: no first programme sitting → derived week 1.
    expect(screen.getByText('Week 1 of 30')).toBeTruthy();
    expect(screen.getByText('1 stem ready')).toBeTruthy();
    expect(screen.getByText('1 session this week')).toBeTruthy();
    expect(screen.getByText('Review available')).toBeTruthy();
    expect(screen.getByText('Start morning sitting')).toBeTruthy();
  });

  it('renders the evening reflection card (enabled by default) and marks its done state', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Evening reflection')).toBeTruthy();
    expect(screen.getByText('Begin evening reflection')).toBeTruthy();

    // A completed evening reflection today → the quiet done state, and the
    // card stays (a second sitting is allowed, absence is never punished,
    // §13.4).
    const nowIso = new Date().toISOString();
    const offsetMin = -new Date().getTimezoneOffset();
    mockRepository.listCompletedEveningReflections = () => [{ startedAt: nowIso, offsetMin }];
    render(<HomeScreen />);
    expect(screen.getByText('Reflected today')).toBeTruthy();
  });

  it('hides the evening card when evening practice is disabled', () => {
    mockRepository.getSettings = () => ({ ...DEFAULT_SETTINGS, evening_practice_enabled: false });
    render(<HomeScreen />);
    expect(screen.queryByText('Evening reflection')).toBeNull();
  });

  it('shows the weekly reflection card on its target day, with its done state', () => {
    mockRepository.getSettings = () => ({ ...DEFAULT_SETTINGS, weekly_meta_day: todayName() });
    render(<HomeScreen />);
    expect(screen.getByText('Weekly reflection')).toBeTruthy();
    expect(screen.getByText(`Week 1’s endings, then the weekly stem.`)).toBeTruthy();
    expect(screen.getByText('Begin weekly reflection')).toBeTruthy();
  });

  it('does not show the weekly reflection card on other days', () => {
    const otherDay = WEEKDAY_NAMES[(new Date().getDay() + 3) % 7];
    mockRepository.getSettings = () => ({ ...DEFAULT_SETTINGS, weekly_meta_day: otherDay });
    render(<HomeScreen />);
    expect(screen.queryByText('Weekly reflection')).toBeNull();
  });

  it('nudges only when this calendar week advanced the derived week', () => {
    // A reflection in the current Mon–Sun week (anchored 3 weeks ago):
    // derived 2 with it, 1 without it → the calm nudge with derived numbers.
    const now = new Date();
    const offsetMin = -now.getTimezoneOffset();
    const anchor = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    mockRepository.getFirstProgrammeSitting = () => ({ startedAt: anchor.toISOString(), offsetMin });
    mockRepository.listCompletedWeeklyReflections = () => [{ startedAt: now.toISOString(), offsetMin }];
    render(<HomeScreen />);
    expect(screen.getByText('Week 1 complete — Week 2 is ready.')).toBeTruthy();

    // No reflection this week → no nudge, no guilt about the missed one.
    mockRepository.listCompletedWeeklyReflections = () => [];
    render(<HomeScreen />);
    expect(screen.queryByText(/is ready\./)).toBeNull();
  });

  it('marks the week-30 completion state and points at the library', () => {
    const now = new Date();
    const offsetMin = -now.getTimezoneOffset();
    mockRepository.getSettings = () => ({ ...DEFAULT_SETTINGS, program_week_override: 30 });
    mockRepository.listCompletedWeeklyReflections = () => [{ startedAt: now.toISOString(), offsetMin }];
    render(<HomeScreen />);
    expect(screen.getByText('Week 30 of 30')).toBeTruthy();
    expect(screen.getByText('Week 30 complete. The library is yours from here.')).toBeTruthy();
    expect(screen.getByText('Browse the library')).toBeTruthy();
    // The nudge is suppressed once the completion state speaks.
    expect(screen.queryByText(/is ready\./)).toBeNull();
  });

  it('still renders (default period rule) when settings cannot be read', () => {
    // No `getSettings` on the stub: the render path must catch the throw and
    // fall back (currentSittingPeriod(undefined, undefined)), not crash the
    // screen — and the status block is simply absent, not an error message.
    const baseGetSettings = mockRepository.getSettings;
    delete mockRepository.getSettings;
    try {
      render(<HomeScreen />);
      expect(screen.getByText('Morning sitting')).toBeTruthy();
      expect(screen.queryByText('1 stem ready')).toBeNull();
    } finally {
      mockRepository.getSettings = baseGetSettings;
    }
  });

  it('renders the app name and tagline', () => {
    render(<HomeScreen />);
    expect(screen.getByText('AwareMe')).toBeTruthy();
    // Tagline (v12 issue 02): states the purpose, in the self-esteem
    // direction; alternatives live in the issue Comments.
    expect(screen.getByText('A daily practice for self-esteem, one sentence at a time.')).toBeTruthy();
  });

  it('has a secondary destination group', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Stems')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
  });

  it('has a tappable creator footer', () => {
    render(<HomeScreen />);
    expect(screen.getByText("Created by Nicolo’ Brandizzi")).toBeTruthy();
  });
});

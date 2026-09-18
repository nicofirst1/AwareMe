import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';

import HomeScreen from '@/app/index';
import { Colors } from '@/constants/theme';
import { DEFAULT_SETTINGS, type Settings } from '@/db';

// The splash entrance sequence (v14 issue 01) runs its own timers and
// reads AccessibilityInfo on mount — both belong to its own test file
// (SplashSequence.test.tsx). Home tests pin only the wiring: the sequence
// is mounted, and its presence in the render tree is asserted below.
jest.mock('@/components/splash/SplashSequence', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    SplashSequence: () => createElement(View, { testID: 'splash-sequence' }),
  };
});

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
  getHighestUnlockedWeek: () => number;
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
  getHighestUnlockedWeek: () => 0,
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
    // o11 layout/a11y cycle: the review row is a Link with an explicit role
    // and label (matches BackHeader's documented link convention).
    expect(screen.getByRole('link', { name: 'Review available' })).toBeTruthy();
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
    expect(screen.getByText('Week 1 complete. Week 2 is ready.')).toBeTruthy();

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
    // o11: the completion block's library link carries the link role + label.
    expect(screen.getByRole('link', { name: 'Browse the library' })).toBeTruthy();
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

  it('renders the app icon above the title', () => {
    render(<HomeScreen />);
    // Depth-first order over the host JSON tree = visual order. Plain data
    // only: identity-comparing RNTL instances (instance.parent toBe) fails
    // and jest's failure printout walks the whole renderer tree (heap OOM).
    const json = screen.toJSON() as { props?: { testID?: string }; children?: unknown[] };
    const marks: { testID?: string; text?: string }[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') {
        marks.push({ text: node });
        return;
      }
      const n = node as { props?: { testID?: string }; children?: unknown[] };
      marks.push({ testID: n.props?.testID });
      (n.children ?? []).forEach(walk);
    };
    walk(json);
    const iconIndex = marks.findIndex((m) => m.testID === 'home-app-icon');
    const titleIndex = marks.findIndex((m) => m.text === 'AwareMe');
    expect(iconIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeGreaterThan(iconIndex);
  });

  it('gives all eight tiles one shared background', () => {
    render(<HomeScreen />);
    const labels = ['Stems', 'History', 'Review', 'Progress', 'Settings', 'Export', 'Import', 'About'];
    const fills = labels.map((label) =>
      StyleSheet.flatten(screen.getByRole('link', { name: label }).props.style).backgroundColor,
    );
    // Asserted symbolically (house rule since the palette round): every tile
    // reads the same theme token — no per-tile special case (v13 issue 05).
    expect(new Set(fills)).toEqual(new Set([Colors.light.backgroundElement]));
  });

  it('has a secondary destination group', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Stems')).toBeTruthy();
    // o11: the tile grid renders as links with label-pinned names.
    expect(screen.getByRole('link', { name: 'Stems' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'History' })).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
  });

  it('keeps every tile label on one line', () => {
    render(<HomeScreen />);
    // v14 issue 12: "Progress" wrapped a lone "s" at narrow widths — the
    // contract is that NO tile label wraps (numberOfLines pinned here; the
    // one-line rendering itself is verified by capture at 320pt).
    const labels = ['Stems', 'History', 'Review', 'Progress', 'Settings', 'Export', 'Import', 'About'];
    labels.forEach((label) => {
      expect(screen.getByText(label).props.numberOfLines).toBe(1);
    });
  });

  it('hosts the splash entrance sequence', () => {
    render(<HomeScreen />);
    // v14 issue 01: the home screen mounts the (self-dismissing) entrance
    // overlay; the mock above stands in for its timers.
    expect(screen.getByTestId('splash-sequence')).toBeTruthy();
  });

  it('has a tappable creator footer', () => {
    render(<HomeScreen />);
    expect(screen.getByText("Created by Nicolo’ Brandizzi")).toBeTruthy();
  });

  it('opens the creator site with the app tag', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockImplementation(async () => {});
    render(<HomeScreen />);

    // Issue 09: the footer link carries `utm_source=awareme`.
    fireEvent.press(screen.getByText("Created by Nicolo’ Brandizzi"));
    expect(openURL).toHaveBeenCalledWith('https://nicolobrandizzi.com/?utm_source=awareme');
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';

import ProgrammeScreen from '@/app/week';
import { type Settings, type StemRow } from '@/db';

// `useFocusEffect` no-ops without a real navigation tree (see
// node_modules/expo-router/build/useFocusEffect.js); run the effect once on
// mount instead, matching what happens on a real mount-while-focused.
// (`require` inside the factory, not a top-level import: jest.mock()
// factories can't close over out-of-scope variables.)
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), []),
  };
});

const mockRouter = { push: jest.fn() };

function makeWeekStem(week: number, index: number, category: string | null = null): StemRow & { weekNumber: number } {
  return {
    id: `w${week}-s${index}`,
    text: `Week ${week} stem ${index}`,
    origin: 'seed',
    category,
    weight: 1,
    time_of_day: 'morning',
    weekNumber: week,
  };
}

/** Two seeded weeks' worth — enough to prove grouping, ordering, and markers. Week 2's stems carry categories (issue 04), Week 1's don't. */
const mockProgrammeStems = [
  ...Array.from({ length: 4 }, (_, i) => makeWeekStem(1, i)),
  ...Array.from({ length: 4 }, (_, i) =>
    makeWeekStem(2, i, ['awareness', 'self_acceptance', 'purpose', 'integrity'][i]),
  ),
];

const mockRepoState: {
  settings: Partial<Settings>;
  settingWrites: [string, unknown][];
  activationCalls: number[];
  firstSitting: { startedAt: string; offsetMin: number } | null;
  highestUnlocked: number;
} = {
  settings: {},
  settingWrites: [],
  activationCalls: [],
  firstSitting: null,
  highestUnlocked: 0,
};

jest.mock('@/db', () => {
  const actual = jest.requireActual<typeof import('@/db')>('@/db');
  return {
    ...actual,
    getRepository: () => ({
      listProgrammeStems: () => mockProgrammeStems,
      getSettings: () => ({ ...actual.DEFAULT_SETTINGS, ...mockRepoState.settings }),
      getFirstProgrammeSitting: () => mockRepoState.firstSitting,
      listCompletedWeeklyReflections: () => [],
      setSetting: (key: string, value: unknown) => {
        mockRepoState.settingWrites.push([key, value]);
        // Persist like the real repo: applyWeekSetActivation re-reads the
        // setting right after the write, so the mock must reflect it.
        (mockRepoState.settings as Record<string, unknown>)[key] = value;
      },
      setProgrammeWeekActive: (week: number) => {
        mockRepoState.activationCalls.push(week);
      },
      getHighestUnlockedWeek: () => mockRepoState.highestUnlocked,
    }),
  };
});

describe('ProgrammeScreen (week library)', () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRepoState.settings = {};
    mockRepoState.settingWrites = [];
    mockRepoState.activationCalls = [];
    mockRepoState.firstSitting = null;
    mockRepoState.highestUnlocked = 0;
  });

  it('renders all 30 week cards with stem counts, ordered', () => {
    render(<ProgrammeScreen />);
    // Week 1 is active; week 2 is locked (not unlocked yet).
    expect(screen.getByText('Week 1 · Current week')).toBeTruthy();
    expect(screen.getByText('Week 2 · Locked')).toBeTruthy();
    expect(screen.getAllByText('4 stems')).toHaveLength(2);
    expect(screen.getAllByText('No active stems')).toHaveLength(28);
  });

  it('marks the effective programme week (derived, §6.2)', () => {
    // First programme sitting in the week of Mon 2026-08-31 → derived week 1.
    mockRepoState.firstSitting = { startedAt: '2026-09-01T06:00:00.000Z', offsetMin: 120 };
    render(<ProgrammeScreen />);
    expect(screen.getByText('Week 1 · Current week')).toBeTruthy();
    expect(screen.queryByText('Week 2 · Current week')).toBeNull();
  });

  it('expands a week into its stems and the two sitting actions', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 1, 4 stems. Current week. Collapsed.'));
    expect(screen.getByText('Week 1 stem 0')).toBeTruthy();
    expect(screen.getByText('Write this week’s practice')).toBeTruthy();
    expect(screen.getByText('Make this my week')).toBeTruthy();
  });

  it('renders the category chip on expanded stems that carry one (issue 04)', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 2, 4 stems. Locked. Collapsed.'));
    expect(screen.getByText('awareness')).toBeTruthy();
    expect(screen.getByText('self_acceptance')).toBeTruthy();
    expect(screen.getByText('purpose')).toBeTruthy();
    expect(screen.getByText('integrity')).toBeTruthy();
  });

  it('one-off sitting routes to /write?week=N with manual origin semantics (never rotates)', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 2, 4 stems. Locked. Collapsed.'));
    fireEvent.press(screen.getByText('Write this week’s practice'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/write', params: { week: '2' } });
    expect(mockRepoState.settingWrites).toEqual([]); // a one-off sit never writes anything
  });

  it('"make this my week" sets the override; a selected week offers clearing it', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 2, 4 stems. Locked. Collapsed.'));
    fireEvent.press(screen.getByText('Make this my week'));
    expect(mockRepoState.settingWrites).toEqual([['program_week_override', 2]]);
    // Week-set activation (issue 04) rides the same write: the chosen week
    // becomes the active one.
    expect(mockRepoState.activationCalls).toEqual([2]);
  });

  it('clears the override from the selected week card', () => {
    mockRepoState.settings = { program_week_override: 2 };
    render(<ProgrammeScreen />);
    // The selection marker names the chosen week…
    // The selection marker names the overriden state (and, being the
    // effective week too, "Your week" wins the marker precedence).
    expect(screen.getByText('Week 2 · Your week')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Week 2, 4 stems. Your week. Collapsed.'));
    fireEvent.press(screen.getByText('Clear my week selection'));
    expect(mockRepoState.settingWrites).toEqual([['program_week_override', null]]);
    // Clearing restores the DERIVED week's stems (1 — no anchor in this mock).
    expect(mockRepoState.activationCalls).toEqual([1]);
  });

  it('does not offer sitting actions on an empty week', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 30, 0 stems. Locked. Collapsed.'));
    expect(screen.getByText('The practice actions appear once this week has active stems.')).toBeTruthy();
    expect(screen.queryByText('Write this week’s practice')).toBeNull();
  });

  it('never writes anything but the override (§13.7)', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 1, 4 stems. Current week. Collapsed.'));
    fireEvent.press(screen.getByText('Make this my week'));
    for (const [key] of mockRepoState.settingWrites) {
      expect(key).toBe('program_week_override');
    }
  });

  it('manual enable of week M (derived lower) marks no week <= M Locked — marker agrees with the stored frontier (issue 09)', () => {
    // The exact manual-enable state: derived week 1 (no anchor in the mock),
    // the user made week 2 their week, and the activation write stored
    // weeks 1..2 active (highestUnlocked = 2). No week at or below the
    // frontier may render the Locked marker, selected or not.
    mockRepoState.settings = { program_week_override: 2 };
    mockRepoState.highestUnlocked = 2;
    render(<ProgrammeScreen />);

    // Week 1 is inside the frontier: active stems, no Locked marker (and it
    // is no longer the current week — the override moved the effective week).
    expect(screen.getByLabelText('Week 1, 4 stems. Collapsed.')).toBeTruthy();
    expect(screen.queryByText('Week 1 · Current week · Locked')).toBeNull();
    // Week 2: selected marker wins precedence, and no Locked marker hides
    // behind the aria label either.
    expect(screen.getByLabelText('Week 2, 4 stems. Your week. Collapsed.')).toBeTruthy();
    // Week 3 sits above the frontier: still resting, still Locked.
    expect(screen.getByText('Week 3 · Locked')).toBeTruthy();
  });

  it('legacy all-active installs (high stored frontier, low derived) mislabel nothing as Locked (issue 09)', () => {
    // A pre-c10 install has every programme stem active; the stored frontier
    // is the cap while the derived week is still 1. No week may render
    // Locked, because no week is resting.
    mockRepoState.highestUnlocked = 30;
    render(<ProgrammeScreen />);
    expect(screen.queryByText(/Locked/)).toBeNull();
    // Week 2's label carries no marker at all — active stems, never locked.
    expect(screen.getByLabelText('Week 2, 4 stems. Collapsed.')).toBeTruthy();
    expect(screen.getByLabelText('Week 1, 4 stems. Current week. Collapsed.')).toBeTruthy();
  });
});

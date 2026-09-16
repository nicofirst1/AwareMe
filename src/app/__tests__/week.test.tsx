import { fireEvent, render, screen } from '@testing-library/react-native';

import ProgrammeScreen from '@/app/week';
import { DEFAULT_SETTINGS, type Settings, type StemRow } from '@/db';

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

function makeWeekStem(week: number, index: number): StemRow & { weekNumber: number } {
  return {
    id: `w${week}-s${index}`,
    text: `Week ${week} stem ${index}`,
    origin: 'seed',
    category: null,
    weight: 1,
    time_of_day: 'morning',
    weekNumber: week,
  };
}

/** Two seeded weeks' worth — enough to prove grouping, ordering, and markers. */
const mockProgrammeStems = [
  ...Array.from({ length: 4 }, (_, i) => makeWeekStem(1, i)),
  ...Array.from({ length: 4 }, (_, i) => makeWeekStem(2, i)),
];

const mockRepoState: {
  settings: Partial<Settings>;
  settingWrites: [string, unknown][];
  firstSitting: { startedAt: string; offsetMin: number } | null;
} = {
  settings: {},
  settingWrites: [],
  firstSitting: null,
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
      },
    }),
  };
});

describe('ProgrammeScreen (week library)', () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRepoState.settings = {};
    mockRepoState.settingWrites = [];
    mockRepoState.firstSitting = null;
  });

  it('renders all 30 week cards with stem counts, ordered', () => {
    render(<ProgrammeScreen />);
    // No anchor yet → derived week 1, so Week 1 carries the marker and the
    // others don't (§6.2: the derivation starts at week 1).
    expect(screen.getByText('Week 1 · Current week')).toBeTruthy();
    expect(screen.getByText('Week 2')).toBeTruthy();
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
    expect(screen.getByText('Sit on this week')).toBeTruthy();
    expect(screen.getByText('Make this my week')).toBeTruthy();
  });

  it('one-off sitting routes to /write?week=N with manual origin semantics (never rotates)', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 2, 4 stems. Collapsed.'));
    fireEvent.press(screen.getByText('Sit on this week'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/write', params: { week: '2' } });
    expect(mockRepoState.settingWrites).toEqual([]); // a one-off sit never writes anything
  });

  it('"make this my week" sets the override; a selected week offers clearing it', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 2, 4 stems. Collapsed.'));
    fireEvent.press(screen.getByText('Make this my week'));
    expect(mockRepoState.settingWrites).toEqual([['program_week_override', 2]]);
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
  });

  it('does not offer sitting actions on an empty week', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 3, 0 stems. Collapsed.'));
    expect(screen.getByText('The sitting actions appear once this week has active stems.')).toBeTruthy();
    expect(screen.queryByText('Sit on this week')).toBeNull();
  });

  it('never writes anything but the override (§13.7)', () => {
    render(<ProgrammeScreen />);
    fireEvent.press(screen.getByLabelText('Week 1, 4 stems. Current week. Collapsed.'));
    fireEvent.press(screen.getByText('Make this my week'));
    for (const [key] of mockRepoState.settingWrites) {
      expect(key).toBe('program_week_override');
    }
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';

import StemEditScreen from '@/app/stem-edit';
import { type LibraryStemRow } from '@/db';

// Route params are per-test (edit form with ?id, bare add form) — a
// mock-prefixed holder so jest.mock's factory can reach it despite hoisting
// (same pattern as write.test.tsx).
const mockParams: { value: Record<string, string> } = { value: {} };

// Shared router spy (was a fresh object per call, so navigation was
// unassertable — same fix write.test.tsx got in w1-t2).
const mockRouter = { back: jest.fn(), push: jest.fn() };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams.value,
  useRouter: () => mockRouter,
}));

function makeStem(id: string, overrides: Partial<LibraryStemRow> = {}): LibraryStemRow {
  return {
    id,
    text: 'Mock stem fixture text for the editor test',
    origin: 'seed',
    category: 'awareness',
    weight: 1,
    time_of_day: 'morning',
    active: 1,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    weekNumber: 1,
    ...overrides,
  };
}

// Parametrizable repo state + shared write spies (mock-prefixed so the
// hoisted factory can reach them), so each test shapes its own library.
const mockRepoState: { stems: LibraryStemRow[] } = { stems: [] };
const mockSetStemActive = jest.fn();

jest.mock('@/db', () => ({
  getRepository: () => ({
    listAllStems: () => mockRepoState.stems,
    listStemTexts: () => mockRepoState.stems.map((s) => s.text),
    updateStem: jest.fn(),
    addStem: jest.fn(() => 'new-stem-id'),
    setStemActive: mockSetStemActive,
    softDeleteStem: jest.fn(),
  }),
}));

const mockStem = makeStem('stem-edit-fixture');

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.value = {};
  mockRepoState.stems = [mockStem];
});

// s1-F2 / D6 (packet-7 w1-t1): the "How often" three-way weight control
// wrote a value no code read (zero consumers, ADR-0004) — a lying
// affordance. It is removed from BOTH forms (one component: the edit form
// via the row pencil, the add form via header Add / "Add your own").
// Failing-first: both assertions below fail while the chips still render.
describe('StemEditScreen — weight control removal', () => {
  it('renders the add form with no "How often" chip group', () => {
    mockParams.value = {};
    render(<StemEditScreen />);

    // The form itself renders (the surviving sections are present), so a
    // pass below means the weight group is gone, not the whole screen.
    expect(screen.getByText('Category (optional)')).toBeTruthy();
    expect(screen.getByText('Time of day')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();

    expect(screen.queryByText('How often')).toBeNull();
    expect(screen.queryByText('Less often')).toBeNull();
    expect(screen.queryByText('More often')).toBeNull();
  });

  it('renders the edit form with no "How often" chip group', () => {
    mockParams.value = { id: mockStem.id };
    render(<StemEditScreen />);

    expect(screen.getByText('Edit stem')).toBeTruthy();
    expect(screen.getByText('Category (optional)')).toBeTruthy();
    expect(screen.getByText('Time of day')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();

    expect(screen.queryByText('How often')).toBeNull();
    expect(screen.queryByText('Less often')).toBeNull();
    expect(screen.queryByText('More often')).toBeNull();
  });
});

// s2-3 / D5 + D9 finding 7 (packet-7 w1-t3): the editor's Archive wrote
// setStemActive directly, bypassing the "at least one stem stays active"
// guard the library's bulk Deactivate enforces (canDeactivateStems) — a
// user could archive their only active stem from the edit screen. The
// guard's scope is UNCHANGED (contract 1): still global, still
// at-least-one; this ticket only routes the editor through it. The
// temporary-deactivation note is the w1-t6 rider reassigned here by the
// coordinator's 10:20 STEER (Archive lives in this file, not stems.tsx);
// w2-t4 retires it when the provenance engine lands. Failing-first: the
// guard and note assertions below fail while toggleArchive is unguarded.
describe('StemEditScreen — archive guard + programme deactivation note', () => {
  it('archiving the only active stem is blocked with the notice', () => {
    mockParams.value = { id: mockStem.id };
    mockRepoState.stems = [
      mockStem,
      makeStem('inactive-fixture', { text: 'Mock inactive fixture text', active: 0 }),
    ];
    render(<StemEditScreen />);

    fireEvent.press(screen.getByText('Archive'));

    expect(screen.getByText('At least one stem must stay active.')).toBeTruthy();
    expect(mockSetStemActive).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('archives when another active stem remains, with no notice', () => {
    mockParams.value = { id: mockStem.id };
    mockRepoState.stems = [
      mockStem,
      makeStem('other-active-fixture', { text: 'Mock other active fixture text' }),
    ];
    render(<StemEditScreen />);

    fireEvent.press(screen.getByText('Archive'));

    expect(mockSetStemActive).toHaveBeenCalledWith(mockStem.id, false);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(screen.queryByText('At least one stem must stay active.')).toBeNull();
  });

  it('never blocks unarchive (activating is always fine)', () => {
    mockParams.value = { id: mockStem.id };
    mockRepoState.stems = [makeStem(mockStem.id, { active: 0 })];
    render(<StemEditScreen />);

    fireEvent.press(screen.getByText('Unarchive'));

    expect(mockSetStemActive).toHaveBeenCalledWith(mockStem.id, true);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(screen.queryByText('At least one stem must stay active.')).toBeNull();
  });

  it('Archive on a programme stem says deactivation is temporary (visible + a11y label)', () => {
    mockParams.value = { id: mockStem.id };
    // Fixture default: active programme stem (origin seed, weekNumber 1).
    render(<StemEditScreen />);

    expect(screen.getByText(PROGRAMME_REACTIVATION_NOTE)).toBeTruthy();
    expect(screen.getByLabelText(`Archive. ${PROGRAMME_REACTIVATION_NOTE}`)).toBeTruthy();
  });

  it('no reactivation note on a user stem (weekNumber null)', () => {
    mockParams.value = { id: 'user-fixture' };
    mockRepoState.stems = [
      makeStem('user-fixture', { origin: 'user', weekNumber: null, text: 'Mock user fixture text' }),
    ];
    render(<StemEditScreen />);

    expect(screen.queryByText(PROGRAMME_REACTIVATION_NOTE)).toBeNull();
    expect(screen.getByLabelText('Archive')).toBeTruthy();
  });
});

// w1-t6 rider reassigned to t3 (coordinator STEER 2026-09-23 10:20):
// duplicates the row-caption constant in stems.tsx (out of this cycle's
// file map) verbatim; w2-t4 removes this interim note with the provenance
// engine. Copy per spec §13.4 (descriptive, calm, no guilt); fixture text
// is invented mock copy, no programme/Branden text (spec §5.1).
const PROGRAMME_REACTIVATION_NOTE =
  "Deactivating is temporary: the next weekly reflection or 'Make this my week' brings this stem back.";

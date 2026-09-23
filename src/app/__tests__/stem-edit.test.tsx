import { render, screen } from '@testing-library/react-native';

import StemEditScreen from '@/app/stem-edit';
import { type LibraryStemRow } from '@/db';

// Route params are per-test (edit form with ?id, bare add form) — a
// mock-prefixed holder so jest.mock's factory can reach it despite hoisting
// (same pattern as write.test.tsx).
const mockParams: { value: Record<string, string> } = { value: {} };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams.value,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

function makeStem(id: string): LibraryStemRow {
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
  };
}

const mockStem = makeStem('stem-edit-fixture');

jest.mock('@/db', () => ({
  getRepository: () => ({
    listAllStems: () => [mockStem],
    listStemTexts: () => [mockStem.text],
    updateStem: jest.fn(),
    addStem: jest.fn(() => 'new-stem-id'),
    setStemActive: jest.fn(),
    softDeleteStem: jest.fn(),
  }),
}));

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

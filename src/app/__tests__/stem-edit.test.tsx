import { DatabaseSync } from 'node:sqlite';

import { fireEvent, render, screen } from '@testing-library/react-native';

import StemEditScreen from '@/app/stem-edit';
import { type LibraryStemRow } from '@/db';
import { migrate } from '@/db/migrate';
import { Repository } from '@/db/repository';
import { nodeSqliteExecutor } from '@/db/testSupport/nodeSqliteExecutor';
import { utcBoundsOfLocalDay } from '@/session/program';

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
  it('disabling the only active stem is blocked with the notice', () => {
    mockParams.value = { id: mockStem.id };
    mockRepoState.stems = [
      mockStem,
      makeStem('inactive-fixture', { text: 'Mock inactive fixture text', active: 0 }),
    ];
    render(<StemEditScreen />);

    fireEvent.press(screen.getByText('Disable'));

    expect(screen.getByText('At least one stem must stay active.')).toBeTruthy();
    expect(mockSetStemActive).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('disables when another active stem remains, with no notice', () => {
    mockParams.value = { id: mockStem.id };
    mockRepoState.stems = [
      mockStem,
      makeStem('other-active-fixture', { text: 'Mock other active fixture text' }),
    ];
    render(<StemEditScreen />);

    fireEvent.press(screen.getByText('Disable'));

    expect(mockSetStemActive).toHaveBeenCalledWith(mockStem.id, false);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(screen.queryByText('At least one stem must stay active.')).toBeNull();
  });

  it('never blocks enabling (activating is always fine)', () => {
    mockParams.value = { id: mockStem.id };
    mockRepoState.stems = [makeStem(mockStem.id, { active: 0 })];
    render(<StemEditScreen />);

    fireEvent.press(screen.getByText('Enable'));

    expect(mockSetStemActive).toHaveBeenCalledWith(mockStem.id, true);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(screen.queryByText('At least one stem must stay active.')).toBeNull();
  });

  it('Disable on a programme stem says deactivation is temporary (visible + a11y label)', () => {
    mockParams.value = { id: mockStem.id };
    // Fixture default: active programme stem (origin seed, weekNumber 1).
    render(<StemEditScreen />);

    expect(screen.getByText(PROGRAMME_REACTIVATION_NOTE)).toBeTruthy();
    expect(screen.getByLabelText(`Disable. ${PROGRAMME_REACTIVATION_NOTE}`)).toBeTruthy();
  });

  it('no reactivation note on a user stem (weekNumber null)', () => {
    mockParams.value = { id: 'user-fixture' };
    mockRepoState.stems = [
      makeStem('user-fixture', { origin: 'user', weekNumber: null, text: 'Mock user fixture text' }),
    ];
    render(<StemEditScreen />);

    expect(screen.queryByText(PROGRAMME_REACTIVATION_NOTE)).toBeNull();
    expect(screen.getByLabelText('Disable')).toBeTruthy();
  });
});

// w1-t6 rider reassigned to t3 (coordinator STEER 2026-09-23 10:20):
// duplicates the row-caption constant in stems.tsx (out of this cycle's
// file map) verbatim; w2-t4 removes this interim note with the provenance
// engine. Copy per spec §13.4 (descriptive, calm, no guilt); fixture text
// is invented mock copy, no programme/Branden text (spec §5.1).
const PROGRAMME_REACTIVATION_NOTE =
  "Deactivating is temporary: the next weekly reflection or 'Make this my week' brings this stem back.";

// w1-t5 (s1-F9, s6-corrected framing): the "Time of day" picker cannot
// change any practice draw (queues are week-based); its ONE live effect is
// the evening reread's `time_of_day='morning'` filter (repository.ts
// listSessionsForDayMorning), which silently drops a stem's today-endings
// from tonight's reflection when the stem is re-tagged off 'morning'. The
// fix is the honest helper note under the picker (constant duplicated
// verbatim here from stem-edit.tsx, per this file's LAST_ACTIVE_NOTICE
// precedent); the wave-2 design (§8.2, unapproved) later supersedes the
// wording. The note duplicates the same sentence the reread query
// implements, so the semantics half of this describe runs against a REAL
// in-memory repository (node:sqlite + migrations), not the mocked barrel —
// the copy's claim is pinned to the live query, not to a mock's behavior.
// Failing-first: the copy assertions fail while the note is missing.
// (w1-t7 excursion: the possessive apostrophe is U+2019, byte-identical to
// the shipped constant in stem-edit.tsx — the t5-audit apostrophe disposition.)
const TIME_OF_DAY_REREAD_NOTE =
  "The evening’s re-read shows the endings you write today on stems tagged Morning.";

function freshLiveRepository(): { raw: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  return { raw, repo: new Repository(executor) };
}

function insertTodaysSessionWithEnding(
  raw: DatabaseSync,
  stemId: string,
  stemText: string,
  startedAt: string,
): string {
  const sessionId = `session-${stemId}`;
  raw
    .prepare(
      `INSERT INTO sessions (id, stem_id, stem_text_snapshot, origin, target_endings, timer_seconds, uncensored_mode,
         started_at, tz, offset_min, device_locale)
       VALUES (?, ?, ?, 'manual', 6, 90, 1, ?, 'Europe/Berlin', 120, 'en-DE')`,
    )
    .run(sessionId, stemId, stemText, startedAt);
  raw
    .prepare(
      `INSERT INTO endings (id, session_id, ordinal, text, started_at, submitted_at, backspace_count)
       VALUES (?, ?, 1, 'Mock ending fixture text', ?, ?, 0)`,
    )
    .run(`ending-${stemId}`, sessionId, startedAt, startedAt);
  return sessionId;
}

describe('StemEditScreen — time-of-day note matches the reread semantics (w1-t5)', () => {
  it('states the reread effect under the picker on the add form', () => {
    mockParams.value = {};
    render(<StemEditScreen />);

    expect(screen.getByText(TIME_OF_DAY_REREAD_NOTE)).toBeTruthy();
  });

  it('states the reread effect under the picker on the edit form', () => {
    mockParams.value = { id: mockStem.id };
    render(<StemEditScreen />);

    expect(screen.getByText(TIME_OF_DAY_REREAD_NOTE)).toBeTruthy();
  });

  // The ticket's named pin: re-tagging a stem updates the reread input set
  // EXACTLY as the copy states — asserted against the real
  // listSessionsForDayMorning query, via the same updateStem call the
  // editor's Save makes. repository.ts is out of this cycle's map; this
  // test does not (and must not) change it — it binds the note's claim to
  // the live semantics so the two cannot drift apart silently.
  it('re-tagging a stem updates the evening reread input set exactly as the copy states', () => {
    const { raw, repo } = freshLiveRepository();
    const text = 'Mock live-repository reread fixture stem';
    const id = repo.addStem({ text, category: null, origin: 'user', timeOfDay: 'morning' });
    const { start, end } = utcBoundsOfLocalDay(new Date());
    const sessionAt = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
    insertTodaysSessionWithEnding(raw, id, text, sessionAt);

    const rereadStemIds = () => repo.listSessionsForDayMorning(start, end).map((r) => r.session.stem_id);

    // Baseline the copy's positive claim: a morning-tagged stem's endings
    // written today ARE in tonight's reread.
    expect(rereadStemIds()).toEqual([id]);

    // Re-tag off Morning, exactly as the editor's Save does — the reread
    // silently drops the stem's today-sessions (the s1-F9 surprise the
    // note names).
    repo.updateStem(id, { text, category: null, timeOfDay: 'evening' });
    expect(rereadStemIds()).toEqual([]);

    // Re-tag back to Morning and the today-endings return — the note stays
    // true in both directions.
    repo.updateStem(id, { text, category: null, timeOfDay: 'morning' });
    expect(rereadStemIds()).toEqual([id]);
  });
});

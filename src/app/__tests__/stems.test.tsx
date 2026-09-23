import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import StemsScreen from '@/app/stems';
import { LibraryStemRow } from '@/db';
import { Palette, Spacing } from '@/constants/theme';

// `useFocusEffect` no-ops without a real navigation tree (see
// node_modules/expo-router/build/useFocusEffect.js); run the effect once on
// mount instead, matching what happens on a real mount-while-focused.
// (`require` inside the factory, not a top-level import: jest.mock()
// factories can't close over out-of-scope variables.)
const mockRouter = { push: jest.fn() };

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), []),
  };
});

function makeStem(i: number): LibraryStemRow {
  const categories = ['awareness', 'self_acceptance', 'responsibility', 'assertiveness', 'purpose', 'integrity'];
  return {
    id: `stem-${i}`,
    text: `Stem number ${i}`,
    origin: 'seed',
    category: categories[i % categories.length],
    weight: 1,
    time_of_day: i % 2 === 0 ? 'morning' : 'evening',
    // i = 1 rests, i = 2 is soft-deleted: the fixture exercises every row
    // state (issue 03) in every test, all inside FlatList's initial window.
    active: i === 1 ? 0 : 1,
    deleted_at: i === 2 ? '2026-01-02T00:00:00.000Z' : null,
    created_at: '2026-01-01T00:00:00.000Z',
    // Weeks 1–3 cycle across the fixture so the week filter has data in
    // every rendered window row.
    weekNumber: (i % 3) + 1,
  };
}

const mockStems = Array.from({ length: 30 }, (_, i) => makeStem(i));

// w2-t4 retirement probes: the exact words the w1-t6 interim note used.
// Kept as literals on purpose — the rebuild's absence assertions hold the
// screen to the retirement (the notes must be gone everywhere, visibly and
// to VoiceOver) and would fail loudly if any form of the note returned.
const ROW_REACTIVATION_NOTE =
  "Deactivating is temporary: the next weekly reflection or 'Make this my week' brings this stem back.";
const BULK_REACTIVATION_NOTE =
  "Deactivated programme stems come back with the next weekly reflection or 'Make this my week'.";

// v13-feedback issue 07: one test swaps the whole library for a focused
// fixture (the evening reflection meta-stem). Null = the default 30-stem list.
let mockStemsOverride: LibraryStemRow[] | null = null;

// w2-t4 (D1, engine-consumed): the ONE binary Programme setting, read via
// the engine's composition. The mock mirrors `getSettings`' two fields this
// screen's reads touch (the engine's readProgrammeWeek reads the override).
let mockProgrammeOn = true;

// w1-t7 (s2-8): bulkSetActive writes repo.setStemActive per effective id —
// the mock below extends with a shared spy so the test can assert exactly
// which rows the bulk actions touched (the mock previously had no
// setStemActive, so any press would have thrown).
const mockSetStemActive = jest.fn();

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    getRepository: () => ({
      listAllStems: () => mockStemsOverride ?? mockStems,
      setStemActive: (...args: unknown[]) => mockSetStemActive(...args),
      // w2-t4: the practice card + grouped default view read the engine's
      // composition (readMorningPracticeQueue / readProgrammeWeek), which
      // consumes these repository reads. Mocked to the same shape the real
      // reads return; the composition truth itself is pinned in w2t2's suites.
      getSettings: () => ({ programme: mockProgrammeOn, program_week_override: null }),
      getFirstProgrammePractice: () => null,
      listCompletedWeeklyReflections: () => [],
      getHighestUnlockedWeek: () => 0,
      getProgrammeStemsForWeek: (week: number) =>
        (mockStemsOverride ?? mockStems).filter(
          (s) => s.origin === 'seed' && s.weekNumber === week && s.active === 1 && s.deleted_at === null,
        ),
    }),
  };
});

beforeEach(() => {
  mockSetStemActive.mockClear();
  mockProgrammeOn = true;
});

afterEach(() => {
  mockStemsOverride = null;
});

// v13-feedback issue 07 fixture: the seeded evening reflection meta-stem
// (c06's backfill tagged it `evening`; it is resting by seed, `origin: 'meta'`).
function makeEveningMetaStem(): LibraryStemRow {
  return {
    id: 'stem-meta-evening',
    text: 'Evening reflection stem',
    origin: 'meta',
    category: null,
    weight: 1,
    time_of_day: 'evening',
    active: 0,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    weekNumber: null,
  };
}

// Opens the filters bottom sheet (w2-t4: the inline panel became a Modal
// sheet — the app's own WeekPicker pattern). The trigger's label carries
// the non-default count (s2-6), so match the stem of the label.
function openFilters() {
  fireEvent.press(screen.getByLabelText(/^Filters(, \d+ active)?$/));
}

describe('StemsScreen', () => {
  // Structural guard for the 375f6b3 regression: an unbounded horizontal
  // ScrollView beside a flex:1 FlatList sibling collapsed to zero height,
  // so the chip row (and neighbours) silently vanished under real data
  // volume even though nothing here throws. Assert every header sibling
  // renders alongside the list, not just the list.
  it('renders search, filters button, a category chip, and list rows together with many stems', () => {
    render(<StemsScreen />);

    expect(screen.getByLabelText('Search stems')).toBeTruthy();
    expect(screen.getByLabelText('Filters')).toBeTruthy();
    expect(screen.getAllByText('awareness').length).toBeGreaterThan(0);
    expect(screen.getByText(mockStems[0].text)).toBeTruthy();
  });

  // w2-t4 (design §4.4, s2-1): the default Active view is grouped
  // practice-first — Morning (your picks, then the programme week block)
  // before Evening (the reflection, then your evening picks, starters
  // included). Fixture rows are built here, never derived from the shipped
  // corpus (the round's corpus-conditional hazard).
  it('opens on the grouped practice-first default view', () => {
    mockStemsOverride = [
      makeStem(0), // seed, week 1, morning → the effective week's programme group
      // makeStem(1) rests and makeStem(2) is soft-deleted by the fixture —
      // these overrides restore them to active rows.
      { ...makeStem(1), origin: 'user', weekNumber: null, time_of_day: 'morning', text: 'User morning pick', active: 1 },
      { ...makeStem(2), origin: 'meta', weekNumber: null, active: 1, deleted_at: null, text: 'Meta fixture stem' },
      { ...makeStem(3), origin: 'user', weekNumber: null, time_of_day: 'evening', text: 'User evening pick' },
      { ...makeStem(4), origin: 'seed', weekNumber: null, time_of_day: 'evening', text: 'Starter fixture stem' },
    ];
    render(<StemsScreen />);

    // Section headers, in the design's anatomy. The eyebrows share their
    // labels with the per-row time-of-day chips (the chip rule — same words
    // on purpose), so these read as "present", not "unique".
    expect(screen.getAllByText('Morning').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Evening').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Your picks')).toHaveLength(2); // morning + evening sub-groups
    expect(screen.getByText('Programme · Week 1')).toBeTruthy(); // the group header carries the week (owner revision)
    expect(screen.getAllByText('Reflection').length).toBeGreaterThanOrEqual(2); // sub-header + the meta row's tag

    // The row document order follows the groups: morning picks, programme
    // week, reflection, evening picks (input order within a group).
    const rowTexts = screen
      .getAllByLabelText(/^Write on:/)
      .map((node) => node.props.accessibilityLabel?.match(/^Write on: (.*?)\. /)?.[1]);
    expect(rowTexts).toEqual([
      'User morning pick',
      'Stem number 0',
      'Meta fixture stem',
      'User evening pick',
      'Starter fixture stem',
    ]);
  });

  // w2-t4 (design §4.1/§4.4): the pilot "Official programme" row is gone;
  // its week door lives in the programme group header (this test) and the
  // practice card's week link. Replaces the pilot-row navigation pin.
  it('opens the weeks screen from the programme group header link', () => {
    render(<StemsScreen />);

    fireEvent.press(screen.getByLabelText('Programme Week 1. Opens the programme weeks.'));
    expect(mockRouter.push).toHaveBeenCalledWith('/week');
  });

  // w2-t4 (D3, mockup 07): Programme off — the grouped default is picks-only,
  // no programme group header anywhere, and the practice card names picks
  // alone. The identity chips still say Programme (origin identity, D2
  // display), so the absence pin targets the group header, not the chips.
  it('shows a picks-only default view while Programme is off', () => {
    mockProgrammeOn = false;
    mockStemsOverride = [makeStem(0)]; // a seed week-1 stem: not a pick, block off
    render(<StemsScreen />);

    expect(screen.getAllByText('Morning').length).toBeGreaterThan(0); // eyebrow + the row's own chip
    expect(screen.getByText('No picks yet. Activate stems below or add your own.')).toBeTruthy();
    expect(screen.queryByText('Programme · Week 1')).toBeNull(); // no group header
    expect(screen.queryByText('Evening')).toBeNull(); // nothing to group — the section stays away
    // The card states the off shape.
    expect(screen.getByText('Morning · 0 picks')).toBeTruthy();
  });

  // w2-t4 (design §4.2): the practice summary card names the composition
  // with counts read from the engine's composed queue (one composition, two
  // views), and expands in place to the actual stems + the two quiet links.
  it('practice summary card names counts from the composed queue and expands to the practice', () => {
    mockStemsOverride = [
      makeStem(0), // seed, week 1, morning → programme block (counted by the queue)
      { ...makeStem(1), origin: 'user', weekNumber: null, time_of_day: 'morning', text: 'User morning pick', active: 1 },
      { ...makeStem(2), origin: 'meta', weekNumber: null, active: 1, deleted_at: null, text: 'Meta fixture stem' },
      { ...makeStem(3), origin: 'user', weekNumber: null, time_of_day: 'evening', text: 'User evening pick' },
      { ...makeStem(4), origin: 'seed', weekNumber: null, time_of_day: 'evening', text: 'Starter fixture stem' },
    ];
    render(<StemsScreen />);

    // Collapsed, Programme on: 1 pick + the week-1 block (1 seed row).
    expect(screen.getByText('Morning · 2 stems: 1 pick + Programme Week 1 (1)')).toBeTruthy();
    // Evening: reread + the reflection + 2 evening picks (starter included).
    expect(screen.getByText('Evening · reread + reflection + 2 picks')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Practice summary'));
    // The actual stems, morning queue first, then the evening practice.
    expect(screen.getAllByText('User morning pick').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Stem number 0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Meta fixture stem').length).toBeGreaterThan(0);
    // The quiet links: the second week door + the marked way back to the list.
    expect(screen.getByLabelText('Week 1. Opens the programme weeks.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Week 1. Opens the programme weeks.'));
    expect(mockRouter.push).toHaveBeenCalledWith('/week');
  });

  // w2-t4 (design §4.2, C4): "Pick more stems" is the card's marked exit —
  // it clears every filter (the query included) and collapses the card.
  it("'Pick more stems' clears the filters and collapses the card", () => {
    mockStemsOverride = [
      makeStem(0),
      { ...makeStem(1), origin: 'user', weekNumber: null, time_of_day: 'morning', text: 'User morning pick', active: 1 },
    ];
    render(<StemsScreen />);

    fireEvent.changeText(screen.getByLabelText('Search stems'), 'User morning');
    expect(screen.getByText('Showing 1 of 2')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Practice summary'));
    fireEvent.press(screen.getByText('Pick more stems'));

    expect(screen.getByLabelText('Search stems').props.value).toBe('');
    expect(screen.getByText('Showing 2 of 2')).toBeTruthy();
    expect(screen.queryByText('Pick more stems')).toBeNull(); // card collapsed again
  });

  // w2-t4 (s2-6): the filter state is always visible — "Showing X of Y"
  // above the list, the Filters button carrying the non-default count, and
  // the sheet header repeating the live count plus the global active/
  // disabled counts (the old summary line's new home). "Clear filters" is
  // the marked exit (C4) and clears the query too (it is a filter — w1-t7c).
  it('shows the filtered count everywhere: Showing line, badge, sheet header — and Clear filters resets all', () => {
    render(<StemsScreen />);

    // 30 fixture rows, one resting + one soft-deleted: 28 shown of 30.
    expect(screen.getByText('Showing 28 of 30')).toBeTruthy();
    expect(screen.getByLabelText('Filters')).toBeTruthy(); // no badge while everything is default

    fireEvent.changeText(screen.getByLabelText('Search stems'), 'number 11');
    expect(screen.getByText('Showing 1 of 30')).toBeTruthy();
    expect(screen.getByLabelText('Filters, 1 active')).toBeTruthy();

    openFilters();
    // The sheet header repeats the live count — the same number the
    // always-visible line above the list shows (s2-6), so read as "shown".
    expect(screen.getAllByText('Showing 1 of 30').length).toBeGreaterThan(0);
    expect(screen.getByText('28 active · 1 disabled')).toBeTruthy(); // global counts live in the sheet

    fireEvent.press(screen.getByText('Morning')); // a second non-default filter
    expect(screen.getAllByText('Showing 0 of 30').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByText('Clear filters'));
    expect(screen.getAllByText('Showing 28 of 30').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Search stems').props.value).toBe('');
    expect(screen.getByText('28 active · 1 disabled')).toBeTruthy(); // global counts stay in the sheet
    expect(screen.getByLabelText('Filters')).toBeTruthy(); // badge gone again

    fireEvent.press(screen.getByText('Done'));
    expect(screen.queryByLabelText('Close filters')).toBeNull(); // sheet closed
    expect(screen.getByText('Showing 28 of 30')).toBeTruthy();
  });
  // The sheet is the inline panel's replacement (s5 #4: the State buttons
  // were clipped unreachable at the screen bottom): every control renders
  // inside the sheet's own scroll view — presence here, reachability on
  // device (capture scene 2).
  it('filters sheet carries every control: week picker, State, Origin, Time of day', () => {
    render(<StemsScreen />);

    openFilters();
    expect(screen.getByText('State')).toBeTruthy();
    expect(screen.getByText('Origin')).toBeTruthy();
    expect(screen.getByText('Time of day')).toBeTruthy();
    expect(screen.getByLabelText('Programme week: All weeks')).toBeTruthy();
    // 'Disabled' is unique here (no disabled badges render under the default
    // State filter); 'Active' is not (row badges carry it too), so the
    // State row's presence is pinned via its label + the Disabled chip.
    expect(screen.getByText('Disabled')).toBeTruthy();
    expect(screen.getByText('Imported')).toBeTruthy();
    expect(screen.getByText('Unset')).toBeTruthy();
  });

  // Issue 03: state is visible at all times — a per-row badge, the state
  // named in the accessible label. The default State filter is 'active',
  // so disabled/deleted rows surface only under another State choice.
  it('shows an Active badge on every listed row and names the state in the label', () => {
    render(<StemsScreen />);

    expect(screen.getByLabelText('Write on: Stem number 0. Active. Long-press to select.')).toBeTruthy();
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(5); // one badge per rendered active row
    // Disabled rows are outside the default State filter.
    expect(screen.queryByLabelText('Write on: Stem number 1. Disabled. Long-press to select.')).toBeNull();
  });

  // w1-t7 (s2's folded a11y gap): the selection-mode row label keeps the
  // Active/Disabled state and the meta caption. Flow now goes through the
  // filters sheet.
  it('selection-mode row labels keep the state and the meta caption', () => {
    mockStemsOverride = [makeStem(0), makeEveningMetaStem()];
    render(<StemsScreen />);

    openFilters();
    // The State row's 'All': with a category present there are four 'All'
    // chips (category strip, State, Origin, Time of day); document order
    // makes index 1 the State row's.
    fireEvent.press(screen.getAllByText('All')[1]);
    fireEvent.press(screen.getByText('Done'));

    fireEvent(screen.getByLabelText(/Write on: Evening reflection stem\./), 'longPress');
    expect(
      screen.getByLabelText(
        'Evening reflection stem. Disabled. Part of the evening reflection, whether Active or Disabled. Selected.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Stem number 0. Active. Not selected.')).toBeTruthy();
  });

  // Issue 03: switching the State filter surfaces disabled and soft-deleted
  // rows, still with their state on the row — 'Disabled' as a badge; a
  // soft-deleted row is neither active nor disabled (no badge, no write
  // entry point, just the dimmed 'deleted' marker, §4.1).
  it('shows Disabled and deleted rows with their state once the State filter includes them', () => {
    render(<StemsScreen />);

    openFilters();
    // With the default State filter ('active') no disabled badges exist, so
    // the chip is the only 'Disabled' text on screen.
    fireEvent.press(screen.getByText('Disabled'));
    expect(screen.getByLabelText('Write on: Stem number 1. Disabled. Long-press to select.')).toBeTruthy();

    // Four 'All' chips: category strip, State, Origin, Time of day — the
    // week filter carries no 'All' chip (it is a picker). Document order
    // makes index 1 the State row's. The length guard turns any structural
    // drift into a loud failure instead of a wrong press.
    const allChips = screen.getAllByText('All');
    expect(allChips).toHaveLength(4);
    fireEvent.press(allChips[1]);
    fireEvent.press(screen.getByText('Done'));
    expect(screen.getByText('Stem number 2')).toBeTruthy(); // soft-deleted: visible for context
    expect(screen.queryByLabelText('Write on: Stem number 2. Active. Long-press to select.')).toBeNull();
    expect(screen.queryByLabelText('Write on: Stem number 2. Disabled. Long-press to select.')).toBeNull();
    expect(screen.getAllByText(/deleted/).length).toBeGreaterThan(0); // the meta marker, not a state badge
  });

  // Issue 03's week filter, rebuilt as a picker (v13-feedback issue 07):
  // selecting a week from the menu filters the list exactly as before —
  // the picker now lives inside the filters sheet; the filter semantics
  // are byte-stable (matchesStemFilters untouched).
  it('filters the list to a chosen programme week via the picker in the sheet', () => {
    render(<StemsScreen />);

    openFilters();
    // The picker opens as a menu of All + weeks 1–30; "Week 2" is unique.
    fireEvent.press(screen.getByLabelText('Programme week: All weeks'));
    fireEvent.press(screen.getByLabelText('Week 2'));
    // The trigger reflects the selection while the sheet is still open.
    expect(screen.getByLabelText('Programme week: Week 2')).toBeTruthy();
    fireEvent.press(screen.getByText('Done'));

    // Fixture weeks cycle 1,2,3: active week-2 stems in the window are
    // stems 4, 7, 10 (stem 1 is the disabled week-2 stem, hidden by the
    // default State filter); week-1/3 stems are gone.
    expect(screen.getByLabelText('Write on: Stem number 4. Active. Long-press to select.')).toBeTruthy();
    expect(screen.queryByLabelText(/Write on: Stem number 0\./)).toBeNull();
    expect(screen.queryByLabelText(/Write on: Stem number 3\./)).toBeNull();
  });

  // Issue 03: origin 'seed' surfaces as "Programme" — display only, the
  // enum value never appears as copy (cross-cycle contract: value stays
  // 'seed' in DB, exports, and tests). The Origin filter chip lives in the
  // sheet now.
  it("displays origin 'seed' as Programme on rows and filters by it from the sheet", () => {
    mockStemsOverride = [{ ...makeStem(0), origin: 'user', weekNumber: null, text: 'User-owned fixture stem' }];
    render(<StemsScreen />);

    expect(screen.queryByText(/seed/)).toBeNull();
    openFilters();
    // With a user-only fixture no row carries a Programme chip, so the
    // Origin filter's chip is the only 'Programme' text.
    fireEvent.press(screen.getByText('Programme'));
    fireEvent.press(screen.getByText('Done'));
    expect(screen.getByText('No stems match.')).toBeTruthy();

    openFilters();
    // With Origin narrowed to Programme the category strip is gone (s2-12:
    // its chips derive from rows matching all OTHER filters — the user-only
    // fixture matches nothing), so the sheet's three 'All' chips are State,
    // Origin, Time of day. Index 1 = Origin.
    fireEvent.press(screen.getAllByText('All')[1]);
    fireEvent.press(screen.getByText('Done'));
    expect(screen.getByText('User-owned fixture stem')).toBeTruthy();
  });

  // v13-feedback issue 07, c06 carry-forward: the library lists the two
  // evening reflection meta-stems (origin 'meta', seeded resting and
  // evening-tagged). The row must treat them honestly: a visible Reflection
  // tag (the bare 'meta' is developer vocabulary), the same state badge as
  // every row so an activation is visible, and copy that never suggests
  // activation is the only path — the reflection alternation reads these
  // rows whatever their state (listMetaStems has no active filter).
  it('treats the evening reflection meta-stem honestly: Reflection tag, state badge, state-honest copy', () => {
    mockStemsOverride = [makeEveningMetaStem()];
    render(<StemsScreen />);

    // Hidden under the default 'active' State filter (the row is resting);
    // the summary counts live in the sheet now.
    expect(screen.queryByText('Evening reflection stem')).toBeNull();

    openFilters();
    // The Evening time-of-day filter matches it — but the 'active' State
    // filter still hides the resting row, so the list stays empty.
    fireEvent.press(screen.getByText('Evening'));
    expect(screen.queryByText('Evening reflection stem')).toBeNull();

    // State 'All': with no categories in this fixture there is no category
    // chip row, so the State row's 'All' is the first of three.
    const allChips = screen.getAllByText('All');
    expect(allChips).toHaveLength(3);
    fireEvent.press(allChips[0]);

    // Visible: the stem, its Reflection tag (replacing a bare 'meta'), the
    // Disabled badge any row would carry, and the caption that says state
    // is not what gates the reflection.
    expect(screen.getByText('Evening reflection stem')).toBeTruthy();
    expect(screen.getByText('Reflection')).toBeTruthy();
    expect(screen.getAllByText('Disabled').length).toBeGreaterThanOrEqual(2); // State chip + row badge
    expect(screen.getByText('Part of the evening reflection, whether Active or Disabled.')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Write on: Evening reflection stem. Disabled. Part of the evening reflection, whether Active or Disabled. Long-press to select.',
      ),
    ).toBeTruthy();
    // The developer vocabulary never leaks as copy.
    expect(screen.queryByText(/meta/)).toBeNull();
  });

  // w2-t4 (design §4.5 + owner revision): the per-row identity chip drops
  // the week number — programme rows read jade "Programme"; the week lives
  // once in the group header and the weeks browser. Weekless seed rows are
  // the Starter set (D7 relabel; s1-F10 dies at the root). user/imported
  // origins display as "Mine"/"Imported" (display-only renames).
  it('renders identity per row: Programme (no week), Starter set, Mine, Imported', () => {
    // One controlled stem per branch, so each chip is read off exactly one
    // row: a seed morning stem of week 7, a seed weekless evening stem (a
    // starter), a user evening stem, and an imported morning stem.
    mockStemsOverride = [
      { ...makeStem(0), time_of_day: 'morning', weekNumber: 7 },
      { ...makeStem(3), time_of_day: 'evening', origin: 'seed', weekNumber: null },
      { ...makeStem(5), time_of_day: 'evening', origin: 'user', category: null, weekNumber: null },
      { ...makeStem(6), time_of_day: 'morning', origin: 'imported', category: null, weekNumber: null },
    ];
    render(<StemsScreen />);

    // The chip's fill sits on the pill View wrapping the label Text, so the
    // assertion walks up from the text node until a fill-bearing style —
    // the first hit IS the chip pill (its Text carries only a color).
    const chipBackground = (label: string) => {
      // Group eyebrows share their words with row chips (the chip rule);
      // eyebrows render before their sections' rows, so the LAST match is
      // always a row chip — the fill under test.
      let node = screen.getAllByText(label).at(-1)!;
      let flat = StyleSheet.flatten(node.props.style);
      while (typeof flat?.backgroundColor === 'undefined' && node.parent) {
        node = node.parent;
        flat = StyleSheet.flatten(node.props.style);
      }
      return flat?.backgroundColor;
    };
    expect(chipBackground('Programme')).toBe(Palette.jade.light.bg); // same pair a Programme filter chip gets
    expect(chipBackground('Starter set')).toBe(Palette.jade.light.bg);
    expect(chipBackground('Morning')).toBe(Palette.amber.light.bg); // same pair a Morning filter chip gets
    expect(chipBackground('Evening')).toBe(Palette.indigo.light.bg);
    // The owner revision: the row's week number renders nowhere — this
    // fixture's programme row is a week-7 stem and no text says "Week 7"
    // (the group header says the EFFECTIVE week 1; the card's block count
    // likewise). The week lives in the group header and the weeks browser.
    expect(screen.queryByText(/Week 7/)).toBeNull();
    // user/imported stay uncolored display text, renamed from the raw enum.
    expect(screen.getByText('Mine')).toBeTruthy();
    expect(screen.getByText('Imported')).toBeTruthy();
    // The raw enums never leak as copy.
    expect(screen.queryByText('user')).toBeNull();
    expect(screen.queryByText('imported')).toBeNull();
    expect(screen.queryByText('morning')).toBeNull();
    expect(screen.queryByText(/seed/)).toBeNull();
  });

  // w2-t4 (s2-12, design §4.6): category chips derive from non-deleted
  // stems matching all OTHER active filters — a chip can never AND the list
  // to empty, and a category whose only rows are soft-deleted offers no
  // chip at all.
  it('derives category chips from visible stems only, so a chip can never empty the list', () => {
    mockStemsOverride = [
      makeStem(0), // active, category awareness
      { ...makeStem(1), category: 'purpose', deleted_at: '2026-01-02T00:00:00.000Z' }, // soft-deleted
    ];
    render(<StemsScreen />);

    expect(screen.queryByText('purpose')).toBeNull(); // its only row is deleted — no chip
    expect(screen.getAllByText('awareness').length).toBeGreaterThan(0); // strip chip + the row's own chip

    // Selecting the only offered chip can never produce an empty AND-result.
    // The strip renders above the list, so index 0 is the strip's chip.
    fireEvent.press(screen.getAllByText('awareness')[0]);
    expect(screen.getByText('Stem number 0')).toBeTruthy();
  });

  // w1-t7 (s2-8 + s2-7 residual): bulk actions apply to the rows the user
  // can SEE — the current filter result ∩ the selection, soft-deleted rows
  // excluded. Filters changed after selecting narrow the write; the search
  // query is a filter too, so the selection survives keystrokes (the
  // alternative — clear selection on filter change — would dump it on every
  // keystroke mid-bulk).
  it('applies bulk actions only to rows the current filters show', () => {
    const user = makeStem(20);
    user.origin = 'user';
    user.weekNumber = null;
    user.text = 'User-owned fixture stem';
    mockStemsOverride = [makeStem(0), makeStem(4), user];
    render(<StemsScreen />);

    fireEvent(screen.getByLabelText(/Write on: Stem number 0\./), 'longPress');
    // Selection mode is now on: subsequent rows toggle via their
    // selection-mode labels (the 'Write on:' label is replaced).
    fireEvent.press(screen.getByLabelText('Stem number 4. Active. Not selected.'));
    fireEvent.press(screen.getByLabelText('User-owned fixture stem. Active. Not selected.'));
    expect(screen.getByText('3 selected')).toBeTruthy();

    // Filtering down to the user row keeps the selection (a query keystroke
    // must not dump it) and narrows the effective set.
    fireEvent.changeText(screen.getByLabelText('Search stems'), 'User-owned');
    expect(screen.getByText('3 selected')).toBeTruthy();

    fireEvent.press(screen.getByText('Deactivate'));
    expect(mockSetStemActive).toHaveBeenCalledTimes(1);
    expect(mockSetStemActive).toHaveBeenCalledWith('stem-20', false);
  });

  // D5 (contract 1, unchanged through the rebuild): the global at-least-one
  // guard still blocks a bulk Deactivate that would empty the library, with
  // the same notice copy.
  it('still blocks a bulk Deactivate that would leave zero active stems', () => {
    mockStemsOverride = [makeStem(0)];
    render(<StemsScreen />);

    fireEvent(screen.getByLabelText(/Write on: Stem number 0\./), 'longPress');
    fireEvent.press(screen.getByText('Deactivate'));

    expect(screen.getByText('At least one stem must stay active.')).toBeTruthy();
    expect(mockSetStemActive).not.toHaveBeenCalled();
  });

  // w2-t4 (design §4.5, engine landed): the interim temporary-deactivation
  // note retires everywhere — under D2 a deactivated programme row is never
  // re-activated by automation, so the caption would be the stale-citation
  // smell. Absence is pinned in all four former sites: row caption, row
  // a11y label, bulk a11y label, bulk visible note.
  it('retires the temporary-deactivation note from every site', () => {
    render(<StemsScreen />);

    expect(screen.queryByText(ROW_REACTIVATION_NOTE)).toBeNull();
    expect(screen.getByLabelText('Write on: Stem number 0. Active. Long-press to select.')).toBeTruthy();

    fireEvent(screen.getByLabelText(/Write on: Stem number 0\./), 'longPress');
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByLabelText('Deactivate')).toBeTruthy(); // plain label — no note append
    expect(screen.queryByText(BULK_REACTIVATION_NOTE)).toBeNull();
  });

  // w1-t7 (s2-11): the search matches stem text only (stemLibraryFilter),
  // so the placeholder must say what it searches.
  it('search states its scope in the placeholder', () => {
    render(<StemsScreen />);

    expect(screen.getByPlaceholderText('Search stem text')).toBeTruthy();
  });

  // w2-t4 (design §4.1): the two pilot rows are gone (the chrome diet);
  // the header Add stays the authoring door.
  it('drops the pilot rows and keeps the header Add as the editor door', () => {
    render(<StemsScreen />);

    expect(screen.queryByText('Official programme')).toBeNull();
    expect(screen.queryByText('Add your own')).toBeNull();
    expect(screen.queryByText('Thirty weeks of guided practice')).toBeNull();
    fireEvent.press(screen.getByText('Add'));
    expect(mockRouter.push).toHaveBeenCalledWith('/stem-edit');
  });

  // t11 (packet-3, cluster 7 remainder routed from t6's FLAG 18:04): the
  // category chip strip is a full-width horizontal ScrollView, so its chips
  // painted flush to the screen border at 320dp (banked probe: non-bg pixels
  // in the last-6-px edge column of the chip band) instead of respecting the
  // Spacing.four screen margin every other block on this screen uses
  // (controlsRow, actionBar). The strip must be inset by that same margin,
  // and its scroll content must not add a second horizontal padding on top
  // of the inset — that would double-indent the first chip away from the
  // Search input above it.
  it('insets the category chip strip by the screen margin with no second scroll padding', () => {
    render(<StemsScreen />);

    // Walk up from the category row's 'All' chip to the horizontal ScrollView
    // (the only rendered node carrying contentContainerStyle; the filters
    // sheet's ScrollView lives inside a closed Modal).
    let node = screen.getByText('All');
    while (node && node.props.contentContainerStyle === undefined) node = node.parent;
    expect(node).toBeTruthy();

    const outer = StyleSheet.flatten(node.props.style);
    expect(outer.marginHorizontal).toBe(Spacing.four);

    const content = StyleSheet.flatten(node.props.contentContainerStyle);
    expect(content.paddingHorizontal).toBeUndefined();
  });
});

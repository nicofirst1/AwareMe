import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  CategoryColors,
  MinTouchTarget,
  Palette,
  Radius,
  Spacing,
  type CategoryName,
  type PaletteName,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getRepository, LibraryStemRow } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import {
  canDeactivateStems,
  groupForDefaultView,
  matchesStemFilters,
  orderForFlatView,
  type LibraryGroupKey,
  type TimeOfDayFilter,
} from '@/session/stemLibraryFilter';
import { readProgrammeWeek } from '@/session/programRead';
import { PROGRAMME_WEEK_CAP } from '@/session/program';

function isCategoryName(c: string | null): c is CategoryName {
  return c !== null && c in CategoryColors;
}

type OriginFilter = 'all' | LibraryStemRow['origin'];
type CategoryFilter = 'all' | string;
type WeekFilter = 'all' | number;
type Theme = ReturnType<typeof useTheme>;
type Router = ReturnType<typeof useRouter>;

const ALL_WEEKS = Array.from({ length: PROGRAMME_WEEK_CAP }, (_, i) => i + 1);

// Issue 03's week filter, as a picker's option list (v13-feedback issue 07:
// "program week should be a picker instead of a list of numbers").
const WEEK_OPTIONS: { label: string; value: WeekFilter }[] = [
  { label: 'All weeks', value: 'all' },
  ...ALL_WEEKS.map((w) => ({ label: `Week ${w}`, value: w })),
];

// The hue-bearing filter options (v13-feedback issue 07, owner feedback
// "morning and programme have no color"): time-of-day and the programme
// origin carry a Palette hue the way the category chips do. p11 restore
// (the approved mockup): the same hues return to the row chips — the row
// tag and its filter chip resolve from the same mapping, so they can never
// drift apart. Origin gains the ratified packet-11 hues (Mine = teal,
// Imported = stone, owner-approved option A 2026-09-25); the neutral
// options (All, Unset) stay uncolored: the hue marks the dimension, not
// every choice.
const TIME_OF_DAY_HUES: Record<'morning' | 'evening', PaletteName> = {
  morning: 'amber',
  evening: 'indigo',
};
const PROGRAMME_ORIGIN_HUE: PaletteName = 'jade';

// The p8 state badge, restored verbatim by packet 11 (the approved mockup
// re-quotes its light pairs as .st/.st-off): a state chip on every row, so
// active/disabled is readable as TEXT at all times, never only through the
// group header. Same anatomy as the other row chips (stateBadge style), so
// the chip row reads as one family.
const STATE_BADGE = {
  active: {
    light: { bg: '#E4F0E5', text: '#3D6B43' },
    dark: { bg: '#26372A', text: '#A6CFA9' },
  },
  resting: {
    light: { bg: '#F6EAE9', text: '#7C4B47' },
    dark: { bg: '#372A29', text: '#D0A09C' },
  },
} as const;

// The mockup's category icon mapping (approved 2026-09-25: person =
// integrity, heart = self-acceptance, eye/shield/bubble/compass for the
// rest — all Ionicons-mappable). Supersedes the p8 set's megaphone/
// ribbon picks; the mockup is the ratified reference.
const CATEGORY_ICON: Record<CategoryName, keyof typeof Ionicons.glyphMap> = {
  awareness: 'eye-outline',
  self_acceptance: 'heart-outline',
  responsibility: 'shield-outline',
  assertiveness: 'chatbubble-outline',
  purpose: 'compass-outline',
  integrity: 'person-outline',
};

// The library's base grouping is Active / Disabled (p8, owner-approved
// mirror: "you can immediately see what are actives and which one are
// not"): two group headers with counts and a collapse chevron, no
// subtitles, Active ordered by the stable flat order (s2-1's learnable
// sequence now lives INSIDE the Active group), Disabled in corpus
// order. Filters narrow INSIDE the grouping and never flatten it —
// `matchesStemFilters` stays the only predicate, and the State filter is
// owned by the grouping itself (the sheet has no State row; the default
// State is 'all' and the grouping makes deactivated rows first-class).
// Supersedes the p7 §4.4 practice-first default (see docs/DECISIONS.md,
// Superseded).
//
// Provenance is identity (D2): each row names its origin once, as the
// origin chip at the end of the chip row — Programme (weeked seed),
// Starter set (D7's relabel of weekless seed), Mine, Imported, Reflection.
// p11 restore (the owner-approved mockup,
// .coordination/p11-design/stems-restore-mockup.html): the p8 card anatomy
// is back — every stem row is a card in the ONE backgroundElement cream
// (no per-card edge tint, no white-on-tint), and the chip row returns in
// photo-536's order: state → time of day → category icon chip → origin.
// Mine/Imported gain the ratified origin hues (Palette teal/stone); the
// category chips carry the mockup's leading icon. The p10 gains stay: no
// category strip on the list (the sheet is the categories' only home),
// flat counts row with its hairline, bare group headers + count pills +
// collapse chevron, Showing line counting the visible universe. The
// in-group hairline dividers retire with the cards (the card edges carry
// the separation; the p8 8px gap returns via the list's gap).
// Soft-deleted rows hide behind the sheet's Show-deleted toggle and render
// in `textMuted` (the silhouette token, never an opacity dim) — the full
// chip set in transparent fills, no pencil, never writable.
// Under the engine, deactivating a programme row is the user's own choice
// that no automation reverses, so the w1-t6 temporary-deactivation note
// stays retired everywhere — the D5 at-least-one guard is untouched
// (contract 1).

// The practice card's copy (p8 owner-approved rounds 1-3): counts only —
// collapsed one line ("Currently active N"), expanded two plain lines
// ("Morning N" / "Evening N"). Never stem lists, never links. Counts are
// read-time display values (§13.7: nothing stored) over the practice
// composition (active, non-deleted rows through groupForDefaultView),
// whatever the list filters show.

// The filters bottom sheet (s5 #4: the inline panel's State buttons were
// clipped unreachable at the screen bottom on small screens). The sheet is
// the app's own WeekPicker Modal pattern; the week filter lives in it too.
const SHEET_MAX_HEIGHT = '70%';

type ListEntry =
  | { kind: 'header'; key: string; group: GroupName; count: number; collapsed: boolean }
  | { kind: 'stem'; key: string; stem: LibraryStemRow };

type GroupName = 'active' | 'deactivated' | 'deleted';

/**
 * The stem library (§6.6): opens on the practice-first default view (the
 * grouped practice, §4.4) — every stem still filterable and searchable,
 * with a "write on this now" entry point that bypasses the practice queue
 * (`origin='manual'`, Q2 in docs/DECISIONS.md), plus authoring (ticket 08):
 * add, edit, archive, delete (all on `/stem-edit`), and bulk import
 * (`/stem-import`).
 */
export default function StemsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [stems, setStems] = useState<LibraryStemRow[]>([]);

  // Re-reads on every focus, not just mount, so returning from add/edit/
  // import (which write via the repository, not local state) shows the result.
  // The practice card derives from the same `stems` state, so one read
  // refreshes both.
  useFocusEffect(
    useCallback(() => {
      setStems(getRepository().listAllStems());
    }, []),
  );

  const [query, setQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [timeOfDayFilter, setTimeOfDayFilter] = useState<TimeOfDayFilter>('all');
  // Issue 03: view one programme week's stems ('all' = every stem).
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('all');
  // w2-t4 (s5 #4): the filters live in a bottom sheet, not an inline panel.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // p10 (owner pick): soft-deleted stems hide from the default list; this
  // single-select chip (not an on/off pill pair) reveals them as a read-only
  // tail group. Not a badge term: the Filters button counts the five
  // narrowing filters only — the gate is a view toggle, not a narrowing
  // filter (the mockup's filtered flag names exactly the five).
  const [showDeleted, setShowDeleted] = useState(false);
  // The practice card (§4.2, p8 counts-only shape): collapsed by default —
  // one line, never a page.
  const [practiceExpanded, setPracticeExpanded] = useState(false);
  // p8: per-group collapse state (the mirror's collapsedGroups). A group
  // header's chevron hides its rows; the header itself always renders while
  // the group is non-empty.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<GroupName>>(new Set());
  const toggleGroup = useCallback((group: GroupName) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // s2-12 (w2-t4): the category chips derive from the NON-DELETED stems that
  // match all OTHER active filters (this stem's own category excluded), so a
  // chip can never AND the list to empty, and a category whose only visible
  // rows are gone offers no chip. p10: deleted rows never offer chips — the
  // derivation is showDeleted-independent (the mockup's visibleCategories).
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          stems
            .filter((s) => s.deleted_at === null)
            .filter((s) =>
              matchesStemFilters(s, {
                query,
                activeFilter: 'all',
                originFilter,
                categoryFilter: 'all',
                timeOfDayFilter,
                weekFilter,
              }),
            )
            .map((s) => s.category)
            .filter((c): c is string => c !== null),
        ),
      ).sort(),
    [stems, query, originFilter, timeOfDayFilter, weekFilter],
  );

  // p10: the deleted gate — soft-deleted rows leave the visible universe
  // unless Show deleted is on. "Showing N of M" counts this universe (the
  // mockup's 33-of-33 / 36-of-36 derivation): the numbers never promise
  // rows the list will not show.
  const universe = useMemo(
    () => (showDeleted ? stems : stems.filter((s) => s.deleted_at === null)),
    [stems, showDeleted],
  );

  const filtered = useMemo(
    () =>
      universe.filter((s) =>
        matchesStemFilters(s, { query, activeFilter: 'all', originFilter, categoryFilter, timeOfDayFilter, weekFilter }),
      ),
    [universe, query, originFilter, categoryFilter, timeOfDayFilter, weekFilter],
  );

  // The practice composition's counts (p8): the card counts the active,
  // non-deleted rows through the verbatim groupForDefaultView — whatever
  // the list filters show. Morning = the picks plus the programme week
  // block while Programme is on (D3: while off, programme state is never
  // read); Evening = the evening picks (starters included; the reflection
  // meta-stems are no one's picks).
  const practiceCounts = useMemo(() => {
    const repo = getRepository();
    const programmeOn = repo.getSettings().programme;
    const effectiveWeek = programmeOn ? readProgrammeWeek(repo).currentWeek : null;
    const practiceRows = stems.filter((s) => s.active === 1 && s.deleted_at === null);
    const groups = groupForDefaultView(practiceRows, { programmeOn, effectiveWeek });
    const countOf = (key: LibraryGroupKey) => groups.find((g) => g.key === key)?.stems.length ?? 0;
    return {
      activeTotal: practiceRows.length,
      morning: countOf('morning-picks') + (programmeOn ? countOf('programme-week') : 0),
      evening: countOf('evening-picks'),
    };
  }, [stems]);
  const { activeTotal, morning: morningCount, evening: eveningCount } = practiceCounts;

  // s2-6: the filter state is always visible — the count line above the
  // list, the Filters button carrying the non-default count, and the sheet
  // repeating the live count. The State axis has no filter term: the
  // grouping owns it (p8).
  const filtersActiveCount = useMemo(
    () =>
      [query !== '', originFilter !== 'all', categoryFilter !== 'all', timeOfDayFilter !== 'all', weekFilter !== 'all'].filter(
        Boolean,
      ).length,
    [query, originFilter, categoryFilter, timeOfDayFilter, weekFilter],
  );

  // The list data (p8 mirror renderList; p10 flat port): the grouped render
  // over the rows the filters already selected, plus the p10 tail group —
  // soft-deleted rows reach the list ONLY through the Show-deleted gate
  // (they are outside `universe` otherwise). Partition by state identity in
  // the renderer; Active keeps the stable flat order (s2-1), Disabled and
  // Deleted keep corpus order; an empty group's header skips; when all are
  // empty the FlatList's EmptyState takes over. Filters narrow inside the
  // grouping — nothing ever flattens it.
  const listData = useMemo((): ListEntry[] => {
    const active = filtered.filter((s) => s.active === 1 && s.deleted_at === null);
    const deactivated = filtered.filter((s) => s.active !== 1 && s.deleted_at === null);
    const deleted = filtered.filter((s) => s.deleted_at !== null);
    const entries: ListEntry[] = [];
    if (active.length > 0) {
      const collapsed = collapsedGroups.has('active');
      entries.push({ kind: 'header', key: 'hdr-active', group: 'active', count: active.length, collapsed });
      if (!collapsed) {
        for (const s of orderForFlatView(active)) entries.push({ kind: 'stem', key: s.id, stem: s });
      }
    }
    if (deactivated.length > 0) {
      const collapsed = collapsedGroups.has('deactivated');
      entries.push({ kind: 'header', key: 'hdr-deactivated', group: 'deactivated', count: deactivated.length, collapsed });
      if (!collapsed) {
        for (const s of deactivated) entries.push({ kind: 'stem', key: s.id, stem: s });
      }
    }
    if (deleted.length > 0) {
      const collapsed = collapsedGroups.has('deleted');
      entries.push({ kind: 'header', key: 'hdr-deleted', group: 'deleted', count: deleted.length, collapsed });
      if (!collapsed) {
        for (const s of deleted) entries.push({ kind: 'stem', key: s.id, stem: s });
      }
    }
    return entries;
  }, [filtered, collapsedGroups]);

  // Selection mode (2026-09-11, replaces long-press-instant-toggle — see
  // docs/DECISIONS.md): long-press enters it and selects that row; while active,
  // tap toggles membership instead of opening write/edit.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const selectionMode = selectedIds.size > 0;
  const [bulkNotice, setBulkNotice] = useState(false);

  // w1-t7 (s2-8 + s2-7 residual): bulk actions apply to the rows the user
  // can SEE — the current filter result ∩ the selection, with soft-deleted
  // rows excluded (they are visible for context, never writable, closing
  // the latent s2-7 write for free). Filters changed after selecting
  // narrow the applied set instead of silently widening it; the search
  // query is a filter too, so "clear selection on filter change" was
  // rejected — it would dump the selection on every keystroke mid-bulk.
  const effectiveSelection = useMemo(
    () => filtered.filter((s) => selectedIds.has(s.id) && s.deleted_at === null),
    [filtered, selectedIds],
  );

  const writeNow = useCallback(
    (stem: LibraryStemRow) => {
      if (stem.deleted_at) return; // deleted stems are visible for context, not writable
      router.push({ pathname: '/write', params: { stemId: stem.id } });
    },
    [router],
  );

  const toggleSelected = useCallback((stem: LibraryStemRow) => {
    if (stem.deleted_at) return;
    setBulkNotice(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(stem.id)) next.delete(stem.id);
      else next.add(stem.id);
      return next;
    });
  }, []);

  const onRowPress = useCallback(
    (stem: LibraryStemRow) => (selectionMode ? toggleSelected(stem) : writeNow(stem)),
    [selectionMode, toggleSelected, writeNow],
  );

  const cancelSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkNotice(false);
  }, []);

  const bulkSetActive = useCallback(
    (active: boolean) => {
      const ids = effectiveSelection.map((s) => s.id);
      // Nothing effective to act on (every selected row is filtered out or
      // soft-deleted): a quiet no-op — no write, no notice, no selection
      // reset (the press does not validate a reset the user never saw).
      if (ids.length === 0) return;
      if (!active && !canDeactivateStems(ids, stems)) {
        setBulkNotice(true);
        return;
      }
      const repo = getRepository();
      for (const id of ids) repo.setStemActive(id, active);
      setStems(repo.listAllStems());
      cancelSelection();
    },
    [effectiveSelection, stems, cancelSelection],
  );

  // C4's marked exit lives in the sheet's "Clear filters" now (the card's
  // "Pick more stems" link died with the counts-only card): every filter —
  // the query included (w1-t7c: the query is a filter) — resets. There is
  // no State term: the grouping owns that axis (p8).
  const clearAllFilters = useCallback(() => {
    setQuery('');
    setOriginFilter('all');
    setCategoryFilter('all');
    setTimeOfDayFilter('all');
    setWeekFilter('all');
  }, []);

  const renderEntry = useCallback(
    ({ item }: { item: ListEntry }) => {
      switch (item.kind) {
        case 'header':
          return (
            <GroupHeader
              group={item.group}
              count={item.count}
              collapsed={item.collapsed}
              theme={theme}
              onToggle={() => toggleGroup(item.group)}
            />
          );
        case 'stem':
          return (
            <StemRow
              item={item.stem}
              theme={theme}
              router={router}
              selectionMode={selectionMode}
              selected={selectedIds.has(item.stem.id)}
              onPress={onRowPress}
              onLongPress={toggleSelected}
            />
          );
      }
    },
    [theme, router, selectionMode, selectedIds, onRowPress, toggleSelected, toggleGroup],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="Stems"
          trailingAction={
            <ThemedView style={styles.headerActions}>
              <Button
                label="Import"
                onPress={() => router.push('/stem-import')}
                variant="text"
                style={styles.headerActionButton}
              />
              <Button label="Add" onPress={() => router.push('/stem-edit')} variant="text" style={styles.headerActionButton} />
            </ThemedView>
          }
        />

        {/* The practice summary card (§4.2) renders inside the FlatList as
            its list header — see the FlatList below. */}

        <ThemedView style={styles.controlsRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search stem text"
            placeholderTextColor={theme.textSecondary}
            style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            accessibilityLabel="Search stems"
          />
          <Pressable
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={filtersActiveCount > 0 ? `Filters, ${filtersActiveCount} active` : 'Filters'}
            style={[styles.moreFiltersButton, { backgroundColor: theme.backgroundElement }]}
          >
            <Ionicons name="options-outline" size={20} color={theme.text} />
            {filtersActiveCount > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {`· ${filtersActiveCount}`}
              </ThemedText>
            )}
          </Pressable>
        </ThemedView>

        {/* s2-6: the filtered count, always visible above the list — the
            one number the library's headline owes the user. p10: it counts
            the visible universe (soft-deleted rows leave it by default). */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.stateSummary}>
          {`Showing ${filtered.length} of ${universe.length}`}
        </ThemedText>

        {selectionMode && (
          <ThemedView style={[styles.actionBar, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="default" style={styles.actionBarLabel}>
              {selectedIds.size} selected
            </ThemedText>
            <ThemedView style={styles.actionBarButtons}>
              <Button label="Activate" onPress={() => bulkSetActive(true)} variant="secondary" style={styles.actionBarButton} />
              <Button label="Deactivate" onPress={() => bulkSetActive(false)} variant="secondary" style={styles.actionBarButton} />
              <Button label="Cancel" onPress={cancelSelection} variant="text" style={styles.actionBarButton} />
            </ThemedView>
          </ThemedView>
        )}

        {bulkNotice && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.notice}>
            At least one stem must stay active.
          </ThemedText>
        )}

        {/* The practice counts row is the list scroll's HEADER (design §4:
            "one scroll with a stable order" — it is the screen's opening
            view and scrolls away; the list takes the screen for browsing.
            Fixed above the scroll stay only the controls the user needs
            while browsing: search and the always-visible Showing line
            (s2-6). p10: the card is a flat tappable row — the hairline
            divider carries the boundary the fill used to imply. */}
        <FlatList<ListEntry>
          data={listData}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState message="No stems match." />}
          ListHeaderComponent={
            <ThemedView style={[styles.practiceCard, { borderBottomColor: theme.border }]}>
              <Pressable
                onPress={() => setPracticeExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Practice summary"
                accessibilityState={{ expanded: practiceExpanded }}
                style={styles.practiceCardHeader}
              >
                <ThemedText type="default">{`Currently active ${activeTotal}`}</ThemedText>
                <Ionicons
                  name={practiceExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={18}
                  color={theme.textSecondary}
                />
              </Pressable>
              {practiceExpanded && (
                <View style={styles.practiceCardBody}>
                  <ThemedText type="default" themeColor="textSecondary">
                    {`Morning ${morningCount}`}
                  </ThemedText>
                  <ThemedText type="default" themeColor="textSecondary">
                    {`Evening ${eveningCount}`}
                  </ThemedText>
                </View>
              )}
            </ThemedView>
          }
          renderItem={renderEntry}
          style={styles.list}
        />

        {/* The filters bottom sheet (s5 #4; the app's own WeekPicker Modal
            pattern): every filter control in one scroll view, opened by the
            Filters button, closed by Done, the scrim, or back. The header
            repeats the live Showing count so the sheet's changes read
            against the number they move. p10: the sheet is the category
            chips' ONLY home (the list's strip is retired — its edge-clip
            defect dies with it), and the Show-deleted row is the deleted
            gate's toggle. No State row: the Active/Disabled grouping owns
            that axis (p8). */}
        <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
          <Pressable style={styles.sheetScrim} onPress={() => setFiltersOpen(false)} accessibilityLabel="Close filters">
            <View
              style={[styles.filterSheet, { backgroundColor: theme.backgroundElement }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderTitles}>
                  <ThemedText type="default">{`Showing ${filtered.length} of ${universe.length}`}</ThemedText>
                </View>
                <View style={styles.sheetHeaderButtons}>
                  <Button label="Clear filters" onPress={clearAllFilters} variant="text" style={styles.sheetClearButton} />
                  <Button label="Done" onPress={() => setFiltersOpen(false)} variant="secondary" style={styles.sheetDoneButton} />
                </View>
              </View>
              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
                {/* p10: the category chips' only home. The chips derive from
                    the non-deleted rows the OTHER filters select (s2-12), so
                    a chip can never AND the list to empty. */}
                <FilterRow
                  label="Categories"
                  options={[
                    { value: 'all', label: 'All' },
                    ...categories.map((c) => ({ value: c, label: c, category: isCategoryName(c) ? c : undefined })),
                  ]}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                />

                <FilterRow
                  label="Origin"
                  options={[
                    { value: 'all', label: 'All' },
                    // Display-only rename (issue 03): origin value stays 'seed'
                    // in DB, exports, and tests. p11: every origin option
                    // carries its hue — Programme jade, Mine teal, Imported
                    // stone (the ratified option A pairs; no plain origin
                    // chips anywhere per the approved mockup).
                    { value: 'seed', label: 'Programme', hue: PROGRAMME_ORIGIN_HUE },
                    { value: 'user', label: 'Mine', hue: 'teal' },
                    { value: 'imported', label: 'Imported', hue: 'stone' },
                  ]}
                  value={originFilter}
                  onChange={(v) => setOriginFilter(v as OriginFilter)}
                />

                <FilterRow
                  label="Time of day"
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'morning', label: 'Morning', hue: TIME_OF_DAY_HUES.morning },
                    { value: 'evening', label: 'Evening', hue: TIME_OF_DAY_HUES.evening },
                    { value: 'none', label: 'Unset' },
                  ]}
                  value={timeOfDayFilter}
                  onChange={(v) => setTimeOfDayFilter(v as TimeOfDayFilter)}
                />

                <WeekPicker value={weekFilter} onChange={setWeekFilter} />

                {/* p10: the deleted gate — one selected-state chip, not an
                    on/off pill pair. On: the read-only "Deleted" tail group
                    renders under Disabled; rows in textMuted, never
                    writable. Not reset by Clear filters (the mockup's
                    clear-filters resets the five narrowing terms only). */}
                <FilterRow
                  label="Deleted"
                  options={[{ value: 'on', label: 'Show deleted' }]}
                  value={showDeleted ? 'on' : 'off'}
                  onChange={() => setShowDeleted((v) => !v)}
                />
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

// The p8 stem card, restored by packet 11 (the approved mockup): the ONE
// backgroundElement cream fill with Radius.medium corners — no per-card
// edge tint, no white-on-tint anywhere — and the chip row in photo-536's
// order: state → time of day → category icon chip → origin. Mine/Imported
// carry the ratified origin hues (Palette teal/stone, option A);
// Programme/Starter stay jade, Reflection stays rose. Soft-deleted rows
// render the same chip set in transparent fills and textMuted ink (the
// silhouette token, never an opacity dim), keep no pencil, and stay
// non-writable (§6.6) — visible only through the sheet's Show-deleted gate.
const StemRow = memo(function StemRow({
  item,
  theme,
  router,
  selectionMode = false,
  selected = false,
  onPress,
  onLongPress,
  editable = true,
  selectable = true,
}: {
  item: LibraryStemRow;
  theme: Theme;
  router: Router;
  onPress: (stem: LibraryStemRow) => void;
  onLongPress: (stem: LibraryStemRow) => void;
  /** w2-t4: the practice card's rows are write-only — no pencil, no selection. */
  editable?: boolean;
  selectable?: boolean;
  /** Meaningless while `selectable` is false; the card's rows omit both. */
  selectionMode?: boolean;
  selected?: boolean;
}) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const isDeleted = item.deleted_at !== null;
  // v13-feedback issue 07 (c06 carry-forward): the library lists the two
  // evening reflection meta-stems (origin 'meta'). The chip row names them
  // (the Reflection rose chip — the bare 'meta' is developer vocabulary),
  // and the caption below the chips carries the honesty: the reflection
  // alternation reads these rows regardless of their state (listMetaStems
  // has no active filter), so activating one is never the only path. Its
  // state only ever gates the generic active-stem reads.
  const isMeta = item.origin === 'meta';

  // The chip set's pairs, resolved per theme from the same mappings the
  // sheet's filter chips read (issue 07's drift guard): state → STATE_BADGE,
  // time of day → TIME_OF_DAY_HUES, category → CategoryColors (+ the
  // mockup's leading icon), origin → jade / rose / teal / stone.
  const statePair = (item.active ? STATE_BADGE.active : STATE_BADGE.resting)[dark ? 'dark' : 'light'];
  const timeOfDayPair = item.time_of_day
    ? Palette[TIME_OF_DAY_HUES[item.time_of_day]][dark ? 'dark' : 'light']
    : null;
  const categoryPair = isCategoryName(item.category) ? CategoryColors[item.category][dark ? 'dark' : 'light'] : null;
  const originPair =
    item.origin === 'meta'
      ? Palette.rose[dark ? 'dark' : 'light']
      : item.origin === 'seed'
        ? Palette[PROGRAMME_ORIGIN_HUE][dark ? 'dark' : 'light']
        : item.origin === 'user'
          ? Palette.teal[dark ? 'dark' : 'light']
          : item.origin === 'imported'
            ? Palette.stone[dark ? 'dark' : 'light']
            : null;
  const originLabel =
    item.origin === 'meta'
      ? 'Reflection'
      : item.origin === 'seed'
        ? item.weekNumber === null
          ? 'Starter set'
          : 'Programme'
        : item.origin === 'user'
          ? 'Mine'
          : item.origin === 'imported'
            ? 'Imported'
            : null;

  // One chip anatomy for the whole row: the pair's fill + ink, or — on a
  // soft-deleted row (the full chip set stays, the honesty without a write
  // invitation) or an unmapped category — transparent with muted/secondary
  // ink. Explicit backgrounds throughout: a bare ThemedView paints the
  // theme `background` (the rowAction note's mismatched-box lesson), and
  // the one-fill rule forbids any white-on-tint inside the cream card.
  const renderChip = (pair: { bg: string; text: string } | null, chipLabel: string, icon?: keyof typeof Ionicons.glyphMap) => {
    const ink = isDeleted ? theme.textMuted : (pair?.text ?? theme.textSecondary);
    return (
      <ThemedView style={[styles.categoryChip, { backgroundColor: isDeleted || !pair ? 'transparent' : pair.bg }]}>
        {icon && <Ionicons name={icon} size={12} color={ink} />}
        <ThemedText type="small" style={{ color: ink }}>
          {chipLabel}
        </ThemedText>
      </ThemedView>
    );
  };

  // Issue 03: the state is named in the accessible label, so it never
  // depends on seeing the group header. (Copy unchanged since p8; p10 adds
  // the Deleted row label — the header alone can't reach a screen reader
  // mid-list.)
  const label = isDeleted
    ? `${item.text}. Deleted.`
    : selectionMode
      ? `${item.text}. ${item.active ? 'Active' : 'Disabled'}.${
          isMeta ? ' Part of the evening reflection, whether Active or Disabled.' : ''
        } ${selected ? 'Selected' : 'Not selected'}.`
      : `Write on: ${item.text}. ${item.active ? 'Active' : 'Disabled'}.${
          isMeta ? ' Part of the evening reflection, whether Active or Disabled.' : ''
        }${selectable ? ' Long-press to select.' : ''}`;

  return (
    <ThemedView style={[styles.row, { backgroundColor: selected ? theme.accentMuted : theme.backgroundElement }]}>
      <Pressable
        onPress={() => onPress(item)}
        onLongPress={selectable ? () => onLongPress(item) : undefined}
        disabled={isDeleted}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDeleted, selected }}
        style={styles.rowMain}
      >
        <ThemedText type="stem" style={isDeleted ? { color: theme.textMuted } : undefined}>
          {item.text}
        </ThemedText>
        <ThemedView style={styles.rowMeta}>
          {/* photo-536 order: state → time of day → category icon chip →
              origin. Issue 03: the state chip keeps the state readable as
              TEXT on every row, never only through the group header. */}
          {renderChip(statePair, item.active ? 'Active' : 'Disabled')}
          {timeOfDayPair &&
            renderChip(timeOfDayPair, item.time_of_day === 'morning' ? 'Morning' : 'Evening')}
          {item.category !== null &&
            renderChip(
              categoryPair,
              item.category.replace(/_/g, ' '),
              categoryPair && isCategoryName(item.category) ? CATEGORY_ICON[item.category] : undefined,
            )}
          {originPair && originLabel && renderChip(originPair, originLabel)}
        </ThemedView>
        {isMeta && !isDeleted && (
          <ThemedText type="small" themeColor="textSecondary">
            Part of the evening reflection, whether Active or Disabled.
          </ThemedText>
        )}
      </Pressable>
      <ThemedView style={styles.rowAction}>
        {selectionMode ? (
          selected && <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
        ) : (
          editable &&
          !isDeleted && (
            <Pressable
              onPress={() => router.push({ pathname: '/stem-edit', params: { id: item.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Edit: ${item.text}`}
              style={styles.editButton}
            >
              <Ionicons name="create-outline" size={20} color={theme.textSecondary} />
            </Pressable>
          )
        )}
      </ThemedView>
    </ThemedView>
  );
});

// The three groups' headers (p8 anatomy — title + count pill + collapse
// chevron — flat since p10): on the bare background, no card fill. Tapping
// the header collapses or expands its group; an empty group renders no
// header at all. The 'deleted' header exists only under the Show-deleted
// gate, as the tail group under Disabled.
function GroupHeader({
  group,
  count,
  collapsed,
  theme,
  onToggle,
}: {
  group: GroupName;
  count: number;
  collapsed: boolean;
  theme: Theme;
  onToggle: () => void;
}) {
  const title = group === 'active' ? 'Active' : group === 'deactivated' ? 'Disabled' : 'Deleted';
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${title} group: ${count} ${count === 1 ? 'stem' : 'stems'}`}
      accessibilityState={{ expanded: !collapsed }}
      style={styles.groupHeader}
    >
      <ThemedText type="default">{title}</ThemedText>
      <View style={styles.groupHeaderTrailing}>
        <ThemedView style={[styles.groupCountPill, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {count}
          </ThemedText>
        </ThemedView>
        <Ionicons name={collapsed ? 'chevron-forward-outline' : 'chevron-down-outline'} size={18} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; hue?: PaletteName; category?: CategoryName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ThemedView style={styles.filterRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.filterLabel}>
        {label}
      </ThemedText>
      <ThemedView style={styles.filterOptions}>
        {options.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            hue={opt.hue}
            category={opt.category}
            selected={opt.value === value}
            onPress={() => onChange(opt.value)}
          />
        ))}
      </ThemedView>
    </ThemedView>
  );
}

// Issue 03's week filter, rebuilt as a picker (v13-feedback issue 07, owner
// feedback: "program week should be a picker instead of a list of numbers"):
// a compact select-style trigger opening a modal menu of All + weeks 1-30.
// No new dependency: Modal, ScrollView, Pressable are React Native core.
// w2-t4: the picker lives inside the filters bottom sheet.
function WeekPicker({ value, onChange }: { value: WeekFilter; onChange: (v: WeekFilter) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const summary = value === 'all' ? 'All weeks' : `Week ${value}`;

  return (
    <ThemedView style={styles.filterRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.filterLabel}>
        Programme week
      </ThemedText>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Programme week: ${summary}`}
        accessibilityState={{ expanded: open }}
        style={[styles.weekPickerTrigger, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      >
        <ThemedText type="small" style={styles.weekPickerLabel}>
          {summary}
        </ThemedText>
        <Ionicons name="chevron-down-outline" size={16} color={theme.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.weekScrim} onPress={close} accessibilityLabel="Close programme week picker">
          {/* Absorbs presses on the sheet's blank area so only the scrim and
              the options close/change the picker. */}
          <View
            style={[styles.weekSheet, { backgroundColor: theme.backgroundElement }]}
            onStartShouldSetResponder={() => true}
          >
            <ThemedText type="default">Programme week</ThemedText>
            <ScrollView style={styles.weekSheetScroll}>
              {WEEK_OPTIONS.map((opt) => {
                const selected = opt.value === value;
                return (
                  <Pressable
                    key={String(opt.value)}
                    onPress={() => {
                      onChange(opt.value);
                      close();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected }}
                    style={styles.weekOption}
                  >
                    <ThemedText type="small" style={selected ? { color: theme.accent } : undefined}>
                      {opt.label}
                    </ThemedText>
                    {selected && <Ionicons name="checkmark" size={16} color={theme.accent} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  // `Button`'s default `paddingVertical: Spacing.three` (16) makes a
  // text-variant button 56pt tall (its 24pt line height plus 32pt of
  // padding), taller than `minHeight: 44` — which stretched ScreenHeader's
  // title row and pushed "Stems" 6pt below stem-edit/stem-import's title
  // (measured: 06-stems-light.axtree.json). Trimming the vertical padding
  // here (Button-local, not the shared component) drops the intrinsic
  // height below 44, so `Button`'s own `minHeight` — not this padding —
  // decides the final 44pt, matching the title row's height exactly.
  headerActionButton: {
    paddingVertical: Spacing.two,
  },
  // In-scroll header (w2-t4): the card spans the list's content column —
  // the FlatList's own contentContainerStyle padding IS the screen margin;
  // a second horizontal margin here would double-indent the card.
  // The practice counts row, flat (p10): no fill, no radius — the row and
  // its hairline divider ARE the card. The FlatList's own
  // contentContainerStyle padding IS the screen margin; a second horizontal
  // margin here would double-indent the row.
  practiceCard: {
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  practiceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MinTouchTarget,
    gap: Spacing.two,
  },
  practiceCardBody: {
    gap: Spacing.half,
    marginTop: Spacing.one,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    gap: Spacing.two,
    flexGrow: 0,
    flexShrink: 0,
  },
  search: {
    flex: 1,
    padding: Spacing.two,
    borderRadius: Radius.small,
  },
  moreFiltersButton: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
    flexDirection: 'row',
    gap: Spacing.half,
  },
  weekPickerTrigger: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
  },
  weekPickerLabel: {
    flexShrink: 1,
  },
  weekScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  weekSheet: {
    maxHeight: '70%',
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  weekSheetScroll: {
    flexGrow: 0,
  },
  weekOption: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  filterRow: {
    gap: Spacing.one,
  },
  filterLabel: {
    marginBottom: Spacing.half,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    // height (not maxHeight): the sheet's rows must stay reachable, and a
    // % cap on an auto-height parent never re-bounds its children (measured
    // on device: the ScrollView kept its content height, overflowed the
    // cap, and the Show deleted row was unreachable below the clip — no
    // flexGrow/flexShrink variant re-engaged the scroll). A definite 70%
    // height against the full-screen scrim makes the ScrollView's flex: 1
    // bound real: five rows nearly fill it at the 320x640 floor, and the
    // internal scroll carries any taller content.
    height: SHEET_MAX_HEIGHT,
    borderTopLeftRadius: Radius.medium,
    borderTopRightRadius: Radius.medium,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  sheetHeaderTitles: {
    flex: 1,
    gap: Spacing.half,
  },
  sheetHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  sheetClearButton: {
    minHeight: MinTouchTarget,
  },
  sheetDoneButton: {
    minHeight: MinTouchTarget,
  },
  sheetScroll: {
    // flex: 1 inside the sheet's definite height: the scroll area bounds
    // itself to the space under the sheet header and scrolls when the
    // filter rows exceed it (the p10 rows added Categories + Show deleted
    // to the old three-row sheet). See filterSheet's note.
    flex: 1,
  },
  sheetScrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  actionBar: {
    flexDirection: 'row',
    // Ticket 01 (320x640 floor): the bar's contents (label + three buttons,
    // ~328px) exceed the 320px inner width (256px), which clipped the
    // trailing Cancel button to a sliver at the screen edge with its touch
    // center off-screen (p7 w2t4). Wrapping moves the buttons row to its own
    // line instead of clipping; at widths where everything fits on one line
    // the layout is unchanged.
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    minHeight: MinTouchTarget,
    // The two wrapped lines' separation when the bar wraps (no-op on one
    // line).
    rowGap: Spacing.two,
    flexGrow: 0,
    flexShrink: 0,
  },
  actionBarLabel: {
    paddingLeft: Spacing.two,
  },
  actionBarButtons: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  actionBarButton: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.two,
  },
  list: {
    flex: 1,
  },
  // p11 restore (the approved mockup): the card separation — the p8 8px
  // gap between cards, restored as the FlatList content gap. The container
  // padding IS the screen margin.
  listContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  // The groups' header rows (p8 anatomy, p10 flat): title + count pill +
  // one quiet chevron on the bare background — no fill, no radius. The
  // whole row is the collapse toggle; marginTop separates the groups.
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MinTouchTarget,
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
  },
  // The mockup's gcount: a small pill over the backgroundElement fill.
  groupCountPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.chip,
  },
  groupHeaderTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // The p8 stem card, restored (p11, the approved mockup): the ONE cream
  // fill arrives from StemRow's style array (backgroundElement, or
  // accentMuted while selected — the p8 selection), the Radius.medium
  // corners and Spacing.three padding here. The card edges + the list's 8px
  // gap carry the separation: the p10 hairline row divider retired with the
  // cards, and the per-card edge tint stays retired (the one-fill rule —
  // the mockup restores the card WITHOUT its old 3px tint).
  // `alignItems: 'flex-start'` (not 'center'): T2's measured wobble was the
  // stem-text first line centering against the row's full height, which
  // varies with the chip row's wrapping — top-anchoring keeps the first
  // line's y constant regardless of how the chips wrap.
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.three,
    borderRadius: Radius.medium,
    gap: Spacing.two,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.one,
  },
  // The chip row (photo-536 order). Transparent by explicit value — a bare
  // ThemedView paints the theme `background`, a white-on-tint box inside
  // the cream card that the one-fill rule forbids.
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    backgroundColor: 'transparent',
    gap: Spacing.one,
  },
  // The restored row chip (p8's categoryChip): the pair's tinted fill
  // (stateBadge carries no leading icon, so it shares the anatomy via the
  // same paddings) with the mockup's small leading gap for the icon.
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    borderRadius: Radius.chip,
  },
  stateSummary: {
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
    flexGrow: 0,
    flexShrink: 0,
  },
  // Reserved right-hand action column (LC5): fixed 44pt regardless of
  // selection state, so the row's right edge never shifts. Transparent
  // (not `ThemedView`'s default `background` fill, which is white/black —
  // that painted a mismatched box against the row's own `backgroundElement`
  // grey, visible in 06-stems-light.png before this fix).
  rowAction: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  editButton: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    flexGrow: 0,
    flexShrink: 0,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { AndroidMinTouchTarget, FilterChip } from '@/components/filter-chip';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, MinTouchTarget, Palette, Radius, Spacing, type CategoryName, type PaletteName } from '@/constants/theme';
import { getRepository, LibraryStemRow } from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import {
  canDeactivateStems,
  groupForDefaultView,
  matchesStemFilters,
  orderForFlatView,
  type ActiveFilter,
  type LibraryGroupKey,
  type TimeOfDayFilter,
} from '@/session/stemLibraryFilter';
import { readMorningPracticeQueue, readProgrammeWeek } from '@/session/programRead';
import { PROGRAMME_WEEK_CAP } from '@/session/program';

function isCategoryName(c: string | null): c is CategoryName {
  return c !== null && c in CategoryColors;
}

// A distinct glyph per category (2026-09-11, ui-audit-2026-09-11.md cycle 2)
// alongside `CategoryColors`' hue, so category is legible without relying on
// color alone (colorblind users). Decorative: the chip's text label is the
// accessible name, this is a redundant visual cue, not the only one.
const CATEGORY_ICON: Record<CategoryName, keyof typeof Ionicons.glyphMap> = {
  awareness: 'eye-outline',
  self_acceptance: 'heart-outline',
  responsibility: 'shield-checkmark-outline',
  assertiveness: 'megaphone-outline',
  purpose: 'compass-outline',
  integrity: 'ribbon-outline',
};

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
// origin carry a Palette hue the way the category chips already do. Neutral
// options (All, Mine, Imported, Unset, the State row) stay uncolored: the
// hue marks the dimension, not every choice.
// Issue 08: the same mapping now also colors the per-stem chips on the
// library rows, so a tag and its filter can never drift apart.
const TIME_OF_DAY_HUES: Record<'morning' | 'evening', PaletteName> = {
  morning: 'amber',
  evening: 'indigo',
};
const PROGRAMME_ORIGIN_HUE: PaletteName = 'jade';

// The library's default view is the practice itself (w2-t4, design §4):
// the Morning practice (your picks, plus the programme week block while
// Programme is on) before the Evening practice (the reflection, then your
// evening picks, starters included). Grouping is a VIEW over the rows the
// filters already selected — `matchesStemFilters` stays the only state
// gate, and any non-default filter or query flattens the list to one
// stable, learnable order (s2-1) for browsing the full pool.
//
// Provenance is identity (D2): per-row chips display origin — programme
// rows read jade "Programme", weekless seed rows are the "Starter set"
// (D7's relabel; s1-F10's week-on-row dies at the root: the week lives
// once, in the group header and the weeks browser). Under the engine,
// deactivating a programme row is the user's own choice that no automation
// reverses, so the w1-t6 temporary-deactivation note retires everywhere
// (its caption, its a11y appends, and the interim bulk copy) — the D5
// at-least-one guard is untouched (contract 1).

// The practice card's copy (§4.2): one composition, two views. Counts are
// read-time display values (§13.7: nothing stored), derived from the
// engine's composed morning queue and the stems list.
const EMPTY_MORNING_LINE = 'No picks yet. Activate stems below or add your own.';

// The filters bottom sheet (s5 #4: the inline panel's State buttons were
// clipped unreachable at the screen bottom on small screens). The sheet is
// the app's own WeekPicker Modal pattern; the week filter lives in it too.
const SHEET_MAX_HEIGHT = '70%';

type ListEntry =
  | { kind: 'header'; key: string; header: 'morning' | 'evening' | 'reflection' | 'evening-picks' }
  | { kind: 'header'; key: string; header: 'programme'; week: number }
  | { kind: 'note'; key: string; text: string }
  | { kind: 'stem'; key: string; stem: LibraryStemRow };

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
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [timeOfDayFilter, setTimeOfDayFilter] = useState<TimeOfDayFilter>('all');
  // Issue 03: view one programme week's stems ('all' = every stem).
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('all');
  // w2-t4 (s5 #4): the filters live in a bottom sheet, not an inline panel.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The practice card (§4.2): collapsed by default — a summary, not a page.
  const [practiceExpanded, setPracticeExpanded] = useState(false);
  // §4.2: the card is the list scroll's HEADER (design §4: "one scroll with
  // a stable order" — the card scrolls away and the list takes the screen).
  // The card link scrolls past it; its height is measured, not assumed.
  const listRef = useRef<FlatList<ListEntry>>(null);
  const cardHeightRef = useRef(0);

  // s2-12 (w2-t4): the category chips derive from the stems that match all
  // OTHER active filters (this stem's own category excluded), so a chip can
  // never AND the list to empty, and a category whose only visible rows are
  // gone offers no chip.
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          stems
            .filter((s) =>
              matchesStemFilters(s, { query, activeFilter, originFilter, categoryFilter: 'all', timeOfDayFilter, weekFilter }),
            )
            .map((s) => s.category)
            .filter((c): c is string => c !== null),
        ),
      ).sort(),
    [stems, query, activeFilter, originFilter, timeOfDayFilter, weekFilter],
  );

  const filtered = useMemo(
    () =>
      stems.filter((s) =>
        matchesStemFilters(s, { query, activeFilter, originFilter, categoryFilter, timeOfDayFilter, weekFilter }),
      ),
    [stems, query, activeFilter, originFilter, categoryFilter, timeOfDayFilter, weekFilter],
  );

  // Issue 03's at-a-glance state counts (§13.7: computed at read time,
  // nothing stored). Deleted stems are neither active nor disabled — they
  // are out of the pool entirely and render with their own 'deleted'
  // marker. The counts live in the sheet's header now (s2-6's "the filter
  // state is always visible" owns the always-visible line above the list).
  const { activeCount, disabledCount } = useMemo(
    () => ({
      activeCount: stems.filter((s) => s.active && s.deleted_at === null).length,
      disabledCount: stems.filter((s) => !s.active && s.deleted_at === null).length,
    }),
    [stems],
  );

  // The practice composition (w2-t4): the card and the grouped default view
  // both derive from ONE engine read (§4.2's "one composition, two views").
  // `readMorningPracticeQueue` gives the morning queue (picks, then the
  // programme week block while Programme is on — D3: while off, programme
  // state is never read); the effective week comes from the engine's
  // `readProgrammeWeek`. Derived on `stems`' identity: every focus and
  // every write refreshes the card for free.
  const practice = useMemo(() => {
    const repo = getRepository();
    const programmeOn = repo.getSettings().programme;
    const effectiveWeek = programmeOn ? readProgrammeWeek(repo).currentWeek : null;
    // The queue rows are engine `StemRow`s; join them back to the library
    // rows this screen already holds (one DB, one id space) so the card's
    // rows render with the same anatomy as the list's.
    const byId = new Map(stems.map((s) => [s.id, s]));
    const queue = readMorningPracticeQueue(repo).flatMap((q) => {
      const row = byId.get(q.id);
      return row ? [row] : [];
    });
    return { programmeOn, effectiveWeek, queue };
  }, [stems]);
  const { programmeOn, effectiveWeek, queue: practiceQueue } = practice;

  // The card's collapsed lines (§4.2). Morning: picks + the week block,
  // partitioned by origin (the queue is `picks first, block second` by D1's
  // own composition — the count split needs no second read). Evening: the
  // reread + the reflection stem, then the evening picks (active evening-
  // tagged picks and starters; seed programme rows belong to their week
  // block, not to the picks).
  const morningPickCount = practiceQueue.filter((s) => s.origin === 'user' || s.origin === 'imported').length;
  const morningBlockCount = practiceQueue.length - morningPickCount;
  const eveningPickCount = stems.filter(
    (s) => s.active && s.deleted_at === null && s.time_of_day === 'evening' && s.origin !== 'meta' && !(s.origin === 'seed' && s.weekNumber !== null),
  ).length;
  const morningLine = programmeOn
    ? `Morning · ${practiceQueue.length} ${practiceQueue.length === 1 ? 'stem' : 'stems'}: ${morningPickCount} ${
        morningPickCount === 1 ? 'pick' : 'picks'
      } + Programme Week ${effectiveWeek} (${morningBlockCount})`
    : `Morning · ${morningPickCount} ${morningPickCount === 1 ? 'pick' : 'picks'}`;
  const eveningLine =
    eveningPickCount > 0
      ? `Evening · reread + reflection + ${eveningPickCount} ${eveningPickCount === 1 ? 'pick' : 'picks'}`
      : 'Evening · reread + reflection';

  // s2-6: the filter state is always visible — the count line above the
  // list, the Filters button carrying the non-default count, and the sheet
  // repeating the live count.
  const isDefaultView =
    query === '' &&
    activeFilter === 'active' &&
    originFilter === 'all' &&
    categoryFilter === 'all' &&
    timeOfDayFilter === 'all' &&
    weekFilter === 'all';
  const filtersActiveCount = useMemo(
    () =>
      [
        query !== '',
        activeFilter !== 'active',
        originFilter !== 'all',
        categoryFilter !== 'all',
        timeOfDayFilter !== 'all',
        weekFilter !== 'all',
      ].filter(Boolean).length,
    [query, activeFilter, originFilter, categoryFilter, timeOfDayFilter, weekFilter],
  );

  // The list data (§4.4): the default view groups the practice; any other
  // filter or query flattens to one stable order. Grouping never drops a
  // row: rows outside every named group (e.g. programme rows of weeks other
  // than the effective one) trail, headerless.
  const listData = useMemo((): ListEntry[] => {
    if (!isDefaultView) {
      return orderForFlatView(filtered).map((s) => ({ kind: 'stem' as const, key: s.id, stem: s }));
    }
    const groups = groupForDefaultView(filtered, { programmeOn, effectiveWeek });
    const rowsOf = (key: LibraryGroupKey) => groups.find((g) => g.key === key)?.stems ?? [];
    const entries: ListEntry[] = [];
    // Morning practice — always rendered (the practice's front door), with
    // an honest empty line while no picks are active.
    const morning = rowsOf('morning-picks');
    entries.push({ kind: 'header', key: 'hdr-morning', header: 'morning' });
    if (morning.length === 0) entries.push({ kind: 'note', key: 'note-morning', text: EMPTY_MORNING_LINE });
    for (const s of morning) entries.push({ kind: 'stem', key: s.id, stem: s });
    // The programme week door (s5 #3, replaces the pilot row): while
    // Programme is on and the week is known, the group header renders even
    // when the week block is empty — the door must not vanish with the rows.
    if (programmeOn && effectiveWeek !== null) {
      entries.push({ kind: 'header', key: 'hdr-programme', header: 'programme', week: effectiveWeek });
      for (const s of rowsOf('programme-week')) entries.push({ kind: 'stem', key: s.id, stem: s });
    }
    // Evening practice — eyebrow once, the reflection sub-section (when its
    // rows exist), then the evening picks.
    const reflection = rowsOf('evening-reflection');
    const picks = rowsOf('evening-picks');
    if (reflection.length > 0 || picks.length > 0) {
      entries.push({ kind: 'header', key: 'hdr-evening', header: 'evening' });
    }
    if (reflection.length > 0) {
      entries.push({ kind: 'header', key: 'hdr-reflection', header: 'reflection' });
      for (const s of reflection) entries.push({ kind: 'stem', key: s.id, stem: s });
    }
    if (picks.length > 0) {
      entries.push({ kind: 'header', key: 'hdr-evening-picks', header: 'evening-picks' });
      for (const s of picks) entries.push({ kind: 'stem', key: s.id, stem: s });
    }
    for (const s of rowsOf('other')) entries.push({ kind: 'stem', key: s.id, stem: s });
    return entries;
  }, [isDefaultView, filtered, programmeOn, effectiveWeek]);

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

  // C4's marked exit (w2-t4): the card's "Pick more stems" clears every
  // filter — the query included (w1-t7c: the query is a filter) — collapses
  // the card, and scrolls past the card to the browsable list (design §4.2:
  // "clears filters, scrolls to the list").
  const clearAllFilters = useCallback(() => {
    setQuery('');
    setActiveFilter('active');
    setOriginFilter('all');
    setCategoryFilter('all');
    setTimeOfDayFilter('all');
    setWeekFilter('all');
    setPracticeExpanded(false);
  }, []);
  const pickMoreStems = useCallback(() => {
    clearAllFilters();
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: cardHeightRef.current, animated: true });
    });
  }, [clearAllFilters]);

  const renderEntry = useCallback(
    ({ item }: { item: ListEntry }) => {
      switch (item.kind) {
        case 'header':
          return <GroupHeader header={item.header} week={'week' in item ? item.week : null} theme={theme} router={router} />;
        case 'note':
          return (
            <ThemedText type="small" themeColor="textSecondary" style={styles.groupEmpty}>
              {item.text}
            </ThemedText>
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
    [theme, router, selectionMode, selectedIds, onRowPress, toggleSelected],
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
            one number the library's headline owes the user. */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.stateSummary}>
          {`Showing ${filtered.length} of ${stems.length}`}
        </ThemedText>

        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScrollContainer}
            contentContainerStyle={styles.categoryScroll}
          >
            <FilterChip label="All" selected={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
            {categories.map((c) => (
              <FilterChip
                key={c}
                label={c}
                selected={categoryFilter === c}
                onPress={() => setCategoryFilter(c)}
                category={isCategoryName(c) ? c : undefined}
              />
            ))}
          </ScrollView>
        )}

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

        {/* The practice card is the list scroll's HEADER (design §4: "one
            scroll with a stable order" — the card is the screen's opening
            view and scrolls away; the list takes the screen for browsing.
            Fixed above the scroll stay only the controls the user needs
            while browsing: search, the always-visible Showing line (s2-6),
            and the category strip. */}
        <FlatList<ListEntry>
          ref={listRef}
          data={listData}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState message="No stems match." />}
          ListHeaderComponent={
            <ThemedView
              style={[styles.practiceCard, { backgroundColor: theme.backgroundElement }]}
              onLayout={(e) => {
                cardHeightRef.current = e.nativeEvent.layout.height;
              }}
            >
              <Pressable
                onPress={() => setPracticeExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Practice summary"
                accessibilityState={{ expanded: practiceExpanded }}
                style={styles.practiceCardHeader}
              >
                <View style={styles.practiceCardTitles}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.groupEyebrow}>
                    In practice
                  </ThemedText>
                  <ThemedText type="default">{morningLine}</ThemedText>
                  <ThemedText type="default" themeColor="textSecondary">
                    {eveningLine}
                  </ThemedText>
                </View>
                <Ionicons
                  name={practiceExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={18}
                  color={theme.textSecondary}
                />
              </Pressable>
              {practiceExpanded && (
                <View style={styles.practiceCardBody}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Morning
                  </ThemedText>
                  {practiceQueue.map((stem) => (
                    <StemRow
                      key={stem.id}
                      item={stem}
                      theme={theme}
                      router={router}
                      editable={false}
                      selectable={false}
                      onPress={writeNow}
                      onLongPress={toggleSelected}
                    />
                  ))}
                  <ThemedText type="small" themeColor="textSecondary">
                    Evening
                  </ThemedText>
                  {stems
                    .filter((s) => s.origin === 'meta' && s.time_of_day === 'evening' && s.deleted_at === null)
                    .map((stem) => (
                      <StemRow
                        key={stem.id}
                        item={stem}
                        theme={theme}
                        router={router}
                        editable={false}
                        selectable={false}
                        onPress={writeNow}
                        onLongPress={toggleSelected}
                      />
                    ))}
                  {stems
                    .filter(
                      (s) =>
                        s.active &&
                        s.deleted_at === null &&
                        s.time_of_day === 'evening' &&
                        s.origin !== 'meta' &&
                        !(s.origin === 'seed' && s.weekNumber !== null),
                    )
                    .map((stem) => (
                      <StemRow
                        key={stem.id}
                        item={stem}
                        theme={theme}
                        router={router}
                        editable={false}
                        selectable={false}
                        onPress={writeNow}
                        onLongPress={toggleSelected}
                      />
                    ))}
                  <View style={styles.practiceCardLinks}>
                    <Button
                      label="Pick more stems"
                      onPress={pickMoreStems}
                      variant="text"
                      style={styles.practiceCardLinkButton}
                    />
                    {programmeOn && effectiveWeek !== null && (
                      <Pressable
                        onPress={() => router.push('/week')}
                        accessibilityRole="button"
                        accessibilityLabel={`Week ${effectiveWeek}. Opens the programme weeks.`}
                        style={styles.practiceWeekLink}
                      >
                        <ThemedText type="default">{`Week ${effectiveWeek}`}</ThemedText>
                        <Ionicons name="chevron-forward-outline" size={16} color={theme.textSecondary} />
                      </Pressable>
                    )}
                  </View>
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
            repeats the live counts so the sheet's changes read against the
            numbers they move. */}
        <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
          <Pressable style={styles.sheetScrim} onPress={() => setFiltersOpen(false)} accessibilityLabel="Close filters">
            <View
              style={[styles.filterSheet, { backgroundColor: theme.backgroundElement }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderTitles}>
                  <ThemedText type="default">{`Showing ${filtered.length} of ${stems.length}`}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`${activeCount} active · ${disabledCount} disabled`}
                  </ThemedText>
                </View>
                <View style={styles.sheetHeaderButtons}>
                  <Button label="Clear filters" onPress={clearAllFilters} variant="text" style={styles.sheetClearButton} />
                  <Button label="Done" onPress={() => setFiltersOpen(false)} variant="secondary" style={styles.sheetDoneButton} />
                </View>
              </View>
              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
                <WeekPicker value={weekFilter} onChange={setWeekFilter} />

                <FilterRow
                  label="State"
                  options={[
                    { value: 'active', label: 'Active' },
                    // Display-only rename (v13-feedback issue 07, owner feedback
                    // "instead of restive use disabled"): the filter VALUE stays
                    // 'archived' in storage, exports, and the filter module.
                    { value: 'archived', label: 'Disabled' },
                    { value: 'all', label: 'All' },
                  ]}
                  value={activeFilter}
                  onChange={(v) => setActiveFilter(v as ActiveFilter)}
                />

                <FilterRow
                  label="Origin"
                  options={[
                    { value: 'all', label: 'All' },
                    // Display-only rename (issue 03): origin value stays 'seed'
                    // in DB, exports, and tests.
                    { value: 'seed', label: 'Programme', hue: PROGRAMME_ORIGIN_HUE },
                    { value: 'user', label: 'Mine' },
                    { value: 'imported', label: 'Imported' },
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
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

// Calm active/inactive edge accent (§10: tint, not traffic-light
// saturation) — a left border only, body text color is untouched so
// readability never depends on this contrast (it's decorative, not text).
const ACTIVE_EDGE = { light: '#8FBF93', dark: '#4A7A4E' };
const INACTIVE_EDGE = { light: '#D9A3A0', dark: '#7A4A48' };

// Issue 03: a state badge on every row, so active/resting is readable as
// TEXT at all times, never only through the edge tint (which stays as the
// calm per-row accent). Same hue families as the edges, one step darker
// for the label (§10: tint, not traffic-light saturation).
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
  // v13-feedback issue 07 (c06 carry-forward): the library now lists the two
  // evening reflection meta-stems (origin 'meta'), so the row names them:
  // the meta line's bare 'meta' is developer vocabulary. The tag carries the
  // identity; the caption below the meta line carries the honesty: the
  // reflection alternation reads these rows regardless of their state
  // (listMetaStems has no active filter), so activating one is never the
  // only path. Its state only ever gates the generic active-stem reads.
  const isMeta = item.origin === 'meta';
  const reflectionPair = isMeta ? Palette.rose[dark ? 'dark' : 'light'] : null;
  const edgeColor = isDeleted ? 'transparent' : (item.active ? ACTIVE_EDGE : INACTIVE_EDGE)[dark ? 'dark' : 'light'];
  const categoryColors = isCategoryName(item.category) ? CategoryColors[item.category][dark ? 'dark' : 'light'] : null;
  const stateBadge = isDeleted ? null : (item.active ? STATE_BADGE.active : STATE_BADGE.resting)[dark ? 'dark' : 'light'];

  // Issue 08: the per-stem time-of-day and programme-origin tags render as
  // colored chips in the same anatomy as the filter row's chips (issue 07's
  // hue mechanism, resolved from the same TIME_OF_DAY_HUES mapping the
  // Time-of-day filter chips read, so the row tag and its filter can never
  // drift apart). w2-t4 (§4.5 + owner revision): the per-row identity chip
  // drops the week number — the week lives once, in the group header and
  // the weeks browser, so a row can never fight its own week label.
  // Weekless seed rows are the Starter set (D7's relabel; s1-F10 dies at
  // the root). user/imported origins stay uncolored text, as in the filter
  // row (the hue marks the dimension, not every choice). Identity, not
  // state — the chips show on soft-deleted rows too, which stay dimmed.
  const timeOfDayChip = item.time_of_day
    ? {
        ...Palette[TIME_OF_DAY_HUES[item.time_of_day]][dark ? 'dark' : 'light'],
        label: item.time_of_day === 'morning' ? 'Morning' : 'Evening',
      }
    : null;
  const programmeChip =
    item.origin === 'seed'
      ? {
          ...Palette[PROGRAMME_ORIGIN_HUE][dark ? 'dark' : 'light'],
          label: item.weekNumber === null ? 'Starter set' : 'Programme',
        }
      : null;

  // Issue 03: the state is named in the accessible label too, so it never
  // depends on seeing the badge or the edge tint.
  const label = isDeleted
    ? item.text
    : selectionMode
      ? `${item.text}. ${item.active ? 'Active' : 'Disabled'}.${
          isMeta ? ' Part of the evening reflection, whether Active or Disabled.' : ''
        } ${selected ? 'Selected' : 'Not selected'}.`
      : `Write on: ${item.text}. ${item.active ? 'Active' : 'Disabled'}.${
          isMeta ? ' Part of the evening reflection, whether Active or Disabled.' : ''
        }${selectable ? ' Long-press to select.' : ''}`;

  return (
    <ThemedView
      style={[
        styles.row,
        {
          backgroundColor: selected ? theme.accentMuted : theme.backgroundElement,
          opacity: isDeleted ? 0.5 : 1,
          borderLeftColor: edgeColor,
        },
      ]}
    >
      <Pressable
        onPress={() => onPress(item)}
        onLongPress={selectable ? () => onLongPress(item) : undefined}
        disabled={isDeleted}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDeleted, selected }}
        style={styles.rowMain}
      >
        <ThemedText type="stem">{item.text}</ThemedText>
        <ThemedView style={styles.rowMeta}>
          {/* Issue 04: programme stems carry their §5.2 category (week→pillar
              mapping), so this chip now lights up for them too. */}
          {stateBadge && (
            <ThemedView style={[styles.stateBadge, { backgroundColor: stateBadge.bg }]}>
              <ThemedText type="small" style={{ color: stateBadge.text }}>
                {item.active ? 'Active' : 'Disabled'}
              </ThemedText>
            </ThemedView>
          )}
          {timeOfDayChip && (
            <ThemedView style={[styles.categoryChip, { backgroundColor: timeOfDayChip.bg }]}>
              <ThemedText type="small" style={{ color: timeOfDayChip.text }}>
                {timeOfDayChip.label}
              </ThemedText>
            </ThemedView>
          )}
          {reflectionPair && (
            <ThemedView style={[styles.categoryChip, { backgroundColor: reflectionPair.bg }]}>
              <ThemedText type="small" style={{ color: reflectionPair.text }}>
                Reflection
              </ThemedText>
            </ThemedView>
          )}
          {categoryColors && isCategoryName(item.category) && (
            <ThemedView style={[styles.categoryChip, { backgroundColor: categoryColors.bg }]}>
              <Ionicons name={CATEGORY_ICON[item.category]} size={12} color={categoryColors.text} />
              <ThemedText type="small" style={{ color: categoryColors.text }}>
                {item.category}
              </ThemedText>
            </ThemedView>
          )}
          {programmeChip && (
            <ThemedView style={[styles.categoryChip, { backgroundColor: programmeChip.bg }]}>
              <ThemedText type="small" style={{ color: programmeChip.text }}>
                {programmeChip.label}
              </ThemedText>
            </ThemedView>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {[
              categoryColors ? null : item.category, // shown as a colored chip instead, when we have one
              // time_of_day and origin 'seed' render as the colored chips
              // above (issue 08); 'meta' is never shown as copy: the
              // Reflection tag above names the row (issue 07).
              item.origin === 'user' ? 'Mine' : item.origin === 'imported' ? 'Imported' : null, // display-only renames (issue 03)
              isDeleted ? 'deleted' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
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

// The grouped default view's section headers (§4.4). The 'programme' header
// is the week door (s5 #3): the pilot rows' navigation lives here now.
function GroupHeader({
  header,
  week,
  theme,
  router,
}: {
  header: 'morning' | 'programme' | 'evening' | 'reflection' | 'evening-picks';
  week: number | null;
  theme: Theme;
  router: Router;
}) {
  switch (header) {
    case 'morning':
      return (
        <View style={styles.groupHeader}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.groupEyebrow}>
            Morning
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your picks, plus the programme’s current week while Programme is on.
          </ThemedText>
          <ThemedText type="default" style={styles.groupTitle}>
            Your picks
          </ThemedText>
        </View>
      );
    case 'programme':
      return (
        <Pressable
          onPress={() => router.push('/week')}
          accessibilityRole="button"
          accessibilityLabel={`Programme Week ${week}. Opens the programme weeks.`}
          style={[styles.groupWeekLink, { backgroundColor: theme.backgroundElement }]}
        >
          <ThemedText type="default">{`Programme · Week ${week}`}</ThemedText>
          <Ionicons name="chevron-forward-outline" size={18} color={theme.textSecondary} />
        </Pressable>
      );
    case 'evening':
      return (
        <View style={styles.groupHeader}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.groupEyebrow}>
            Evening
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Rereads today’s endings, then the reflection stem, then your evening picks.
          </ThemedText>
        </View>
      );
    case 'reflection':
      return (
        <ThemedText type="default" style={styles.groupTitle}>
          Reflection
        </ThemedText>
      );
    case 'evening-picks':
      return (
        <ThemedText type="default" style={styles.groupTitle}>
          Your picks
        </ThemedText>
      );
  }
}

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; hue?: PaletteName }[];
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
  practiceCard: {
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  practiceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MinTouchTarget,
    gap: Spacing.two,
  },
  practiceCardTitles: {
    flex: 1,
    gap: Spacing.half,
    backgroundColor: 'transparent',
  },
  practiceCardBody: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  practiceCardLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  practiceCardLinkButton: {
    minHeight: MinTouchTarget,
  },
  practiceWeekLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.two,
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
  // Fixed `height` (not `minHeight`): an unbounded horizontal ScrollView
  // beside a flex:1 FlatList sibling collapses to zero height (2026-09-11
  // regression, commit 375f6b3). s6's measured clip is fixed in this
  // rebuild (w2-t4's chrome diet): the height now matches FilterChip's own
  // floor — the chip strip is 48pt tall and its chips no longer clip.
  // `marginHorizontal: Spacing.four` (t11, cluster 7 remainder): the strip
  // is a full-width ScrollView, so its chips painted flush to the screen
  // border (packet-2 p2n-25 + t6 FLAG 18:04: non-bg pixels in the last-6-px
  // edge column of the chip band at 320dp) instead of respecting the screen
  // margin every other block on this screen uses. Insetting the strip clips
  // scrolling chips at the padded content column; the scroll content itself
  // carries no horizontal padding, so the first chip stays aligned with the
  // Search input above it (24 from the screen edge) and chips at rest are
  // unmoved.
  categoryScrollContainer: {
    height: AndroidMinTouchTarget,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    flexGrow: 0,
    flexShrink: 0,
  },
  categoryScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
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
    maxHeight: SHEET_MAX_HEIGHT,
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
    flexGrow: 0,
  },
  sheetScrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    minHeight: MinTouchTarget,
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
  listContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  groupHeader: {
    gap: Spacing.half,
    marginTop: Spacing.one,
  },
  groupEyebrow: {
    textTransform: 'uppercase',
  },
  groupTitle: {
    marginTop: Spacing.half,
  },
  // The programme group header IS the week door (s5 #3): same list-row
  // anatomy as the stems below, one quiet chevron — the pilot rows'
  // destination without the chrome.
  groupWeekLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MinTouchTarget,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  groupEmpty: {
    marginTop: Spacing.half,
  },
  // Same shape as `Card` (backgroundElement fill, `Spacing.three` padding)
  // plus the active/inactive edge tint `Card` has no slot for, so this stays
  // a hand-styled `ThemedView` rather than wrapping `Card` (ui-audit-2026-
  // 09-11.md cycle 2 done-criteria: bespoke is fine when a shared component
  // doesn't fit, don't force it).
  // `alignItems: 'flex-start'` (not 'center'): T2's measured wobble was the
  // stem-text first line centering against the row's full height, which
  // varies 48–98pt with 1-line vs 2-line meta — top-anchoring keeps the
  // first line's y constant regardless of how the meta line wraps.
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderLeftWidth: 3,
    gap: Spacing.two,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.half,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    borderRadius: Radius.chip,
  },
  // Same chip anatomy as `categoryChip`, state-tinted via the caller
  // (STATE_BADGE), so the two read as one family.
  stateBadge: {
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

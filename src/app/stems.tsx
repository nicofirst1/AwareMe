import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, MinTouchTarget, Radius, Spacing, type CategoryName } from '@/constants/theme';
import { getRepository, LibraryStemRow } from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { canDeactivateStems, matchesStemFilters, type ActiveFilter, type TimeOfDayFilter } from '@/session/stemLibraryFilter';
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

/**
 * The stem library (§6.6): every stem, filterable and searchable, with a
 * "write on this now" entry point that bypasses weighted selection
 * (`origin='manual'`, Q2 in DECISIONS.md), plus authoring (ticket 08): add,
 * edit, archive, delete, reweight (all on `/stem-edit`), and bulk import
 * (`/stem-import`).
 */
export default function StemsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [stems, setStems] = useState<LibraryStemRow[]>([]);

  // Re-reads on every focus, not just mount, so returning from add/edit/
  // import (which write via the repository, not local state) shows the result.
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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(stems.map((s) => s.category).filter((c): c is string => c !== null))).sort(),
    [stems],
  );

  const filtered = useMemo(
    () =>
      stems.filter((s) =>
        matchesStemFilters(s, { query, activeFilter, originFilter, categoryFilter, timeOfDayFilter, weekFilter }),
      ),
    [stems, query, activeFilter, originFilter, categoryFilter, timeOfDayFilter, weekFilter],
  );

  // Issue 03: the at-a-glance state counts, always visible above the list
  // (§13.7: computed at read time, nothing stored). Deleted stems are
  // neither active nor resting — they are out of the pool entirely and
  // render with their own 'deleted' marker.
  const { activeCount, restingCount } = useMemo(
    () => ({
      activeCount: stems.filter((s) => s.active && s.deleted_at === null).length,
      restingCount: stems.filter((s) => !s.active && s.deleted_at === null).length,
    }),
    [stems],
  );

  // Selection mode (2026-09-11, replaces long-press-instant-toggle — see
  // DECISIONS.md): long-press enters it and selects that row; while active,
  // tap toggles membership instead of opening write/edit.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const selectionMode = selectedIds.size > 0;
  const [bulkNotice, setBulkNotice] = useState(false);

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
      const ids = Array.from(selectedIds);
      if (!active && !canDeactivateStems(ids, stems)) {
        setBulkNotice(true);
        return;
      }
      const repo = getRepository();
      for (const id of ids) repo.setStemActive(id, active);
      setStems(repo.listAllStems());
      cancelSelection();
    },
    [selectedIds, stems, cancelSelection],
  );

  const renderStemRow = useCallback(
    ({ item }: { item: LibraryStemRow }) => (
      <StemRow
        item={item}
        theme={theme}
        router={router}
        selectionMode={selectionMode}
        selected={selectedIds.has(item.id)}
        onPress={onRowPress}
        onLongPress={toggleSelected}
      />
    ),
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

        {/*
          The official programme's entry point (issue 02, §6.6/ADR-0005): the
          30 week blocks live on their own screen with the week grouping, the
          one-off sitting action, and "make this my week". A quiet list-row
          sibling above the search/filter block — the library's flat list
          (all stems, filterable) is unchanged below it.
        */}
        <Pressable
          onPress={() => router.push('/week')}
          accessibilityRole="button"
          accessibilityLabel="Official programme. Thirty weeks of guided sittings."
          style={[styles.programmeRow, { backgroundColor: theme.backgroundElement }]}
        >
          <View style={styles.programmeText}>
            <ThemedText type="default">Official programme</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Thirty weeks of guided sittings
            </ThemedText>
          </View>
          <Ionicons name="chevron-forward-outline" size={18} color={theme.textSecondary} />
        </Pressable>

        <ThemedView style={styles.controlsRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={theme.textSecondary}
            style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            accessibilityLabel="Search stems"
          />
          <Pressable
            onPress={() => setMoreFiltersOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="More filters"
            accessibilityState={{ expanded: moreFiltersOpen }}
            style={[styles.moreFiltersButton, { backgroundColor: theme.backgroundElement }]}
          >
            <Ionicons name="options-outline" size={20} color={theme.text} />
          </Pressable>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary" style={styles.stateSummary}>
          {`${activeCount} active · ${restingCount} resting`}
        </ThemedText>

        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
            style={styles.categoryScrollContainer}
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

        {moreFiltersOpen && (
          <ThemedView style={styles.moreFilters}>
            <WeekFilterRow value={weekFilter} onChange={setWeekFilter} />

            <FilterRow
              label="State"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'archived', label: 'Resting' },
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
                { value: 'seed', label: 'Programme' },
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
                { value: 'morning', label: 'Morning' },
                { value: 'evening', label: 'Evening' },
                { value: 'none', label: 'Unset' },
              ]}
              value={timeOfDayFilter}
              onChange={(v) => setTimeOfDayFilter(v as TimeOfDayFilter)}
            />
          </ThemedView>
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

        <FlatList<LibraryStemRow>
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState message="No stems match." />}
          renderItem={renderStemRow}
          style={styles.list}
        />
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
  selectionMode,
  selected,
  onPress,
  onLongPress,
}: {
  item: LibraryStemRow;
  theme: Theme;
  router: Router;
  selectionMode: boolean;
  selected: boolean;
  onPress: (stem: LibraryStemRow) => void;
  onLongPress: (stem: LibraryStemRow) => void;
}) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const isDeleted = item.deleted_at !== null;
  const edgeColor = isDeleted ? 'transparent' : (item.active ? ACTIVE_EDGE : INACTIVE_EDGE)[dark ? 'dark' : 'light'];
  const categoryColors = isCategoryName(item.category) ? CategoryColors[item.category][dark ? 'dark' : 'light'] : null;
  const stateBadge = isDeleted ? null : (item.active ? STATE_BADGE.active : STATE_BADGE.resting)[dark ? 'dark' : 'light'];

  // Issue 03: the state is named in the accessible label too, so it never
  // depends on seeing the badge or the edge tint.
  const label = isDeleted
    ? item.text
    : selectionMode
      ? `${item.text}. ${selected ? 'Selected' : 'Not selected'}.`
      : `Write on: ${item.text}. ${item.active ? 'Active' : 'Resting'}. Long-press to select.`;

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
        onLongPress={() => onLongPress(item)}
        disabled={isDeleted}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDeleted, selected }}
        style={styles.rowMain}
      >
        <ThemedText type="stem">{item.text}</ThemedText>
        <ThemedView style={styles.rowMeta}>
          {/* Issue 04 forward hook: the category badge renders here once t04
              populates programme stems with categories. No category UI added
              in this cycle — the existing chip below is the slot. */}
          {stateBadge && (
            <ThemedView style={[styles.stateBadge, { backgroundColor: stateBadge.bg }]}>
              <ThemedText type="small" style={{ color: stateBadge.text }}>
                {item.active ? 'Active' : 'Resting'}
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
          <ThemedText type="small" themeColor="textSecondary">
            {[
              categoryColors ? null : item.category, // shown as a colored chip instead, when we have one
              item.time_of_day,
              item.origin === 'seed' ? 'Programme' : item.origin, // display-only rename (issue 03)
              isDeleted ? 'deleted' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
        </ThemedView>
      </Pressable>
      <ThemedView style={styles.rowAction}>
        {selectionMode ? (
          selected && <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
        ) : (
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

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
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
          <FilterChip key={opt.value} label={opt.label} selected={opt.value === value} onPress={() => onChange(opt.value)} />
        ))}
      </ThemedView>
    </ThemedView>
  );
}

// Issue 03's week filter: 'All' + weeks 1–30 as one horizontal chip row —
// thirty wrapping chips would stack ~4 rows tall inside the filter panel,
// so this row scrolls like the category row above instead. Fixed height
// per the categoryScrollContainer note (an unbounded horizontal ScrollView
// beside a flex:1 FlatList sibling collapses to zero).
function WeekFilterRow({ value, onChange }: { value: WeekFilter; onChange: (v: WeekFilter) => void }) {
  return (
    <ThemedView style={styles.filterRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.filterLabel}>
        Programme week
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekScrollContent}
        style={styles.weekScroll}
        accessibilityLabel="Filter by programme week"
      >
        <FilterChip label="All" selected={value === 'all'} onPress={() => onChange('all')} />
        {ALL_WEEKS.map((w) => (
          <FilterChip key={w} label={String(w)} selected={value === w} onPress={() => onChange(w)} />
        ))}
      </ScrollView>
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    gap: Spacing.two,
    flexGrow: 0,
    flexShrink: 0,
  },
  // The programme entry row: same list-row anatomy as the stems below
  // (backgroundElement fill, card radius) but a single-row sibling above
  // the controls, so the guided programme reads as a destination, not one
  // row among 142.
  programmeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MinTouchTarget,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  programmeText: {
    gap: Spacing.half,
    backgroundColor: 'transparent',
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
  },
  // Fixed `height` (not `minHeight`): an unbounded horizontal ScrollView
  // beside a flex:1 FlatList sibling collapses to zero height (2026-09-11
  // regression, commit 375f6b3). Height is FilterChip's own `minHeight:
  // MinTouchTarget` (44) — this row has no vertical content taller than
  // its chips, so that's the exact bound, not a guess.
  categoryScrollContainer: {
    height: MinTouchTarget,
    marginTop: Spacing.two,
    flexGrow: 0,
    flexShrink: 0,
  },
  categoryScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.one,
  },
  weekScroll: {
    height: MinTouchTarget,
    flexGrow: 0,
    flexShrink: 0,
  },
  weekScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  moreFilters: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    gap: Spacing.one,
    flexGrow: 0,
    flexShrink: 0,
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
    borderRadius: Radius.small,
  },
  // Same chip anatomy as `categoryChip`, state-tinted via the caller
  // (STATE_BADGE), so the two read as one family.
  stateBadge: {
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    borderRadius: Radius.small,
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

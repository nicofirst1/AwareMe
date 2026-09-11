import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, MinTouchTarget, Radius, Spacing, type CategoryName } from '@/constants/theme';
import { getRepository, LibraryStemRow } from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { canDeactivateStems, matchesStemFilters, type ActiveFilter } from '@/session/stemLibraryFilter';

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
type Theme = ReturnType<typeof useTheme>;
type Router = ReturnType<typeof useRouter>;

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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(stems.map((s) => s.category).filter((c): c is string => c !== null))).sort(),
    [stems],
  );

  const filtered = useMemo(
    () => stems.filter((s) => matchesStemFilters(s, { query, activeFilter, originFilter, categoryFilter })),
    [stems, query, activeFilter, originFilter, categoryFilter],
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
        <BackHeader style={styles.backHeader} />
        <ThemedView style={styles.headerRow}>
          <ThemedText type="title" style={styles.title}>
            Stems
          </ThemedText>
          <ThemedView style={styles.headerActions}>
            <Button label="Import" onPress={() => router.push('/stem-import')} variant="text" />
            <Button label="Add" onPress={() => router.push('/stem-edit')} variant="text" />
          </ThemedView>
        </ThemedView>

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
            <FilterRow
              label="State"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'archived', label: 'Archived' },
                { value: 'all', label: 'All' },
              ]}
              value={activeFilter}
              onChange={(v) => setActiveFilter(v as ActiveFilter)}
            />

            <FilterRow
              label="Origin"
              options={[
                { value: 'all', label: 'All' },
                { value: 'seed', label: 'Seed' },
                { value: 'user', label: 'Mine' },
                { value: 'imported', label: 'Imported' },
              ]}
              value={originFilter}
              onChange={(v) => setOriginFilter(v as OriginFilter)}
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
  const isDeleted = item.deleted_at !== null;
  const edgeColor = isDeleted ? 'transparent' : (item.active ? ACTIVE_EDGE : INACTIVE_EDGE)[scheme === 'dark' ? 'dark' : 'light'];
  const categoryColors = isCategoryName(item.category) ? CategoryColors[item.category][scheme === 'dark' ? 'dark' : 'light'] : null;

  const label = isDeleted
    ? item.text
    : selectionMode
      ? `${item.text}. ${selected ? 'Selected' : 'Not selected'}.`
      : `Write on: ${item.text}. Long-press to select.`;

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
        <ThemedText type="default">{item.text}</ThemedText>
        <ThemedView style={styles.rowMeta}>
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
              item.origin,
              isDeleted ? 'deleted' : !item.active ? 'archived' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
        </ThemedView>
      </Pressable>
      {selectionMode ? (
        selected && <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
      ) : (
        !isDeleted && (
          <Pressable
            onPress={() => router.push({ pathname: '/stem-edit', params: { id: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Edit: ${item.text}`}
            style={styles.editLink}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Edit
            </ThemedText>
          </Pressable>
        )
      )}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  backHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    flexGrow: 0,
    flexShrink: 0,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  title: {
    paddingTop: 0,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  editLink: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
  notice: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    flexGrow: 0,
    flexShrink: 0,
  },
});

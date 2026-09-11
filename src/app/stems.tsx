import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/filter-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, MinTouchTarget, Spacing, type CategoryName } from '@/constants/theme';
import { getRepository, LibraryStemRow } from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { canDeactivateStem, matchesStemFilters, type ActiveFilter } from '@/session/stemLibraryFilter';

function isCategoryName(c: string | null): c is CategoryName {
  return c !== null && c in CategoryColors;
}

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

  const categories = useMemo(
    () => Array.from(new Set(stems.map((s) => s.category).filter((c): c is string => c !== null))).sort(),
    [stems],
  );

  const filtered = useMemo(
    () => stems.filter((s) => matchesStemFilters(s, { query, activeFilter, originFilter, categoryFilter })),
    [stems, query, activeFilter, originFilter, categoryFilter],
  );

  const writeNow = useCallback(
    (stem: LibraryStemRow) => {
      if (stem.deleted_at) return; // deleted stems are visible for context, not writable
      router.push({ pathname: '/write', params: { stemId: stem.id } });
    },
    [router],
  );

  const [lastActiveNotice, setLastActiveNotice] = useState(false);

  // Long-press toggles `active` (§6.6). Refuses to deactivate the last
  // active stem (see canDeactivateStem) with a quiet inline message rather
  // than a dead "start now" button.
  const toggleActive = useCallback(
    (stem: LibraryStemRow) => {
      if (stem.deleted_at) return;
      if (!canDeactivateStem(stems, stem)) {
        setLastActiveNotice(true);
        return;
      }
      setLastActiveNotice(false);
      getRepository().setStemActive(stem.id, !stem.active);
      setStems(getRepository().listAllStems());
    },
    [stems],
  );

  const renderStemRow = useCallback(
    ({ item }: { item: LibraryStemRow }) => (
      <StemRow item={item} theme={theme} router={router} onWriteNow={writeNow} onToggleActive={toggleActive} />
    ),
    [theme, router, writeNow, toggleActive],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.headerRow}>
          <ThemedText type="title" style={styles.title}>
            Stems
          </ThemedText>
          <ThemedView style={styles.headerActions}>
            <Pressable onPress={() => router.push('/stem-import')} style={styles.headerAction} accessibilityRole="button">
              <ThemedText type="default">Import</ThemedText>
            </Pressable>
            <Pressable onPress={() => router.push('/stem-edit')} style={styles.headerAction} accessibilityRole="button">
              <ThemedText type="default">Add</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          accessibilityLabel="Search stems"
        />

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

        {categories.length > 0 && (
          <FilterRow
            label="Category"
            options={[{ value: 'all', label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))]}
            value={categoryFilter}
            onChange={setCategoryFilter}
            colorByCategory
          />
        )}

        {lastActiveNotice && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.notice}>
            At least one stem must stay active.
          </ThemedText>
        )}

        <FlatList<LibraryStemRow>
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText type="default" themeColor="textSecondary">
              No stems match.
            </ThemedText>
          }
          renderItem={renderStemRow}
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
  onWriteNow,
  onToggleActive,
}: {
  item: LibraryStemRow;
  theme: Theme;
  router: Router;
  onWriteNow: (stem: LibraryStemRow) => void;
  onToggleActive: (stem: LibraryStemRow) => void;
}) {
  const scheme = useColorScheme();
  const isDeleted = item.deleted_at !== null;
  const edgeColor = isDeleted ? 'transparent' : (item.active ? ACTIVE_EDGE : INACTIVE_EDGE)[scheme === 'dark' ? 'dark' : 'light'];
  const categoryColors = isCategoryName(item.category) ? CategoryColors[item.category][scheme === 'dark' ? 'dark' : 'light'] : null;

  return (
    <ThemedView
      style={[
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: isDeleted ? 0.5 : 1, borderLeftColor: edgeColor },
      ]}
    >
      <Pressable
        onPress={() => onWriteNow(item)}
        onLongPress={() => onToggleActive(item)}
        disabled={isDeleted}
        accessibilityRole="button"
        accessibilityLabel={isDeleted ? item.text : `Write on: ${item.text}. Long-press to ${item.active ? 'deactivate' : 'activate'}.`}
        accessibilityState={{ disabled: isDeleted }}
        style={styles.rowMain}
      >
        <ThemedText type="default">{item.text}</ThemedText>
        <ThemedView style={styles.rowMeta}>
          {categoryColors && (
            <ThemedView style={[styles.categoryChip, { backgroundColor: categoryColors.bg }]}>
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
      {!isDeleted && (
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
      )}
    </ThemedView>
  );
});

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
  colorByCategory,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  colorByCategory?: boolean;
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
            selected={opt.value === value}
            onPress={() => onChange(opt.value)}
            category={colorByCategory && isCategoryName(opt.value) ? opt.value : undefined}
          />
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  headerAction: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  title: {
    paddingTop: 0,
  },
  search: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  filterRow: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
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
  list: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.two,
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
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    borderRadius: Spacing.one,
  },
  editLink: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
  notice: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
});

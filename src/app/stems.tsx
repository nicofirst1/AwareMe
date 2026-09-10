import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getRepository, LibraryStemRow } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { matchesStemFilters, type ActiveFilter } from '@/session/stemLibraryFilter';

type OriginFilter = 'all' | LibraryStemRow['origin'];
type CategoryFilter = 'all' | string;

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

  const writeNow = (stem: LibraryStemRow) => {
    if (stem.deleted_at) return; // deleted stems are visible for context, not writable
    router.push({ pathname: '/write', params: { stemId: stem.id } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.headerRow}>
          <ThemedText type="title" style={styles.title}>
            Stems
          </ThemedText>
          <ThemedView style={styles.headerActions}>
            <Pressable onPress={() => router.push('/stem-import')} accessibilityRole="button">
              <ThemedText type="default">Import</ThemedText>
            </Pressable>
            <Pressable onPress={() => router.push('/stem-edit')} accessibilityRole="button">
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
          />
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
          renderItem={({ item }) => {
            const isDeleted = item.deleted_at !== null;
            return (
              <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement, opacity: isDeleted ? 0.5 : 1 }]}>
                <Pressable
                  onPress={() => writeNow(item)}
                  disabled={isDeleted}
                  accessibilityRole="button"
                  accessibilityLabel={isDeleted ? item.text : `Write on: ${item.text}`}
                  accessibilityState={{ disabled: isDeleted }}
                  style={styles.rowMain}
                >
                  <ThemedText type="default">{item.text}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[item.category, item.origin, isDeleted ? 'deleted' : !item.active ? 'archived' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
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
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

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
  const theme = useTheme();
  return (
    <ThemedView style={styles.filterRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.filterLabel}>
        {label}
      </ThemedText>
      <ThemedView style={styles.filterOptions}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[
                styles.chip,
                { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <ThemedText type="small">{opt.label}</ThemedText>
            </Pressable>
          );
        })}
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
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
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
    gap: Spacing.two,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.half,
  },
  editLink: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});

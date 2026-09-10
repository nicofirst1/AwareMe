import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { EndingSearchResult, getRepository, HistorySessionRow } from '@/db';
import { useTheme } from '@/hooks/use-theme';

type DateRangePreset = 'all' | '7d' | '30d' | '90d';

const DATE_RANGE_DAYS: Readonly<Record<Exclude<DateRangePreset, 'all'>, number>> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** `dateFrom` for a preset, as of `now` — `undefined` for 'all' (no lower bound). */
function dateFromForPreset(preset: DateRangePreset, now: Date): string | undefined {
  if (preset === 'all') return undefined;
  return new Date(now.getTime() - DATE_RANGE_DAYS[preset] * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * History (§6.7): reverse-chronological session list, filterable by stem,
 * category, and date range, plus full-text search across every ending
 * (FTS5, migration 0002). Searching replaces the filtered list with
 * matching endings — the two are mutually exclusive, not combined, since
 * search already means "everywhere" while the filters mean "narrow the
 * list"; scoping search results is `history?dateFrom=`-shaped work no
 * ticket asked for.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [sessions, setSessions] = useState<HistorySessionRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [stemOptions, setStemOptions] = useState<{ id: string; text: string }[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [stemFilter, setStemFilter] = useState<'all' | string>('all');
  const [dateRange, setDateRange] = useState<DateRangePreset>('all');

  useFocusEffect(
    useCallback(() => {
      const repo = getRepository();
      setCategories(repo.listHistoryCategories());
      setStemOptions(repo.listHistoryStems());
      setSessions(
        repo.listSessionsForHistory({
          stemId: stemFilter === 'all' ? undefined : stemFilter,
          category: categoryFilter === 'all' ? undefined : categoryFilter,
          dateFrom: dateFromForPreset(dateRange, new Date()),
        }),
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stemFilter, categoryFilter, dateRange]),
  );

  const trimmedQuery = searchQuery.trim();
  const searchResults = useMemo<EndingSearchResult[]>(
    () => (trimmedQuery ? getRepository().searchEndings(trimmedQuery) : []),
    [trimmedQuery],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          History
        </ThemedText>

        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search what you've written"
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          accessibilityLabel="Search endings"
        />

        {!trimmedQuery && (
          <>
            <FilterRow
              label="Date range"
              options={[
                { value: 'all', label: 'All time' },
                { value: '7d', label: '7 days' },
                { value: '30d', label: '30 days' },
                { value: '90d', label: '90 days' },
              ]}
              value={dateRange}
              onChange={setDateRange}
            />
            {categories.length > 0 && (
              <FilterRow
                label="Category"
                options={[{ value: 'all', label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))]}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />
            )}
            {stemOptions.length > 0 && (
              <FilterRow
                label="Stem"
                options={[
                  { value: 'all', label: 'All' },
                  ...stemOptions.map((s) => ({ value: s.id, label: truncate(s.text, 30) })),
                ]}
                value={stemFilter}
                onChange={setStemFilter}
              />
            )}
          </>
        )}

        {trimmedQuery ? (
          <FlatList<EndingSearchResult>
            data={searchResults}
            keyExtractor={(r) => r.endingId}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                No matches.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push({ pathname: '/session-detail', params: { id: item.sessionId } })}
                style={[styles.row, { backgroundColor: theme.backgroundElement }]}
                accessibilityRole="button"
                accessibilityLabel={`Open session: ${item.stemTextSnapshot}`}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  {item.stemTextSnapshot}
                </ThemedText>
                <ThemedText type="stem">{item.text}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(item.startedAt)}
                </ThemedText>
              </Pressable>
            )}
          />
        ) : (
          <FlatList<HistorySessionRow>
            data={sessions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                Nothing here yet.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push({ pathname: '/session-detail', params: { id: item.id } })}
                style={[styles.row, { backgroundColor: theme.backgroundElement }]}
                accessibilityRole="button"
                accessibilityLabel={`Open session: ${item.stem_text_snapshot}`}
              >
                <ThemedText type="stem">{item.stem_text_snapshot}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[formatDate(item.started_at), item.category].filter(Boolean).join(' · ')}
                </ThemedText>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
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
              style={[styles.chip, { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement }]}
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
  title: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
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
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.half,
  },
});

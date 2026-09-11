import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, Spacing, type CategoryName } from '@/constants/theme';
import { EndingSearchResult, getRepository, HistorySessionRow } from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

type Theme = ReturnType<typeof useTheme>;
type Scheme = ReturnType<typeof useColorScheme>;

function isCategoryName(c: string | null): c is CategoryName {
  return c !== null && c in CategoryColors;
}

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
  const scheme = useColorScheme();
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

  const openSearchResult = useCallback(
    (id: string) => router.push({ pathname: '/session-detail', params: { id } }),
    [router],
  );
  const renderSearchResultRow = useCallback(
    ({ item }: { item: EndingSearchResult }) => <SearchResultRow item={item} theme={theme} onPress={openSearchResult} />,
    [theme, openSearchResult],
  );
  const renderSessionRow = useCallback(
    ({ item }: { item: HistorySessionRow }) => <SessionRow item={item} theme={theme} scheme={scheme} onPress={openSearchResult} />,
    [theme, scheme, openSearchResult],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BackHeader style={styles.backHeader} />
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
            ListEmptyComponent={<EmptyState message="No matches." />}
            renderItem={renderSearchResultRow}
          />
        ) : (
          <FlatList<HistorySessionRow>
            data={sessions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<EmptyState message="Nothing here yet." />}
            renderItem={renderSessionRow}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const SearchResultRow = memo(function SearchResultRow({
  item,
  theme,
  onPress,
}: {
  item: EndingSearchResult;
  theme: Theme;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable onPress={() => onPress(item.sessionId)} accessibilityRole="button" accessibilityLabel={`Open session: ${item.stemTextSnapshot}`}>
      <Card style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          {item.stemTextSnapshot}
        </ThemedText>
        <ThemedText type="stem">{item.text}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(item.startedAt)}
        </ThemedText>
      </Card>
    </Pressable>
  );
});

const SessionRow = memo(function SessionRow({
  item,
  theme,
  scheme,
  onPress,
}: {
  item: HistorySessionRow;
  theme: Theme;
  scheme: Scheme;
  onPress: (id: string) => void;
}) {
  // .text (saturated), not .bg (pale) — the pale stripe measured ~1.15:1
  // against the card fill (color-audit-2026-09-11.md), effectively invisible.
  const accentColor = isCategoryName(item.category) ? CategoryColors[item.category][scheme === 'dark' ? 'dark' : 'light'].text : undefined;

  return (
    <Pressable onPress={() => onPress(item.id)} accessibilityRole="button" accessibilityLabel={`Open session: ${item.stem_text_snapshot}`}>
      {/* 4px, not Card's default 3px, only when a category stripe is actually
          drawn — the saturated stripe (D1 fix) reads as a slightly bolder
          scanning aid at this width (color-audit-2026-09-11.md). */}
      <Card style={[styles.row, accentColor !== undefined && { borderLeftWidth: 4 }]} accentColor={accentColor}>
        <ThemedText type="stem">{item.stem_text_snapshot}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[formatDate(item.started_at), item.category].filter(Boolean).join(' · ')}
        </ThemedText>
      </Card>
    </Pressable>
  );
});

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
  title: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
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
    gap: Spacing.half,
  },
});

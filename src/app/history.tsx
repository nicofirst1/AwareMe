import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, MinTouchTarget, Radius, Spacing, type CategoryName } from '@/constants/theme';
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
 *
 * Layout (layout-audit-2026-09-15, Hy1/Hy2/Hy4): the date/category/stem
 * filter rows collapse behind a "Filters" toggle — the exact pattern
 * `stems.tsx` ships for the same control band — because with a real corpus
 * the expanded wall consumed the whole viewport and left the session list
 * zero height and unreachable. Default state: search + collapsed filters,
 * list visible (LC7's one control-band anchor); `SessionRow` follows LC5
 * (stem serif primary, one dim category line, the date — the list's
 * ordering key — right-aligned in a reserved meta column).
 */
export default function HistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const scheme = useColorScheme();
  const [sessions, setSessions] = useState<HistorySessionRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [stemOptions, setStemOptions] = useState<{ id: string; text: string }[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
        <ScreenHeader title="History" />

        {/* The search + Filters control band (LC7's one anchor for this
            screen), mirroring stems.tsx's row: same search paddings, same
            icon-button pattern — Hy3's two-sizes problem is resolved here by
            using the sibling's anatomy (a shared SearchField component stays
            issue 07's job). The toggle hides while searching: search results
            and filters are mutually exclusive (above), so an expanded
            toggle would open a panel that can never show. */}
        <ThemedView style={styles.controlsRow}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search what you’ve written"
            placeholderTextColor={theme.textSecondary}
            style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            accessibilityLabel="Search endings"
          />
          {!trimmedQuery && (
            <Pressable
              onPress={() => setFiltersOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Filters"
              accessibilityState={{ expanded: filtersOpen }}
              style={[styles.filtersButton, { backgroundColor: theme.backgroundElement }]}
            >
              <Ionicons name="options-outline" size={20} color={theme.text} />
            </Pressable>
          )}
        </ThemedView>

        {/* Hy1's fix: the filter wall defaults to collapsed. With a real
            corpus the three expanded rows consumed the whole viewport and
            left the FlatList zero height — the list, not the filters, is
            the screen's content. */}
        {!trimmedQuery && filtersOpen && (
          <ThemedView style={styles.filtersPanel}>
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
                options={[{ value: 'all', label: 'All' }, ...categories.map((c) => ({ value: c, label: c, category: isCategoryName(c) ? c : undefined }))]}
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
          </ThemedView>
        )}

        {trimmedQuery ? (
          <FlatList<EndingSearchResult>
            style={styles.list}
            data={searchResults}
            keyExtractor={(r) => r.endingId}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<EmptyState message="No matches." />}
            renderItem={renderSearchResultRow}
          />
        ) : (
          <FlatList<HistorySessionRow>
            style={styles.list}
            data={sessions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.listContent}
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
        {/* LC5 list-row anatomy (layout-audit-2026-09-15, Hy2): the stem is
            the primary line, the category the one dim secondary line, and
            the date — the list's ordering key — moves out of the old
            `' · '`-joined string into a reserved, right-aligned meta
            column. `flex-start` top-anchors the first line so 1-line and
            2-line stems start at the same y (LC5). */}
        <View style={styles.rowBody}>
          <View style={styles.rowMain}>
            <ThemedText type="stem">{item.stem_text_snapshot}</ThemedText>
            {item.category && (
              <ThemedText type="small" themeColor="textSecondary">
                {item.category.replace(/_/g, ' ')}
              </ThemedText>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.rowMeta}>
            {formatRowDate(item.started_at)}
          </ThemedText>
        </View>
      </Card>
    </Pressable>
  );
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The SessionRow meta-column date (LC5): compact all-numeric day/month/year
 * — "13.09.26"-shaped, ~56–60pt wide at `small` 14 (OCR-measured) — so the reserved 72pt column
 * never wraps. Pure numerals also sidestep the locale-mixed month names the
 * full `formatDate` can produce (audit C6, triaged separately as issue 07).
 */
function formatRowDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: '2-digit', month: '2-digit', day: '2-digit' });
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
  options: { value: T; label: string; category?: CategoryName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.filterRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.filterLabel}>
        {label}
      </ThemedText>
      <View style={styles.filterOptions}>
        {options.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            selected={opt.value === value}
            onPress={() => onChange(opt.value)}
            category={opt.category}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  // Stems' control band, verbatim anatomy (component consistency — Hy1's
  // fix is "the exact pattern stems.tsx already ships"): search + the
  // Filters toggle in one row, pinned above the collapsible panel. The
  // row can't grow (flexGrow/shrink 0) so the FlatList below always keeps
  // its flex:1 share of the viewport.
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
  filtersButton: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
  },
  filtersPanel: {
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
  list: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.half,
  },
  rowBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.half,
  },
  // LC5's reserved right meta column: fixed ~72pt, right-aligned, `small` —
  // reserved even when the compact date is short, so every row's content
  // column ends at the same x.
  rowMeta: {
    width: 72,
    textAlign: 'right',
  },
});

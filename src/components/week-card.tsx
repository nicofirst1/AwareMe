import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, MinTouchTarget, Radius, Spacing, type CategoryName } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** One programme stem as the week card shows it. */
export interface WeekCardStem {
  id: string;
  text: string;
  /** §5.2 category (issue 04's week→pillar mapping); null for the rare stem without one. */
  category: string | null;
}

/**
 * One programme week (Week 1–30) in the library's programme list (§6.6, ADR-0005):
 * a collapsed summary row — week number, stem count, and the two calm
 * markers — that expands to the week's stems and its two actions: a one-off
 * practice of the whole block (`origin='manual'`, never moves the programme)
 * and "make this my week" (sets/clears `program_week_override`, §6.2/§7).
 * Markers are informational only; nothing here is an achievement (§13.4).
 *
 * Inner rows are plain `View`s — never `ThemedView` inside a tinted surface
 * (it paints a `background` rectangle over the card fill; DECISIONS.md,
 * 2026-09-15 expo-feedback round).
 */
export function WeekCard({
  weekNumber,
  stems,
  isCurrentWeek,
  isSelected,
  isLocked,
  expanded,
  onToggle,
  onSit,
  onToggleMyWeek,
}: {
  weekNumber: number;
  stems: WeekCardStem[];
  /** The effective programme week (§6.2) — where the app actually sits. */
  isCurrentWeek: boolean;
  /** `program_week_override` selects this week right now. */
  isSelected: boolean;
  /** Issue 09: week sits above the effective unlock frontier — every stem rests. Visual treatment only: the header stays tappable so the manual-enable affordance remains reachable. */
  isLocked: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSit: () => void;
  onToggleMyWeek: () => void;
}) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';

  const isCategoryName = (c: string | null): c is CategoryName => c !== null && c in CategoryColors;

  // Marker precedence: the override's selection is the more informative
  // marker (it names the §6.2 state that clears on reflection completion),
  // so a week that is both current AND selected reads "Your week".
  // A user-selected week is unlocked; suppress Locked when selected.
  const markers = [
    isSelected ? null : isLocked ? 'Locked' : null,
    isSelected ? 'Your week' : isCurrentWeek ? 'Current week' : null,
  ].filter(Boolean);
  const countLabel = stems.length === 1 ? '1 stem' : `${stems.length} stems`;
  const summaryLabel = [
    `Week ${weekNumber}, ${countLabel}.`,
    ...markers.map((marker) => `${marker}.`),
    expanded ? 'Expanded.' : 'Collapsed.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ThemedView style={[styles.card, isLocked && styles.cardLocked, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={summaryLabel}
        accessibilityState={{ expanded }}
        style={[styles.header, isLocked && styles.headerLocked]}
      >
        <View style={styles.headerText}>
          <ThemedText type="default">
            Week {weekNumber}
            {markers.length > 0 ? ` · ${markers.join(' · ')}` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {stems.length === 0 ? 'No active stems' : countLabel}
          </ThemedText>
        </View>
        <View style={styles.chevron}>
          <Ionicons
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={18}
            color={theme.textSecondary}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          {stems.map((stem) => {
            const colors = isCategoryName(stem.category) ? CategoryColors[stem.category][dark ? 'dark' : 'light'] : null;
            return (
              <View key={stem.id} style={styles.stemLine}>
                <ThemedText type="stem">{stem.text}</ThemedText>
                {/* Issue 04 (t03's forward hook): the stem's §5.2 category as a
                    muted text chip — the label itself is the non-color cue, so
                    no icon is duplicated from the library's richer chip. */}
                {colors && (
                  <View style={[styles.categoryChip, { backgroundColor: colors.bg }]}>
                    <ThemedText type="small" style={{ color: colors.text }}>
                      {stem.category}
                    </ThemedText>
                  </View>
                )}
              </View>
            );
          })}
          {stems.length > 0 ? (
            <View style={styles.actions}>
              <Button label="Write this week’s practice" onPress={onSit} variant="secondary" style={styles.actionButton} />
              <Button
                label={isSelected ? 'Clear my week selection' : 'Make this my week'}
                onPress={onToggleMyWeek}
                variant="secondary"
                style={styles.actionButton}
              />
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              The practice actions appear once this week has active stems.
            </ThemedText>
          )}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardLocked: {
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MinTouchTarget,
  },
  headerLocked: {
    opacity: 0.5,
  },
  headerText: {
    gap: Spacing.half,
  },
  stemLine: {
    gap: Spacing.half,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  chevron: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
  actionButton: {
    width: '100%',
  },
});

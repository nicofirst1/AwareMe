import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** One active programme stem as the week card shows it. */
export interface WeekCardStem {
  id: string;
  text: string;
}

/**
 * One programme week (Week 1–30) in the library's programme list (§6.6, ADR-0005):
 * a collapsed summary row — week number, stem count, and the two calm
 * markers — that expands to the week's stems and its two actions: a one-off
 * sitting of the whole block (`origin='manual'`, never moves the programme)
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
  expanded: boolean;
  onToggle: () => void;
  onSit: () => void;
  onToggleMyWeek: () => void;
}) {
  const theme = useTheme();

  // Marker precedence: the override's selection is the more informative
  // marker (it names the §6.2 state that clears on reflection completion),
  // so a week that is both current AND selected reads "Your week".
  const markers = [isSelected ? 'Your week' : isCurrentWeek ? 'Current week' : null].filter(Boolean);
  const countLabel = stems.length === 1 ? '1 stem' : `${stems.length} stems`;
  const summaryLabel = [
    `Week ${weekNumber}, ${countLabel}.`,
    ...markers.map((marker) => `${marker}.`),
    expanded ? 'Expanded.' : 'Collapsed.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ThemedView style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={summaryLabel}
        accessibilityState={{ expanded }}
        style={styles.header}
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
          {stems.map((stem) => (
            <ThemedText key={stem.id} type="stem">
              {stem.text}
            </ThemedText>
          ))}
          {stems.length > 0 ? (
            <View style={styles.actions}>
              <Button label="Write this week’s sitting" onPress={onSit} variant="secondary" style={styles.actionButton} />
              <Button
                label={isSelected ? 'Clear my week selection' : 'Make this my week'}
                onPress={onToggleMyWeek}
                variant="secondary"
                style={styles.actionButton}
              />
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              The sitting actions appear once this week has active stems.
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MinTouchTarget,
  },
  headerText: {
    gap: Spacing.half,
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

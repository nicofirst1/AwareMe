import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeekCard, type WeekCardStem } from '@/components/week-card';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getRepository, type StemRow } from '@/db';
import { PROGRAMME_WEEK_CAP } from '@/session/program';
import { readProgrammeWeek, type ProgrammeWeek } from '@/session/programRead';

/** Every active programme stem bucketed by its week, keyed 1–30. */
function groupByWeek(stems: (StemRow & { weekNumber: number })[]): Map<number, WeekCardStem[]> {
  const byWeek = new Map<number, WeekCardStem[]>();
  for (const stem of stems) {
    const list = byWeek.get(stem.weekNumber) ?? [];
    // Issue 04 forward hook: WeekCardStem is the spot a category badge
    // joins the week card's stem list once t04 populates programme-stem
    // categories — carry the field there, render in WeekCard. Nothing
    // added in this cycle (no category UI yet).
    list.push({ id: stem.id, text: stem.text });
    byWeek.set(stem.weekNumber, list);
  }
  return byWeek;
}

const ALL_WEEKS = Array.from({ length: PROGRAMME_WEEK_CAP }, (_, i) => i + 1);

/**
 * The programme page (§6.6 as amended, ADR-0005): the official Sentence
 * Completion I programme's 30 week blocks, each expandable to its stems and
 * its two actions — a one-off sitting of the whole block (`origin='manual'`,
 * never moves the programme position, §6.2) and "make this my week" (sets or
 * clears `program_week_override`, §7). The only write on this screen is that
 * override setting, exactly as §6.2 sanctions it — the derived week itself is
 * computed at read time and never stored (§13.7).
 *
 * Reached from the stem library's "Official programme" row (`/week`); the
 * library's flat list still lists every stem as before.
 */
export default function ProgrammeScreen() {
  const router = useRouter();
  const [stems, setStems] = useState<(StemRow & { weekNumber: number })[]>([]);
  const [week, setWeek] = useState<ProgrammeWeek | null>(null);
  // One expanded week at a time — the list stays a calm scan of 30 rows.
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  const refresh = useCallback(() => {
    const repo = getRepository();
    setStems(repo.listProgrammeStems());
    setWeek(readProgrammeWeek(repo));
  }, []);

  // Re-reads on every focus, so returning from a sitting (or having cleared
  // the override on a reflection's completion) shows current state.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const byWeek = useMemo(() => groupByWeek(stems), [stems]);

  const sitOnWeek = useCallback(
    (weekNumber: number) => {
      router.push({ pathname: '/write', params: { week: String(weekNumber) } });
    },
    [router],
  );

  const toggleMyWeek = useCallback(
    (weekNumber: number) => {
      const repo = getRepository();
      // §6.2/§7: the selection is the override setting — user input, not a
      // derived value. Clearing restores the derived week.
      repo.setSetting('program_week_override', week?.override === weekNumber ? null : weekNumber);
      refresh();
    },
    [refresh, week],
  );

  const renderWeek = useCallback(
    ({ item }: { item: number }) => (
      <WeekCard
        weekNumber={item}
        stems={byWeek.get(item) ?? []}
        isCurrentWeek={week?.currentWeek === item}
        isSelected={week?.override === item}
        expanded={expandedWeek === item}
        onToggle={() => setExpandedWeek((current) => (current === item ? null : item))}
        onSit={() => sitOnWeek(item)}
        onToggleMyWeek={() => toggleMyWeek(item)}
      />
    ),
    [byWeek, week, expandedWeek, sitOnWeek, toggleMyWeek],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Programme" />

        <FlatList
          data={ALL_WEEKS}
          keyExtractor={(w) => `week-${w}`}
          renderItem={renderWeek}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          // Thirty lightweight cards — render them all up front so the list
          // reads as one complete programme (windowing buys nothing at this
          // size, and the full range is part of the screen's meaning).
          initialNumToRender={PROGRAMME_WEEK_CAP}
          ListHeaderComponent={
            <View style={styles.intro}>
              <ThemedText type="small" themeColor="textSecondary">
                The official programme, thirty weeks long. Sit on any week once, or make a week yours — your
                selection clears when its reflection completes.
              </ThemedText>
              {week && week.override !== null && (
                <ThemedText type="small" themeColor="textSecondary">
                  {`Your current week is your chosen Week ${week.override}.`}
                </ThemedText>
              )}
            </View>
          }
        />
      </SafeAreaView>
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
  list: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.four,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  intro: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
});

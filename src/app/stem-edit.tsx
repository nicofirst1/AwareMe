import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FilterChip } from '@/components/filter-chip';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, Fonts, MaxContentWidth, Radius, Spacing, type CategoryName } from '@/constants/theme';
import { getRepository, type TimeOfDay } from '@/db';
import { nowEventTime } from '@/db/time';
import { useTheme } from '@/hooks/use-theme';
import { canDeactivateStems } from '@/session/stemLibraryFilter';
import { validateStemText } from '@/session/stemValidation';

// Reads the category picker off the palette itself (ui-audit-2026-09-11.md
// §2) rather than a hand-maintained list, so this can never drift out of
// sync with `CategoryColors` or the same list in stem-import.tsx.
const CATEGORIES = Object.keys(CategoryColors) as CategoryName[];

// w1-t3 (s2-3): same words as the library's bulk-Deactivate notice
// (stems.tsx, out of this cycle's file map, so the literal is duplicated
// here, not imported).
const LAST_ACTIVE_NOTICE = 'At least one stem must stay active.';

// w1-t6 rider reassigned to t3 (coordinator STEER 2026-09-23 10:20;
// s2-4, D2 interim): until wave 2's activation-provenance rule lands, a
// deactivated programme stem comes back on the next weekly reflection
// completion or 'make this my week', so the Archive action says so before
// the press. Duplicates the row-caption constant in stems.tsx verbatim
// (out of this cycle's file map); w2-t4 removes this interim note with
// the provenance engine. `weekNumber !== null` is the same per-row
// predicate stems.tsx uses — the exact scope of setProgrammeWeekActive's
// blanket UPDATE. Copy tone per §13.4: descriptive, calm, no guilt.
const PROGRAMME_REACTIVATION_NOTE =
  "Deactivating is temporary: the next weekly reflection or 'Make this my week' brings this stem back.";

// Morning/evening pivot (migration 0003): which fixed daily notification a
// stem belongs to, plus "none" (null — never surfaced by either period's
// practice, same as a pre-pivot row per docs/DECISIONS.md 2026-09-14).
const TIME_OF_DAY_OPTIONS = ['none', 'morning', 'evening'] as const;
type TimeOfDayOption = (typeof TIME_OF_DAY_OPTIONS)[number];

function toOption(t: TimeOfDay | null): TimeOfDayOption {
  return t ?? 'none';
}

function fromOption(o: TimeOfDayOption): TimeOfDay | null {
  return o === 'none' ? null : o;
}

/**
 * Add or edit a stem (§6.6). One screen for both: with `?id=`, it loads the
 * existing stem and shows archive/delete alongside the edit form;
 * without it, it's a bare add form. Editing never touches past sessions —
 * they keep `stem_text_snapshot` regardless of what happens here.
 */
export default function StemEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const repo = useMemo(() => getRepository(), []);
  const isEdit = !!id;

  // One read serves both the edited row and the guard's active count
  // (w1-t3): the guard must see every stem, not just the one on screen.
  const allStems = useMemo(() => repo.listAllStems(), [repo]);
  const existing = useMemo(() => (id ? allStems.find((s) => s.id === id) ?? null : null), [id, allStems]);
  const existingTexts = useMemo(
    () => repo.listStemTexts().filter((t) => t !== existing?.text),
    [repo, existing],
  );

  const [text, setText] = useState(existing?.text ?? '');
  const [category, setCategory] = useState<string | null>(existing?.category ?? null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayOption>(toOption(existing?.time_of_day ?? null));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);

  if (isEdit && !existing) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Stem not found" backLabel="Close" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const save = () => {
    const result = validateStemText(text, existingTexts);
    if (!result.ok) {
      setError(result.error);
      setWarning(null);
      return;
    }
    setError(null);
    setWarning(result.warning);

    const trimmed = text.trim();
    const resolvedTimeOfDay = fromOption(timeOfDay);
    if (existing) {
      repo.updateStem(existing.id, { text: trimmed, category, timeOfDay: resolvedTimeOfDay });
    } else {
      repo.addStem({ text: trimmed, category, origin: 'user', timeOfDay: resolvedTimeOfDay });
    }
    router.back();
  };

  // w1-t3 (s2-3): Archive routes through the same guard as the library's
  // bulk Deactivate (canDeactivateStems), so the last active stem cannot
  // be archived from the editor. Guard scope unchanged (D5, contract 1):
  // still global, still at-least-one. Unarchive is never blocked —
  // activating can't reduce the active count.
  const toggleArchive = () => {
    if (!existing) return;
    const deactivating = existing.active !== 0;
    if (deactivating && !canDeactivateStems([existing.id], allStems)) {
      setArchiveNotice(LAST_ACTIVE_NOTICE);
      return;
    }
    setArchiveNotice(null);
    repo.setStemActive(existing.id, !deactivating);
    router.back();
  };

  const softDelete = () => {
    if (!existing) return;
    Alert.alert(
      'Delete this stem?',
      'Past sessions written on this stem are unaffected and remain in your history. This only removes it from the library and future selection.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const { at } = nowEventTime();
            repo.softDeleteStem(existing.id, at);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title={isEdit ? 'Edit stem' : 'Add a stem'} backLabel="Close" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError(null);
            }}
            placeholder="An unfinished sentence"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            accessibilityLabel="Stem text"
          />
          {error && (
            <ThemedText type="small" themeColor="error" accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          )}
          {warning && !error && (
            <ThemedText type="small" themeColor="textSecondary">
              {warning}
            </ThemedText>
          )}

          <ThemedText type="eyebrow">Category (optional)</ThemedText>
          <ThemedView style={styles.chipRow}>
            <FilterChip label="None" selected={category === null} onPress={() => setCategory(null)} />
            {CATEGORIES.map((c) => (
              <FilterChip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} category={c} />
            ))}
          </ThemedView>

          <ThemedText type="eyebrow">Time of day</ThemedText>
          <ThemedView style={styles.chipRow}>
            {TIME_OF_DAY_OPTIONS.map((o) => (
              <FilterChip
                key={o}
                label={o === 'none' ? 'None' : o === 'morning' ? 'Morning' : 'Evening'}
                selected={timeOfDay === o}
                onPress={() => setTimeOfDay(o)}
              />
            ))}
          </ThemedView>

          <Button label="Save" onPress={save} variant="primary" />

          {existing && (
            <ThemedView style={styles.destructiveBlock}>
              {existing.active !== 0 && existing.weekNumber !== null && (
                <ThemedText type="small" themeColor="textSecondary">
                  {PROGRAMME_REACTIVATION_NOTE}
                </ThemedText>
              )}
              {archiveNotice && (
                <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                  {archiveNotice}
                </ThemedText>
              )}
              <Button
                label={existing.active ? 'Archive' : 'Unarchive'}
                onPress={toggleArchive}
                variant="text"
                accessibilityLabel={
                  existing.active !== 0 && existing.weekNumber !== null
                    ? `Archive. ${PROGRAMME_REACTIVATION_NOTE}`
                    : undefined
                }
              />
              {!existing.deleted_at && <Button label="Delete" onPress={softDelete} variant="text" />}
            </ThemedView>
          )}
        </ScrollView>
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
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  input: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    lineHeight: 26,
    minHeight: 80,
    padding: Spacing.three,
    borderRadius: Radius.small,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  destructiveBlock: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
});

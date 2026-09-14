import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FilterChip } from '@/components/filter-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryColors, Fonts, MaxContentWidth, Radius, Spacing, type CategoryName } from '@/constants/theme';
import { getRepository, type TimeOfDay } from '@/db';
import { nowEventTime } from '@/db/time';
import { useTheme } from '@/hooks/use-theme';
import { validateStemText, WEIGHT_BY_SETTING, type WeightSetting } from '@/session/stemValidation';

// Reads the category picker off the palette itself (ui-audit-2026-09-11.md
// §2) rather than a hand-maintained list, so this can never drift out of
// sync with `CategoryColors` or the same list in stem-import.tsx.
const CATEGORIES = Object.keys(CategoryColors) as CategoryName[];

// Morning/evening pivot (migration 0003): which fixed daily notification a
// stem belongs to, plus "none" (null — never surfaced by either period's
// sitting, same as a pre-pivot row per DECISIONS.md 2026-09-14).
const TIME_OF_DAY_OPTIONS = ['none', 'morning', 'evening'] as const;
type TimeOfDayOption = (typeof TIME_OF_DAY_OPTIONS)[number];

function toOption(t: TimeOfDay | null): TimeOfDayOption {
  return t ?? 'none';
}

function fromOption(o: TimeOfDayOption): TimeOfDay | null {
  return o === 'none' ? null : o;
}

function weightToSetting(weight: number): WeightSetting {
  if (weight <= WEIGHT_BY_SETTING.less) return 'less';
  if (weight >= WEIGHT_BY_SETTING.more) return 'more';
  return 'normal';
}

/**
 * Add or edit a stem (§6.6). One screen for both: with `?id=`, it loads the
 * existing stem and shows archive/delete/reweight alongside the edit form;
 * without it, it's a bare add form. Editing never touches past sessions —
 * they keep `stem_text_snapshot` regardless of what happens here.
 */
export default function StemEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const repo = useMemo(() => getRepository(), []);
  const isEdit = !!id;

  const existing = useMemo(() => (id ? repo.listAllStems().find((s) => s.id === id) ?? null : null), [id, repo]);
  const existingTexts = useMemo(
    () => repo.listStemTexts().filter((t) => t !== existing?.text),
    [repo, existing],
  );

  const [text, setText] = useState(existing?.text ?? '');
  const [category, setCategory] = useState<string | null>(existing?.category ?? null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayOption>(toOption(existing?.time_of_day ?? null));
  const [weightSetting, setWeightSetting] = useState<WeightSetting>(weightToSetting(existing?.weight ?? 1.0));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  if (isEdit && !existing) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default" themeColor="textSecondary">
            Stem not found.
          </ThemedText>
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
      repo.setStemWeight(existing.id, WEIGHT_BY_SETTING[weightSetting]);
    } else {
      const newId = repo.addStem({ text: trimmed, category, origin: 'user', timeOfDay: resolvedTimeOfDay });
      repo.setStemWeight(newId, WEIGHT_BY_SETTING[weightSetting]);
    }
    router.back();
  };

  const toggleArchive = () => {
    if (!existing) return;
    repo.setStemActive(existing.id, existing.active === 0);
    router.back();
  };

  const softDelete = () => {
    if (!existing) return;
    Alert.alert(
      'Delete this stem?',
      'Past sessions written on this stem are unaffected and remain in your history — this only removes it from the library and future selection.',
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">{isEdit ? 'Edit stem' : 'Add a stem'}</ThemedText>

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

          <ThemedText type="small" themeColor="textSecondary">
            Category (optional)
          </ThemedText>
          <ThemedView style={styles.chipRow}>
            <FilterChip label="None" selected={category === null} onPress={() => setCategory(null)} />
            {CATEGORIES.map((c) => (
              <FilterChip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} category={c} />
            ))}
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            Time of day
          </ThemedText>
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

          <ThemedText type="small" themeColor="textSecondary">
            How often
          </ThemedText>
          <ThemedView style={styles.chipRow}>
            {(['less', 'normal', 'more'] as const).map((w) => (
              <FilterChip
                key={w}
                label={w === 'less' ? 'Less often' : w === 'more' ? 'More often' : 'Normal'}
                selected={weightSetting === w}
                onPress={() => setWeightSetting(w)}
              />
            ))}
          </ThemedView>

          <Button label="Save" onPress={save} variant="primary" />

          {existing && (
            <ThemedView style={styles.destructiveBlock}>
              <Button label={existing.active ? 'Archive' : 'Unarchive'} onPress={toggleArchive} variant="text" />
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

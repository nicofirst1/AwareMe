import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/filter-chip';
import { ScreenHeader } from '@/components/screen-header';
import { hexToRgba, SectionHeader } from '@/components/section-header';
import { StepperRow } from '@/components/stepper-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, MinTouchTarget, Spacing } from '@/constants/theme';
import { getRepository, Settings } from '@/db';
import { cancelAllPendingNotifications, rescheduleNotifications } from '@/notifications/scheduler';
import { isValidHHMM } from '@/session/settingsValidation';
import { useTheme } from '@/hooks/use-theme';

const THEMES = ['system', 'light', 'dark'] as const;
const TERMINATORS = ['...', '—'] as const;

function ChipToggle<T extends string>({
  label,
  options,
  value,
  onChange,
  display,
}: {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  display?: (opt: T) => string;
}) {
  return (
    <ThemedView style={styles.section}>
      {label && (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <ThemedView style={styles.chipRow}>
        {options.map((opt) => (
          <FilterChip key={opt} label={display ? display(opt) : opt} selected={value === opt} onPress={() => onChange(opt)} />
        ))}
      </ThemedView>
    </ThemedView>
  );
}

/** A calm, one-line explanation under a non-obvious setting (spec §10, 2026-09-11 feedback item 4). */
function Hint({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

/**
 * Settings (§7): every tunable, its stated range, persisted one key at a
 * time via `Repository.setSetting` (JSON-encoded in the `settings` table,
 * `updated_at` stamped per write — the existing settings-table pattern, no
 * schema change). Changing a notification time calls `rescheduleNotifications()`
 * on save (morning/evening pivot, 2026-09-14): it cancels and recreates the
 * app's two daily triggers from the freshly saved settings.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const repo = useMemo(() => getRepository(), []);
  const [settings, setSettings] = useState<Settings>(() => repo.getSettings());
  const [morningTime, setMorningTime] = useState(settings.morning_notification_time);
  const [eveningTime, setEveningTime] = useState(settings.evening_notification_time);
  const [morningError, setMorningError] = useState<string | null>(null);
  const [eveningError, setEveningError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [wiping, setWiping] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    repo.setSetting(key, value);
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavedNotice(true);
  };

  const saveMorningTime = () => {
    if (!isValidHHMM(morningTime)) {
      setMorningError('Enter a valid time (HH:MM).');
      return;
    }
    setMorningError(null);
    set('morning_notification_time', morningTime);
    rescheduleNotifications().catch((error) => {
      if (__DEV__) console.warn('Notification reschedule failed:', error);
    });
  };

  const saveEveningTime = () => {
    if (!isValidHHMM(eveningTime)) {
      setEveningError('Enter a valid time (HH:MM).');
      return;
    }
    setEveningError(null);
    set('evening_notification_time', eveningTime);
    rescheduleNotifications().catch((error) => {
      if (__DEV__) console.warn('Notification reschedule failed:', error);
    });
  };

  const confirmDeleteAll = () => {
    Alert.alert(
      'Delete all data?',
      'This permanently erases every stem, session, and ending on this device and cannot be undone. Consider exporting your data first (Home → Export).',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: confirmDeleteAllStepTwo },
      ],
    );
  };

  const confirmDeleteAllStepTwo = () => {
    Alert.alert(
      'Are you absolutely sure?',
      'Everything you have written will be gone. This is the only action in this app that cannot be recovered from inside it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: runDeleteAll },
      ],
    );
  };

  const runDeleteAll = async () => {
    setWiping(true);
    try {
      await cancelAllPendingNotifications();
      repo.deleteAllData();
      const fresh = repo.getSettings();
      setSettings(fresh);
      setMorningTime(fresh.morning_notification_time);
      setEveningTime(fresh.evening_notification_time);
      Alert.alert('Data deleted', 'The app has been reset to its factory state.');
    } catch (err) {
      Alert.alert('Delete failed', err instanceof Error ? err.message : String(err));
    } finally {
      setWiping(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Settings" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedView style={[styles.group, { borderTopColor: hexToRgba(theme.accent, 0.3) }]}>
            <SectionHeader label="Session" />

            <ThemedView style={styles.setting}>
              <StepperRow
                label="Endings per session"
                value={settings.endings_per_session}
                rangeKey="endings_per_session"
                onChange={(v) => set('endings_per_session', v)}
              />
              <Hint>Endings you write to the same stem per session.</Hint>
            </ThemedView>

            <ThemedView style={styles.setting}>
              <StepperRow
                label="Timer (seconds)"
                value={settings.timer_seconds}
                rangeKey="timer_seconds"
                step={10}
                onChange={(v) => set('timer_seconds', v)}
              />
              <Hint>How long the session runs before timing out.</Hint>
            </ThemedView>

            <ThemedView style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary">
                Stem time limit
              </ThemedText>
              <Hint>
                An optional per-stem countdown, separate from the session timer above. Off by default; the writing
                screen does not use it yet.
              </Hint>
              <ChipToggle
                options={['off', 'on'] as const}
                value={settings.stem_timer_enabled ? 'on' : 'off'}
                onChange={(v) => set('stem_timer_enabled', v === 'on')}
              />
              {settings.stem_timer_enabled && (
                <StepperRow
                  label="Seconds per stem"
                  value={settings.stem_timer_seconds}
                  rangeKey="stem_timer_seconds"
                  step={5}
                  onChange={(v) => set('stem_timer_seconds', v)}
                />
              )}
            </ThemedView>
          </ThemedView>

          <ThemedView style={[styles.group, { borderTopColor: hexToRgba(theme.accent, 0.3) }]}>
            <SectionHeader label="Notifications" />

            <ThemedView style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary">
                Notification times
              </ThemedText>
              <Hint>Two reminders a day, at exact times you choose — the book&apos;s own suggestion is start and end of day.</Hint>
              <ThemedView style={styles.windowRow}>
                <ThemedText type="default">Morning</ThemedText>
                <TextInput
                  value={morningTime}
                  onChangeText={setMorningTime}
                  onBlur={saveMorningTime}
                  placeholder="08:00"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.timeInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                  accessibilityLabel="Morning notification time"
                />
              </ThemedView>
              {morningError && (
                <ThemedText type="small" themeColor="error" accessibilityLiveRegion="polite">
                  {morningError}
                </ThemedText>
              )}
              <ThemedView style={styles.windowRow}>
                <ThemedText type="default">Evening</ThemedText>
                <TextInput
                  value={eveningTime}
                  onChangeText={setEveningTime}
                  onBlur={saveEveningTime}
                  placeholder="21:00"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.timeInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                  accessibilityLabel="Evening notification time"
                />
              </ThemedView>
              {eveningError && (
                <ThemedText type="small" themeColor="error" accessibilityLiveRegion="polite">
                  {eveningError}
                </ThemedText>
              )}
            </ThemedView>

            <ThemedView style={styles.setting}>
              <ChipToggle
                label="Weekly review prompt"
                options={['on', 'off'] as const}
                value={settings.weekly_review_prompt ? 'on' : 'off'}
                onChange={(v) => set('weekly_review_prompt', v === 'on')}
              />
              <Hint>Offer a review of the past week&apos;s writing once a week, in-app.</Hint>
            </ThemedView>
          </ThemedView>

          <ThemedView style={[styles.group, { borderTopColor: hexToRgba(theme.accent, 0.3) }]}>
            <SectionHeader label="Writing" />

            <ThemedView style={styles.setting}>
              <ChipToggle
                label="Uncensored mode"
                options={['on', 'off'] as const}
                value={settings.uncensored_mode ? 'on' : 'off'}
                onChange={(v) => set('uncensored_mode', v === 'on')}
              />
              <Hint>
                Backspace only erases the word you&apos;re on, and you can&apos;t edit an earlier ending in the same
                session. This keeps the writing unfiltered — turn it off if that restriction feels intolerable.
              </Hint>
            </ThemedView>

            <ThemedView style={styles.setting}>
              <ChipToggle
                label="Stem terminator"
                options={TERMINATORS}
                value={settings.stem_terminator as (typeof TERMINATORS)[number]}
                onChange={(v) => set('stem_terminator', v)}
              />
              <Hint>The punctuation shown at the end of each stem.</Hint>
            </ThemedView>
          </ThemedView>

          <ThemedView style={[styles.group, { borderTopColor: hexToRgba(theme.accent, 0.3) }]}>
            <SectionHeader label="App" />

            <ThemedView style={styles.setting}>
              <ChipToggle
                label="App lock"
                options={['on', 'off'] as const}
                value={settings.app_lock_enabled ? 'on' : 'off'}
                onChange={(v) => set('app_lock_enabled', v === 'on')}
              />
              <Hint>Require your device passcode or biometrics to open the app.</Hint>
            </ThemedView>

            <ChipToggle label="Theme" options={THEMES} value={settings.theme as (typeof THEMES)[number]} onChange={(v) => set('theme', v)} />
          </ThemedView>

          {savedNotice && (
            <ThemedText type="small" themeColor="textSecondary">
              Saved.
            </ThemedText>
          )}

          <Link href="/about-method" style={styles.navLink}>
            <ThemedText type="default">About the method</ThemedText>
          </Link>

          <ThemedView style={styles.destructiveBlock}>
            <ThemedText type="small" themeColor="textSecondary">
              Delete all data permanently removes everything from this device. Export first if you want to keep it.
            </ThemedText>
            <Pressable
              onPress={confirmDeleteAll}
              disabled={wiping}
              style={[styles.deleteButton, { opacity: wiping ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityState={{ disabled: wiping, busy: wiping }}
            >
              <ThemedText type="default" themeColor="error">
                Delete all data
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  // One setting = control + its hint, held together by the 4pt
  // label-to-control gap (LC3); settings sit 8pt apart inside a group (row
  // gap), groups 24pt apart via scrollContent's gap (section gap).
  setting: {
    gap: Spacing.one,
  },
  group: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
  },
  section: {
    gap: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  timeInput: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    width: 80,
    minHeight: MinTouchTarget,
    textAlign: 'center',
  },
  // No extra `paddingTop` here (2026-09-11 visual-test finding: this stacked
  // on top of `scrollContent`'s own `gap: Spacing.four` between children,
  // doubling the space above "Delete all data" to ~48px vs. every other
  // section boundary's ~32px — the ScrollView's gap alone now matches the
  // rest of the screen's rhythm).
  destructiveBlock: {
    gap: Spacing.two,
  },
  deleteButton: {
    paddingVertical: Spacing.two,
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  navLink: {
    minHeight: MinTouchTarget,
    textAlignVertical: 'center',
  },
});

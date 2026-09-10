import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChip } from '@/components/filter-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, MinTouchTarget, Spacing } from '@/constants/theme';
import { getRepository, Settings } from '@/db';
import { cancelAllPendingNotifications, rescheduleNotifications } from '@/notifications/scheduler';
import { clampSetting, isValidHHMM, SETTINGS_RANGES } from '@/session/settingsValidation';
import { useTheme } from '@/hooks/use-theme';

const THEMES = ['system', 'light', 'dark'] as const;
const TERMINATORS = ['...', '—'] as const;

/**
 * A number field with +/- steppers, clamped to spec §7's stated range. No
 * raw-integer TextInput: out-of-range values would otherwise need their own
 * error/warning UI, and a stepper makes the range self-evident.
 */
function NumberStepper({
  label,
  value,
  settingKey,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  settingKey: keyof typeof SETTINGS_RANGES;
  step?: number;
  onChange: (next: number) => void;
}) {
  const theme = useTheme();
  const { min, max } = SETTINGS_RANGES[settingKey];
  return (
    <ThemedView style={styles.row}>
      <ThemedView style={styles.rowLabel}>
        <ThemedText type="default">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {min}–{max}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepper}>
        <Pressable
          onPress={() => onChange(clampSetting(settingKey, value - step))}
          style={[styles.stepperButton, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <ThemedText type="subtitle">−</ThemedText>
        </Pressable>
        <ThemedText type="subtitle" style={styles.stepperValue}>
          {value}
        </ThemedText>
        <Pressable
          onPress={() => onChange(clampSetting(settingKey, value + step))}
          style={[styles.stepperButton, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <ThemedText type="subtitle">+</ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

function ChipToggle<T extends string>({
  label,
  options,
  value,
  onChange,
  display,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  display?: (opt: T) => string;
}) {
  return (
    <ThemedView style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedView style={styles.chipRow}>
        {options.map((opt) => (
          <FilterChip key={opt} label={display ? display(opt) : opt} selected={value === opt} onPress={() => onChange(opt)} />
        ))}
      </ThemedView>
    </ThemedView>
  );
}

/**
 * Settings (§7): every tunable, its stated range, persisted one key at a
 * time via `Repository.setSetting` (JSON-encoded in the `settings` table,
 * `updated_at` stamped per write — the existing settings-table pattern, no
 * schema change). Changing the notification window or sessions/day calls
 * `rescheduleNotifications()` on save, the seam ticket 10 built for exactly
 * this (DECISIONS.md, ticket-10 entry).
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const repo = useMemo(() => getRepository(), []);
  const [settings, setSettings] = useState<Settings>(() => repo.getSettings());
  const [windowStart, setWindowStart] = useState(settings.windows[0]?.start ?? '08:00');
  const [windowEnd, setWindowEnd] = useState(settings.windows[0]?.end ?? '21:00');
  const [windowError, setWindowError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [wiping, setWiping] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    repo.setSetting(key, value);
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavedNotice(true);
  };

  const saveWindow = () => {
    if (!isValidHHMM(windowStart) || !isValidHHMM(windowEnd) || windowStart >= windowEnd) {
      setWindowError('Enter a start and end time (HH:MM), with start before end.');
      return;
    }
    setWindowError(null);
    set('windows', [{ start: windowStart, end: windowEnd }]);
    rescheduleNotifications().catch((error) => {
      if (__DEV__) console.warn('Notification reschedule failed:', error);
    });
  };

  const onSessionsPerDayChange = (next: number) => {
    set('sessions_per_day', next);
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
      setSettings(repo.getSettings());
      const fresh = repo.getSettings();
      setWindowStart(fresh.windows[0]?.start ?? '08:00');
      setWindowEnd(fresh.windows[0]?.end ?? '21:00');
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">Settings</ThemedText>

          <NumberStepper
            label="Endings per session"
            value={settings.endings_per_session}
            settingKey="endings_per_session"
            onChange={(v) => set('endings_per_session', v)}
          />
          <NumberStepper
            label="Timer (seconds)"
            value={settings.timer_seconds}
            settingKey="timer_seconds"
            step={10}
            onChange={(v) => set('timer_seconds', v)}
          />
          <NumberStepper
            label="Sessions per day"
            value={settings.sessions_per_day}
            settingKey="sessions_per_day"
            onChange={onSessionsPerDayChange}
          />

          <ThemedView style={styles.section}>
            <ThemedText type="small" themeColor="textSecondary">
              Notification window
            </ThemedText>
            <ThemedView style={styles.windowRow}>
              <TextInput
                value={windowStart}
                onChangeText={setWindowStart}
                onBlur={saveWindow}
                placeholder="08:00"
                placeholderTextColor={theme.textSecondary}
                style={[styles.timeInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                accessibilityLabel="Window start time"
              />
              <ThemedText type="default">to</ThemedText>
              <TextInput
                value={windowEnd}
                onChangeText={setWindowEnd}
                onBlur={saveWindow}
                placeholder="21:00"
                placeholderTextColor={theme.textSecondary}
                style={[styles.timeInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                accessibilityLabel="Window end time"
              />
            </ThemedView>
            {windowError && (
              <ThemedText type="small" themeColor="error" accessibilityLiveRegion="polite">
                {windowError}
              </ThemedText>
            )}
          </ThemedView>

          <ChipToggle
            label="Uncensored mode"
            options={['on', 'off'] as const}
            value={settings.uncensored_mode ? 'on' : 'off'}
            onChange={(v) => set('uncensored_mode', v === 'on')}
          />

          <ChipToggle label="Stem terminator" options={TERMINATORS} value={settings.stem_terminator as (typeof TERMINATORS)[number]} onChange={(v) => set('stem_terminator', v)} />

          <ChipToggle
            label="App lock"
            options={['on', 'off'] as const}
            value={settings.app_lock_enabled ? 'on' : 'off'}
            onChange={(v) => set('app_lock_enabled', v === 'on')}
          />

          <ChipToggle
            label="Weekly review prompt"
            options={['on', 'off'] as const}
            value={settings.weekly_review_prompt ? 'on' : 'off'}
            onChange={(v) => set('weekly_review_prompt', v === 'on')}
          />

          <ChipToggle label="Theme" options={THEMES} value={settings.theme as (typeof THEMES)[number]} onChange={(v) => set('theme', v)} />

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
  row: {
    gap: Spacing.one,
  },
  rowLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepperButton: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 48,
    textAlign: 'center',
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
  destructiveBlock: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
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

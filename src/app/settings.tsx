import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { Card } from '@/components/card';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { StepperRow } from '@/components/stepper-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, MaxContentWidth, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { getRepository, Settings } from '@/db';
import { cancelAllPendingNotifications, rescheduleNotifications, type WeekdayName } from '@/notifications/scheduler';
import { isValidHHMM } from '@/session/settingsValidation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { resyncThemePreference, setThemePreference, THEME_PREFERENCE_VALUES, useThemePreference } from '@/theme/themePreference';

const TERMINATORS = ['...', '—'] as const;

/** The three settings keys a `TimeField` writes; all store the same "HH:MM" 24h format. */
type TimeKey = 'morning_notification_time' | 'evening_notification_time' | 'weekly_meta_time';

/**
 * The weekday list's presentation order (2026-09-18 owner feedback, issue 14):
 * Monday-first, the week's working rhythm, rather than the scheduler's
 * `WEEKDAY_NAMES` whose index mirrors `Date.getDay()`. Presentation only —
 * the stored `weekly_meta_day` value is the same lowercase weekday name the
 * scheduler consumes (docs/spec.md:316), so no storage format changes here.
 */
const WEEKDAY_CHOICE_ORDER: readonly WeekdayName[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** "monday" → "Monday": the capitalized display the reporter asked for. */
function capitalizeWeekday(day: WeekdayName): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * The "pick one of a short row of options" control (on/off pairs, the
 * terminator, the theme, and now the weekly reflection day) in the
 * screen's unified control anatomy: a pill
 * row with no borders and no fill equal to the surface it sits on, so no
 * option can render as the white square the 2026-09-17 vision audit
 * caught (v13 issue 08, defect C). Unselected options stay quiet text
 * (textSecondary on the element card, 5.08:1 light / 8.08:1 dark per
 * theme.ts); the selected option carries the palette's anchor hue
 * consumed through the c04 token contract: the `Palette.indigo` bg/text
 * pair, the measured AA pairing for chip/tint fills.
 *
 * `accessibilityLabel` (optional) names the group's options for screen
 * readers when the visible label alone is too thin — each pill's
 * accessibility name becomes "<group label>: <option>" (e.g. "Weekly
 * reflection day: Monday"), so a screen-reader user hears which setting
 * a pill belongs to without relying on visual grouping.
 */
function OptionToggle<T extends string>({
  label,
  options,
  value,
  onChange,
  display,
  accessibilityLabel,
}: {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  display?: (opt: T) => string;
  accessibilityLabel?: string;
}) {
  const scheme = useColorScheme();
  const selectedPair = scheme === 'dark' ? Palette.indigo.dark : Palette.indigo.light;

  return (
    <ThemedView style={styles.section}>
      {label && (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      )}
      <ThemedView style={styles.chipRow}>
        {options.map((opt) => {
          const selected = value === opt;
          const displayText = display ? display(opt) : opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[styles.optionPill, selected && { backgroundColor: selectedPair.bg }]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={accessibilityLabel ? `${accessibilityLabel}: ${displayText}` : undefined}
            >
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={selected ? { color: selectedPair.text } : undefined}
              >
                {displayText}
              </ThemedText>
            </Pressable>
          );
        })}
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

/** "HH:MM" → a Date for the native pickers: today at that wall-clock time. */
function hhmmToDate(hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return date;
}

/** A picker result → the exact "HH:MM" 24h string the settings keys store. */
function dateToHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * One notification-time row (2026-09-16 owner feedback: times should use
 * native pickers so the hour input is native on both platforms). The
 * stored value stays the exact "HH:MM" 24h string per setting key — only
 * the input surface is native:
 *
 * - iOS: the compact system picker renders inline as the row's control
 *   (a button showing the time that opens the system popover).
 * - Android: a row button shows the stored "HH:MM" and opens the system
 *   time dialog via the library's imperative `DateTimePickerAndroid.open`.
 *
 * `onConfirm` fires only on an explicit set — a dismissal carries no date
 * and never reaches storage.
 */
function TimeField({
  label,
  accessibilityLabel,
  value,
  onConfirm,
}: {
  label: string;
  accessibilityLabel: string;
  value: string;
  onConfirm: (next: string) => void;
}) {
  const theme = useTheme();

  const confirmDate = (date?: Date) => {
    if (date) onConfirm(dateToHHMM(date));
  };

  if (Platform.OS === 'android') {
    return (
      <ThemedView style={styles.windowRow}>
        <ThemedText type="eyebrow">{label}</ThemedText>
        <Pressable
          onPress={() => {
            DateTimePickerAndroid.open({
              mode: 'time',
              is24Hour: true,
              value: hhmmToDate(value),
              onChange: (_event, date) => confirmDate(date),
            });
          }}
          style={[styles.pillTrigger, { backgroundColor: theme.backgroundSelected }]}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <ThemedText type="default">{value}</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.windowRow}>
      <ThemedText type="eyebrow">{label}</ThemedText>
      <DateTimePicker
        mode="time"
        display="compact"
        value={hhmmToDate(value)}
        onChange={(event, date) => {
          if (event.type === 'set') confirmDate(date);
        }}
        accessibilityLabel={accessibilityLabel}
      />
    </ThemedView>
  );
}

/**
 * Settings (§7): every tunable, its stated range, persisted one key at a
 * time via `Repository.setSetting` (JSON-encoded in the `settings` table,
 * `updated_at` stamped per write — the existing settings-table pattern, no
 * schema change). Changing a notification time — or the evening-practice
 * gate, or the weekly reflection day/time — calls `rescheduleNotifications()`
 * on save (2026-09-14 pivot + §6.4's 2026-09-15 amendment): it cancels and
 * recreates the app's triggers from the freshly saved settings, scheduling
 * the evening one only when `evening_practice_enabled` is true.
 *
 * Notification times stay native pickers (2026-09-16 and 2026-09-17 owner
 * feedback) via `@react-native-community/datetimepicker`; the time picker
 * can only emit a Date, and `isValidHHMM` remains the validation boundary
 * at the storage edge (`saveTime`) before any key is written. The weekly
 * reflection day is back to an in-app weekday list (2026-09-18 owner
 * feedback, issue 14: the native picker opens a calendar, and the reporter
 * wants weekday names to pick from, capitalized) — one more row of the
 * screen's `OptionToggle` pills. Its stored value stays the lowercase
 * weekday name the scheduler consumes (docs/spec.md:316); the list only changes
 * which name is picked. An out-of-range stored name renders no selected
 * pill (the scheduler's own sunday fallback is untouched); the reschedule
 * on change contract is untouched.
 *
 * Sub-groups are inset cards (2026-09-16 owner feedback: the screen lacked
 * visual separation between groups) using the shared `Card`, with the
 * existing `SectionHeader` per group. Structure only — no setting moved
 * between keys.
 *
 * Controls share one anatomy (2026-09-17 audit, defect C): pill shapes
 * (`Radius.chip`) with no borders and no fill equal to the surface they
 * sit on. Options are quiet text until selected, then carry the
 * `Palette.indigo` bg/text pair (c04's anchor hue for selected states);
 * value triggers (times, day) fill with `backgroundSelected`, the
 * theme's deeper neutral step, visible on the element card they sit on.
 * The steppers keep the same anatomy via the shared `StepperRow`.
 *
 * The theme preference is applied through `src/theme/themePreference` (the
 * same fix): the chip reads the reactive store and writes through it, so
 * the change is persisted AND applied app-wide in one step.
 *
 * `program_week_override` (§7, ADR-0005) deliberately has no control here —
 * it belongs to the stem library's week pages ("make this my week"), which
 * own that setting.
 */
export default function SettingsScreen() {
  const themePreference = useThemePreference();
  const repo = useMemo(() => getRepository(), []);
  const [settings, setSettings] = useState<Settings>(() => repo.getSettings());
  const [savedNotice, setSavedNotice] = useState(false);
  const [wiping, setWiping] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    repo.setSetting(key, value);
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavedNotice(true);
  };

  /**
   * The one storage edge for every notification time: `isValidHHMM` guards
   * the exact "HH:MM" 24h format the keys store (§7) before the write and
   * the reschedule-on-change call (c03 contract).
   */
  const saveTime = (key: TimeKey, value: string) => {
    if (!isValidHHMM(value)) return;
    set(key, value);
    rescheduleNotifications().catch((error) => {
      if (__DEV__) console.warn('Notification reschedule failed:', error);
    });
  };

  /** The evening toggle changes whether the evening notification exists at all (§7 gates it, with the practice), so it reschedules too. */
  const setEveningPractice = (enabled: boolean) => {
    set('evening_practice_enabled', enabled);
    rescheduleNotifications().catch((error) => {
      if (__DEV__) console.warn('Notification reschedule failed:', error);
    });
  };

  const setWeeklyDay = (day: string) => {
    set('weekly_meta_day', day);
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
      resyncThemePreference();
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
          <ThemedView style={styles.group}>
            <SectionHeader label="Session" />
            <Card style={styles.cardGap}>
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
                  An optional per-stem countdown, separate from the session timer above. Off by default; the
                  writing screen scopes it to the field you’re on.
                </Hint>
                <OptionToggle
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
            </Card>
          </ThemedView>

          <ThemedView style={styles.group}>
            <SectionHeader label="Notifications" />
            <Card style={styles.cardGap}>
              <ThemedView style={styles.section}>
                <ThemedText type="small" themeColor="textSecondary">
                  Notification times
                </ThemedText>
                <Hint>Daily reminders at exact times you choose: the book&apos;s own suggestion is start and end of day.</Hint>
                <TimeField
                  label="Morning"
                  accessibilityLabel="Morning notification time"
                  value={settings.morning_notification_time}
                  onConfirm={(v) => saveTime('morning_notification_time', v)}
                />
                <TimeField
                  label="Evening"
                  accessibilityLabel="Evening notification time"
                  value={settings.evening_notification_time}
                  onConfirm={(v) => saveTime('evening_notification_time', v)}
                />
              </ThemedView>


              <ThemedView style={styles.setting}>
                <OptionToggle
                  label="Evening practice"
                  options={['on', 'off'] as const}
                  value={settings.evening_practice_enabled ? 'on' : 'off'}
                  onChange={(v) => setEveningPractice(v === 'on')}
                />
                <Hint>
                  An evening practice: the morning&apos;s endings once more, then a reflection sentence. Off also removes
                  the evening reminder above.
                </Hint>
              </ThemedView>


              <ThemedView style={styles.section}>
                <ThemedText type="small" themeColor="textSecondary">
                  Weekly reflection
                </ThemedText>
                <Hint>A weekly reminder to sit with the week&apos;s writing, on one day at an exact time.</Hint>
                <ThemedText type="eyebrow">Day</ThemedText>
                <OptionToggle
                  accessibilityLabel="Weekly reflection day"
                  options={WEEKDAY_CHOICE_ORDER}
                  value={settings.weekly_meta_day as WeekdayName}
                  display={capitalizeWeekday}
                  onChange={setWeeklyDay}
                />
                <TimeField
                  label="Time"
                  accessibilityLabel="Weekly notification time"
                  value={settings.weekly_meta_time}
                  onConfirm={(v) => saveTime('weekly_meta_time', v)}
                />
              </ThemedView>


              <ThemedView style={styles.setting}>
                <OptionToggle
                  label="Weekly review prompt"
                  options={['on', 'off'] as const}
                  value={settings.weekly_review_prompt ? 'on' : 'off'}
                  onChange={(v) => set('weekly_review_prompt', v === 'on')}
                />
                <Hint>Offer a review of the past week&apos;s writing once a week, in-app.</Hint>
              </ThemedView>
            </Card>
          </ThemedView>

          <ThemedView style={styles.group}>
            <SectionHeader label="Writing" />
            <Card style={styles.cardGap}>
              <ThemedView style={styles.setting}>
                <OptionToggle
                  label="Uncensored mode"
                  options={['on', 'off'] as const}
                  value={settings.uncensored_mode ? 'on' : 'off'}
                  onChange={(v) => set('uncensored_mode', v === 'on')}
                />
                <Hint>
                  Backspace only erases the word you&apos;re on, and you can&apos;t edit an earlier ending in the same
                  session. This keeps the writing unfiltered. Turn it off if that restriction feels intolerable.
                </Hint>
              </ThemedView>


              <ThemedView style={styles.setting}>
                <OptionToggle
                  label="Stem terminator"
                  options={TERMINATORS}
                  value={settings.stem_terminator as (typeof TERMINATORS)[number]}
                  onChange={(v) => set('stem_terminator', v)}
                />
                <Hint>The punctuation shown at the end of each stem.</Hint>
              </ThemedView>
            </Card>
          </ThemedView>

          <ThemedView style={styles.group}>
            <SectionHeader label="App" />
            <Card style={styles.cardGap}>
              <ThemedView style={styles.setting}>
                <OptionToggle
                  label="App lock"
                  options={['on', 'off'] as const}
                  value={settings.app_lock_enabled ? 'on' : 'off'}
                  onChange={(v) => set('app_lock_enabled', v === 'on')}
                />
                <Hint>Require your device passcode or biometrics to open the app.</Hint>
              </ThemedView>


              <OptionToggle
                label="Theme"
                options={THEME_PREFERENCE_VALUES}
                value={themePreference}
                onChange={setThemePreference}
              />
            </Card>
          </ThemedView>

          {savedNotice && (
            <ThemedText type="small" themeColor="textSecondary">
              Saved.
            </ThemedText>
          )}

          {/* accessibilityRole="link" + explicit label: the same Link
              convention index.tsx's rows use (BackHeader documents it). */}
          <Link
            href="/about-method"
            style={styles.navLink}
            accessibilityRole="link"
            accessibilityLabel="About the method"
          >
            <ThemedText type="default">About the method</ThemedText>
          </Link>

          <ThemedView style={styles.group}>
            <SectionHeader label="Data" />
            <Card style={styles.cardGap}>
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
            </Card>
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
  // label-to-control gap (LC3); sub-blocks inside a card sit 8pt apart
  // (cardGap), groups 24pt apart via scrollContent's gap (section gap).
  setting: {
    gap: Spacing.one,
  },
  group: {
    gap: Spacing.two,
  },
  cardGap: {
    gap: Spacing.two,
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
  // The Android trigger shows the stored "HH:MM" verbatim and opens the
  // system dialog; iOS renders the compact native picker instead. The pill
  // sits on a backgroundElement card, so its fill is the theme's deeper
  // neutral step (backgroundSelected): element-on-
  // element vanished after the c04 retheme, and the stadium shape matches
  // every other control on this screen.
  pillTrigger: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.chip,
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  optionPill: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.chip,
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

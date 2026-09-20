/**
 * Pure programme-engine helpers (spec §6.2 as amended 2026-09-15, §6.5, §7;
 * ADR-0005). Everything here is a pure function of its arguments — no DB,
 * no clock, no randomness (§6.2: "No weighting, no recency penalty, no
 * randomness") — so the whole week-derivation rule is unit-provable
 * without a device or a database. The DB-facing composition lives in
 * `programRead.ts`; the raw reads live on `Repository`.
 *
 * Calendar framing: a "calendar week" is Mon–Sun in the event's own local
 * wall time (§4.1.3 stores each event's UTC instant + its offset at the
 * moment), so week bucketing runs on wall-clock dates, never on raw UTC
 * instants. `eventWeekMondayKey` is the one place that mapping lives.
 */

/** The programme has thirty weeks (ADR-0005); the derived week never exceeds this. */
export const PROGRAMME_WEEK_CAP = 30;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function twoDigits(n: number): string {
  return `${n}`.padStart(2, '0');
}

function dateKey(year: number, month1based: number, day: number): string {
  return `${year}-${twoDigits(month1based)}-${twoDigits(day)}`;
}

/** 'YYYY-MM-DD' local calendar date of `d` (the device's local frame). */
export function localDateKey(d: Date): string {
  return dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Parses 'YYYY-MM-DD' into local midnight, or null on anything else. */
export function parseLocalDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The Monday (local midnight) that starts the Mon–Sun week containing `d`.
 * Sunday (`getDay() === 0`) maps to the Monday six days back; every other
 * day to the Monday `(weekday - 1)` days back.
 */
export function mondayOfWeek(d: Date): Date {
  const daysSinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMonday);
}

/**
 * The local wall-clock date ('YYYY-MM-DD') of a §4.1.3 event, given its
 * stored UTC instant and offset: local wall time = UTC + offset. Reads the
 * shifted instant's UTC components as wall components, so the result does
 * not depend on the machine's own time zone — a stored event always
 * buckets into the calendar day it happened on, wherever it's replayed.
 */
export function eventLocalDateKey(utcAt: string, offsetMin: number): string {
  const wall = new Date(Date.parse(utcAt) + offsetMin * 60_000);
  return dateKey(wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate());
}

/**
 * The Monday key ('YYYY-MM-DD') of the Mon–Sun week containing a §4.1.3
 * event, in the event's own wall-clock frame. This is the key weekly
 * reflections are bucketed and counted by (§6.2's "distinct calendar
 * weeks"); ISO date keys compare correctly as plain strings.
 */
export function eventWeekMondayKey(utcAt: string, offsetMin: number): string {
  const wall = new Date(Date.parse(utcAt) + offsetMin * 60_000);
  const daysSinceMonday = (wall.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - daysSinceMonday));
  return dateKey(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}

/** Whole Mon–Sun weeks from the week containing `anchor` to the week containing `d` (0 = same week; negative when `d`'s week precedes it). */
export function calendarWeeksBetween(anchor: Date, d: Date): number {
  return Math.round((mondayOfWeek(d).getTime() - mondayOfWeek(anchor).getTime()) / WEEK_MS);
}

/**
 * How many DISTINCT Mon–Sun calendar weeks hold at least one completed
 * weekly reflection, counted from the anchor week onward (§6.2: reflections
 * in weeks before the first official-programme practice's week never advance
 * the programme — months of on-demand reviews before starting must not
 * rocket the user to week 25). `anchorMondayKey` null (no programme practice
 * yet) counts nothing: a null anchor derives week 1 downstream.
 */
export function countAnchoredReflectionWeeks(
  anchorMondayKey: string | null,
  reflectionMondayKeys: readonly string[],
): number {
  if (anchorMondayKey === null) return 0;
  const distinct = new Set(reflectionMondayKeys.filter((key) => key >= anchorMondayKey));
  return distinct.size;
}

function toNonNegativeInt(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * The §6.2 derived programme week: `1 +` the number of distinct Mon–Sun
 * calendar weeks containing at least one completed weekly reflection,
 * counted from the week of the first official-programme practice ever
 * written, capped at 30. Advancement is self-paced — missing days never
 * skip weeks, and two reflections inside one calendar week count once.
 *
 * @param firstProgramSittingDate local 'YYYY-MM-DD' of the first
 *   official-programme practice (the anchor). Null-ish → week 1: the
 *   derivation only starts once the programme itself has started, however
 *   many reflections predate it.
 * @param reflectionCalendarWeeks the anchored distinct-week count (see
 *   `countAnchoredReflectionWeeks` — the repository buckets reflections
 *   into week keys, this counts them).
 * @param now bounds the defensive clamp below; it never binds on honest
 *   inputs (a reflection week is always on/after the anchor week and
 *   not after the current week), so the clamp only stops corrupted or
 *   clock-skewed inputs from skipping the programme ahead.
 */
export function deriveProgramWeek(
  firstProgramSittingDate: string | null | undefined,
  reflectionCalendarWeeks: number,
  now: Date,
): number {
  if (!firstProgramSittingDate) return 1;
  const anchor = parseLocalDateKey(firstProgramSittingDate);
  if (!anchor) return 1;

  const counted = toNonNegativeInt(reflectionCalendarWeeks);
  // Honest inputs can never produce more distinct reflection weeks than
  // calendar weeks elapsed since the anchor (the anchor week itself can
  // hold one) — clamping keeps a corrupt count from skipping weeks.
  const elapsedWeeks = calendarWeeksBetween(anchor, now);
  const maxCounted = Math.max(0, elapsedWeeks + 1);
  return Math.min(PROGRAMME_WEEK_CAP, 1 + Math.min(counted, maxCounted));
}

/**
 * §6.2/§7 `program_week_override`: the user's selected week wins when it is
 * a usable programme week (integer 1–30); anything else (null, or an
 * out-of-range/garbage value from user-editable storage) falls back to the
 * derived week rather than throwing or clamping into a week nobody chose.
 */
export function effectiveWeek(derived: number, override: number | null | undefined): number {
  if (typeof override === 'number' && Number.isInteger(override) && override >= 1 && override <= PROGRAMME_WEEK_CAP) {
    return override;
  }
  return derived;
}

/**
 * §6.2's deterministic evening-stem alternation, keyed to the count of
 * completed evening reflection sessions: even count → stem A (index 0),
 * odd → stem B (index 1). The first-ever evening reflection (count 0) is
 * therefore stem A, and the pair strictly alternates from there.
 */
export function eveningReflectionStemIndex(completedEveningReflections: number): 0 | 1 {
  return completedEveningReflections % 2 === 0 ? 0 : 1;
}

/**
 * Whether the weekly-reflection card is offered today (§6.5.1's "a Home
 * card on the target day"). `weekly_meta_day` is user-editable free text
 * (§7); anything that isn't a weekday name means the card never shows —
 * the deep link (`/write?origin=weekly`) still works any day.
 */
export function isWeeklyMetaDay(weeklyMetaDay: string | null | undefined, now: Date): boolean {
  if (typeof weeklyMetaDay !== 'string') return false;
  const index = WEEKDAY_NAMES.indexOf(weeklyMetaDay.trim().toLowerCase() as (typeof WEEKDAY_NAMES)[number]);
  return index >= 0 && index === now.getDay();
}

/** UTC ISO bounds `[start, end)` of `now`'s LOCAL calendar day — the window "today's morning sessions" live in (§6.2's evening reflection). */
export function utcBoundsOfLocalDay(now: Date): { start: string; end: string } {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: dayStart.toISOString(), end: nextDayStart.toISOString() };
}

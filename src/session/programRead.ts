/**
 * DB-facing compositions of the pure programme engine (`program.ts`) —
 * the one place screens get their §6.2/§6.5 reads from, so Home, write,
 * and the library all derive the SAME week from the SAME inputs. Every
 * function takes the repository (and an injectable `now`) as arguments,
 * so they're unit-testable with a stub and never open a database
 * themselves. Everything here is read-only (§13.7: the week exists only
 * at read time) — the cycle's only writes happen at reflection
 * completion, in `write.tsx` (`createReview` + the ADR-0005-sanctioned
 * `program_week_override` clear).
 */
import type { EndingRow, Repository, SessionRow, StemRow } from '@/db';
import {
  countAnchoredReflectionWeeks,
  effectiveWeek,
  eveningReflectionStemIndex,
  eventLocalDateKey,
  eventWeekMondayKey,
  deriveProgramWeek,
  isWeeklyMetaDay,
  localDateKey,
  mondayOfWeek,
  utcBoundsOfLocalDay,
} from './program';

export interface ProgrammeWeek {
  /** §6.2: 1 + distinct anchored reflection calendar weeks, capped at 30 — never stored. */
  derivedWeek: number;
  /** §7 `program_week_override` raw value (null = derive). Kept separate so callers can react to the selection itself. */
  override: number | null;
  /** What the app actually sits with: the override when usable, the derived week otherwise. */
  currentWeek: number;
}

/** Reads the §6.2 programme week: anchor + reflection weeks → derived, then the override on top. */
export function readProgrammeWeek(repo: Repository, now: Date = new Date()): ProgrammeWeek {
  const first = repo.getFirstProgrammeSitting();
  const anchorMondayKey = first ? eventWeekMondayKey(first.startedAt, first.offsetMin) : null;
  const reflectionMondayKeys = repo
    .listCompletedWeeklyReflections()
    .map((r) => eventWeekMondayKey(r.startedAt, r.offsetMin));
  const anchoredCount = countAnchoredReflectionWeeks(anchorMondayKey, reflectionMondayKeys);

  // `deriveProgramWeek` takes the anchor's local date (any day of the
  // anchor week normalizes to the same Monday downstream).
  const anchorLocalDate = first ? eventLocalDateKey(first.startedAt, first.offsetMin) : null;
  const derivedWeek = deriveProgramWeek(anchorLocalDate, anchoredCount, now);

  const override = repo.getSettings().program_week_override;
  return { derivedWeek, override, currentWeek: effectiveWeek(derivedWeek, override) };
}

/**
 * Week-set activation (issue 04): the effective week's programme stems are
 * the active ones — that week's stems active, every other programme week's
 * stems resting, user stems and the weekly meta-stem untouched (they have no
 * `week_number`). Called at every point the effective week can change:
 * setting/clearing `program_week_override` (the programme page) and
 * completing a weekly reflection (write.tsx — both the override-clear back
 * to the derived week and a derived advance; coordinator-approved hub FLAG
 * 2026-09-16). §4.1: `active` is the state column, so this is allowed state
 * mutation — no history row is ever rewritten. Idempotent by construction.
 */
export function applyWeekSetActivation(repo: Repository, now: Date = new Date()): void {
  const { currentWeek } = readProgrammeWeek(repo, now);
  repo.setProgrammeWeekActive(currentWeek);
}

/** The morning sitting's queue (§6.2): every active programme stem of the effective week, seed order. */
export function readMorningSittingQueue(repo: Repository, now: Date = new Date()): StemRow[] {
  const { currentWeek } = readProgrammeWeek(repo, now);
  return repo.getProgrammeStemsForWeek(currentWeek);
}

export interface HomeProgrammeStatus {
  week: ProgrammeWeek;
  /** Active programme stems of the effective week — the sitting's size, read at render time. */
  weekStemCount: number;
  /** Every stem of the week has a completed session today (§6.2's sitting-completion rule). */
  morningDone: boolean;
  eveningEnabled: boolean;
  /** A completed evening reflection exists today (§6.2's evening sitting). */
  eveningDone: boolean;
  /** Today is the weekly reflection's target day (§7 `weekly_meta_day`) — the weekend card shows. */
  weeklyCardToday: boolean;
  /** The current Mon–Sun week already holds a completed weekly reflection. */
  weeklyDoneThisWeek: boolean;
  /** §6.2's calm nudge: this calendar week's reflection advanced the derived week. Null = nothing to say. */
  nudge: { completedWeek: number; nextWeek: number } | null;
  /** Week 30's reflection is done (§6.2/Q2: the programme ends in a completion state; the library is the way onward). */
  programmeComplete: boolean;
}

/**
 * Everything the Home week/evening/weekly cards render, read fresh on
 * every focus (§13.7 — nothing here is stored anywhere). The nudge
 * compares the derived week with and without the current calendar week's
 * reflections: it only speaks when this week's reflection actually moved
 * the programme forward (a second reflection in the same week doesn't),
 * and the numbers it names are always derived ones.
 */
export function readHomeProgrammeStatus(repo: Repository, now: Date = new Date()): HomeProgrammeStatus {
  const settings = repo.getSettings();
  const first = repo.getFirstProgrammeSitting();
  const anchorMondayKey = first ? eventWeekMondayKey(first.startedAt, first.offsetMin) : null;
  const anchorLocalDate = first ? eventLocalDateKey(first.startedAt, first.offsetMin) : null;

  const reflectionMondayKeys = repo
    .listCompletedWeeklyReflections()
    .map((r) => eventWeekMondayKey(r.startedAt, r.offsetMin));
  const thisMondayKey = localDateKey(mondayOfWeek(now));
  const anchoredCount = countAnchoredReflectionWeeks(anchorMondayKey, reflectionMondayKeys);
  const anchoredWithoutThisWeek = countAnchoredReflectionWeeks(
    anchorMondayKey,
    reflectionMondayKeys.filter((key) => key !== thisMondayKey),
  );

  const derivedWeek = deriveProgramWeek(anchorLocalDate, anchoredCount, now);
  const derivedWithoutThisWeek = deriveProgramWeek(anchorLocalDate, anchoredWithoutThisWeek, now);
  const override = settings.program_week_override;
  const currentWeek = effectiveWeek(derivedWeek, override);

  const { start, end } = utcBoundsOfLocalDay(now);
  const weekStems = repo.getProgrammeStemsForWeek(currentWeek);
  const morningDone =
    weekStems.length > 0 && repo.countProgrammeStemsCompletedInRange(currentWeek, start, end) >= weekStems.length;

  const eveningReflections = repo.listCompletedEveningReflections();
  const eveningDone = eveningReflections.some((r) => r.startedAt >= start && r.startedAt < end);

  const nudge =
    derivedWeek > derivedWithoutThisWeek && derivedWithoutThisWeek >= 1
      ? { completedWeek: derivedWithoutThisWeek, nextWeek: derivedWeek }
      : null;

  return {
    week: {
      derivedWeek,
      override,
      currentWeek,
    },
    weekStemCount: weekStems.length,
    morningDone,
    eveningEnabled: settings.evening_practice_enabled,
    eveningDone,
    weeklyCardToday: isWeeklyMetaDay(settings.weekly_meta_day, now),
    weeklyDoneThisWeek: reflectionMondayKeys.includes(thisMondayKey),
    nudge,
    programmeComplete: currentWeek === 30 && reflectionMondayKeys.includes(thisMondayKey),
  };
}

export interface ReflectionFlowInputs {
  /** The sessions the read-only reread shows, chronological with endings. */
  reviewed: { session: SessionRow; endings: EndingRow[] }[];
  /** The reflection stem this flow writes (alternating evening stem / weekly stem). Null when the seed rows are missing. */
  metaStem: StemRow | null;
}

/**
 * The evening reflection's inputs (§6.2/§6.5.2): today's morning sessions
 * read-only, then the alternating evening meta-stem — stem A after an even
 * count of completed evening reflections, stem B after an odd one.
 */
export function readEveningReflectionInputs(repo: Repository, now: Date = new Date()): ReflectionFlowInputs {
  const { start, end } = utcBoundsOfLocalDay(now);
  const eveningMetaStems = repo.listMetaStems().filter((s) => s.origin === 'meta');
  const index = eveningReflectionStemIndex(repo.listCompletedEveningReflections().length);
  return {
    reviewed: repo.listSessionsForDayMorning(start, end),
    metaStem: eveningMetaStems[index] ?? null,
  };
}

/**
 * The weekly reflection's inputs (§6.5.1): the effective programme week's
 * sessions read-only, then the weekly meta-stem (`review_timer_seconds`,
 * `origin='review'`). Reached via the deep-link route `/write?origin=weekly`
 * (c03's notification targets it) and the Home weekend card.
 */
export function readWeeklyReflectionInputs(repo: Repository, now: Date = new Date()): ReflectionFlowInputs & { week: number } {
  const { currentWeek } = readProgrammeWeek(repo, now);
  return {
    week: currentWeek,
    reviewed: repo.listSessionsForProgrammeWeek(currentWeek),
    metaStem: repo.getWeeklyMetaStem(),
  };
}

/**
 * Whether completing a reflection for the given programme week right now
 * clears the §7 override: only when the setting currently selects that
 * same week (§6.2 — "clearing happens only on the selected week's
 * completed reflection"). A garbage override value (out of range) is
 * never equal to a real week, so it is never cleared by a completion —
 * the user clears it from the library.
 */
export function shouldClearOverride(override: number | null, reflectedWeek: number): boolean {
  return override !== null && override === reflectedWeek;
}

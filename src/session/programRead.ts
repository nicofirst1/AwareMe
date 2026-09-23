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
import type { EndingRow, LibraryStemRow, Repository, SessionRow, StemRow } from '@/db';
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
  PROGRAMME_WEEK_CAP,
  utcBoundsOfLocalDay,
} from './program';

export interface ProgrammeWeek {
  /** §6.2: 1 + distinct anchored reflection calendar weeks, capped at 30 — never stored. */
  derivedWeek: number;
  /** §7 `program_week_override` raw value (null = derive). Kept separate so callers can react to the selection itself. */
  override: number | null;
  /** What the app actually sits with: the override when usable, the derived week otherwise. */
  currentWeek: number;
  /**
   * Issue 09 hybrid unlock frontier: the highest week whose stems may be
   * active — max(override, derivedWeek, highestStoredActiveWeek among
   * provenance-'programme' rows). The one source of truth for "is week N
   * locked": the week screen greys weeks above it, and `applyWeekSetActivation`
   * unlocks to exactly it. Under D2 the funnel never writes `active = 0`, so
   * nothing auto-re-locks: the frontier only stops claiming a week when the
   * USER touches its rows out of automation's scope (the `setStemActive`
   * provenance flip), never on its own.
   */
  unlockFrontier: number;
}

/** Reads the §6.2 programme week: anchor + enabled-period reflection weeks (packet-7 D3's counting rule) → derived, then the override on top. */
export function readProgrammeWeek(repo: Repository, now: Date = new Date()): ProgrammeWeek {
  const first = repo.getFirstProgrammePractice();
  const anchorMondayKey = first ? eventWeekMondayKey(first.startedAt, first.offsetMin) : null;
  // D3 counting rule (packet-7): only reflections recorded while the
  // Programme setting was ON advance the week. Reflections recorded while
  // off stay recorded (history, export, completion states) but never
  // advance anything — the exclusion is read-time, nothing is stored.
  const reflectionMondayKeys = repo
    .listCompletedWeeklyReflections()
    .filter((r) => r.programmeOn === 1)
    .map((r) => eventWeekMondayKey(r.startedAt, r.offsetMin));
  const anchoredCount = countAnchoredReflectionWeeks(anchorMondayKey, reflectionMondayKeys);

  // `deriveProgramWeek` takes the anchor's local date (any day of the
  // anchor week normalizes to the same Monday downstream).
  const anchorLocalDate = first ? eventLocalDateKey(first.startedAt, first.offsetMin) : null;
  const derivedWeek = deriveProgramWeek(anchorLocalDate, anchoredCount, now);

  const override = repo.getSettings().program_week_override;
  // Issue 09: the unlock frontier is the same quantity the write path
  // activates to — max of the override, the derived week, and the highest
  // week with active stems (existing installs' floor; never regresses).
  const unlockFrontier = Math.max(override ?? 0, derivedWeek, repo.getHighestUnlockedWeek());
  return { derivedWeek, override, currentWeek: effectiveWeek(derivedWeek, override), unlockFrontier };
}

/**
 * Week-set activation (issue 09): the effective week's programme stems are
 * the active ones — weeks 1..effectiveUnlock active (`active = 1`), weeks
 * effectiveUnlock+1..30 resting (`active = 0`). The weekly meta-stem, user
 * stems, and non-programme stems are untouched (they have no `week_number`).
 *
 * effectiveUnlock = max(override, derivedWeek, highestActiveFromDb). This
 * ensures existing installs don't regress: if a user previously had week N
 * active (old single-week model), they keep unlock to N. Fresh logic then
 * applies: setting override unlocks 1..override; completing reflection unlocks
 * 1..newDerivedWeek. Called at every point the effective week can change:
 * setting/clearing `program_week_override` (the programme page) and
 * completing a weekly reflection (write.tsx — both the override-clear back
 * to the derived week and a derived advance).
 */
export function applyWeekSetActivation(repo: Repository, now: Date = new Date()): void {
  // Packet-7 D3: while the Programme setting is off the week-set funnel is a
  // TOTAL no-op — zero state changes, not even the provenance-untouched
  // activation half. The override and manual stem activation stay live
  // while off (they are user input, not automation).
  if (!repo.getSettings().programme) return;

  const { unlockFrontier } = readProgrammeWeek(repo, now);

  // House guard, same shape as setProgrammeWeekActive's no-op: derivedWeek
  // and the stored floor are always in range, so an out-of-range frontier
  // can only come from a corrupted raw override — refuse the write rather
  // than clamp it to the cap.
  if (!Number.isInteger(unlockFrontier) || unlockFrontier < 1 || unlockFrontier > PROGRAMME_WEEK_CAP) return;
  repo.setProgrammeWeekActive(unlockFrontier);
}

/**
 * D1's pick: an active, non-deleted, user/imported stem not tagged evening —
 * the user's own morning content. Seed rows never masquerade as picks (the
 * evening starters are seed evening content; w2-t5 draws them), untagged
 * picks land in the morning (design §8.2: an untagged pick must land
 * somewhere), and the meta-stems never join a practice draw.
 */
function isMorningPick(s: LibraryStemRow): boolean {
  return (
    s.active === 1 &&
    s.deleted_at === null &&
    (s.origin === 'user' || s.origin === 'imported') &&
    s.time_of_day !== 'evening'
  );
}

/**
 * The morning practice's queue (§6.2, packet-7 D1): the user's active picks
 * (not evening-tagged) first, then — while the Programme setting is on — the
 * active programme block of the effective week, seed order. While Programme
 * is off the queue is the picks alone and the programme week is never read
 * (D3: zero programme state). Pick order is `listAllStems`' own order (the
 * library's recency order) — the composition adds no re-sort, so start and
 * resume walk the identical queue.
 */
export function readMorningPracticeQueue(repo: Repository, now: Date = new Date()): StemRow[] {
  const picks = repo.listAllStems().filter(isMorningPick);
  if (!repo.getSettings().programme) return picks;
  const { currentWeek } = readProgrammeWeek(repo, now);
  return [...picks, ...repo.getProgrammeStemsForWeek(currentWeek)];
}

export interface HomeProgrammeStatus {
  week: ProgrammeWeek;
  /** Active programme stems of the effective week — the practice's size, read at render time. */
  weekStemCount: number;
  /** Every stem of the week has a completed session today (§6.2's practice-completion rule). */
  morningDone: boolean;
  eveningEnabled: boolean;
  /** A completed evening reflection exists today (§6.2's evening practice). */
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
  const first = repo.getFirstProgrammePractice();
  const anchorMondayKey = first ? eventWeekMondayKey(first.startedAt, first.offsetMin) : null;
  const anchorLocalDate = first ? eventLocalDateKey(first.startedAt, first.offsetMin) : null;

  const reflections = repo.listCompletedWeeklyReflections();
  // D3 counting rule (packet-7): only reflections recorded while the
  // Programme setting was on advance the week. The UNFILTERED keys keep
  // feeding the completion states below — recording continues while off,
  // and "this week's reflection is done" stays true; only ADVANCEMENT is
  // excluded (evening parity/eveningDone keep counting all completed
  // evening reflections for the same reason: alternation is content
  // scheduling, not advancement).
  const reflectionMondayKeys = reflections.map((r) => eventWeekMondayKey(r.startedAt, r.offsetMin));
  const thisMondayKey = localDateKey(mondayOfWeek(now));
  const enabledReflectionMondayKeys = reflections
    .filter((r) => r.programmeOn === 1)
    .map((r) => eventWeekMondayKey(r.startedAt, r.offsetMin));
  const anchoredCount = countAnchoredReflectionWeeks(anchorMondayKey, enabledReflectionMondayKeys);
  const anchoredWithoutThisWeek = countAnchoredReflectionWeeks(
    anchorMondayKey,
    enabledReflectionMondayKeys.filter((key) => key !== thisMondayKey),
  );

  const derivedWeek = deriveProgramWeek(anchorLocalDate, anchoredCount, now);
  const derivedWithoutThisWeek = deriveProgramWeek(anchorLocalDate, anchoredWithoutThisWeek, now);
  const override = settings.program_week_override;
  const currentWeek = effectiveWeek(derivedWeek, override);
  // Same frontier the week screen reads (issue 09): one unlock rule, shared.
  const unlockFrontier = Math.max(override ?? 0, derivedWeek, repo.getHighestUnlockedWeek());

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
      unlockFrontier,
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
    // w1-t4 granted excursion: the parity index counts modulo 2 (program.ts
    // is frozen), so after one meta-stem's deletion the slot can point past
    // a one-stem rotation — wrap it onto the survivor so the evening
    // reflection stays available every evening (degrades to the honest null
    // only when BOTH evening meta-stems are deleted).
    metaStem: eveningMetaStems[index % eveningMetaStems.length] ?? null,
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

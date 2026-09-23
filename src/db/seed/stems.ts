/**
 * Seed content (spec.md §5, as amended 2026-09-15; ADR-0005) and the
 * content-overlay seam (issue 10, 2026-09-16 owner decision: the official
 * programme text is not published with this repository).
 *
 * Four corpora:
 *
 * 1. `PROGRAMME_SEED_STEMS` — the official Sentence Completion I programme,
 *    Weeks 1–30, together with the official weekly reflection stem. This is
 *    licensed text: it lives in the owner-local, GITIGNORED module
 *    `./stems.content` (transcribed byte-for-byte from the canonical
 *    snapshot `.scratch/official-program/official-program-verbatim.txt`,
 *    used with permission from Leigh Branden to Nicolo' Brandizzi,
 *    2026-09-15) and is NEVER committed. When that module is absent (fresh
 *    clone, CI), the module resolvers serve the import below the committed
 *    `./stems.content.example`, whose original example content keeps the
 *    repo building, testing and bundling; see README, "Seed content".
 *    Stored WITHOUT the trailing terminator: the snapshot writes stems with
 *    a trailing ellipsis, which is stripped at seed time; the
 *    `stem_terminator` setting is appended at render time (spec §5.3). On
 *    an owner tree the `__tests__/programmeSeed.test.ts` anti-typo guard
 *    parses the snapshot independently and fails on any drift between the
 *    two.
 *
 * 2. `META_STEMS` — the §5.4 review meta-stems, in spec order. `META_STEMS[0]`
 *    is the official weekly reflection stem: part of the licensed programme
 *    text (it appears verbatim in the snapshot's instructions), so it comes
 *    from the content module too. `META_STEMS[1..2]` are the app's original
 *    evening reflection stems. `META_STEMS[0]` is seeded ONCE with
 *    `is_weekly_meta = 1` (ADR-0005 decision 6 — no second copy).
 *
 * 3. `RETIRED_SEED_STEMS` — the 26 v1 originals (former spec §5.3), retired
 *    by the 2026-09-15 amendment: fresh installs seed them soft-deleted
 *    (`deleted_at` set, `active = 0`) so exports keep the provenance, but
 *    they are never active and never shown in the library. Text, categories
 *    and time-of-day tags are kept verbatim from v1. App-original text —
 *    committed.
 *
 * 4. `EVENING_PRACTICE_SEED_STEMS` — the evening practice starter set
 *    (issue 17, 2026-09-18 owner decision): seven app-original practice
 *    stems for the evening surface, seeded active and evening-tagged.
 *    App-original text — committed.
 *
 * The retired "general" pair still have no `category`: spec §5.2 defines
 * exactly six categories and "general" isn't one of them (docs/DECISIONS.md).
 */
/**
 * The seed content module (issue 10; resolution reworked by issue 23):
 * statically imported. The owner-local licensed corpus when present,
 * otherwise the committed example — decided at MODULE RESOLUTION time,
 * never at runtime. Every tool that resolves this import applies the same
 * rule (owner module if it exists, else the example):
 *
 * - Metro (app bundles): `metro.config.js` redirects `./stems.content` to
 *   `./stems.content.example` while the private file is absent.
 * - Jest (test runs): `jest.resolver.js` applies the same rule.
 * - TypeScript: `stems.content.d.ts` types the import where the private
 *   file is absent; an owner tree's real `.ts` shadows the declaration.
 *
 * Because the import is static, a tree where neither module resolves fails
 * the build loudly instead of crashing at launch (issue 23: the old
 * runtime require's fallback guard never matched what Metro's bundling
 * actually raises — the dead guard turned every fresh-clone APK into a
 * launch crash). The loaded shape is validated by the programmeSeed suite,
 * which also proves byte-fidelity against the snapshot on owner trees.
 */
import { CONTENT } from './stems.content';

export type StemCategory = 'awareness' | 'self_acceptance' | 'responsibility' | 'assertiveness' | 'purpose' | 'integrity';

/** Morning/evening pivot (migration 0003): which fixed daily notification a stem belongs to. The weekly meta-stem carries `null`; the two evening reflection meta-stems carry `evening` (issue 06) so the library's Evening filter matches them — either way, never surfaced by a practice draw. */
export type TimeOfDay = 'morning' | 'evening';

/** One official programme stem: its Week 1–30 block and its byte-exact text (no trailing terminator). Categories are NOT stored on the entries — they resolve through `programmeStemCategory` below, so this array stays byte-identical to the snapshot transcription. */
export interface ProgrammeSeedStem {
  weekNumber: number;
  text: string;
}

/** A retired v1 original (spec §5.3, struck 2026-09-15): seeded soft-deleted. */
export interface RetiredSeedStem {
  text: string;
  category: StemCategory | null;
  timeOfDay: TimeOfDay | null;
}

/**
 * The official Sentence Completion I programme, Weeks 1–30, in snapshot
 * order (which is also seed order — the order practice present them).
 * DO NOT hand-edit: see the file header.
 */
export const PROGRAMME_SEED_STEMS: readonly ProgrammeSeedStem[] = CONTENT.programmeStems;

/** The two non-weekly review meta-stems — the evening reflection practice's deterministic pair (§6.2, ADR-0005). App-original text. */
export const EVENING_META_STEMS: readonly string[] = [
  'Reading these back, the thing I notice myself circling is',
  'If I take these endings seriously rather than dismissing them',
] as const;

/** The official weekly reflection stem (§5.4 #1, ADR-0005): seeded once with `is_weekly_meta = 1`. Licensed text — see the file header. */
export const WEEKLY_META_STEM: string = CONTENT.weeklyMetaStem;

/** The three §5.4 meta-stems, in spec order; `[0]` is the official weekly reflection stem. */
export const META_STEMS: readonly string[] = [WEEKLY_META_STEM, ...EVENING_META_STEMS] as const;

/**
 * Week→pillar mapping (issue 04, 2026-09-16 owner feedback): each of the
 * 30 programme weeks exercises one of §5.2's six categories, derived from
 * the stem texts and ADR-0005's structure — Weeks 1–3 living consciously
 * (awareness), 4–9 self-acceptance, 10–12 self-responsibility, 13–14
 * self-assertiveness, 15–16 living purposefully, 17–18 personal integrity,
 * 19–26 the child/teenage-self acceptance block, 27–28 conscious awareness
 * of the parental inheritance, 29 psychological separation
 * (self-assertiveness), 30 the synthesis (one stem per pillar, resolved
 * per stem via the exceptions below). The full table is recorded in issue
 * 04's Comments. Travels with the text in the content module (issue 10);
 * the example module carries the corresponding table for its weeks.
 *
 * Fresh-install seeding applies it (`seedIfEmpty`); migration 0005 carries
 * a frozen copy for upgrading installs, pinned to this mapping by
 * `__tests__/migrate.test.ts` so the two cannot drift.
 */
export const PROGRAMME_WEEK_CATEGORY: Readonly<Record<number, StemCategory>> = CONTENT.weekCategory;

/**
 * Per-stem exceptions to the week mapping: programme stems whose text
 * exercises a pillar other than their week's. Keyed by the exact seed text
 * (byte-for-byte, same discipline as the array above — the anti-typo guard
 * in `__tests__/programmeSeed.test.ts` keeps these honest too, since a
 * drift here would silently miss the exception). Lives in the content
 * module beside the text it keys on (issue 10); the example module ships a
 * deliberately excepted stem so the override mechanism stays covered on
 * example content.
 *
 * Real-corpus exceptions (owner trees): Week 1's explicit responsibility
 * stem, inside the awareness opener; the pure awareness stem that recurs
 * verbatim in Weeks 11 and 23, planted inside the responsibility and
 * self-acceptance blocks; Week 16's responsibility stem, inside the purpose
 * block; all seven Week 30 stems — the synthesis week names each pillar
 * once, so the week default above is only its fallback.
 */

/**
 * A programme stem's category (issue 04): its week's pillar, overridden by
 * the per-stem exceptions above. `null` only for a week outside the
 * corpus's range, which the seed corpus never contains (pinned by the
 * anti-typo guard); callers store the value as-is — `stems.category` is
 * nullable (spec §4.2).
 */
export function programmeStemCategory(weekNumber: number, text: string): StemCategory | null {
  return CONTENT.stemCategoryExceptions[text] ?? CONTENT.weekCategory[weekNumber] ?? null;
}

/**
 * The 26 v1 originals, retired 2026-09-15 (spec §5.3 as amended, ADR-0005).
 * Seeded soft-deleted on fresh installs; untouched on installs that predate
 * the amendment (append-only, spec §4.1). Verbatim v1 text — app-original,
 * committed (issue 10 keeps only licensed text out of the repository).
 */
export const RETIRED_SEED_STEMS: readonly RetiredSeedStem[] = [
  { text: 'If I brought five percent more awareness to how I spend my mornings', category: 'awareness', timeOfDay: 'morning' },
  { text: 'Something I keep not noticing about my own behaviour is', category: 'awareness', timeOfDay: 'morning' },
  { text: 'The thing I avoid thinking about when I make myself busy is', category: 'awareness', timeOfDay: 'evening' },
  { text: 'If I were willing to see what is actually in front of me', category: 'awareness', timeOfDay: 'morning' },
  { text: 'The part of myself I find hardest to sit with is', category: 'self_acceptance', timeOfDay: 'evening' },
  { text: 'If I stopped arguing with the fact that I feel this way', category: 'self_acceptance', timeOfDay: 'evening' },
  { text: 'When I judge myself harshly, what I am actually afraid of is', category: 'self_acceptance', timeOfDay: 'evening' },
  { text: 'If I brought more kindness to the way I speak to myself', category: 'self_acceptance', timeOfDay: 'evening' },
  { text: 'If I took full responsibility for how today goes', category: 'responsibility', timeOfDay: 'morning' },
  { text: 'Something I have been waiting for someone else to fix is', category: 'responsibility', timeOfDay: 'evening' },
  { text: 'The cost of continuing to wait is', category: 'responsibility', timeOfDay: 'evening' },
  { text: 'What I get out of staying stuck is', category: 'responsibility', timeOfDay: 'evening' },
  { text: 'If I said the thing I have not been saying', category: 'assertiveness', timeOfDay: 'morning' },
  { text: 'What I want that I have not asked for is', category: 'assertiveness', timeOfDay: 'morning' },
  { text: "If my preferences mattered as much as everyone else's", category: 'assertiveness', timeOfDay: 'morning' },
  { text: 'The conversation I keep rehearsing but never having is', category: 'assertiveness', timeOfDay: 'evening' },
  { text: 'If I were honest about what I want from the next five years', category: 'purpose', timeOfDay: 'morning' },
  { text: 'The goal I keep restating instead of starting is', category: 'purpose', timeOfDay: 'morning' },
  { text: 'If I gave the work that matters the hours it actually needs', category: 'purpose', timeOfDay: 'morning' },
  { text: 'If I let myself rest without earning it first', category: 'purpose', timeOfDay: 'evening' },
  { text: 'A promise I made to myself and quietly dropped is', category: 'integrity', timeOfDay: 'evening' },
  { text: 'If I lived by what I say I believe', category: 'integrity', timeOfDay: 'morning' },
  { text: 'The small dishonesty I keep repeating is', category: 'integrity', timeOfDay: 'evening' },
  { text: 'If I were five percent braver this week', category: 'integrity', timeOfDay: 'morning' },
  { text: 'Something the people closest to me would say about me that I resist is', category: null, timeOfDay: 'evening' },
  { text: 'If I am not as stuck as I tell myself I am', category: null, timeOfDay: 'morning' },
] as const;

/**
 * An evening practice starter-set stem: its text and its §5.2 category
 * (the retired corpus's convention — the categories are not derivable, so
 * they travel on the entry).
 */
export interface EveningPracticeSeedStem {
  text: string;
  category: StemCategory;
}

/**
 * The evening practice starter set (issue 17, 2026-09-18 owner decision):
 * seven app-original evening practice stems. A STARTER SET of placeholder
 * content — original text written for the app, never programme or Branden
 * text, never transcribed from any source (spec §5.1); the owner decision
 * sanctions this set against §5.1's "no new stems" line and may replace or
 * grow it in a later round. Seeded ACTIVE and `time_of_day = 'evening'` so
 * the library's Evening filter and the evening practice surface real
 * content; `week_number = NULL` keeps the rows outside the programme, so
 * week-set activation never touches them; `origin = 'seed'`, since they
 * are seed-authored app content. Fresh installs only: `seedIfEmpty` never
 * re-runs, so installs that predate this set are untouched (append-only,
 * §4.1) — the same precedence the retirement above set.
 */
export const EVENING_PRACTICE_SEED_STEMS: readonly EveningPracticeSeedStem[] = [
  { text: 'If I take one honest look at the day I actually had', category: 'awareness' },
  { text: 'If I end the day on speaking terms with myself', category: 'self_acceptance' },
  { text: 'If I take my share of today, and only my share', category: 'responsibility' },
  { text: 'The thing I wanted to say today and kept back is', category: 'assertiveness' },
  { text: 'If the first hour of tomorrow goes to what matters most', category: 'purpose' },
  { text: 'Where my words and my actions parted ways today is', category: 'integrity' },
  { text: 'If I set down the unfinished parts of today until morning', category: 'self_acceptance' },
] as const;

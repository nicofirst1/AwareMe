/**
 * Example seed content — the committed stand-in for the owner-local
 * `stems.content.ts` (gitignored), which alone holds the official Sentence
 * Completion I programme text (spec §5.1, used with permission; NOT
 * distributed with this repository).
 *
 * On a fresh clone the resolvers (metro.config.js, jest.resolver.js — see
 * `stems.ts`) serve the seed's content import from THIS module, so the repo
 * builds, tests and bundles without the licensed text. The owner's real
 * module has the same shape — one `CONTENT` export fulfilling the
 * `SeedContent` interface below — and is validated by
 * `__tests__/programmeSeed.test.ts` byte-for-byte against the canonical
 * snapshot whenever both are on disk.
 *
 * Everything below is ORIGINAL text written in the app's spirit — never
 * Branden text (spec §5.1). The example corpus spans six weeks chosen so
 * the week→pillar mapping (issue 04, which this module mirrors for its
 * weeks — migration 0005's frozen copy pins the same values) exercises all
 * six §5.2 categories: Weeks 1, 4, 10, 13, 15, 17, two stems each. Its
 * exceptions table is empty: a per-stem exception whose resolution differs
 * from the week default would disagree with the frozen migration copy, so
 * the override mechanism is pinned against the real corpus in owner mode
 * instead. Stored WITHOUT the trailing terminator (spec §5.3).
 */
import type { ProgrammeSeedStem, StemCategory } from './stems';

/** The contract every seed-content module (owner-local or example) fulfils. */
export interface SeedContent {
  /** The programme corpus in seed order: `{ weekNumber, text }`, text without the trailing terminator. */
  programmeStems: readonly ProgrammeSeedStem[];
  /** The weekly reflection stem: seeded once with `is_weekly_meta = 1` (ADR-0005 decision 6). */
  weeklyMetaStem: string;
  /** Week→pillar mapping (issue 04): every corpus week has an entry. */
  weekCategory: Readonly<Record<number, StemCategory>>;
  /** Per-stem exceptions to the week mapping, keyed by exact corpus text (issue 04). */
  stemCategoryExceptions: Readonly<Record<string, StemCategory>>;
}

/**
 * The example corpus, under the same `CONTENT` export name the owner-local
 * module uses — the two are interchangeable from the loader's point of
 * view (stems.ts); which one serves an import is decided by the resolvers.
 */
export const CONTENT: SeedContent = {
  programmeStems: [
    // Week 1 — awareness
    { weekNumber: 1, text: 'If I notice where my attention actually goes today' },
    { weekNumber: 1, text: 'If I catch myself running on autopilot and step back into the moment' },
    // Week 4 — self-acceptance
    { weekNumber: 4, text: 'If I let an uncomfortable feeling be there without arguing with it' },
    { weekNumber: 4, text: 'If I treat my mistakes as information rather than verdicts' },
    // Week 10 — responsibility
    { weekNumber: 10, text: 'If I own my part in how today goes' },
    { weekNumber: 10, text: 'If I take the next small step instead of waiting to feel ready' },
    // Week 13 — assertiveness
    { weekNumber: 13, text: 'If I say the true thing plainly and kindly' },
    { weekNumber: 13, text: 'If I ask directly for what I need instead of hinting' },
    // Week 15 — purpose
    { weekNumber: 15, text: 'If I name the one outcome that would make today count' },
    { weekNumber: 15, text: 'If I move my hardest task to the front of the day' },
    // Week 17 — integrity
    { weekNumber: 17, text: 'If I act today as the person I claim to be' },
    { weekNumber: 17, text: 'If I close the gap between what I say and what I do' },
  ],
  weeklyMetaStem: 'Rereading the endings I wrote this week, what I notice is',
  weekCategory: {
    1: 'awareness',
    4: 'self_acceptance',
    10: 'responsibility',
    13: 'assertiveness',
    15: 'purpose',
    17: 'integrity',
  },
  stemCategoryExceptions: {},
};

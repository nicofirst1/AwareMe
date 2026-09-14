/**
 * Seed stems and meta-stems, verbatim from spec.md §5.3–5.4. Original text
 * written for this app, not copied from any Branden source (§5.1) — do not
 * add to this list from training data or the web.
 *
 * Stored WITHOUT the trailing terminator; the terminator (`stem_terminator`
 * setting) is appended at render time (§5.3).
 *
 * The two stems under spec's "general" heading have no `category`: §5.2
 * defines exactly six categories and "general" isn't one of them, so these
 * are seeded with `category = null` rather than invented into a seventh
 * bucket or shoehorned into one of the six. See DECISIONS.md.
 */
export type StemCategory = 'awareness' | 'self_acceptance' | 'responsibility' | 'assertiveness' | 'purpose' | 'integrity';

/** Morning/evening pivot (migration 0003): which fixed daily notification a stem belongs to. Meta-stems (§5.4) carry `null` — never surfaced by the daily notification draw. */
export type TimeOfDay = 'morning' | 'evening';

export interface SeedStem {
  text: string;
  category: StemCategory | null;
  timeOfDay: TimeOfDay | null;
}

export const SEED_STEMS: readonly SeedStem[] = [
  // awareness
  { text: 'If I brought five percent more awareness to how I spend my mornings', category: 'awareness', timeOfDay: 'morning' },
  { text: 'Something I keep not noticing about my own behaviour is', category: 'awareness', timeOfDay: 'morning' },
  { text: 'The thing I avoid thinking about when I make myself busy is', category: 'awareness', timeOfDay: 'evening' },
  { text: 'If I were willing to see what is actually in front of me', category: 'awareness', timeOfDay: 'morning' },

  // self_acceptance
  { text: 'The part of myself I find hardest to sit with is', category: 'self_acceptance', timeOfDay: 'evening' },
  { text: 'If I stopped arguing with the fact that I feel this way', category: 'self_acceptance', timeOfDay: 'evening' },
  { text: 'When I judge myself harshly, what I am actually afraid of is', category: 'self_acceptance', timeOfDay: 'evening' },
  { text: 'If I brought more kindness to the way I speak to myself', category: 'self_acceptance', timeOfDay: 'evening' },

  // responsibility
  { text: 'If I took full responsibility for how today goes', category: 'responsibility', timeOfDay: 'morning' },
  { text: 'Something I have been waiting for someone else to fix is', category: 'responsibility', timeOfDay: 'evening' },
  { text: 'The cost of continuing to wait is', category: 'responsibility', timeOfDay: 'evening' },
  { text: 'What I get out of staying stuck is', category: 'responsibility', timeOfDay: 'evening' },

  // assertiveness
  { text: 'If I said the thing I have not been saying', category: 'assertiveness', timeOfDay: 'morning' },
  { text: 'What I want that I have not asked for is', category: 'assertiveness', timeOfDay: 'morning' },
  { text: "If my preferences mattered as much as everyone else's", category: 'assertiveness', timeOfDay: 'morning' },
  { text: 'The conversation I keep rehearsing but never having is', category: 'assertiveness', timeOfDay: 'evening' },

  // purpose
  { text: 'If I were honest about what I want from the next five years', category: 'purpose', timeOfDay: 'morning' },
  { text: 'The goal I keep restating instead of starting is', category: 'purpose', timeOfDay: 'morning' },
  { text: 'If I gave the work that matters the hours it actually needs', category: 'purpose', timeOfDay: 'morning' },
  { text: 'If I let myself rest without earning it first', category: 'purpose', timeOfDay: 'evening' },

  // integrity
  { text: 'A promise I made to myself and quietly dropped is', category: 'integrity', timeOfDay: 'evening' },
  { text: 'If I lived by what I say I believe', category: 'integrity', timeOfDay: 'morning' },
  { text: 'The small dishonesty I keep repeating is', category: 'integrity', timeOfDay: 'evening' },
  { text: 'If I were five percent braver this week', category: 'integrity', timeOfDay: 'morning' },

  // general (spec §5.3) — no category; see file header
  { text: 'Something the people closest to me would say about me that I resist is', category: null, timeOfDay: 'evening' },
  { text: 'If I am not as stuck as I tell myself I am', category: null, timeOfDay: 'morning' },
] as const;

/** Meta-stems used only in review mode (spec §5.4, §6.5). */
export const META_STEMS: readonly string[] = [
  'If any of what I wrote this week is true, it might be helpful if I',
  'Reading these back, the thing I notice myself circling is',
  'If I take these endings seriously rather than dismissing them',
] as const;

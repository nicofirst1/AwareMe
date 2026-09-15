/**
 * Seed content (spec.md §5, as amended 2026-09-15; ADR-0005).
 *
 * Three corpora:
 *
 * 1. `PROGRAMME_SEED_STEMS` — the official Sentence Completion I programme,
 *    Weeks 1–30, transcribed byte-for-byte from the canonical snapshot
 *    `.scratch/official-program/official-program-verbatim.txt` (used with
 *    permission from Leigh Branden to Nicolo' Brandizzi, 2026-09-15).
 *    NEVER edit these strings by hand — regenerate from the snapshot if it
 *    ever changes; `__tests__/programmeSeed.test.ts` parses the snapshot
 *    independently and fails on any drift (the anti-typo guard). Stored
 *    WITHOUT the trailing terminator: the snapshot writes stems with a
 *    trailing ellipsis, which is stripped here; the `stem_terminator`
 *    setting is appended at render time (spec §5.3).
 *
 * 2. `META_STEMS` — the §5.4 review meta-stems, in spec order. `META_STEMS[0]`
 *    is the official weekly reflection stem: seeded ONCE with
 *    `is_weekly_meta = 1` (ADR-0005 decision 6 — no second copy).
 *
 * 3. `RETIRED_SEED_STEMS` — the 26 v1 originals (former spec §5.3), retired
 *    by the 2026-09-15 amendment: fresh installs seed them soft-deleted
 *    (`deleted_at` set, `active = 0`) so exports keep the provenance, but
 *    they are never active and never shown in the library. Text, categories
 *    and time-of-day tags are kept verbatim from v1.
 *
 * The retired "general" pair still have no `category`: spec §5.2 defines
 * exactly six categories and "general" isn't one of them (DECISIONS.md).
 */
export type StemCategory = 'awareness' | 'self_acceptance' | 'responsibility' | 'assertiveness' | 'purpose' | 'integrity';

/** Morning/evening pivot (migration 0003): which fixed daily notification a stem belongs to. Meta-stems (§5.4) carry `null` — never surfaced by a sitting draw. */
export type TimeOfDay = 'morning' | 'evening';

/** One official programme stem: its Week 1–30 block and its byte-exact text (no trailing terminator). */
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
 * order (which is also seed order — the order sittings present them).
 * DO NOT hand-edit: see the file header.
 */
export const PROGRAMME_SEED_STEMS: readonly ProgrammeSeedStem[] = [
  // Week 1
  { weekNumber: 1, text: 'If I bring more awareness to my life today' },
  { weekNumber: 1, text: 'If I take more responsibility for my choices and actions today' },
  { weekNumber: 1, text: 'If pay more attention to how I deal with people today' },
  { weekNumber: 1, text: 'If I boost my energy level by 5 percent today' },
  // Week 2
  { weekNumber: 2, text: 'If I bring 5 percent more awareness to my important relationships' },
  { weekNumber: 2, text: 'If I bring 5 percent more awareness to my insecurities' },
  { weekNumber: 2, text: 'If I bring 5 percent more awareness to my deepest needs and wants' },
  { weekNumber: 2, text: 'If I bring 5 percent more awareness to my emotions' },
  // Week 3
  { weekNumber: 3, text: 'If I treat listening as a creative act' },
  { weekNumber: 3, text: 'If I notice how people are affected by the quality of my listening' },
  { weekNumber: 3, text: 'If I bring more awareness to my dealings with people today' },
  { weekNumber: 3, text: 'If I commit to dealing with people fairly and benevolently' },
  // Week 4
  { weekNumber: 4, text: 'If I bring a higher level of self-esteem to my activities today' },
  { weekNumber: 4, text: 'If I bring a higher level of self-esteem to my dealings with people today' },
  { weekNumber: 4, text: 'If I am 5 percent more self-accepting today' },
  { weekNumber: 4, text: 'If I am self-accepting even when I make mistakes' },
  { weekNumber: 4, text: 'If I am self-accepting even when I feel confused and overwhelmed' },
  // Week 5
  { weekNumber: 5, text: 'If I am more accepting of my body' },
  { weekNumber: 5, text: 'If I deny and disown my body' },
  { weekNumber: 5, text: 'If I deny or disown my conflicts' },
  { weekNumber: 5, text: 'If I am more accepting of all the parts of me' },
  // Week 6
  { weekNumber: 6, text: 'If I wanted to raise my self-esteem today, I could' },
  { weekNumber: 6, text: 'If I am more accepting of my feelings' },
  { weekNumber: 6, text: 'If I deny and disown my feelings' },
  { weekNumber: 6, text: 'If I am more accepting of my thoughts' },
  { weekNumber: 6, text: 'If I deny and disown my thoughts' },
  // Week 7
  { weekNumber: 7, text: 'If I am more accepting of my fears' },
  { weekNumber: 7, text: 'If I deny and disown my fears' },
  { weekNumber: 7, text: 'If I were more accepting of my pain' },
  { weekNumber: 7, text: 'If I deny and disown my pain' },
  // Week 8
  { weekNumber: 8, text: 'If I am more accepting of my anger' },
  { weekNumber: 8, text: 'If I deny and disown my anger' },
  { weekNumber: 8, text: 'If I am more accepting of my sexuality' },
  { weekNumber: 8, text: 'If I deny and disown my sexuality' },
  // Week 9
  { weekNumber: 9, text: 'If I am more accepting of my excitement' },
  { weekNumber: 9, text: 'If I deny and disown my excitement' },
  { weekNumber: 9, text: 'If I am more accepting of my intelligence' },
  { weekNumber: 9, text: 'If I deny and disown my intelligence' },
  // Week 10
  { weekNumber: 10, text: 'Self-responsibility means' },
  { weekNumber: 10, text: 'If I take 5 percent more responsibility for my life and well-being' },
  { weekNumber: 10, text: 'If I avoid responsibility for my life and well-being' },
  { weekNumber: 10, text: 'If I take 5 percent more responsibility for the attainment of my goals' },
  { weekNumber: 10, text: 'If I avoid responsibility for the attainment of my goals' },
  // Week 11
  { weekNumber: 11, text: 'If I take 5 percent more responsibility for the success of my relationships' },
  { weekNumber: 11, text: 'Sometimes I keep myself passive when I' },
  { weekNumber: 11, text: 'Sometimes I make myself helpless when I' },
  { weekNumber: 11, text: 'I am becoming aware' },
  // Week 12
  { weekNumber: 12, text: 'If I take 5 percent more responsibility for my standard of living' },
  { weekNumber: 12, text: 'If I take 5 percent more responsibility for my choice of companions' },
  { weekNumber: 12, text: 'If I take 5 percent more responsibility for my personal happiness' },
  { weekNumber: 12, text: 'If I take 5 percent more responsibility for the level of my self-esteem' },
  // Week 13
  { weekNumber: 13, text: 'Self-assertiveness means' },
  { weekNumber: 13, text: 'If I lived 5 percent more assertively today' },
  { weekNumber: 13, text: 'If I treat my thoughts and feelings with respect today' },
  { weekNumber: 13, text: 'If I treat my wants with respect today' },
  // Week 14
  { weekNumber: 14, text: 'If, when I was young, someone had told me my wants really mattered' },
  { weekNumber: 14, text: 'If, when I was young, I had been taught to honor my own life' },
  { weekNumber: 14, text: 'If I treat my life as unimportant' },
  { weekNumber: 14, text: 'If I were willing to say yes when I want to say yes and no when I want to say no' },
  { weekNumber: 14, text: 'If I were willing to let people hear the music inside me' },
  { weekNumber: 14, text: 'If I were to express 5 percent more of who I am' },
  // Week 15
  { weekNumber: 15, text: 'Living purposefully to me means' },
  { weekNumber: 15, text: 'If I bring 5 percent more purposefulness into my life' },
  { weekNumber: 15, text: 'If I operate 5 percent more purposefully at work' },
  { weekNumber: 15, text: 'If I operate 5 percent more purposefully in my relationships' },
  { weekNumber: 15, text: 'If I operate 5 percent more purposefully in marriage' },
  // Week 16
  { weekNumber: 16, text: 'If I operate 5 percent more purposefully with my children' },
  { weekNumber: 16, text: 'If I were 5 percent more purposeful about my deepest yearnings' },
  { weekNumber: 16, text: 'If I take more responsibility for fulfilling my wants' },
  { weekNumber: 16, text: 'If I make my happiness a conscious goal' },
  // Week 17
  { weekNumber: 17, text: 'Integrity means' },
  { weekNumber: 17, text: 'If I look at instances in which I find full integrity difficult' },
  { weekNumber: 17, text: 'If I bring 5 percent more integrity into my life' },
  { weekNumber: 17, text: 'If I bring 5 percent more integrity to my work' },
  // Week 18
  { weekNumber: 18, text: 'If I bring 5 percent more integrity to my relationship' },
  { weekNumber: 18, text: 'If I remain loyal to the values I believe are right' },
  { weekNumber: 18, text: 'If I refuse to live by values I do not respect' },
  { weekNumber: 18, text: 'If I treat my self-respect as a high priority' },
  // Week 19
  { weekNumber: 19, text: 'If the child in me could speak, he/she would say' },
  { weekNumber: 19, text: 'If the teenager I once was still exists inside of me' },
  { weekNumber: 19, text: 'If my teenage self could speak, he/she would say' },
  { weekNumber: 19, text: 'At the thought of reaching back to help my child self' },
  { weekNumber: 19, text: 'At the thought of reaching back to help my teenage self' },
  { weekNumber: 19, text: 'If I could make friends with my younger selves' },
  // Week 20
  { weekNumber: 20, text: 'If my child self felt accepted by me' },
  { weekNumber: 20, text: 'If my teenage self felt I was on his/her side' },
  { weekNumber: 20, text: 'If my younger selves felt I had compassion for their struggles' },
  { weekNumber: 20, text: 'If I could hold my child self in my arms' },
  { weekNumber: 20, text: 'If I could hold my teenage self in my arms' },
  { weekNumber: 20, text: 'If I had the courage and compassion to embrace and love my younger selves' },
  // Week 21
  { weekNumber: 21, text: 'Sometimes my child self feels rejected by me when I' },
  { weekNumber: 21, text: 'Sometimes my teenage self feel rejected by me when I' },
  { weekNumber: 21, text: 'One of the things my child self needs from me and rarely gets' },
  { weekNumber: 21, text: 'One of the things my teenage self needs from me and has not received is' },
  { weekNumber: 21, text: 'One of the ways my child self gets back at me for rejecting him/her is' },
  { weekNumber: 21, text: 'One of the ways my teenage self gets back at me for rejecting him/her is' },
  // Week 22
  { weekNumber: 22, text: 'At the thought of giving my child self what he/she needs from me' },
  { weekNumber: 22, text: 'At the thought of giving my teenage self what he/she needs from me' },
  { weekNumber: 22, text: 'If my child self and I were to fall in love' },
  { weekNumber: 22, text: 'If my teenage self and I were to fall in love' },
  // Week 23
  { weekNumber: 23, text: 'If I accept that my child self may need time to learn to trust me' },
  { weekNumber: 23, text: 'If I accept that my teenage self may need time to learn to trust me' },
  { weekNumber: 23, text: 'As I come to understand that my child self and my teenage self are both part of me' },
  { weekNumber: 23, text: 'I am becoming aware' },
  // Week 24
  { weekNumber: 24, text: 'Sometimes when I am afraid, I' },
  { weekNumber: 24, text: 'Sometimes when I am hurt, I' },
  { weekNumber: 24, text: 'Sometimes when I am angry, I' },
  { weekNumber: 24, text: 'An effective way to handle fear might be to' },
  { weekNumber: 24, text: 'An effective way to handle hurt might be to' },
  { weekNumber: 24, text: 'An effective way to handle anger might be to' },
  // Week 25
  { weekNumber: 25, text: 'Sometimes when I am excited, I' },
  { weekNumber: 25, text: 'Sometimes when I am aroused sexually, I' },
  { weekNumber: 25, text: 'Sometimes when I experience strong feelings, I' },
  { weekNumber: 25, text: 'If I make friends with my excitement' },
  { weekNumber: 25, text: 'If I make friends with my sexuality' },
  { weekNumber: 25, text: 'As I grow more comfortable with the full range of my emotions' },
  // Week 26
  { weekNumber: 26, text: 'If I think about becoming better friends with my child self' },
  { weekNumber: 26, text: 'If I think about becoming better friends with my teenage self' },
  { weekNumber: 26, text: 'As my younger selves become more comfortable with me' },
  { weekNumber: 26, text: 'As I create a safe space for my child self' },
  { weekNumber: 26, text: 'As I create a safe space for my teenage self' },
  // Week 27
  { weekNumber: 27, text: 'Mother gave me a view of myself as' },
  { weekNumber: 27, text: 'Father gave me a view of myself as' },
  { weekNumber: 27, text: 'Mother speaks through my voice when I tell myself' },
  { weekNumber: 27, text: 'Father speaks through my voice when I tell myself' },
  // Week 28
  { weekNumber: 28, text: 'If I bring 5 percent more awareness to my relationship with my mother' },
  { weekNumber: 28, text: 'If I bring 5 percent more awareness to my relationship with my father' },
  { weekNumber: 28, text: 'If I look at my mother and father realistically' },
  { weekNumber: 28, text: 'If I reflect on the level of awareness I bring to my relationship with my mother' },
  { weekNumber: 28, text: 'If I reflect on the level of awareness I bring to my relationship with my father' },
  // Week 29
  { weekNumber: 29, text: 'At the thought of being free of Mother psychologically' },
  { weekNumber: 29, text: 'At the thought of being free of Father psychologically' },
  { weekNumber: 29, text: 'At the thought of belonging fully to myself' },
  { weekNumber: 29, text: 'If my life really does belong to me' },
  { weekNumber: 29, text: 'If I really am capable of independent survival' },
  // Week 30
  { weekNumber: 30, text: 'If I bring 5 percent more awareness to my life' },
  { weekNumber: 30, text: 'If I am 5 percent more self-accepting' },
  { weekNumber: 30, text: 'If I bring 5 percent more self-responsibility to my life' },
  { weekNumber: 30, text: 'If I operate 5 percent more self-assertively' },
  { weekNumber: 30, text: 'If I live my life 5 percent more purposefully' },
  { weekNumber: 30, text: 'If I bring 5 percent more integrity to my life' },
  { weekNumber: 30, text: 'If I breathe deeply and allow myself to experience what self-esteem feels like' },
] as const;

/** The three §5.4 meta-stems, in spec order; `[0]` is the official weekly reflection stem. */
export const META_STEMS: readonly string[] = [
  'If any of what I wrote this week is true, it might be helpful if I',
  'Reading these back, the thing I notice myself circling is',
  'If I take these endings seriously rather than dismissing them',
] as const;

/** The official weekly reflection stem (§5.4 #1, ADR-0005): seeded once with `is_weekly_meta = 1`. */
export const WEEKLY_META_STEM: string = META_STEMS[0];

/** The two non-weekly review meta-stems — the evening reflection sitting's deterministic pair (§6.2, ADR-0005). */
export const EVENING_META_STEMS: readonly string[] = META_STEMS.slice(1);

/**
 * The 26 v1 originals, retired 2026-09-15 (spec §5.3 as amended, ADR-0005).
 * Seeded soft-deleted on fresh installs; untouched on installs that predate
 * the amendment (append-only, spec §4.1). Verbatim v1 text.
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

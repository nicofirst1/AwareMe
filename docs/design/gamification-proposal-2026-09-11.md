# Gamification design proposal — 2026-09-11

Status: signed off and shipped. Reversed spec §13.4/§13.6's no-gamification rule per the 2026-09-11 owner decision; spec text amended the same day, cycles 1–3 landed (see `.scratch/legacy/v1.1-feedback/issues/14`–`17`). Body below kept unchanged as the design record.

Scope discipline: this proposal stays inside what's genuinely achievable from data the app already/inevitably has. No points, no levels, no leaderboards (still explicitly out of scope, §2 — gamification ≠ social features), no artificial scarcity, no push-to-return copy. "Badges and stuff" is read as: acknowledge real writing history at the one moment it's earned, quietly.

## 1. Mechanics

Three mechanics, all read-only at render time, all triggered at or after session end — never during writing (uncensored mode's integrity is non-negotiable, see Constraints).

**A. Session-completion celebration.** The existing `session.phase === 'done'` screen (write.tsx:228–243, currently "Saved." + a duration line) gets a single peak moment: a brief, calm animation (not confetti, not a burst — a soft scale+fade "settle" on the confirmation, ~400ms) plus, _only when a badge newly unlocks_, one badge reveal beneath it. No animation at all on ordinary completions — the peak-end rule says pick one peak, not decorate every screen. This is the peak.

**B. Milestone badges.** Discrete, descriptive achievements, computed from history at read time (see §4). Shown: (a) newly-earned, on the completion screen, once, the moment they cross the threshold; (b) as a static grid on a new "Progress" tab/section, browsable any time, never pushed at the user.

**C. Progress visualization (Home + Progress screen).** Home's existing status block (index.tsx:97–112, "N sessions this week") gains one more descriptive line when relevant — a session-count streak, unemphasised, same treatment as the existing review-available link. A new Progress screen holds the badge grid plus simple counts (total sessions, total endings, distinct stems used, longest streak) — a quiet stats page, not a dashboard with charts fighting for attention.

No mechanic touches the writing screen's active phase. No mechanic fires on missed days (§6.4's "no consequence" survives the reversal — it was never really about gamification, it's about not shaming absence, and the owner didn't ask to reverse that specific rule).

### Badge catalog (draft, all offline-derivable)

| Badge               | Criterion                                                                                                      | Rationale                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| First Words         | 1st completed session (`end_reason` != null)                                                                   | Onboarding-adjacent peak                                                                                     |
| Six Endings         | First session with `submittedEndings.length >= targetEndings` (not cut short)                                  | Rewards finishing, not just starting                                                                         |
| A Week of Mornings  | 7 distinct calendar days (local tz) with ≥1 completed session, not necessarily consecutive                     | "Showed up," descriptive not streak-pressuring                                                               |
| Every Corner        | At least 1 completed session touching each of the 6 categories (§5.2)                                          | Encourages breadth, matches §6.2's rotation intent                                                           |
| Fifty Endings       | 50 total non-deleted `endings` rows                                                                            | Volume milestone, round number                                                                               |
| Two Hundred Endings | 200 total                                                                                                      | Same, longer horizon                                                                                         |
| The Long Way Round  | A session where `end_reason = 'timeout'` and every ending field was filled (pressure completed, not abandoned) | Rewards the exercise's actual mechanism (§1)                                                                 |
| Uncensored          | 25 sessions with `uncensored_mode = 1` completed                                                               | Rewards using the mode as designed, not scored against those who turn it off                                 |
| Looking Back        | First `reviews` row created                                                                                    | Review mode (§6.5) is easy to skip; nudge by acknowledging, not reminding                                    |
| A Stem of Your Own  | First `stems` row with `origin = 'user'`                                                                       | Encourages library engagement (§6.6)                                                                         |
| Seven-Day Rhythm    | 7-day streak of _consecutive_ calendar days, local tz, with ≥1 completed session                               | The one true "streak" badge — see Constraints, kept singular and one-time (doesn't re-fire at 8, 9, 10 days) |

11 badges. Deliberately not 30 — a small, legible set reads as recognition; a large set reads as a checklist, which drifts back toward evaluation (§13.6 spirit, still intact). Names avoid "champion/master/pro" tiering language; they're findings about the user's own history, closer to Spotify's "Vanity Mirror" principle (industry-conventions.md) than a game achievement.

Streak display on Home: "N days in a row" only while `N >= 3` (avoids "1 day in a row" reading as a demand), same unemphasised `type="small" textSecondary` treatment as the existing status line, never bold/colored/badged on its own. This is the one place a raw streak number appears outside the Progress screen, and it stays descriptive per the still-standing half of §13.6.

## 2. Visual language

Extends `src/constants/theme.ts`, following the existing per-purpose-palette precedent (`PressureColors`, `CategoryColors`) rather than folding into the general `accent`.

```ts
// New: theme-invariant, like PressureColors — a badge's "earned" glow
// should read identically regardless of light/dark, it's a celebratory
// accent, not a text/background pairing subject to per-theme AA math.
export const CelebrationColors = {
  glow: "#E8B34A", // warm gold, muted not neon — AA-checked as a
  // decorative glow only (not text), matching
  // CategoryColors' "decorative, non-text" precedent
  // for its .bg swatches
  glowSoft: "rgba(232,179,74,0.16)", // badge card fill, both themes
} as const;
```

Do not add a `badge` accent to the general `accent` token — §10's restraint plus the UI audit's explicit warning ("keep accent to a single hue... fastest way back to a gamified rainbow") both argue for a scoped, deliberately-separate palette, used only on the completion screen and Progress screen, nowhere else.

**Animation**: plain RN `Animated` (already imported in write.tsx for `PressureColors`), no new dependency.

- Completion "settle": `Animated.spring` on badge card, scale 0.92→1 + opacity 0→1, ~400ms, friction tuned to land without bounce-overshoot (a gentle settle, not a bounce — spec's existing "nothing bounces," §10, is about the _writing screen_; the completion screen is a new context, but staying consistent with the app's overall restraint is still the right call, so: settle, don't bounce).
- Badge reveal: fade + 8px upward slide, 250ms, appears ~300ms after the settle animation starts (sequenced, not simultaneous — avoids two competing motions).
- Respect `prefersReducedMotion` (React Native's `AccessibilityInfo.isReduceMotionEnabled`) — when true, skip both animations, show final state immediately. Not in spec today; add because §10's existing VoiceOver/Dynamic Type accessibility bar should extend to new motion, not regress it.

**Badge card** (Progress screen grid, and the single reveal on completion): reuses the existing `Card` component (`src/components/card.tsx`) with `CelebrationColors.glowSoft` fill only when earned; unearned badges render as a plain `Card` with `textSecondary` icon/label at reduced opacity (silhouette, not hidden — shows what's achievable without listing locked criteria as a checklist to grind, keeping distance from evaluation/gamefied-grind feel). No numeric "3/11 badges" counter — that's a score, and §13.6's spirit (evaluation-free) survives the reversal even though badges themselves don't.

Typography: badge name uses existing `ThemedText type="default"` (sans, per §10 — badges are chrome, not the user's writing, so they don't get the serif treatment reserved for stems/endings). No new type needed.

## 3. Placement

- **write.tsx** (`session.phase === 'done'` block, write.tsx:228–243): add the settle animation and conditional badge reveal. No structural change to the "Saved." confirmation or the existing duration line — both stay exactly as-is, badge content is additive below them, above the `Close` button.
- **index.tsx** (Home, status block, index.tsx:97–112): add one conditional streak line alongside the existing week-count line, same block, same styling. Add a "Progress" tile to `SECONDARY_LINKS` (index.tsx:53–60) — seventh tile, same `Card`/icon treatment as the other six, no special emphasis (a badge screen is a destination, not a demand).
- **New screen**: `src/app/progress.tsx` — badge grid (`Card` per badge, `CelebrationColors.glowSoft` if earned) + a short stats block (total sessions, total endings, distinct stems, longest streak-to-date), all computed at read time. No new nav chrome beyond what every other secondary screen already has.
- **history.tsx**: not changed. Badges are a Home/Progress-screen feature; history stays the neutral browsable record it already is — mixing celebration into the archive would undercut §1's "the output is private and often uncomfortable" framing.

## 4. Data: derivation rules and the stored-vs-derived question

**Recommendation: compute at read time, no schema change, no new table.**

Every badge criterion above is a pure function of existing `sessions`/`endings`/`stems`/`reviews` rows (all already queried via `Repository`'s existing read methods, e.g. `listSessionsForHistory`, `getRecentStemUsage`'s pattern extended to unbounded range). None require new columns. This is the same posture as `sessionDurationLabel` (write.tsx:238, already computed at read time from timestamps) and Home's existing `loadHomeStatus` (index.tsx:40–47) — the proposal adds `progressStats.ts`/`badges.ts` alongside `session/sessionMachine.ts` in the same style, not a new persistence concept.

Why not a new `badge_awards` table, even though the constraint note allows it as a legitimate append-only event log: the "earned-at" timestamp is nice-to-have (exact unlock moment) but not needed for any behaviour — the completion screen only needs "did this badge newly cross its threshold _this session_," which is answerable by comparing badge-set-before-this-session vs. badge-set-after, both computed from history, no stored flag required. A schema change buys a "first earned on {date}" display detail at the cost of a new migration, a new fixture DB (§13.8), and — critically — a second, redundant source of truth that must stay derivable from the same rows anyway (the export/analysis reader in R/pandas would still recompute badges from raw sessions, since badge _rules_ aren't guaranteed stable across app versions; a stored award row from an old rule version would misrepresent history under a later rule change, exactly the "derived columns rot and then lie" problem §4.1.2 warns about). Compute-at-read sidesteps that entirely: change a badge's criterion in a future release, and it's correct retroactively for the whole history, free.

Concretely, "newly earned" for the completion-screen reveal: call the pure badge-derivation function with the session history _excluding_ the just-finalized session, then _including_ it; any badge present in the second set but not the first is "new" and gets the reveal. No flag persisted anywhere.

**Derivation rules** (illustrative, exact SQL/TS lives in implementation):

- Streak (current & longest): distinct local-tz calendar dates with ≥1 session where `ended_at IS NOT NULL AND deleted_at IS NULL`, sorted, longest run of consecutive dates. `tz`/`offset_min` already stored per session (§4.1.3) — use the session's own recorded offset, not the device's current one, so a badge computed today about a trip last month uses the tz that was true then.
- Volume badges: `COUNT(*)` over `endings WHERE deleted_at IS NULL`, joined to non-deleted sessions.
- Category coverage: `COUNT(DISTINCT category)` over completed sessions joined to `stems`.
- All queries exclude soft-deleted rows, consistent with every existing `Repository` read method — a badge should not count a session the user retracted, matching the existing "history hides deleted rows" convention (§4.1.5), even though export still sees them.

This keeps export (§8) untouched: nothing new to add to the JSON/CSV bundle, no new README column to document, no round-trip test surface added. That's a meaningful simplicity win given export is explicitly first-class.

## 5. Implementation cycles

**Cycle 1 — Derivation + tokens, no UI.** Land `src/session/badges.ts` (pure functions: badge catalog as data, `computeEarnedBadges(history) -> BadgeId[]`, `computeStreak(history, now) -> {current, longest}`, unit-testable the same way `stemSelection.ts` is — deterministic given inputs), `src/session/progressStats.ts` (total sessions/endings/stems), and `CelebrationColors` in `src/constants/theme.ts`. Repository gets one new read method, `getAllSessionsForStats()` (or reuse `listSessionsForHistory({})` with no filters if its shape already suffices — check before adding). Files: `src/session/badges.ts` (new), `src/session/progressStats.ts` (new), `src/session/__tests__/badges.test.ts` (new), `src/constants/theme.ts` (add `CelebrationColors`), `src/db/repository.ts` (add read method only if `listSessionsForHistory` can't already serve it). Done: `npm run typecheck` and `npm test` pass; badge functions covered for 0/1/many sessions, streak boundary (midnight local, DST transition reusing the existing tz-handling pattern from notification tests), and the "newly earned" before/after comparison; no screen file touched.

**Cycle 2 — Completion-screen peak.** Wire the settle + badge-reveal animation into write.tsx's `done` phase, reduced-motion respected. Files: `src/app/write.tsx` (done block only), `src/components/badge-card.tsx` (new, thin wrapper around `Card` for the earned/unearned badge tile, reused by cycle 3's Progress screen). Done: completing a session shows the existing "Saved." unchanged; a session that newly crosses a badge threshold shows exactly one badge reveal below it, once, never on subsequent sessions; `AccessibilityInfo.isReduceMotionEnabled` true skips both animations with the same end state; typecheck/tests pass; manual check that uncensored-mode input (active phase) is visually and behaviorally untouched by this cycle.

**Cycle 3 — Progress screen + Home surfacing.** New `src/app/progress.tsx` (badge grid via `BadgeCard`, stats block), add "Progress" tile to `index.tsx`'s `SECONDARY_LINKS`, add conditional streak line to `loadHomeStatus`/Home's status block. Files: `src/app/progress.tsx` (new), `src/app/index.tsx` (grid entry + status line), `src/app/_layout.tsx` if route registration is needed (check existing pattern — likely automatic via expo-router file-based routing, confirm no manual registration exists elsewhere). Done: Progress reachable from Home in one tap; all 11 badges render (earned styled, unearned dimmed, no counter numeral); streak line only appears at `N >= 3` and matches existing status-line styling exactly; no badge/streak content appears anywhere in history.tsx or session-detail.tsx; typecheck/tests/lint pass; final check confirms no evaluative copy anywhere in the new surfaces (no "you should," no comparison language, no missed-day mention).

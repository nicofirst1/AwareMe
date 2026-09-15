# ADR-0005: Adopt the official Sentence Completion programme

Date: 2026-09-15 (grilled + confirmed with owner 2026-09-15/16)
Status: Accepted

## Context

v1 seeded 26 original stems "in the spirit of the method" (spec §5.1, original). The
owner then obtained **explicit permission from Leigh Branden** to use the official
list at `https://nathanielbranden.com/sentence-completion-i/` — thirty week blocks
(4–6 stems each, mornings Mon–Fri) plus a weekly reflection stem, with the weekly
reflection done "sometime each weekend". The owner also asked for the About screen
to carry the method framing, the programme link, and the permission attribution,
and confirmed the Android release should include this work (with a dogfood/E2E
cycle before ship).

## Decision

1. **Guided programme by default.** Fresh installs seed the official programme
   verbatim (canonical snapshot: `.scratch/official-program/official-program-
   verbatim.txt`). The v1 original 26 stems are retired: seeded soft-deleted on
   fresh installs; untouched on pre-amendment installs (append-only, §4.1).
2. **Week progression is derived at read time** — `1 +` distinct calendar weeks
   containing a completed weekly reflection, anchored to the first
   official-programme sitting, capped at 30 (§13.7 holds; no pointer row).
   Self-paced: missed days never skip weeks.
3. **User week selection = a nullable setting** (`program_week_override`),
   cleared automatically when the selected week's reflection completes. User
   intent, not a derived value — §13.7-legal.
4. **Evening becomes a reflection of the morning** (toggle, default on, asked
   once at first launch): today's morning endings read-only + one of the two
   non-weekly review meta-stems, alternating deterministically. The official
   programme has no evening at all; this is app-local design per the owner.
5. **Third local notification** for the weekly reflection (native weekly
   trigger, default Sunday 21:00), revising §6.4's "exactly two".
6. **The official weekly stem already exists** in our seed (§5.4 meta-stem #1):
   migration 0004 tags it `is_weekly_meta = 1` rather than adding a row.
7. **Sentence Completion II is deferred.** Programme membership lives in
   `week_number`/`is_weekly_meta` only; a `program` column can be added later if
   the _Taking Responsibility_ programme lands.

## Consequences

- §5.1's originality constraint reverses for the official list only; the seed
  file gains a byte-check test against the committed snapshot.
- Fresh-install exports contain the retired originals as retracted rows —
  intentional provenance, consistent with the append-only model.
- The evening sitting's "review today first" step reuses §6.5 mechanics; no new
  uncensored-mode surface.
- Dogfooding + multi-agent E2E (cycle 06) gates the Android release; store
  assets/manifests are cycle 05.

A local, offline sentence-completion journaling app. The user repeatedly completes a prompt under time pressure — fast enough that the internal editor cannot intervene. The value accrues over weeks, partly through re-reading. The language below is opinionated; prefer these terms in code, issues, and tests.

## Language

**Stem**: An incomplete sentence the user completes, e.g. "A promise I made to myself and quietly dropped is". Stored without its trailing terminator. _Avoid_: prompt, question, sentence

**Ending**: One completion the user writes for a stem within a session. Repetitive, contradictory, or trivial endings are valid — the method wants them. _Avoid_: answer, response, completion

**Session**: One timed practice in which the user writes endings to a single stem. Finalized exactly once, with an end-reason, and never reopened. _Avoid_: attempt, entry, round

**End-reason**: Why a session finalized — exactly one of: `user_done` (finished early), `timeout` (timer elapsed), `abandoned` (absent longer than the 5-minute grace).

**On-demand session**: A session the user starts by choosing a stem from the library, bypassing the weighted rotation (`origin = 'manual'`). _Avoid_: manual practice, freeform session

**Uncensored mode**: The default writing constraint: backspace limited to the current word, no cut/select, no returning to an earlier ending. The mechanism that enforces speed over editing.

**Review**: A periodic, re-reading-first activity (default weekly, also on demand): re-read every ending from a selectable recent period (default 7 days) read-only, then complete one meta-stem as a timed session. Not itself a stem-writing session. _Avoid_: recap, reflection, summary

**Meta-stem**: A stem completed _about the user's own recent endings_ rather than about their life directly. Used only in review. _Avoid_: review prompt, reflection prompt

## Design

The visual identity is published as a Google design.md file: `docs/design/DESIGN.md` — tokens in YAML front matter, rationale in prose. It is a **published view**: `src/constants/theme.ts` (colors, spacing, radius) and `src/components/themed-text.tsx` (typography) are normative; change them first, then re-publish. Every color derives from five owner hues (indigo, rose, cream, amber, jade); dark-theme variants carry a `-dark` suffix. Lint with `npm run design:lint`. See `docs/adr/0006-design-md-format.md`.

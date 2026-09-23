# ADR-0006: DESIGN.md as a published view of theme.ts

Date: 2026-09-22 (owner-approved migration plan, 2026-09-22)
Status: Accepted

## Context

Agents doing design work need exact design values without re-reading sources,
and design output needs a mechanical check. Google's design.md format (one
Markdown file: YAML design-token front matter + prose rationale, with a
`@google/design.md lint` CLI that validates structure and WCAG pairs) fits
both. The format has no theme-pair concept, and our theme encodes light/dark
in one `src/constants/theme.ts` with derived (`mixHex`) values.

## Decision

1. Adopt `docs/design/DESIGN.md` in the Google design.md format, extracted
   verbatim-value from `src/constants/theme.ts` and
   `src/components/themed-text.tsx`; every token traces to a source line,
   derived values are quoted as computed hexes with their blend recipe in
   prose.
2. `theme.ts` stays normative — DESIGN.md is a published view of it, to be
   re-extracted after any theme change.
3. Dark-theme variants are encoded as `-dark`-suffixed token names
   (un-suffixed = light); the format accepts unknown token names.
4. One-file shape, no `package.json` script, no CI wiring, no dark-file
   split: lint runs as bare `npx @google/design.md lint docs/design/DESIGN.md`.
   Gate wiring and consumption follow in the next design-polish packet per
   the owner's migration plan (extraction first, gate wiring second,
   consumption third).

## Consequences

- Agents get exact values without re-reading sources, plus a WCAG lint gate
  for future design work. Lint exits 0 errors; its warnings (orphaned color
  tokens, unrecognized `minTouchTarget` sub-token, no `primary` token) are
  structural heuristics that do not fit an extraction doc and are accepted.
- Drift risk: the view can go stale when `theme.ts` changes. Mitigation is
  the normative-source rule (decision 2) plus `palette.test.ts`, which
  remains the measured backstop for the values themselves.
- The `-dark` naming is the whole migration for now; a theme-pair structure
  or dark-file split can be revisited if the format grows one.

## Amendment 2026-09-23 (owner-approved)

Gate wiring — the planned phase 2 — landed: `npm run design:lint` is a local
gate beside typecheck / jest / lint (CI runs it in the `gates` job). The script
pins the CLI version via `npx @google/design.md@0.4.0` instead of adding a
devDependency: a trial devDependency forced a ~1500-line lockfile
re-resolution (metro/hermes entries moved) against the known-fragile lock
(DECISIONS.md, environment quirks), so the zero-dependency form was chosen.
The "no `package.json` script, no CI wiring" clause of decision 4 is
superseded; the bare-npx form remains valid for one-off checks. Consumption
(phase 3) still follows in a design-polish packet. The repo-specific
discovery pointers (AGENTS.md, CONTRIBUTING.md, CONTEXT.md,
mobile-app-ui-design skill 1.1.0) ship in the same change.

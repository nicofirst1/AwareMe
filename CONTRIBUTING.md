# Contributing

Thank you for wanting to help. Two files explain how this repository works, and both apply to human and agent contributors alike:

- **[spec.md](spec.md)** is the contract. MUST is a hard constraint; a SHOULD deviation needs a recorded justification.
- **[AGENTS.md](AGENTS.md)** maps the repository: where things live, the house rules, and the known environment quirks.

Invariants that are easy to trip over:

- The app is local-only: no network calls, no analytics, no backend, and none of the out-of-scope features listed in spec §2.
- The data layer is append-only with soft delete, and derived values are computed at read time, never stored (spec §4, §13.7).
- The app never scores, praises, or interprets the user’s writing, and notification copy never contains user text (spec §13.4, §6.4).

Run `npm test`, `npm run typecheck`, and `npm run design:lint` before proposing a change; all must pass. Run `npm run secrets:scan` too (gitleaks; CI enforces it on every push and pull request). Keep pull requests small, and describe the behaviour change, not just the code change.

Changing the look (colors, type, spacing, component tokens)? `src/constants/theme.ts` is the source of truth: edit it first, then re-publish `docs/design/DESIGN.md` (the Google design.md view, ADR-0006) and keep `npm run design:lint` at 0 errors.

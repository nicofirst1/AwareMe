# Endings row is created on first keypress, not on submit

To honor "nothing is discarded, ever" against a hard app kill and to compute the session's `last_activity` for the momentum rule (ADR-0001), an `endings` row is created on the first keypress into a field — not on submit as the spec's §6.3.4 states. This makes `endings.submitted_at` **nullable** (a row with `submitted_at IS NULL` is an ending begun but not yet submitted), lets `endings.started_at` record the true first keypress, and requires the in-progress field text to be autosaved on a short debounce. A new `sessions.last_activity_at` column is bumped on the same debounce so absence can be measured across a cold start.

Deviates from the spec DDL (`endings.submitted_at NOT NULL`) and §6.3.4; recorded in `DECISIONS.md`. Spec §4.2/§6.3.4 were amended (2026-09-16) to match; this ADR remains the rationale. On finalize, any open ending's `submitted_at` is set to the session's `ended_at`.

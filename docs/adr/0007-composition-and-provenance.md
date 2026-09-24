# ADR-0007: Practice composition and activation provenance

Date: 2026-09-23 (decisions D1–D4 set with the owner in the packet-7 grilling session)
Status: Accepted

## Context

Since ADR-0005 the morning practice was the programme week block alone, and the week-set activation write (`setProgrammeWeekActive`, issue 09's hybrid unlock model) enforced it with one blanket UPDATE: every programme stem at or below the unlock frontier force-activated, every week above it force-deactivated ("rested"). The write ran on reflection completion and "make this my week", so it silently trampled user choices in both directions — re-activating stems the user had archived, resting ones they had activated. It also left `stems.active` storing a history-derived value (the unlock floor) that the frontier read back — a §13.7 gray zone recorded in code comments and a 2026-09-16 hub FLAG but never indexed in DECISIONS.md (closed below).

## Decision

1. **Composition (D1).** The practice is the **user's picks + the programme week block, behind ONE binary `programme` setting** (§7). No per-period picker, no three-way mode: programme-only, programme+mine, and mine-only all emerge from the gate plus the user's picks. This supersedes ADR-0005's "programme mode is the app's only mode" framing and the week-set blanket activation beneath it.
2. **Provenance (D2).** Automation may activate only stems the user has never touched; it never deactivates, never reorders. `stems.activation_provenance` ('programme' | 'user', migration 0008; backfill: programme rows = 'programme', everything else = 'user', soft-deleted programme rows included) records who last set `active`, and the user-touch write path (`setStemActive`) flips it to 'user'. With automation scoped this way, deactivating a stem — programme or not — is a persistent choice (§6.6).
3. **Pause (D3).** Programme off = zero state changes: no activation write runs at all, the derived week stops advancing, and `program_week_override` plus manual activation stay live. Reflections are still recorded; the week derivation counts only reflections completed while the programme was on.
4. **Re-enable (D4).** Turning the programme on pins week 1 (`program_week_override = 1`) and shows an in-app dialog linking to the week screen ("pick a different week"). The derived week — counting only enabled-period reflections — remains the fallback once the override clears. The override mechanism itself is unchanged (ADR-0005, decision 3).

**§13.7 handling, stated explicitly.** The derived programme week is still never stored. The two new columns are write-time records of user context, not derived values — the same precedent as `sessions.uncensored_mode` (§6.3.6 records the setting's value per session because it shaped the session):

- `stems.activation_provenance` records, at write time, whether the programme's automation or the user last set `active`. It is an input to later writes, never computed from stored state.
- `sessions.programme_on` records whether the programme was on when the session started, captured from the live setting; the derivation filters on it at read time, never infers it.

The known gray zone is now indexed here: week-set activation still encodes the unlock floor in `stems.active`, and the frontier reads it back (`getHighestUnlockedWeek`) — deliberate per the issue 04/09 code comments and the 2026-09-16 hub FLAG. The composition never reads `active` as a derivation input; the floor exists so existing installs never regress, and §13.7's "no stored derived values" continues to govern the derived week itself.

**Upgrade-time limitation.** The migration 0008 backfill cannot recover history: rows the user manually deactivated before the migration are indistinguishable from never-touched rows (the blanket UPDATE erased any record; the `active` state alone cannot encode a touch). D2's never-touched guarantee therefore holds **from the migration forward** — the backfill must not be read as claiming pre-migration knowledge, and it is the user-touch write path (decision 2) that keeps the guarantee true once the migration has run.

## Consequences

- The trample (user-deactivated programme stems silently re-activated or rested by the next reflection or "make this my week") is impossible by construction. The interim deactivation warnings shipped by wave 1 (t6 row caption, t3 editor note) go stale the moment the engine lands and are retired by the surface ticket (w2-t4).
- Export/import carry both columns; the §8 round-trip must reproduce provenance byte-identically. The upgrade is pinned by migration tests + fixture `schema-v8.db` (§13.8).
- Off-period reflections stay in the database and exports (nothing discarded); they only stop counting toward week derivation.
- `stems.weight` remains vestigial (ADR-0004, D6): the "How often" control is removed, the column is not dropped.

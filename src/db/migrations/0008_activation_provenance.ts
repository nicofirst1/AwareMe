/**
 * Migration 0008: activation provenance + the per-session programme-on
 * record (packet-7 decisions D2/D3; spec §13.8; wave-2 ticket w2-t1).
 *
 * - `stems.activation_provenance` — TEXT NOT NULL DEFAULT 'user'. The
 *   activation authority of record for the D2 precedence rule ("automation
 *   may only activate stems the user has never touched"): 'programme' =
 *   placed by the programme's week-set activation, 'user' = placed (or last
 *   touched) by the user. The two-value set is enforced at the write path
 *   (TypeScript union), same convention as `category`'s six-value set —
 *   no SQL CHECK (spec §4.2's DDL carries none either).
 *   Backfill is deterministic — programme rows are EXACTLY the rows
 *   automation can touch: `week_number IS NOT NULL` is
 *   `setProgrammeWeekActive`'s own UPDATE scope, the derivation's
 *   membership anchor and the seed's membership rule, so those rows
 *   backfill 'programme' and everything else 'user'. Soft-deleted programme
 *   rows are included (migration 0005's precedent: they remain programme
 *   provenance in exports, §4.1.5 — and the week-set UPDATE has no
 *   `deleted_at` filter, so they really are automation-touchable today).
 *   NOT NULL + DEFAULT fills the non-programme rows at the ALTER itself
 *   (SQLite semantics) — no second UPDATE. The week-set blanket UPDATE
 *   this column retires erased any record of pre-migration user touches,
 *   so D2's guarantee holds from this migration forward (an ADR note, not
 *   recoverable data); the write path flips provenance on user touches
 *   from w2-t2 on.
 * - `sessions.programme_on` — INTEGER NOT NULL DEFAULT 1. Whether the
 *   Programme setting was ON when this session started — a write-time
 *   user-context input, the exact `uncensored_mode` precedent (§13.7-safe:
 *   recorded at write time, never derived and never stored as a derived
 *   value). No backfill needed: no off state exists before wave 2, so
 *   every pre-existing reflection was written while the programme was on —
 *   the ALTER's DEFAULT fill IS the backfill, deterministic by
 *   construction. (The four-step write-path plumbing — read at Start,
 *   pass through `createSession`, read back on resume — lands with w2-t2;
 *   this migration only adds the column.)
 *
 * Fresh installs: migrations run BEFORE seeding, so the UPDATE below
 * touches zero rows there — the corpus is labelled by `seedIfEmpty`, whose
 * programme INSERT writes 'programme' explicitly while every other class
 * keeps the DEFAULT. `schema_meta` is bumped by the runner (`migrate.ts`),
 * not here. No other column, row or table is touched; `weight` stays
 * vestigial (D6/ADR-0004).
 */
export const MIGRATION_0008_ACTIVATION_PROVENANCE = `
ALTER TABLE stems ADD COLUMN activation_provenance TEXT NOT NULL DEFAULT 'user';
UPDATE stems SET activation_provenance = 'programme' WHERE week_number IS NOT NULL;
ALTER TABLE sessions ADD COLUMN programme_on INTEGER NOT NULL DEFAULT 1;
`;

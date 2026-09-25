# Round ops (coordinator reference)

The coordinator side of a delegated round. The agents' duties live in SKILL.md; this file owns the machinery. Read before opening a round and at every amendment, merge, and close.

## Amendment discipline

- Every amendment is numbered (counted in the round hub). BEFORE applying one, snapshot the current `SKILL.md` into `versions/<date>-r<N>-SKILL.md` in this skill's directory: copied from the live file immediately before the edit and diff-verified byte-identical to it before the SKILL-UPDATE line names its hash (a snapshot copied from the wrong source preserves nothing — p7's debrief shipped a stale v1.8.0 file as its r19 snapshot).
- Every amendment bumps the amended skill's version field in the same commit (standing rule = minor, lessons = patch); the SKILL-UPDATE line quotes old → new so registry supersession citations stay unambiguous.
- An amendment is complete only when its numbered `SKILL-UPDATE` hub line, snapshot, and commit echo all exist; a skill landing between rounds posts them retroactively in the next open hub before any other coordinator action.
- Apply, then verify the file on disk: an amendment announced but not on disk does not exist.
- Post a `SKILL-UPDATE` hub line and steer every working agent to re-read; agents re-read the file on such a line before their next device interaction or claim, and audits judge against the amended text.
- Sibling reference files (`parallel-device-pools.md`, `round-ops.md`, `vision-audit-swarm.md`) amend under the same discipline.
- Every 3rd amendment, review the axis registry (`.agents/skills/methodology-auditor/axis_classification.md`): prune to 5 axes — drop the lowest score, oldest wins ties, sort the rest by score. Auditors propose and score; the coordinator prunes. A recurrence of a superseded row's failure class re-activates that row (un-retire with the new seen-clause) instead of appending a sibling row.

## Commit discipline

One artifact class per commit: skill text, registry rows, and snapshots never share a commit. The amendment number goes in the commit message, and every skill-repo commit gets a hub echo line. Round close commits the round's skill and registry deltas before the DONE row: "landed" means committed, with the hash in the close line — a working-tree delta is labeled "uncommitted", never "landed" (p7's wave-1 close claimed lessons landed while they sat uncommitted; the commit landed the next morning).

## Hub integrity

- Check the line count after every append (`wc -l` before and after).
- Back the hub up to `.coordination/<round>-hub-backup.md` at each wave boundary.
- Lost lines are recoverable: agent sessions append via `cat >>`, so reconstruct from the agents' session jsonl files and archive under `.coordination/` with a provenance header.
- Absence claims ("no row", "no verdict yet", "still in flight") are written only after re-reading the hub tail and the packet Comments at post time: late-landing rows retire them, and the trail's rows — not the last sweep's memory — decide what is in flight (p7: two sweeps wrongly listed delivered audits as in-flight, corrected 16:32 and 17:43).

## Steering, grants, ownership

- A scope-changing STEER lands its delta on the receiving ticket's packet row (or the hub row records the row as amended-by-steer) before the receiver implements or reviews — superseded scope must be unreadable as current (p7 10:20: the Archive note reassigned t6 → t3 lived only in hub prose until the audit flagged it).
- Charters pre-declare anticipated out-of-map necessities and judgment calls as numbered scoped grants at dispatch (surface, rationale, declined alternatives) so cycles consume them without FLAG round-trips; emergent needs stay pre-edit FLAGs, and every grant row names the granted surface and rationale.
- A charter naming a file or symbol verifies the location with one grep at dispatch (p10 t4: DEFAULT_SETTINGS pinned at src/db/repository.ts, lives in src/db/seed/settings.ts — the stale pointer cost an honest-resolution row and an audit observation).
- A file-ownership map line is derived from the ticket row plus the cross-cycle contracts, so a contract-mandated file never reads as an excursion; where the map and a contract disagree, the contract wins and the map line is amended.

## Gates are symmetric with agent gates

- A failed or empty tool-result wrapper voids that verification pass: salvaged artifacts are provisional until re-derived or the pass re-runs, and a salvaged verdict never gates a merge alone.
- Routed residuals (a failed gate item re-routed as a question) must name the receiving ticket or owner call and record its acceptance in the trail; otherwise the item stays a merge blocker.
- Merge lines state the gate numbers (suites passed / failed against the named baseline) or say expected, not verified; verified separately without a number is not a record. Numbers keep the passed+skipped/total shape (`650p+12s/662`) — a bare total parses as zero skipped.
- Every landing posts its own MERGED row naming the merge commit and the re-run gate numbers; a landing recorded only inside a fix-order note or recap row is not a record (p7: the cfac376 landing survived only inside notes until the audit flagged it).
- A coordinator-ordered post-merge fix runs a defined path: scope-capped fix commit, a `READY-FIX (post-merge fix for <gate>)` hub row (the state vocabulary has no fix state — this documented reuse is the convention), its gate is the failed gate re-run green at main, its own MERGED row, and the methodology audit still lands.

## After merges

Reviewer-checked doc duties land on main with the merge; captures backed up before worktree teardown; branches deleted; issues flipped to done.

- Retirement closes a cycle's panes only after each agent's SESSION reads done/idle in `agent list` — a posted final hub row is not session-settled (the retire kit's fail-closed refusal means wait, p7 11:09; closing on the hub row alone can kill a mid-write audit).
- Pane hygiene: close each pane when its final row and outputs are verified — service panes (research/design/audit) on verified DONE, impl/review at merge, audit at audit DONE — so verified-done panes never masquerade as in-flight work in the wake-sweep.
- Per-cycle audit depth scales with blast radius: docs/UI-light cycles with no new storage paths may ride the round-close audit sweep instead of a per-cycle audit, recorded as an explicit hub decision at retirement.
- The close-out sweep at DONE verifies every promised durable doc line actually landed on main (DECISIONS bullet, spec section, ADR index line) and the coordinator's own tree is clean — every residual is a committed fix or a named open item, never silent (p7 close-out: emulator.sh fix uncommitted, ADR-0008 missing its DECISIONS index line).

## PLAN.md lifecycle

`docs/PLAN.md` is an index, not a record. Open packets: one line each, what it is plus the gate. Closed or dropped packets: one line each, status plus a pointer (merge commit, report path, or issue file); trim closure prose at close time, never append it. The story lives in the hub, the issue files, or docs/DECISIONS.md. At round close the whole file archives to `.coordination/legacy/plan-<date>.md` and the next round starts with a fresh PLAN.

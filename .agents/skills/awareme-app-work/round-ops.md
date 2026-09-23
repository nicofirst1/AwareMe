# Round ops (coordinator reference)

The coordinator side of a delegated round. The agents' duties live in SKILL.md; this file owns the machinery. Read before opening a round and at every amendment, merge, and close.

## Amendment discipline

- Every amendment is numbered (counted in the round hub). BEFORE applying one, snapshot the current `SKILL.md` into `versions/<date>-r<N>-SKILL.md` in this skill's directory.
- Apply, then verify the file on disk: an amendment announced but not on disk does not exist.
- Post a `SKILL-UPDATE` hub line and steer every working agent to re-read; agents re-read the file on such a line before their next device interaction or claim, and audits judge against the amended text.
- Sibling reference files (`parallel-device-pools.md`, `round-ops.md`, `vision-audit-swarm.md`) amend under the same discipline.
- Every 3rd amendment, review the axis registry (`.agents/skills/methodology-auditor/axis_classification.md`): prune to 5 axes — drop the lowest score, oldest wins ties, sort the rest by score. Auditors propose and score; the coordinator prunes.

## Commit discipline

One artifact class per commit: skill text, registry rows, and snapshots never share a commit. The amendment number goes in the commit message, and every skill-repo commit gets a hub echo line.

## Hub integrity

- Check the line count after every append (`wc -l` before and after).
- Back the hub up to `.coordination/<round>-hub-backup.md` at each wave boundary.
- Lost lines are recoverable: agent sessions append via `cat >>`, so reconstruct from the agents' session jsonl files and archive under `.coordination/` with a provenance header.

## Gates are symmetric with agent gates

- A failed or empty tool-result wrapper voids that verification pass: salvaged artifacts are provisional until re-derived or the pass re-runs, and a salvaged verdict never gates a merge alone.
- Routed residuals (a failed gate item re-routed as a question) must name the receiving ticket or owner call and record its acceptance in the trail; otherwise the item stays a merge blocker.
- Merge lines state the gate numbers (suites passed / failed against the named baseline) or say expected, not verified; verified separately without a number is not a record.

## After merges

Reviewer-checked doc duties land on main with the merge; captures backed up before worktree teardown; branches deleted; issues flipped to done.

## PLAN.md lifecycle

PLAN.md is an index, not a record. Open packets: one line each, what it is plus the gate. Closed or dropped packets: one line each, status plus a pointer (merge commit, report path, or issue file); trim closure prose at close time, never append it. The story lives in the hub, the issue files, or DECISIONS.md. At round close the whole file archives to `.coordination/legacy/plan-<date>.md` and the next round starts with a fresh PLAN.

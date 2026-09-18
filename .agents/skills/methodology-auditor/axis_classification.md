# Axis classification

Registry of methodology-audit axes. A methodology auditor audits each cycle against the ACTIVE set - the top 5 rows by score - and appends one new row per cycle (it never edits existing rows). The coordinator curates this registry.

**Score scale.** `3` = fundamental: the failure recurs and silently breaks audits. `2` = useful: worth checking, not every cycle. `1` = not useful to investigate: looked promising, did not pay off.

**Active-set rule.** The active set is the top 5 rows by score. These are the axes an auditor checks each cycle.

**Prune rule.** Scores are coordinator-adjustable. At every 3rd amendment of awareme-app-work (skill iterations counted in the round hub), the coordinator reviews this registry: if more than 5 axes are registered, it removes the lowest-scored one (oldest proposal wins ties) and keeps the top 5 sorted by score, highest priority first.

| score | axis | catches | proposed by | date |
|------:|------|---------|-------------|------|
| 3 | hypothesis discipline | claims state expected behavior before verification | coordinator | 2026-09-18 |
| 3 | evidence quality | evidence classes named, cited files exist, no 0-byte or duplicate-file citations, capture descriptions match files | coordinator | 2026-09-18 |
| 3 | protocol compliance | hub line formats, FLAG usage, lock discipline incl. LOCK-CLAIM naming, file-order authority | coordinator | 2026-09-18 |
| 3 | ownership compliance | file map, frozen files, co-grant boundaries | coordinator | 2026-09-18 |
| 3 | vision-method adherence | vision-capable delegation when the model cannot render images, looking pass performed, no exploratory clicking | coordinator | 2026-09-18 |
| 2 | deferral completeness | a READY’s pending-capture list that is narrower than the ticket’s own acceptance criteria, so the amendment-7 merge gate ("capture set landing") passes on an incomplete set | c03-audit | 2026-09-18 |
| 3 | pre-wipe capture strategy | implementers preserve pre-wipe captures under lock contention, distinguishing "capture exists" from "capture is recoverable after lock violation" | c05-audit | 2026-09-18 |
| 2 | device-state provenance | captures where app build, device config (density, uimode), or prior actors aren't recorded | c01-audit | 2026-09-18 |
| 2 | gate-delta accounting | a green or baseline-equal gate count whose delta composition (tests added, deleted, retitled, or newly skipped) is never reconciled in the durable trail, hiding a deleted or weakened test | c02-audit | 2026-09-18 |
| 2 | claim-trail alignment | statements of completed verification in issue comments that the hub trail contradicts, e.g. 'verified live on the emulator' while the emulator-lock queue shows no device work and captures still pending | c04-audit | 2026-09-18 |

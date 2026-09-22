# PLAN — next packets after the coordination bootstrap

Grounded in the archived round records (`.coordination/legacy/`, archived 2026-09-22). Packet 1 is fixed by the owner-approved bootstrap plan. Every other packet is marked: **PROPOSAL** = needs owner confirmation before dispatch; **OWNER-GATED** = blocked on an owner decision, not agent work.

Index rule: open packets one line each (what, gate); closed or dropped packets one line each (status + pointer); closure prose lives in the hub, issue files, and DECISIONS.md, never here. At round close this file archives to `.coordination/legacy/plan-<date>.md` and the next round starts fresh.

## Packets

1. **Packet 1 — r13 methodology audit (FIXED, owner-approved).** Process audit of the r13 skill amendments preserved in commit 23c09cf — the final methodology audit the polish-audit round deferred (judge how, not what). Gate: audit report filed in `.coordination/reports/` with verdict and evidence; no skill edits.
2. **Packet 2 — persona-UAT issue verification (PROPOSAL).** Reproduce or rebut the 24 compiled persona-UAT issues (`.scratch/persona-uat/issues/10-collector-compile-issues.md`; 7 blocker-class, 11 friction, 5 polish, 1 disagreement-only) against current HEAD on the emulator pool, including the D1–D10 claims the collector flagged as contradicted by their own captures. Gate: per-issue verdict with capture evidence; blocker-class list ready for owner triage.
3. **Packet 3 — blocker fixes from validated UAT issues (PROPOSAL; depends on 2 + owner validation).** Fix confirmed blocker-class bugs — legacy candidates: bottom nav unresponsive, date-range selectors unresponsive, POST_NOTIFICATIONS not granted after "Allow reminders", empty evening has no input field, empty sitting counts as "complete". Gate: each fix ships a failing-first behavioral test plus device capture; full gates green.
4. **Packet 4 — lint debt reduction (DONE 2026-09-22).** Merged as 9ad576c (reviewer-APPROVED); gates and scope in the hub trail.
5. **Packet 5 — OSS readiness owner decisions (DONE 2026-09-22).** All five calls in `DECISIONS.md`: GPLv3 confirmed; `.scratch/` stays untracked; Branden question closed (app builds embedding the programme text covered, no new ask); history kept as-is; repo `nicofirst1/AwareMe`, private, nothing pushed.
6. **Packet 6 — OSS publish mechanics (PROPOSAL; depends on 5).** Execute the oss-readiness-audit phases still open: scrub (tracked `source-page-2026-09-15.html`, genericized `/Users/nbrandizzi/` paths in docs, verbatim-snapshot relocation if `.scratch/` stripped), confirm LICENSE/NOTICE, pre-publish secret scan, tag `v1.1.0`. Gate: audit's pre-publish checklist passes with clean `git status` and green gates.
8. **Packet 8 — round-kit process improvements (PROPOSAL).** Fold the surviving t05-time-audit recommendations (~76 min/cycle: capture/drive pipeline script, mock-strategy order, lock-wait doorbell, gate batching with the expo-asset remedy, paperwork templates) into the delegation kit after checking which r13 skills already cover them. Gate: kit changes pass helper tests; one full cycle runs on the new kit end-to-end.

## Closed threads (no packet)

- **Packet 7 — name clearance (DROPPED 2026-09-22).** AwareMe stands without register searches; decision in `DECISIONS.md`, trademark-clearance bullet.
- **Packet 4b — content-module restore (DONE 2026-09-22).** Rebuilt from the canonical snapshot; record in the hub trail, 2026-09-22 10:10 to 10:17.

- **workflow-automation** — owner moved general Pi hardening out of the app repo to `~/.pi/harness-hardening` (2026-09-20); no candidate was installed; nothing pending in-repo.
- **r13 skill install** — installed and preserved in 23c09cf; audited by Packet 1.

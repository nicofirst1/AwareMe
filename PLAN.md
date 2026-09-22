# PLAN — next packets after the coordination bootstrap

Grounded in the archived round records (`.coordination/legacy/`, archived 2026-09-22). Packet 1 is fixed by the owner-approved bootstrap plan. Every other packet is marked: **PROPOSAL** = needs owner confirmation before dispatch; **OWNER-GATED** = blocked on an owner decision, not agent work.

## Packets

1. **Packet 1 — r13 methodology audit (FIXED, owner-approved).** Process audit of the r13 skill amendments preserved in commit 23c09cf — the final methodology audit the polish-audit round deferred (judge how, not what). Gate: audit report filed in `.coordination/reports/` with verdict and evidence; no skill edits.
2. **Packet 2 — persona-UAT issue verification (PROPOSAL).** Reproduce or rebut the 24 compiled persona-UAT issues (`.scratch/persona-uat/issues/10-collector-compile-issues.md`; 7 blocker-class, 11 friction, 5 polish, 1 disagreement-only) against current HEAD on the emulator pool, including the D1–D10 claims the collector flagged as contradicted by their own captures. Gate: per-issue verdict with capture evidence; blocker-class list ready for owner triage.
3. **Packet 3 — blocker fixes from validated UAT issues (PROPOSAL; depends on 2 + owner validation).** Fix confirmed blocker-class bugs — legacy candidates: bottom nav unresponsive, date-range selectors unresponsive, POST_NOTIFICATIONS not granted after "Allow reminders", empty evening has no input field, empty sitting counts as "complete". Gate: each fix ships a failing-first behavioral test plus device capture; full gates green.
4. **Packet 4 — lint debt reduction (PROPOSAL).** Apply the lint-errors-review minimum package: `useAnimatedValue` refs swap + `react-hooks/set-state-in-effect` downgrade to warn with a `DECISIONS.md` entry; reconcile first against the o10-session-state work already merged (3 of 7 set-state sites cleared). Gate: lint errors at 0 with no new warnings; typecheck + jest green.
5. **Packet 5 — OSS readiness owner decisions (OWNER-GATED).** Owner calls B3 (Branden permission for public distribution), O1 license, O2 `.scratch/` publish-or-strip, O5 history rewrite, O6 repo name; each recorded in `DECISIONS.md`. Gate: `DECISIONS.md` entries for all five; no publish step before B3 answers yes.
6. **Packet 6 — OSS publish mechanics (PROPOSAL; depends on 5).** Execute the oss-readiness-audit phases still open: scrub (tracked `source-page-2026-09-15.html`, genericized `/Users/nbrandizzi/` paths in docs, verbatim-snapshot relocation if `.scratch/` stripped), confirm LICENSE/NOTICE, pre-publish secret scan, tag `v1.1.0`. Gate: audit's pre-publish checklist passes with clean `git status` and green gates.
7. **Packet 7 — name clearance completion (OWNER-GATED).** Owner picks the app name; then official trademark search (USPTO/WIPO/EUIPO) for the finalist. Known conflict: "AwareMe ADHS" by Abelssoft (de.awareme.pse) vs the AwareMe brand. Gate: clearance memo written; identity freeze (issue 14: scheme, bundle ids, DB filename, notification ids) resolved.
8. **Packet 8 — round-kit process improvements (PROPOSAL).** Fold the surviving t05-time-audit recommendations (~76 min/cycle: capture/drive pipeline script, mock-strategy order, lock-wait doorbell, gate batching with the expo-asset remedy, paperwork templates) into the delegation kit after checking which r13 skills already cover them. Gate: kit changes pass helper tests; one full cycle runs on the new kit end-to-end.

## Closed threads (no packet)

- **workflow-automation** — owner moved general Pi hardening out of the app repo to `~/.pi/harness-hardening` (2026-09-20); no candidate was installed; nothing pending in-repo.
- **r13 skill install** — installed and preserved in 23c09cf; audited by Packet 1.

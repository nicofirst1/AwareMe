# PLAN — next packets after the coordination bootstrap

Grounded in the archived round records (`.coordination/legacy/`, archived 2026-09-22). Packet 1 is fixed by the owner-approved bootstrap plan. Every other packet is marked: **PROPOSAL** = needs owner confirmation before dispatch; **OWNER-GATED** = blocked on an owner decision, not agent work.

Index rule: open packets one line each (what, gate); closed or dropped packets one line each (status + pointer); closure prose lives in the hub, issue files, and DECISIONS.md, never here. At round close this file archives to `.coordination/legacy/plan-<date>.md` and the next round starts fresh.

## Packets

1. **Packet 1 — r13 methodology audit (FIXED, owner-approved).** Process audit of the r13 skill amendments preserved in commit 23c09cf — the final methodology audit the polish-audit round deferred (judge how, not what). Gate: audit report filed in `.coordination/reports/` with verdict and evidence; no skill edits.
2. **Packet 2 — persona-UAT issue verification.** CLOSED 2026-09-22: 24 issues + D1–D10 verdicted against release APK cdb05a22 (29 REPRODUCED-or-partial, see `.coordination/issues/packet2-p2-{evening,flows,nav}.md`, all DONE); 3 tickets each impl→review-APPROVED→methodology-audit-APPROVED (reports under `.coordination/reports/packet2-t*-…-methodology-audit.md`); blocker-class rollup delivered to owner; true-vision-parked items (C21 logo, C3/D1/C20 greyness) RESOLVED by the packet-9 vision pass — all four riders confirmed at vision level.
3. **Packet 3 — blocker fixes from validated UAT issues (PROPOSAL; depends on 2 + owner go).** Fix confirmed blocker-class bugs. Source list is now the vision-audit rollup (`.coordination/reports/packet2-vision-audit-rollup.md`, 17 clusters, priority-ordered: status-bar invisible on light backgrounds (H), writing-input container, 320px nav fold, 440dpi clipping, notification-permission-never-asked + alarms-not-firing) plus the legacy candidates still standing: bottom nav unresponsive, date-range selectors unresponsive, empty evening has no input field, empty sitting counts as "complete". Gate: each fix ships a failing-first behavioral test plus device capture; full gates green.
4. **Packet 4 — lint debt reduction (DONE 2026-09-22).** Merged as 9ad576c (reviewer-APPROVED); gates and scope in the hub trail.
5. **Packet 5 — OSS readiness owner decisions (DONE 2026-09-22).** All five calls in `DECISIONS.md`: GPLv3 confirmed; `.scratch/` stays untracked; Branden question closed (app builds embedding the programme text covered, no new ask); history kept as-is; repo `nicofirst1/AwareMe`, private, nothing pushed.
6. **Packet 6 — OSS publish mechanics (DONE 2026-09-23).** Pre-publish checklist reviewer-APPROVED at `1aac03e` (gates 68/68 suites 660/660 owner-mode, scrub zero, privacy ritual clean; report `.coordination/reports/packet-6-pre-publish-checklist.md`); pushed `main` + annotated tag `v1.4.0` to private `origin` (`nicofirst1/AwareMe`), ls-remote receipts in the issue file. Public flip stays an owner move.
8. **Packet 8 — round-kit process improvements (PROPOSAL).** Fold the surviving t05-time-audit recommendations (~76 min/cycle: capture/drive pipeline script, mock-strategy order, lock-wait doorbell, gate batching with the expo-asset remedy, paperwork templates) into the delegation kit after checking which r13 skills already cover them. Gate: kit changes pass helper tests; one full cycle runs on the new kit end-to-end.

## Closed threads (no packet)

- **Packet 9 — vision re-pass + vision swarm audit (DONE 2026-09-22).** p2-eyes re-read all 63 OCR'd frames on iais-genai/Qwen3.5-122B-A10B (63/63 agree); six-aspect swarm audit (native vision agents, 76 findings → 17 clusters), independent review + methodology audit APPROVED; rollup `.coordination/reports/packet2-vision-audit-rollup.md`. Standing capability persisted: awareme-app-work r16-r18 (iais-only vision rule, native vision agent recipe, swarm pattern); herdr-delegation F32 (completion-on-suppressed-channel) + dispatch-verification lessons.
- **Packet 7 — name clearance (DROPPED 2026-09-22).** AwareMe stands without register searches; decision in `DECISIONS.md`, trademark-clearance bullet.
- **Packet 4b — content-module restore (DONE 2026-09-22).** Rebuilt from the canonical snapshot; record in the hub trail, 2026-09-22 10:10 to 10:17.
- **Round d1 — DESIGN.md migration (DONE 2026-09-22).** `docs/design/DESIGN.md` (published view of `theme.ts`, 75 tokens) + ADR-0006 + DECISIONS bullet, merged `c4a20dc`; reviewer round-2 APPROVED, methodology audit APPROVED (`.coordination/d1.md`, issue `d1-designmd.md`); consumed by the next design-touching packet; `designmd diff` gates token parity from here.

- **workflow-automation** — owner moved general Pi hardening out of the app repo to `~/.pi/harness-hardening` (2026-09-20); no candidate was installed; nothing pending in-repo.
- **r13 skill install** — installed and preserved in 23c09cf; audited by Packet 1.

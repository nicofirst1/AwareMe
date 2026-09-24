# ADR-0008: Mockup-first design workflow

Date: 2026-09-23 (owner proposal during the p7 try-it debrief, confirmed same day)
Status: Accepted

## Context

Packet 7 (p7) shipped its wave-2 redesign behind an owner-approved HTML mockup step (`.coordination/p7-design/`: `design.md` + `generate.py` rendering device-size mockups, owner approval gate before any code). The owner tested the result and credited the loop with the round's speed: seeing the concrete screens before any code made his feedback cheap and removed rework. Separately, the p7 try-it debrief surfaced grouping-behavior findings (the stems library's "other" bucket, untagged-stem placement, collapsed-state structure) whose cheapest resolution is trying the *logic* in the browser, not just the pixels.

## Decision

Every design change ships an HTML mockup FIRST, and the owner's agreement on the mockup gates any application code:

1. **Visual changes** — extend the established `design.md` + HTML mockup pipeline (device-accurate sizes, example data, no licensed programme text per §5.1) and get owner approval before implementation.
2. **Behavioral/logic changes with a visual surface** — build an HTML *mirror* page that runs the real, ported logic (the pure functions, 1:1) over example data; the owner tries and debugs it in the browser; the agreed logic ports back into the one module + its tests.

Mockups and mirrors live under `.coordination/<round>-design/` (untracked, like all round artifacts).

## Consequences

- Design work starts in HTML, not in React Native; app code follows only after agreement (the p7 gate pattern, now standing).
- Pure logic that shapes UI must stay pure and single-home so the mirror can import-port it verbatim (the `stemLibraryFilter.ts` grouping is the template case).
- The rule is recorded in the app-work and mobile-UI-design skills; agents dispatching design tickets charter the mockup step as a pipeline stage, not an optional flourish.

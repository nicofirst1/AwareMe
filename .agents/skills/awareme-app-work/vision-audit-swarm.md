# Vision audit swarm

Full-app visual audits (r18, owner-approved pattern). For a scoped audit, trim the aspect list to scope.

## Spawn

Partition ASPECTS and spawn one native vision agent per aspect, each in its own tab of the audit workspace:

    herdr agent start t<N>-<aspect> --kind pi --pane <P> -- --model iais-genai/Qwen3.5-122B-A10B

One aspect per agent; agents do not share aspects.

## Aspects (mobile app)

1. Layout & responsiveness: clipping, overflow, 320/360px, touch targets
2. Visual hierarchy & typography: contrast, alignment, spacing, component consistency
3. Navigation & IA: reachability, back behavior, nav coherence
4. Color, contrast & a11y: states, iconography, dimmed/locked rendering
5. On-screen copy & microcopy: UI copy quoted only; stems (programme text) never
6. Empty/error/loading states

## Input and gate

Input per agent = the capture banks + targeted fresh captures. Any live app walk takes an emulator LOCK-CLAIM first (SKILL.md device-work rules).

Each per-aspect report lands in `.coordination/reports/audit-<aspect>.md`, then the standard gate: independent review → per-ticket methodology audit → rollup synthesized by the coordinator.

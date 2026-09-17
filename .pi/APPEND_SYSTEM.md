# House rules (appended; project facts live in AGENTS.md, not here)

- Read AGENTS.md before acting. If a round hub exists in `.coordination/`, read its tail
  too; then the issue file that names your task. Only then touch code.
- Verify before claiming done: run the real gates (`npm run typecheck`, `npx jest`,
  `npm run lint`) at the tree you are claiming for, and quote the numbers. Say
  "expected", not "verified", unless you ran it at the current HEAD.
- A pre-existing failure is a named baseline: surface it, never mask, weaken, or
  "fix" a test to get green.
- No unbounded tool calls: give every long-running command (builds, boots, installs,
  provider calls) an explicit timeout or kill-switch; poll in bounded steps.
- Stay inside your assigned file map; if the task needs more, ask (hub FLAG or a
  direct question) before editing.
- Report and hub files are append-only: add lines, never rewrite or reorder; append
  only your own lines; one line per transition; a re-post must change something.
- Reviewers verify independently: re-run gates yourself, check the evidence; never
  claim another agent's verification as your own.
- Quote evidence with file:line, command output, or a diff — never from memory. A
  finding is fixed or explicitly surfaced with a reason, never just noted.
- Leave the tree as you found it: release claimed locks, restore simulator/state,
  delete throwaway probes, preserve captures/evidence before any teardown.
- Never commit or paste owner-local/private content (gitignored modules, store or
  clearance materials) into a commit, diff, or posted message.
- The durable record lives in the hub and issue files, not in your context: re-read
  the plan before big decisions, and after any compaction.

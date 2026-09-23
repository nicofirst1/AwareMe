---
name: awareme-app-work
description: Implementing, reviewing, or auditing AwareMe (six endings) app changes — UI verification with pi-droid and vision models, emulator protocol, evidence standards, round protocol for delegated cycles.
version: 2.1.0
---

# Working on AwareMe

Orientation first: `AGENTS.md` (map), `spec.md` (the contract; §5.1 content rules, §13 hard constraints), `docs/DECISIONS.md` (standing decisions). This skill covers HOW to work and verify here; those files cover WHAT is true.

## Setup

- Work in your assigned worktree. Provision per `docs/DECISIONS.md`: `npm install --legacy-peer-deps`, then the expo-asset remedy.
- Gates: `npm run typecheck`, `npx jest`, `npm run lint`. Compare like-for-like — your worktree's node_modules (not main's), same command, same location — and a baseline failure counts as current only when re-run at this HEAD; otherwise cite it as cited. Baselines live in the round hub.
- Jest discovery: integration tree `npx jest --testPathIgnorePatterns=/\.worktrees/` (`--watchPathIgnorePatterns` is watch-mode only, excludes nothing); inside a worktree plain `npx jest` (that pattern would exclude the worktree root itself: false zero).

## Device work with pi-droid

Load the pi-droid skills for the tool sets: `android-screen` (perception), `android-interact` (input), `android-automate` (waits, find-and-tap, scroll-until-found). Check `android-plugin` for capabilities before hand-rolling them. A round with multiple emulators adds the pool rules: `parallel-device-pools.md`.

**Lock first.** Post a `LOCK-CLAIM: <device>-lock` hub line before ANY adb interaction, including emulator boot, kill, and reboot-recovery — recovering a frozen emulator is device work, not an exemption. Claims posted as NOTE lines (or not posted) are protocol breaches. After appending a claim, re-read the hub tail immediately: if a competing claim sits earlier in the file, the earlier claim wins (the hub is append-only; file order is authoritative when pane clocks drift), and the later claimant yields and re-queues. Release a lock only after completing all captures and preserving app state: a reinstall or `adb emu kill` without release destroys the holder's work.

**Observe, then tap.** Tap by text/id/element index from annotated screenshots, via pi-droid tools. The screen is the source of truth, not your last dump: after every screen change take a fresh dump/screenshot before the next tap. Inverted, offscreen, or invalid bounds mean a stale observation — re-observe, never tap old coordinates. Prefer pi-droid tools for all taps; raw `adb shell input tap x y` is a fallback only when a pi-droid tool cannot express the step, and the fallback must be disclosed in the evidence trail.

**Pair hashes and names in ONE command.** `md5 -r` / `shasum` print `hash path`; `ls` output re-sorts lexically and mispairs (r15, 2026-09-22: a pasted-vs-`ls` pairing produced a false cross-bank collision that froze three cycles). Re-derive any diagnostic before steering conclusions on it; a diagnostic that fails re-derivation is retracted in the hub by an appended superseding line that names the exact quote it retires (never edit history), and agents frozen on a retracted record resume immediately. Within-bank identical dumps are the F27 staleness class: re-capture with a fresh dump and name from the dump's content.

**Shared-singleton events take a lock AND a FLAG.** `adb kill-server` (or any adb daemon restart) disconnects every concurrent adb user on the host: take the emulator lock and post a FLAG before running it, and prefer non-destructive recovery (`adb devices`, re-connect) over kill-server.

**Restore.** Stop the app, stop Metro, `adb reverse --remove-all`, verify port 8081 is free, and restore device config you changed (density, theme, locale) before releasing the lock. Restoration claims are verified commands, not intentions.

## Verification methodology: vision-first, hypothesis-driven

The failure mode this skill exists to prevent: wandering around the app clicking randomly, then writing claims from memory.

1. **Hypothesis first.** From the ticket, write the expected behavior as a checkable statement before touching the device ("the DayField opens a weekday list with capitalized names").
2. **Targeted interaction.** Drive straight to the surface that tests the hypothesis. Take only taps/scrolls that answer a stated question.
3. **Capture.** Annotated screenshot + UI-tree dump for every claim. Pull a bounded logcat window around any crash/ANR or intent launch.
4. **Vision read.** The capture must be SEEN by a vision-capable reader before anything is claimed. If your session model renders images, read the capture yourself and describe what it actually shows (colors, layout, text) against the hypothesis. If it does not (text-only model: the read tool rejects image attachments), delegate the visual inspection to a vision-capable agent (registry agent "eyes" or equivalent) and record its description verbatim as the evidence. A claim backed only by "the flow worked" is not evidence. Absence claims obey the same rule: pixel probes sample points, so a clean probe cannot prove a visual defect is absent anywhere in the frame — a negative claim needs the vision reader over the full capture.
   - Vision reads run ONLY on iais-genai models — never openai, openrouter, or any non-Fraunhofer endpoint: app captures are owner-local content (r16, 2026-09-22, owner rule after two off-cluster probe reads were disclosed in the hub).
   - Headless one-shot from a bare pane: `pi -p --no-session -nt --model iais-genai/<model> @<image>` (`-nt` bypasses the agent-comms lock). The bridge accepts pi's native attachment format (r17, 2026-09-22: the earlier 400 "Unexpected message role" was rollout-transient, proven by request-capture replay and a live native probe). Curl fallback for outage diagnosis: POST <baseUrl>/chat/completions, single user message with content array [text, image_url data-URL], max_tokens ≥ 2000 for reasoning models — the answer must clear the reasoning channel.
   - Native vision agents: spawn a pi pane with the vision model (`herdr agent start <name> --kind pi --pane <P> -- --model iais-genai/<model>`) — it reads screenshots via its normal read tool, and with the android extension it can look at and drive the app directly for audits; emulator-lock discipline applies to any agent that touches a device.
5. **Classify.** Every claim in a report or comment states its evidence class: live observation, UI dump, capture file, or logcat, with the exact filename.
6. **Preserve.** Evidence lives under `.coordination/<round>-captures/` or the round's evidence dir: real files (a 0-byte stub is not evidence), and identical captures are cited once, not as distinct observations.
7. **Capture-set integrity (device campaigns).** Verify a screen's identity from its UI dump BEFORE naming the capture file after it. After any theme or density change, capture a probe frame and hash it: the md5 must differ from the previous state's probe, or the change did not take effect. Before banking a capture set, post an md5 list across the whole set. A vision-reader content pass over the banked set is a merge gate, not a formality.

For color/layout claims: name the palette token from `src/constants/theme.ts` you expect, then verify the rendered pixels or the UI tree against it. Pixel-count scripts supplement visual inspection; they never replace it and never ground an absence claim (step 4).

## Copy rules

User-visible copy, issue text, reports, hub lines: curly apostrophes, no em dashes, plain words. Commit only original example content (spec §5.1).

## Round protocol (delegated cycles)

The round hub (`.coordination/<round>.md`) is the durable record: timestamped one-line transitions, append-only. Blockers are FLAG lines, never notes. Heartbeat every ~30 min of work. Duration claims (elapsed, budget, lateness) are read from the shell clock (`date`) at post time, never estimated. Check the line count after every append (`wc -l` before and after). The coordinator side (amendment snapshots, hub backup, merge gates, PLAN.md lifecycle) lives in `round-ops.md`.

Cycle shape: impl agent → READY → reviewer (outcome: spec fit + gates) → review loop settles (verdict in, requested changes verified) → methodology auditor LAST, analyzing the complete trail: implementation, review findings, and how the implementer handled them. The auditor does NOT run in parallel with the reviewer — an audit that closes before the review loop ends cannot judge the review exchange (did the reviewer verify independently, did the implementer respond to findings or argue them away) or the trail the loop produced. Both fresh-context on the code; both must approve. The owner-present default gates the merge on both approvals, auditor LAST. Unattended rounds under standing owner authorization run the post-merge variant: merge on the reviewer's APPROVAL, the methodology audit landing after the merge as the process post-mortem — its scope is unchanged, the complete trail (packet 3 ran the variant 11/11 with clean audits, 2026-09-22). If the reviewer requests changes, the auditor waits for the re-verified fix, and its charter covers the full loop.

READY means the implementation is done and the evidence is either complete OR the pending part is device work blocked by the emulator queue: in that case the READY line lists the pending captures explicitly, the reviewer spawns immediately, the methodology auditor still waits for the review loop to settle (LAST), and the merge additionally gates on the capture set landing (or the reviewer explicitly accepting the partial evidence). A READY line carries its own identity: worktree + branch + HEAD, gate numbers vs the named baseline (or the baseline cited as not re-run), one evidence-class sentence with filenames, and the build state — dirty working-tree edits are a build input, so record the `git status --porcelain` count beside HEAD plus a working-tree fingerprint (`git diff HEAD | shasum -a 256`; tracked staged+unstaged edits only, not exact artifact identity; counts/hashes, never private content). Install time and an APK newer than the commit are not build identity. A READY posted alongside an open FLAG names the scope it covers, and the coordinator resolves the FLAG before spawning review (or records the review as in-map-only) — a FLAG and a READY posted in the same minute race each other (t8, 2026-09-22). After READY, STOP: no further hub lines, captures, or edits until the reviewer's verdict — post-READY work races the reviewer, and READY is the implementer's final row (no DONE follow-up; the verdict and the merge carry the cycle from there).

The READY gate standard: 0 failed like-for-like in the worktree; baseline failures are named and cited, ticket-mandated failures are fixed before READY, and assertions that cannot be derived from the seed module's shape go back through FLAG.

Receipts quote committed state: every receipt (gate numbers, line positions, test counts) names the tree it was taken from — the commit or "at HEAD" — never a session-live position a later edit moves (packet 3, 2026-09-22: receipt slips recurred across three cycles, one escaping review entirely, and they recurred after the matching audit axis was registered — rules live here, not only in the registry). A reviewer re-derivation lands its recipe beside the number: the base commit, the files copied, the command run — the verdict's numbers then carry a durable evidence layer, not prose alone.

The methodology auditor judges HOW the work was done — hypothesis discipline, capture quality, vision use, protocol compliance, ownership compliance — never whether the code is correct. Each auditor's verdict MUST end with one proposed audit axis for the next audits: the common failure case it believes the current axes would miss, stated as `Proposed axis: <name> — catches: <failure case>`; the coordinator folds accepted axes into future auditor charters, so each audit makes the next one sharper. Axes live with scores in `.agents/skills/methodology-auditor/axis_classification.md` (active set = top 5 by score).

Methodology findings that reveal a skill gap: post an `AUDIT-FINDING` hub line stating the gap and the proposed amendment. Agents never edit this skill mid-round; the coordinator verifies, consolidates, and folds accepted findings in (mechanics in `round-ops.md`). On a `SKILL-UPDATE` hub line, re-read the skill file before your next device interaction or claim; audits judge against the amended text.

Full-app visual audits use the vision audit swarm: `vision-audit-swarm.md`.

## Lessons

Appended by the coordinator at round close from methodology-audit findings.

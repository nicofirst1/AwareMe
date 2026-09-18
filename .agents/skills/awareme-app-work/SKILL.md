---
name: awareme-app-work
description: Implementing, reviewing, or auditing AwareMe (six endings) app changes here — UI verification with pi-droid and vision models, emulator protocol, evidence standards, and round protocol for delegated cycles.
version: 1.1.0
---

# Working on AwareMe

Orientation first: `AGENTS.md` (map), `spec.md` (the contract; §5.1 content rules, §13 hard constraints), `DECISIONS.md` (standing decisions). This skill covers HOW to work and verify here; those files cover WHAT is true.

## Setup

- Work in your assigned worktree; provision with `npm install --legacy-peer-deps --no-audit --no-fund`, then the expo-asset remedy from `DECISIONS.md` (`npm install expo-asset@57.0.16 --no-save`).
- Gates: `npm run typecheck`, `npx jest`, `npm run lint`. Baselines live in the round hub; compare like-for-like (your worktree's node_modules, not main's).
- Emulator: `./scripts/emulator.sh` (bounded boot wait). APK: `./scripts/rebuild-android.sh`.

## Emulator work with pi-droid

Load the pi-droid skills for the tool sets: `android-screen` (perception), `android-interact` (input), `android-automate` (waits, find-and-tap, scroll-until-found). Check `android-plugin` for capabilities before hand-rolling them.

- Device pools (parallel rounds): multiple emulators may run side by side, each a separate lockable resource. Boot clones on explicit ports (`emulator -avd <name> -port 5556 -no-snapshot -no-boot-anim -no-window -gpu swiftshader_indirect &`; serial = `emulator-<port>`). Target YOUR device only: set `ANDROID_SERIAL` in your pane (pi-droid falls back to it) or scope every adb/pi-droid call with `-s <serial>`; always scope `adb install`/`emu kill`/`reverse`/`kill-server` with `-s <serial>` when multiple devices are attached. Locks are PER DEVICE: `LOCK-CLAIM: emulator-5556-lock` (earliest-in-file wins, same discipline), and 5554-class shared devices may be designated read-only-reserved by the coordinator. RAM guardrail: before booting another emulator require free+inactive ≥ 4 GB AND swap free ≥ 1.5 GB AND fewer than 3 running emulators; prefer release-APK installs (no Metro) for parallel work; `pm clear` the app between occupants of a pooled device, or use ephemeral clones for hard isolation. Restore device config you changed (density, theme, locale) before releasing.
- Lock discipline: post a LOCK-CLAIM line before ANY adb interaction, including emulator boot, kill, and reboot-recovery - recovering a frozen emulator is device work, not an exemption. Claims posted as NOTE lines (or not posted) are protocol breaches. After appending a claim, re-read the hub tail immediately: if a competing claim sits earlier in the file, the earlier claim wins (the hub is append-only; file order is authoritative when pane clocks drift). A later claimant yields and re-queues. Release a lock only after completing all captures and preserving app state; a reinstall or `adb emu kill` without release destroys the holder's work.
- Tap by text/id/element index from annotated screenshots, via pi-droid tools. Prefer pi-droid tools for all taps; raw `adb shell input tap x y` is a fallback only when a pi-droid tool cannot express the step, and the fallback must be disclosed in the evidence trail. `adb kill-server` (or any adb daemon restart) is a shared-singleton, lock-relevant event: it disconnects every concurrent adb user on the host. Take the emulator lock AND post a FLAG before running it; prefer non-destructive recovery (`adb devices`, re-connect) over kill-server.
- Restore device state after work: stop the app, stop Metro, `adb reverse --remove-all`, verify port 8081 is free. Claims of restoration must be verified commands, not intentions.

## Verification methodology: vision-first, hypothesis-driven

The failure mode this skill exists to prevent: wandering around the app clicking randomly, then writing claims from memory.

1. **Hypothesis first.** From the ticket, write the expected behavior as a checkable statement before touching the device ("the DayField opens a weekday list with capitalized names").
2. **Targeted interaction.** Drive straight to the surface that tests the hypothesis. Take only taps/scrolls that answer a stated question.
3. **Capture.** Annotated screenshot + UI-tree dump for every claim. Pull a bounded logcat window around any crash/ANR or intent launch.
4. **Look at it.** The capture must be SEEN by a vision-capable reader before anything is claimed. If your own session model renders images, read the capture yourself and describe what it actually shows (colors, layout, text) against the hypothesis. If it does not (text-only model: the read tool rejects image attachments), delegate the visual inspection to a vision-capable agent (registry agent "eyes" or equivalent) and record its description verbatim as the evidence. A claim backed only by "the flow worked" is not evidence.
5. **Classify.** Every claim in a report or comment states its evidence class: live observation, UI dump, capture file, or logcat, with the exact filename.
6. **Preserve.** Evidence lives under `.coordination/<round>-captures/` or the round's evidence dir: real files, no 0-byte stubs, no duplicate files cited as distinct observations. If two captures are identical, say so and cite one.
7. **Capture-set integrity (device campaigns).** Verify a screen's identity from its UI dump BEFORE naming the capture file after it. After any theme or density change, capture a probe frame and hash it: the md5 must differ from the previous state's probe, or the change did not take effect. Before banking a capture set, post an md5 list across the whole set. A vision-reader content pass over the banked set is a merge gate, not a formality.

For color/layout claims: name the palette token from `src/constants/theme.ts` you expect, then verify the rendered pixels or the UI tree against it. Use pixel-count scripts to supplement visual inspection, not replace it.

## Copy rules

User-visible copy, issue text, reports, hub lines: curly apostrophes, no em dashes, plain words. Commit only original example content (spec §5.1).

## Round protocol (delegated cycles)

The round hub (`.coordination/<round>.md`) is the durable record: timestamped one-line transitions, append-only. Blockers are FLAG lines, never notes. Heartbeat every ~30 min of work.

Cycle shape: impl agent → READY → reviewer (outcome: spec fit + gates) and methodology auditor (process, below), both fresh-context, both must approve → merge. READY means the implementation is done and the evidence is either complete OR the pending part is device work blocked by the emulator queue: in that case the READY line lists the pending captures explicitly, the reviewer and auditor spawn immediately, and the merge additionally gates on the capture set landing (or the reviewer explicitly accepting the partial evidence). The methodology auditor judges HOW the work was done — hypothesis discipline, capture quality, vision use, protocol compliance, ownership compliance — never whether the code is correct. Each auditor's verdict MUST end with one proposed audit axis for the next audits: the common failure case it believes the current axes would miss, stated as `Proposed axis: <name> — catches: <failure case>`; the coordinator folds accepted axes into future auditor charters, so each audit makes the next one sharper. Axes live with scores in `.agents/skills/methodology-auditor/axis_classification.md` (active set = top 5 by score; auditors propose and score, the coordinator prunes). Methodology findings that reveal a skill gap go to the coordinator: auditors and impl agents never edit this skill mid-round; they post an `AUDIT-FINDING` hub line stating the gap and the proposed amendment, and the coordinator verifies, consolidates, and folds accepted findings in under the amendment discipline below. When the coordinator amends this skill, it posts a `SKILL-UPDATE` hub line and steers every working agent to re-read it; agents re-read the file on such a line before their next device interaction or claim, and audits judge against the amended text. Amendment discipline: every amendment is numbered (counted in the round hub); BEFORE applying one, the coordinator snapshots the current SKILL.md into `versions/<date>-r<N>-SKILL.md` in this skill's directory, and at every 3rd amendment reviews the axis registry (prune if more than 5 axes: drop the lowest score, oldest wins ties, sort the rest by score).

After merges: reviewer-checked doc duties land on main with the merge; captures backed up before worktree teardown; branches deleted; issues flipped to done.

## Lessons

Appended by the coordinator at round close from methodology-audit findings.

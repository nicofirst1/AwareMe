# Parallel device pools

Read before booting or driving a second emulator in a round. SKILL.md's device-work rules apply; this file adds the multi-device deltas. One device per cycle, and locks are PER DEVICE.

## Boot and address

- Boot clones on explicit ports: `emulator -avd <name> -port 5556 -no-snapshot -no-boot-anim -no-window -gpu swiftshader_indirect &`; serial = `emulator-<port>`.
- Scope every device-touching command with `-s <serial>` when multiple devices are attached: `adb install`, `emu kill`, `reverse`, `kill-server`.

## Targeting proof

Target YOUR device only, and PROVE the targeting at cycle start. `ANDROID_SERIAL` env alone has run panes on the wrong device even when passed via `--env` (r15, 2026-09-22: panes misrouted until each registered explicitly); the ground truth is each pane's pi-droid registration. So the first hub NOTE of every parallel cycle posts its targeting proof: the `android_devices` list output plus the `-s <serial>` scopes of its recent device calls. The coordinator cross-checks serials against the lock map before captures count.

## Capacity

Before booting another emulator, require all of: free+inactive RAM ≥ 4 GB, swap free ≥ 1.5 GB, fewer than 3 running emulators. Prefer release-APK installs (no Metro) for parallel work.

## Pool hygiene

- Locks are per device: `LOCK-CLAIM: emulator-5556-lock` (earliest-in-file wins, same discipline as SKILL.md). The coordinator may designate 5554-class shared devices read-only-reserved.
- `pm clear` the app between occupants of a pooled device, or use ephemeral clones for hard isolation.

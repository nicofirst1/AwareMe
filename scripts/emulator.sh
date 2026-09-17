#!/usr/bin/env bash
# Boot the Android emulator for local testing.
#
# Usage:  ./scripts/emulator.sh [avd-name]     (default: sixendings-audit)
# Then:   npm run android                      # build + install + Metro
#
# Creates the AVD on first use if a system image is available. Boots cold
# (-no-snapshot) on purpose: stale snapshots are the usual hang cause.
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

AVD_NAME="${1:-sixendings-audit}"

command -v emulator >/dev/null 2>&1 || {
  echo "emulator binary not found under $ANDROID_HOME/emulator" >&2
  exit 1
}

# First run: create the AVD if it does not exist yet.
if ! emulator -list-avds | grep -qx "$AVD_NAME"; then
  IMAGE="system-images;android-36;google_apis;arm64-v8a"
  echo "AVD '$AVD_NAME' not found. Creating it with $IMAGE"
  echo "(If sdkmanager asks about licenses: run 'sdkmanager --licenses' once, then re-run this script.)"
  sdkmanager "$IMAGE"
  echo no | avdmanager create avd -n "$AVD_NAME" -k "$IMAGE" -d pixel_7
fi

echo "Booting '$AVD_NAME' (cold boot)..."
"$ANDROID_HOME/emulator/emulator" -avd "$AVD_NAME" -no-snapshot -no-boot-anim &
EMU_PID=$!

echo "Waiting for boot, up to 5 minutes (emulator pid $EMU_PID)..."
for i in $(seq 1 60); do
  BOOT="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [ "$BOOT" = "1" ]; then
    echo "Booted after about $((i * 5))s. Now run: npm run android"
    exit 0
  fi
  sleep 5
done

echo "Not booted after 5 minutes - killing emulator (pid $EMU_PID)." >&2
kill "$EMU_PID" 2>/dev/null || true
exit 1

#!/usr/bin/env bash
# Boot the Android emulator for local testing.
#
# Usage:  ./scripts/emulator.sh [avd-name]     (default: sixendings-audit)
#         ./scripts/emulator.sh --force        (recreate the AVD, then boot)
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

AVD_NAME="sixendings-audit"
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) AVD_NAME="$arg" ;;
  esac
done

command -v emulator >/dev/null 2>&1 || {
  echo "emulator not found under $ANDROID_HOME/emulator" >&2
  exit 1
}

# If an emulator for this AVD is already running, do nothing.
if pgrep -f "qemu.*-avd $AVD_NAME" >/dev/null 2>&1; then
  echo "An emulator for '$AVD_NAME' is already running - nothing to do."
  exit 0
fi

IMAGE="system-images;android-36;google_apis;arm64-v8a"

# Create the AVD if the emulator cannot see it.
if ! emulator -list-avds | grep -qx "$AVD_NAME"; then
  echo "AVD '$AVD_NAME' not found - creating it with $IMAGE"
  echo no | avdmanager create avd -n "$AVD_NAME" -k "$IMAGE" -d pixel_7 --force
else
  [ "$FORCE" = "1" ] && echo no | avdmanager create avd -n "$AVD_NAME" -k "$IMAGE" -d pixel_7 --force
fi

echo "Booting $AVD_NAME (cold boot)..."
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

#!/usr/bin/env bash
# Boot the Android emulator (or iOS simulator) for local testing.
#
# Usage:
#   ./scripts/emulator.sh                       # boot Android AVD (awareme-audit)
#   ./scripts/emulator.sh --fresh               # boot + delete the app's data (fresh start)
#   ./scripts/emulator.sh --app                 # boot, then adb install the release APK
#   ./scripts/emulator.sh --force               # recreate the AVD, then boot
#   ./scripts/emulator.sh --ios                 # boot an iOS simulator instead
#   ./scripts/emulator.sh <avd-name> [flags]    # custom AVD name
#
# Notes:
#   - Installing/running the app itself is `npm run android` (dev build + Metro)
#     or `adb install -r android/app/build/outputs/apk/release/app-release.apk`.
#   - Cold boots only (-no-snapshot): stale snapshots are the usual hang cause.
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# Newer Android Studio puts AVDs in ~/.config/.android/avd; the emulator only
# searches $ANDROID_AVD_HOME / $ANDROID_SDK_HOME/avd / ~/.android/avd.
if [ -z "${ANDROID_AVD_HOME:-}" ] && [ -d "$HOME/.config/.android/avd" ]; then
  export ANDROID_AVD_HOME="$HOME/.config/.android/avd"
fi

APP_PACKAGE="com.nicolobrandizzi.awareme"
AVD_NAME="awareme-audit"
FORCE=0
FRESH=0
INSTALL_APK=0
IOS=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --fresh) FRESH=1 ;;
    --install) INSTALL_APK=1 ;;
    --ios) IOS=1 ;;
    -*) echo "Unknown flag: $arg (known: --force --fresh --install --ios)" >&2; exit 1 ;;
    *) AVD_NAME="$arg" ;;
  esac
done

if [ "$IOS" = "1" ]; then
  command -v xcrun >/dev/null 2>&1 || { echo "xcrun not found - Xcode tools required" >&2; exit 1; }
  DEVICE="$(xcrun simctl list devices available | grep -m1 -E "iPhone" | sed -E 's/^ +//; s/ \(.+\)//')"
  [ -n "$DEVICE" ] || { echo "No available iOS simulators found" >&2; exit 1; }
  UDID="$(xcrun simctl list devices available | grep -m1 "$DEVICE" | grep -oE '\(([0-9A-F-]{36})\)' | tr -d '()')"
  echo "Booting iOS simulator: $DEVICE ($UDID)"
  xcrun simctl boot "$UDID" 2>/dev/null || true
  open -a Simulator
  echo "Simulator booting. Now run: npm run ios   (build + install + Metro)"
  exit 0
fi

command -v emulator >/dev/null 2>&1 || {
  echo "emulator not found under $ANDROID_HOME/emulator" >&2
  exit 1
}

# If an emulator for this AVD is already running, skip straight to post-boot actions.
if pgrep -f "qemu.*-avd $AVD_NAME" >/dev/null 2>&1; then
  echo "An emulator for '$AVD_NAME' is already running."
  FRESH=0; INSTALL_APK=0; BOOTED=1
else
  IMAGE="system-images;android-36;google_apis;arm64-v8a"
  IMAGE_DIR="$ANDROID_HOME/system-images/android-36/google_apis/arm64-v8a"

  # Create the AVD if the emulator cannot see it (or recreation was forced).
  if ! emulator -list-avds | grep -qx "$AVD_NAME" || [ "$FORCE" = "1" ]; then
    echo "Creating AVD '$AVD_NAME' with $IMAGE (no device profile: system images ship no devices.xml)"
    sdkmanager "$IMAGE" >/dev/null 2>&1 || true
    echo no | avdmanager create avd -n "$AVD_NAME" -k "$IMAGE" --force
  fi

  echo "Booting $AVD_NAME (cold boot)..."
  "$ANDROID_HOME/emulator/emulator" -avd "$AVD_NAME" -no-snapshot -no-boot-anim &
  EMU_PID=$!

  echo "Waiting for boot, up to 5 minutes (emulator pid $EMU_PID)..."
  BOOTED=0
  for i in $(seq 1 60); do
    B="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [ "$B" = "1" ]; then
      echo "Booted after about $((i * 5))s."
      BOOTED=1
      break
    fi
    sleep 5
  done
  if [ "$BOOTED" != "1" ]; then
    echo "Not booted after 5 minutes - killing emulator (pid $EMU_PID)." >&2
    kill "$EMU_PID" 2>/dev/null || true
    exit 1
  fi
fi

# --fresh: remove the app and its data so the next launch starts from scratch.
if [ "$FRESH" = "1" ]; then
  echo "Deleting app data ($APP_PACKAGE)..."
  adb uninstall "$APP_PACKAGE" >/dev/null 2>&1 || echo "(app was not installed - nothing to delete)"
fi

# --install: side-load the release APK if it exists.
if [ "$INSTALL_APK" = "1" ]; then
  APK="android/app/build/outputs/apk/release/app-release.apk"
  if [ -f "$APK" ]; then
    adb install -r "$APK"
    echo "Installed. Launch the app on the emulator, or run 'npm run android' for the dev build."
  else
    echo "No APK at $APK - build one with ./scripts/rebuild-android.sh first." >&2
    exit 1
  fi
else
  echo "Now run: npm run android   (dev build + Metro)  |  --fresh wipes app data, --install side-loads the release APK"
fi

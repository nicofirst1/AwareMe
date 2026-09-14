#!/usr/bin/env bash
# Build an installable Android APK for Six Endings (local native build).
#
# Where the APK lands when this finishes:
#   android/app/build/outputs/apk/debug/app-debug.apk
# (debug-signed with the standard Android debug key -> sideloadable for testing,
#  not for the Play Store).
#
# Requirements: Android SDK (ANDROID_HOME set) + JDK 17 (JAVA_HOME set).
# This is a full native build and takes minutes. Extra args pass through to
# gradle, e.g. `./scripts/rebuild-android.sh assembleRelease` for a release APK
# (needs a signing config).
#
# Faster day-to-day loop (NO apk, runs in the Expo Go app): npx expo start --clear
#
# No local Android SDK? Cloud build (needs an Expo account + network):
#   npx eas build -p android --profile preview
#   -> prints a URL to download the finished APK.
#
set -euo pipefail
cd "$(dirname "$0")/.."

GRADLE_TASK="${1:-assembleDebug}"

# JDK: on macOS, auto-pick JDK 17 if JAVA_HOME isn't already set.
if [ -z "${JAVA_HOME:-}" ] && /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi

# Android SDK preflight — gradle can't build an APK without it.
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ] && ! command -v adb >/dev/null 2>&1; then
  cat >&2 <<'EOF'
ERROR: Android SDK not found (ANDROID_HOME/ANDROID_SDK_ROOT unset, adb not on PATH).
A local APK build needs it. Two options:
  1. Install the Android SDK (Android Studio, or: brew install --cask android-commandlinetools),
     set ANDROID_HOME, then re-run this script.
  2. Build in the cloud instead (no local SDK, needs a free Expo account + network):
       npx eas build -p android --profile preview
     ...which prints a URL to download the finished .apk
EOF
  exit 1
fi

# 1. Generate the native android/ project from app.json (idempotent).
npx expo prebuild --platform android

# 2. Assemble the APK.
cd android
./gradlew "$GRADLE_TASK"

# 3. Report where it is.
VARIANT="debug"; [ "$GRADLE_TASK" = "assembleRelease" ] && VARIANT="release"
APK="$PWD/app/build/outputs/apk/$VARIANT/app-$VARIANT.apk"
echo
echo "APK built: $APK"

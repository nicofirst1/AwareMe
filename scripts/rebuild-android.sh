#!/usr/bin/env bash
# Build an installable Android APK for Six Endings (local native build).
#
# Where the APK lands when this finishes:
#   android/app/build/outputs/apk/release/app-release.apk
# (debug-signed with the standard Android debug key -> sideloadable for testing,
#  not for the Play Store).
#
# Requirements: Android SDK (ANDROID_HOME set) + JDK 17 (JAVA_HOME set).
# This is a full native build and takes minutes. Extra args pass through to
# gradle, e.g. `./scripts/rebuild-android.sh assembleDebug` for a debug build
# instead — but a debug APK has no JS bundle packaged in and will only run
# while tethered to a live Metro server (`npx expo run:android`); installed
# standalone it fails with "Unable to load script".
#
# Faster day-to-day loop (NO apk, runs in the Expo Go app): npx expo start --clear
#
# No local Android SDK? Cloud build (needs an Expo account + network):
#   npx eas build -p android --profile preview
#   -> prints a URL to download the finished APK.
#
set -euo pipefail
cd "$(dirname "$0")/.."

GRADLE_TASK="${1:-assembleRelease}"

# JDK: on macOS, auto-pick JDK 17 if JAVA_HOME isn't already set.
if [ -z "${JAVA_HOME:-}" ] && /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi

# Android SDK: auto-detect a common install if the env vars aren't set
# (Homebrew's android-commandlinetools, or Android Studio's default path).
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  for d in "/opt/homebrew/share/android-commandlinetools" \
           "/usr/local/share/android-commandlinetools" \
           "$HOME/Library/Android/sdk" \
           "/usr/local/share/android-sdk"; do
    if [ -d "$d" ]; then export ANDROID_HOME="$d"; export ANDROID_SDK_ROOT="$d"; break; fi
  done
fi
[ -n "${ANDROID_HOME:-}" ] && export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# Preflight — gradle can't build an APK without the SDK.
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  cat >&2 <<'EOF'
ERROR: Android SDK not found. Install it with:
  brew install --cask android-commandlinetools
then re-run this script (it auto-detects the Homebrew SDK path).
Or build in the cloud (needs a free Expo account + network):
  npx eas build -p android --profile preview   # prints a URL to download the .apk
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

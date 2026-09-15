#!/usr/bin/env bash
# Build the RELEASE Android artifacts for Six Endings (local native build).
#
#   ./scripts/build-android.sh            # both (default)
#   ./scripts/build-android.sh --apk      # release APK  (sideload fallback)
#   ./scripts/build-android.sh --aab      # release AAB  (Play Store upload)
#
# Where the artifacts land:
#   android/app/build/outputs/apk/release/app-release.apk
#   android/app/build/outputs/bundle/release/app-release.aab
#
# Signing: if keystore.properties exists at the repo root (or android/;
# gitignored; owner-created — see docs/release-android.md for the keytool
# walkthrough), the release build is signed with the PRODUCTION keystore. If
# neither exists, the build falls back to the standard DEBUG keystore — fine
# for sideloading/testing, NOT uploadable to the Play Console. This script
# prints which one applied.
#
# Requirements: Android SDK (ANDROID_HOME or a standard install location) and
# JDK 17 (JAVA_HOME or auto-detected on macOS). Full native build: minutes.
#
# For the day-to-day debug loop use ./scripts/rebuild-android.sh (assembleDebug)
# or Expo Go via `npx expo start`. This script is for release artifacts only.
#
# Hard rule (issue 05): this script never creates, reads into the repo, or
# commits a keystore or password — it only builds with whatever
# android/keystore.properties the owner placed there.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="both"
case "${1:-}" in
  --apk) TARGET="apk" ;;
  --aab) TARGET="aab" ;;
  ""|--both) TARGET="both" ;;
  *) echo "usage: $0 [--apk|--aab]"; exit 2 ;;
esac

# JDK: on macOS, auto-pick JDK 17 if JAVA_HOME isn't already set.
if [ -z "${JAVA_HOME:-}" ] && /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi

# Android SDK: auto-detect a common install if the env vars aren't set.
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  for d in "/opt/homebrew/share/android-commandlinetools" \
           "/usr/local/share/android-commandlinetools" \
           "$HOME/Library/Android/sdk" \
           "/usr/local/share/android-sdk"; do
    if [ -d "$d" ]; then export ANDROID_HOME="$d"; export ANDROID_SDK_ROOT="$d"; break; fi
  done
fi
[ -n "${ANDROID_HOME:-}" ] && export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  cat >&2 <<'EOF'
ERROR: Android SDK not found. Install it with:
  brew install --cask android-commandlinetools
then re-run this script (it auto-detects the Homebrew SDK path).
EOF
  exit 1
fi

# Which signing will apply? (Mirrors scripts/with-android-signing.js: repo
# root is checked first because `expo prebuild` clears android/ wholesale.)
if [ -f keystore.properties ]; then
  echo "==> Signing: PRODUCTION keystore (keystore.properties at repo root)"
elif [ -f android/keystore.properties ]; then
  echo "==> Signing: PRODUCTION keystore (android/keystore.properties — note: wiped by the next prebuild; prefer the repo root)"
else
  echo "==> Signing: DEBUG fallback (no keystore.properties — sideload/test only, NOT for Play upload)"
fi

# 1. Generate/patch the native android/ project from app.json (idempotent).
#    This is where the with-android-signing plugin writes the signing config
#    and where app.json's version/versionCode land in build.gradle.
npx expo prebuild --platform android

cd android
if [ "$TARGET" = "apk" ] || [ "$TARGET" = "both" ]; then
  echo "==> assembleRelease (APK)"
  ./gradlew assembleRelease
fi
if [ "$TARGET" = "aab" ] || [ "$TARGET" = "both" ]; then
  echo "==> bundleRelease (AAB)"
  ./gradlew bundleRelease
fi
cd ..

echo
[ "$TARGET" != "aab" ] && echo "APK built: $PWD/android/app/build/outputs/apk/release/app-release.apk"
[ "$TARGET" != "apk" ] && echo "AAB built: $PWD/android/app/build/outputs/bundle/release/app-release.aab"

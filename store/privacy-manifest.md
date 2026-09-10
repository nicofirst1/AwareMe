# Apple privacy manifest (`PrivacyInfo.xcprivacy`)

What this file is, why it isn't checked into this repo yet, and exactly what it must say when it is generated.

## Why there's no file to commit yet

Apple's privacy manifest is a native iOS build artifact (`PrivacyInfo.xcprivacy`, an `.xcprivacy` plist bundled into the compiled app). This repo is pure Expo managed workflow — there is no `ios/` directory checked in (confirmed: `ls` at the repo root has no `ios/` or `android/`), consistent with `CLAUDE.md`'s build order putting a shippable native build at M7, not before. A manifest file has nowhere real to live until `expo prebuild` (or an EAS Build) generates the native `ios/` project.

When that happens, Expo's build tooling **auto-aggregates** every dependency's own `PrivacyInfo.xcprivacy` (several already ship one — see `dependency-audit.md`'s check below) into the final app bundle. Nothing needs to be hand-written for those. What this document specifies is the **app-level** manifest entry — the one declaring what _Six Endings itself_ (not a dependency) collects.

## What the app-level manifest must declare

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array/>
</dict>
</plist>
```

- **`NSPrivacyCollectedDataTypes`: empty array.** The app itself collects nothing — matches `privacy-declarations.md`.
- **`NSPrivacyTracking`: `false`.** No cross-app/cross-site tracking.
- **`NSPrivacyTrackingDomains`: empty.** No tracking domains, because there is no network activity at all (confirmed by grep in `privacy-declarations.md`).
- **`NSPrivacyAccessedAPITypes`: empty at the app level.** The app's own code (everything under `src/`) does not call any of Apple's "required-reason" APIs directly (`UserDefaults`, file timestamps, disk space, active keyboard, etc.) — those calls happen inside dependencies (`expo-constants`, `expo-notifications`, `expo-file-system`), each of which already ships its own manifest declaring its own reason. Re-listing them at the app level would be redundant/incorrect since the app-level manifest is specifically for the _app's_ direct API usage.

## How to wire this in once a native project exists

At M7 (native build), either:

1. Add an [Expo config plugin](https://docs.expo.dev/config-plugins/introduction/) or a `withXcodeProject`-style mod that writes this file into the generated `ios/` project during `expo prebuild`, keeping the source of truth in version control (e.g. as `store/PrivacyInfo.xcprivacy`, copied in by the plugin) rather than a manually-maintained Xcode-project file.
2. Or, if the native project is later checked in directly (bare workflow), add the file at `ios/SixEndings/PrivacyInfo.xcprivacy` and add it to the Xcode target's "Copy Bundle Resources" build phase.

Either way, the content above is what goes in it, and it should be revisited alongside `dependency-audit.md` any time a dependency changes.

## Play Store equivalent

Android has no direct equivalent artifact bundled in the APK/AAB — Google Play's data-safety declaration (`privacy-declarations.md`'s Play Console section) is filed through the Play Console web form, not a file in the app bundle. Nothing to check in for Android beyond keeping that form's answers in sync with this document.

# Android release runbook (Six Endings 1.1.0 → Google Play)

Everything needed to take this repo from `main` to a published Play listing.
Steps marked **[owner]** can only be done by a human (they need the Play
Console account, the signing password, or a purchase); everything else is
scripted in this repo. A wizard script will walk through the **[owner]** steps
at round end — this document is the reference it walks you through.

Sources of truth this runbook depends on — never retype from memory:

- What we declare about data: `store/privacy-declarations.md` (Play "Data
  safety" answers) + `store/dependency-audit.md` (the evidence).
- Listing text: `store/listing-copy.md`.
- Screenshots & graphic assets: `store/assets/` (produced per
  `store/screenshots-spec.md`).
- Public privacy policy: `privacy.md` at the repo root, served by GitHub Pages.

---

## 1. Versioning policy

| Artifact    | Where it is set | Value for this release |
| ----------- | --------------- | ---------------------- |
| `versionName` | `app.json` → `expo.version` | `"1.1.0"` |
| `versionCode` | `app.json` → `expo.android.versionCode` | `2` |

- `versionCode` is a monotonically increasing integer; Google Play rejects an
  upload whose `versionCode` is ≤ the live one. Bump it by 1 **every** Play
  submission, including rejected-then-fixed uploads.
- `versionName` is what users see. Bump the minor for feature releases,
  patch for fixes. The About screen shows `expo.version` — keeping the app's
  displayed version and the store version in lockstep is why the version
  lives in `app.json` and nowhere else.
- `npx expo prebuild` (run by the build scripts) copies both values into
  `android/app/build.gradle` at build time. Never edit `build.gradle`'s
  version by hand — the next prebuild would overwrite it.

## 2. Release signing **[owner]**

### 2.1 How it works

- `app.json` includes the config plugin `scripts/with-android-signing.js`.
  At build time it appends a signing block to the generated
  `android/app/build.gradle` that reads the signing properties (keys:
  `storeFile`, `storePassword`, `keyAlias`, `keyPassword`) from the first
  existing file of:
  1. `keystore.properties` at the **repo root** — the recommended location,
     because `npx expo prebuild` **clears the whole `android/` directory on
     every build** and would delete a file placed there.
  2. `android/keystore.properties` (alternate; wiped by the next prebuild).
  `storeFile` is resolved relative to the properties file's directory (or
  use an absolute path).
- `android/keystore.properties` and every `*.jks`/`*.keystore` file are
  **gitignored**. **Never commit a keystore or any password** — grep the
  staged diff if unsure: `git diff --staged | grep -i -E 'storePassword|keyPassword|\.jks|\.keystore'`.
- If `keystore.properties` is absent, release builds fall back to the debug
  keystore so development and CI stay green. Those builds are fine for
  sideloading/testing and **must not be uploaded to Play**.
- If the properties file exists but `storeFile` points at a missing file, the
  build **fails loudly** rather than silently producing a debug-signed
  release.

### 2.2 One-time: generate the production key **[owner]**

```bash
keytool -genkeypair -v \
  -keystore ~/keys/six-endings-release.keystore \
  -alias six-endings \
  -keyalg RSA -keysize 2048 -validity 10000
```

- Choose and store a strong password (password manager) — you will need it
  for every future update.
- Answer the distinguished-name prompts with your own name/organisation; only
  the CN matters to humans, nothing is validated against Play.
- Google no longer requires the upload key to differ from the app signing
  key: you upload an AAB signed with this key and Play re-signs with the
  app signing key it generates.

### 2.3 One-time: tell the build about it **[owner]**

Create `keystore.properties` at the **repo root** (it will not be committed —
verify with `git status`):

```properties
storeFile=/absolute/path/to/six-endings-release.keystore
storePassword=********
keyAlias=six-endings
keyPassword=********
```

### 2.4 One-time: back the key up **[owner]**

Losing the keystore means losing the ability to update the app (unless Play
App Signing's reset flow is used, which has constraints). Back up **both**
the `.keystore` file and the passwords (password manager, not a plaintext
note next to the file):

- Copy `~/keys/six-endings-release.keystore` to at least one second location
  (encrypted drive / password-manager attachment).
- Record: keystore password, key alias, key password.
- Verify the backup restores by running `keytool -list -v -keystore <backup>`
  and seeing alias `six-endings`.

## 3. Building the artifacts

```bash
./scripts/build-android.sh          # both artifacts
./scripts/build-android.sh --aab    # Play upload only
./scripts/build-android.sh --apk    # sideload fallback only
```

Outputs (record the paths used for a given release in the release notes):

- AAB (Play): `android/app/build/outputs/bundle/release/app-release.aab`
- APK (sideload): `android/app/build/outputs/apk/release/app-release.apk`

The first line the script prints states which signing applied — **check it
says `PRODUCTION keystore` before any Play upload**. `./scripts/
rebuild-android.sh` (debug APK for the day-to-day loop) is unchanged and
still works.

Sideload fallback: the APK must keep working throughout — install with
`adb install -r app-release.apk` or by opening the file on the device. A
debug-signed release APK installs side-by-side considerations: it has the
same `applicationId`, so it **replaces** a previously sideloaded copy and its
data.

## 4. Before every upload (re-verify, don't assume)

1. Gates: `npm run typecheck && npm test`.
2. Re-run the no-collection verification in `store/privacy-declarations.md`
   ("Re-verify before every release") — the grep over `src/` and the
   dependency diff against `store/dependency-audit.md`.
3. Confirm `privacy.md` still matches the app's actual behaviour.
4. Confirm `store/assets/` screenshots show the version being submitted.

## 5. Play Console — human-only steps **[owner]**

All application questions below have their worked-out answers in
`store/privacy-declarations.md`. Copy, don't rethink.

### 5.1 One-time app setup

1. Create app → name **Six Endings** (exact `store/listing-copy.md` spelling),
   default language English (United States), **App** (not game), **Free**.
2. **Privacy policy URL**: serve `privacy.md` via GitHub Pages (repo Settings
   → Pages → deploy from branch `main`, root). The page will live at
   `https://<account>.github.io/<repo>/privacy` — paste that URL into both
   Play's App content → Privacy policy and the listing.
3. **App access**: all functionality is available without restrictions (no
   credentials, no special access).
4. **Ads**: contains no ads.
5. **Content rating**: complete the IARC questionnaire honestly; the app has
   no user interaction, no sharing, no gore/gambling/etc. — expect **Everyone**.
6. **Target audience**: choose 13+ (a self-reflection journal is not directed
   at children; the store listing must not appeal to children either).
7. **Data safety** — the load-bearing form. Answers, verbatim from
   `store/privacy-declarations.md`:
   - *Does your app collect or share any of the required user data types?*
     **No.**
   - All subsequent collection/sharing questions: **No** / not collected.
   - Encryption in transit: not applicable — no data leaves the device.
   - Data deletion request: not applicable off-device; on-device deletion is
     in-app (Settings → "Delete all data").
8. **Government apps / financial features / health**: all **No**.

### 5.2 Store listing

- App name, short description, full description, category: copy from
  `store/listing-copy.md` (Health & Fitness category; no edits in the
  Console — that file is the reviewed wording).
- Phone screenshots: upload from `store/assets/screenshots/` (portrait,
  produced per `store/screenshots-spec.md` — real app, fixture text only).
- Feature graphic: `store/assets/feature-graphic-1024x500.png`.
- App icon: `store/assets/icon-512x512.png`.

### 5.3 Release

1. Production → Create new release.
2. Upload `app-release.aab` (the one built with the PRODUCTION keystore).
3. Release name: `1.1.0`. Release notes: one or two quiet sentences in the
   listing's voice (first release: "First public release.").
4. Review the release summary Play computes from the data-safety/content
   rating answers; start the rollout to production (full 100%).
5. Watch the Play Console's pre-launch report when it arrives; fix findings
   in a normal commit, bump `versionCode`, rebuild, re-upload.

## 6. Wizard note

The **[owner]** steps in this file (§2.2–2.4 key generation/backup, §5
Console forms) are exactly what the round-end wizard script will walk
through interactively. Until then, this document is sufficient on its own:
every Console answer above is a copy-paste from a file in this repo.

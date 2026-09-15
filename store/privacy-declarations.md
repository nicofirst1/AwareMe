# Privacy declarations

Source of truth for what goes into the App Store's "App Privacy" (nutrition label) form and the Play Store's "Data safety" form. Both ask the developer to self-declare what the app collects; this file is the worked-out, honest answer for Six Endings, checked against the actual dependency list and source tree (spec §9, ticket 20).

**The answer to every question on both forms is "no" / "not collected."** Six Endings makes no network calls of any kind. Everything it stores — stems, sessions, endings, reviews, settings, the notification schedule — lives in a single on-device SQLite database (`expo-sqlite`) and never leaves the device except when the person using the app explicitly exports it (§8) to a destination _they_ choose via the OS share sheet.

## How this was verified, not just asserted

- `grep -rn "fetch(\|XMLHttpRequest\|axios\|WebSocket\|http://\|https://" src/` finds no network call anywhere in the app's source — the one hit is a doc-comment URL in a code comment, not executable code.
- Every dependency (see `dependency-audit.md` in this directory) is either a local-only Expo native module (crypto RNG, filesystem, local SQLite, local biometric auth, local notification scheduling, deep-link URL parsing, share sheet, splash screen, status bar) or a pure in-memory/layout library (`react-native-safe-area-context`, `react-native-screens`). None of them phone home.
- `expo-notifications` is used only for `scheduleNotificationAsync`/`cancelScheduledNotificationAsync`/`getPermissionsAsync`/`requestPermissionsAsync` — all local scheduling APIs. The app never calls `getExpoPushTokenAsync`/`getDevicePushTokenAsync` or registers for remote push anywhere in `src/notifications/`.
- There is no analytics SDK, no crash reporter, no attribution SDK, no ad SDK, no account system, and no backend of any kind (spec §2, §9 — explicitly out of scope).

## Apple App Store: "App Privacy" (nutrition label)

Apple's form asks, per data category, whether the app collects it and if so whether it's linked to identity and used for tracking. Answer for every category (Contact Info, Health & Fitness, Financial Info, Location, Sensitive Info, Contacts, User Content, Browsing History, Search History, Identifiers, Purchases, Usage Data, Diagnostics, Other Data):

> **Data Not Collected** — "The developer does not collect any data from this app."

This is the literal, correct answer, not a simplification. In particular:

- **User Content** (the sentence-completion text people write): stays in the local SQLite file. It is never transmitted anywhere by the app itself, so it is not "collected" in Apple's sense (collection means transmission off-device or to the developer). Export is the person acting on their own file, not the app collecting anything.
- **Diagnostics / Usage Data / Identifiers**: no crash reporter, no analytics, no device or advertising identifier is read or sent anywhere.
- **Tracking**: the app does not track users across apps or websites (App Tracking Transparency does not apply — there is nothing to request permission for).

### App Store Connect answers (as of writing)

| Question                                             | Answer |
| ---------------------------------------------------- | ------ |
| Does this app collect any data?                      | No     |
| Does this app use the Advertising Identifier (IDFA)? | No     |
| Does this app track users?                           | No     |

## Google Play: "Data safety" form

Play's form is structured the same way (data types collected/shared, purpose, whether it's optional, whether it's encrypted in transit). For every data type listed (Personal info, Financial info, Health & fitness, Messages, Photos & videos, Audio files, Files & docs, Calendar, Contacts, App activity, Web browsing, App info & performance, Device or other IDs):

> **"Data is not collected"** for the whole app, and consequently **"Data is not shared"** (nothing to share).

### Play Console Data safety answers

| Question                                                              | Answer                                                                                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Does your app collect or share any of the required user data types?   | No                                                                                                                                 |
| Is all of the user data collected by your app encrypted in transit?   | N/A — no data leaves the device                                                                                                    |
| Do you provide a way for users to request that their data be deleted? | N/A for off-device data; on-device, Settings → "Delete all data" (§9) wipes everything locally, which is the only copy that exists |

## What "collected" deliberately excludes

Both stores' forms are about data the _developer_ receives, or that leaves the device. The local SQLite database, the notification schedule computed and stored entirely on-device (§6.4), and anything written during a session are the person's own data on their own device — not data collected by Six Endings or its developer. No developer-controlled server exists to collect it on.

## Re-verify before every release

This declaration is only true as long as no dependency changes it. Before shipping any release:

1. Re-run the `grep` above against `src/`.
2. Diff `package.json`'s dependency list against `dependency-audit.md`; any new dependency needs the same audit before this file can still be trusted, per spec §9 ("do not add a dependency that would make this false without flagging it") and `CLAUDE.md`'s network-capability rule.
3. If anything changes the answer, update this file, App Store Connect, and the Play Console Data safety form together — they must never drift from what the code actually does.

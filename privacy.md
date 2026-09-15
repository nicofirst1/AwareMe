# Six Endings — Privacy Policy

_Last updated: 2026-09-15. This policy describes version 1.1.0 of the Android app._

Six Endings is a private, on-device journaling app built around sentence completion. This policy is short because the app is simple about privacy: **everything you write stays on your device, and the app never sends anything anywhere.**

## What we collect

**Nothing.** Six Endings has no account, no sign-in, no analytics, no advertising, no crash reporting, and no tracking of any kind. There is no server. Your writing, your settings, and your history are stored in a single database file that lives on your device, inside the app's own storage, and never leaves it unless you choose to send it somewhere yourself.

The app works fully offline — it behaves exactly the same in airplane mode.

## What the app stores, and where

Everything the app knows is stored locally on your device:

- The sentence stems it ships with and any stems you add.
- Your sessions and the endings you write.
- Your settings (times for reminders, timer length, whether the app lock is on).
- A record of your review sessions.

None of this is transmitted anywhere by the app. There is no "sync", and there is nowhere for it to sync to.

If you use the app's **export** feature, the app hands a copy of your data (as a SQLite, JSON, or CSV file) to your device's standard share sheet, and you choose where it goes — a file, an email, anywhere you decide. That transfer is made by you, to a destination you choose; the app does not send anything on its own and does not know or record where the file went.

## Notifications

The app can remind you to write, at times you set, using your device's standard local notifications. Reminders are scheduled on the device by the operating system. Notification text is deliberately generic ("Time for your morning sitting.") and never contains any of your writing or the sentence you are working on. You can turn reminders off any time in your device settings or the app's settings.

## App lock (optional)

The app offers an optional lock using your device's biometrics (fingerprint or face) or device passcode. This uses your device's built-in authentication: the comparison happens in your device's secure hardware and the app only learns whether the check succeeded. The app never sees or stores your fingerprint, face, or passcode.

## Permissions

The Android app asks only for the permissions its features need:

- **Notifications** — so the reminder notifications you schedule can appear.
- **Biometric authentication** — for the optional app lock.

The Android build also declares a few framework-default permissions (INTERNET, VIBRATE and similar) that the underlying app framework includes whether or not an app uses them. This app performs no network communication of any kind — no browsing, no downloading, no uploading — which is why it works identically in airplane mode. The one thing that looks network-shaped is deliberate: the About screen offers a link to the developer's website, and tapping it opens your browser — your browser acting at your request, not the app communicating.

## Deleting your data

You can delete everything at any time from the app's settings ("Delete all data"), which erases the on-device database. Since that local copy is the only copy that exists, deletion is complete and immediate. Uninstalling the app removes it as well.

## Children

Six Endings is a general-audience self-reflection tool. It is not directed at children, and because it collects no data and has no online component, there is nothing for us to protect or mismanage.

## Attribution

Six Endings is built around sentence completion, a self-reflection technique developed by the psychologist Nathaniel Branden. The sentences included with the app are the official Sentence Completion I programme, used with permission from Leigh Branden, and are credited in the app's About screen.

## Contact

Six Endings is made by Nicolo' Brandizzi: [nicolobrandizzi.com](https://nicolobrandizzi.com/). If you have a question about this policy, that page is the way to reach the developer.

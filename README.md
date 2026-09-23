# AwareMe

AwareMe is a private, on-device journaling app for the sentence completion exercise developed by the psychologist Nathaniel Branden to increase self-awareness. You receive an incomplete sentence, a stem, and write several different endings to it, quickly, without stopping to evaluate them. A timer keeps the pen moving, editing is deliberately awkward, and nothing you write is scored, praised, or discarded. 

## What it does

- **Practice.** A morning practice walks you through the current stems, one at a time. An optional evening practice shows today’s morning endings and closes with a reflection. A weekly reflection gathers the week’s writing for re-reading, on the day you choose.
- **Uncensored writing mode.** Backspace is limited to the current word, earlier endings cannot be revisited, and cut, copy, and select are unavailable. When the timer ends, whatever is on screen is saved, including a half-typed ending. 
- **History and review.** Every session is kept, browsable, and full-text searchable. The exercise accrues its value over weeks, through re-reading.
- **Export.** You have full control over your date with lossless export to SQLite, JSON, and CSV.
- **Reminders.** Content-free local notifications at times you set. 
- **Optional lock.** An optional app lock uses your device’s biometrics or passcode.

## Privacy

Everything you write stays in a single SQLite database on your device. The app performs no network communication of any kind and behaves identically in airplane mode. There is no account, no sync, no analytics, and no advertising. The full policy is in [docs/privacy.md](docs/privacy.md).

## Quickstart

You need Node.js and npm; for device builds, Xcode (iOS) or Android Studio (Android).

```bash
npm install
npm start            # Expo dev server (Expo Go)
npm run ios          # native iOS development build
npm run android      # native Android development build

npm test             # Jest suite
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint

./scripts/rebuild-android.sh   # local release APK for sideloading
```

The app is built with Expo. `npm start` serves the day-to-day development loop; the `ios` and `android` scripts produce native development builds.

## Documentation

- [spec.md](docs/spec.md) is the contract: the complete implementation specification, written with RFC 2119 language.
- [docs/adr/](docs/adr/) records the architecture decisions.
- [docs/privacy.md](docs/privacy.md) is the privacy policy (published with the app's store listing; the release runbook in `docs/release-android.md` wires the URL).

## Seed content

The stems bundled with the app are the official Sentence Completion I programme, used with permission from Leigh Branden; the programme text is not included in this repository and is not licensed under its license. See [NOTICE](NOTICE).

Because that text is licensed, it lives in an owner-local, gitignored module: `src/db/seed/stems.content.ts` (never committed). The import in `src/db/seed/stems.ts` is static, and the module resolvers decide per tree which file backs it (`content-overlay.js`, wired into `metro.config.js` and `jest.resolver.js`): on a fresh clone the committed `src/db/seed/stems.content.example.ts` — original example content in the same shape — is served, so the repo builds, tests and runs without the licensed text; when the private module exists it wins and is resolved natively. To work on a full example tree, copy the example over the private path:

```sh
cp src/db/seed/stems.content.example.ts src/db/seed/stems.content.ts
```


## Project status

Feature-complete for v1.1: morning/evening practice, uncensored writing, history + review, lossless
export, reminders, optional lock. The seed-content overlay is verified end-to-end on
git-faithful trees (fresh clones build, test, and launch). Preparing the first public
release — see `docs/release-android.md` for the runbook.

## License and attribution

See [LICENSE](LICENSE). [NOTICE](NOTICE) records the provenance of the official programme.

The sentence completion method is Nathaniel Branden’s; his books describe the exercise and the thinking behind it. See [nathanielbranden.com](https://nathanielbranden.com/).

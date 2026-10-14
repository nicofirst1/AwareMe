<p align="center">
  <picture>
    <img src="assets/images/icon.png" width="180" alt="AwareMe">
  </picture>
</p>

<h1 align="center">AwareMe</h1>

<p align="center">
  <em>A quiet place to finish a sentence.</em>
</p>

<p align="center">
  <a href="https://github.com/nicofirst1/AwareMe/actions/workflows/ci.yml"><img src="https://github.com/nicofirst1/AwareMe/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/platform-iOS%20·%20Android-111111?style=flat-square" alt="iOS and Android">
  <img src="https://img.shields.io/badge/license-GPL--3.0-111111?style=flat-square" alt="GPL-3.0 license">
</p>

---

AwareMe is a private, on-device journaling app built around sentence completion, the self-reflection exercise developed by the psychologist Nathaniel Branden to increase self-awareness. You receive an incomplete sentence, a stem, and write several different endings to it, quickly, without stopping to evaluate them. A timer keeps the pen moving, editing is deliberately awkward, and nothing you write is scored, praised, or discarded.

## Try it out

- **Download for Android (APK).** [Get the latest release](https://github.com/nicofirst1/AwareMe/releases/latest) and install the signed APK. Every release is built and signature-verified by the public workflow in this repository.
- **Google Play.** Planned; the store listing is in preparation.
- **The dev process.** [Read the blog post](https://nicolobrandizzi.com/blog/awareme/) on how AwareMe was built.

## What it does

- **Practice.** A morning practice walks you through the current stems, one at a time. An optional evening practice shows today’s morning endings and closes with a reflection. A weekly reflection gathers the week’s writing for re-reading, on the day you choose.
- **Uncensored writing mode.** Backspace is limited to the current word, earlier endings cannot be revisited, and cut, copy, and select are unavailable. When the timer ends, whatever is on screen is saved, including a half-typed ending.
- **History and review.** Every session is kept, browsable, and full-text searchable. The exercise accrues its value over weeks, through re-reading.
- **Export.** You have full control over your data with lossless export to SQLite, JSON, and CSV.
- **Reminders.** Content-free local notifications at times you set.
- **Optional lock.** An optional app lock uses your device’s biometrics or passcode.

## Privacy

Everything you write stays on your device. The app performs no network communication of any kind, behaves identically in airplane mode, and has no account, no sync, no analytics, and no advertising. The full privacy policy is [docs/privacy.md](docs/privacy.md) in this repository.

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
- [docs/privacy.md](docs/privacy.md) is the privacy policy.

## Seed content

The stems bundled with the app are the official Sentence Completion I programme (see [License and attribution](#license-and-attribution)); the programme text is not included in this repository and is not licensed under its license. See [NOTICE](NOTICE).

Because that text is licensed, it lives in an owner-local, gitignored module: `src/db/seed/stems.content.ts` (never committed). The import in `src/db/seed/stems.ts` is static, and the module resolvers decide per tree which file backs it (`content-overlay.js`, wired into `metro.config.js` and `jest.resolver.js`): on a fresh clone the committed `src/db/seed/stems.content.example.ts` (original example content in the same shape) is served, so the repo builds, tests and runs without the licensed text; when the private module exists it wins and is resolved natively. To work on a full example tree, copy the example over the private path:

```sh
cp src/db/seed/stems.content.example.ts src/db/seed/stems.content.ts
```

## Project status

Feature-complete (current version 1.5.1): morning/evening practice, uncensored writing, history + review, lossless export, reminders, optional lock. The seed-content overlay is verified end-to-end on git-faithful trees (fresh clones build, test, and launch). Preparing the first public release; see `docs/release-android.md` for the runbook.

## License and attribution

Created by [Nicolo' Brandizzi](https://nicolobrandizzi.com/). The practice is sentence completion, a technique developed by the psychologist Nathaniel Branden and described at length in his own books; the sentences included with the app are the official Sentence Completion I programme, used with permission from Leigh Branden. Method and original programme: [Nathaniel Branden, nathanielbranden.com](https://nathanielbranden.com/). If the practice is useful to you, his books are the place to go deeper.

See [LICENSE](LICENSE). [NOTICE](NOTICE) records the provenance of the official programme.

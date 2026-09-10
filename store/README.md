# Store assets and privacy declarations

Everything needed to submit Six Endings to the App Store and Play Store, per `.scratch/six-endings-v1/issues/20-store-assets-privacy-declarations.md` and spec §9. Nothing here is app source code — this directory is submission paperwork and listing content.

- **`privacy-declarations.md`** — the App Store "App Privacy" and Play Store "Data safety" form answers (both: nothing collected), with the reasoning and the grep/audit trail behind that answer.
- **`dependency-audit.md`** — one row per runtime dependency: what it's for, where it's called from, and its network/data-collection capability. The evidence `privacy-declarations.md` is built on.
- **`privacy-manifest.md`** — what Apple's `PrivacyInfo.xcprivacy` app-level entry must say once a native iOS project exists (M7); explains why there's no file to check in yet under the current managed workflow.
- **`listing-copy.md`** — title, subtitle, full description, keywords, category, in the app's own quiet voice (spec §10). No Branden quotes.
- **`screenshots-spec.md`** — exact content for every store screenshot, including fully invented sample sentence-completion text. No screenshot may show anything resembling real personal disclosure (spec §9); this file specifies the fixture text so that's true by construction.

## Before every submission

1. Re-run the verification steps at the bottom of `privacy-declarations.md` against the current `src/` and `package.json` — the "nothing collected" claim must be re-checked, not assumed, every time a dependency changes.
2. Re-read `screenshots-spec.md`'s invented text before capturing new screenshots on a real device — never screenshot an actual populated history from testing/dogfooding; only the fixture text specified there.

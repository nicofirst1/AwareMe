# Store screenshot spec

Exact content for every store screenshot, so capturing them is mechanical: seed the app with this fixture data (or type it in by hand on a real device/simulator), then screenshot the listed screen. Every stem below is from the real seed set (`src/db/seed/stems.ts`) — using real stems is fine and representative. **Every ending shown below was invented for this document.** None are copied from, adapted from, or based on any real person's writing, real journaling sample, training data, or the web. They are deliberately short, generic, and mundane — illustrative filler that demonstrates the mechanic (several quick, unpolished, sometimes repetitive endings to the same stem) without resembling a specific real disclosure. Per spec §9 / ticket 20, this constraint is absolute: nothing resembling real personal disclosure ships in a screenshot.

## Screenshot 1 — Writing session, mid-way

**Screen:** `/write`, `session.phase === 'active'`, on the third of six endings.

**Stem:** "If I brought five percent more awareness to how I spend my mornings" (real seed stem, category `awareness`).

**Endings already submitted (shown dimmed above the input, per `write.tsx`):**

1. I'd probably notice I'm on my phone before I've said good morning to anyone.
2. I would make the coffee instead of just wanting it made.
3. I'd realize how much of it is just avoiding starting.

**Active field (in the input, not yet submitted):**

> I would actually look out the window in

**Timer:** progress bar roughly two-thirds full (illustrate the bar, not a numeral — matches ticket 19's "non-alarming progress element, not a countdown").

**Caption for the store listing (optional overlay text, if the listing uses captioned screenshots):** "A sentence. A timer. Nothing to polish."

## Screenshot 2 — Home screen

**Screen:** `/index`.

No sample text needed — this screen shows only "Six Endings" / "A quiet place to finish a sentence." and the navigation list (Start now, Browse stems, History, Review, Export, Import, Settings). Use as-is, no fixture data required.

**Caption:** "Everything stays on your device."

## Screenshot 3 — History list

**Screen:** `/history`, default (unfiltered) view.

**Fixture sessions (most recent first, each a stem + a short snippet):**

| Date       | Stem                                                     | Snippet shown                       |
| ---------- | -------------------------------------------------------- | ----------------------------------- |
| Today      | "The conversation I keep rehearsing but never having is" | one about asking for something back |
| Yesterday  | "A promise I made to myself and quietly dropped is"      | one about a book left unfinished    |
| 3 days ago | "If I said the thing I have not been saying"             | one about a scheduling conflict     |
| 5 days ago | "The goal I keep restating instead of starting is"       | one about a language course         |

Exact invented ending text for the snippets (first ending of each session, as it would render in the list row):

1. "That I'd like a heads-up next time, not an apology after."
2. "The one about the mountains, still on the nightstand."
3. "That Thursday doesn't actually work, every single week."
4. "Learning to read a menu in another language, badly."

**Caption:** "Read anything back, any time."

## Screenshot 4 — Review mode

**Screen:** `/review`, the reread list (before the meta-stem).

**Fixture:** the four sessions from Screenshot 3, shown with their stem and one ending each — reuse the same invented text so the fixture set is internally consistent across screenshots.

**Meta-stem shown below the list:** "Reading these back, the thing I notice myself circling is" (real seed meta-stem).

**Caption:** "A weekly reread, never a score."

## Screenshot 5 — Settings

**Screen:** `/settings`, scrolled to show the notification window and the uncensored-mode toggle.

No invented personal text needed — every control on this screen is a number, a time, or an on/off chip. Use the app's actual default values (1 session/day, 6 endings, 90-second timer, 08:00–21:00 window).

**Caption:** "No account. No network. No ads."

## Screenshot 6 (optional, Play Store allows more) — Stem library

**Screen:** `/stems`, unfiltered.

Shows the real seed stem list (all original text already in the repository, not invented for this document — see `src/db/seed/stems.ts`). No user-written endings visible on this screen, so no invented-text concern here.

**Caption:** "Write your own stems, or use what's here."

## Video preview (optional, if the store supports it)

If a preview video is produced: 15–20 seconds, screen-recorded from a device with the fixture data above already loaded (Screenshot 1's session), showing the timer's progress bar animate and one ending get typed and submitted (typing the same invented text from Screenshot 1's active field, "I would actually look out the window in", to completion: "I would actually look out the window instead of the phone."). No voiceover needed; if captions are added, reuse the screenshot captions above.

## How to load this fixture data for capturing

Two options, in order of preference:

1. **By hand**, on a simulator/device with a fresh install: run through onboarding, then type the sessions above via `/write` in order (oldest first) so History and Review show them in the right order. Slowest but guarantees the screenshots match exactly what a real install produces — no debug-only code path is exercised.
2. **Via `/debug`** (dev-only, gated by `__DEV__`, see `src/app/debug.tsx`) to confirm the data landed correctly before screenshotting the real screens. `/debug` itself must never appear in a store screenshot — it's a raw table dump, not part of the product surface (see its own header comment).

Do not write a seeding script that ships in the app bundle or a debug menu action that inserts this fixture data — that would be new production code whose only purpose is screenshot capture, which is scaffolding this ticket doesn't ask for and the app's own "no stubs for out-of-scope features" rule (CLAUDE.md) argues against. Typing six short sentences by hand is faster than building and maintaining that.

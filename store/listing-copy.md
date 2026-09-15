# Store listing copy

Title, subtitle/short description, full description, and keywords for the App Store and Play Store listings. Written in the app's own voice (spec §10: restrained, text-first, quiet — no hype, no exclamation points, no gamification language, no evaluative claims about outcomes). No text is quoted from Nathaniel Branden's books; he is credited by name only, the same way the in-app "About the method" screen (`src/app/about-method.tsx`) already does.

## App name / title

**Six Endings**

(Matches `app.json`'s `expo.name`. Not changed for the store listing — one name everywhere avoids a mismatch between what's installed and what was searched for.)

## Subtitle (App Store, 30 characters) / short description (Play, 80 characters)

> A quiet place to finish a sentence.

(35 characters — fits Play's 80-character short description field. For Apple's stricter 30-character subtitle field, use:)

> Finish the sentence, quickly.

(30 characters exactly.)

## Full description

```
Six Endings is a private, on-device journaling app built around sentence
completion — a self-reflection technique in which you're given the start
of a sentence and write several different endings to it, quickly, without
stopping to judge what comes out.

You're shown an unfinished sentence. You finish it, several times in a
row, against a quiet timer. Repetition is expected. Nonsense is expected.
The point isn't the polished answer — it's what shows up when you don't
have time to edit yourself.

What the app does:

— Gives you an unfinished sentence and a short timer, then gets out of
  the way.
— Keeps a private record of everything you write, organized by date and
  by sentence.
— Lets you write your own sentences, or import a list of your own.
— Can send a quiet reminder at the times you set each day, plus a reminder
  for the weekly reflection — all local, on-device notifications. A reminder
  never shows what the sentence is.
— Offers a weekly review: reread what you wrote, then finish one more
  reflective sentence about it.
— Exports everything — every sentence, every ending, including anything
  you deleted — as a SQLite file, a JSON file, or a set of CSV files, any
  time, in two taps.

What the app doesn't do:

— No account, no sign-in, no cloud sync.
— No network access at all — it works exactly the same in airplane mode.
— No analytics, no tracking, no ads.
— No scoring, no evaluation, nothing to win or lose. What you write is
  never judged, only kept. A quiet, descriptive note of milestones (your
  first sessions, a week of mornings) appears only after a session has
  ended — never while you are writing, and never a demand to return.
— Nothing you write ever leaves your device unless you choose to export
  it yourself.

An optional app lock (Face ID, Touch ID, or your device passcode) is
available in Settings for anyone who shares a device.

This app is built around sentence completion, a technique developed by
the psychologist Nathaniel Branden and described at length in his own
books. The sentences in this app are original material written in the
spirit of his method, not excerpts from his work — if the practice is
useful to you, his books are the place to go deeper.
```

## Keywords (App Store, comma-separated, 100-character limit)

```
journal,journaling,sentence completion,self reflection,writing,private,offline,mindfulness,diary
```

(Kept to plain descriptive terms that match what the app actually is — no competitor names, no unrelated trending terms.)

## Promotional text (App Store, 170 characters, editable without a new build)

> A quiet, private way to finish a sentence, several times, against a timer. Nothing you write ever leaves your device unless you choose to export it.

## Category

Primary: **Health & Fitness** (App Store) / **Health & Fitness** (Play, "Journal" or "Self-improvement" if the store offers a finer-grained option). Secondary/alternate if the store requires one: **Lifestyle**. Not "Games" or "Social" — the app has neither mechanic.

## What NOT to do here

- No Branden quotes anywhere in listing copy — same constraint as the seed stems (spec §5.1) and `about-method.tsx`, extended to marketing text.
- No claims of therapeutic or medical benefit ("heals," "treats," "cures," "therapy") — this is a self-reflection tool, not a clinical one, and the app itself makes no such claims (§13.6, no evaluation/interpretation).
- No superlatives or hype language ("life-changing," "the best," "finally"). Matches the in-app copy's register exactly (see `src/app/index.tsx`, `src/app/onboarding.tsx`, `src/app/about-method.tsx` for the existing voice to match).

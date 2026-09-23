/**
 * Audit seed DB (layout-audit-2026-09-15): builds a populated
 * `six-endings.db` for *visual* auditing — enough realistic, backdated
 * content that every screen has something honest to show (History rows,
 * session details, review periods, streaks, badges, a user stem).
 *
 * Tooling, not product code: never shipped, never imported by src/. Run
 * via the esbuild bundle step in `scripts/audit-seed-db.sh <output-path>`,
 * which aliases `expo-crypto` to a Node shim (see audit-expo-crypto-shim.ts).
 *
 * The corpus is deliberately modest and generic: a few weeks of practices,
 * 3-6 endings each, one review, two user stems. All ending text here is
 * placeholder prose written for these screenshots — it is never shown to a
 * real user and never mixed into a real corpus.
 */
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '@/db/migrate';
import { Repository } from '@/db/repository';
import { nodeSqliteExecutor } from '@/db/testSupport/nodeSqliteExecutor';

const USAGE = 'usage: audit-seed-db.ts <output-db-path>';

function iso(daysAgo: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

interface PracticeSpec {
  daysAgo: number;
  hour: number;
  minute: number;
  stemIndex: number;
  endings: string[];
  reason: 'timeout' | 'user_done';
}

/** Three weeks of practices, dense enough that every aggregate screen has rows. */
const PRACTICES: readonly PracticeSpec[] = [
  {
    daysAgo: 21,
    hour: 8,
    minute: 12,
    stemIndex: 0,
    endings: [
      'my phone would stay face-down until the coffee was finished.',
      'I would notice the light in the kitchen before reading anything.',
      'the first hour would belong to me, not to my inbox.',
    ],
    reason: 'user_done',
  },
  {
    daysAgo: 21,
    hour: 21,
    minute: 40,
    stemIndex: 4,
    endings: [
      'the part that wants rest before it has earned anything.',
      'the part that replays old conversations at 2am.',
      'the part I would rather describe as laziness than as fear.',
    ],
    reason: 'timeout',
  },
  {
    daysAgo: 19,
    hour: 8,
    minute: 5,
    stemIndex: 8,
    endings: [
      'I would stop waiting for the day to tell me what it is for.',
      'the calendar would be mine to draw on, not a list of debts.',
      'I would own the difference between what happened and what I chose.',
      'small things would stop being evidence about my character.',
    ],
    reason: 'user_done',
  },
  {
    daysAgo: 17,
    hour: 22,
    minute: 3,
    stemIndex: 20,
    endings: [
      'the promise to read the book that is still on the shelf.',
      'that I would write every morning, which I keep re-making.',
      'the promise to call my sister more often.',
    ],
    reason: 'timeout',
  },
  {
    daysAgo: 14,
    hour: 7,
    minute: 55,
    stemIndex: 12,
    endings: [
      'to whoever made the decision without me.',
      'at the meeting, out loud, in front of everyone.',
      'that the deadline was unrealistic on the day it was set.',
    ],
    reason: 'user_done',
  },
  {
    daysAgo: 12,
    hour: 8,
    minute: 20,
    stemIndex: 16,
    endings: [
      'I want work that leaves something behind.',
      'I want fewer projects, held longer.',
      'I want the kind of competence that is quiet about itself.',
      'I want time with the people who will still be there in ten years.',
      'honestly, I want to stop performing ambition.',
    ],
    reason: 'timeout',
  },
  {
    daysAgo: 11,
    hour: 21,
    minute: 15,
    stemIndex: 2,
    endings: [
      'the unpaid invoice I keep not sending.',
      'that I agreed to a second meeting I did not want.',
      'the book I say I have no time to read.',
    ],
    reason: 'user_done',
  },
  {
    daysAgo: 9,
    hour: 8,
    minute: 30,
    stemIndex: 13,
    endings: [
      'the morning to myself, before anyone else wakes.',
      'credit where I actually did the work.',
      'to be asked, instead of always offering.',
    ],
    reason: 'timeout',
  },
  {
    daysAgo: 7,
    hour: 21,
    minute: 50,
    stemIndex: 10,
    endings: [
      'another year of waiting for the right moment.',
      'watching others build the thing I keep describing.',
      'a small, private kind of safety that costs everything else.',
    ],
    reason: 'user_done',
  },
  {
    daysAgo: 5,
    hour: 8,
    minute: 10,
    stemIndex: 22,
    endings: [
      'I would say no by default and mean it.',
      'the promises I make on Mondays would survive to Friday.',
      'my calendar and my stated priorities would finally match.',
    ],
    reason: 'timeout',
  },
  {
    daysAgo: 4,
    hour: 21,
    minute: 30,
    stemIndex: 6,
    endings: [
      'the tiredness itself, without arguing with it.',
      'that I wanted the smaller apartment all along.',
      'the fact that this is hard, and that I am still doing it.',
    ],
    reason: 'user_done',
  },
  {
    daysAgo: 2,
    hour: 8,
    minute: 15,
    stemIndex: 18,
    endings: [
      'the important work would get the first three hours, not the leftovers.',
      'I would protect a two-hour block the way I protect meetings.',
      'the hours I actually have would become visible again.',
      'the side project would stop being a side project.',
    ],
    reason: 'user_done',
  },
  {
    daysAgo: 1,
    hour: 8,
    minute: 2,
    stemIndex: 1,
    endings: [
      'that I check my phone the moment a task gets difficult.',
      'the coffee I drink without tasting it.',
      'that I say yes in the first two seconds of every request.',
    ],
    reason: 'timeout',
  },
  {
    daysAgo: 0,
    hour: 8,
    minute: 8,
    stemIndex: 23,
    endings: [
      'I would send the email I have drafted four times.',
      'I would ask the question everyone is politely avoiding.',
      'I would take the weekend without announcing it.',
    ],
    reason: 'user_done',
  },
];

function main(): void {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error(USAGE);
    process.exit(1);
  }
  // A fresh file, not a stale schema: the audit always wants a known state.
  rmSync(outPath, { force: true });

  const db = new DatabaseSync(outPath);
  const executor = nodeSqliteExecutor(db);
  migrate(executor, '1.0.0');
  const repo = new Repository(executor);
  repo.seedIfEmpty();
  repo.setOnboardingComplete();

  const stems = repo.listAllStems().filter((s) => s.origin === 'seed' && s.deleted_at === null && s.active === 1);
  if (stems.length === 0) throw new Error('no seed stems found — seedIfEmpty failed?');

  for (const practice of PRACTICES) {
    const stem = stems[practice.stemIndex % stems.length];
    const startedAt = iso(practice.daysAgo, practice.hour, practice.minute);
    const sessionId = repo.createSession({
      stemId: stem.id,
      stemTextSnapshot: stem.text,
      origin: practice.hour >= 17 ? 'manual' : 'manual',
      targetEndings: 6,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt,
      deviceLocale: 'en_US',
    });

    let t = new Date(startedAt).getTime();
    practice.endings.forEach((text, i) => {
      t += 9000 + text.length * 45; // plausible per-ending pace
      const at = new Date(t).toISOString();
      repo.recordFirstKeypress(sessionId, i + 1, at);
      repo.autosaveEndingText(sessionId, i + 1, text, 2 + (i % 3), at);
      repo.submitEnding(sessionId, i + 1, at);
    });
    repo.finalizeSession(sessionId, practice.reason, new Date(t + 2000).toISOString());
  }

  // One completed review, ~8 days ago, over the preceding week.
  const reviewEnd = iso(8, 9, 0);
  const reviewStart = iso(15, 9, 0);
  repo.createReview({
    periodStart: reviewStart,
    periodEnd: reviewEnd,
    sessionIds: repo.listSessionsForReview(reviewStart, reviewEnd).map((r) => r.session.id),
    metaStemText: 'If any of this week\'s writing pointed somewhere, it was',
    reflectionText: 'that the avoidant endings keep being about the same two things: the inbox and the unfinished project.',
    createdAt: iso(8, 9, 3),
  });

  // Two user-authored stems: one fully categorized, one bare — mirrors a
  // real library that mixes seed rows with personal ones.
  repo.addStem({
    text: 'The thing I would write if nobody ever read it is',
    category: 'purpose',
    origin: 'user',
    timeOfDay: 'morning',
  });
  repo.addStem({ text: 'Right now, honestly,', category: null, origin: 'user', timeOfDay: 'evening' });

  // `--open`: one practice left in flight, started ~30s ago — four endings
  // already submitted and stacked, a fifth half-typed. This is the exact
  // state the owner's write-screen finding is about (timer signals scrolling
  // away beneath the stack), so the write-active screenshots are reproducible
  // without hand-driving the session through idb every round. The 30s head
  // start matters: `useWritingSession` auto-finalizes a resumed session whose
  // timer has already elapsed (ADR-0001), so the practice must still be inside
  // its 90s window when the app mounts.
  if (process.argv[3] === '--open') {
    // The LAST stem in the morning queue (`getActiveStemsForTimeOfDay`'s own
    // order — uuidv7 ids make list order uncorrelated with seed order, so
    // this must be computed, not assumed), so a timeout lands on the
    // practice's final stem — the write screen's completion block (badges,
    // "Saved.") only renders there, and this audit wants that state too.
    const queue = repo.getActiveStemsForTimeOfDay('morning');
    const openId = queue[queue.length - 1]?.id;
    const stem = stems.find((s) => s.id === openId) ?? queue[queue.length - 1];
    const startedAt = new Date(Date.now() - 30_000).toISOString();
    const sessionId = repo.createSession({
      stemId: stem.id,
      stemTextSnapshot: stem.text,
      origin: 'manual',
      targetEndings: 6,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt,
      deviceLocale: 'en_US',
    });
    const openEndings = [
      'I would get up before the rest of the house does.',
      'I would write for fifteen minutes before opening anything else.',
      'the day would start with a sentence instead of a feed.',
      'I would know what I think before I read what everyone else thinks.',
    ];
    let t = new Date(startedAt).getTime();
    openEndings.forEach((text, i) => {
      t += 4000 + text.length * 20;
      const at = new Date(t).toISOString();
      repo.recordFirstKeypress(sessionId, i + 1, at);
      repo.autosaveEndingText(sessionId, i + 1, text, 1 + (i % 3), at);
      repo.submitEnding(sessionId, i + 1, at);
    });
    // Fifth ending: begun, half-typed, not submitted — the live field.
    const openAt = new Date(t + 9000).toISOString();
    repo.recordFirstKeypress(sessionId, 5, openAt);
    repo.autosaveEndingText(sessionId, 5, 'and if the morning belonged to me th', 2, openAt);
    console.log(`+ 1 open practice (4 submitted endings, 1 half-typed field)`);
  }

  console.log(`seeded ${outPath}: ${PRACTICES.length} practices, 1 review, 2 user stems`);
}

main();
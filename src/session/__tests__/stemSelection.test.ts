import { selectStem, type SelectableStem, type StemUsage } from '../stemSelection';

const NOW = '2026-09-10T12:00:00.000Z';

function stem(id: string, weight = 1.0, category: string | null = null): SelectableStem {
  return { id, weight, category };
}

describe('selectStem', () => {
  it('returns null for zero candidates', () => {
    expect(selectStem([], [], NOW, 1)).toBeNull();
  });

  it('returns the only candidate for one stem, regardless of history or seed', () => {
    const only = stem('a');
    expect(selectStem([only], [], NOW, 1)).toBe(only);
    expect(selectStem([only], [{ stemId: 'a', category: null, startedAt: NOW }], NOW, 999)).toBe(only);
  });

  it('never hard-excludes: a stem used seconds ago can still be drawn given enough trials', () => {
    const candidates = [stem('a'), stem('b')];
    const history: StemUsage[] = [{ stemId: 'a', category: null, startedAt: NOW }];

    const results = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      const picked = selectStem(candidates, history, NOW, seed);
      results.add(picked!.id);
    }
    expect(results.has('a')).toBe(true);
    expect(results.has('b')).toBe(true);
  });

  it('is a pure function: same inputs always produce the same output', () => {
    const candidates = [stem('a'), stem('b'), stem('c')];
    const history: StemUsage[] = [{ stemId: 'b', category: null, startedAt: NOW }];

    const first = selectStem(candidates, history, NOW, 42);
    for (let i = 0; i < 10; i++) {
      expect(selectStem(candidates, history, NOW, 42)).toEqual(first);
    }
  });

  it('different seeds can produce different draws over a candidate set', () => {
    const candidates = [stem('a'), stem('b'), stem('c'), stem('d')];
    const picks = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      picks.add(selectStem(candidates, [], NOW, seed)!.id);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('applies a strong recency penalty to a stem used within 2 days (weight ×0.05)', () => {
    const candidates = [stem('recent'), stem('other')];
    const history: StemUsage[] = [
      { stemId: 'recent', category: null, startedAt: '2026-09-09T12:00:00.000Z' }, // 1 day ago
    ];

    let recentCount = 0;
    const trials = 2000;
    for (let seed = 0; seed < trials; seed++) {
      if (selectStem(candidates, history, NOW, seed)!.id === 'recent') recentCount++;
    }
    // effective weight ratio is 0.05:1 -> ~1/21 draws, well under an unpenalised ~50%
    expect(recentCount / trials).toBeLessThan(0.15);
    expect(recentCount).toBeGreaterThan(0); // never hard-excluded
  });

  it('applies a lighter recency penalty to a stem used within 7 days but not 2 (weight ×0.2)', () => {
    const candidates = [stem('midRecent'), stem('other')];
    const history: StemUsage[] = [
      { stemId: 'midRecent', category: null, startedAt: '2026-09-05T12:00:00.000Z' }, // 5 days ago
    ];

    let count = 0;
    const trials = 2000;
    for (let seed = 0; seed < trials; seed++) {
      if (selectStem(candidates, history, NOW, seed)!.id === 'midRecent') count++;
    }
    // effective weight ratio is 0.2:1 -> ~1/6 draws
    const rate = count / trials;
    expect(rate).toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.3);
  });

  it('does not penalise a stem used more than 7 days ago', () => {
    const candidates = [stem('old'), stem('other')];
    const history: StemUsage[] = [
      { stemId: 'old', category: null, startedAt: '2026-08-01T12:00:00.000Z' }, // >7 days ago
    ];

    let count = 0;
    const trials = 2000;
    for (let seed = 0; seed < trials; seed++) {
      if (selectStem(candidates, history, NOW, seed)!.id === 'old') count++;
    }
    const rate = count / trials;
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.65);
  });

  it('lightly prefers a category unseen in the last 14 days', () => {
    const candidates = [stem('a', 1.0, 'awareness'), stem('b', 1.0, 'purpose')];
    const history: StemUsage[] = [
      { stemId: 'a', category: 'awareness', startedAt: '2026-09-08T12:00:00.000Z' },
    ];

    let purposeCount = 0;
    const trials = 3000;
    for (let seed = 0; seed < trials; seed++) {
      if (selectStem(candidates, history, NOW, seed)!.id === 'b') purposeCount++;
    }
    // 'purpose' unseen in 14d gets a boost, 'awareness' seen 2 days ago gets
    // both the recency AND no category boost -> purpose should dominate.
    expect(purposeCount / trials).toBeGreaterThan(0.5);
  });

  it('handles exactly two eligible stems with no history', () => {
    const candidates = [stem('a'), stem('b')];
    const picks = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      picks.add(selectStem(candidates, [], NOW, seed)!.id);
    }
    expect(picks.size).toBe(2);
  });
});

import { generateFireTimes, MIN_GAP_MS, type ScheduleInput } from '../scheduling';

const NOW = new Date(2026, 8, 10, 0, 0, 0, 0); // 2026-09-10 local midnight

function baseInput(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    windows: [{ start: '08:00', end: '21:00' }],
    sessionsPerDay: 1,
    now: NOW,
    seed: 1,
    ...overrides,
  };
}

describe('generateFireTimes: window boundaries', () => {
  it('never produces a time before its window start or at/after its window end, on any day', () => {
    const input = baseInput({ sessionsPerDay: 3, seed: 7 });
    const times = generateFireTimes(input);
    for (const t of times) {
      const startOfDay = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 8, 0, 0, 0);
      const endOfDay = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 21, 0, 0, 0);
      expect(t.getTime()).toBeGreaterThanOrEqual(startOfDay.getTime());
      expect(t.getTime()).toBeLessThan(endOfDay.getTime());
    }
  });

  it('never produces a time at or before `now`', () => {
    const times = generateFireTimes(baseInput({ seed: 3 }));
    for (const t of times) {
      expect(t.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('respects a narrow window without throwing or hanging', () => {
    const input = baseInput({ windows: [{ start: '08:00', end: '08:05' }], sessionsPerDay: 1 });
    const times = generateFireTimes(input);
    // A 5-minute window can hold at most one draw per day regardless of gap rules.
    expect(times.length).toBeLessThanOrEqual(10);
  });

  it('returns nothing for an empty window list or zero sessions per day', () => {
    expect(generateFireTimes(baseInput({ windows: [] }))).toEqual([]);
    expect(generateFireTimes(baseInput({ sessionsPerDay: 0 }))).toEqual([]);
  });
});

describe('generateFireTimes: minimum 90-minute gap', () => {
  it('enforces the gap between every pair of times on the same day, across multiple windows', () => {
    const input = baseInput({
      windows: [
        { start: '08:00', end: '12:00' },
        { start: '13:00', end: '21:00' },
      ],
      sessionsPerDay: 4,
      seed: 42,
    });
    const times = generateFireTimes(input);

    const byDay = new Map<string, Date[]>();
    for (const t of times) {
      const key = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
      byDay.set(key, [...(byDay.get(key) ?? []), t]);
    }
    for (const dayTimes of byDay.values()) {
      const sorted = [...dayTimes].sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].getTime() - sorted[i - 1].getTime()).toBeGreaterThanOrEqual(MIN_GAP_MS);
      }
    }
  });

  it('holds across many seeds, not just one', () => {
    for (let seed = 0; seed < 30; seed++) {
      const times = generateFireTimes(baseInput({ sessionsPerDay: 3, seed }));
      const byDay = new Map<string, Date[]>();
      for (const t of times) {
        const key = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
        byDay.set(key, [...(byDay.get(key) ?? []), t]);
      }
      for (const dayTimes of byDay.values()) {
        const sorted = [...dayTimes].sort((a, b) => a.getTime() - b.getTime());
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].getTime() - sorted[i - 1].getTime()).toBeGreaterThanOrEqual(MIN_GAP_MS);
        }
      }
    }
  });
});

describe('generateFireTimes: uniform distribution', () => {
  it('draws roughly evenly across the window, not clustered at one end', () => {
    // Wide window, one draw per day, many days via a large horizon, many seeds
    // pooled together so 90-min gap rejection (which only matters intra-day)
    // doesn't bias a single day's sample.
    const spanMinutes = (21 - 8) * 60;
    const bucketCount = 4;
    const buckets = new Array(bucketCount).fill(0);

    for (let seed = 0; seed < 200; seed++) {
      const times = generateFireTimes(baseInput({ horizonDays: 1, seed }));
      for (const t of times) {
        const minutesFromStart = (t.getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate(), 8, 0).getTime()) / 60000;
        const bucket = Math.min(bucketCount - 1, Math.floor((minutesFromStart / spanMinutes) * bucketCount));
        buckets[bucket]++;
      }
    }

    const total = buckets.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(150); // most seeds should produce a draw
    for (const count of buckets) {
      // Loose bound: each quarter of the window should get a meaningful share.
      expect(count / total).toBeGreaterThan(0.1);
    }
  });
});

describe('generateFireTimes: rolling horizon and 64 cap', () => {
  it('defaults to a 10-day horizon', () => {
    const times = generateFireTimes(baseInput({ sessionsPerDay: 1, seed: 5 }));
    const last = times[times.length - 1];
    const tenDaysOut = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 10, 0, 0, 0, 0);
    expect(last.getTime()).toBeLessThan(tenDaysOut.getTime());
  });

  it('caps total pending at 64 even when demand exceeds it', () => {
    const input = baseInput({
      windows: [{ start: '00:00', end: '23:59' }],
      sessionsPerDay: 10,
      horizonDays: 10,
      seed: 9,
    });
    const times = generateFireTimes(input);
    expect(times.length).toBeLessThanOrEqual(64);
  });

  it('respects a custom maxPending', () => {
    const input = baseInput({ sessionsPerDay: 2, horizonDays: 10, maxPending: 5, seed: 2 });
    const times = generateFireTimes(input);
    expect(times.length).toBeLessThanOrEqual(5);
  });
});

describe('generateFireTimes: DST transitions', () => {
  it('spring-forward (2026-03-29, Europe/Berlin loses 02:00-03:00): window stays 8am-9pm local, gap still holds', () => {
    process.env.TZ = 'Europe/Berlin';
    const springDay = new Date(2026, 2, 28, 0, 0, 0, 0); // day before spring-forward
    const input = baseInput({ now: springDay, sessionsPerDay: 3, horizonDays: 4, seed: 11 });
    const times = generateFireTimes(input);

    for (const t of times) {
      expect(t.getHours()).toBeGreaterThanOrEqual(8);
      expect(t.getHours()).toBeLessThan(21);
    }
    const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].getDate() === sorted[i - 1].getDate()) {
        expect(sorted[i].getTime() - sorted[i - 1].getTime()).toBeGreaterThanOrEqual(MIN_GAP_MS);
      }
    }
  });

  it('fall-back (2026-10-25, Europe/Berlin repeats 02:00-03:00): window stays 8am-9pm local, gap still holds', () => {
    process.env.TZ = 'Europe/Berlin';
    const fallDay = new Date(2026, 9, 24, 0, 0, 0, 0); // day before fall-back
    const input = baseInput({ now: fallDay, sessionsPerDay: 3, horizonDays: 4, seed: 13 });
    const times = generateFireTimes(input);

    for (const t of times) {
      expect(t.getHours()).toBeGreaterThanOrEqual(8);
      expect(t.getHours()).toBeLessThan(21);
    }
    const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].getDate() === sorted[i - 1].getDate()) {
        expect(sorted[i].getTime() - sorted[i - 1].getTime()).toBeGreaterThanOrEqual(MIN_GAP_MS);
      }
    }
  });
});

describe('generateFireTimes: idempotency', () => {
  it('produces byte-identical output for the same input, called repeatedly', () => {
    const input = baseInput({ sessionsPerDay: 2, seed: 123 });
    const first = generateFireTimes(input).map((t) => t.getTime());
    for (let i = 0; i < 5; i++) {
      expect(generateFireTimes(input).map((t) => t.getTime())).toEqual(first);
    }
  });

  it('is unaffected by object identity: an equivalent but distinct input produces the same result', () => {
    const a = generateFireTimes(baseInput({ sessionsPerDay: 2, seed: 55 }));
    const b = generateFireTimes({
      windows: [{ start: '08:00', end: '21:00' }],
      sessionsPerDay: 2,
      now: new Date(NOW.getTime()),
      seed: 55,
    });
    expect(a.map((t) => t.getTime())).toEqual(b.map((t) => t.getTime()));
  });
});

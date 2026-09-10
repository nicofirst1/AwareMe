import { computeReviewPeriod, isWeeklyReviewDue, REVIEW_PERIOD_PRESETS } from '../reviewPeriod';

describe('computeReviewPeriod', () => {
  it('returns an exclusive end at now and an inclusive start N days before it', () => {
    const period = computeReviewPeriod(7, '2026-09-10T12:00:00.000Z');
    expect(period.periodEnd).toBe('2026-09-10T12:00:00.000Z');
    expect(period.periodStart).toBe('2026-09-03T12:00:00.000Z');
  });

  it.each(REVIEW_PERIOD_PRESETS)('supports the %i-day preset', (days) => {
    const period = computeReviewPeriod(days, '2026-09-10T00:00:00.000Z');
    const spanMs = Date.parse(period.periodEnd) - Date.parse(period.periodStart);
    expect(spanMs).toBe(days * 24 * 60 * 60 * 1000);
  });
});

describe('isWeeklyReviewDue', () => {
  it('is due when there has never been a review', () => {
    expect(isWeeklyReviewDue(null, '2026-09-10T00:00:00.000Z')).toBe(true);
  });

  it('is not due within a week of the last review', () => {
    expect(isWeeklyReviewDue('2026-09-05T00:00:00.000Z', '2026-09-10T00:00:00.000Z')).toBe(false);
  });

  it('is due exactly at and past the 7-day mark', () => {
    expect(isWeeklyReviewDue('2026-09-03T00:00:00.000Z', '2026-09-10T00:00:00.000Z')).toBe(true);
    expect(isWeeklyReviewDue('2026-09-01T00:00:00.000Z', '2026-09-10T00:00:00.000Z')).toBe(true);
  });
});

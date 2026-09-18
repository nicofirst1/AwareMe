import { CREATOR_SITE_URL, withAppTag } from '@/constants/links';

describe('withAppTag', () => {
  it('appends the app tag to the bare creator site URL', () => {
    expect(withAppTag(CREATOR_SITE_URL)).toBe('https://nicolobrandizzi.com/?utm_source=awareme');
  });

  it('never tags twice', () => {
    const once = withAppTag(CREATOR_SITE_URL);
    expect(withAppTag(once)).toBe(once);
  });

  it('leaves deep links untouched', () => {
    expect(withAppTag('awareme://write')).toBe('awareme://write');
  });

  it('leaves other outbound links untouched', () => {
    expect(withAppTag('https://nathanielbranden.com/sentence-completion-i/')).toBe(
      'https://nathanielbranden.com/sentence-completion-i/',
    );
  });
});

import { validateStemText, WEIGHT_BY_SETTING } from '../stemValidation';

describe('validateStemText', () => {
  it('rejects empty text and whitespace-only text', () => {
    expect(validateStemText('', []).ok).toBe(false);
    expect(validateStemText('   ', []).ok).toBe(false);
  });

  it('rejects text at or over 200 characters', () => {
    const long = 'a'.repeat(200);
    expect(validateStemText(long, []).ok).toBe(false);
    expect(validateStemText('a'.repeat(199), []).ok).toBe(true);
  });

  it('rejects a verbatim duplicate (after trim)', () => {
    const existing = ['If I brought more awareness'];
    expect(validateStemText('If I brought more awareness', existing).ok).toBe(false);
    expect(validateStemText('  If I brought more awareness  ', existing).ok).toBe(false);
  });

  it('permits a near-duplicate that differs in text', () => {
    const existing = ['If I brought more awareness'];
    expect(validateStemText('If I brought more awareness today', existing).ok).toBe(true);
  });

  it('warns but permits text ending in terminal punctuation', () => {
    const result = validateStemText('This is a complete sentence.', []);
    expect(result.ok).toBe(true);
    expect(result.warning).not.toBeNull();
  });

  it('has no warning for a normal unfinished-clause stem', () => {
    const result = validateStemText('If I let myself rest without earning it first', []);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeNull();
  });
});

describe('WEIGHT_BY_SETTING', () => {
  it('maps the three-way control to spec §6.6 weights', () => {
    expect(WEIGHT_BY_SETTING.less).toBe(0.4);
    expect(WEIGHT_BY_SETTING.normal).toBe(1.0);
    expect(WEIGHT_BY_SETTING.more).toBe(2.5);
  });
});

/**
 * Pure validation for adding a stem (§6.6): non-empty after trim, under 200
 * characters, not a verbatim duplicate of an existing stem's text. A stem
 * ending in terminal punctuation is a warning, not a rejection — a stem
 * should read as an unfinished clause, but the spec says "warn but permit".
 */
export interface StemValidationResult {
  ok: boolean;
  error: string | null; // set when ok is false
  warning: string | null; // set when ok is true but worth flagging
}

const MAX_LENGTH = 200;
const TERMINAL_PUNCTUATION = /[.!?]$/;

export function validateStemText(rawText: string, existingTexts: readonly string[]): StemValidationResult {
  const text = rawText.trim();

  if (text.length === 0) {
    return { ok: false, error: 'A stem cannot be empty.', warning: null };
  }
  if (text.length >= MAX_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_LENGTH} characters.`, warning: null };
  }
  if (existingTexts.includes(text)) {
    return { ok: false, error: 'That stem already exists.', warning: null };
  }

  if (TERMINAL_PUNCTUATION.test(text)) {
    return { ok: true, error: null, warning: 'A stem usually reads as an unfinished clause.' };
  }

  return { ok: true, error: null, warning: null };
}

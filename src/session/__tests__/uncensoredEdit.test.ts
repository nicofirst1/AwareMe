import { applyEdit } from '../uncensoredEdit';

describe('applyEdit: typing (growing or same-length edits)', () => {
  it('always accepts appended characters', () => {
    expect(applyEdit('hel', 'hell', true)).toEqual({ text: 'hell', backspaces: 0 });
    expect(applyEdit('hel', 'hell', false)).toEqual({ text: 'hell', backspaces: 0 });
  });

  it('accepts a same-length change (e.g. autocorrect swap) without counting a backspace', () => {
    expect(applyEdit('helo', 'help', true)).toEqual({ text: 'help', backspaces: 0 });
  });
});

describe('applyEdit: single trailing backspace, uncensored mode off', () => {
  it('accepts the deletion and counts one backspace', () => {
    expect(applyEdit('hello', 'hell', false)).toEqual({ text: 'hell', backspaces: 1 });
  });

  it('counts a backspace even when it deletes back across a word boundary (mode off)', () => {
    expect(applyEdit('hello world', 'hello worl', false)).toEqual({ text: 'hello worl', backspaces: 1 });
    // Backspacing the space itself, moving into the previous word:
    expect(applyEdit('hello ', 'hello', false)).toEqual({ text: 'hello', backspaces: 1 });
  });
});

describe('applyEdit: single trailing backspace, uncensored mode on', () => {
  it('accepts deletion within the current (trailing) word', () => {
    expect(applyEdit('hello world', 'hello worl', true)).toEqual({ text: 'hello worl', backspaces: 1 });
    expect(applyEdit('hello worl', 'hello wor', true)).toEqual({ text: 'hello wor', backspaces: 1 });
  });

  it('accepts deleting the last character of a one-letter word (down to the word boundary)', () => {
    expect(applyEdit('hello w', 'hello ', true)).toEqual({ text: 'hello ', backspaces: 1 });
  });

  it('rejects backspacing the space that separates the current word from the previous one', () => {
    // previousText 'hello ' has an empty trailing word (nothing after the
    // space) -> cannot cross back into "hello".
    const result = applyEdit('hello ', 'hello', true);
    expect(result).toEqual({ text: 'hello ', backspaces: 0 });
  });

  it('rejects backspacing past the start of the current word into an earlier word, one step at a time', () => {
    let text = 'hello world';
    // Delete the whole trailing word "world" one character at a time.
    for (const expected of ['hello worl', 'hello wor', 'hello wo', 'hello w', 'hello ']) {
      const result = applyEdit(text, text.slice(0, -1), true);
      expect(result.text).toBe(expected);
      text = result.text;
    }
    // Now at 'hello ': attempting to delete into "hello" is rejected.
    const blocked = applyEdit(text, 'hello', true);
    expect(blocked).toEqual({ text: 'hello ', backspaces: 0 });
  });

  it('rejects deleting from an already-empty field', () => {
    expect(applyEdit('', '', true)).toEqual({ text: '', backspaces: 0 });
  });
});

describe('applyEdit: non-trailing-single-char shrink (cut/select-replace), defense in depth', () => {
  it('rejects a multi-character deletion in uncensored mode', () => {
    expect(applyEdit('hello world', 'hello', true)).toEqual({ text: 'hello world', backspaces: 0 });
  });

  it('rejects a deletion from the middle of the text in uncensored mode', () => {
    expect(applyEdit('hello world', 'hell world', true)).toEqual({ text: 'hello world', backspaces: 0 });
  });

  it('passes through a multi-character deletion uncounted when uncensored mode is off', () => {
    expect(applyEdit('hello world', 'hello', false)).toEqual({ text: 'hello', backspaces: 0 });
  });
});

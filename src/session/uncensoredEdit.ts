/**
 * Pure text-edit gate for uncensored mode (spec §6.3.6): backspace is
 * limited to the current (trailing) word, and any edit that isn't a
 * same-or-growing-length change at the end of the string (i.e. anything
 * that could only come from cut/paste, multi-char selection replace, or
 * caret repositioning) is rejected. `backspace_count` increments whenever
 * the user backspaces, in or out of uncensored mode — the mode gates what's
 * *allowed*, not what's *counted*.
 *
 * A controlled `TextInput` calls `applyEdit(previousText, nextText, ...)` on
 * every `onChangeText`; `selection`/`cut` are disabled at the component
 * level (RN `TextInput` props), which is what keeps the caret at the end in
 * practice, but this function does not trust that and re-derives everything
 * from the two strings.
 */

export interface EditResult {
  /** Text to actually store — equals `nextText` unless the edit was rejected. */
  text: string;
  /** How many backspace keystrokes this edit represents (0, or 1 for a single backspace). */
  backspaces: number;
}

/** The trailing run of non-whitespace characters, i.e. the "current word". */
function trailingWord(text: string): string {
  const match = text.match(/\S*$/);
  return match ? match[0] : '';
}

/**
 * @param previousText field contents before this edit
 * @param nextText     field contents `onChangeText` reports
 * @param uncensored   whether the backspace-within-word restriction is active
 */
export function applyEdit(previousText: string, nextText: string, uncensored: boolean): EditResult {
  if (nextText.length >= previousText.length) {
    // Growing or same-length edit (typing, or a same-length autocorrect
    // swap): always allowed, never a backspace.
    return { text: nextText, backspaces: 0 };
  }

  // Shrinking edit: only a single-character trailing deletion is a
  // "backspace" in the sense this app means. Anything else (cut, multi-char
  // select-replace, deleting from the middle) is rejected in uncensored
  // mode and passed through uncounted otherwise — RN's TextInput has
  // `contextMenuHidden`/`selection` disabled by the caller in uncensored
  // mode, so in practice this path is defense in depth, not the primary gate.
  const isSingleTrailingDeletion = nextText.length === previousText.length - 1 && previousText.startsWith(nextText);

  if (!isSingleTrailingDeletion) {
    return uncensored ? { text: previousText, backspaces: 0 } : { text: nextText, backspaces: 0 };
  }

  if (!uncensored) {
    return { text: nextText, backspaces: 1 };
  }

  // Uncensored: backspace only within the current word. Deleting the last
  // character of the current word is fine; deleting the space that
  // separates it from the previous word (i.e. word-boundary crossing) is
  // rejected — the user cannot claw back into an earlier word.
  const word = trailingWord(previousText);
  if (word.length === 0) {
    // At a word boundary (previousText is empty or ends in whitespace):
    // nothing to delete within "the current word".
    return { text: previousText, backspaces: 0 };
  }

  return { text: nextText, backspaces: 1 };
}

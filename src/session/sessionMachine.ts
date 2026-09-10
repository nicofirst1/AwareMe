/**
 * Pure writing-session state machine (spec §6.3, ADR-0001, ADR-0003).
 *
 * Deliberately has no knowledge of SQLite, expo-router, or React. It is a
 * reducer over an in-memory `SessionState`, so the rules that matter most
 * ("nothing is ever discarded", the 5-minute momentum grace, uncensored
 * backspace counting) are unit-testable without a database or a clock.
 * `src/db/repository.ts` persists the same transitions; `src/session/` UI
 * code is a thin wrapper that calls both.
 */

export type EndReason = 'timeout' | 'user_done' | 'abandoned';
export type SessionOrigin = 'notification' | 'manual' | 'review';

export interface EndingState {
  ordinal: number; // 1-based
  text: string;
  startedAt: string | null; // first keypress into this field; null until typed
  submittedAt: string | null; // null while open (ADR-0003)
  backspaceCount: number;
}

export interface SessionConfig {
  targetEndings: number;
  timerSeconds: number;
  uncensoredMode: boolean;
}

/** The session's in-memory state. Mirrors `sessions` + its `endings` rows. */
export interface SessionState {
  config: SessionConfig;
  startedAt: string;
  firstKeypressAt: string | null;
  lastActivityAt: string;
  endedAt: string | null;
  endReason: EndReason | null;
  endings: EndingState[]; // one entry per field touched or submitted so far
  activeOrdinal: number; // which field is currently being written, 1-based
}

/** Starts a session's clock. Nothing is timed until this is called (§6.3.1). */
export function startSession(config: SessionConfig, startedAt: string): SessionState {
  return {
    config,
    startedAt,
    firstKeypressAt: null,
    lastActivityAt: startedAt,
    endedAt: null,
    endReason: null,
    endings: [],
    activeOrdinal: 1,
  };
}

function isFinalized(state: SessionState): boolean {
  return state.endedAt !== null;
}

function currentEnding(state: SessionState): EndingState | undefined {
  return state.endings.find((e) => e.ordinal === state.activeOrdinal);
}

/**
 * First keystroke into the active field: creates its `endings` row
 * (ADR-0003) and, if this is the session's very first keypress, stamps
 * `firstKeypressAt`. A no-op if the field already exists (later keystrokes
 * go through `updateActiveEndingText`).
 */
export function recordFirstKeypress(state: SessionState, at: string): SessionState {
  if (isFinalized(state)) return state;
  if (currentEnding(state)) return state;

  const ending: EndingState = {
    ordinal: state.activeOrdinal,
    text: '',
    startedAt: at,
    submittedAt: null,
    backspaceCount: 0,
  };

  return {
    ...state,
    firstKeypressAt: state.firstKeypressAt ?? at,
    lastActivityAt: at,
    endings: [...state.endings, ending],
  };
}

/**
 * Replaces the active field's text (the UI computes the new text via
 * `uncensoredEdit` first when uncensored mode is on). Requires the field to
 * already exist — call `recordFirstKeypress` first.
 */
export function updateActiveEndingText(state: SessionState, text: string, at: string, backspacesDelta = 0): SessionState {
  if (isFinalized(state)) return state;

  return {
    ...state,
    lastActivityAt: at,
    endings: state.endings.map((e) =>
      e.ordinal === state.activeOrdinal
        ? { ...e, text, backspaceCount: e.backspaceCount + backspacesDelta }
        : e,
    ),
  };
}

/**
 * Submits the active field (return key or a Next control, §6.3.4) and
 * advances to the next one. If the session has now reached its target
 * ending count, the caller should finalize with `user_done` or let the
 * timer run out — submitting the last field does not itself end the
 * session, since the user may still finish early or the clock may still be
 * running for review of what's on screen.
 */
export function submitActiveEnding(state: SessionState, at: string): SessionState {
  if (isFinalized(state)) return state;
  const active = currentEnding(state);
  if (!active || active.submittedAt !== null) return state;

  return {
    ...state,
    lastActivityAt: at,
    endings: state.endings.map((e) => (e.ordinal === active.ordinal ? { ...e, submittedAt: at } : e)),
    activeOrdinal: state.activeOrdinal + 1,
  };
}

/** True once every target field has been submitted. */
export function isComplete(state: SessionState): boolean {
  return (
    state.endings.filter((e) => e.submittedAt !== null).length >= state.config.targetEndings
  );
}

/**
 * Ends the session. Whatever is on screen — including a half-typed final
 * ending — is preserved: any open field's `submittedAt` is set to `at`
 * without touching its text (§6.3.8, "nothing is discarded, ever").
 */
export function finalizeSession(state: SessionState, reason: EndReason, at: string): SessionState {
  if (isFinalized(state)) return state;

  return {
    ...state,
    endedAt: at,
    endReason: reason,
    lastActivityAt: at,
    endings: state.endings.map((e) => (e.submittedAt === null ? { ...e, submittedAt: at } : e)),
  };
}


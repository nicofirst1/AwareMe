import { useCallback, useEffect, useRef, useState } from 'react';

import { getRepository } from '@/db';
import { getDeviceLocale, nowEventTime } from '@/db/time';
import {
  finalizeSession,
  isComplete,
  recordFirstKeypress,
  startSession,
  submitActiveEnding,
  updateActiveEndingText,
  type SessionState,
} from './sessionMachine';

/** Debounce for persisting in-progress field text (ticket 04). */
const AUTOSAVE_DEBOUNCE_MS = 400;

export interface StemForSession {
  id: string;
  text: string; // without terminator
}

export type WritingPhase = 'idle' | 'active' | 'done';

export interface WritingSessionView {
  phase: WritingPhase;
  stemText: string | null;
  state: SessionState | null;
  activeText: string;
  remainingSeconds: number;
  start: (stem: StemForSession) => void;
  changeActiveText: (nextText: string) => void;
  submitActive: () => void;
  finishNow: () => void;
}

/**
 * Wires the pure session machine (`sessionMachine.ts`) to the repository
 * and a local countdown. Deliberately a plain hook, not a Zustand store: a
 * session is scoped to one screen's lifetime, nothing else in the app reads
 * it mid-session.
 */
export function useWritingSession(): WritingSessionView {
  const repo = getRepository();
  const settings = repo.getSettings();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [stemText, setStemText] = useState<string | null>(null);
  const [phase, setPhase] = useState<WritingPhase>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const stateRef = useRef<SessionState | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const finalize = useCallback(
    (reason: 'timeout' | 'user_done' | 'abandoned') => {
      const current = stateRef.current;
      const id = sessionIdRef.current;
      if (!current || !id || current.endedAt) return;

      const { at } = nowEventTime();
      repo.finalizeSession(id, reason, at);
      const next = finalizeSession(current, reason, at);
      setState(next);
      setPhase('done');
    },
    [repo],
  );

  // Local countdown, ticking once a second while a session is active.
  useEffect(() => {
    if (phase !== 'active') return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          finalize('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, finalize]);

  const start = useCallback(
    (stem: StemForSession) => {
      const { at } = nowEventTime();
      const config = {
        targetEndings: settings.endings_per_session,
        timerSeconds: settings.timer_seconds,
        uncensoredMode: settings.uncensored_mode,
      };
      const id = repo.createSession({
        stemId: stem.id,
        stemTextSnapshot: stem.text,
        origin: 'manual',
        targetEndings: config.targetEndings,
        timerSeconds: config.timerSeconds,
        uncensoredMode: config.uncensoredMode,
        startedAt: at,
        deviceLocale: getDeviceLocale(),
      });

      setSessionId(id);
      setState(startSession(config, at));
      setStemText(stem.text);
      setPhase('active');
      setRemainingSeconds(config.timerSeconds);
    },
    [repo, settings.endings_per_session, settings.timer_seconds, settings.uncensored_mode],
  );

  const flushAutosave = useCallback(
    (ordinal: number, text: string) => {
      const id = sessionIdRef.current;
      if (!id) return;
      const { at } = nowEventTime();
      repo.autosaveEndingText(id, ordinal, text, 0, at);
    },
    [repo],
  );

  const changeActiveText = useCallback(
    (nextText: string) => {
      const current = stateRef.current;
      const id = sessionIdRef.current;
      if (!current || !id || current.endedAt) return;

      const activeOrdinal = current.activeOrdinal;
      const activeEnding = current.endings.find((e) => e.ordinal === activeOrdinal);
      const { at } = nowEventTime();

      let afterFirstKeypress = current;
      if (!activeEnding) {
        repo.recordFirstKeypress(id, activeOrdinal, at);
        afterFirstKeypress = recordFirstKeypress(current, at);
      }

      const next = updateActiveEndingText(afterFirstKeypress, nextText, at);
      setState(next);

      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => flushAutosave(activeOrdinal, nextText), AUTOSAVE_DEBOUNCE_MS);
    },
    [flushAutosave, repo],
  );

  const submitActive = useCallback(() => {
    const current = stateRef.current;
    const id = sessionIdRef.current;
    if (!current || !id || current.endedAt) return;
    const activeEnding = current.endings.find((e) => e.ordinal === current.activeOrdinal);
    if (!activeEnding || activeEnding.submittedAt) return;

    // Flush any pending debounced text immediately so the submit is never
    // racing a stale autosave.
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      flushAutosave(current.activeOrdinal, activeEnding.text);
    }

    const { at } = nowEventTime();
    repo.submitEnding(id, current.activeOrdinal, at);
    const next = submitActiveEnding(current, at);
    setState(next);

    if (isComplete(next)) {
      finalize('user_done');
    }
  }, [repo, flushAutosave, finalize]);

  const finishNow = useCallback(() => finalize('user_done'), [finalize]);

  const activeEnding = state?.endings.find((e) => e.ordinal === state.activeOrdinal);

  return {
    phase,
    stemText,
    state,
    activeText: activeEnding?.text ?? '',
    remainingSeconds,
    start,
    changeActiveText,
    submitActive,
    finishNow,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getRepository } from '@/db';
import { getDeviceLocale, nowEventTime } from '@/db/time';
import { applyEdit } from './uncensoredEdit';
import {
  computeReturnAction,
  finalizeSession,
  isComplete,
  recordFirstKeypress,
  startSession,
  submitActiveEnding,
  updateActiveEndingText,
  type SessionOrigin,
  type SessionState,
} from './sessionMachine';

/** Debounce for persisting in-progress field text (ticket 04). */
const AUTOSAVE_DEBOUNCE_MS = 400;

export interface StemForSession {
  id: string;
  text: string; // without terminator
  /** Defaults to 'manual'. 'notification' when opened via a notification tap (§6.4, ticket 10). */
  origin?: SessionOrigin;
  /** Set alongside origin='notification': the `notification_schedule` row this session was opened from. */
  notificationId?: string;
  notifiedAt?: string;
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
 * Wires the pure session machine (`sessionMachine.ts`) and the uncensored
 * edit gate (`uncensoredEdit.ts`) to the repository and the app lifecycle.
 * Deliberately a plain hook, not a Zustand store: a session is scoped to
 * one screen's lifetime, nothing else in the app reads it mid-session.
 *
 * On mount, resolves any session left open by a previous app run per
 * ADR-0001 (resume / timeout / abandoned) before anything else can happen —
 * this is what makes the rule hold across a cold start, not just
 * backgrounding within the same process.
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
  const pendingBackspaceDelta = useRef(0);

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

  // ADR-0001: resolve any session left open by a previous run (cold start)
  // before the user can start a new one.
  useEffect(() => {
    const open = repo.getOpenSession();
    if (!open) return;

    const { at } = nowEventTime();
    const lastActivityAt = open.session.last_activity_at ?? open.session.started_at;
    const action = computeReturnAction(
      {
        startedAt: open.session.started_at,
        lastActivityAt,
        config: {
          timerSeconds: open.session.timer_seconds,
          targetEndings: open.session.target_endings,
          uncensoredMode: !!open.session.uncensored_mode,
        },
      },
      at,
    );

    if (action.kind === 'finalize') {
      repo.finalizeSession(open.session.id, action.reason, at);
      return;
    }

    // Resume: rebuild in-memory state from the persisted rows and continue.
    const rebuilt: SessionState = {
      config: {
        targetEndings: open.session.target_endings,
        timerSeconds: open.session.timer_seconds,
        uncensoredMode: !!open.session.uncensored_mode,
      },
      startedAt: open.session.started_at,
      firstKeypressAt: open.session.first_keypress_at,
      lastActivityAt,
      endedAt: null,
      endReason: null,
      activeOrdinal: open.endings.filter((e) => e.submitted_at !== null).length + 1,
      endings: open.endings.map((e) => ({
        ordinal: e.ordinal,
        text: e.text,
        startedAt: e.started_at,
        submittedAt: e.submitted_at,
        backspaceCount: e.backspace_count,
      })),
    };

    setSessionId(open.session.id);
    setState(rebuilt);
    setStemText(open.session.stem_text_snapshot);
    setPhase('active');
    setRemainingSeconds(action.remainingSeconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Foreground/background transitions: the same ADR-0001 rule, re-evaluated
  // every time the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const current = stateRef.current;
      const id = sessionIdRef.current;
      if (!current || !id || current.endedAt) return;

      const { at } = nowEventTime();
      const action = computeReturnAction(current, at);
      if (action.kind === 'finalize') {
        finalize(action.reason);
      } else {
        setRemainingSeconds(action.remainingSeconds);
      }
    });
    return () => sub.remove();
  }, [finalize]);

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
        origin: stem.origin ?? 'manual',
        targetEndings: config.targetEndings,
        timerSeconds: config.timerSeconds,
        uncensoredMode: config.uncensoredMode,
        startedAt: at,
        deviceLocale: getDeviceLocale(),
        notificationId: stem.notificationId,
        notifiedAt: stem.notifiedAt,
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
    (ordinal: number, text: string, backspaceDelta: number) => {
      const id = sessionIdRef.current;
      if (!id) return;
      const { at } = nowEventTime();
      repo.autosaveEndingText(id, ordinal, text, backspaceDelta, at);
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
      const previousText = activeEnding?.text ?? '';
      const { at } = nowEventTime();

      let afterFirstKeypress = current;
      if (!activeEnding) {
        repo.recordFirstKeypress(id, activeOrdinal, at);
        afterFirstKeypress = recordFirstKeypress(current, at);
      }

      // Uncensored mode (§6.3.6): backspace limited to the current word,
      // no cut/select (also enforced at the TextInput via
      // `contextMenuHidden` in write.tsx). backspace_count increments
      // regardless of mode.
      const edit = applyEdit(previousText, nextText, afterFirstKeypress.config.uncensoredMode);
      const next = updateActiveEndingText(afterFirstKeypress, edit.text, at, edit.backspaces);
      setState(next);

      pendingBackspaceDelta.current += edit.backspaces;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        const delta = pendingBackspaceDelta.current;
        pendingBackspaceDelta.current = 0;
        flushAutosave(activeOrdinal, edit.text, delta);
      }, AUTOSAVE_DEBOUNCE_MS);
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
      const delta = pendingBackspaceDelta.current;
      pendingBackspaceDelta.current = 0;
      flushAutosave(current.activeOrdinal, activeEnding.text, delta);
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

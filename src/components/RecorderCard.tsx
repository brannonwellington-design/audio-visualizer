import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { ThinkingRun } from '../thinking/types';

export type RecorderState = 'idle' | 'recording' | 'paused';
export type CardSurface = 'audio' | 'thinking';

interface Props {
  surface?: CardSurface;
  state: RecorderState;
  /** Frozen elapsed time while the clock is not running. */
  elapsedMs: number;
  elapsedRunning?: boolean;
  elapsedStartedAt?: number;
  onRecord: () => void;
  onPause: () => void;
  onResume: () => void;
  children: ReactNode;
  /** Observed by App to fit the canvas to the available card width */
  vizRef?: Ref<HTMLDivElement>;
  thinkingRun?: ThinkingRun;
  thinkingLoop?: boolean;
  onSubmit?: () => void;
}

function RecordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="2.5" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6.6" y="5.8" width="1.6" height="6.4" rx="0.8" fill="currentColor" />
      <rect x="9.8" y="5.8" width="1.6" height="6.4" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function SubmitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6.25" y="6.25" width="5.5" height="5.5" rx="1" fill="currentColor" />
    </svg>
  );
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Ticks locally so App (and the settings drawer) do not re-render every 200ms. */
function ElapsedClock({
  running,
  startedAt,
  baseMs,
  loop,
}: {
  running: boolean;
  startedAt: number;
  baseMs: number;
  loop?: boolean;
}) {
  const [ms, setMs] = useState(() =>
    running ? baseMs + Math.max(0, performance.now() - startedAt) : baseMs,
  );

  useEffect(() => {
    if (!running) {
      setMs(baseMs);
      return;
    }
    const tick = () => setMs(baseMs + Math.max(0, performance.now() - startedAt));
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [running, startedAt, baseMs]);

  if (loop && running) return <>Loop</>;
  return <>{formatTime(ms)}</>;
}

export function RecorderCard({
  surface = 'audio',
  state,
  elapsedMs,
  elapsedRunning = false,
  elapsedStartedAt = 0,
  onRecord,
  onPause,
  onResume,
  children,
  vizRef,
  thinkingRun = 'idle',
  thinkingLoop = false,
  onSubmit,
}: Props) {
  const recButtonRef = useRef<HTMLButtonElement>(null);

  // The label changes between Record / Pause / Resume, which changes the
  // button's natural width. Measure the new natural width on each state
  // change and animate from the previous fixed width to the new one.
  useLayoutEffect(() => {
    const el = recButtonRef.current;
    if (!el) return;
    const prevWidth = el.style.width;
    el.style.width = 'auto';
    const target = el.offsetWidth;
    if (!prevWidth) {
      el.style.width = `${target}px`;
      return;
    }
    el.style.width = prevWidth;
    void el.offsetWidth; // commit the starting width so the transition runs
    el.style.width = `${target}px`;
  }, [state, thinkingRun, surface]);

  const thinking = surface === 'thinking';
  const rec = {
    idle: { label: 'Record', icon: <RecordIcon />, variant: 'filled', onClick: onRecord },
    recording: { label: 'Pause', icon: <PauseIcon />, variant: 'outlined', onClick: onPause },
    paused: { label: 'Resume', icon: <RecordIcon />, variant: 'filled', onClick: onResume },
  }[state];

  const primary = thinking ? (
    <span className="rec-button-spacer" aria-hidden="true" />
  ) : (
    <button
      ref={recButtonRef}
      type="button"
      className={`rec-button ${rec.variant}`}
      onClick={rec.onClick}
      aria-pressed={state === 'recording'}
    >
      {rec.label} {rec.icon}
    </button>
  );

  const stateLabel = thinking
    ? thinkingRun === 'running'
      ? thinkingLoop
        ? 'Thinking, looping'
        : 'Thinking'
      : thinkingRun === 'done'
        ? 'Answered'
        : 'Idle'
    : state === 'recording'
      ? 'Recording'
      : state === 'paused'
        ? 'Paused'
        : 'Idle';
  const timerActive = thinking ? thinkingRun !== 'idle' : state !== 'idle';
  const submitLabel = thinking && thinkingRun === 'running' ? 'Settle' : 'Submit';
  const submitDisabled = thinking ? false : state === 'idle';

  return (
    <div className="recorder-card">
      <div className="recorder-viz" ref={vizRef}>
        {children}
      </div>
      <div className="recorder-controls">
        {primary}
        <span
          className={`recorder-timer ${timerActive ? 'active' : ''}`}
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="sr-only">{stateLabel}, </span>
          <ElapsedClock
            running={elapsedRunning}
            startedAt={elapsedStartedAt}
            baseMs={elapsedMs}
            loop={thinking && thinkingLoop}
          />
        </span>
        <button
          className="submit-button"
          disabled={submitDisabled}
          type="button"
          onClick={onSubmit}
        >
          {submitLabel} <SubmitIcon />
        </button>
      </div>
    </div>
  );
}

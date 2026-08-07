import { useLayoutEffect, useRef, type ReactNode } from 'react';

export type RecorderState = 'idle' | 'recording' | 'paused';

interface Props {
  state: RecorderState;
  elapsedMs: number;
  onRecord: () => void;
  onPause: () => void;
  onResume: () => void;
  children: ReactNode;
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

export function RecorderCard({ state, elapsedMs, onRecord, onPause, onResume, children }: Props) {
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
  }, [state]);

  const rec = {
    idle: { label: 'Record', icon: <RecordIcon />, variant: 'filled', onClick: onRecord },
    recording: { label: 'Pause', icon: <PauseIcon />, variant: 'outlined', onClick: onPause },
    paused: { label: 'Resume', icon: <RecordIcon />, variant: 'filled', onClick: onResume },
  }[state];

  const primary = (
    <button ref={recButtonRef} className={`rec-button ${rec.variant}`} onClick={rec.onClick}>
      {rec.label} {rec.icon}
    </button>
  );

  return (
    <div className="recorder-card">
      <div className="recorder-viz">{children}</div>
      <div className="recorder-controls">
        {primary}
        <span className={`recorder-timer ${state !== 'idle' ? 'active' : ''}`}>
          {formatTime(elapsedMs)}
        </span>
        <button className="submit-button" disabled={state === 'idle'}>
          Submit <SubmitIcon />
        </button>
      </div>
    </div>
  );
}

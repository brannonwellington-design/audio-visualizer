import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechAnalyzer, type AnalyzerParams } from './audio/speechAnalyzer';
import {
  DotGridVisualizer,
  type VisualizerExport,
  type VisualizerSettings,
} from './components/DotGridVisualizer';
import { ControlPanel } from './components/ControlPanel';
import { RecorderCard, type RecorderState } from './components/RecorderCard';
import { SettingsDrawer } from './components/SettingsDrawer';
import './App.css';

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M8.6 2.5h2.8l.4 1.9c.5.2 1 .4 1.4.8l1.85-.6 1.4 2.4-1.45 1.3c.05.23.07.47.07.7s-.02.47-.07.7l1.45 1.3-1.4 2.4-1.85-.6c-.4.34-.9.6-1.4.8l-.4 1.9H8.6l-.4-1.9c-.5-.2-1-.46-1.4-.8l-1.85.6-1.4-2.4L5 9.7A4.5 4.5 0 0 1 4.93 9c0-.23.02-.47.07-.7L3.55 7l1.4-2.4 1.85.6c.4-.34.9-.6 1.4-.8l.4-1.9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        transform="translate(0 1)"
      />
      <circle cx="10" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

const DEFAULT_SETTINGS: VisualizerSettings = {
  mode: 'chronological',
  dotStyle: 'binary',
  width: 600,
  height: 64,
  columns: 140,
  rows: 17,
  dotScale: 0.75,
  activeColor: '#CF2617',
  inactiveColor: '#EEE8DD',
  scrollMs: 30,
  taperLeft: true,
  taperLeftWidth: 0.05,
  taperRight: true,
  taperRightWidth: 0.05,
  rippleMs: 10,
  rippleFalloff: 0.98,
};

/** Center line color when the recorder is idle, matching the product's resting state */
const IDLE_LINE_COLOR = '#A9A69C';
/** Waveform color while paused */
const PAUSED_WAVE_COLOR = '#120F08';

export default function App() {
  const analyzerRef = useRef<SpeechAnalyzer | null>(null);
  if (!analyzerRef.current) analyzerRef.current = new SpeechAnalyzer();
  const analyzer = analyzerRef.current;

  const [settings, setSettings] = useState<VisualizerSettings>(() => ({ ...DEFAULT_SETTINGS }));
  const [audio, setAudio] = useState<AnalyzerParams>({ ...analyzer.params });
  const [recState, setRecState] = useState<RecorderState>('idle');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportRef = useRef<VisualizerExport | null>(null);
  const copiedTimerRef = useRef<number | undefined>(undefined);
  /** Recording time accumulated before the most recent resume */
  const accumulatedRef = useRef(0);
  const segmentStartRef = useRef(0);

  useEffect(() => {
    if (recState !== 'recording') return;
    const tick = window.setInterval(() => {
      setElapsedMs(accumulatedRef.current + (performance.now() - segmentStartRef.current));
    }, 200);
    return () => window.clearInterval(tick);
  }, [recState]);

  const record = async () => {
    setError(null);
    try {
      await analyzer.start();
      analyzer.params = audio;
      accumulatedRef.current = 0;
      segmentStartRef.current = performance.now();
      setElapsedMs(0);
      setRecState('recording');
    } catch {
      setError('Microphone access was denied. Allow mic access and try again.');
    }
  };

  const pause = () => {
    accumulatedRef.current += performance.now() - segmentStartRef.current;
    setElapsedMs(accumulatedRef.current);
    setRecState('paused');
  };

  const resume = () => {
    segmentStartRef.current = performance.now();
    setRecState('recording');
  };

  const copySVG = async () => {
    await exportRef.current?.copySVG();
    setCopied(true);
    window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const patchSettings = useCallback((patch: Partial<VisualizerSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const patchAudio = useCallback(
    (patch: Partial<AnalyzerParams>) => {
      setAudio((a) => {
        const next = { ...a, ...patch };
        analyzer.params = next;
        return next;
      });
    },
    [analyzer],
  );

  // The card overrides the waveform color by state: muted center line when
  // idle, the configured active color while recording, dark when paused.
  const displaySettings: VisualizerSettings = {
    ...settings,
    activeColor:
      recState === 'idle'
        ? IDLE_LINE_COLOR
        : recState === 'paused'
          ? PAUSED_WAVE_COLOR
          : settings.activeColor,
  };

  const panel = (
    <ControlPanel
      settings={settings}
      onSettings={patchSettings}
      audio={audio}
      onAudio={patchAudio}
    />
  );

  return (
    <div className="app">
      <button
        className="settings-fab"
        aria-label="Settings"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((o) => !o)}
      >
        <GearIcon />
      </button>
      <main className="stage">
        <header>
          <h1>Speech Dot Grid</h1>
        </header>
        {error && <p className="error">{error}</p>}
        <div className="product-stage">
          <RecorderCard
            state={recState}
            elapsedMs={elapsedMs}
            onRecord={record}
            onPause={pause}
            onResume={resume}
          >
            <DotGridVisualizer
              analyzer={analyzer}
              settings={displaySettings}
              paused={recState !== 'recording'}
              exportRef={exportRef}
            />
          </RecorderCard>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={copySVG}>
            {copied ? 'Copied' : 'Copy SVG'}
          </button>
          <button className="secondary-button" onClick={() => exportRef.current?.exportSVG()}>
            Export SVG
          </button>
          <button className="secondary-button" onClick={() => exportRef.current?.exportPNG()}>
            Export PNG
          </button>
        </div>
      </main>
      {panel}
      <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {panel}
      </SettingsDrawer>
    </div>
  );
}

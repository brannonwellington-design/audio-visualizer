import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechAnalyzer, type AnalyzerParams } from './audio/speechAnalyzer';
import {
  DotGridVisualizer,
  layoutFamily,
  RADIAL_LAYOUT,
  STRIP_LAYOUT,
  type GridLayout,
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
  transitionStyle: 'curl',
};

/** Center line color when the recorder is idle, matching the product's resting state */
const IDLE_LINE_COLOR = '#A9A69C';
/** Waveform color while paused */
const PAUSED_WAVE_COLOR = '#120F08';
/** Floor for fitted canvas width (matches ControlPanel min) */
const MIN_FIT_WIDTH = 240;

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
  const [fitWidth, setFitWidth] = useState<number | null>(null);
  const exportRef = useRef<VisualizerExport | null>(null);
  const vizSlotRef = useRef<HTMLDivElement>(null);
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

  // Fit the canvas buffer to the card slot so on-screen dots and exports match.
  useEffect(() => {
    const el = vizSlotRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (!w || w < 1) return;
      setFitWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    setError(null);
    try {
      await exportRef.current?.copySVG();
      setCopied(true);
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy SVG. Check clipboard permissions and try again.');
    }
  };

  const exportSVG = () => {
    setError(null);
    try {
      exportRef.current?.exportSVG();
    } catch {
      setError('Could not export SVG. Try again.');
    }
  };

  const exportPNG = async () => {
    setError(null);
    try {
      await exportRef.current?.exportPNG();
    } catch {
      setError('Could not export PNG. Try again.');
    }
  };

  const layoutsRef = useRef<Record<'strip' | 'radial', GridLayout>>({
    strip: { ...STRIP_LAYOUT },
    radial: { ...RADIAL_LAYOUT },
  });

  const patchSettings = useCallback((patch: Partial<VisualizerSettings>) => {
    setSettings((s) => {
      if (patch.mode && layoutFamily(patch.mode) !== layoutFamily(s.mode)) {
        const fromFam = layoutFamily(s.mode);
        const toFam = layoutFamily(patch.mode);
        layoutsRef.current[fromFam] = {
          height: s.height,
          columns: s.columns,
          rows: s.rows,
        };
        return { ...s, ...patch, ...layoutsRef.current[toFam] };
      }
      const next = { ...s, ...patch };
      if (patch.height != null || patch.columns != null || patch.rows != null) {
        const fam = layoutFamily(next.mode);
        layoutsRef.current[fam] = {
          height: next.height,
          columns: next.columns,
          rows: next.rows,
        };
      }
      return next;
    });
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

  const renderWidth =
    fitWidth != null
      ? Math.max(MIN_FIT_WIDTH, Math.min(settings.width, fitWidth))
      : settings.width;

  // The card overrides the waveform color by state: muted center line when
  // idle, the configured active color while recording, dark when paused.
  const displaySettings: VisualizerSettings = {
    ...settings,
    width: renderWidth,
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
    <div
      className="app"
      style={{ ['--recorder-max-width' as string]: `${settings.width}px` }}
    >
      <button
        type="button"
        className="settings-fab"
        aria-label="Open settings"
        aria-expanded={drawerOpen}
        aria-controls="settings-drawer"
        onClick={() => setDrawerOpen((o) => !o)}
      >
        <GearIcon />
      </button>
      <main className="stage">
        <header>
          <h1>Speech Dot Grid</h1>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="product-stage">
          <RecorderCard
            state={recState}
            elapsedMs={elapsedMs}
            onRecord={record}
            onPause={pause}
            onResume={resume}
            vizRef={vizSlotRef}
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
          <button type="button" className="secondary-button" onClick={copySVG}>
            {copied ? 'Copied' : 'Copy SVG'}
          </button>
          <button type="button" className="secondary-button" onClick={exportSVG}>
            Export SVG
          </button>
          <button type="button" className="secondary-button" onClick={exportPNG}>
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

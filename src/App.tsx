import { useCallback, useRef, useState } from 'react';
import { SpeechAnalyzer, type AnalyzerParams } from './audio/speechAnalyzer';
import {
  DotGridVisualizer,
  type VisualizerSettings,
} from './components/DotGridVisualizer';
import { ControlPanel } from './components/ControlPanel';
import './App.css';

const DEFAULT_SETTINGS: VisualizerSettings = {
  mode: 'chronological',
  dotStyle: 'substates',
  width: 820,
  height: 180,
  columns: 72,
  rows: 13,
  dotScale: 0.55,
  activeColor: '#CF2617',
  inactiveColor: '#E2DCCF',
  scrollMs: 90,
  rippleMs: 45,
  rippleFalloff: 0.88,
};

export default function App() {
  const analyzerRef = useRef<SpeechAnalyzer | null>(null);
  if (!analyzerRef.current) analyzerRef.current = new SpeechAnalyzer();
  const analyzer = analyzerRef.current;

  const [settings, setSettings] = useState<VisualizerSettings>(DEFAULT_SETTINGS);
  const [audio, setAudio] = useState<AnalyzerParams>({ ...analyzer.params });
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const toggleMic = async () => {
    setError(null);
    if (listening) {
      analyzer.stop();
      setListening(false);
      return;
    }
    try {
      await analyzer.start();
      analyzer.params = audio;
      setListening(true);
    } catch {
      setError('Microphone access was denied. Allow mic access and try again.');
    }
  };

  return (
    <div className="app">
      <main className="stage">
        <header>
          <h1>Speech Dot Grid</h1>
          <button className={`mic-button ${listening ? 'listening' : ''}`} onClick={toggleMic}>
            {listening ? 'Stop microphone' : 'Start microphone'}
          </button>
        </header>
        {error && <p className="error">{error}</p>}
        <div className="canvas-frame">
          <DotGridVisualizer analyzer={analyzer} settings={settings} />
        </div>
        <p className="hint">
          {listening
            ? settings.mode === 'chronological'
              ? 'Speaking history scrolls right to left. New audio enters at the right edge.'
              : 'Audio reacts in real time, rippling outward from the center of the grid.'
            : 'Start the microphone to see the grid react to your voice.'}
        </p>
      </main>
      <ControlPanel
        settings={settings}
        onSettings={patchSettings}
        audio={audio}
        onAudio={patchAudio}
      />
    </div>
  );
}

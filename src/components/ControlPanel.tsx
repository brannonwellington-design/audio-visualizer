import { useEffect, useState } from 'react';
import type { TransitionStyle, VisualizerMode, VisualizerSettings } from './DotGridVisualizer';
import type { AnalyzerParams } from '../audio/speechAnalyzer';
import {
  DEFAULT_THINKING,
  PACKINGS,
  THINK_PATTERNS,
  type ThinkingRun,
  type ThinkingSettings,
} from '../thinking/types';

const MODES: { value: VisualizerMode; label: string }[] = [
  { value: 'chronological', label: 'Chronological' },
  { value: 'centerChron', label: 'Center chron' },
  { value: 'seismograph', label: 'Seismograph' },
  { value: 'spectrum', label: 'Spectrum' },
  { value: 'centerPulse', label: 'Center pulse' },
  { value: 'string', label: 'String' },
  { value: 'radial', label: 'Radial' },
  { value: 'orbit', label: 'Orbit' },
  { value: 'spark', label: 'Spark' },
];

const TRANSITIONS: { value: TransitionStyle; label: string }[] = [
  { value: 'morph', label: 'Morph' },
  { value: 'curl', label: 'Curl' },
  { value: 'bloom', label: 'Bloom' },
  { value: 'blink', label: 'Blink' },
];

/** Modes whose pace is set by the scrollMs step interval, with slider labels */
const SPEED_CONTROL: Partial<Record<VisualizerMode, { label: string; unit: string }>> = {
  chronological: { label: 'Scroll speed', unit: 'ms/col' },
  centerChron: { label: 'Scroll speed', unit: 'ms/col' },
  seismograph: { label: 'Sweep speed', unit: 'ms/col' },
  radial: { label: 'Sweep speed', unit: 'ms/spoke' },
  orbit: { label: 'Scroll speed', unit: 'ms/col' },
  spark: { label: 'Blink speed', unit: 'ms' },
};

function NumberField({
  value,
  min,
  onCommit,
}: {
  value: number;
  min: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= min) {
      onCommit(n);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <span className="number-field">
      <input
        type="number"
        min={min}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      px
    </span>
  );
}

interface Props {
  appMode: 'audio' | 'thinking';
  onAppMode: (mode: 'audio' | 'thinking') => void;
  settings: VisualizerSettings;
  onSettings: (patch: Partial<VisualizerSettings>) => void;
  audio: AnalyzerParams;
  onAudio: (patch: Partial<AnalyzerParams>) => void;
  thinking: ThinkingSettings;
  onThinking: (patch: Partial<ThinkingSettings>) => void;
  thinkingRun: ThinkingRun;
  onThinkingRun: () => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
  editable = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  editable?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="control">
      <span className="control-label">
        {label}
        {editable ? (
          <NumberField value={value} min={min} onCommit={onChange} />
        ) : (
          <span className="control-value">{format(value)}</span>
        )}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="control control-color">
      <span className="control-label">
        {label}
        <span className="control-value">{value}</span>
      </span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="control">
      <span className="control-label">{label}</span>
      <div className="segmented">
        {options.map((o) => (
          <button
            key={o.value}
            className={o.value === value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ControlPanel({
  appMode,
  onAppMode,
  settings,
  onSettings,
  audio,
  onAudio,
  thinking,
  onThinking,
  thinkingRun,
  onThinkingRun,
}: Props) {
  const speed = SPEED_CONTROL[settings.mode];
  return (
    <aside className="panel">
      <section>
        <h2>Function</h2>
        <Segmented
          label="Surface"
          value={appMode}
          options={[
            { value: 'audio', label: 'Audio' },
            { value: 'thinking', label: 'Thinking' },
          ]}
          onChange={onAppMode}
        />
      </section>
      {appMode === 'thinking' ? (
        <ThinkingControls
          thinking={thinking}
          onThinking={onThinking}
          thinkingRun={thinkingRun}
          onThinkingRun={onThinkingRun}
        />
      ) : (
        <AudioControls
          settings={settings}
          onSettings={onSettings}
          audio={audio}
          onAudio={onAudio}
          speed={speed}
        />
      )}
    </aside>
  );
}

function ThinkingControls({
  thinking,
  onThinking,
  thinkingRun,
  onThinkingRun,
}: {
  thinking: ThinkingSettings;
  onThinking: (patch: Partial<ThinkingSettings>) => void;
  thinkingRun: ThinkingRun;
  onThinkingRun: () => void;
}) {
  return (
    <>
      <section>
        <h2>Field</h2>
        <Slider
          label="Agents"
          value={thinking.count}
          min={4}
          max={400}
          onChange={(count) => onThinking({ count })}
        />
        <div className="control">
          <span className="control-label">Packing</span>
          <div className="mode-grid">
            {PACKINGS.map((p) => (
              <button
                key={p.value}
                className={p.value === thinking.packing ? 'active' : ''}
                onClick={() => onThinking({ packing: p.value })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Max width"
          value={thinking.width}
          min={240}
          max={1400}
          step={10}
          editable
          onChange={(width) => onThinking({ width })}
        />
        <Slider
          label="Height"
          value={thinking.height}
          min={80}
          max={800}
          step={1}
          editable
          onChange={(height) => onThinking({ height })}
        />
        <Slider
          label="Dot size"
          value={thinking.dotScale}
          min={0.15}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(dotScale) => onThinking({ dotScale })}
        />
      </section>

      <section>
        <h2>Thinking</h2>
        <button
          type="button"
          className={`think-run-button ${thinkingRun === 'running' ? 'settle' : ''}`}
          onClick={onThinkingRun}
          aria-pressed={thinkingRun === 'running'}
        >
          {thinkingRun === 'running' ? 'Settle' : 'Start'}
        </button>
        <div className="control">
          <span className="control-label">Pattern</span>
          <div className="mode-grid pattern-grid">
            {THINK_PATTERNS.map((p) => (
              <button
                key={p.value}
                className={p.value === thinking.pattern ? 'active' : ''}
                onClick={() => onThinking({ pattern: p.value })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Speed"
          value={thinking.speed}
          min={0.25}
          max={3}
          step={0.05}
          format={(v) => `${v.toFixed(2)}\u00d7`}
          onChange={(speed) => onThinking({ speed })}
        />
        <Segmented
          label="Duration"
          value={thinking.durationSec === 0 ? 'loop' : 'timed'}
          options={[
            { value: 'timed', label: 'Timed' },
            { value: 'loop', label: 'Loop' },
          ]}
          onChange={(v) =>
            onThinking({
              durationSec: v === 'loop' ? 0 : thinking.durationSec || DEFAULT_THINKING.durationSec,
            })
          }
        />
        {thinking.durationSec > 0 && (
          <Slider
            label="Think for"
            value={thinking.durationSec}
            min={2}
            max={30}
            step={1}
            format={(v) => `${v} s`}
            onChange={(durationSec) => onThinking({ durationSec })}
          />
        )}
        <Segmented
          label="Final answer"
          value={thinking.answerStyle}
          options={[
            { value: 'binary', label: 'On / off' },
            { value: 'analog', label: 'Opacity' },
          ]}
          onChange={(answerStyle) => onThinking({ answerStyle })}
        />
      </section>

      <section>
        <h2>Color</h2>
        <Slider
          label="Colors used"
          value={thinking.colorCount}
          min={1}
          max={3}
          onChange={(colorCount) => onThinking({ colorCount })}
        />
        <Segmented
          label="Blend"
          value={thinking.gradient ? 'gradient' : 'steps'}
          options={[
            { value: 'gradient', label: 'Gradient' },
            { value: 'steps', label: 'Steps' },
          ]}
          onChange={(v) => onThinking({ gradient: v === 'gradient' })}
        />
        <ColorInput label="Color A" value={thinking.colorA} onChange={(colorA) => onThinking({ colorA })} />
        {thinking.colorCount >= 2 && (
          <ColorInput label="Color B" value={thinking.colorB} onChange={(colorB) => onThinking({ colorB })} />
        )}
        {thinking.colorCount >= 3 && (
          <ColorInput label="Color C" value={thinking.colorC} onChange={(colorC) => onThinking({ colorC })} />
        )}
        <Slider
          label="Min opacity"
          value={thinking.opacityMin}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(opacityMin) => onThinking({ opacityMin: Math.min(opacityMin, thinking.opacityMax) })}
        />
        <Slider
          label="Max opacity"
          value={thinking.opacityMax}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(opacityMax) => onThinking({ opacityMax: Math.max(opacityMax, thinking.opacityMin) })}
        />
      </section>
    </>
  );
}

function AudioControls({
  settings,
  onSettings,
  audio,
  onAudio,
  speed,
}: {
  settings: VisualizerSettings;
  onSettings: (patch: Partial<VisualizerSettings>) => void;
  audio: AnalyzerParams;
  onAudio: (patch: Partial<AnalyzerParams>) => void;
  speed: { label: string; unit: string } | undefined;
}) {
  return (
    <>
      <section>
        <h2>Mode</h2>
        <div className="control">
          <span className="control-label">View</span>
          <div className="mode-grid">
            {MODES.map((m) => (
              <button
                key={m.value}
                className={m.value === settings.mode ? 'active' : ''}
                onClick={() => onSettings({ mode: m.value })}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <Segmented
          label="Dot style"
          value={settings.dotStyle}
          options={[
            { value: 'substates', label: 'Sub-states' },
            { value: 'binary', label: 'Binary' },
          ]}
          onChange={(dotStyle) => onSettings({ dotStyle })}
        />
        <div className="control">
          <span className="control-label">Layout transition</span>
          <div className="mode-grid">
            {TRANSITIONS.map((t) => (
              <button
                key={t.value}
                className={t.value === settings.transitionStyle ? 'active' : ''}
                onClick={() => onSettings({ transitionStyle: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {speed && (
          <Slider
            label={speed.label}
            value={settings.scrollMs}
            min={30}
            max={300}
            step={5}
            format={(v) => `${v} ${speed.unit}`}
            onChange={(scrollMs) => onSettings({ scrollMs })}
          />
        )}
        <Segmented
          label="Left taper"
          value={settings.taperLeft ? 'on' : 'off'}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(v) =>
            onSettings({
              taperLeft: v === 'on',
              taperLeftWidth: settings.taperLeftWidth ?? 0.05,
            })
          }
        />
        {settings.taperLeft && (
          <Slider
            label="Left taper width"
            value={settings.taperLeftWidth ?? 0.05}
            min={0.01}
            max={0.5}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(taperLeftWidth) => onSettings({ taperLeftWidth })}
          />
        )}
        <Segmented
          label="Right taper"
          value={settings.taperRight ? 'on' : 'off'}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(v) =>
            onSettings({
              taperRight: v === 'on',
              taperRightWidth: settings.taperRightWidth ?? 0.05,
            })
          }
        />
        {settings.taperRight && (
          <Slider
            label="Right taper width"
            value={settings.taperRightWidth ?? 0.05}
            min={0.01}
            max={0.5}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(taperRightWidth) => onSettings({ taperRightWidth })}
          />
        )}
        {settings.mode === 'centerPulse' && (
          <>
            <Slider
              label="Ripple speed"
              value={settings.rippleMs}
              min={10}
              max={200}
              step={5}
              format={(v) => `${v} ms/col`}
              onChange={(rippleMs) => onSettings({ rippleMs })}
            />
            <Slider
              label="Ripple falloff"
              value={settings.rippleFalloff}
              min={0.5}
              max={1}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(rippleFalloff) => onSettings({ rippleFalloff })}
            />
          </>
        )}
        {settings.mode === 'string' && (
          <>
            <Slider
              label="Wave speed"
              value={settings.rippleMs}
              min={10}
              max={200}
              step={5}
              format={(v) => `${v} ms/col`}
              onChange={(rippleMs) => onSettings({ rippleMs })}
            />
            <Slider
              label="Sustain"
              value={settings.rippleFalloff}
              min={0.5}
              max={1}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(rippleFalloff) => onSettings({ rippleFalloff })}
            />
          </>
        )}
      </section>

      <section>
        <h2>Grid</h2>
        <Slider
          label="Max width"
          value={settings.width}
          min={240}
          max={1400}
          step={10}
          editable
          onChange={(width) => onSettings({ width })}
        />
        <Slider
          label="Height"
          value={settings.height}
          min={32}
          max={600}
          step={1}
          editable
          onChange={(height) => onSettings({ height })}
        />
        <Slider
          label="Columns"
          value={settings.columns}
          min={8}
          max={200}
          onChange={(columns) => onSettings({ columns })}
        />
        <Slider
          label="Rows"
          value={settings.rows}
          min={3}
          max={100}
          step={1}
          onChange={(rows) => onSettings({ rows })}
        />
        <Slider
          label="Dot size"
          value={settings.dotScale}
          min={0.15}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(dotScale) => onSettings({ dotScale })}
        />
      </section>

      <section>
        <h2>Color</h2>
        <ColorInput
          label="Active dots"
          value={settings.activeColor}
          onChange={(activeColor) => onSettings({ activeColor })}
        />
        <ColorInput
          label="Inactive dots"
          value={settings.inactiveColor}
          onChange={(inactiveColor) => onSettings({ inactiveColor })}
        />
      </section>

      <section>
        <h2>Feel</h2>
        <Slider
          label="Attack"
          value={audio.attackMs}
          min={1}
          max={100}
          format={(v) => `${v} ms`}
          onChange={(attackMs) => onAudio({ attackMs })}
        />
        <Slider
          label="Release"
          value={audio.releaseMs}
          min={1}
          max={600}
          step={1}
          format={(v) => `${v} ms`}
          onChange={(releaseMs) => onAudio({ releaseMs })}
        />
        <Slider
          label="Noise gate"
          value={audio.gate}
          min={0}
          max={0.2}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={(gate) => onAudio({ gate })}
        />
        <Slider
          label="Sensitivity"
          value={audio.gain}
          min={0.2}
          max={3}
          step={0.05}
          format={(v) => `${v.toFixed(2)}\u00d7`}
          onChange={(gain) => onAudio({ gain })}
        />
      </section>
    </>
  );
}

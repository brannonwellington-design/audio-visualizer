import { useEffect, useState } from 'react';
import type { TransitionStyle, VisualizerMode, VisualizerSettings } from './DotGridVisualizer';
import type { AnalyzerParams } from '../audio/speechAnalyzer';

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
  settings: VisualizerSettings;
  onSettings: (patch: Partial<VisualizerSettings>) => void;
  audio: AnalyzerParams;
  onAudio: (patch: Partial<AnalyzerParams>) => void;
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

export function ControlPanel({ settings, onSettings, audio, onAudio }: Props) {
  const speed = SPEED_CONTROL[settings.mode];
  return (
    <aside className="panel">
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
    </aside>
  );
}

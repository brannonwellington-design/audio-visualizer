import type { VisualizerSettings } from './DotGridVisualizer';
import type { AnalyzerParams } from '../audio/speechAnalyzer';

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
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="control">
      <span className="control-label">
        {label}
        <span className="control-value">{format(value)}</span>
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
  return (
    <aside className="panel">
      <section>
        <h2>Mode</h2>
        <Segmented
          label="View"
          value={settings.mode}
          options={[
            { value: 'chronological', label: 'Chronological' },
            { value: 'static', label: 'Static' },
          ]}
          onChange={(mode) => onSettings({ mode })}
        />
        <Segmented
          label="Dot style"
          value={settings.dotStyle}
          options={[
            { value: 'substates', label: 'Sub-states' },
            { value: 'binary', label: 'Binary' },
          ]}
          onChange={(dotStyle) => onSettings({ dotStyle })}
        />
        {settings.mode === 'chronological' ? (
          <>
            <Slider
              label="Scroll speed"
              value={settings.scrollMs}
              min={30}
              max={300}
              step={5}
              format={(v) => `${v} ms/col`}
              onChange={(scrollMs) => onSettings({ scrollMs })}
            />
            <Segmented
              label="Edge taper"
              value={settings.edgeTaper ? 'on' : 'off'}
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
              onChange={(v) => onSettings({ edgeTaper: v === 'on' })}
            />
            {settings.edgeTaper && (
              <Slider
                label="Taper width"
                value={settings.edgeTaperWidth}
                min={0.05}
                max={0.5}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(edgeTaperWidth) => onSettings({ edgeTaperWidth })}
              />
            )}
          </>
        ) : (
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
      </section>

      <section>
        <h2>Grid</h2>
        <Slider
          label="Width"
          value={settings.width}
          min={240}
          max={1400}
          step={10}
          format={(v) => `${v} px`}
          onChange={(width) => onSettings({ width })}
        />
        <Slider
          label="Height"
          value={settings.height}
          min={48}
          max={600}
          step={10}
          format={(v) => `${v} px`}
          onChange={(height) => onSettings({ height })}
        />
        <Slider
          label="Columns"
          value={settings.columns}
          min={8}
          max={160}
          onChange={(columns) => onSettings({ columns })}
        />
        <Slider
          label="Rows"
          value={settings.rows}
          min={3}
          max={41}
          step={2}
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
          min={20}
          max={600}
          step={5}
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

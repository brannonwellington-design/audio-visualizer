export type PackingKind = 'lattice' | 'hex' | 'tight';
export type ThinkPattern = 'scan' | 'ripple' | 'checker' | 'rain' | 'pulse' | 'drift' | 'twinkle';
export type PatternChoice = ThinkPattern | 'cycle';
export type AnswerStyle = 'binary' | 'analog';
export type ThinkingRun = 'idle' | 'running' | 'done';

export interface ThinkingSettings {
  count: number;
  packing: PackingKind;
  pattern: PatternChoice;
  /** Playback rate for thinking patterns (0.25–3) */
  speed: number;
  width: number;
  height: number;
  dotScale: number;
  colorA: string;
  colorB: string;
  colorC: string;
  /** How many of the palette colors are in play (1–3) */
  colorCount: number;
  /** Mix neighboring palette colors instead of snapping to them */
  gradient: boolean;
  opacityMin: number;
  opacityMax: number;
  /** Seconds to think. 0 = loop until Submit */
  durationSec: number;
  answerStyle: AnswerStyle;
}

export const DEFAULT_THINKING: ThinkingSettings = {
  count: 100,
  packing: 'lattice',
  pattern: 'cycle',
  speed: 1,
  width: 600,
  height: 280,
  dotScale: 0.82,
  colorA: '#CF2617',
  colorB: '#0021CC',
  colorC: '#120F08',
  colorCount: 2,
  gradient: true,
  opacityMin: 0.18,
  opacityMax: 1,
  durationSec: 8,
  answerStyle: 'analog',
};

export const THINK_PATTERNS: { value: PatternChoice; label: string }[] = [
  { value: 'cycle', label: 'Cycle' },
  { value: 'scan', label: 'Scan' },
  { value: 'ripple', label: 'Ripple' },
  { value: 'checker', label: 'Checker' },
  { value: 'rain', label: 'Rain' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'drift', label: 'Drift' },
  { value: 'twinkle', label: 'Twinkle' },
];

export const PACKINGS: { value: PackingKind; label: string }[] = [
  { value: 'lattice', label: 'Lattice' },
  { value: 'hex', label: 'Hex' },
  { value: 'tight', label: 'Tight' },
];

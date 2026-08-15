import type { PackedAgent } from './packing';
import type { ThinkPattern } from './types';

const CYCLE_ORDER: ThinkPattern[] = [
  'scan',
  'spiral',
  'ripple',
  'cascade',
  'checker',
  'mesh',
  'rain',
  'converge',
  'pulse',
  'beacon',
  'drift',
  'glitch',
  'twinkle',
];

export const PATTERN_CYCLE_SEC = 5.5;

function fract(x: number) {
  return x - Math.floor(x);
}

function hash01(i: number, salt = 0): number {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function wave01(x: number) {
  return 0.5 + 0.5 * Math.sin(x);
}

/** 0..1 activity for one agent in the unified field. */
export function agentActivity(
  pattern: ThinkPattern,
  agent: PackedAgent,
  n: number,
  t: number,
  seed: number,
): number {
  const phase = hash01(agent.i, seed);
  switch (pattern) {
    case 'scan':
      return wave01(agent.v * Math.PI * 7 - t * 3.1 + phase * 0.5);
    case 'ripple': {
      const d = Math.hypot(agent.u - 0.5, agent.v - 0.5);
      return wave01(d * 22 - t * 4.2 + phase);
    }
    case 'checker': {
      const cell = (Math.floor(agent.u * 10) + Math.floor(agent.v * 8)) & 1;
      const pulse = wave01(t * 3.6 + (cell ? 0 : Math.PI));
      return 0.12 + pulse * (0.55 + 0.33 * phase);
    }
    case 'rain': {
      const drop = fract(agent.v * 0.92 + t * (0.35 + phase * 0.7) + agent.u * 2.4);
      return drop < 0.2 ? 1 - drop / 0.2 : 0.08 + phase * 0.06;
    }
    case 'pulse': {
      const beat = Math.pow(Math.max(0, Math.sin(t * 2.15 - phase * 1.4)), 12);
      return 0.1 + 0.9 * beat;
    }
    case 'drift': {
      const head = fract(t * 0.12 * Math.max(1, Math.sqrt(n) / 10));
      const pos = n <= 1 ? 0.5 : agent.i / (n - 1);
      let d = Math.abs(pos - head);
      d = Math.min(d, 1 - d);
      const body = Math.max(0, 1 - d * Math.max(10, n * 0.22));
      return 0.08 + 0.92 * body;
    }
    case 'twinkle': {
      const period = 0.28 + phase * 0.85;
      const p = fract(t / period + phase);
      const on = p < 0.18 + phase * 0.16;
      return on ? 1 : 0.08;
    }
    case 'spiral': {
      const ang = Math.atan2(agent.v - 0.5, agent.u - 0.5);
      const d = Math.hypot(agent.u - 0.5, agent.v - 0.5);
      return wave01(ang * 3.2 + d * 16 - t * 3.6 + phase * 0.35);
    }
    case 'cascade': {
      const rows = 9;
      const row = Math.floor(agent.v * (rows - 0.001));
      const head = Math.floor(fract(t * 0.85) * rows);
      const dist = (row - head + rows) % rows;
      if (dist === 0) return 1;
      if (dist === 1) return 0.55 + 0.15 * phase;
      if (dist === 2) return 0.22;
      return 0.08 + phase * 0.04;
    }
    case 'mesh': {
      const a = Math.sin((agent.u + agent.v) * 14 - t * 3.1);
      const b = Math.sin((agent.u - agent.v) * 14 + t * 2.2);
      return 0.1 + 0.9 * (0.5 + 0.5 * a * b);
    }
    case 'converge': {
      const d = Math.hypot(agent.u - 0.5, agent.v - 0.5);
      const radius = 0.08 + 0.64 * (0.5 + 0.5 * Math.cos(t * 1.45));
      const band = Math.exp(-Math.pow((d - radius) * 11, 2));
      return 0.08 + 0.92 * band;
    }
    case 'glitch': {
      const slice = Math.floor(agent.v * 16);
      const col = Math.floor(agent.u * 20);
      const tCell = Math.floor(t * 7.5);
      const g = hash01(slice * 31 + col, tCell + seed);
      const scan = hash01(slice, tCell + seed);
      if (scan > 0.9) return 0.12 + 0.88 * hash01(col, tCell + 9);
      if (g > 0.84) return 1;
      if (g > 0.72) return 0.22;
      return 0.08;
    }
    case 'beacon': {
      const ang = Math.atan2(agent.v - 0.5, agent.u - 0.5);
      let da = ang - t * 1.4;
      da = da - Math.PI * 2 * Math.floor((da + Math.PI) / (Math.PI * 2));
      const beam = Math.pow(Math.max(0, Math.cos(da)), 16);
      const d = Math.hypot(agent.u - 0.5, agent.v - 0.5);
      return 0.08 + 0.92 * beam * (0.25 + 0.75 * d);
    }
  }
}

export function patternAtTime(
  choice: ThinkPattern | 'cycle',
  t: number,
): { a: ThinkPattern; b: ThinkPattern; mix: number } {
  if (choice !== 'cycle') return { a: choice, b: choice, mix: 0 };
  const idx = Math.floor(t / PATTERN_CYCLE_SEC) % CYCLE_ORDER.length;
  const next = (idx + 1) % CYCLE_ORDER.length;
  const local = (t / PATTERN_CYCLE_SEC) % 1;
  const mix = Math.max(0, (local - 0.82) / 0.18);
  return { a: CYCLE_ORDER[idx], b: CYCLE_ORDER[next], mix };
}

export function mixedActivity(
  choice: ThinkPattern | 'cycle',
  agent: PackedAgent,
  n: number,
  t: number,
  seed: number,
): number {
  const { a, b, mix } = patternAtTime(choice, t);
  if (mix <= 0) return agentActivity(a, agent, n, t, seed);
  const va = agentActivity(a, agent, n, t, seed);
  const vb = agentActivity(b, agent, n, t, seed);
  return va * (1 - mix) + vb * mix;
}

export function agentAnswer(i: number, seed: number): number {
  return hash01(i, seed + 17);
}

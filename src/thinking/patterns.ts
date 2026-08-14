import type { PackedAgent } from './packing';
import type { ThinkPattern } from './types';

const CYCLE_ORDER: ThinkPattern[] = [
  'scan',
  'ripple',
  'checker',
  'rain',
  'pulse',
  'drift',
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

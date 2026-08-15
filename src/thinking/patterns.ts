import type { PackedAgent } from './packing';
import type { ThinkPattern } from './types';

const CYCLE_ORDER: ThinkPattern[] = [
  'scan',
  'stream',
  'spiral',
  'weave',
  'ripple',
  'breath',
  'cascade',
  'synapse',
  'checker',
  'constellation',
  'mesh',
  'solve',
  'rain',
  'listen',
  'converge',
  'gyre',
  'pulse',
  'shape',
  'beacon',
  'helix',
  'drift',
  'comet',
  'glitch',
  'bloom',
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

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / Math.max(1e-6, e1 - e0));
  return t * t * (3 - 2 * t);
}

function gauss(x: number, sigma: number) {
  const s = Math.max(1e-4, sigma);
  return Math.exp((-0.5 * x * x) / (s * s));
}

function wrapDelta(a: number, b: number) {
  let d = a - b;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax;
  const vy = by - ay;
  const c2 = vx * vx + vy * vy;
  const k = c2 > 1e-8 ? clamp01(((px - ax) * vx + (py - ay) * vy) / c2) : 0;
  return Math.hypot(px - ax - k * vx, py - ay - k * vy);
}

/** Polar radius of a regular n-gon; n=0 is a circle. */
function polarRadius(ang: number, n: number, r: number) {
  if (n < 3) return r;
  const step = (Math.PI * 2) / n;
  const a = ang - step * Math.floor(ang / step) - step * 0.5;
  return r / Math.max(0.2, Math.cos(a));
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
    case 'weave': {
      const s0 = gauss(agent.v - (0.5 + 0.26 * Math.sin(agent.u * 9.2 + t * 2.15)), 0.045);
      const s1 = gauss(agent.v - (0.5 + 0.26 * Math.sin(agent.u * 9.2 + t * 2.15 + 2.094)), 0.045);
      const s2 = gauss(agent.v - (0.5 + 0.26 * Math.sin(agent.u * 9.2 + t * 2.15 + 4.189)), 0.045);
      return 0.08 + 0.92 * Math.max(s0, s1, s2);
    }
    case 'breath': {
      const d = Math.hypot(agent.u - 0.5, agent.v - 0.5);
      const inhale = 0.5 + 0.5 * Math.sin(t * 1.05);
      const chest = 1 - d * 0.72;
      return 0.12 + 0.88 * (0.22 + 0.78 * inhale) * Math.max(0.15, chest);
    }
    case 'synapse': {
      const hops = 5;
      const chain = Math.floor(t * 5.4);
      const local = fract(t * 5.4);
      const h0 = Math.min(hops - 1, Math.floor(local * hops));
      const h1 = Math.min(hops - 1, h0 + 1);
      const f = fract(local * hops);
      const aU = 0.1 + 0.8 * hash01(chain, seed + h0 * 3);
      const aV = 0.1 + 0.8 * hash01(chain, seed + h0 * 3 + 1);
      const bU = 0.1 + 0.8 * hash01(chain, seed + h1 * 3);
      const bV = 0.1 + 0.8 * hash01(chain, seed + h1 * 3 + 1);
      const bolt = gauss(distToSeg(agent.u, agent.v, aU, aV, bU, bV), 0.028);
      const head = gauss(Math.hypot(agent.u - bU, agent.v - bV), 0.05) * (0.4 + 0.6 * f);
      return 0.08 + 0.92 * Math.max(bolt * (1 - f * 0.55), head);
    }
    case 'constellation': {
      const clusters = 5;
      const lit = Math.floor(t * 0.65 + seed * 0.01) % clusters;
      const nxt = (lit + 1) % clusters;
      const cU = 0.12 + 0.76 * hash01(lit, seed + 2);
      const cV = 0.14 + 0.72 * hash01(lit, seed + 5);
      const nU = 0.12 + 0.76 * hash01(nxt, seed + 2);
      const nV = 0.14 + 0.72 * hash01(nxt, seed + 5);
      const node = gauss(Math.hypot(agent.u - cU, agent.v - cV), 0.09);
      const neighbor = gauss(Math.hypot(agent.u - nU, agent.v - nV), 0.07) * 0.55;
      const wire = gauss(distToSeg(agent.u, agent.v, cU, cV, nU, nV), 0.03) * 0.7;
      return 0.08 + 0.92 * Math.max(node, neighbor, wire);
    }
    case 'solve': {
      const cycle = fract(t * 0.2);
      let mix = 0;
      if (cycle < 0.32) mix = 0;
      else if (cycle < 0.42) mix = smoothstep(0.32, 0.42, cycle);
      else if (cycle < 0.72) mix = 1;
      else if (cycle < 0.82) mix = 1 - smoothstep(0.72, 0.82, cycle);
      const chaos = hash01(agent.i, Math.floor(t * 9) + seed);
      const plus =
        Math.min(Math.abs(agent.u - 0.5), Math.abs(agent.v - 0.5)) < 0.07 &&
        Math.max(Math.abs(agent.u - 0.5), Math.abs(agent.v - 0.5)) < 0.34
          ? 1
          : 0.08;
      return lerp(0.08 + 0.92 * chaos, plus, mix);
    }
    case 'listen': {
      const amp = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.35 + agent.u * 2.2));
      const y = 0.5 + amp * Math.sin(agent.u * 16 - t * 5.1);
      return 0.08 + 0.92 * gauss(agent.v - y, 0.04);
    }
    case 'gyre': {
      const x = (agent.u - 0.5) / 0.92;
      const y = (agent.v - 0.5) / 0.58;
      const d = Math.hypot(x, y);
      const ang = Math.atan2(y, x);
      const ring = Math.round(d * 5.2);
      const dir = ring % 2 === 0 ? 1 : -1;
      const bead = Math.pow(Math.max(0, Math.cos(ang * (2 + (ring % 3)) + t * dir * (1.1 + ring * 0.22))), 10);
      const onRing = gauss(d - ring / 5.2, 0.045);
      return 0.08 + 0.92 * onRing * (0.18 + 0.82 * bead);
    }
    case 'stream': {
      const order = agent.v * 0.1 + agent.u * 0.9;
      const head = fract(t * 0.26);
      const delta = wrapDelta(order, head);
      const cursor = gauss(delta, 0.028);
      const trail = delta < 0 && delta > -0.28 ? 0.42 * (1 + delta / 0.28) : 0;
      return 0.08 + 0.92 * Math.max(cursor, trail);
    }
    case 'shape': {
      const ang = Math.atan2(agent.v - 0.5, agent.u - 0.5);
      const d = Math.hypot(agent.u - 0.5, agent.v - 0.5);
      const morph = t * 0.16;
      const a = Math.floor(morph) % 3;
      const f = smoothstep(0.18, 0.82, morph % 1);
      const sides = [0, 3, 4];
      const r = lerp(polarRadius(ang, sides[a], 0.3), polarRadius(ang, sides[(a + 1) % 3], 0.3), f);
      return 0.08 + 0.92 * gauss(d - r, 0.028);
    }
    case 'helix': {
      const y1 = 0.5 + 0.26 * Math.sin(agent.u * Math.PI * 4 + t * 2.3);
      const y2 = 0.5 + 0.26 * Math.sin(agent.u * Math.PI * 4 + t * 2.3 + Math.PI);
      const front = 0.5 + 0.5 * Math.cos(agent.u * Math.PI * 4 + t * 2.3);
      const a = gauss(agent.v - y1, 0.04) * (0.4 + 0.6 * front);
      const b = gauss(agent.v - y2, 0.04) * (0.4 + 0.6 * (1 - front));
      return 0.08 + 0.92 * Math.max(a, b);
    }
    case 'comet': {
      const pathU = fract(t * 0.17);
      const pathV = 0.5 + 0.3 * Math.sin(pathU * Math.PI * 3 + seed * 0.4);
      const du = wrapDelta(agent.u, pathU);
      const dv = agent.v - pathV;
      const head = Math.exp(-(du * du * 240 + dv * dv * 90));
      const tail = du < 0 && du > -0.24 ? Math.exp(-dv * dv * 70) * (1 + du / 0.24) * 0.75 : 0;
      return 0.08 + 0.92 * Math.max(head, tail);
    }
    case 'bloom': {
      const ang = Math.atan2(agent.v - 0.5, agent.u - 0.5);
      const d = Math.hypot(agent.u - 0.5, agent.v - 0.5);
      const open = 0.5 + 0.5 * Math.sin(t * 1.15);
      const petal = 0.5 + 0.5 * Math.cos(ang * 6);
      const r = 0.1 + 0.3 * open * (0.35 + 0.65 * petal);
      return 0.08 + 0.92 * gauss(d - r, 0.032);
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

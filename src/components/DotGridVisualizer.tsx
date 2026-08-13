import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { SpeechAnalyzer } from '../audio/speechAnalyzer';

export type VisualizerMode =
  | 'chronological'
  | 'centerChron'
  | 'seismograph'
  | 'spectrum'
  | 'centerPulse'
  | 'string'
  | 'radial'
  | 'orbit'
  | 'spark';
export type DotStyle = 'substates' | 'binary';
export type LayoutFamily = 'strip' | 'radial';
export type TransitionStyle = 'morph' | 'curl' | 'bloom' | 'blink';

export interface GridLayout {
  height: number;
  columns: number;
  rows: number;
}

export const STRIP_LAYOUT: GridLayout = { height: 64, columns: 140, rows: 17 };
export const RADIAL_LAYOUT: GridLayout = { height: 182, columns: 160, rows: 24 };

export function layoutFamily(mode: VisualizerMode): LayoutFamily {
  return mode === 'radial' || mode === 'orbit' || mode === 'spark' ? 'radial' : 'strip';
}

export function isRadialMode(mode: VisualizerMode): boolean {
  return layoutFamily(mode) === 'radial';
}

export interface VisualizerSettings {
  mode: VisualizerMode;
  dotStyle: DotStyle;
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Dot diameter as a fraction of the grid cell (0..1) */
  dotScale: number;
  activeColor: string;
  inactiveColor: string;
  /** Time-based modes: how many ms each column/cell represents */
  scrollMs: number;
  /** Taper columns down to the center line as they near the left (exit) edge */
  taperLeft: boolean;
  /** Portion of the grid width used for the left taper (0..0.5) */
  taperLeftWidth: number;
  /** Taper incoming columns near the right (entry) edge */
  taperRight: boolean;
  /** Portion of the grid width used for the right taper (0..0.5) */
  taperRightWidth: number;
  /** Center pulse: ms for energy to propagate one column outward. String mode: wave speed. */
  rippleMs: number;
  /** Center pulse: energy retained per column as it travels outward (0..1). String mode: damping. */
  rippleFalloff: number;
  /** Animation used when switching between strip and radial layouts */
  transitionStyle: TransitionStyle;
}

export interface VisualizerExport {
  /** Download the current frame as a PNG (rendered at devicePixelRatio) */
  exportPNG: () => Promise<void>;
  /** Download the current frame as a resolution-independent SVG */
  exportSVG: () => void;
  /** Copy the current frame's SVG markup to the clipboard */
  copySVG: () => Promise<void>;
}

interface Props {
  analyzer: SpeechAnalyzer;
  settings: VisualizerSettings;
  paused: boolean;
  exportRef?: RefObject<VisualizerExport | null>;
}

interface Dot {
  x: number;
  y: number;
  r: number;
  active: boolean;
  /** 0..1 column / angle identity, used to pair dots across layouts */
  u: number;
  /** 0..1 row / radius identity, used to pair dots across layouts */
  v: number;
}

interface Geometry {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  radius: number;
  centerRow: number;
  maxRowDist: number;
  rowStep: number;
}

function geometry(s: VisualizerSettings, w: number, h: number): Geometry {
  const cols = Math.max(1, s.columns);
  const rows = Math.max(1, s.rows);
  const cellW = w / cols;
  const cellH = h / rows;
  const radius = (Math.min(cellW, cellH) / 2) * s.dotScale;
  const centerRow = (rows - 1) / 2;
  // For even row counts, both middle rows act as the always-on center line.
  const maxRowDist = Math.max(1, centerRow - (rows % 2 === 0 ? 0.5 : 0));
  return { cols, rows, cellW, cellH, radius, centerRow, maxRowDist, rowStep: 1 / maxRowDist };
}

/**
 * One value per column, dots activate outward from the center line.
 * Shared by every column-based mode.
 */
function columnDots(values: number[], s: VisualizerSettings, w: number, h: number): Dot[] {
  const g = geometry(s, w, h);
  const dots: Dot[] = [];
  for (let c = 0; c < g.cols; c++) {
    const v = values[c] ?? 0;
    const x = (c + 0.5) * g.cellW;
    for (let r = 0; r < g.rows; r++) {
      let dist = Math.abs(r - g.centerRow);
      if (g.rows % 2 === 0) dist = Math.max(0, dist - 0.5);
      const threshold = dist / g.maxRowDist;
      const active = v >= threshold && (threshold === 0 || v > 0);
      let rad = g.radius;
      if (active && s.dotStyle === 'substates' && threshold > 0) {
        // Frontier dot eases in as the level crosses its threshold
        const partial = Math.min(1, (v - threshold) / g.rowStep);
        rad = g.radius * (0.35 + 0.65 * partial);
      }
      dots.push({
        x,
        y: (r + 0.5) * g.cellH,
        r: rad,
        active,
        u: (c + 0.5) / g.cols,
        v: (r + 0.5) / g.rows,
      });
    }
  }
  return dots;
}

/**
 * Concentric rings of equal-sized dots. Inner rings use fewer dots so
 * spacing stays even — energy grows outward from a baseline inner ring.
 */
function radialDots(values: number[], s: VisualizerSettings, w: number, h: number): Dot[] {
  const g = geometry(s, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) / 2 - 2;
  const inner = outer * 0.12;
  const ringStep = (outer - inner) / g.rows;
  const outerArc = (Math.PI * 2 * outer) / Math.max(1, g.cols);
  const rad = (Math.min(ringStep, outerArc) / 2) * s.dotScale;
  const rowStep = g.rows > 1 ? 1 / (g.rows - 1) : 1;
  const dots: Dot[] = [];
  for (let r = 0; r < g.rows; r++) {
    const threshold = g.rows === 1 ? 0 : r / (g.rows - 1);
    const ringR = inner + (r + 0.5) * ringStep;
    const count = Math.max(1, Math.round(g.cols * (ringR / outer)));
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = t * Math.PI * 2 - Math.PI / 2;
      const col = Math.min(g.cols - 1, Math.floor(t * g.cols));
      const v = values[col] ?? 0;
      const active = v >= threshold && (threshold === 0 || v > 0);
      let dotR = rad;
      if (active && s.dotStyle === 'substates' && threshold > 0) {
        const partial = Math.min(1, (v - threshold) / rowStep);
        dotR = rad * (0.35 + 0.65 * partial);
      }
      dots.push({
        x: cx + Math.cos(angle) * ringR,
        y: cy + Math.sin(angle) * ringR,
        r: dotR,
        active,
        u: t,
        v: (r + 0.5) / g.rows,
      });
    }
  }
  return dots;
}

function hash01(u: number, v: number): number {
  const x = Math.sin(u * 127.1 + v * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Same equal-size ring packing as radial, but energy makes dots strobe
 * instead of holding a solid fill.
 */
function sparkDots(
  values: number[],
  s: VisualizerSettings,
  w: number,
  h: number,
  now: number,
): Dot[] {
  const g = geometry(s, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) / 2 - 2;
  const inner = outer * 0.12;
  const ringStep = (outer - inner) / g.rows;
  const outerArc = (Math.PI * 2 * outer) / Math.max(1, g.cols);
  const rad = (Math.min(ringStep, outerArc) / 2) * s.dotScale;
  const rowStep = g.rows > 1 ? 1 / (g.rows - 1) : 1;
  const basePeriod = 48 + (Math.max(30, s.scrollMs) / 300) * 220;
  const dots: Dot[] = [];
  for (let r = 0; r < g.rows; r++) {
    const threshold = g.rows === 1 ? 0 : r / (g.rows - 1);
    const ringR = inner + (r + 0.5) * ringStep;
    const count = Math.max(1, Math.round(g.cols * (ringR / outer)));
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = t * Math.PI * 2 - Math.PI / 2;
      const col = Math.min(g.cols - 1, Math.floor(t * g.cols));
      const v = values[col] ?? 0;
      const energized = v >= threshold && (threshold === 0 || v > 0);
      let dotR = rad;
      let active = energized;
      if (threshold === 0) {
        active = true;
      } else if (!energized) {
        active = false;
      } else {
        const excess = Math.min(1, (v - threshold) / Math.max(rowStep, 1e-6));
        const hsh = hash01(t, (r + 0.5) / g.rows);
        const period = basePeriod * (0.55 + hsh * 0.9);
        const duty = 0.1 + 0.72 * excess;
        const phase = ((now / period) + hsh) % 1;
        active = phase < duty;
        if (s.dotStyle === 'substates') {
          dotR = rad * (0.4 + 0.6 * excess);
        }
      }
      dots.push({
        x: cx + Math.cos(angle) * ringR,
        y: cy + Math.sin(angle) * ringR,
        r: dotR,
        active,
        u: t,
        v: (r + 0.5) / g.rows,
      });
    }
  }
  return dots;
}

function buildSVG(dots: Dot[], s: VisualizerSettings): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  const circles = (active: boolean) =>
    dots
      .filter((d) => d.active === active)
      .map((d) => `<circle cx="${round(d.x)}" cy="${round(d.y)}" r="${round(d.r)}"/>`)
      .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" ` +
    `viewBox="0 0 ${s.width} ${s.height}">` +
    `<g fill="${s.inactiveColor}">${circles(false)}</g>` +
    `<g fill="${s.activeColor}">${circles(true)}</g>` +
    `</svg>`
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const smoothstep = (p: number) => p * p * (3 - 2 * p);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInCubic = (t: number) => t * t * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function bezier(a: number, b: number, c: number, t: number) {
  const mt = 1 - t;
  return mt * mt * a + 2 * mt * t * b + t * t * c;
}

function lerpDot(a: Dot, b: Dot, t: number): Dot {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    r: lerp(a.r, b.r, t),
    active: t < 0.5 ? a.active : b.active,
    u: lerp(a.u, b.u, t),
    v: lerp(a.v, b.v, t),
  };
}

function placeStripDot(d: Dot, srcW: number, srcH: number, dstW: number, dstH: number): Dot {
  return {
    ...d,
    x: d.x * (dstW / Math.max(1, srcW)),
    y: d.y + (dstH - srcH) / 2,
  };
}

function placeRadialDot(d: Dot, srcW: number, srcH: number, dstW: number, dstH: number): Dot {
  const s = Math.min(dstW / Math.max(1, srcW), dstH / Math.max(1, srcH));
  return {
    ...d,
    x: dstW / 2 + (d.x - srcW / 2) * s,
    y: dstH / 2 + (d.y - srcH / 2) * s,
    r: d.r * s,
  };
}

function placeDot(
  d: Dot,
  family: LayoutFamily,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Dot {
  return family === 'radial'
    ? placeRadialDot(d, srcW, srcH, dstW, dstH)
    : placeStripDot(d, srcW, srcH, dstW, dstH);
}

function curlHandle(d: Dot, w: number, h: number): { x: number; y: number } {
  const outer = Math.min(w, h) / 2 - 2;
  const inner = outer * 0.12;
  const angle = d.u * Math.PI * 2 - Math.PI / 2;
  const radius = inner + d.v * (outer - inner);
  return {
    x: w / 2 + Math.cos(angle) * radius,
    y: h / 2 + Math.sin(angle) * radius,
  };
}

interface DotPair {
  from: Dot;
  toIndex: number;
}

function pairDots(from: Dot[], to: Dot[]): DotPair[] {
  if (from.length === 0 && to.length === 0) return [];
  const fs = from
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d.u - b.d.u || a.d.v - b.d.v);
  const ts = to
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d.u - b.d.u || a.d.v - b.d.v);
  const n = Math.max(fs.length, ts.length, 1);
  const pairs: DotPair[] = [];
  for (let k = 0; k < n; k++) {
    const f = fs.length ? fs[Math.min(fs.length - 1, Math.floor((k * fs.length) / n))] : undefined;
    const t = ts.length ? ts[Math.min(ts.length - 1, Math.floor((k * ts.length) / n))] : undefined;
    const fromDot = f?.d ?? (t ? { ...t.d, r: 0 } : { x: 0, y: 0, r: 0, active: false, u: 0.5, v: 0.5 });
    const toIndex = t?.i ?? 0;
    pairs.push({ from: fromDot, toIndex });
  }
  return pairs;
}

const TRANSITION_MS: Record<TransitionStyle, number> = {
  morph: 860,
  curl: 1100,
  bloom: 980,
  blink: 960,
};

interface LayoutTransition {
  style: TransitionStyle;
  start: number;
  duration: number;
  fromFamily: LayoutFamily;
  toFamily: LayoutFamily;
  fromW: number;
  fromH: number;
  toW: number;
  toH: number;
  pairs: DotPair[];
  fromDots: Dot[];
}

function interpolatePair(
  fromPlaced: Dot,
  toPlaced: Dot,
  t: number,
  style: TransitionStyle,
  fromFamily: LayoutFamily,
  w: number,
  h: number,
): Dot {
  if (style === 'morph') return lerpDot(fromPlaced, toPlaced, t);

  if (style === 'curl') {
    const stripDot = fromFamily === 'strip' ? fromPlaced : toPlaced;
    const handle = curlHandle(stripDot, w, h);
    const u = fromFamily === 'strip' ? t : 1 - t;
    const stripSide = fromFamily === 'strip' ? fromPlaced : toPlaced;
    const radialSide = fromFamily === 'radial' ? fromPlaced : toPlaced;
    const eu = easeInOutCubic(u);
    return {
      x: bezier(stripSide.x, handle.x, radialSide.x, eu),
      y: bezier(stripSide.y, handle.y, radialSide.y, eu),
      r: lerp(fromPlaced.r, toPlaced.r, t),
      active: t < 0.5 ? fromPlaced.active : toPlaced.active,
      u: lerp(fromPlaced.u, toPlaced.u, t),
      v: lerp(fromPlaced.v, toPlaced.v, t),
    };
  }

  // Bloom: collapse through the canvas center, then expand into the new layout.
  const split = 0.44;
  const gather: Dot = {
    x: w / 2,
    y: h / 2,
    r: Math.max(0.4, Math.min(fromPlaced.r, toPlaced.r) * 0.18),
    active: t < split ? fromPlaced.active : toPlaced.active,
    u: 0.5,
    v: 0.5,
  };
  if (t < split) {
    return lerpDot(fromPlaced, gather, easeInCubic(t / split));
  }
  return lerpDot(gather, toPlaced, easeOutCubic((t - split) / (1 - split)));
}

/** Hard on/off flicker while leaving the old layout — positions never lerp. */
function blinkOutScale(t: number, delay: number): number {
  const local = (t - delay * 0.24) / 0.36;
  if (local <= 0) return 1;
  if (local >= 1) return 0;
  const on = Math.sin(local * 5 * Math.PI) > 0;
  return on ? 1 : 0;
}

/** Hard on/off flicker while arriving in the new layout — positions never lerp. */
function blinkInScale(t: number, delay: number): number {
  const local = (t - (0.5 + delay * 0.24)) / 0.36;
  if (local <= 0) return 0;
  if (local >= 1) return 1;
  const on = Math.sin(local * 4 * Math.PI) > 0;
  return on || local > 0.78 ? 1 : 0;
}

function taperColumnCount(cols: number, width: number | undefined): number {
  const fraction = Number.isFinite(width) ? Math.min(0.5, Math.max(0, width as number)) : 0.05;
  return Math.max(1, Math.round(cols * fraction));
}

/** Fade column values at the left (exit) and/or right (entry) canvas edges. */
function applyEdgeTapers(values: number[], s: VisualizerSettings) {
  const cols = values.length;
  const fade = (fromLeft: boolean, enabled: boolean, width: number | undefined) => {
    if (!enabled) return;
    const taperCols = taperColumnCount(cols, width);
    for (let c = 0; c < Math.min(taperCols, cols); c++) {
      const idx = fromLeft ? c : cols - 1 - c;
      values[idx] *= smoothstep(c / taperCols);
    }
  };
  fade(true, s.taperLeft, s.taperLeftWidth);
  fade(false, s.taperRight, s.taperRightWidth);
}

/**
 * Fade around a sweeping playhead: left taper shrinks old data ahead of it
 * (the refresh), right taper grows new data in behind it.
 */
function applyPlayheadTapers(values: number[], playhead: number, s: VisualizerSettings) {
  const cols = values.length;
  if (cols < 1) return;
  const fade = (ahead: boolean, enabled: boolean, width: number | undefined) => {
    if (!enabled) return;
    const taperCols = taperColumnCount(cols, width);
    for (let c = 0; c < Math.min(taperCols, cols); c++) {
      const idx = ahead
        ? (playhead + 1 + c) % cols
        : (playhead - c + cols) % cols;
      values[idx] *= smoothstep(c / taperCols);
    }
  };
  fade(true, s.taperLeft, s.taperLeftWidth);
  fade(false, s.taperRight, s.taperRightWidth);
}

/**
 * All per-mode mutable simulation state. Everything resets when the mode
 * changes (so comparisons start clean); within a mode, arrays are resized
 * lazily when the grid dimensions change.
 */
interface EngineState {
  mode: VisualizerMode | null;
  /** Scrolling / stepping accumulator shared by time-stepped modes */
  stepAccum: number;
  /** Loudest level observed since the last time step */
  maxSinceStep: number;
  /** Column history for scroll modes, persistent trace for sweep modes */
  values: number[];
  /** Center pulse mode diffusion chain */
  trail: number[];
  /** Sweep write position */
  playhead: number;
  /** String displacement and velocity per column */
  stringU: Float32Array;
  stringV: Float32Array;
}

function freshState(mode: VisualizerMode): EngineState {
  return {
    mode,
    stepAccum: 0,
    maxSinceStep: 0,
    values: [],
    trail: [],
    playhead: 0,
    stringU: new Float32Array(0),
    stringV: new Float32Array(0),
  };
}

/** Resize a column array preserving the most recent (rightmost) entries. */
function resizeColumns(arr: number[], cols: number): number[] {
  if (arr.length === cols) return arr;
  const keep = arr.slice(-cols);
  return new Array(cols - keep.length).fill(0).concat(keep);
}

/** Advance the shared step accumulator, invoking `step` once per elapsed period. */
function runSteps(st: EngineState, dt: number, periodMs: number, level: number, step: () => void) {
  st.maxSinceStep = Math.max(st.maxSinceStep, level);
  st.stepAccum += dt;
  const period = Math.max(1, periodMs);
  while (st.stepAccum >= period) {
    st.stepAccum -= period;
    step();
    st.maxSinceStep = level;
  }
}

/**
 * Renders the dot grid on a canvas driven by its own rAF loop.
 * Settings are read through a ref each frame so every control
 * takes effect live without restarting the loop — including
 * while paused, so a frozen frame can still be restyled and resized
 * before exporting.
 */
export function DotGridVisualizer({ analyzer, settings, paused, exportRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const stateRef = useRef<EngineState>(freshState(settings.mode));
  /** The dots drawn in the most recent frame; source of truth for exports */
  const lastDotsRef = useRef<Dot[]>([]);
  const lastFrameRef = useRef({
    w: settings.width,
    h: settings.height,
    family: layoutFamily(settings.mode),
    mode: settings.mode,
  });
  const transitionRef = useRef<LayoutTransition | null>(null);
  const pendingFromRef = useRef<{
    dots: Dot[];
    family: LayoutFamily;
    w: number;
    h: number;
    style: TransitionStyle;
  } | null>(null);
  const displaySizeRef = useRef({ w: settings.width, h: settings.height });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    box.style.aspectRatio = `${settingsRef.current.width} / ${settingsRef.current.height}`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const s = settingsRef.current;
      const frozen = pausedRef.current;
      const dt = frozen ? 0 : Math.min(100, now - lastTime);
      lastTime = now;

      const w = s.width;
      const targetH = s.height;
      const family = layoutFamily(s.mode);
      const prev = lastFrameRef.current;

      let st = stateRef.current;
      if (st.mode !== s.mode) {
        if (prev.family !== family && lastDotsRef.current.length > 0) {
          pendingFromRef.current = {
            dots: lastDotsRef.current.slice(),
            family: prev.family,
            w: prev.w,
            h: prev.h,
            style: s.transitionStyle,
          };
        }
        const prevValues = st.values;
        st = stateRef.current = freshState(s.mode);
        st.values = resizeColumns(prevValues, Math.max(1, s.columns));
      }

      const level = frozen ? 0 : analyzer.getLevel(now);
      const cols = Math.max(1, s.columns);
      const dtS = dt / 1000;

      const engineH = targetH;
      const h = engineH;
      let dots: Dot[];
      switch (s.mode) {
        case 'chronological': {
          st.values = resizeColumns(st.values, cols);
          if (!frozen) {
            runSteps(st, dt, s.scrollMs, level, () => {
              st.values.push(st.maxSinceStep);
              st.values.shift();
            });
          }
          const values = st.values.slice();
          if (!frozen) {
            // The rightmost (incoming) column always shows the live level so
            // the visual never feels a sample-interval behind the voice.
            values[cols - 1] = Math.max(values[cols - 1], level);
          }
          applyEdgeTapers(values, s);
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'centerChron': {
          // Newest sample lives at the center, older samples flow outward
          // toward both edges symmetrically.
          const maxDist = Math.floor((cols - 1) / 2) + 1;
          st.values = resizeColumns(st.values, maxDist);
          if (!frozen) {
            runSteps(st, dt, s.scrollMs, level, () => {
              st.values.unshift(st.maxSinceStep);
              st.values.pop();
            });
          }
          const centerCol = (cols - 1) / 2;
          const values = new Array<number>(cols);
          for (let c = 0; c < cols; c++) {
            const d = Math.round(Math.abs(c - centerCol));
            values[c] = st.values[Math.min(d, st.values.length - 1)] ?? 0;
          }
          if (!frozen) {
            const mid = Math.round(centerCol);
            values[mid] = Math.max(values[mid], level);
          }
          applyEdgeTapers(values, s);
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'seismograph': {
          // A playhead sweeps left to right stamping levels in place. The wrap
          // is either a hard gap (tapers off) or a fade that uses the left/
          // right taper widths so old data shrinks away and new data grows in.
          st.values = resizeColumns(st.values, cols);
          st.playhead = st.playhead % cols;
          if (!frozen) {
            const gap = Math.max(2, Math.round(cols * 0.04));
            const hardGap = !s.taperLeft && !s.taperRight;
            runSteps(st, dt, s.scrollMs, level, () => {
              st.values[st.playhead] = st.maxSinceStep;
              st.playhead = (st.playhead + 1) % cols;
              if (hardGap) {
                for (let i = 0; i < gap; i++) st.values[(st.playhead + i) % cols] = 0;
              }
            });
            st.values[st.playhead] = Math.max(st.maxSinceStep, level);
          }
          const values = st.values.slice();
          applyEdgeTapers(values, s);
          applyPlayheadTapers(values, st.playhead, s);
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'spectrum': {
          // Columns are log-spaced frequency bands, low on the left.
          const values = frozen ? new Array(cols).fill(0) : analyzer.getSpectrum(cols, now);
          applyEdgeTapers(values, s);
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'centerPulse': {
          // Energy propagates outward from the center column through a
          // diffusion chain, creating the ripple.
          const maxDist = Math.floor((cols - 1) / 2) + 1;
          if (st.trail.length !== maxDist) {
            const prev = st.trail;
            st.trail = new Array(maxDist)
              .fill(0)
              .map((_, i) => prev[Math.min(i, Math.max(0, prev.length - 1))] ?? 0);
          }
          const t = st.trail;
          if (!frozen) {
            const spread = 1 - Math.exp(-dt / Math.max(1, s.rippleMs));
            for (let d = t.length - 1; d >= 1; d--) {
              t[d] += (t[d - 1] * s.rippleFalloff - t[d]) * spread;
            }
            t[0] = level;
          }
          const values = new Array<number>(cols);
          const centerCol = (cols - 1) / 2;
          for (let c = 0; c < cols; c++) {
            const d = Math.round(Math.abs(c - centerCol));
            values[c] = t[Math.min(d, t.length - 1)];
          }
          applyEdgeTapers(values, s);
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'string': {
          // Driven at the center; waves travel outward and are absorbed at
          // the ends so energy cannot pile up into a solid, never-resetting block.
          if (st.stringU.length !== cols) {
            st.stringU = new Float32Array(cols);
            st.stringV = new Float32Array(cols);
          }
          const u = st.stringU;
          const v = st.stringV;
          if (!frozen && cols >= 3) {
            const speed = 1000 / Math.max(8, s.rippleMs);
            const c2 = speed * speed;
            const damping = 3 + (1 - s.rippleFalloff) * 36;
            const restore = 8 + (1 - s.rippleFalloff) * 40;
            const mid = Math.floor((cols - 1) / 2);
            const maxStep = Math.min(0.005, 0.35 / Math.max(speed, 1));
            let remaining = dtS;
            while (remaining > 0) {
              const step = Math.min(maxStep, remaining);
              remaining -= step;
              u[mid] = level;
              v[mid] = 0;
              for (let i = 1; i < cols - 1; i++) {
                if (i === mid) continue;
                const acc =
                  c2 * (u[i - 1] + u[i + 1] - 2 * u[i]) -
                  damping * v[i] -
                  restore * u[i];
                v[i] += acc * step;
                v[i] = Math.max(-4, Math.min(4, v[i]));
              }
              for (let i = 1; i < cols - 1; i++) {
                if (i === mid) continue;
                u[i] += v[i] * step;
                u[i] = Math.max(0, Math.min(1, u[i]));
                if (u[i] === 0 || u[i] === 1) v[i] *= 0.3;
              }
              u[0] = Math.max(0, u[1] * 0.45);
              u[cols - 1] = Math.max(0, u[cols - 2] * 0.45);
              v[0] = 0;
              v[cols - 1] = 0;
            }
          }
          const values = new Array<number>(cols);
          for (let c = 0; c < cols; c++) values[c] = u[c];
          applyEdgeTapers(values, s);
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'radial': {
          // Circular seismograph: a clock hand sweeps equal-sized dots.
          st.values = resizeColumns(st.values, cols);
          st.playhead = st.playhead % cols;
          if (!frozen) {
            const gap = Math.max(2, Math.round(cols * 0.04));
            const hardGap = !s.taperLeft && !s.taperRight;
            runSteps(st, dt, s.scrollMs, level, () => {
              st.values[st.playhead] = st.maxSinceStep;
              st.playhead = (st.playhead + 1) % cols;
              if (hardGap) {
                for (let i = 0; i < gap; i++) st.values[(st.playhead + i) % cols] = 0;
              }
            });
            st.values[st.playhead] = Math.max(st.maxSinceStep, level);
          }
          const values = st.values.slice();
          applyPlayheadTapers(values, st.playhead, s);
          dots = radialDots(values, s, w, h);
          break;
        }

        case 'orbit': {
          // Chronological history wrapped into a ring: newest sits at the
          // seam, older samples travel around the circle.
          st.values = resizeColumns(st.values, cols);
          if (!frozen) {
            runSteps(st, dt, s.scrollMs, level, () => {
              st.values.push(st.maxSinceStep);
              st.values.shift();
            });
          }
          const values = st.values.slice();
          if (!frozen) {
            values[cols - 1] = Math.max(values[cols - 1], level);
          }
          applyEdgeTapers(values, s);
          dots = radialDots(values, s, w, h);
          break;
        }

        case 'spark': {
          // Circular VU: live energy fills rings, but those dots strobe
          // instead of staying lit — a blink-centric field.
          const values = new Array<number>(cols);
          if (frozen) {
            values.fill(0);
          } else {
            const sparkAt = (now / Math.max(30, s.scrollMs)) % cols;
            for (let c = 0; c < cols; c++) {
              const dist = Math.abs(c - sparkAt);
              const wrap = Math.min(dist, cols - dist) / cols;
              const spark = Math.max(0, 1 - wrap * 10) * 0.28 * level;
              values[c] = Math.min(1, level + spark);
            }
          }
          dots = sparkDots(values, s, w, h, now);
          break;
        }
      }

      const pending = pendingFromRef.current;
      if (pending) {
        pendingFromRef.current = null;
        transitionRef.current = {
          style: pending.style,
          start: now,
          duration: prefersReducedMotion() ? 1 : TRANSITION_MS[pending.style],
          fromFamily: pending.family,
          toFamily: family,
          fromW: pending.w,
          fromH: pending.h,
          toW: w,
          toH: targetH,
          pairs: pairDots(pending.dots, dots),
          fromDots: pending.dots,
        };
      }

      const xf = transitionRef.current;
      let displayW = w;
      let displayH = targetH;
      if (xf) {
        const rawT = clamp01((now - xf.start) / xf.duration);
        if (rawT >= 1) {
          transitionRef.current = null;
        } else {
          const t = easeInOutCubic(rawT);
          displayW = lerp(xf.fromW, xf.toW, t);
          displayH = lerp(xf.fromH, xf.toH, t);
          if (xf.style === 'blink') {
            const placed: Dot[] = [];
            for (const d of xf.fromDots) {
              const scale = blinkOutScale(rawT, hash01(d.u, d.v));
              if (scale <= 0.02) continue;
              const p = placeDot(d, xf.fromFamily, xf.fromW, xf.fromH, displayW, displayH);
              placed.push({ ...p, r: p.r * scale, active: p.active && scale > 0.2 });
            }
            for (const d of dots) {
              const scale = blinkInScale(rawT, hash01(d.u, d.v));
              if (scale <= 0.02) continue;
              const p = placeDot(d, xf.toFamily, xf.toW, xf.toH, displayW, displayH);
              placed.push({ ...p, r: p.r * scale, active: p.active && scale > 0.2 });
            }
            dots = placed;
          } else if (xf.pairs.length && dots.length) {
            const placed: Dot[] = [];
            for (const pair of xf.pairs) {
              const to = dots[Math.min(pair.toIndex, dots.length - 1)] ?? pair.from;
              const fromPlaced = placeDot(pair.from, xf.fromFamily, xf.fromW, xf.fromH, displayW, displayH);
              const toPlaced = placeDot(to, xf.toFamily, xf.toW, xf.toH, displayW, displayH);
              placed.push(
                interpolatePair(fromPlaced, toPlaced, t, xf.style, xf.fromFamily, displayW, displayH),
              );
            }
            dots = placed;
          }
        }
      }

      lastDotsRef.current = dots;
      displaySizeRef.current = { w: displayW, h: displayH };
      lastFrameRef.current = { w: displayW, h: displayH, family, mode: s.mode };

      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.round(displayW * dpr);
      const pxH = Math.round(displayH * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      box.style.aspectRatio = `${displayW} / ${displayH}`;

      // --- Draw ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, displayW, displayH);
      const drawPass = (color: string, active: boolean) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const d of dots) {
          if (d.active !== active) continue;
          ctx.moveTo(d.x + d.r, d.y);
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        }
        ctx.fill();
      };
      drawPass(s.inactiveColor, false);
      drawPass(s.activeColor, true);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [analyzer]);

  useEffect(() => {
    if (!exportRef) return;
    exportRef.current = {
      exportPNG: () =>
        new Promise((resolve, reject) => {
          const canvas = canvasRef.current;
          if (!canvas) {
            reject(new Error('Canvas unavailable'));
            return;
          }
          const size = displaySizeRef.current;
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('PNG encoding failed'));
              return;
            }
            downloadBlob(blob, `dot-grid-${Math.round(size.w)}x${Math.round(size.h)}.png`);
            resolve();
          }, 'image/png');
        }),
      exportSVG: () => {
        const s = settingsRef.current;
        const size = displaySizeRef.current;
        const svg = buildSVG(lastDotsRef.current, { ...s, width: size.w, height: size.h });
        downloadBlob(
          new Blob([svg], { type: 'image/svg+xml' }),
          `dot-grid-${Math.round(size.w)}x${Math.round(size.h)}.svg`,
        );
      },
      copySVG: async () => {
        const s = settingsRef.current;
        const size = displaySizeRef.current;
        const svg = buildSVG(lastDotsRef.current, { ...s, width: size.w, height: size.h });
        await navigator.clipboard.writeText(svg);
      },
    };
    return () => {
      exportRef.current = null;
    };
  }, [exportRef]);

  // The canvas buffer matches the displayed size. App clamps width
  // to the card slot, so CSS can fill the slot without letterboxing.
  // Aspect ratio is driven from the rAF loop so layout-family switches
  // can ease height while dots travel to their new positions.
  return (
    <div
      ref={boxRef}
      style={{
        width: '100%',
        height: 'auto',
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Speech energy dot grid"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}

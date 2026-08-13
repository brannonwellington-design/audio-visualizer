import { useEffect, useRef, type RefObject } from 'react';
import type { SpeechAnalyzer } from '../audio/speechAnalyzer';

export type VisualizerMode =
  | 'chronological'
  | 'centerChron'
  | 'seismograph'
  | 'spectrum'
  | 'centerPulse'
  | 'string'
  | 'radial';
export type DotStyle = 'substates' | 'binary';

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
      dots.push({ x, y: (r + 0.5) * g.cellH, r: rad, active });
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
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const stateRef = useRef<EngineState>(freshState(settings.mode));
  /** The dots drawn in the most recent frame; source of truth for exports */
  const lastDotsRef = useRef<Dot[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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

      const dpr = window.devicePixelRatio || 1;
      const w = s.width;
      const h = s.height;
      const pxW = Math.round(w * dpr);
      const pxH = Math.round(h * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }

      let st = stateRef.current;
      if (st.mode !== s.mode) {
        st = stateRef.current = freshState(s.mode);
      }

      const level = frozen ? 0 : analyzer.getLevel(now);
      const cols = Math.max(1, s.columns);
      const dtS = dt / 1000;

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
      }

      lastDotsRef.current = dots;

      // --- Draw ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
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
          const s = settingsRef.current;
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('PNG encoding failed'));
              return;
            }
            downloadBlob(blob, `dot-grid-${s.width}x${s.height}.png`);
            resolve();
          }, 'image/png');
        }),
      exportSVG: () => {
        const s = settingsRef.current;
        const svg = buildSVG(lastDotsRef.current, s);
        downloadBlob(
          new Blob([svg], { type: 'image/svg+xml' }),
          `dot-grid-${s.width}x${s.height}.svg`,
        );
      },
      copySVG: async () => {
        const svg = buildSVG(lastDotsRef.current, settingsRef.current);
        await navigator.clipboard.writeText(svg);
      },
    };
    return () => {
      exportRef.current = null;
    };
  }, [exportRef]);

  // The canvas buffer matches settings.width/height. App clamps that width
  // to the card slot, so CSS can fill the slot without letterboxing.
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Speech energy dot grid"
      style={{
        width: '100%',
        height: 'auto',
        aspectRatio: `${settings.width} / ${settings.height}`,
        display: 'block',
      }}
    />
  );
}

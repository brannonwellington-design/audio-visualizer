import { useEffect, useRef, type RefObject } from 'react';
import type { SpeechAnalyzer } from '../audio/speechAnalyzer';

export type VisualizerMode =
  | 'chronological'
  | 'centerOut'
  | 'seismograph'
  | 'peakHold'
  | 'spectrum'
  | 'static'
  | 'string'
  | 'heatmap'
  | 'typewriter'
  | 'hourglass'
  | 'constellation'
  | 'radial'
  | 'swarm';
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
  /** Chronological mode: taper columns down to the center line as they near the left (exit) edge */
  taperLeft: boolean;
  /** Chronological mode: portion of the grid width used for the left taper (0..0.5) */
  taperLeftWidth: number;
  /** Chronological mode: taper incoming columns near the right (entry) edge */
  taperRight: boolean;
  /** Chronological mode: portion of the grid width used for the right taper (0..0.5) */
  taperRightWidth: number;
  /** Static mode: ms for energy to propagate one column outward. String mode: wave speed. */
  rippleMs: number;
  /** Static mode: energy retained per column as it travels outward (0..1). String mode: damping. */
  rippleFalloff: number;
}

export interface VisualizerExport {
  /** Download the current frame as a PNG (rendered at devicePixelRatio) */
  exportPNG: () => void;
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

/** Peak-hold ghost tick decay time constant (ms) */
const PEAK_DECAY_MS = 1500;
/** Heatmap: heat gained per ms while a cell is under the sweep and active */
const HEAT_GAIN_PER_MS = 0.008;
/** Heatmap: cooling time constant (ms) */
const HEAT_COOL_MS = 15000;
/** Constellation: star fade time constant (ms) */
const STAR_FADE_MS = 45000;
/** Constellation: stars spawned per ms at full level */
const STAR_RATE_PER_MS = 0.006;
/** Hourglass: grains emitted per ms at full level */
const GRAIN_RATE_PER_MS = 0.02;
/** Hourglass: fall speed in rows per second */
const GRAIN_FALL_ROWS_PER_S = 26;
/** Swarm: spring stiffness (1/s^2) and damping (1/s) toward the rest position */
const SWARM_SPRING = 36;
const SWARM_DAMPING = 9;

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
 * Shared by every column-based mode. `peaks` optionally lights a lingering
 * ghost tick at each column's held peak row.
 */
function columnDots(
  values: number[],
  s: VisualizerSettings,
  w: number,
  h: number,
  peaks?: number[],
): Dot[] {
  const g = geometry(s, w, h);
  const dots: Dot[] = [];
  for (let c = 0; c < g.cols; c++) {
    const v = values[c] ?? 0;
    const x = (c + 0.5) * g.cellW;
    const peakDist = peaks && peaks[c] > 0.03 ? Math.round(peaks[c] * g.maxRowDist) : -1;
    for (let r = 0; r < g.rows; r++) {
      let dist = Math.abs(r - g.centerRow);
      if (g.rows % 2 === 0) dist = Math.max(0, dist - 0.5);
      const threshold = dist / g.maxRowDist;
      let active = v >= threshold && (threshold === 0 || v > 0);
      let rad = g.radius;
      if (active && s.dotStyle === 'substates' && threshold > 0) {
        // Frontier dot eases in as the level crosses its threshold
        const partial = Math.min(1, (v - threshold) / g.rowStep);
        rad = g.radius * (0.35 + 0.65 * partial);
      }
      if (peakDist >= 1 && Math.abs(dist - peakDist) < 0.3) {
        active = true;
        rad = g.radius;
      }
      dots.push({ x, y: (r + 0.5) * g.cellH, r: rad, active });
    }
  }
  return dots;
}

/** One intensity per cell (indexed row * cols + col), for the grid-state modes. */
function cellDots(cells: Float32Array, s: VisualizerSettings, w: number, h: number): Dot[] {
  const g = geometry(s, w, h);
  const dots: Dot[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const v = cells[r * g.cols + c];
      const active = v > 0.03;
      let rad = g.radius;
      if (active && s.dotStyle === 'substates') {
        rad = g.radius * (0.35 + 0.65 * Math.min(1, v));
      }
      dots.push({ x: (c + 0.5) * g.cellW, y: (r + 0.5) * g.cellH, r: rad, active });
    }
  }
  return dots;
}

/** Column values wound around a circle: spokes are columns, rings are rows. */
function radialDots(values: number[], s: VisualizerSettings, w: number, h: number): Dot[] {
  const g = geometry(s, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) / 2 - 2;
  const inner = outer * 0.3;
  const ringStep = (outer - inner) / g.rows;
  const dots: Dot[] = [];
  for (let c = 0; c < g.cols; c++) {
    const v = values[c] ?? 0;
    const angle = (c / g.cols) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let r = 0; r < g.rows; r++) {
      let dist = Math.abs(r - g.centerRow);
      if (g.rows % 2 === 0) dist = Math.max(0, dist - 0.5);
      const threshold = dist / g.maxRowDist;
      const active = v >= threshold && (threshold === 0 || v > 0);
      const ringR = inner + (r + 0.5) * ringStep;
      const arcSpacing = (Math.PI * 2 * ringR) / g.cols;
      let rad = (Math.min(ringStep, arcSpacing) / 2) * s.dotScale;
      if (active && s.dotStyle === 'substates' && threshold > 0) {
        const partial = Math.min(1, (v - threshold) / g.rowStep);
        rad *= 0.35 + 0.65 * partial;
      }
      dots.push({ x: cx + cos * ringR, y: cy + sin * ringR, r: rad, active });
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
  /** Peak-hold ghost levels per column */
  peaks: number[];
  /** Static mode diffusion chain */
  trail: number[];
  /** Sweep/typewriter write position */
  playhead: number;
  /** Per-cell intensities for grid modes (row * cols + col) */
  cells: Float32Array;
  cellCount: number;
  /** String displacement and velocity per column */
  stringU: Float32Array;
  stringV: Float32Array;
  /** Hourglass pile height per column and in-flight grains */
  heights: Int16Array;
  grains: { c: number; r: number }[];
  /** Fractional spawn budget for hourglass / constellation */
  budget: number;
  /** Swarm agent state: x, y, vx, vy per agent */
  agents: Float32Array;
}

function freshState(mode: VisualizerMode): EngineState {
  return {
    mode,
    stepAccum: 0,
    maxSinceStep: 0,
    values: [],
    peaks: [],
    trail: [],
    playhead: 0,
    cells: new Float32Array(0),
    cellCount: -1,
    stringU: new Float32Array(0),
    stringV: new Float32Array(0),
    heights: new Int16Array(0),
    grains: [],
    budget: 0,
    agents: new Float32Array(0),
  };
}

/** Resize a column array preserving the most recent (rightmost) entries. */
function resizeColumns(arr: number[], cols: number): number[] {
  if (arr.length === cols) return arr;
  const keep = arr.slice(-cols);
  return new Array(cols - keep.length).fill(0).concat(keep);
}

function ensureCells(st: EngineState, count: number) {
  if (st.cellCount !== count) {
    st.cells = new Float32Array(count);
    st.cellCount = count;
    st.playhead = 0;
  }
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
      const g = geometry(s, w, h);
      const cols = g.cols;
      const rows = g.rows;
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
          // Ease columns down to the center line near the edges: the exit
          // (left) so loud moments shrink away instead of popping off, and
          // the entry (right) so new audio grows in instead of appearing.
          const applyEdgeTaper = (
            fromLeft: boolean,
            enabled: boolean | undefined,
            width: number | undefined,
          ) => {
            if (!enabled) return;
            const fraction = Number.isFinite(width)
              ? Math.min(0.5, Math.max(0, width as number))
              : 0.05;
            const taperCols = Math.max(1, Math.round(cols * fraction));
            for (let c = 0; c < Math.min(taperCols, cols); c++) {
              const idx = fromLeft ? c : cols - 1 - c;
              values[idx] *= smoothstep(c / taperCols);
            }
          };
          applyEdgeTaper(true, s.taperLeft, s.taperLeftWidth);
          applyEdgeTaper(false, s.taperRight, s.taperRightWidth);
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'centerOut': {
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
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'seismograph': {
          // A playhead sweeps left to right stamping levels in place, with a
          // small cleared gap ahead of it so the wrap point reads clearly.
          st.values = resizeColumns(st.values, cols);
          st.playhead = st.playhead % cols;
          if (!frozen) {
            const gap = Math.max(2, Math.round(cols * 0.04));
            runSteps(st, dt, s.scrollMs, level, () => {
              st.values[st.playhead] = st.maxSinceStep;
              st.playhead = (st.playhead + 1) % cols;
              for (let i = 0; i < gap; i++) st.values[(st.playhead + i) % cols] = 0;
            });
            st.values[st.playhead] = Math.max(st.maxSinceStep, level);
          }
          dots = columnDots(st.values, s, w, h);
          break;
        }

        case 'peakHold': {
          // Chronological scroll plus a slowly-decaying held peak per column,
          // drawn as a lingering ghost tick above the wave.
          st.values = resizeColumns(st.values, cols);
          st.peaks = resizeColumns(st.peaks, cols);
          if (!frozen) {
            runSteps(st, dt, s.scrollMs, level, () => {
              st.values.push(st.maxSinceStep);
              st.values.shift();
              st.peaks.push(st.maxSinceStep);
              st.peaks.shift();
            });
          }
          const values = st.values.slice();
          if (!frozen) {
            values[cols - 1] = Math.max(values[cols - 1], level);
            const decay = Math.exp(-dt / PEAK_DECAY_MS);
            for (let c = 0; c < cols; c++) {
              st.peaks[c] = Math.max(st.peaks[c] * decay, values[c]);
            }
          }
          dots = columnDots(values, s, w, h, st.peaks);
          break;
        }

        case 'spectrum': {
          // Columns are log-spaced frequency bands, low on the left.
          const values = frozen ? new Array(cols).fill(0) : analyzer.getSpectrum(cols, now);
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'static': {
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
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'string': {
          // The center line is a plucked string: the voice drives the middle
          // and waves propagate outward with momentum and reflections.
          if (st.stringU.length !== cols) {
            st.stringU = new Float32Array(cols);
            st.stringV = new Float32Array(cols);
          }
          const u = st.stringU;
          const v = st.stringV;
          if (!frozen && cols >= 3) {
            // rippleMs = ms for a wave to cross one column
            const c2 = Math.pow(1000 / Math.max(5, s.rippleMs), 2);
            const damping = 0.5 + (1 - s.rippleFalloff) * 30;
            const mid = Math.floor((cols - 1) / 2);
            // Substep for stability (explicit integration of a stiff system)
            const maxStep = Math.min(0.008, 0.5 / Math.sqrt(c2));
            let remaining = dtS;
            while (remaining > 0) {
              const step = Math.min(maxStep, remaining);
              remaining -= step;
              u[mid] = level;
              v[mid] = 0;
              for (let i = 1; i < cols - 1; i++) {
                if (i === mid) continue;
                const acc = c2 * (u[i - 1] + u[i + 1] - 2 * u[i]) - damping * v[i];
                v[i] += acc * step;
              }
              for (let i = 1; i < cols - 1; i++) {
                if (i === mid) continue;
                u[i] += v[i] * step;
              }
            }
          }
          const values = new Array<number>(cols);
          for (let c = 0; c < cols; c++) values[c] = Math.min(1, Math.abs(u[c]));
          dots = columnDots(values, s, w, h);
          break;
        }

        case 'heatmap': {
          // A sweeping playhead deposits heat wherever the voice would light
          // dots; heat cools slowly, leaving a long-exposure of the take.
          ensureCells(st, cols * rows);
          if (!frozen) {
            st.playhead = st.playhead % cols;
            runSteps(st, dt, s.scrollMs, level, () => {
              st.playhead = (st.playhead + 1) % cols;
            });
            if (level > 0.02) {
              const c = st.playhead;
              for (let r = 0; r < rows; r++) {
                let dist = Math.abs(r - g.centerRow);
                if (rows % 2 === 0) dist = Math.max(0, dist - 0.5);
                if (dist / g.maxRowDist <= level) {
                  const idx = r * cols + c;
                  st.cells[idx] = Math.min(1, st.cells[idx] + dt * HEAT_GAIN_PER_MS);
                }
              }
            }
            const cool = Math.exp(-dt / HEAT_COOL_MS);
            for (let i = 0; i < st.cells.length; i++) st.cells[i] *= cool;
          }
          dots = cellDots(st.cells, s, w, h);
          break;
        }

        case 'typewriter': {
          // Cells fill left-to-right, top-to-bottom at a steady pace, each
          // stamped with the loudness at its moment. The page clears on wrap.
          ensureCells(st, cols * rows);
          if (!frozen) {
            runSteps(st, dt, s.scrollMs, level, () => {
              if (st.playhead >= st.cells.length) {
                st.playhead = 0;
                st.cells.fill(0);
              }
              st.cells[st.playhead] = st.maxSinceStep;
              st.playhead++;
            });
            // Live preview at the cursor cell
            if (st.playhead < st.cells.length) {
              st.cells[st.playhead] = Math.max(st.maxSinceStep, level);
            }
          }
          dots = cellDots(st.cells, s, w, h);
          break;
        }

        case 'hourglass': {
          // Loudness emits grains that fall and pile up from the bottom.
          if (st.heights.length !== cols) {
            st.heights = new Int16Array(cols);
            st.grains = [];
          }
          if (!frozen) {
            st.budget += dt * GRAIN_RATE_PER_MS * level;
            const centerCol = (cols - 1) / 2;
            while (st.budget >= 1) {
              st.budget -= 1;
              // Triangular distribution around the center; louder = wider
              const spread = cols * 0.16 * (0.35 + 0.65 * level);
              const jitter = (Math.random() + Math.random() + Math.random() - 1.5) * spread;
              const c = Math.max(0, Math.min(cols - 1, Math.round(centerCol + jitter)));
              if (st.heights[c] < rows) st.grains.push({ c, r: -0.5 });
            }
            const landed: { c: number; r: number }[] = [];
            for (const grain of st.grains) {
              grain.r += dtS * GRAIN_FALL_ROWS_PER_S;
              if (grain.r >= rows - 1 - st.heights[grain.c]) landed.push(grain);
            }
            for (const grain of landed) {
              st.grains.splice(st.grains.indexOf(grain), 1);
              // Roll down steep slopes like sand
              let c = grain.c;
              for (let i = 0; i < 8; i++) {
                const left = c > 0 && st.heights[c - 1] <= st.heights[c] - 2;
                const right = c < cols - 1 && st.heights[c + 1] <= st.heights[c] - 2;
                if (left && right) c += Math.random() < 0.5 ? -1 : 1;
                else if (left) c--;
                else if (right) c++;
                else break;
              }
              if (st.heights[c] < rows) st.heights[c]++;
            }
          }
          ensureCells(st, cols * rows);
          st.cells.fill(0);
          for (let c = 0; c < cols; c++) {
            for (let k = 0; k < st.heights[c]; k++) {
              st.cells[(rows - 1 - k) * cols + c] = 1;
            }
          }
          dots = cellDots(st.cells, s, w, h);
          // In-flight grains render between cells, so add them directly
          for (const grain of st.grains) {
            if (grain.r < -0.4) continue;
            dots.push({
              x: (grain.c + 0.5) * g.cellW,
              y: (Math.min(grain.r, rows - 1) + 0.5) * g.cellH,
              r: g.radius,
              active: true,
            });
          }
          break;
        }

        case 'constellation': {
          // Loud moments leave persistent stars that fade over minutes.
          ensureCells(st, cols * rows);
          if (!frozen) {
            st.budget += dt * STAR_RATE_PER_MS * level * level;
            while (st.budget >= 1) {
              st.budget -= 1;
              const idx = Math.floor(Math.random() * st.cells.length);
              st.cells[idx] = Math.max(st.cells[idx], 0.4 + 0.6 * level);
            }
            const fade = Math.exp(-dt / STAR_FADE_MS);
            for (let i = 0; i < st.cells.length; i++) st.cells[i] *= fade;
          }
          dots = cellDots(st.cells, s, w, h);
          break;
        }

        case 'radial': {
          // Seismograph wound around a circle: a clock hand sweeps the take.
          st.values = resizeColumns(st.values, cols);
          st.playhead = st.playhead % cols;
          if (!frozen) {
            const gap = Math.max(2, Math.round(cols * 0.04));
            runSteps(st, dt, s.scrollMs, level, () => {
              st.values[st.playhead] = st.maxSinceStep;
              st.playhead = (st.playhead + 1) % cols;
              for (let i = 0; i < gap; i++) st.values[(st.playhead + i) % cols] = 0;
            });
            st.values[st.playhead] = Math.max(st.maxSinceStep, level);
          }
          dots = radialDots(st.values, s, w, h);
          break;
        }

        case 'swarm': {
          // Every dot is an agent spring-bound to its home column on the
          // center line; bursts scatter the swarm, silence reforms it.
          const n = cols * rows;
          if (st.agents.length !== n * 4) {
            st.agents = new Float32Array(n * 4);
            for (let i = 0; i < n; i++) {
              const c = i % cols;
              st.agents[i * 4] = (c + 0.5) * g.cellW;
              st.agents[i * 4 + 1] = h / 2;
            }
          }
          const a = st.agents;
          if (!frozen) {
            const kick = level * level * h * 40;
            for (let i = 0; i < n; i++) {
              const c = i % cols;
              const homeX = (c + 0.5) * g.cellW;
              const x = a[i * 4];
              const y = a[i * 4 + 1];
              let vx = a[i * 4 + 2];
              let vy = a[i * 4 + 3];
              let ax = SWARM_SPRING * (homeX - x) - SWARM_DAMPING * vx;
              let ay = SWARM_SPRING * (h / 2 - y) - SWARM_DAMPING * vy;
              if (kick > 0) {
                const angle = Math.random() * Math.PI * 2;
                ax += Math.cos(angle) * kick * 0.35;
                ay += Math.sin(angle) * kick;
              }
              vx += ax * dtS;
              vy += ay * dtS;
              a[i * 4] = x + vx * dtS;
              a[i * 4 + 1] = y + vy * dtS;
              a[i * 4 + 2] = vx;
              a[i * 4 + 3] = vy;
            }
          }
          dots = [];
          for (let i = 0; i < n; i++) {
            const c = i % cols;
            const homeX = (c + 0.5) * g.cellW;
            const x = a[i * 4];
            const y = a[i * 4 + 1];
            const settled = Math.abs(y - h / 2) < g.cellH * 0.5 && Math.abs(x - homeX) < g.cellW * 0.5;
            dots.push({ x, y, r: g.radius, active: settled });
          }
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
      exportPNG: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const s = settingsRef.current;
        canvas.toBlob((blob) => {
          if (blob) downloadBlob(blob, `dot-grid-${s.width}x${s.height}.png`);
        }, 'image/png');
      },
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

  // The canvas keeps rendering (and exporting) at the configured pixel
  // size, but its on-screen size shrinks with the viewport when the
  // container is narrower than the configured width.
  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        maxWidth: settings.width,
        height: 'auto',
        aspectRatio: `${settings.width} / ${settings.height}`,
        display: 'block',
      }}
    />
  );
}

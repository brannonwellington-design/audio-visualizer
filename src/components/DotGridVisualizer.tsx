import { useEffect, useRef, type RefObject } from 'react';
import type { SpeechAnalyzer } from '../audio/speechAnalyzer';

export type VisualizerMode = 'chronological' | 'static';
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
  /** Chronological mode: how many ms each column represents */
  scrollMs: number;
  /** Chronological mode: taper columns down to the center line as they near the exit edge */
  edgeTaper: boolean;
  /** Chronological mode: portion of the grid width used for the taper (0..0.5) */
  edgeTaperWidth: number;
  /** Static mode: ms for energy to propagate one column outward */
  rippleMs: number;
  /** Static mode: energy retained per column as it travels outward (0..1) */
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

/**
 * Computes every dot's position, radius, and active state for one frame,
 * in the coordinate space of the given width/height. Shared by the canvas
 * renderer and the SVG exporter so exports match the screen exactly.
 */
function computeDots(values: number[], s: VisualizerSettings, w: number, h: number): Dot[] {
  const cols = Math.max(1, s.columns);
  const rows = Math.max(1, s.rows);
  const cellW = w / cols;
  const cellH = h / rows;
  const radius = (Math.min(cellW, cellH) / 2) * s.dotScale;
  const centerRow = (rows - 1) / 2;
  // For even row counts, both middle rows act as the always-on center line.
  const maxRowDist = Math.max(1, centerRow - (rows % 2 === 0 ? 0.5 : 0));
  const rowStep = 1 / maxRowDist;

  const dots: Dot[] = [];
  for (let c = 0; c < cols; c++) {
    const v = values[c] ?? 0;
    const x = (c + 0.5) * cellW;
    for (let r = 0; r < rows; r++) {
      let dist = Math.abs(r - centerRow);
      if (rows % 2 === 0) dist = Math.max(0, dist - 0.5);
      const threshold = dist / maxRowDist;
      const active = v >= threshold && (threshold === 0 || v > 0);
      let rad = radius;
      if (active && s.dotStyle === 'substates' && threshold > 0) {
        // Frontier dot eases in as the level crosses its threshold
        const partial = Math.min(1, (v - threshold) / rowStep);
        rad = radius * (0.35 + 0.65 * partial);
      }
      dots.push({ x, y: (r + 0.5) * cellH, r: rad, active });
    }
  }
  return dots;
}

function buildSVG(values: number[], s: VisualizerSettings): string {
  const dots = computeDots(values, s, s.width, s.height);
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

  // Per-column values for chronological history and static ripple trail.
  const historyRef = useRef<number[]>([]);
  const trailRef = useRef<number[]>([]);
  const shiftAccumRef = useRef(0);
  const maxSinceShiftRef = useRef(0);
  /** The values drawn in the most recent frame; source of truth for exports */
  const lastValuesRef = useRef<number[]>([]);

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
      const dt = Math.min(100, now - lastTime);
      lastTime = now;

      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.round(s.width * dpr);
      const pxH = Math.round(s.height * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }

      const level = frozen ? 0 : analyzer.getLevel(now);
      const cols = Math.max(1, s.columns);

      // --- Update per-column values for the current mode ---
      let values: number[];
      if (s.mode === 'chronological') {
        const history = historyRef.current;
        if (history.length !== cols) {
          // Resize while preserving the most recent entries
          const keep = history.slice(-cols);
          historyRef.current = new Array(cols - keep.length).fill(0).concat(keep);
        }
        if (!frozen) {
          // Track the loudest moment within each column's time slice so
          // short consonant bursts never fall between samples.
          maxSinceShiftRef.current = Math.max(maxSinceShiftRef.current, level);
          shiftAccumRef.current += dt;
          while (shiftAccumRef.current >= s.scrollMs) {
            shiftAccumRef.current -= s.scrollMs;
            historyRef.current.push(maxSinceShiftRef.current);
            historyRef.current.shift();
            maxSinceShiftRef.current = level;
          }
        }
        values = historyRef.current.slice();
        if (!frozen) {
          // The rightmost (incoming) column always shows the live level so
          // the visual never feels a sample-interval behind the voice.
          values[cols - 1] = Math.max(values[cols - 1], level);
        }
        if (s.edgeTaper) {
          // Ease columns back down to the center line as they approach the
          // exit edge, so loud moments shrink away instead of popping off.
          const taperCols = Math.max(1, Math.round(cols * s.edgeTaperWidth));
          for (let c = 0; c < Math.min(taperCols, cols); c++) {
            const p = c / taperCols;
            values[c] *= p * p * (3 - 2 * p); // smoothstep
          }
        }
      } else {
        // Static mode: energy propagates outward from the center column
        // through a diffusion chain, creating the ripple.
        const maxDist = Math.floor((cols - 1) / 2) + 1;
        if (trailRef.current.length !== maxDist) {
          const prev = trailRef.current;
          trailRef.current = new Array(maxDist)
            .fill(0)
            .map((_, i) => prev[Math.min(i, Math.max(0, prev.length - 1))] ?? 0);
        }
        const t = trailRef.current;
        if (!frozen) {
          const spread = 1 - Math.exp(-dt / Math.max(1, s.rippleMs));
          for (let d = t.length - 1; d >= 1; d--) {
            t[d] += (t[d - 1] * s.rippleFalloff - t[d]) * spread;
          }
          t[0] = level;
        }
        values = new Array(cols);
        const centerCol = (cols - 1) / 2;
        for (let c = 0; c < cols; c++) {
          const d = Math.round(Math.abs(c - centerCol));
          values[c] = t[Math.min(d, t.length - 1)];
        }
      }
      lastValuesRef.current = values;

      // --- Draw ---
      ctx.clearRect(0, 0, pxW, pxH);
      const dots = computeDots(values, s, pxW, pxH);
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
      drawPass(settingsRef.current.inactiveColor, false);
      drawPass(settingsRef.current.activeColor, true);
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
        const svg = buildSVG(lastValuesRef.current, s);
        downloadBlob(
          new Blob([svg], { type: 'image/svg+xml' }),
          `dot-grid-${s.width}x${s.height}.svg`,
        );
      },
      copySVG: async () => {
        const svg = buildSVG(lastValuesRef.current, settingsRef.current);
        await navigator.clipboard.writeText(svg);
      },
    };
    return () => {
      exportRef.current = null;
    };
  }, [exportRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: settings.width, height: settings.height, display: 'block' }}
    />
  );
}

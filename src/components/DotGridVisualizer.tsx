import { useEffect, useRef } from 'react';
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

interface Props {
  analyzer: SpeechAnalyzer;
  settings: VisualizerSettings;
}

/**
 * Renders the dot grid on a canvas driven by its own rAF loop.
 * Settings are read through a ref each frame so every control
 * takes effect live without restarting the loop.
 */
export function DotGridVisualizer({ analyzer, settings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Per-column values for chronological history and static ripple trail.
  const historyRef = useRef<number[]>([]);
  const trailRef = useRef<number[]>([]);
  const shiftAccumRef = useRef(0);
  const maxSinceShiftRef = useRef(0);

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
      const dt = Math.min(100, now - lastTime);
      lastTime = now;

      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.round(s.width * dpr);
      const pxH = Math.round(s.height * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }

      const level = analyzer.getLevel(now);
      const cols = Math.max(1, s.columns);
      const rows = Math.max(1, s.rows);

      // --- Update per-column values for the current mode ---
      let values: number[];
      if (s.mode === 'chronological') {
        const history = historyRef.current;
        if (history.length !== cols) {
          // Resize while preserving the most recent entries
          const keep = history.slice(-cols);
          historyRef.current = new Array(cols - keep.length).fill(0).concat(keep);
        }
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
        values = historyRef.current.slice();
        // The rightmost (incoming) column always shows the live level so
        // the visual never feels a sample-interval behind the voice.
        values[cols - 1] = Math.max(values[cols - 1], level);
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
        const trail = trailRef.current;
        if (trail.length !== maxDist) {
          trailRef.current = new Array(maxDist).fill(0);
        }
        const t = trailRef.current;
        const spread = 1 - Math.exp(-dt / Math.max(1, s.rippleMs));
        for (let d = t.length - 1; d >= 1; d--) {
          t[d] += (t[d - 1] * s.rippleFalloff - t[d]) * spread;
        }
        t[0] = level;
        values = new Array(cols);
        const centerCol = (cols - 1) / 2;
        for (let c = 0; c < cols; c++) {
          const d = Math.round(Math.abs(c - centerCol));
          values[c] = t[Math.min(d, t.length - 1)];
        }
      }

      // --- Draw ---
      ctx.clearRect(0, 0, pxW, pxH);
      const cellW = pxW / cols;
      const cellH = pxH / rows;
      const radius = (Math.min(cellW, cellH) / 2) * s.dotScale;
      const centerRow = (rows - 1) / 2;
      // For even row counts, both middle rows act as the always-on center line.
      const maxRowDist = Math.max(1, centerRow - (rows % 2 === 0 ? 0.5 : 0));
      const rowStep = 1 / maxRowDist;

      const drawPass = (color: string, active: boolean) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let c = 0; c < cols; c++) {
          const v = values[c];
          const x = (c + 0.5) * cellW;
          for (let r = 0; r < rows; r++) {
            let dist = Math.abs(r - centerRow);
            if (rows % 2 === 0) dist = Math.max(0, dist - 0.5);
            const threshold = dist / maxRowDist;
            const isActive = v >= threshold && (threshold === 0 || v > 0);
            if (isActive !== active) continue;
            const y = (r + 0.5) * cellH;
            let rad = radius;
            if (active && s.dotStyle === 'substates' && threshold > 0) {
              // Frontier dot eases in as the level crosses its threshold
              const partial = Math.min(1, (v - threshold) / rowStep);
              rad = radius * (0.35 + 0.65 * partial);
            }
            ctx.moveTo(x + rad, y);
            ctx.arc(x, y, rad, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      };

      drawPass(s.inactiveColor, false);
      drawPass(s.activeColor, true);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [analyzer]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: settings.width, height: settings.height, display: 'block' }}
    />
  );
}

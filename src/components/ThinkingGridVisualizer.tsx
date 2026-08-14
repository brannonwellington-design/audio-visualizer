import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { VisualizerExport } from './DotGridVisualizer';
import { colorForActivity, paletteColors } from '../thinking/color';
import { packAgents, type PackedAgent } from '../thinking/packing';
import { agentAnswer, mixedActivity } from '../thinking/patterns';
import type { ThinkingRun, ThinkingSettings } from '../thinking/types';

interface Props {
  settings: ThinkingSettings;
  run: ThinkingRun;
  runStartedAt: number;
  seed: number;
  exportRef?: RefObject<VisualizerExport | null>;
}

interface Drawn {
  x: number;
  y: number;
  r: number;
  color: string;
  alpha: number;
  u: number;
  v: number;
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hash01(u: number, v: number) {
  const x = Math.sin(u * 127.1 + v * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function blinkOutScale(t: number, delay: number) {
  const local = (t - delay * 0.24) / 0.36;
  if (local <= 0) return 1;
  if (local >= 1) return 0;
  return Math.sin(local * 5 * Math.PI) > 0 ? 1 : 0;
}

function blinkInScale(t: number, delay: number) {
  const local = (t - (0.5 + delay * 0.24)) / 0.36;
  if (local <= 0) return 0;
  if (local >= 1) return 1;
  const on = Math.sin(local * 4 * Math.PI) > 0;
  return on || local > 0.78 ? 1 : 0;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildSVG(dots: Drawn[], w: number, h: number): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  const circles = dots
    .map((d) => {
      const a = Math.round(d.alpha * 1000) / 1000;
      return `<circle cx="${round(d.x)}" cy="${round(d.y)}" r="${round(d.r)}" fill="${d.color}" fill-opacity="${a}"/>`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}">${circles}</svg>`
  );
}

const BLINK_MS = 960;
const SETTLE_MS = 520;

function activityFor(
  agent: PackedAgent,
  s: ThinkingSettings,
  run: ThinkingRun,
  elapsedSec: number,
  seed: number,
  settle: number,
): number {
  const answer = agentAnswer(agent.i, seed);
  const settled = s.answerStyle === 'binary' ? (answer >= 0.5 ? 1 : 0) : answer;
  if (run === 'idle') return 0.12 + hash01(agent.u, agent.v) * 0.1;
  if (run === 'done') return lerp(mixedActivity(s.pattern, agent, s.count, elapsedSec, seed), settled, settle);
  return mixedActivity(s.pattern, agent, s.count, elapsedSec * s.speed, seed);
}

export function ThinkingGridVisualizer({
  settings,
  run,
  runStartedAt,
  seed,
  exportRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const runRef = useRef(run);
  runRef.current = run;
  const startedRef = useRef(runStartedAt);
  startedRef.current = runStartedAt;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const lastDrawnRef = useRef<Drawn[]>([]);
  const displaySizeRef = useRef({ w: settings.width, h: settings.height });
  const packKeyRef = useRef(`${settings.packing}:${settings.count}`);
  const lastAgentsRef = useRef<PackedAgent[]>([]);
  const fromAgentsRef = useRef<PackedAgent[] | null>(null);
  const blinkStartRef = useRef(0);
  const phaseRef = useRef<ThinkingRun>(run);
  const doneAtRef = useRef(0);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    box.style.aspectRatio = `${settingsRef.current.width} / ${settingsRef.current.height}`;

    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const s = settingsRef.current;
      const w = s.width;
      const h = s.height;
      const key = `${s.packing}:${s.count}`;
      if (key !== packKeyRef.current) {
        fromAgentsRef.current = lastAgentsRef.current.slice();
        packKeyRef.current = key;
        blinkStartRef.current = now;
      }

      const agents = packAgents(s.packing, s.count, w, h, s.dotScale);
      lastAgentsRef.current = agents;
      const runState = runRef.current;
      if (runState === 'done' && phaseRef.current !== 'done') {
        doneAtRef.current = now;
      }
      phaseRef.current = runState;
      const elapsedMs = runState === 'idle' ? 0 : Math.max(0, now - startedRef.current);
      const elapsedSec = elapsedMs / 1000;
      const settle =
        runState === 'done'
          ? clamp01((now - doneAtRef.current) / (prefersReducedMotion() ? 1 : SETTLE_MS))
          : 0;

      const pal = paletteColors(s.colorA, s.colorB, s.colorC, s.colorCount);
      const paint = (agent: PackedAgent): Drawn => {
        const act = activityFor(agent, s, runState, elapsedSec, seedRef.current, settle);
        return {
          x: agent.x,
          y: agent.y,
          r: agent.r,
          color: colorForActivity(act, pal, s.gradient),
          alpha: lerp(s.opacityMin, s.opacityMax, act),
          u: agent.u,
          v: agent.v,
        };
      };

      let dots = agents.map(paint);
      const blinkDur = prefersReducedMotion() ? 1 : BLINK_MS;
      const from = fromAgentsRef.current;
      if (from) {
        const rawT = clamp01((now - blinkStartRef.current) / blinkDur);
        if (rawT >= 1) {
          fromAgentsRef.current = null;
        } else {
          const placed: Drawn[] = [];
          for (const a of from) {
            const scale = blinkOutScale(rawT, hash01(a.u, a.v));
            if (scale <= 0.02) continue;
            const d = paint(a);
            placed.push({ ...d, r: d.r * scale, alpha: d.alpha * scale });
          }
          for (const d of dots) {
            const scale = blinkInScale(rawT, hash01(d.u, d.v));
            if (scale <= 0.02) continue;
            placed.push({ ...d, r: d.r * scale, alpha: d.alpha * scale });
          }
          dots = placed;
        }
      }

      lastDrawnRef.current = dots;
      displaySizeRef.current = { w, h };

      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.round(w * dpr);
      const pxH = Math.round(h * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      box.style.aspectRatio = `${w} / ${h}`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

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
            downloadBlob(blob, `thinking-grid-${Math.round(size.w)}x${Math.round(size.h)}.png`);
            resolve();
          }, 'image/png');
        }),
      exportSVG: () => {
        const size = displaySizeRef.current;
        const svg = buildSVG(lastDrawnRef.current, size.w, size.h);
        downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `thinking-grid-${Math.round(size.w)}x${Math.round(size.h)}.svg`);
      },
      copySVG: async () => {
        const size = displaySizeRef.current;
        await navigator.clipboard.writeText(buildSVG(lastDrawnRef.current, size.w, size.h));
      },
    };
    return () => {
      exportRef.current = null;
    };
  }, [exportRef]);

  return (
    <div ref={boxRef} style={{ width: '100%', height: 'auto' }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Thinking dot grid"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

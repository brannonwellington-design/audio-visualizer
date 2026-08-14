import type { PackingKind } from './types';

export interface PackedAgent {
  i: number;
  x: number;
  y: number;
  r: number;
  u: number;
  v: number;
}

function rowSizes(n: number, rows: number): number[] {
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
}

/** Pick a row count so the field’s aspect is close to the card’s. */
function chooseRows(n: number, w: number, h: number, rowStagger = 1): number {
  const rows = Math.round(Math.sqrt((n * h * rowStagger) / Math.max(1, w)));
  return Math.min(n, Math.max(1, rows));
}

function packLattice(n: number, w: number, h: number, scale: number): PackedAgent[] {
  const rows = chooseRows(n, w, h);
  const sizes = rowSizes(n, rows);
  const maxCols = Math.max(...sizes);
  const cellW = w / maxCols;
  const cellH = h / rows;
  const r = (Math.min(cellW, cellH) / 2) * scale;
  const agents: PackedAgent[] = [];
  let i = 0;
  for (let row = 0; row < rows; row++) {
    const cols = sizes[row];
    for (let c = 0; c < cols; c++) {
      agents.push({
        i,
        x: ((c + 0.5) / cols) * w,
        y: (row + 0.5) * cellH,
        r,
        u: cols <= 1 ? 0.5 : c / (cols - 1),
        v: rows <= 1 ? 0.5 : row / (rows - 1),
      });
      i++;
    }
  }
  return agents;
}

function packHex(n: number, w: number, h: number, scale: number): PackedAgent[] {
  const rows = chooseRows(n, w, h, Math.sqrt(3) / 2);
  const sizes = rowSizes(n, rows);
  const maxCols = Math.max(...sizes);
  const cellH = h / rows;
  const r =
    (Math.min(w / (maxCols + 0.5), (cellH * 2) / Math.sqrt(3)) / 2) * scale;
  const agents: PackedAgent[] = [];
  let i = 0;
  for (let row = 0; row < rows; row++) {
    const cols = sizes[row];
    const odd = row % 2;
    for (let c = 0; c < cols; c++) {
      agents.push({
        i,
        x: ((c + 0.5 + odd * 0.5) / (cols + 0.5)) * w,
        y: (row + 0.5) * cellH,
        r,
        u: cols <= 1 ? 0.5 : c / (cols - 1),
        v: rows <= 1 ? 0.5 : row / (rows - 1),
      });
      i++;
    }
  }
  return agents;
}

/** R2 quasirandom fill — equal circles, not a simple lattice. */
function packTight(n: number, w: number, h: number, scale: number): PackedAgent[] {
  const plastic = 1.324717957244746;
  const a1 = 1 / plastic;
  const a2 = 1 / (plastic * plastic);
  const densityR = 0.42 * Math.sqrt((w * h) / Math.max(1, n));
  const r = densityR * scale;
  const pad = r;
  const rw = Math.max(1, w - 2 * pad);
  const rh = Math.max(1, h - 2 * pad);
  const agents: PackedAgent[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i * a1) % 1;
    const v = (i * a2) % 1;
    agents.push({
      i,
      x: pad + u * rw,
      y: pad + v * rh,
      r,
      u,
      v,
    });
  }
  return agents;
}

export function packAgents(
  kind: PackingKind,
  n: number,
  w: number,
  h: number,
  scale: number,
): PackedAgent[] {
  const count = Math.max(1, Math.round(n));
  const ww = Math.max(1, w);
  const hh = Math.max(1, h);
  const s = Math.max(0.05, Math.min(1, scale));
  if (kind === 'hex') return packHex(count, ww, hh, s);
  if (kind === 'tight') return packTight(count, ww, hh, s);
  return packLattice(count, ww, hh, s);
}

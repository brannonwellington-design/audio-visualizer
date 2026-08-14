export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const v = Number.parseInt(n, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const m = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * t);
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`;
}

export function paletteColors(a: string, b: string, c: string, count: number): string[] {
  const n = Math.max(1, Math.min(3, Math.round(count)));
  if (n === 1) return [a];
  if (n === 2) return [a, b];
  return [a, b, c];
}

/** Map 0..1 activity onto a 1–3 color palette, discrete or gradient. */
export function colorForActivity(
  activity: number,
  colors: string[],
  gradient: boolean,
): string {
  const pal = colors.length ? colors : ['#CF2617'];
  if (pal.length === 1) return pal[0];
  const x = Math.max(0, Math.min(1, activity)) * (pal.length - 1);
  if (!gradient) {
    return pal[Math.min(pal.length - 1, Math.round(x))];
  }
  const i = Math.min(pal.length - 2, Math.floor(x));
  return mixHex(pal[i], pal[i + 1], x - i);
}

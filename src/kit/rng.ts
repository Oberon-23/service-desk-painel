/** Números aleatórios reprodutíveis (mulberry32): mesma semente, mesmos dados. */
export function rng(seed: number) {
  let a = seed;
  const r = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return {
    r, n,
    between: (x: number, y: number) => x + (y - x) * r(),
    pickW: (w: number[]) => { const s = w.reduce((p, q) => p + q, 0); let x = r() * s; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; } return w.length - 1; },
    pick: <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)],
    poisson: (l: number) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; },
    binom: (nn: number, p: number) => Math.max(0, Math.round(nn * p + Math.sqrt(Math.max(0, nn * p * (1 - p))) * n())),
  };
}
export type Rng = ReturnType<typeof rng>;

/* Formatação em português do Brasil e pequenas contas. */
const cache: Record<number, Intl.NumberFormat> = {};
export const nf = (d = 0) => (cache[d] ??= new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));

const ok = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);
export const fN = (x: number | null | undefined, d = 0) => (ok(x) ? nf(d).format(x) : '—');
export const fP = (x: number | null | undefined, d = 1) => (ok(x) ? `${nf(d).format(x * 100)}%` : '—');
export const fPP = (x: number, d = 1) => `${nf(d).format(Math.abs(x) * 100)} p.p.`;
export const fBRL = (x: number | null | undefined) =>
  !ok(x) ? '—' : Math.abs(x) >= 1e6 ? `R$ ${nf(2).format(x / 1e6)} mi` : Math.abs(x) >= 1e4 ? `R$ ${nf(1).format(x / 1e3)} mil` : `R$ ${nf(0).format(x)}`;
export const fBRLc = (x: number, d = 2) => `R$ ${nf(d).format(x)}`;
export const fH = (h: number) => (!ok(h) ? '—' : h < 1 ? `${nf(0).format(h * 60)} min` : h < 48 ? `${nf(1).format(h)} h` : `${nf(1).format(h / 24)} dias`);
export const fMil = (v: number) => (Math.abs(v) >= 1000 ? `${nf(0).format(v / 1000)} mil` : nf(0).format(v));

export const p2 = (n: number) => String(n).padStart(2, '0');
export const fDate = (t: number) => { const d = new Date(t); return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };
export const fDT = (t: number) => { const d = new Date(t); return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };

export const sum = <T,>(a: readonly T[], f: (x: T) => number = (x) => x as unknown as number) => a.reduce((s, x) => s + f(x), 0);
export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** junta com vírgulas e "e" */
export const joinE = (a: string[]) => (a.length <= 1 ? a[0] ?? '' : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`);
/** número com singular ou plural */
export const pl = (n: number, s: string, p: string) => `${fN(n)} ${n === 1 ? s : p}`;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type Status = 'ok' | 'warn' | 'bad' | 'neutral';
export const STATUS_TXT: Record<Status, string> = { ok: 'Na meta', warn: 'Atenção', bad: 'Fora da meta', neutral: 'Sem meta' };
/** situação contra a meta, com tolerância relativa para "atenção" */
export function statusOf(v: number, meta: number | null, maiorMelhor = true, tol = 0.05): Status {
  if (!Number.isFinite(v) || meta == null) return 'neutral';
  const bom = maiorMelhor ? v >= meta : v <= meta;
  if (bom) return 'ok';
  const gap = maiorMelhor ? (meta - v) / Math.abs(meta) : (v - meta) / Math.abs(meta);
  return gap <= tol ? 'warn' : 'bad';
}

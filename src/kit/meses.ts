/* Os 12 meses analisados (nov/2025 a out/2026) e os recortes de período. */
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export type Mes = { i: number; y: number; mo: number; key: string; label: string; long: string };
export const MONTHS: Mes[] = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 10 + i, 1));
  const y = d.getUTCFullYear(), mo = d.getUTCMonth();
  return { i, y, mo, key: `${y}-${String(mo + 1).padStart(2, '0')}`, label: `${MES[mo]}/${String(y).slice(2)}`, long: `${MESL[mo]} de ${y}` };
});
export const monthIdx = (t: number) => { const d = new Date(t); return (d.getUTCFullYear() - 2025) * 12 + d.getUTCMonth() - 10; };
export const monthLabels = () => MONTHS.map((m) => m.label);

export type Periodo = { from: number; to: number };
export function periodOptions(): [string, string][] {
  const o: [string, string][] = [['0-11', 'Últimos 12 meses'], ['6-11', 'Últimos 6 meses'], ['9-11', 'Últimos 3 meses']];
  [...MONTHS].reverse().forEach((m) => o.push([`${m.i}-${m.i}`, m.long.charAt(0).toUpperCase() + m.long.slice(1)]));
  return o;
}
export const periodLabel = ({ from, to }: Periodo) =>
  from === to ? `em ${MONTHS[from].long}` : from === 0 && to === 11 ? 'nos últimos 12 meses' : `de ${MONTHS[from].label} a ${MONTHS[to].label}`;
export const prevRange = ({ from, to }: Periodo): [number, number] | null => { const len = to - from + 1, f = from - len; return f < 0 ? null : [f, from - 1]; };
export const inRange = (p: Periodo, m: number) => m >= p.from && m <= p.to;

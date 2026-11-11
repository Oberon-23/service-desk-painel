/* Formatos, metas e pequenas regras de leitura usados por todas as telas. */
import type { Status } from '../../kit/formato';
import type { AnalistaFoto, Foto } from '../../operacao/motor';

export const pct = (x: number | null, d = 1) => (x === null ? '—' : `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
export const num = (x: number, d = 0) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pp = (x: number) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x * 100), 1)} p.p.`;
export const tempo = (min: number | null) => (min === null ? '—' : min < 1 ? `${num(min * 60)} s` : `${num(min, 1)} min`);
export const brl = (x: number) => `R$ ${num(x, 2)}`;
/** Duração em minutos: "8 min" ou "2h05". */
export const dur = (min: number) => { const m = Math.max(0, Math.round(min)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };

export const META_ABANDONO = 0.05, META_SLA_N2 = 0.9, META_ADERENCIA = 0.9, META_CSAT = 0.85, META_FCR = 0.7;
export const st = (ok: boolean, quase: boolean): Status => (ok ? 'ok' : quase ? 'warn' : 'bad');
export const ESTADO_TXT = { fora: 'Fora', livre: 'Disponível', atendendo: 'Atendendo', pausa: 'Em pausa' } as const;

/** Aderência à escala: escalados que estão logados e fora de pausa. */
export function aderencia(f: Foto) {
  const escalados = f.analistas.filter((a) => a.escalado);
  const atendendo = escalados.filter((a) => a.estado === 'livre' || a.estado === 'atendendo').length;
  const logados = f.analistas.filter((a) => a.pa !== null);
  const tPausa = logados.reduce((s, a) => s + a.pausaDia, 0);
  const tTotal = f.analistas.reduce((s, a) => s + a.linha.reduce((x, g) => x + (g.estado === 'fora' ? 0 : (g.ate ?? f.minuto) - g.de), 0), 0);
  return {
    atendendo, escalados: escalados.length, taxa: escalados.length ? atendendo / escalados.length : 1,
    emPausa: f.analistas.filter((a) => a.estado === 'pausa'), estouradas: f.analistas.filter((a) => a.estouro > 0),
    ausentes: escalados.filter((a) => a.pa === null).map((a) => a.nome), extras: logados.filter((a) => !a.escalado).map((a) => a.nome),
    pausaNoDia: tTotal > 0 ? tPausa / tTotal : null,
  };
}
export const situacao = (a: AnalistaFoto) => (a.estado === 'pausa' ? (a.estouro > 0 ? 'bad' : 'warn') : a.estado === 'atendendo' ? 'info' : a.estado === 'livre' ? 'ok' : 'neutral');

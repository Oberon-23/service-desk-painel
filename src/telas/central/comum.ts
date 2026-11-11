/* Regras e formatos compartilhados pelas telas da central (sem React). */
import { ATUAL, NOMES_N1, NOMES_N2 } from '../../fila';
import type { Status } from '../../kit/formato';
import { MOTIVOS, type ChamadoN2, type Motivo, type Placar, type Posto } from '../../central/tipos';

export const MAX_PA = { 1: 14, 2: 8 } as const;
/** Número da PA na sala: N1 usa 01–14 e N2 usa 15–22. */
export const numPa = (nivel: 1 | 2, pa: number) => String(nivel === 1 ? pa + 1 : MAX_PA[1] + pa + 1).padStart(2, '0');
/** Escala de hoje: quem deveria estar em cada PA. */
export const POSTOS_HOJE: Posto[] = [
  ...NOMES_N1.slice(0, ATUAL.n1).map((nome, pa) => ({ nivel: 1 as const, pa, nome, estado: 'logado' as const })),
  ...NOMES_N2.slice(0, ATUAL.n2).map((nome, pa) => ({ nivel: 2 as const, pa, nome, estado: 'logado' as const })),
];
export const ESCALADOS = new Set(POSTOS_HOJE.map((p) => p.nome));
export const logados = (ps: Posto[], nivel: 1 | 2) => ps.filter((p) => p.nivel === nivel && p.estado === 'logado').length;

/** Leva o número de logados de um nível até o alvo: entra quem está fora, na primeira PA livre; sai quem entrou por último. */
export function ajustar(ps: Posto[], nivel: 1 | 2, alvo: number): Posto[] {
  let r = [...ps];
  while (logados(r, nivel) < alvo) {
    const pausado = r.find((p) => p.nivel === nivel && p.estado === 'pausa');
    if (pausado) { r = r.map((p) => (p === pausado ? { ...p, estado: 'logado' } : p)); continue; }
    const nomes = nivel === 1 ? NOMES_N1 : NOMES_N2;
    const nome = nomes.find((n) => !r.some((p) => p.nome === n));
    const pa = Array.from({ length: MAX_PA[nivel] }, (_, i) => i).find((i) => !r.some((p) => p.nivel === nivel && p.pa === i));
    if (nome === undefined || pa === undefined) break;
    r.push({ nivel, pa, nome, estado: 'logado' });
  }
  while (logados(r, nivel) > alvo) {
    const ultimo = [...r].reverse().find((p) => p.nivel === nivel && p.estado === 'logado')!;
    r = r.filter((p) => p !== ultimo);
  }
  return r;
}

export type Mudar = (nivel: 1 | 2, pa: number, estado: Posto['estado'] | 'fora', nome?: string, motivo?: Motivo) => void;
export type Vivo = { placar: Placar; chamados: ChamadoN2[] };
export type Foco = { nivel: 1 | 2; pa: number; n: number };

/* ---------- formatos ---------- */
export const pct = (x: number, d = 1) => `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
export const num = (x: number, d = 0) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pp = (x: number) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x * 100), 1)} p.p.`;
export const tempo = (min: number) => (min < 1 ? `${num(min * 60)} s` : `${num(min, 1)} min`);
export const brl = (x: number) => `R$ ${num(x, 2)}`;
/** Duração em minutos: "8 min" ou "2h05". */
export const dur = (min: number) => { const m = Math.max(0, Math.round(min)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };

/* ---------- metas ---------- */
export const META_ABANDONO = 0.05, META_SLA_N2 = 0.9, META_ADERENCIA = 0.9, LIMITE_FILA_N1 = 5;
export const st = (ok: boolean, quase: boolean): Status => (ok ? 'ok' : quase ? 'warn' : 'bad');

/* ---------- pausas e aderência ---------- */
/** Pausa que passou do limite do motivo, em minutos (0 se ainda está dentro). */
export const estouro = (p: Posto | undefined, pausaAgora: number | null | undefined) =>
  (p?.estado === 'pausa' && p.motivo && pausaAgora != null ? Math.max(0, pausaAgora - MOTIVOS[p.motivo].limite) : 0);
export const pausaDe = (placar: Placar | null, p: Posto) => placar?.mesas.find((m) => m.nivel === p.nivel && m.pa === p.pa)?.pausaAgora ?? null;

export function aderencia(postos: Posto[], placar: Placar | null) {
  const atendendo = postos.filter((p) => ESCALADOS.has(p.nome) && p.estado === 'logado').length;
  const emPausa = postos.filter((p) => p.estado === 'pausa');
  const tempos = placar ? Object.values(placar.tempo) : [];
  const pausa = tempos.reduce((s, x) => s + x.pausa, 0), disp = tempos.reduce((s, x) => s + x.disponivel, 0);
  return {
    atendendo, escalados: ESCALADOS.size, taxa: atendendo / ESCALADOS.size, emPausa,
    estouradas: emPausa.filter((p) => estouro(p, pausaDe(placar, p)) > 0),
    ausentes: [...ESCALADOS].filter((n) => !postos.some((p) => p.nome === n)),
    extras: postos.filter((p) => !ESCALADOS.has(p.nome)).map((p) => p.nome),
    pausaNoDia: pausa + disp > 0 ? pausa / (pausa + disp) : null,
  };
}

/* ---------- pontos de atenção ---------- */
export type Aba = 'equipe' | 'chamados' | 'simulador';
export type Atencao = { id: string; nivel: 'bad' | 'warn'; titulo: string; texto: string; aba: Aba; foco?: { nivel: 1 | 2; pa: number } };

/** O que pede ação da coordenação agora, do mais grave ao menos grave. */
export function pontosDeAtencao(postos: Posto[], vivo: Vivo | null): Atencao[] {
  if (!vivo) return [];
  const { placar, chamados } = vivo;
  const r: Atencao[] = [];
  for (const k of chamados.filter((x) => x.prio === 1)) {
    r.push({ id: `p1-${k.cod}`, nivel: 'bad', titulo: `Incidente P1: ${k.assunto}`, texto: `${k.cod} ${k.com ? `com ${k.com.nome}` : 'ainda na fila'}; ${k.resta < 0 ? `vencido há ${dur(-k.resta)}` : `vence em ${dur(k.resta)}`}.`, aba: 'chamados' });
  }
  const vencidos = chamados.filter((x) => x.resta < 0);
  if (vencidos.length) r.push({ id: 'vencidos', nivel: 'bad', titulo: `${vencidos.length} ${vencidos.length === 1 ? 'chamado vencido' : 'chamados vencidos'} no N2`, texto: `O mais antigo venceu há ${dur(-vencidos[0].resta)} (${vencidos[0].cod}).`, aba: 'chamados' });
  const ad = aderencia(postos, placar);
  for (const p of ad.estouradas) {
    const t = pausaDe(placar, p)!;
    r.push({ id: `pausa-${p.nome}`, nivel: 'bad', titulo: `${p.nome} passou do limite da pausa`, texto: `${MOTIVOS[p.motivo!].rotulo}: ${dur(t)} de ${MOTIVOS[p.motivo!].limite} min (PA ${numPa(p.nivel, p.pa)}).`, aba: 'equipe', foco: { nivel: p.nivel, pa: p.pa } });
  }
  if (placar.filaN1 > LIMITE_FILA_N1) r.push({ id: 'fila', nivel: 'warn', titulo: `Fila do N1 com ${placar.filaN1} contatos`, texto: `Acima de ${LIMITE_FILA_N1}: quem espera começa a desistir. Vale tirar alguém da pausa.`, aba: 'equipe' });
  if (ad.ausentes.length) r.push({ id: 'ausentes', nivel: 'warn', titulo: `${ad.ausentes.length} ${ad.ausentes.length === 1 ? 'pessoa da escala não está logada' : 'pessoas da escala não estão logadas'}`, texto: ad.ausentes.join(', ') + '.', aba: 'equipe' });
  const risco = chamados.filter((x) => x.resta >= 0 && x.resta <= 60);
  if (risco.length) r.push({ id: 'risco', nivel: 'warn', titulo: `${risco.length} ${risco.length === 1 ? 'chamado vence' : 'chamados vencem'} em até 1 h`, texto: risco.map((x) => x.cod).join(', ') + '.', aba: 'chamados' });
  const tot = placar.atendidos + placar.abandonos;
  if (tot >= 20 && placar.abandonos / tot > META_ABANDONO) r.push({ id: 'abandono', nivel: 'warn', titulo: `Abandono de ${pct(placar.abandonos / tot)} hoje`, texto: `Meta: até ${pct(META_ABANDONO, 0)}.`, aba: 'simulador' });
  return r;
}

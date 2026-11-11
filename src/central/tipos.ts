/* Tipos e constantes da central, sem three.js (a tela importa daqui sem carregar a cena 3D). */
export type EstadoMesa = 'livre' | 'atendendo' | 'pausa' | 'fora';
export type Selecao = { nivel: 1 | 2; pa: number; nome: string };
/** Quem está logado em cada posição de atendimento (PA). */
export type Posto = { nivel: 1 | 2; pa: number; nome: string; estado: 'logado' | 'pausa'; motivo?: Motivo };
/** Motivos de pausa e o tempo máximo de cada um, em minutos. */
export const MOTIVOS = {
  descanso: { rotulo: 'Descanso', limite: 10 },
  lanche: { rotulo: 'Lanche', limite: 20 },
  banheiro: { rotulo: 'Banheiro', limite: 5 },
  feedback: { rotulo: 'Feedback', limite: 15 },
  treinamento: { rotulo: 'Treinamento', limite: 30 },
  particular: { rotulo: 'Particular', limite: 5 },
} as const;
export type Motivo = keyof typeof MOTIVOS;
export const MAX_N1 = 14, MAX_N2 = 8;
export type Placar = {
  relogio: string; minuto: number; filaN1: number; filaN2: number; atendidos: number; noPrazo: number; abandonos: number; escalados: number; resolvidosN2: number;
  /** chamados do N2 resolvidos hoje dentro e fora do prazo da prioridade */
  n2NoPrazo: number; n2Atrasados: number;
  esperaMedia: number;
  mesas: { nivel: 1 | 2; pa: number; nome: string; estado: EstadoMesa; feitos: number; pausaAgora: number | null }[];
  /** minutos do dia por analista: disponível para a fila e em pausa */
  tempo: Record<string, { disponivel: number; pausa: number }>;
};
/** Prazo de solução do N2 por prioridade, em horas úteis. P3 é o padrão (8 h). */
export const SLA_PRIO: Record<1 | 2 | 3 | 4, number> = { 1: 2, 2: 4, 3: 8, 4: 16 };
export type ChamadoN2 = { cod: string; prio: 1 | 2 | 3 | 4; assunto: string; com: { nome: string; pa: number } | null; aberto: number; resta: number };

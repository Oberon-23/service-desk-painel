/*
 * Monitoramento: amostras por minuto, regras de alerta e o ciclo de vida de cada alerta.
 *
 * Inspirado em ferramentas de monitoramento (NOC, ServiceNow, Grafana):
 * - cada regra tem limite de atenção e crítico, numa janela de tempo declarada (espera: 2× e 4× o
 *   alvo do canal; volume: 40% e 70% acima do previsto, porque ±20% em meia hora é variação normal);
 * - um alerta só abre depois de 2 minutos seguidos fora do limite (evita alarme falso)
 *   e só fecha depois de 3 minutos de volta ao normal (evita piscar);
 * - a coordenação reconhece o alerta ("estou vendo"), e o painel mede quanto tempo
 *   leva para reconhecer (MTTA) e para normalizar (MTTR);
 * - a saúde de cada serviço é a pior severidade entre os alertas abertos dele.
 */
export type Sev = 'warn' | 'crit';
export type Servico = 'telefone' | 'chat' | 'portal' | 'n1' | 'n2' | 'equipe' | 'experiencia';
export const SERVICOS: Record<Servico, { rotulo: string }> = {
  telefone: { rotulo: 'Telefone' }, chat: { rotulo: 'Chat' }, portal: { rotulo: 'Portal' }, n1: { rotulo: 'Atendimento N1' },
  n2: { rotulo: 'N2 · especialistas' }, equipe: { rotulo: 'Equipe' }, experiencia: { rotulo: 'Experiência' },
};
export const ORDEM_SERVICOS: Servico[] = ['telefone', 'chat', 'portal', 'n1', 'n2', 'equipe', 'experiencia'];
export const SEV_TXT: Record<Sev, string> = { warn: 'Atenção', crit: 'Crítico' };

/** Um minuto da operação. Contagens são do minuto; filas e espera são o retrato no fim do minuto. */
export type Amostra = {
  min: number;
  chegadas: number; previsto: number; atendidos: number; noAlvo: number; abandonos: number; somaEspera: number;
  csatBom: number; csatN: number;
  espera: { telefone: number; chat: number; portal: number }; // maior espera, em minutos
  fila: { telefone: number; chat: number; portal: number; n2: number };
  atendendo: number; disponiveis: number; // N1
};
export const amostraZero = (min: number): Amostra => ({
  min, chegadas: 0, previsto: 0, atendidos: 0, noAlvo: 0, abandonos: 0, somaEspera: 0, csatBom: 0, csatN: 0,
  espera: { telefone: 0, chat: 0, portal: 0 }, fila: { telefone: 0, chat: 0, portal: 0, n2: 0 }, atendendo: 0, disponiveis: 0,
});

/** O que as regras leem, além das amostras. */
export type Estado = { vencidosN2: number; p1Abertos: number; aderencia: number; pausasEstouradas: number };

type Leitura = { serie: Amostra[]; estado: Estado };
export type Regra = {
  id: string; servico: Servico; nome: string; janela: string;
  /** 'acima': ruim quando passa do limite; 'abaixo': ruim quando fica abaixo */
  sentido: 'acima' | 'abaixo'; warn: number; crit: number;
  /** formato do valor e dos limites na tela */
  fmt: 'min' | 'pct' | 'n' | 'x';
  ler: (l: Leitura) => number | null;
};

const ult = (s: Amostra[], n: number) => s.slice(-n);
const soma = (s: Amostra[], f: (a: Amostra) => number) => s.reduce((t, a) => t + f(a), 0);
const agora = (s: Amostra[]) => s[s.length - 1];

export const REGRAS: Regra[] = [
  { id: 'tel-espera', servico: 'telefone', nome: 'Maior espera no telefone', janela: 'agora', sentido: 'acima', warn: 2, crit: 4, fmt: 'min', ler: ({ serie }) => agora(serie)?.espera.telefone ?? null },
  { id: 'chat-espera', servico: 'chat', nome: 'Maior espera no chat', janela: 'agora', sentido: 'acima', warn: 4, crit: 8, fmt: 'min', ler: ({ serie }) => agora(serie)?.espera.chat ?? null },
  { id: 'portal-espera', servico: 'portal', nome: 'Maior espera no portal', janela: 'agora', sentido: 'acima', warn: 30, crit: 60, fmt: 'min', ler: ({ serie }) => agora(serie)?.espera.portal ?? null },
  {
    id: 'ns', servico: 'n1', nome: 'Nível de serviço', janela: '30 min', sentido: 'abaixo', warn: 0.8, crit: 0.7, fmt: 'pct',
    ler: ({ serie }) => { const j = ult(serie, 30), d = soma(j, (a) => a.atendidos + a.abandonos); return d >= 10 ? soma(j, (a) => a.noAlvo) / d : null; },
  },
  {
    id: 'abandono', servico: 'n1', nome: 'Abandono', janela: '30 min', sentido: 'acima', warn: 0.05, crit: 0.1, fmt: 'pct',
    ler: ({ serie }) => { const j = ult(serie, 30), d = soma(j, (a) => a.atendidos + a.abandonos); return d >= 10 ? soma(j, (a) => a.abandonos) / d : null; },
  },
  {
    id: 'volume', servico: 'n1', nome: 'Volume contra o previsto', janela: '30 min', sentido: 'acima', warn: 1.4, crit: 1.7, fmt: 'x',
    ler: ({ serie }) => { const j = ult(serie, 30), p = soma(j, (a) => a.previsto); return j.length >= 30 && p > 3 ? soma(j, (a) => a.chegadas) / p : null; },
  },
  {
    id: 'ocupacao', servico: 'equipe', nome: 'Ocupação do N1', janela: '15 min', sentido: 'acima', warn: 0.9, crit: 0.97, fmt: 'pct',
    ler: ({ serie }) => { const j = ult(serie, 15), d = soma(j, (a) => a.disponiveis); return d > 0 ? soma(j, (a) => a.atendendo) / d : null; },
  },
  { id: 'aderencia', servico: 'equipe', nome: 'Aderência à escala', janela: 'agora', sentido: 'abaixo', warn: 0.9, crit: 0.8, fmt: 'pct', ler: ({ estado }) => estado.aderencia },
  { id: 'pausas', servico: 'equipe', nome: 'Pausas acima do limite', janela: 'agora', sentido: 'acima', warn: 1, crit: 3, fmt: 'n', ler: ({ estado }) => estado.pausasEstouradas },
  { id: 'n2-vencidos', servico: 'n2', nome: 'Chamados vencidos no N2', janela: 'agora', sentido: 'acima', warn: 1, crit: 3, fmt: 'n', ler: ({ estado }) => estado.vencidosN2 },
  { id: 'n2-p1', servico: 'n2', nome: 'Chamado P1 aberto', janela: 'agora', sentido: 'acima', warn: 1, crit: 1, fmt: 'n', ler: ({ estado }) => estado.p1Abertos },
  {
    id: 'csat', servico: 'experiencia', nome: 'Satisfação', janela: '60 min', sentido: 'abaixo', warn: 0.85, crit: 0.75, fmt: 'pct',
    ler: ({ serie }) => { const j = ult(serie, 60), n = soma(j, (a) => a.csatN); return n >= 15 ? soma(j, (a) => a.csatBom) / n : null; },
  },
];

/** Severidade de um valor pela regra. Contagens ('n') valem a partir do limite; o resto, só depois de passar dele. */
export function classificar(r: Regra, v: number | null): Sev | null {
  if (v === null) return null;
  if (r.sentido === 'acima') {
    const passa = (lim: number) => (r.fmt === 'n' ? v >= lim : v > lim);
    return passa(r.crit) ? 'crit' : passa(r.warn) ? 'warn' : null;
  }
  return v < r.crit ? 'crit' : v < r.warn ? 'warn' : null;
}

export const fmtValor = (r: Pick<Regra, 'fmt'>, v: number | null) => {
  if (v === null) return '—';
  if (r.fmt === 'pct') return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  if (r.fmt === 'min') return v < 1 ? `${Math.round(v * 60)} s` : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`;
  if (r.fmt === 'x') return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do previsto`;
  return String(Math.round(v));
};
export const fmtLimite = (r: Regra, lim: number) => `${r.sentido === 'acima' ? (r.fmt === 'n' ? '≥' : '>') : '<'} ${r.fmt === 'x' ? `${Math.round(lim * 100)}%` : fmtValor(r, lim)}`;

export type Alerta = {
  id: number; regra: string; servico: Servico; nome: string;
  sev: Sev; /** pior severidade que já atingiu */
  sevAgora: Sev | null; valor: number | null; limite: string;
  aberto: number; reconhecido: number | null; resolvido: number | null;
};
export const ABRE_APOS = 2, FECHA_APOS = 3;

/** Avalia as regras a cada minuto e cuida da vida de cada alerta. */
export class Vigia {
  alertas: Alerta[] = [];
  leituras: Record<string, { valor: number | null; sev: Sev | null }> = {};
  private seq = 0;
  private fora: Record<string, number> = {}; // minutos seguidos fora do limite (antes de abrir)
  private normal: Record<string, number> = {}; // minutos seguidos no normal (com alerta aberto)

  /** Avalia um minuto. Devolve o que mudou, para o histórico do turno. */
  avaliar(min: number, l: Leitura): { tipo: 'abriu' | 'piorou' | 'fechou'; a: Alerta }[] {
    const mudou: { tipo: 'abriu' | 'piorou' | 'fechou'; a: Alerta }[] = [];
    for (const r of REGRAS) {
      const v = r.ler(l), s = classificar(r, v);
      this.leituras[r.id] = { valor: v, sev: s };
      const aberto = this.alertas.find((a) => a.regra === r.id && a.resolvido === null);
      if (!aberto) {
        this.fora[r.id] = s ? (this.fora[r.id] ?? 0) + 1 : 0;
        if (s && this.fora[r.id] >= ABRE_APOS) {
          const a: Alerta = { id: ++this.seq, regra: r.id, servico: r.servico, nome: r.nome, sev: s, sevAgora: s, valor: v, limite: fmtLimite(r, s === 'crit' ? r.crit : r.warn), aberto: min, reconhecido: null, resolvido: null };
          this.alertas.unshift(a); this.fora[r.id] = 0; mudou.push({ tipo: 'abriu', a });
        }
        continue;
      }
      aberto.valor = v; aberto.sevAgora = s;
      if (s) {
        this.normal[r.id] = 0;
        if (s === 'crit' && aberto.sev === 'warn') { aberto.sev = 'crit'; aberto.limite = fmtLimite(r, r.crit); mudou.push({ tipo: 'piorou', a: aberto }); }
      } else {
        this.normal[r.id] = (this.normal[r.id] ?? 0) + 1;
        if (this.normal[r.id] >= FECHA_APOS) { aberto.resolvido = min; this.normal[r.id] = 0; mudou.push({ tipo: 'fechou', a: aberto }); }
      }
    }
    if (this.alertas.length > 200) this.alertas.length = 200;
    return mudou;
  }

  reconhecer(id: number, min: number) {
    const a = this.alertas.find((x) => x.id === id);
    if (a && a.reconhecido === null && a.resolvido === null) a.reconhecido = min;
    return a;
  }

  /** Pior severidade aberta por serviço. */
  saude(): Record<Servico, Sev | 'ok'> {
    const r = Object.fromEntries(ORDEM_SERVICOS.map((s) => [s, 'ok'])) as Record<Servico, Sev | 'ok'>;
    for (const a of this.alertas) if (a.resolvido === null && r[a.servico] !== 'crit') r[a.servico] = a.sevAgora === 'crit' || (a.sevAgora === null && a.sev === 'crit') ? 'crit' : 'warn';
    return r;
  }

  /** MTTA e MTTR do dia, em minutos (null sem casos). */
  tempos() {
    const rec = this.alertas.filter((a) => a.reconhecido !== null), res = this.alertas.filter((a) => a.resolvido !== null);
    const media = (l: number[]) => (l.length ? l.reduce((x, y) => x + y, 0) / l.length : null);
    return { mtta: media(rec.map((a) => a.reconhecido! - a.aberto)), mttr: media(res.map((a) => a.resolvido! - a.aberto)), nRec: rec.length, nRes: res.length };
  }

  zerar() { this.alertas = []; this.leituras = {}; this.fora = {}; this.normal = {}; }
}

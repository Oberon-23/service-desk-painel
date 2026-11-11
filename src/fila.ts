/*
 * Modelo da central de service desk (fila de atendimento N1 e N2).
 *
 * O N1 é tratado como uma fila com várias pessoas atendendo (Erlang C, a conta
 * clássica de dimensionamento de central), hora a hora, com desistência de quem
 * espera demais. O que o N1 não resolve vai para o N2, que tem o próprio prazo.
 *
 *   Nível de serviço = % de contatos atendidos em até 60 s
 *   Espera média     = tempo médio na fila até ser atendido
 *   Abandono         = % de contatos que desistem antes de ser atendidos
 *   SLA do N2        = % de chamados escalados resolvidos em até 8 horas
 */

export const ABRE = 8, FECHA = 18; // horário da central
export const HORAS = Array.from({ length: FECHA - ABRE }, (_, i) => ABRE + i);
/** Parte do volume do dia que chega em cada hora (pico às 9–11h e depois do almoço). */
export const PERFIL = [0.075, 0.13, 0.14, 0.12, 0.08, 0.07, 0.11, 0.11, 0.095, 0.07];
export const META_NS = 0.8; // 80% atendidos em até 60 s
export const ALVO_S = 60;
export const PACIENCIA_MIN = 6; // em média, quem espera desiste em 6 min
export const TMA_N2 = 30; // minutos por chamado no N2
export const SLA_N2_H = 8;
export const CUSTO_HORA = { n1: 38, n2: 62 }; // R$ por hora de analista (com encargos)

export type Cenario = {
  /** analistas no N1 */
  n1: number;
  /** analistas no N2 */
  n2: number;
  /** contatos por dia (100% = dia normal) */
  volume: number;
  /** tempo médio de atendimento no N1, em minutos */
  tma: number;
  /** % resolvido no primeiro contato */
  fcr: number;
  /** portal com base de conhecimento e autoatendimento */
  autoatendimento: boolean;
  /** segunda-feira de manhã: volume represado do fim de semana */
  segunda: boolean;
};

export const ATUAL: Cenario = { n1: 7, n2: 4, volume: 100, tma: 8, fcr: 72, autoatendimento: false, segunda: false };
export const VOLUME_DIA = 300;

/* ---------------- Erlang C ---------------- */
/** Probabilidade de esperar na fila (Erlang C) com tráfego A (erlangs) e N pessoas. */
export function erlangC(A: number, N: number): number {
  if (N <= 0) return 1;
  if (A >= N) return 1;
  // soma estável: termos de A^k/k!
  let termo = 1, soma = 1;
  for (let k = 1; k < N; k++) { termo *= A / k; soma += termo; }
  const ultimo = termo * (A / N) * (N / (N - A));
  return ultimo / (soma + ultimo);
}

export type Hora = {
  hora: number;
  chegadas: number; // contatos na hora
  A: number;        // tráfego em erlangs
  ns: number;       // nível de serviço (≤ 60 s)
  espera: number;   // espera média dos atendidos (min)
  abandono: number; // fração que desiste
  ocupacao: number; // fração do tempo dos analistas ocupada
  estavel: boolean;
};

/** Uma hora do N1, com desistência de quem espera demais. */
export function horaN1(chegadas: number, tma: number, n: number): Omit<Hora, 'hora'> {
  const A = (chegadas * tma) / 60;
  if (n <= 0) return { chegadas, A, ns: 0, espera: PACIENCIA_MIN, abandono: 1, ocupacao: 1, estavel: false };
  if (A >= n * 0.985) {
    // fila crescendo: só entra quem a equipe consegue atender; o resto desiste
    const atende = Math.min(1, (n * 0.985) / A);
    return { chegadas, A, ns: 0.05, espera: PACIENCIA_MIN * 0.9, abandono: Math.max(0.12, 1 - atende), ocupacao: 0.985, estavel: false };
  }
  const C = erlangC(A, n);
  const taxa = (n - A) / tma; // por minuto
  const t = ALVO_S / 60;
  const theta = 1 / PACIENCIA_MIN;
  const ns = 1 - C * Math.exp(-taxa * t);
  const espera = C / (taxa + theta); // com desistência, ninguém espera muito além da paciência
  const abandono = C * (theta / (taxa + theta));
  const ocupacao = (A * (1 - abandono)) / n;
  return { chegadas, A, ns: Math.max(0, Math.min(1, ns)), espera, abandono, ocupacao, estavel: true };
}

/** Contatos por hora no cenário. */
export function chegadas(c: Cenario): number[] {
  const dia = VOLUME_DIA * (c.volume / 100) * (c.autoatendimento ? 0.85 : 1);
  return PERFIL.map((p, i) => dia * p * (c.segunda && i < 4 ? 1.4 : 1));
}
export const tmaEfetivo = (c: Cenario) => c.tma * (c.autoatendimento ? 0.92 : 1);

export type Resultado = {
  horas: Hora[];
  ns: number; espera: number; abandono: number; ocupacao: number;
  contatos: number; atendidos: number; abandonos: number;
  escalados: number; slaN2: number; filaN2FimDoDia: number; ocupacaoN2: number;
  custoDia: number; custoPorContato: number;
  piorHora: Hora;
};

export function simular(c: Cenario): Resultado {
  const tma = tmaEfetivo(c);
  const horas: Hora[] = chegadas(c).map((l, i) => ({ hora: HORAS[i], ...horaN1(l, tma, c.n1) }));
  const contatos = horas.reduce((s, h) => s + h.chegadas, 0);
  const pond = (f: (h: Hora) => number) => horas.reduce((s, h) => s + h.chegadas * f(h), 0) / contatos;
  const abandonos = horas.reduce((s, h) => s + h.chegadas * h.abandono, 0);
  const atendidos = contatos - abandonos;
  const escalados = atendidos * (1 - c.fcr / 100);

  // N2: fila de chamados escalados ao longo do dia, prazo de 8 horas úteis.
  // Hora a hora: o que chega soma ao que estava esperando e a equipe tira o que consegue.
  // O que sobra no fim do dia passa para o dia seguinte (roda 3 dias para estabilizar).
  const n2 = horaN2(horas.map((h) => h.chegadas * (1 - h.abandono) * (1 - c.fcr / 100)), c.n2);
  const slaN2 = n2.sla, filaN2 = n2.fimDoDia;
  const horasDia = horas.length;
  const custoDia = (c.n1 * CUSTO_HORA.n1 + c.n2 * CUSTO_HORA.n2) * horasDia;
  const piorHora = [...horas].sort((a, b) => a.ns - b.ns)[0];
  return {
    horas, contatos, atendidos, abandonos, escalados,
    ns: pond((h) => h.ns), espera: pond((h) => h.espera), abandono: abandonos / contatos, ocupacao: pond((h) => h.ocupacao),
    slaN2: Math.max(0, Math.min(1, slaN2)), filaN2FimDoDia: filaN2, ocupacaoN2: n2.ocupacao,
    custoDia, custoPorContato: custoDia / Math.max(1, atendidos), piorHora,
  };
}

/** Fila do N2 hora a hora (modelo de fluxo), com a variação aleatória do Erlang C por cima. */
export function horaN2(escaladosPorHora: number[], n2: number) {
  const cap = (n2 * 60) / TMA_N2; // chamados por hora
  const total = escaladosPorHora.reduce((a, b) => a + b, 0);
  let fila = 0, sla = 0, ocupado = 0;
  for (let dia = 0; dia < 3; dia++) {
    sla = 0; ocupado = 0;
    for (const l of escaladosPorHora) {
      const A = (l * TMA_N2) / 60;
      const variacao = A < n2 ? Math.min(120, (erlangC(A, n2) * TMA_N2) / (n2 - A)) / 60 : 2; // horas
      const espera = fila / Math.max(0.01, cap) + variacao + TMA_N2 / 60;
      sla += l / (1 + Math.exp((espera - SLA_N2_H) / 0.6));
      const feito = Math.min(cap, fila + l);
      ocupado += feito / cap;
      fila = Math.max(0, fila + l - cap);
    }
  }
  return { sla: total ? sla / total : 1, fimDoDia: fila, ocupacao: ocupado / escaladosPorHora.length, capacidadeDia: cap * escaladosPorHora.length };
}

/** Menor número de analistas N1 para a hora atingir a meta de nível de serviço. */
export function minimoN1(chegadasHora: number, tma: number, meta = META_NS) {
  for (let n = 1; n <= 40; n++) if (horaN1(chegadasHora, tma, n).ns >= meta) return n;
  return 40;
}

/** Escala ideal hora a hora: quantos analistas N1 a central precisa em cada hora. */
export function escalaIdeal(c: Cenario) {
  const tma = tmaEfetivo(c);
  return chegadas(c).map((l, i) => ({ hora: HORAS[i], chegadas: l, precisa: minimoN1(l, tma) }));
}

/** Alavanca que mais melhora o nível de serviço a partir do cenário. */
export function melhorAlavanca(c: Cenario): { nome: string; ganho: number } | null {
  const base = simular(c).ns;
  const t: [string, Cenario][] = [
    ['Colocar mais 1 analista no N1', { ...c, n1: c.n1 + 1 }],
    ['Reduzir o tempo médio de atendimento em 1 min', { ...c, tma: Math.max(3, c.tma - 1) }],
    ['Ligar o portal de autoatendimento', { ...c, autoatendimento: true }],
  ];
  const m = t.map(([nome, x]) => ({ nome, ganho: simular(x).ns - base })).sort((a, b) => b.ganho - a.ganho)[0];
  return m.ganho > 0.002 ? m : null;
}

/* ---------------- equipe (nomes fictícios) ---------------- */
export const NOMES_N1 = ['Ana', 'Bruno', 'Carla', 'Davi', 'Elisa', 'Fábio', 'Gabi', 'Hugo', 'Íris', 'João', 'Kátia', 'Léo', 'Marta', 'Nilo'];
export const NOMES_N2 = ['Otávio', 'Paula', 'Rafael', 'Sara', 'Tiago', 'Vera', 'Wagner', 'Yara'];
export const CATEGORIAS = ['Senha e acesso', 'VPN', 'E-mail', 'Impressora', 'SAP', 'Notebook', 'Wi-Fi', 'Software'];
export const PESO_CATEGORIAS = [0.26, 0.14, 0.13, 0.11, 0.1, 0.1, 0.08, 0.08];

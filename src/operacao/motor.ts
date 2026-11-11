/*
 * Motor da operação: a simulação da central, sem tela.
 *
 * Contatos chegam por três canais (telefone, chat e portal), cada um com a própria fila e o
 * próprio alvo de espera. Cada analista do N1 atende os canais em que está habilitado e pega
 * sempre o contato mais urgente (espera ÷ alvo do canal). O que o N1 não resolve vira chamado
 * do N2, atendido pela ordem do prazo. Tudo é sorteado um a um, com semente fixa.
 *
 * Não depende de React nem de three.js: as telas leem `foto()` e a cena 3D só desenha.
 */
import { ABRE, ATUAL, CATEGORIAS, chegadas, FECHA, NOMES_N1, NOMES_N2, PESO_CATEGORIAS, TMA_N2, tmaEfetivo, type Cenario } from '../fila';

/* ---------------- regras da operação ---------------- */
export type Canal = 'telefone' | 'chat' | 'portal';
export const ORDEM_CANAIS: Canal[] = ['telefone', 'chat', 'portal'];
/** alvo: espera máxima em minutos; meta: parte dos contatos dentro do alvo; paciência: quando desistem (min). */
export const CANAIS: Record<Canal, { rotulo: string; alvo: number; meta: number; paciencia: number | null; mix: number; tma: number }> = {
  telefone: { rotulo: 'Telefone', alvo: 1, meta: 0.8, paciencia: 6, mix: 0.5, tma: 1 },
  chat: { rotulo: 'Chat', alvo: 2, meta: 0.8, paciencia: 10, mix: 0.3, tma: 1.15 },
  portal: { rotulo: 'Portal', alvo: 15, meta: 0.9, paciencia: null, mix: 0.2, tma: 0.8 },
};
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
/** Prazo de solução do N2 por prioridade, em horas úteis. */
export const SLA_PRIO: Record<Prio, number> = { 1: 2, 2: 4, 3: 8, 4: 16 };
export type Prio = 1 | 2 | 3 | 4;
export const MAX_PA = { 1: 14, 2: 8 } as const;
/** Número da PA na sala: N1 usa 01–14 e N2 usa 15–22. */
export const numPa = (nivel: 1 | 2, pa: number) => String(nivel === 1 ? pa + 1 : MAX_PA[1] + pa + 1).padStart(2, '0');
export const DIA_MIN = (FECHA - ABRE) * 60;
const INICIO = 150; // a tela abre às 10h30, com a manhã já simulada

/** Canais em que cada analista do N1 está habilitado no começo do dia. */
const HABILIDADES: Canal[][] = [
  ['telefone', 'chat', 'portal'], ['telefone', 'chat'], ['telefone', 'portal'], ['telefone'], ['telefone', 'chat'], ['telefone', 'portal'], ['telefone', 'chat'],
  ['telefone'], ['chat', 'portal'], ['telefone', 'chat'], ['telefone'], ['telefone', 'portal'], ['chat', 'portal'], ['telefone'],
];
/** Jeito de cada pessoa: fator no tempo de atendimento e pontos a mais ou a menos na resolução no primeiro contato. */
const PERFIL_N1: [number, number][] = [[1, 4], [0.92, 2], [1.08, -3], [1.32, -9], [0.95, 5], [1.05, 0], [0.9, 3], [1.12, -4], [1, 6], [0.96, 1], [1.18, -6], [0.9, 2], [1.04, 0], [1, -2]];
const PERFIL_N2 = [1, 0.9, 1.15, 1, 1.1, 0.95, 1.05, 1];
/** Chamados do N2 que já estavam abertos quando o dia começa: [minuto em que foi escalado, prioridade, categoria]. */
const BACKLOG: [number, Prio, number][] = [[-470, 3, 1], [-455, 3, 4], [-440, 3, 0], [-420, 4, 4], [-400, 3, 2], [-390, 3, 6], [-370, 3, 5], [-200, 2, 0], [-180, 2, 1], [-150, 3, 3], [-90, 3, 7], [-40, 3, 2]];

export type EstadoAnalista = 'fora' | 'livre' | 'atendendo' | 'pausa';
export type Seg = { de: number; ate: number | null; estado: EstadoAnalista };
export type Evento = { id: number; min: number; tipo: 'equipe' | 'fila' | 'n2' | 'crise' | 'copiloto'; texto: string };
export type TipoCrise = 'vpn' | 'pico' | 'faltas';
export const CRISES: Record<TipoCrise, { rotulo: string; texto: string }> = {
  vpn: { rotulo: 'Queda da VPN', texto: 'Por 90 minutos chegam quase o dobro de contatos, todos sobre VPN.' },
  pico: { rotulo: 'Pico de demanda', texto: 'Por 60 minutos o volume sobe 60% em todos os assuntos.' },
  faltas: { rotulo: 'Duas faltas no N1', texto: 'Dois analistas do N1 saem da operação agora.' },
};

type Ticket = {
  id: number; canal: Canal; cat: number; estado: 'fila' | 'n1' | 'fila2' | 'n2';
  chegou: number; paciencia: number | null; com: string | null; inicio: number; fim: number;
  prio: Prio; escalou: number; prazo: number; vencidoAvisado?: boolean; pai?: boolean;
};
type Analista = {
  nome: string; nivel: 1 | 2; idx: number; canais: Set<Canal>; escalado: boolean;
  pa: number | null; estado: EstadoAnalista; motivo: Motivo | null; desde: number; ticket: Ticket | null; estouroAvisado: boolean;
  atend: number; somaTma: number; fcrOk: number; csatBom: number; csatN: number;
  tLivre: number; tAtend: number; tPausa: number; linha: Seg[];
};
type EstatFila = { recebidos: number; atendidos: number; noAlvo: number; abandonos: number; somaEspera: number; somaTma: number; nTma: number; csatBom: number; csatN: number; hist: number[] };
const filaZero = (): EstatFila => ({ recebidos: 0, atendidos: 0, noAlvo: 0, abandonos: 0, somaEspera: 0, somaTma: 0, nTma: 0, csatBom: 0, csatN: 0, hist: [] });

/* ---------------- o que as telas leem ---------------- */
export type AnalistaFoto = {
  nome: string; nivel: 1 | 2; canais: Canal[]; escalado: boolean; pa: number | null; estado: EstadoAnalista; motivo: Motivo | null;
  /** minutos no estado atual */
  noEstado: number;
  /** minutos acima do limite da pausa (0 se dentro) */
  estouro: number;
  ticket: { cod: string; canal: Canal; assunto: string } | null;
  atend: number; tma: number | null; fcr: number | null; csat: number | null; csatN: number; ocupacao: number | null; pausaDia: number; linha: Seg[];
};
export type FilaFoto = {
  canal: Canal; esperando: number; maiorEspera: number; emAtendimento: number; habilitados: number; livres: number;
  recebidos: number; atendidos: number; abandonos: number; ns: number | null; abandono: number | null; esperaMedia: number | null; tma: number | null; csat: number | null; hist: number[];
};
export type ChamadoN2 = { cod: string; prio: Prio; assunto: string; com: { nome: string; pa: number } | null; aberto: number; resta: number; pai: boolean };
export type Foto = {
  minuto: number; relogio: string; hora: number; cenario: Cenario; alterado: boolean;
  analistas: AnalistaFoto[]; filas: Record<Canal, FilaFoto>;
  n2: { chamados: ChamadoN2[]; fila: number; noPrazo: number; atrasados: number };
  dia: {
    recebidos: number; atendidos: number; abandonos: number; ns: number | null; abandono: number | null; esperaMedia: number | null; tma: number | null;
    fcr: number | null; csat: number | null; csatN: number; escalados: number; desviados: number; chegadasHora: number[]; previstoHora: number[];
  };
  /** contatos dos últimos 30 minutos, no total e por assunto */
  recente: { total: number; porCat: number[] };
  surto: { tipo: TipoCrise; rotulo: string; resta: number; cat: number | null } | null;
  incidente: { cat: number; cod: string; desde: number } | null;
  suspeita: { cat: number; desde: number; n: number; normal: number } | null;
  feed: Evento[];
};

export const codigo = (id: number) => `INC${String(4821000 + id).padStart(7, '0')}`;
export const relogio = (min: number) => { const m = Math.max(0, Math.floor(min)); return `${String(ABRE + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

export class Motor {
  minuto = 0;
  tickets: Ticket[] = [];
  analistas: Analista[] = [];
  /** contatos que acabaram de sair (para a cena 3D animar a saída) */
  saidas: { id: number; tipo: 'resolvido' | 'abandono' }[] = [];
  private s = 3;
  /** Semente dos sorteios: a mesma semente dá sempre o mesmo dia. */
  static SEMENTE = 3;
  private seq = 0;
  private evSeq = 0;
  private params: Omit<Cenario, 'n1' | 'n2'> = { volume: ATUAL.volume, tma: ATUAL.tma, fcr: ATUAL.fcr, autoatendimento: ATUAL.autoatendimento, segunda: ATUAL.segunda };
  private filas: Record<Canal, EstatFila> = { telefone: filaZero(), chat: filaZero(), portal: filaZero() };
  private dia = { escalados: 0, n2NoPrazo: 0, n2Atrasados: 0, desviados: 0, chegadasHora: [] as number[] };
  private recentes: { t: number; cat: number }[] = [];
  private surto: { tipo: TipoCrise; cat: number | null; ate: number; fator: number } | null = null;
  private incidente: { cat: number; cod: string; desde: number } | null = null;
  /** assunto que disparou (com histerese: liga em 2,2× o normal, desliga abaixo de 1,4×) */
  private suspeita: { cat: number; desde: number } | null = null;
  private feed: Evento[] = [];
  private proximaAmostra = 0;
  private picoJanela: Record<Canal, number> = { telefone: 0, chat: 0, portal: 0 };
  private chaveInicial = '';

  constructor(aquecer = true) { this.iniciar(aquecer); }

  /** Volta ao começo do dia de hoje, com a escala planejada. */
  iniciar(aquecer = true) {
    this.s = Motor.SEMENTE; this.seq = 0; this.evSeq = 0; this.minuto = 0; this.tickets = []; this.saidas = []; this.feed = []; this.recentes = [];
    this.surto = null; this.incidente = null; this.suspeita = null; this.proximaAmostra = 0;
    this.params = { volume: ATUAL.volume, tma: ATUAL.tma, fcr: ATUAL.fcr, autoatendimento: ATUAL.autoatendimento, segunda: ATUAL.segunda };
    this.filas = { telefone: filaZero(), chat: filaZero(), portal: filaZero() };
    this.dia = { escalados: 0, n2NoPrazo: 0, n2Atrasados: 0, desviados: 0, chegadasHora: Array(DIA_MIN / 60).fill(0) };
    const novo = (nome: string, nivel: 1 | 2, idx: number, logado: boolean): Analista => ({
      nome, nivel, idx, canais: new Set(nivel === 1 ? HABILIDADES[idx] : []), escalado: logado, pa: logado ? idx : null, estado: logado ? 'livre' : 'fora', motivo: null, desde: 0, ticket: null, estouroAvisado: false,
      atend: 0, somaTma: 0, fcrOk: 0, csatBom: 0, csatN: 0, tLivre: 0, tAtend: 0, tPausa: 0, linha: [{ de: 0, ate: null, estado: logado ? 'livre' : 'fora' }],
    });
    this.analistas = [...NOMES_N1.map((n, i) => novo(n, 1, i, i < ATUAL.n1)), ...NOMES_N2.map((n, i) => novo(n, 2, i, i < ATUAL.n2))];
    BACKLOG.forEach(([escalou, prio, cat]) => this.tickets.push({ id: this.seq++, canal: 'telefone', cat, estado: 'fila2', chegou: escalou - 15, paciencia: null, com: null, inicio: 0, fim: 0, prio, escalou, prazo: escalou + SLA_PRIO[prio] * 60 }));
    this.chaveInicial = this.chaveEquipe();
    if (aquecer) { this.avancar(INICIO); this.saidas = []; }
  }

  /* ---------------- sorteios ---------------- */
  private rnd() { return (this.s = (this.s * 16807) % 2147483647) / 2147483647; }
  private expo(media: number) { return -Math.log(1 - this.rnd() * 0.9999) * media; }
  private sortear(pesos: number[]) { let x = this.rnd(); for (let i = 0; i < pesos.length; i++) { x -= pesos[i]; if (x < 0) return i; } return pesos.length - 1; }

  /* ---------------- leitura ---------------- */
  get cenario(): Cenario { return { ...this.params, n1: this.logados(1), n2: this.logados(2) }; }
  logados(nivel: 1 | 2) { return this.analistas.filter((a) => a.nivel === nivel && (a.estado === 'livre' || a.estado === 'atendendo')).length; }
  private achar(nome: string) { return this.analistas.find((a) => a.nome === nome); }
  private paLivre(nivel: 1 | 2) { return Array.from({ length: MAX_PA[nivel] }, (_, i) => i).find((i) => !this.analistas.some((a) => a.nivel === nivel && a.pa === i)); }
  private chaveEquipe() { return this.analistas.map((a) => `${a.nome}.${a.pa}.${a.estado === 'atendendo' ? 'livre' : a.estado}.${[...a.canais].sort().join('')}`).join('|'); }
  private registrar(tipo: Evento['tipo'], texto: string) { this.feed.unshift({ id: this.evSeq++, min: this.minuto, tipo, texto }); if (this.feed.length > 60) this.feed.length = 60; }
  /** Anota no histórico uma ação aplicada pelo copiloto. */
  anotar(texto: string) { this.registrar('copiloto', texto); }

  /* ---------------- comandos da coordenação ---------------- */
  private mudar(a: Analista, estado: EstadoAnalista, motivo: Motivo | null = null) {
    if (a.ticket && estado !== 'atendendo') { // o contato volta para a fila de onde veio
      a.ticket.estado = a.nivel === 1 ? 'fila' : 'fila2'; a.ticket.com = null; a.ticket = null;
    }
    if (a.estado !== estado) {
      const ult = a.linha[a.linha.length - 1];
      if (ult) ult.ate = this.minuto;
      a.linha.push({ de: this.minuto, ate: null, estado });
      a.desde = this.minuto;
    }
    a.estado = estado; a.motivo = motivo; a.estouroAvisado = false;
  }
  logar(nome: string, pa?: number) {
    const a = this.achar(nome);
    if (!a || a.pa !== null) return false;
    const livre = pa !== undefined && !this.analistas.some((x) => x.nivel === a.nivel && x.pa === pa) ? pa : this.paLivre(a.nivel);
    if (livre === undefined) return false;
    a.pa = livre; this.mudar(a, 'livre');
    this.registrar('equipe', `${a.nome} logou na PA ${numPa(a.nivel, livre)}.`);
    return true;
  }
  deslogar(nome: string) {
    const a = this.achar(nome);
    if (!a || a.pa === null) return;
    this.registrar('equipe', `${a.nome} deslogou da PA ${numPa(a.nivel, a.pa)}.`);
    a.pa = null; this.mudar(a, 'fora');
  }
  pausar(nome: string, motivo: Motivo) {
    const a = this.achar(nome);
    if (!a || a.pa === null) return;
    this.mudar(a, 'pausa', motivo);
    this.registrar('equipe', `${a.nome} entrou em pausa (${MOTIVOS[motivo].rotulo.toLowerCase()}).`);
  }
  voltar(nome: string) {
    const a = this.achar(nome);
    if (!a || a.estado !== 'pausa') return;
    this.registrar('equipe', `${a.nome} voltou da pausa depois de ${Math.round(this.minuto - a.desde)} min.`);
    this.mudar(a, 'livre');
  }
  alternarCanal(nome: string, canal: Canal) {
    const a = this.achar(nome);
    if (!a || a.nivel !== 1) return;
    if (a.canais.has(canal)) a.canais.delete(canal); else a.canais.add(canal);
    this.registrar('fila', `${a.nome} ${a.canais.has(canal) ? 'passou a atender' : 'deixou de atender'} ${CANAIS[canal].rotulo.toLowerCase()}.`);
  }
  /** Leva o número de logados de um nível até o alvo: volta quem está em pausa, depois entra quem está fora; sai quem entrou por último. */
  ajustarLogados(nivel: 1 | 2, alvo: number) {
    for (let g = 0; g < 30 && this.logados(nivel) < alvo; g++) {
      const pausa = this.analistas.find((a) => a.nivel === nivel && a.estado === 'pausa');
      if (pausa) { this.voltar(pausa.nome); continue; }
      const fora = this.analistas.find((a) => a.nivel === nivel && a.pa === null);
      if (!fora || !this.logar(fora.nome)) break;
    }
    for (let g = 0; g < 30 && this.logados(nivel) > alvo; g++) {
      const ult = [...this.analistas].reverse().find((a) => a.nivel === nivel && (a.estado === 'livre' || a.estado === 'atendendo'));
      if (!ult) break;
      this.deslogar(ult.nome);
    }
  }
  setParam<K extends keyof Omit<Cenario, 'n1' | 'n2'>>(k: K, v: Cenario[K]) { this.params = { ...this.params, [k]: v }; }

  /** Treino de crise: provoca um problema para a coordenação resolver. */
  injetar(tipo: TipoCrise) {
    if (tipo === 'faltas') {
      const saem = [...this.analistas].reverse().filter((a) => a.nivel === 1 && a.pa !== null).slice(0, 2);
      saem.forEach((a) => { a.pa = null; this.mudar(a, 'fora'); });
      this.registrar('crise', `Treino de crise: ${saem.map((a) => a.nome).join(' e ')} saíram da operação.`);
      return;
    }
    this.surto = tipo === 'vpn' ? { tipo, cat: CATEGORIAS.indexOf('VPN'), ate: this.minuto + 90, fator: 0.9 } : { tipo, cat: null, ate: this.minuto + 60, fator: 0.6 };
    this.registrar('crise', `Treino de crise: ${CRISES[tipo].rotulo.toLowerCase()} começou.`);
  }
  /** Declara incidente para um assunto: aviso na URA e no portal desvia contatos, roteiro pronto encurta o atendimento e um chamado pai P1 vai para o N2. */
  declararIncidente(cat: number) {
    if (this.incidente) return;
    const id = this.seq++;
    this.incidente = { cat, cod: codigo(id), desde: this.minuto };
    this.tickets.push({ id, canal: 'telefone', cat, estado: 'fila2', chegou: this.minuto, paciencia: null, com: null, inicio: 0, fim: 0, prio: 1, escalou: this.minuto, prazo: this.minuto + SLA_PRIO[1] * 60, pai: true });
    this.registrar('crise', `Incidente ${codigo(id)} declarado: ${CATEGORIAS[cat]}. Aviso publicado na URA e no portal.`);
  }

  /* ---------------- o relógio ---------------- */
  avancar(min: number) {
    let resto = min;
    while (resto > 1e-9) { const d = Math.min(0.2, resto); this.passo(d); resto -= d; }
  }

  private chegar(cat: number) {
    const t = this.minuto;
    const canal = ORDEM_CANAIS[this.sortear(ORDEM_CANAIS.map((c) => CANAIS[c].mix))];
    const pac = CANAIS[canal].paciencia;
    this.tickets.push({ id: this.seq++, canal, cat, estado: 'fila', chegou: t, paciencia: pac === null ? null : this.expo(pac), com: null, inicio: 0, fim: 0, prio: 3, escalou: 0, prazo: 0 });
    this.filas[canal].recebidos++;
    this.dia.chegadasHora[Math.min(this.dia.chegadasHora.length - 1, Math.floor(t / 60))]++;
    this.recentes.push({ t, cat });
  }

  private avaliar(a: Analista, fila: EstatFila | null, pBom: number) {
    if (this.rnd() > 0.4) return; // nem todo mundo responde a pesquisa
    const bom = this.rnd() < pBom ? 1 : 0;
    a.csatN++; a.csatBom += bom;
    if (fila) { fila.csatN++; fila.csatBom += bom; }
  }

  private passo(d: number) {
    this.minuto += d;
    if (this.minuto >= DIA_MIN) this.novoDia();
    const t = this.minuto;
    const c = this.cenario;
    for (const a of this.analistas) {
      if (a.estado === 'livre') a.tLivre += d; else if (a.estado === 'atendendo') a.tAtend += d; else if (a.estado === 'pausa') a.tPausa += d;
      if (a.estado === 'pausa' && a.motivo && !a.estouroAvisado && t - a.desde > MOTIVOS[a.motivo].limite) {
        a.estouroAvisado = true;
        this.registrar('equipe', `${a.nome} passou do limite da pausa (${MOTIVOS[a.motivo].rotulo.toLowerCase()}, ${MOTIVOS[a.motivo].limite} min).`);
      }
    }
    // maior tamanho de cada fila em janelas de 5 minutos
    for (const k of ORDEM_CANAIS) this.picoJanela[k] = Math.max(this.picoJanela[k], this.tickets.reduce((n, x) => n + (x.estado === 'fila' && x.canal === k ? 1 : 0), 0));
    if (t >= this.proximaAmostra) {
      this.proximaAmostra = Math.floor(t / 5) * 5 + 5;
      for (const k of ORDEM_CANAIS) { this.filas[k].hist.push(this.picoJanela[k]); this.picoJanela[k] = 0; }
    }
    while (this.recentes.length && this.recentes[0].t < t - 30) this.recentes.shift();
    this.vigiarAssuntos(t);
    if (this.surto && t >= this.surto.ate) { this.registrar('crise', `${CRISES[this.surto.tipo].rotulo} terminou.`); this.surto = null; }

    // chegadas (Poisson): em cada passo curto, chance de chegada = taxa × tempo
    const taxa = chegadas(c)[Math.min(DIA_MIN / 60 - 1, Math.floor(t / 60))] / 60;
    if (this.tickets.length < 400 && this.rnd() < taxa * d) this.chegar(this.sortear(PESO_CATEGORIAS));
    if (this.surto && this.tickets.length < 400 && this.rnd() < taxa * this.surto.fator * d) {
      const cat = this.surto.cat ?? this.sortear(PESO_CATEGORIAS);
      // com o incidente declarado, o aviso na URA e no portal segura boa parte de quem ia ligar
      if (this.incidente && this.incidente.cat === cat && this.rnd() < 0.6) this.dia.desviados++;
      else this.chegar(cat);
    }

    // fim de atendimento
    for (const a of this.analistas) {
      const k = a.ticket;
      if (!k || t < k.fim) continue;
      a.ticket = null; a.atend++; a.somaTma += k.fim - k.inicio;
      this.mudar(a, 'livre');
      if (a.nivel === 1) {
        const f = this.filas[k.canal];
        f.somaTma += k.fim - k.inicio; f.nTma++;
        const doIncidente = this.incidente?.cat === k.cat;
        const pFcr = doIncidente ? 0.97 : Math.min(0.98, Math.max(0.2, (c.fcr + PERFIL_N1[a.idx][1]) / 100));
        if (this.rnd() < pFcr) {
          a.fcrOk++;
          const excesso = Math.max(0, (k.inicio - k.chegou) / CANAIS[k.canal].alvo - 1);
          this.avaliar(a, f, Math.max(0.4, 0.9 - 0.1 * excesso));
          this.saidas.push({ id: k.id, tipo: 'resolvido' });
          this.tickets.splice(this.tickets.indexOf(k), 1);
        } else {
          k.estado = 'fila2'; k.com = null; this.dia.escalados++;
          k.prio = (this.sortear([0.02, 0.16, 0.66, 0.16]) + 1) as Prio;
          k.escalou = t; k.prazo = t + SLA_PRIO[k.prio] * 60;
        }
      } else {
        const noPrazo = t <= k.prazo;
        if (noPrazo) this.dia.n2NoPrazo++; else this.dia.n2Atrasados++;
        this.avaliar(a, null, noPrazo ? 0.86 : 0.45);
        if (k.pai && this.incidente) {
          this.registrar('crise', `Incidente ${this.incidente.cod} resolvido pelo N2 (${a.nome}). A causa foi corrigida e os contatos voltam ao normal.`);
          const cat = this.incidente.cat;
          this.recentes = this.recentes.filter((r) => r.cat !== cat); // o pico já foi tratado: não reabrir o alerta
          this.incidente = null; if (this.surto?.tipo === 'vpn') this.surto = null;
        }
        this.saidas.push({ id: k.id, tipo: 'resolvido' });
        this.tickets.splice(this.tickets.indexOf(k), 1);
      }
    }
    // desistência e chamados que vencem
    for (let i = this.tickets.length - 1; i >= 0; i--) {
      const k = this.tickets[i];
      if (k.estado === 'fila' && k.paciencia !== null && t - k.chegou > k.paciencia) {
        this.filas[k.canal].abandonos++;
        this.saidas.push({ id: k.id, tipo: 'abandono' });
        this.tickets.splice(i, 1);
      } else if ((k.estado === 'fila2' || k.estado === 'n2') && !k.vencidoAvisado && t > k.prazo && k.escalou >= 0) {
        k.vencidoAvisado = true;
        this.registrar('n2', `${codigo(k.id)} (P${k.prio}, ${CATEGORIAS[k.cat]}) passou do prazo.`);
      }
    }
    if (this.saidas.length > 80) this.saidas.splice(0, this.saidas.length - 80);

    // N1: quem está livre há mais tempo pega o contato mais urgente entre os canais que atende
    const livres1 = this.analistas.filter((a) => a.nivel === 1 && a.estado === 'livre').sort((a, b) => a.desde - b.desde);
    for (const a of livres1) {
      let melhor: Ticket | null = null, urg = -1;
      for (const k of this.tickets) {
        if (k.estado !== 'fila' || !a.canais.has(k.canal)) continue;
        const u = (t - k.chegou) / CANAIS[k.canal].alvo;
        if (u > urg) { urg = u; melhor = k; }
      }
      if (!melhor) continue;
      const k = melhor, f = this.filas[k.canal], espera = t - k.chegou;
      const media = tmaEfetivo(c) * CANAIS[k.canal].tma * PERFIL_N1[a.idx][0] * (this.incidente?.cat === k.cat ? 0.5 : 1);
      k.estado = 'n1'; k.com = a.nome; k.inicio = t; k.fim = t + this.expo(media);
      a.ticket = k; this.mudar(a, 'atendendo');
      f.atendidos++; f.somaEspera += espera;
      if (espera <= CANAIS[k.canal].alvo) f.noAlvo++;
    }
    // N2: o que vence primeiro sai primeiro
    const livres2 = this.analistas.filter((a) => a.nivel === 2 && a.estado === 'livre').sort((a, b) => a.desde - b.desde);
    if (livres2.length) {
      const fila2 = this.tickets.filter((k) => k.estado === 'fila2').sort((a, b) => a.prazo - b.prazo);
      for (const a of livres2) {
        const k = fila2.shift();
        if (!k) break;
        k.estado = 'n2'; k.com = a.nome; k.inicio = t; k.fim = t + this.expo(TMA_N2 * PERFIL_N2[a.idx] * (k.pai ? 2 : 1));
        a.ticket = k; this.mudar(a, 'atendendo');
      }
    }
  }

  /** Um assunto com muito mais contatos que o normal em 30 minutos costuma ser incidente. */
  private vigiarAssuntos(t: number) {
    const esperado = (k: number) => Math.max(1, (chegadas(this.cenario)[Math.min(DIA_MIN / 60 - 1, Math.floor(t / 60))] / 2) * PESO_CATEGORIAS[k]);
    const n = (k: number) => this.recentes.reduce((s, r) => s + (r.cat === k ? 1 : 0), 0);
    if (this.incidente) { this.suspeita = null; return; }
    if (this.suspeita) {
      const k = this.suspeita.cat;
      if (n(k) < 5 || n(k) < 1.4 * esperado(k)) this.suspeita = null;
      return;
    }
    for (let k = 0; k < PESO_CATEGORIAS.length; k++) if (n(k) >= 8 && n(k) >= 2.2 * esperado(k)) { this.suspeita = { cat: k, desde: t }; return; }
  }

  private novoDia() {
    this.minuto -= DIA_MIN;
    this.filas = { telefone: filaZero(), chat: filaZero(), portal: filaZero() };
    this.dia = { escalados: 0, n2NoPrazo: 0, n2Atrasados: 0, desviados: 0, chegadasHora: Array(DIA_MIN / 60).fill(0) };
    this.recentes = []; this.surto = null; this.suspeita = null; this.proximaAmostra = 0; this.feed = [];
    // as filas do N1 não passam a noite; os chamados do N2 sim
    for (const k of this.tickets) if (k.estado === 'fila' || k.estado === 'n1') this.saidas.push({ id: k.id, tipo: 'abandono' });
    this.tickets = this.tickets.filter((k) => k.estado === 'fila2' || k.estado === 'n2');
    this.tickets.forEach((k) => { k.chegou -= DIA_MIN; k.escalou -= DIA_MIN; k.prazo -= DIA_MIN; k.inicio -= DIA_MIN; k.fim -= DIA_MIN; });
    if (this.incidente) this.incidente.desde -= DIA_MIN;
    for (const a of this.analistas) {
      if (a.nivel === 1 && a.ticket) { a.ticket = null; a.estado = 'livre'; }
      a.desde = Math.min(0, a.desde - DIA_MIN);
      Object.assign(a, { atend: 0, somaTma: 0, fcrOk: 0, csatBom: 0, csatN: 0, tLivre: 0, tAtend: 0, tPausa: 0 });
      a.linha = [{ de: 0, ate: null, estado: a.estado }];
    }
    this.registrar('equipe', 'Começou um novo dia: os indicadores do dia foram zerados.');
  }

  /* ---------------- foto para as telas ---------------- */
  foto(): Foto {
    const t = this.minuto, c = this.cenario;
    const div = (a: number, b: number) => (b > 0 ? a / b : null);
    const analistas: AnalistaFoto[] = this.analistas.map((a) => ({
      nome: a.nome, nivel: a.nivel, canais: ORDEM_CANAIS.filter((k) => a.canais.has(k)), escalado: a.escalado, pa: a.pa, estado: a.estado, motivo: a.motivo,
      noEstado: t - a.desde, estouro: a.estado === 'pausa' && a.motivo ? Math.max(0, t - a.desde - MOTIVOS[a.motivo].limite) : 0,
      ticket: a.ticket ? { cod: codigo(a.ticket.id), canal: a.ticket.canal, assunto: CATEGORIAS[a.ticket.cat] } : null,
      atend: a.atend, tma: div(a.somaTma, a.atend), fcr: a.nivel === 1 ? div(a.fcrOk, a.atend) : null, csat: div(a.csatBom, a.csatN), csatN: a.csatN,
      ocupacao: div(a.tAtend, a.tAtend + a.tLivre), pausaDia: a.tPausa, linha: a.linha.map((s) => ({ ...s })),
    }));
    const filas = {} as Record<Canal, FilaFoto>;
    const tot = filaZero();
    for (const k of ORDEM_CANAIS) {
      const f = this.filas[k], esp = this.tickets.filter((x) => x.estado === 'fila' && x.canal === k);
      const hab = this.analistas.filter((a) => a.nivel === 1 && a.canais.has(k));
      filas[k] = {
        canal: k, esperando: esp.length, maiorEspera: esp.reduce((m, x) => Math.max(m, t - x.chegou), 0), emAtendimento: this.tickets.filter((x) => x.estado === 'n1' && x.canal === k).length,
        habilitados: hab.filter((a) => a.estado === 'livre' || a.estado === 'atendendo').length, livres: hab.filter((a) => a.estado === 'livre').length,
        recebidos: f.recebidos, atendidos: f.atendidos, abandonos: f.abandonos, ns: div(f.noAlvo, f.atendidos + f.abandonos), abandono: div(f.abandonos, f.atendidos + f.abandonos),
        esperaMedia: div(f.somaEspera, f.atendidos), tma: div(f.somaTma, f.nTma), csat: div(f.csatBom, f.csatN), hist: f.hist.slice(),
      };
      (['recebidos', 'atendidos', 'noAlvo', 'abandonos', 'somaEspera', 'somaTma', 'nTma'] as const).forEach((x) => { tot[x] += f[x]; });
    }
    const n1 = this.analistas.filter((a) => a.nivel === 1);
    const soma = (f: (a: Analista) => number, l = this.analistas) => l.reduce((s, a) => s + f(a), 0);
    const porCat = CATEGORIAS.map((_, i) => this.recentes.filter((r) => r.cat === i).length);
    return {
      minuto: t, relogio: relogio(t), hora: Math.min(DIA_MIN / 60 - 1, Math.floor(t / 60)), cenario: c,
      alterado: (Object.keys(ATUAL) as (keyof Cenario)[]).some((k) => c[k] !== ATUAL[k]) || this.chaveEquipe() !== this.chaveInicial || !!this.surto || !!this.incidente,
      analistas, filas,
      n2: {
        chamados: this.tickets.filter((k) => k.estado === 'fila2' || k.estado === 'n2').sort((a, b) => a.prazo - b.prazo).map((k) => {
          const a = k.com ? this.achar(k.com) : undefined;
          return { cod: codigo(k.id), prio: k.prio, assunto: CATEGORIAS[k.cat], com: a && a.pa !== null ? { nome: a.nome, pa: a.pa } : null, aberto: t - k.escalou, resta: k.prazo - t, pai: !!k.pai };
        }),
        fila: this.tickets.filter((k) => k.estado === 'fila2').length, noPrazo: this.dia.n2NoPrazo, atrasados: this.dia.n2Atrasados,
      },
      dia: {
        recebidos: tot.recebidos, atendidos: tot.atendidos, abandonos: tot.abandonos, ns: div(tot.noAlvo, tot.atendidos + tot.abandonos), abandono: div(tot.abandonos, tot.atendidos + tot.abandonos),
        esperaMedia: div(tot.somaEspera, tot.atendidos), tma: div(tot.somaTma, tot.nTma), fcr: div(soma((a) => a.fcrOk, n1), soma((a) => a.atend, n1)),
        csat: div(soma((a) => a.csatBom), soma((a) => a.csatN)), csatN: soma((a) => a.csatN), escalados: this.dia.escalados, desviados: this.dia.desviados,
        chegadasHora: this.dia.chegadasHora.slice(), previstoHora: chegadas({ ...ATUAL, segunda: c.segunda }),
      },
      recente: { total: this.recentes.length, porCat },
      surto: this.surto ? { tipo: this.surto.tipo, rotulo: CRISES[this.surto.tipo].rotulo, resta: this.surto.ate - t, cat: this.surto.cat } : null,
      incidente: this.incidente ? { ...this.incidente } : null,
      suspeita: this.suspeita ? { ...this.suspeita, n: porCat[this.suspeita.cat], normal: Math.max(1, Math.round((chegadas(c)[Math.min(DIA_MIN / 60 - 1, Math.floor(t / 60))] / 2) * PESO_CATEGORIAS[this.suspeita.cat])) } : null,
      feed: this.feed.slice(0, 40),
    };
  }
}

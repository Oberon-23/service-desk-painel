/*
 * Copiloto da coordenação: regras que leem a foto da operação e o modelo de fila e
 * propõem a próxima ação, com um clique para aplicar. Não é IA generativa: cada sugestão
 * vem de uma regra explícita, descrita em docs/DESIGN.md.
 */
import { CATEGORIAS, chegadas, minimoN1, tmaEfetivo } from '../fila';
import { CANAIS, MAX_PA, MOTIVOS, ORDEM_CANAIS, type AnalistaFoto, type Canal, type Foto, type Motivo, type Motor } from './motor';

export type Comando =
  | { t: 'voltar'; nome: string }
  | { t: 'canal'; nome: string; canal: Canal }
  | { t: 'logar'; nome: string }
  | { t: 'pausar'; nome: string; motivo: Motivo }
  | { t: 'incidente'; cat: number };
export type Rota = '/filas' | '/analistas' | '/planejamento';
export type Sugestao = { id: string; nivel: 'bad' | 'warn' | 'info'; titulo: string; texto: string; acao?: { rotulo: string; cmd: Comando }; ver?: Rota };

const min = (x: number) => `${Math.max(1, Math.round(x))} min`;
const ADIAVEIS: Motivo[] = ['treinamento', 'feedback', 'descanso'];
const ativo = (a: AnalistaFoto) => a.estado === 'livre' || a.estado === 'atendendo';

/** Quantos analistas no N1 a hora pede para a meta, pelo modelo de fila. */
export function precisaNaHora(f: Foto, hora = f.hora) {
  return minimoN1(chegadas(f.cenario)[hora] * (f.surto ? 1 + (f.surto.tipo === 'vpn' ? (f.incidente ? 0.36 : 0.9) : 0.6) : 1), tmaEfetivo(f.cenario));
}

export function sugerir(f: Foto): Sugestao[] {
  const r: Sugestao[] = [];
  const usados = new Set<string>();
  const n1 = f.analistas.filter((a) => a.nivel === 1);
  const paLivre = (nivel: 1 | 2) => f.analistas.filter((a) => a.nivel === nivel && a.pa !== null).length < MAX_PA[nivel];
  const reserva = (nivel: 1 | 2) => f.analistas.find((a) => a.nivel === nivel && a.pa === null && !a.escalado && !usados.has(a.nome)) ?? f.analistas.find((a) => a.nivel === nivel && a.pa === null && !usados.has(a.nome));

  // 1. muitos contatos do mesmo assunto em pouco tempo: provável incidente
  if (f.suspeita) {
    const { cat: i, n, normal } = f.suspeita;
    r.push({ id: `surto-${i}`, nivel: 'bad', titulo: `Possível incidente: ${CATEGORIAS[i]}`, texto: `${n} contatos sobre ${CATEGORIAS[i]} em 30 min (${Math.round((n / Math.max(1, f.recente.total)) * 100)}% do volume; o normal seria perto de ${normal}). Declarar o incidente publica o aviso na URA e no portal, dá um roteiro ao N1 e abre o chamado pai no N2.`, acao: { rotulo: 'Declarar incidente', cmd: { t: 'incidente', cat: i } } });
  }
  if (f.incidente) {
    const pai = f.n2.chamados.find((k) => k.pai);
    r.push({ id: 'incidente', nivel: 'warn', titulo: `Incidente ${f.incidente.cod} em andamento: ${CATEGORIAS[f.incidente.cat]}`, texto: `${f.dia.desviados} contatos já foram segurados pelo aviso. Chamado pai ${pai?.com ? `com ${pai.com.nome}` : 'na fila do N2'}${pai ? `, ${pai.resta < 0 ? `vencido há ${min(-pai.resta)}` : `vence em ${min(pai.resta)}`}` : ''}.`, ver: '/filas' });
  }

  // 2 e 3. chamados do N2
  for (const k of f.n2.chamados.filter((x) => x.prio === 1 && !x.pai)) {
    r.push({ id: `p1-${k.cod}`, nivel: 'bad', titulo: `Chamado P1 aberto: ${k.assunto}`, texto: `${k.cod} ${k.com ? `com ${k.com.nome}` : 'ainda na fila'}; ${k.resta < 0 ? `vencido há ${min(-k.resta)}` : `vence em ${min(k.resta)}`}.`, ver: '/filas' });
  }
  const vencidos = f.n2.chamados.filter((x) => x.resta < 0);
  if (vencidos.length) r.push({ id: 'vencidos', nivel: 'bad', titulo: `${vencidos.length} ${vencidos.length === 1 ? 'chamado vencido' : 'chamados vencidos'} no N2`, texto: `O mais antigo venceu há ${min(-vencidos[0].resta)} (${vencidos[0].cod}).`, ver: '/filas' });

  // 4. pausa acima do limite
  for (const a of f.analistas.filter((x) => x.estouro > 0)) {
    usados.add(a.nome);
    r.push({ id: `pausa-${a.nome}`, nivel: 'bad', titulo: `${a.nome} passou do limite da pausa`, texto: `${MOTIVOS[a.motivo!].rotulo}: ${min(a.noEstado)} de ${MOTIVOS[a.motivo!].limite} min.`, acao: { rotulo: `Chamar ${a.nome} de volta`, cmd: { t: 'voltar', nome: a.nome } } });
  }

  // 5. fila de um canal apertada: quem pode ajudar agora?
  for (const k of ORDEM_CANAIS) {
    const q = f.filas[k], c = CANAIS[k];
    if (!(q.esperando >= 3 && q.maiorEspera > c.alvo * (k === 'portal' ? 1 : 1.5))) continue;
    const livre = n1.find((a) => a.estado === 'livre' && !a.canais.includes(k) && !usados.has(a.nome));
    const pausa = n1.find((a) => a.estado === 'pausa' && a.canais.includes(k) && a.motivo && ADIAVEIS.includes(a.motivo) && !usados.has(a.nome));
    const fora = paLivre(1) ? reserva(1) : undefined;
    const base = `${q.esperando} esperando no ${c.rotulo.toLowerCase()}, o mais antigo há ${min(q.maiorEspera)} (alvo ${c.alvo} min).`;
    let acao: Sugestao['acao'];
    let texto = `${base} Ninguém disponível para reforçar agora.`;
    if (livre) { usados.add(livre.nome); texto = `${base} ${livre.nome} está livre e não atende esse canal.`; acao = { rotulo: `Habilitar ${livre.nome} no ${c.rotulo.toLowerCase()}`, cmd: { t: 'canal', nome: livre.nome, canal: k } }; }
    else if (pausa) { usados.add(pausa.nome); texto = `${base} ${pausa.nome} está em ${MOTIVOS[pausa.motivo!].rotulo.toLowerCase()}, que dá para adiar.`; acao = { rotulo: `Chamar ${pausa.nome} de volta`, cmd: { t: 'voltar', nome: pausa.nome } }; }
    else if (fora) { usados.add(fora.nome); texto = `${base} ${fora.nome} está fora e pode entrar.`; acao = { rotulo: `Logar ${fora.nome}`, cmd: { t: 'logar', nome: fora.nome } }; }
    r.push({ id: `fila-${k}`, nivel: 'warn', titulo: `Fila do ${c.rotulo.toLowerCase()} acima do alvo`, texto, acao, ver: '/filas' });
  }

  // 6. gente da escala que não está logada
  for (const nivel of [1, 2] as const) {
    const faltam = f.analistas.filter((a) => a.nivel === nivel && a.escalado && a.pa === null);
    if (!faltam.length) continue;
    const sub = f.analistas.find((a) => a.nivel === nivel && a.pa === null && !a.escalado && !usados.has(a.nome));
    if (sub) usados.add(sub.nome);
    r.push({ id: `ausentes-${nivel}`, nivel: 'warn', titulo: `${faltam.length} ${faltam.length === 1 ? 'pessoa' : 'pessoas'} da escala do N${nivel} fora da operação`, texto: `${faltam.map((a) => a.nome).join(', ')}.${sub ? ` ${sub.nome} não estava na escala e pode cobrir.` : ''}`, acao: sub ? { rotulo: `Logar ${sub.nome} para cobrir`, cmd: { t: 'logar', nome: sub.nome } } : undefined, ver: '/analistas' });
  }

  // 7. o modelo de fila pede mais gente do que há logada
  const logados = n1.filter(ativo).length;
  const horas = f.minuto % 60 >= 30 && f.hora + 1 < f.dia.previstoHora.length ? [f.hora, f.hora + 1] : [f.hora];
  for (const h of horas) {
    const precisa = precisaNaHora(f, h);
    if (precisa <= logados) continue;
    const pausa = n1.find((a) => a.estado === 'pausa' && !usados.has(a.nome));
    const fora = paLivre(1) ? reserva(1) : undefined;
    const quem = pausa ?? fora;
    if (quem) usados.add(quem.nome);
    r.push({
      id: `previsao-${h}`, nivel: 'warn', titulo: h === f.hora ? `Esta hora pede ${precisa} analistas no N1` : `Às ${8 + h}h a previsão pede ${precisa} analistas no N1`,
      texto: `Há ${logados} atendendo. Pelo modelo de fila, faltam ${precisa - logados} para manter 80% em até 60 s.`,
      acao: pausa ? { rotulo: `Chamar ${pausa.nome} de volta`, cmd: { t: 'voltar', nome: pausa.nome } } : fora ? { rotulo: `Logar ${fora.nome}`, cmd: { t: 'logar', nome: fora.nome } } : undefined, ver: '/planejamento',
    });
    break;
  }

  // 8. folga: bom momento para feedback
  const esperando = ORDEM_CANAIS.reduce((s, k) => s + f.filas[k].esperando, 0);
  const livres = n1.filter((a) => a.estado === 'livre' && !usados.has(a.nome));
  const lento = n1.filter((a) => a.atend >= 8 && a.tma !== null && f.dia.tma !== null && a.tma > f.dia.tma * 1.25).sort((a, b) => b.tma! - a.tma!)[0];
  if (esperando === 0 && livres.length >= 3 && precisaNaHora(f) <= logados - 2 && !f.analistas.some((a) => a.motivo === 'feedback' || a.motivo === 'treinamento')) {
    const quem = lento && livres.includes(lento) ? lento : livres[0];
    r.push({ id: 'folga', nivel: 'info', titulo: 'Janela para feedback', texto: `Fila zerada, ${livres.length} analistas livres e a hora pede ${precisaNaHora(f)} dos ${logados} logados. ${quem === lento ? `${quem.nome} tem o maior tempo de atendimento do N1.` : `Dá para tirar ${quem.nome} por 15 min sem ferir a meta.`}`, acao: { rotulo: `Feedback com ${quem.nome} agora`, cmd: { t: 'pausar', nome: quem.nome, motivo: 'feedback' } } });
  }

  // 9. quem está destoando do grupo
  if (lento) r.push({ id: `tma-${lento.nome}`, nivel: 'info', titulo: `Atendimento de ${lento.nome} mais longo que o do grupo`, texto: `Média de ${min(lento.tma!)} por contato, contra ${min(f.dia.tma!)} do N1 (${Math.round((lento.tma! / f.dia.tma! - 1) * 100)}% acima), em ${lento.atend} atendimentos. Vale acompanhar alguns contatos.`, ver: '/analistas' });

  const ordem = { bad: 0, warn: 1, info: 2 };
  return r.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

/** Executa a ação de uma sugestão e deixa registrado no histórico. */
export function aplicar(m: Motor, s: Sugestao) {
  const c = s.acao?.cmd;
  if (!c) return;
  if (c.t === 'voltar') m.voltar(c.nome);
  else if (c.t === 'canal') m.alternarCanal(c.nome, c.canal);
  else if (c.t === 'logar') m.logar(c.nome);
  else if (c.t === 'pausar') m.pausar(c.nome, c.motivo);
  else m.declararIncidente(c.cat);
  m.anotar(`Copiloto: “${s.acao!.rotulo}” aplicado pela coordenação.`);
}

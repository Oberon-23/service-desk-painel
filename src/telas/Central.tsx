import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Headset, LogOut, Maximize2, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { ATUAL, META_NS, melhorAlavanca, NOMES_N1, NOMES_N2, simular, type Cenario } from '../fila';
import { Card, Kpis, Legenda, Manchete, Segmentado } from '../kit/ui';
import type { Status } from '../kit/formato';
import { Grafico, useCores } from '../kit/graficos';
import type { Cena, CoresCena } from '../central/cena';
import { MOTIVOS, SLA_PRIO, type ChamadoN2, type Motivo, type Placar, type Posto, type Selecao } from '../central/tipos';

const MAX_PA = { 1: 14, 2: 8 } as const;
/** Número da PA na sala: N1 usa 01–14 e N2 usa 15–22. */
export const numPa = (nivel: 1 | 2, pa: number) => String(nivel === 1 ? pa + 1 : MAX_PA[1] + pa + 1).padStart(2, '0');
const POSTOS_HOJE: Posto[] = [
  ...NOMES_N1.slice(0, ATUAL.n1).map((nome, pa) => ({ nivel: 1 as const, pa, nome, estado: 'logado' as const })),
  ...NOMES_N2.slice(0, ATUAL.n2).map((nome, pa) => ({ nivel: 2 as const, pa, nome, estado: 'logado' as const })),
];
const logados = (ps: Posto[], nivel: 1 | 2) => ps.filter((p) => p.nivel === nivel && p.estado === 'logado').length;

/** Leva o número de logados de um nível até o alvo: entra quem está fora, na primeira PA livre; sai quem entrou por último. */
function ajustar(ps: Posto[], nivel: 1 | 2, alvo: number): Posto[] {
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

const pct = (x: number, d = 1) => `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const num = (x: number, d = 0) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pp = (x: number) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x * 100), 1)} p.p.`;
const tempo = (min: number) => (min < 1 ? `${num(min * 60)} s` : `${num(min, 1)} min`);
const brl = (x: number) => `R$ ${num(x, 2)}`;
const META_ABANDONO = 0.05, META_SLA_N2 = 0.9;

function Var({ v, bom, fmt }: { v: number; bom: 'sobe' | 'desce'; fmt: (x: number) => string }) {
  if (Math.abs(v) < 1e-4) return <span className="var-neutra">igual a hoje</span>;
  const melhor = bom === 'sobe' ? v > 0 : v < 0;
  return <span className={melhor ? 'var-boa' : 'var-ruim'}>{fmt(v)} vs hoje</span>;
}
const st = (ok: boolean, quase: boolean): Status => (ok ? 'ok' : quase ? 'warn' : 'bad');

export default function Central() {
  const [base, setC] = useState<Cenario>(ATUAL);
  const [postos, setPostos] = useState<Posto[]>(POSTOS_HOJE);
  // o tamanho da equipe vem de quem está logado nas PAs (quem está em pausa não atende)
  const c = useMemo(() => ({ ...base, n1: logados(postos, 1), n2: logados(postos, 2) }), [base, postos]);
  const r = useMemo(() => simular(c), [c]);
  const chave = (ps: Posto[]) => ps.map((p) => `${p.nivel}.${p.pa}.${p.nome}.${p.estado}`).sort().join('|');
  const alterado = JSON.stringify(c) !== JSON.stringify(ATUAL) || chave(postos) !== chave(POSTOS_HOJE);
  const [foco, setFoco] = useState<{ nivel: 1 | 2; pa: number; n: number } | null>(null);
  const [vivo, setVivo] = useState<{ placar: Placar; chamados: ChamadoN2[] } | null>(null);
  const mudar: Mudar = (nivel, pa, estado, nome, motivo) => setPostos((ps) => {
    const resto = ps.filter((p) => !(p.nivel === nivel && p.pa === pa) && p.nome !== nome);
    if (estado === 'fora') return resto;
    const atual = ps.find((p) => p.nivel === nivel && p.pa === pa);
    return [...resto, { nivel, pa, nome: nome ?? atual!.nome, estado, ...(estado === 'pausa' ? { motivo: motivo ?? 'descanso' } : {}) }];
  });
  const hoje = useMemo(() => simular(ATUAL), []);
  const dica = useMemo(() => melhorAlavanca(c), [c]);
  const set = <K extends keyof Cenario>(k: K, v: Cenario[K]) => {
    if (k === 'n1' || k === 'n2') setPostos((ps) => ajustar(ps, k === 'n1' ? 1 : 2, v as number));
    else setC((x) => ({ ...x, [k]: v }));
  };
  const voltar = () => { setC(ATUAL); setPostos(POSTOS_HOJE); };
  const cores = useCores();

  const ph = r.piorHora;
  const status = st(r.ns >= META_NS && ph.ns >= META_NS - 0.1, r.ns >= META_NS - 0.05);
  const titulo = r.ns >= META_NS
    ? `${pct(r.ns)} dos contatos são atendidos em até 60 s, mas às ${ph.hora}h o nível cai para ${pct(ph.ns, 0)}.`
    : `Só ${pct(r.ns)} dos contatos são atendidos em até 60 s; às ${ph.hora}h, ${pct(ph.ns, 0)}.`;

  return (
    <>
      <Manchete status={status} titulo={alterado ? `Neste cenário: ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}` : titulo}
        texto={<>
          {r.slaN2 < META_SLA_N2 ? <>O N2 resolve só {pct(r.slaN2, 0)} dos chamados escalados em até 8 horas. </> : null}
          {dica ? <>A alavanca que mais ajudaria agora: <b>{dica.nome.toLowerCase()}</b> ({pp(dica.ganho)} no nível de serviço).</> : 'O nível de serviço já está no teto deste modelo.'}
        </>} />

      <Kpis itens={[
        { label: 'Nível de serviço', tip: 'Contatos atendidos em até 60 segundos ÷ contatos recebidos.', value: pct(r.ns), target: `Meta ≥ ${pct(META_NS, 0)}`, status: st(r.ns >= META_NS, r.ns >= META_NS - 0.05), delta: <Var v={r.ns - hoje.ns} bom="sobe" fmt={pp} /> },
        { label: 'Espera média', tip: 'Tempo médio na fila até um analista atender.', value: tempo(r.espera), delta: <Var v={r.espera - hoje.espera} bom="desce" fmt={(x) => `${x > 0 ? '+' : '−'}${tempo(Math.abs(x))}`} /> },
        { label: 'Abandono', tip: 'Contatos que desistiram antes de ser atendidos.', value: pct(r.abandono), target: `Meta ≤ ${pct(META_ABANDONO, 0)}`, status: st(r.abandono <= META_ABANDONO, r.abandono <= META_ABANDONO * 1.6), delta: <Var v={r.abandono - hoje.abandono} bom="desce" fmt={pp} /> },
        { label: 'SLA do N2', tip: 'Chamados escalados resolvidos em até 8 horas úteis.', value: pct(r.slaN2, 0), target: `Meta ≥ ${pct(META_SLA_N2, 0)}`, status: st(r.slaN2 >= META_SLA_N2, r.slaN2 >= META_SLA_N2 - 0.1), delta: <Var v={r.slaN2 - hoje.slaN2} bom="sobe" fmt={pp} /> },
      ]} />

      <div className="fab-grid">
        <Card className="fab-card" titulo={<span className="tit-ic"><Headset size={18} aria-hidden="true" />Central ao vivo</span>}
          sub="Cada cubo é um contato. Azul: na fila do N1 ou em atendimento; laranja: escalado para o N2; verde: resolvido; vermelho: desistiu de esperar. Cada PA ocupada mostra quem está logado nela. Arraste para girar, use a roda do mouse ou a pinça para aproximar e clique numa mesa para ver o analista.">
          <Central3D cenario={c} postos={postos} foco={foco} onMudar={mudar} onTique={setVivo} />
        </Card>
        <Card className="fab-controles" titulo="E se…?" sub="Mude a equipe ou a demanda e compare com hoje. A animação e os números usam o mesmo modelo de fila."
          acoes={alterado ? <button type="button" className="limpar" onClick={voltar}><RotateCcw size={14} aria-hidden="true" />Voltar para hoje</button> : undefined}>
          <div className="alavancas">
            <Faixa id="n1" rotulo="Analistas logados no N1" valor={c.n1} min={0} max={14} un="" hoje={ATUAL.n1} onChange={(v) => set('n1', v)} ajuda="Atendem telefone, chat e portal. Também dá para logar cada pessoa na sua PA, abaixo." />
            <Faixa id="n2" rotulo="Analistas logados no N2" valor={c.n2} min={0} max={8} un="" hoje={ATUAL.n2} onChange={(v) => set('n2', v)} ajuda="Recebem o que o N1 não resolve." />
            <Faixa id="volume" rotulo="Volume de contatos" valor={c.volume} min={60} max={160} passo={5} un="%" hoje={ATUAL.volume} onChange={(v) => set('volume', v)} ajuda="100% = 300 contatos num dia normal." />
            <Faixa id="tma" rotulo="Tempo médio de atendimento (N1)" valor={c.tma} min={4} max={15} un="min" hoje={ATUAL.tma} onChange={(v) => set('tma', v)} ajuda="Roteiros e acesso remoto encurtam o atendimento." />
            <Faixa id="fcr" rotulo="Resolvido no primeiro contato" valor={c.fcr} min={40} max={90} un="%" hoje={ATUAL.fcr} onChange={(v) => set('fcr', v)} ajuda="O resto vai para o N2." />
            <Chave rotulo="Portal de autoatendimento" valor={c.autoatendimento} onChange={(v) => set('autoatendimento', v)} ajuda="Base de conhecimento e reset de senha sozinho: 15% menos contatos e atendimento 8% mais curto." />
            <Chave rotulo="Segunda-feira de manhã" valor={c.segunda} onChange={(v) => set('segunda', v)} ajuda="Demanda represada do fim de semana: 40% a mais das 8h às 12h." />
          </div>
        </Card>
      </div>

      <PosicoesPA postos={postos} placar={vivo?.placar ?? null} onMudar={mudar} onVer={(nivel, pa) => setFoco((f) => ({ nivel, pa, n: (f?.n ?? 0) + 1 }))} />
      <ChamadosN2Card chamados={vivo?.chamados ?? null} placar={vivo?.placar ?? null} />

      <Card titulo="Hora a hora" sub="Nível de serviço esperado em cada hora do dia. As horas abaixo da meta mostram onde reforçar a escala (veja a aba Dimensionamento).">
        <Legenda itens={[{ label: 'Na meta (≥ 80%)', cor: cores.good }, { label: 'Abaixo da meta', cor: cores.bad }, { label: 'Meta', tipo: 'tracejado' }]} />
        <Grafico rotulo="Nível de serviço por hora" altura={250} n={r.horas.length} rotulosX={r.horas.map((h) => `${h.hora}h`)}
          y={{ min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: (v) => `${num(v * 100)}%` }}
          camadas={[
            { tipo: 'barras', valores: r.horas.map((h) => h.ns), larguraMax: 44, raio: 5, cor: (i) => (r.horas[i].ns >= META_NS ? cores.good : cores.bad), rotulos: r.horas.map((h) => pct(h.ns, 0)) },
            { tipo: 'linhaH', y: META_NS, tracejado: true, rotulo: 'Meta 80%' },
          ]}
          dica={(i) => { const h = r.horas[i]; return { titulo: `${h.hora}h às ${h.hora + 1}h`, linhas: [{ nome: 'Contatos', valor: num(h.chegadas) }, { nome: 'Nível de serviço', valor: pct(h.ns) }, { nome: 'Espera média', valor: tempo(h.espera) }, { nome: 'Abandono', valor: pct(h.abandono) }, { nome: 'Ocupação dos analistas', valor: pct(h.ocupacao, 0) }] }; }} />
        <p className="card-sub" style={{ marginTop: 10 }}>
          No dia: {num(r.contatos)} contatos, {num(r.atendidos)} atendidos, {num(r.escalados)} escalados para o N2.
          Ocupação média do N1 {pct(r.ocupacao, 0)} e do N2 {pct(r.ocupacaoN2, 0)}. Custo da equipe {brl(r.custoDia)} por dia, {brl(r.custoPorContato)} por contato atendido.
        </p>
      </Card>
    </>
  );
}

function Faixa({ id, rotulo, valor, min, max, passo = 1, un, hoje, ajuda, onChange }: { id: string; rotulo: string; valor: number; min: number; max: number; passo?: number; un: string; hoje: number; ajuda: string; onChange: (v: number) => void }) {
  return (
    <div className="alavanca">
      <label htmlFor={`f-${id}`}><span>{rotulo}</span><b>{valor}{un ? ` ${un}` : ''}</b></label>
      <input id={`f-${id}`} type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => onChange(+e.target.value)} aria-describedby={`a-${id}`} />
      <small id={`a-${id}`}>{ajuda} Hoje: {hoje}{un ? ` ${un}` : ''}.</small>
    </div>
  );
}

function Chave({ rotulo, valor, ajuda, onChange }: { rotulo: string; valor: boolean; ajuda: string; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="alavanca chave">
      <button type="button" role="switch" aria-checked={valor} aria-labelledby={`${id}-r`} aria-describedby={`${id}-a`} onClick={() => onChange(!valor)} className="interruptor"><span /></button>
      <div><b id={`${id}-r`} onClick={() => onChange(!valor)}>{rotulo}</b><small id={`${id}-a`}>{ajuda}</small></div>
    </div>
  );
}

type Mudar = (nivel: 1 | 2, pa: number, estado: Posto['estado'] | 'fora', nome?: string, motivo?: Motivo) => void;
type Vivo = { placar: Placar; chamados: ChamadoN2[] };
const dur = (min: number) => { const m = Math.max(0, Math.round(min)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
/** Pausa que passou do limite do motivo, em minutos (0 se ainda está dentro). */
const estouro = (p: Posto | undefined, pausaAgora: number | null | undefined) => (p?.estado === 'pausa' && p.motivo && pausaAgora != null ? Math.max(0, pausaAgora - MOTIVOS[p.motivo].limite) : 0);
const ESCALADOS = new Set(POSTOS_HOJE.map((p) => p.nome));

function SeletorPausa({ rotulo, onPausar, className }: { rotulo: string; onPausar: (m: Motivo) => void; className?: string }) {
  return (
    <select className={className ?? 'pa-pausa'} aria-label={rotulo} value="" onChange={(e) => e.target.value && onPausar(e.target.value as Motivo)}>
      <option value="">Pausa…</option>
      {(Object.keys(MOTIVOS) as Motivo[]).map((m) => <option key={m} value={m}>{MOTIVOS[m].rotulo} (até {MOTIVOS[m].limite} min)</option>)}
    </select>
  );
}

/** Controle das posições de atendimento: quem está logado em cada PA, pausas e aderência à escala. */
function PosicoesPA({ postos, placar, onMudar, onVer }: { postos: Posto[]; placar: Placar | null; onMudar: Mudar; onVer: (nivel: 1 | 2, pa: number) => void }) {
  const pausaDe = (p: Posto) => placar?.mesas.find((m) => m.nivel === p.nivel && m.pa === p.pa)?.pausaAgora ?? null;
  const escaladosLogados = postos.filter((p) => ESCALADOS.has(p.nome) && p.estado === 'logado').length;
  const aderencia = escaladosLogados / ESCALADOS.size;
  const emPausa = postos.filter((p) => p.estado === 'pausa');
  const estouradas = emPausa.filter((p) => estouro(p, pausaDe(p)) > 0);
  const ausentes = [...ESCALADOS].filter((n) => !postos.some((p) => p.nome === n));
  const extras = postos.filter((p) => !ESCALADOS.has(p.nome)).map((p) => p.nome);
  const tempos = placar ? Object.values(placar.tempo) : [];
  const somaPausa = tempos.reduce((s, x) => s + x.pausa, 0), somaDisp = tempos.reduce((s, x) => s + x.disponivel, 0);
  const shrink = somaPausa + somaDisp > 0 ? somaPausa / (somaPausa + somaDisp) : null;

  return (
    <Card titulo="Posições de atendimento (PA)"
      sub="Logue, pause ou tire cada analista da sua PA. Quem está logado aparece com o nome na mesa da central 3D e entra na conta da fila; em pausa, a pessoa fica na PA mas não recebe contatos. Os tempos de pausa correm no relógio da simulação.">
      <ul className="sd-placar pa-resumo" aria-label="Aderência à escala">
        <li><span>Aderência à escala</span><b className={aderencia < 0.85 ? 'var-ruim' : ''}>{pct(aderencia, 0)}</b><small>{escaladosLogados} de {ESCALADOS.size} escalados atendendo</small></li>
        <li><span>Em pausa agora</span><b className={estouradas.length ? 'var-ruim' : ''}>{emPausa.length}</b><small>{estouradas.length ? `${estouradas.length} acima do limite` : 'nenhuma acima do limite'}</small></li>
        <li><span>Tempo em pausa no dia</span><b>{shrink === null ? '—' : pct(shrink, 1)}</b><small>do tempo logado da equipe</small></li>
        <li><span>Faltando da escala</span><b className={ausentes.length ? 'var-ruim' : ''}>{ausentes.length}</b><small>{ausentes.length ? ausentes.join(', ') : 'todos presentes'}</small></li>
        <li><span>Fora da escala</span><b>{extras.length}</b><small>{extras.length ? extras.join(', ') : 'ninguém extra'}</small></li>
      </ul>
      {estouradas.length > 0 && (
        <p className="pa-alerta" role="status"><AlertTriangle size={15} aria-hidden="true" />
          {estouradas.map((p) => `${p.nome} está há ${dur(pausaDe(p)!)} em ${MOTIVOS[p.motivo!].rotulo.toLowerCase()} (limite ${MOTIVOS[p.motivo!].limite} min)`).join('; ')}.
        </p>
      )}
      {([1, 2] as const).map((nivel) => {
        const nomes = nivel === 1 ? NOMES_N1 : NOMES_N2;
        const fora = nomes.filter((nome) => !postos.some((p) => p.nome === nome));
        return (
          <section key={nivel} className="pa-sec" aria-label={`PAs do N${nivel}`}>
            <h3>{nivel === 1 ? 'N1 · primeiro atendimento' : 'N2 · especialistas'}<small>{fora.length ? `Fora: ${fora.join(', ')}` : 'Todos os analistas estão nas PAs'}</small></h3>
            <ul className="pa-grade">
              {Array.from({ length: MAX_PA[nivel] }, (_, pa) => {
                const p = postos.find((x) => x.nivel === nivel && x.pa === pa);
                const rot = `PA ${numPa(nivel, pa)}`;
                const pausa = p ? pausaDe(p) : null;
                const acima = estouro(p, pausa);
                const t = p && placar?.tempo[p.nome];
                const estadoTxt = !p ? 'livre' : p.estado === 'logado' ? 'logado' : `em pausa (${MOTIVOS[p.motivo ?? 'descanso'].rotulo.toLowerCase()})`;
                return (
                  <li key={pa} className={`pa ${p ? p.estado : 'livre'}${acima ? ' estourada' : ''}`} aria-label={p ? `${rot}: ${p.nome}, ${estadoTxt}` : `${rot}: livre`}>
                    <span className="pa-num">{rot}</span>
                    {p ? (
                      <>
                        <button type="button" className="pa-nome" onClick={() => onVer(nivel, pa)} title="Ver na central 3D">{p.nome}</button>
                        <span className={`pill ${p.estado === 'logado' ? 'ok' : acima ? 'bad' : 'warn'}`}>{p.estado === 'logado' ? 'Logado' : MOTIVOS[p.motivo ?? 'descanso'].rotulo}</span>
                        <span className="pa-info">
                          {p.estado === 'pausa'
                            ? (pausa == null ? 'Em pausa' : acima ? `${dur(pausa)} · ${dur(acima)} acima do limite` : `${dur(pausa)} de ${MOTIVOS[p.motivo ?? 'descanso'].limite} min`)
                            : t ? `Pausa no dia: ${dur(t.pausa)}` : ' '}
                        </span>
                        <span className="pa-acoes">
                          {p.estado === 'logado'
                            ? <SeletorPausa rotulo={`Pausar ${p.nome} (${rot})`} onPausar={(m) => onMudar(nivel, pa, 'pausa', undefined, m)} />
                            : <button type="button" className="btn-ic" onClick={() => onMudar(nivel, pa, 'logado')} aria-label={`Voltar ${p.nome} da pausa (${rot})`} title="Voltar da pausa"><Play size={15} /></button>}
                          <button type="button" className="btn-ic" onClick={() => onMudar(nivel, pa, 'fora')} aria-label={`Deslogar ${p.nome} da ${rot}`} title="Deslogar"><LogOut size={15} /></button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="pa-nome livre">Livre</span>
                        <select aria-label={`Logar analista na ${rot}`} value="" disabled={!fora.length} onChange={(e) => e.target.value && onMudar(nivel, pa, 'logado', e.target.value)}>
                          <option value="">{fora.length ? 'Logar…' : 'Ninguém fora'}</option>
                          {fora.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
                        </select>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Card>
  );
}

/** Chamados abertos no N2, do que vence primeiro ao último. */
function ChamadosN2Card({ chamados, placar }: { chamados: ChamadoN2[] | null; placar: Placar | null }) {
  const [todos, setTodos] = useState(false);
  if (!chamados || !placar) {
    return <Card titulo="Chamados do N2 por prazo" sub="Aparece quando a central 3D estiver rodando."><p className="card-sub">Carregando os chamados…</p></Card>;
  }
  const vencidos = chamados.filter((k) => k.resta < 0);
  const vencem1h = chamados.filter((k) => k.resta >= 0 && k.resta <= 60);
  const p1 = chamados.filter((k) => k.prio === 1);
  const resolvidos = placar.n2NoPrazo + placar.n2Atrasados;
  const lista = todos ? chamados : chamados.slice(0, 8);
  const situacao = (k: ChamadoN2) => (k.resta < 0 ? 'vencido' : k.resta <= 60 ? 'risco' : 'ok');
  return (
    <Card titulo="Chamados do N2 por prazo"
      sub={`O N2 atende primeiro o que vence primeiro. Prazo de solução por prioridade, em horas úteis: P1 ${SLA_PRIO[1]} h, P2 ${SLA_PRIO[2]} h, P3 ${SLA_PRIO[3]} h e P4 ${SLA_PRIO[4]} h.`}>
      {p1.length > 0 && (
        <p className="n2-p1" role="alert"><AlertTriangle size={16} aria-hidden="true" />
          <b>Incidente P1 aberto:</b> {p1.map((k) => `${k.cod} (${k.assunto}), ${k.com ? `com ${k.com.nome}` : 'na fila'}, vence em ${dur(k.resta)}`).join('; ')}.
        </p>
      )}
      <ul className="sd-placar" aria-label="Situação do N2">
        <li><span>Abertos</span><b>{chamados.length}</b></li>
        <li><span>Vencidos</span><b className={vencidos.length ? 'var-ruim' : ''}>{vencidos.length}</b></li>
        <li><span>Vencem em até 1 h</span><b className={vencem1h.length ? 'var-alerta' : ''}>{vencem1h.length}</b></li>
        <li><span>Em atendimento</span><b>{chamados.filter((k) => k.com).length}</b></li>
        <li><span>Resolvidos no prazo hoje</span><b>{resolvidos ? pct(placar.n2NoPrazo / resolvidos, 0) : '—'}</b></li>
      </ul>
      {chamados.length === 0 ? <p className="card-sub" style={{ marginTop: 10 }}>Nenhum chamado aberto no N2 agora.</p> : (
        <div className="n2-tabela" role="region" aria-label="Lista de chamados do N2" tabIndex={0}>
          <table>
            <thead><tr><th>Chamado</th><th>Prioridade</th><th>Assunto</th><th>Com quem</th><th>Escalado há</th><th>Prazo</th></tr></thead>
            <tbody>
              {lista.map((k) => (
                <tr key={k.cod} className={situacao(k)}>
                  <td>{k.cod}</td>
                  <td><span className={`prio p${k.prio}`}>P{k.prio}</span></td>
                  <td>{k.assunto}</td>
                  <td>{k.com ? `${k.com.nome} · PA ${numPa(2, k.com.pa)}` : <span className="muted">Na fila</span>}</td>
                  <td>{dur(k.aberto)}</td>
                  <td><span className={`pill ${situacao(k) === 'vencido' ? 'bad' : situacao(k) === 'risco' ? 'warn' : 'ok'}`}>{k.resta < 0 ? `Vencido há ${dur(-k.resta)}` : `Vence em ${dur(k.resta)}`}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chamados.length > 8 && <button type="button" className="btn-sec" style={{ marginTop: 10 }} onClick={() => setTodos(!todos)}>{todos ? 'Mostrar só os 8 mais urgentes' : `Ver todos os ${chamados.length}`}</button>}
    </Card>
  );
}

const ROTULOS = ['Entrada', 'Fila N1', 'N1 · primeiro atendimento', 'Fila N2', 'N2 · especialistas'];

function Central3D({ cenario, postos, foco, onMudar, onTique }: { cenario: Cenario; postos: Posto[]; foco: { nivel: 1 | 2; pa: number; n: number } | null; onMudar: Mudar; onTique: (v: Vivo) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const cena = useRef<Cena | null>(null);
  const cores = useCores();
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem3d'>('carregando');
  const [rodando, setRodando] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [vel, setVel] = useState<'1' | '5' | '20'>('5');
  const [sel, setSel] = useState<Selecao | null>(null);
  const [placar, setPlacar] = useState<Placar | null>(null);
  const [rot, setRot] = useState<{ x: number; y: number; visivel: boolean }[]>([]);
  const [crachas, setCrachas] = useState<ReturnType<Cena['crachas']>>([]);

  const coresCena = (): CoresCena => ({
    fundo: cores.surface, chao: cores.surface, grade: cores.line, mesa: cores['line-2'], mesa2: cores.line, tela: cores['seq-2'] || cores.accent,
    ok: cores.good, alerta: cores.warn, ruim: cores.bad, destaque: cores.accent, neutro: cores.muted, pele: ['#e0b48f', '#c58c63', '#8d5a3b', '#f1cfb0'],
  });

  useEffect(() => {
    let vivo = true;
    const quando = (fn: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 200));
    void new Promise<void>((ok) => quando(() => ok())).then(() => import('../central/cena')).then(({ Cena: C, temWebGL }) => {
      if (!vivo || !caixa.current) return;
      if (!temWebGL()) { setEstado('sem3d'); return; }
      try { cena.current = new C(caixa.current, coresCena(), setSel); setEstado('pronto'); } catch { setEstado('sem3d'); }
    }).catch(() => { if (vivo) setEstado('sem3d'); });
    return () => { vivo = false; cena.current?.dispose(); cena.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cena.current?.setCores(coresCena()); }, [cores, estado]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cena.current?.setCenario(cenario); }, [cenario, estado]);
  useEffect(() => { cena.current?.setEquipe(postos); }, [postos, estado]);
  useEffect(() => {
    if (!foco) return;
    cena.current?.selecionar(foco.nivel, foco.pa);
    caixa.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [foco, estado]);
  // quem saiu da PA some do cartão aberto
  useEffect(() => { if (sel && !postos.some((p) => p.nivel === sel.nivel && p.pa === sel.pa)) setSel(null); }, [postos, sel]);
  useEffect(() => { if (cena.current) cena.current.rodando = rodando; }, [rodando, estado]);
  useEffect(() => { if (cena.current) cena.current.velocidade = +vel; }, [vel, estado]);
  useEffect(() => {
    if (estado !== 'pronto') return;
    let id = 0;
    const tique = () => { if (cena.current) { const pl = cena.current.placar(); setPlacar(pl); setRot(cena.current.rotulos()); setCrachas(cena.current.crachas()); onTique({ placar: pl, chamados: cena.current.chamadosN2() }); } id = window.setTimeout(tique, 250); };
    tique();
    return () => clearTimeout(id);
  }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (estado === 'sem3d') return <p className="fab-sem3d">Este navegador não conseguiu desenhar a cena 3D. Os números e os controles de “E se…?” continuam funcionando.</p>;
  const mesaSel = sel && placar ? placar.mesas.find((m) => m.nivel === sel.nivel && m.pa === sel.pa) : null;
  const txtEstado = (e: string) => (e === 'atendendo' ? 'Atendendo' : e === 'pausa' ? 'Em pausa' : 'Livre');
  const ns = placar && placar.atendidos + placar.abandonos ? placar.noPrazo / (placar.atendidos + placar.abandonos) : null;

  return (
    <div className="fab">
      <div className="fab-cena" ref={caixa} role="img" aria-label="Simulação 3D da central de service desk, com filas e mesas do N1 e do N2">
        {estado === 'carregando' && <p className="carregando" role="status">Carregando a central 3D…</p>}
        {estado === 'pronto' && rot.map((p, i) => p.visivel && (
          <div key={i} className="fab-rot" style={{ left: p.x, top: p.y, transform: 'translate(-50%, 0)' }} aria-hidden="true"><b>{ROTULOS[i]}</b>{i === 1 && placar ? ` ${placar.filaN1}` : i === 3 && placar ? ` ${placar.filaN2}` : ''}</div>
        ))}
        {estado === 'pronto' && crachas.map((k) => k.visivel && (
          <div key={`${k.nivel}-${k.pa}`} className={`sd-cracha ${k.estado}${k.alto ? ' alto' : ''}${estouro(postos.find((p) => p.nivel === k.nivel && p.pa === k.pa), k.pausaAgora) ? ' estourada' : ''}`} style={{ left: k.x, top: k.y }} aria-hidden="true">
            {k.nome}<small>PA {numPa(k.nivel, k.pa)}</small>
          </div>
        ))}
        {placar && <div className="fab-relogio" aria-hidden="true">Hoje · {placar.relogio}</div>}
        {sel && mesaSel && (
          <div className="fab-sel" role="dialog" aria-label={`${sel.nome}, N${sel.nivel}`}>
            <button type="button" className="fechar" onClick={() => setSel(null)} aria-label="Fechar">×</button>
            <b>{sel.nome}</b>
            <span className="muted">PA {numPa(sel.nivel, sel.pa)} · {sel.nivel === 1 ? 'N1 · primeiro atendimento' : 'N2 · especialista'}</span>
            <span className={`pill ${mesaSel.estado === 'atendendo' ? 'info' : mesaSel.estado === 'pausa' ? 'warn' : 'ok'}`}>{txtEstado(mesaSel.estado)}</span>
            <dl><dt>Atendimentos hoje</dt><dd>{mesaSel.feitos}</dd></dl>
            <div className="fab-sel-acoes">
              {mesaSel.estado === 'pausa'
                ? <button type="button" className="btn-sec" onClick={() => onMudar(sel.nivel, sel.pa, 'logado')}><Play size={14} aria-hidden="true" />Voltar da pausa</button>
                : <SeletorPausa className="btn-sec" rotulo="Motivo da pausa" onPausar={(m) => onMudar(sel.nivel, sel.pa, 'pausa', undefined, m)} />}
              <button type="button" className="btn-sec" onClick={() => onMudar(sel.nivel, sel.pa, 'fora')}><LogOut size={14} aria-hidden="true" />Deslogar</button>
            </div>
          </div>
        )}
      </div>
      <div className="fab-barra">
        <button type="button" className="btn-ic" onClick={() => setRodando(!rodando)} aria-label={rodando ? 'Pausar a simulação' : 'Continuar a simulação'}>{rodando ? <Pause size={16} /> : <Play size={16} />}</button>
        <Segmentado rotulo="Velocidade" valor={vel} onChange={setVel} opcoes={[['1', '1×'], ['5', '5×'], ['20', '20×']]} />
        <span className="fab-sep" />
        <button type="button" className="btn-ic" onClick={() => cena.current?.visaoGeral()} aria-label="Visão geral da central"><Maximize2 size={16} /></button>
        <button type="button" className="btn-ic" onClick={() => cena.current?.zoom(0.8)} aria-label="Aproximar"><Plus size={16} /></button>
        <button type="button" className="btn-ic" onClick={() => cena.current?.zoom(1.25)} aria-label="Afastar"><Minus size={16} /></button>
        <span className="fab-leg" aria-hidden="true"><i className="info" />N1 <i className="warn" />N2 <i className="ok" />Resolvido <i className="bad" />Desistiu</span>
      </div>
      {placar && (
        <ul className="sd-placar" aria-label={`Placar de hoje até ${placar.relogio}`}>
          <li><span>Na fila agora</span><b>{placar.filaN1} N1 · {placar.filaN2} N2</b></li>
          <li><span>Atendidos em até 60 s</span><b>{ns === null ? '—' : pct(ns, 0)}</b></li>
          <li><span>Atendidos hoje</span><b>{num(placar.atendidos)}</b></li>
          <li><span>Desistiram</span><b className={placar.abandonos ? 'var-ruim' : ''}>{num(placar.abandonos)}</b></li>
          <li><span>Escalados para o N2</span><b>{num(placar.escalados)}</b></li>
        </ul>
      )}
      {placar && (
        <div className="sd-equipe" role="group" aria-label="Equipe">
          {placar.mesas.map((m) => (
            <button key={`${m.nivel}-${m.pa}`} type="button" className={`sd-pessoa ${m.estado}`} onClick={() => cena.current?.selecionar(m.nivel, m.pa)}
              aria-label={`${m.nome}, N${m.nivel}, PA ${numPa(m.nivel, m.pa)}: ${txtEstado(m.estado).toLowerCase()}, ${m.feitos} atendimentos hoje`}>
              <i aria-hidden="true" />{m.nome}<small>PA {numPa(m.nivel, m.pa)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

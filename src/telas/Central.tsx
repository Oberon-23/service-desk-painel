import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Headset, Maximize2, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { ATUAL, META_NS, melhorAlavanca, NOMES_N1, NOMES_N2, simular, type Cenario } from '../fila';
import { Card, Kpis, Legenda, Manchete, Segmentado } from '../kit/ui';
import type { Status } from '../kit/formato';
import { Grafico, useCores } from '../kit/graficos';
import type { Cena, CoresCena, Placar, Selecao } from '../central/cena';

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
  const [c, setC] = useState<Cenario>(ATUAL);
  const r = useMemo(() => simular(c), [c]);
  const hoje = useMemo(() => simular(ATUAL), []);
  const dica = useMemo(() => melhorAlavanca(c), [c]);
  const alterado = JSON.stringify(c) !== JSON.stringify(ATUAL);
  const set = <K extends keyof Cenario>(k: K, v: Cenario[K]) => setC((x) => ({ ...x, [k]: v }));
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
          sub="Cada cubo é um contato. Azul: na fila do N1 ou em atendimento; laranja: escalado para o N2; verde: resolvido; vermelho: desistiu de esperar. Arraste para girar, use a roda do mouse ou a pinça para aproximar e clique numa mesa para ver o analista.">
          <Central3D cenario={c} />
        </Card>
        <Card className="fab-controles" titulo="E se…?" sub="Mude a equipe ou a demanda e compare com hoje. A animação e os números usam o mesmo modelo de fila."
          acoes={alterado ? <button type="button" className="limpar" onClick={() => setC(ATUAL)}><RotateCcw size={14} aria-hidden="true" />Voltar para hoje</button> : undefined}>
          <div className="alavancas">
            <Faixa id="n1" rotulo="Analistas no N1" valor={c.n1} min={2} max={14} un="" hoje={ATUAL.n1} onChange={(v) => set('n1', v)} ajuda="Atendem telefone, chat e portal." />
            <Faixa id="n2" rotulo="Analistas no N2" valor={c.n2} min={1} max={8} un="" hoje={ATUAL.n2} onChange={(v) => set('n2', v)} ajuda="Recebem o que o N1 não resolve." />
            <Faixa id="volume" rotulo="Volume de contatos" valor={c.volume} min={60} max={160} passo={5} un="%" hoje={ATUAL.volume} onChange={(v) => set('volume', v)} ajuda="100% = 300 contatos num dia normal." />
            <Faixa id="tma" rotulo="Tempo médio de atendimento (N1)" valor={c.tma} min={4} max={15} un="min" hoje={ATUAL.tma} onChange={(v) => set('tma', v)} ajuda="Roteiros e acesso remoto encurtam o atendimento." />
            <Faixa id="fcr" rotulo="Resolvido no primeiro contato" valor={c.fcr} min={40} max={90} un="%" hoje={ATUAL.fcr} onChange={(v) => set('fcr', v)} ajuda="O resto vai para o N2." />
            <Chave rotulo="Portal de autoatendimento" valor={c.autoatendimento} onChange={(v) => set('autoatendimento', v)} ajuda="Base de conhecimento e reset de senha sozinho: 15% menos contatos e atendimento 8% mais curto." />
            <Chave rotulo="Segunda-feira de manhã" valor={c.segunda} onChange={(v) => set('segunda', v)} ajuda="Demanda represada do fim de semana: 40% a mais das 8h às 12h." />
          </div>
        </Card>
      </div>

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

const ROTULOS = ['Entrada', 'Fila N1', 'N1 · primeiro atendimento', 'Fila N2', 'N2 · especialistas'];

function Central3D({ cenario }: { cenario: Cenario }) {
  const caixa = useRef<HTMLDivElement>(null);
  const cena = useRef<Cena | null>(null);
  const cores = useCores();
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem3d'>('carregando');
  const [rodando, setRodando] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [vel, setVel] = useState<'1' | '5' | '20'>('5');
  const [sel, setSel] = useState<Selecao | null>(null);
  const [placar, setPlacar] = useState<Placar | null>(null);
  const [rot, setRot] = useState<{ x: number; y: number; visivel: boolean }[]>([]);

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
  useEffect(() => { if (cena.current) cena.current.rodando = rodando; }, [rodando, estado]);
  useEffect(() => { if (cena.current) cena.current.velocidade = +vel; }, [vel, estado]);
  useEffect(() => {
    if (estado !== 'pronto') return;
    let id = 0;
    const tique = () => { if (cena.current) { setPlacar(cena.current.placar()); setRot(cena.current.rotulos()); } id = window.setTimeout(tique, 250); };
    tique();
    return () => clearTimeout(id);
  }, [estado]);

  if (estado === 'sem3d') return <p className="fab-sem3d">Este navegador não conseguiu desenhar a cena 3D. Os números e os controles de “E se…?” continuam funcionando.</p>;
  const mesaSel = sel && placar ? placar.mesas.find((m) => m.nivel === sel.nivel && m.nome === sel.nome) : null;
  const ns = placar && placar.atendidos + placar.abandonos ? placar.noPrazo / (placar.atendidos + placar.abandonos) : null;

  return (
    <div className="fab">
      <div className="fab-cena" ref={caixa} role="img" aria-label="Simulação 3D da central de service desk, com filas e mesas do N1 e do N2">
        {estado === 'carregando' && <p className="carregando" role="status">Carregando a central 3D…</p>}
        {estado === 'pronto' && rot.map((p, i) => p.visivel && (
          <div key={i} className="fab-rot" style={{ left: p.x, top: p.y, transform: 'translate(-50%, 0)' }} aria-hidden="true"><b>{ROTULOS[i]}</b>{i === 1 && placar ? ` ${placar.filaN1}` : i === 3 && placar ? ` ${placar.filaN2}` : ''}</div>
        ))}
        {placar && <div className="fab-relogio" aria-hidden="true">Hoje · {placar.relogio}</div>}
        {sel && mesaSel && (
          <div className="fab-sel" role="dialog" aria-label={`${sel.nome}, N${sel.nivel}`}>
            <button type="button" className="fechar" onClick={() => setSel(null)} aria-label="Fechar">×</button>
            <b>{sel.nome}</b>
            <span className="muted">{sel.nivel === 1 ? 'N1 · primeiro atendimento' : 'N2 · especialista'}</span>
            <span className={`pill ${mesaSel.estado === 'atendendo' ? 'info' : 'ok'}`}>{mesaSel.estado === 'atendendo' ? 'Atendendo' : 'Livre'}</span>
            <dl><dt>Atendimentos hoje</dt><dd>{mesaSel.feitos}</dd></dl>
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
          {placar.mesas.filter((m) => m.ativo).map((m) => (
            <button key={`${m.nivel}-${m.nome}`} type="button" className={`sd-pessoa ${m.estado}`} onClick={() => cena.current?.selecionar(m.nivel, (m.nivel === 1 ? NOMES_N1 : NOMES_N2).indexOf(m.nome))}
              aria-label={`${m.nome}, N${m.nivel}: ${m.estado === 'atendendo' ? 'atendendo' : 'livre'}, ${m.feitos} atendimentos hoje`}>
              <i aria-hidden="true" />{m.nome}<small>N{m.nivel}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

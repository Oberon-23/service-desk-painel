import { useEffect, useRef, useState } from 'react';
import { LogOut, Maximize2, Minus, Pause, Play, Plus } from 'lucide-react';
import { Segmentado } from '../../kit/ui';
import { useCores } from '../../kit/graficos';
import type { Cena, CoresCena } from '../../central/cena';
import { CANAIS, MOTIVOS, numPa, ORDEM_CANAIS } from '../../operacao/motor';
import { useOperacao } from '../../operacao/contexto';
import { dur, ESTADO_TXT, pct, situacao, tempo } from './formatos';
import { SeletorPausa } from './Controles';

/** Tons de pele das pessoas na cena: ilustração, não comunicam dado, por isso ficam fora dos tokens. */
const PELE = ['#e0b48f', '#c58c63', '#8d5a3b', '#f1cfb0']; // design-ok: ilustração

/** Controles do relógio da simulação: valem para todas as telas. */
export function Relogio() {
  const { foto, rodando, setRodando, vel, setVel } = useOperacao();
  return (
    <div className="relogio">
      <span className="relogio-hora" aria-label={`Relógio da simulação: ${foto.relogio}`}><i className={rodando ? 'vivo' : ''} aria-hidden="true" />{foto.relogio}</span>
      <button type="button" className="btn-ic" onClick={() => setRodando(!rodando)} aria-label={rodando ? 'Pausar a simulação' : 'Continuar a simulação'}>{rodando ? <Pause size={16} /> : <Play size={16} />}</button>
      <Segmentado rotulo="Velocidade" valor={vel} onChange={setVel} opcoes={[['1', '1×'], ['5', '5×'], ['20', '20×']]} />
    </div>
  );
}

/** A sala em 3D. `foco` seleciona um analista vindo de outra parte da tela. */
export default function Sala3D({ foco, mural = false }: { foco?: { nome: string; n: number } | null; mural?: boolean }) {
  const { motor, foto, agir } = useOperacao();
  const caixa = useRef<HTMLDivElement>(null);
  const cena = useRef<Cena | null>(null);
  const cores = useCores();
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem3d'>('carregando');
  const [sel, setSel] = useState<string | null>(null);
  const [rot, setRot] = useState<ReturnType<Cena['rotulos']>>([]);
  const [crachas, setCrachas] = useState<ReturnType<Cena['crachas']>>([]);

  const coresCena = (): CoresCena => ({
    fundo: cores.surface, chao: cores.surface, grade: cores.line, mesa: cores['line-2'], mesa2: cores.line, tela: cores['seq-2'] || cores.accent,
    ok: cores.good, alerta: cores.warn, ruim: cores.bad, destaque: cores.accent, neutro: cores.muted, pele: PELE,
  });

  useEffect(() => {
    let vivo = true;
    const quando = (fn: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 200));
    void new Promise<void>((ok) => quando(() => ok())).then(() => import('../../central/cena')).then(({ Cena: C, temWebGL }) => {
      if (!vivo || !caixa.current) return;
      if (!temWebGL()) { setEstado('sem3d'); return; }
      try { cena.current = new C(caixa.current, coresCena(), motor, setSel); setEstado('pronto'); } catch { setEstado('sem3d'); }
    }).catch(() => { if (vivo) setEstado('sem3d'); });
    return () => { vivo = false; cena.current?.dispose(); cena.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cena.current?.setCores(coresCena()); }, [cores, estado]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!foco) return;
    setSel(foco.nome);
    caixa.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [foco]);
  useEffect(() => { if (cena.current) { setRot(cena.current.rotulos()); setCrachas(cena.current.crachas()); } }, [foto, estado]);

  if (estado === 'sem3d') return <p className="fab-sem3d">Este navegador não conseguiu desenhar a sala em 3D. Os indicadores, o copiloto e as outras telas continuam funcionando.</p>;
  const a = sel ? foto.analistas.find((x) => x.nome === sel && x.pa !== null) : null;
  const txt = ['Telefone', 'Chat', 'Portal', 'Fila N1', 'N1 · primeiro atendimento', 'Fila N2', 'N2 · especialistas'];
  const conta = [...ORDEM_CANAIS.map((k) => foto.filas[k].esperando), null, null, foto.n2.fila, null];

  return (
    <div className={`fab${mural ? ' fab-mural' : ''}`}>
      <div className="fab-cena" ref={caixa} role="img" aria-label="Sala da central em 3D, com as filas por canal e as mesas do N1 e do N2">
        {estado === 'carregando' && <p className="carregando" role="status">Carregando a sala em 3D…</p>}
        {estado === 'pronto' && rot.map((p, i) => p.visivel && i !== 3 && (
          <div key={i} className="fab-rot" style={{ left: p.x, top: p.y, transform: 'translate(-50%, 0)' }} aria-hidden="true"><b>{txt[i]}</b>{conta[i] !== null ? ` ${conta[i]}` : ''}</div>
        ))}
        {estado === 'pronto' && crachas.map((k) => {
          const x = foto.analistas.find((y) => y.nome === k.nome);
          return k.visivel && x && x.pa !== null && (
            <div key={k.nome} className={`sd-cracha ${x.estado}${k.alto ? ' alto' : ''}${x.estouro ? ' estourada' : ''}`} style={{ left: k.x, top: k.y }} aria-hidden="true">
              {k.nome}<small>PA {numPa(x.nivel, x.pa)}</small>
            </div>
          );
        })}
        {a && a.pa !== null && !mural && (
          <div className="fab-sel" role="dialog" aria-label={`${a.nome}, N${a.nivel}`}>
            <button type="button" className="fechar" onClick={() => setSel(null)} aria-label="Fechar">×</button>
            <b>{a.nome}</b>
            <span className="muted">PA {numPa(a.nivel, a.pa)} · {a.nivel === 1 ? `N1 · ${a.canais.map((k) => CANAIS[k].rotulo.toLowerCase()).join(', ') || 'sem canal'}` : 'N2 · especialista'}</span>
            <span className={`pill ${situacao(a)}`}>{a.estado === 'pausa' && a.motivo ? `${MOTIVOS[a.motivo].rotulo} · ${dur(a.noEstado)}` : ESTADO_TXT[a.estado]}</span>
            <dl>
              {a.ticket && <><dt>Agora</dt><dd>{a.ticket.assunto}</dd></>}
              <dt>Atendimentos hoje</dt><dd>{a.atend}</dd>
              <dt>Tempo médio</dt><dd>{tempo(a.tma)}</dd>
              <dt>Ocupação</dt><dd>{pct(a.ocupacao, 0)}</dd>
            </dl>
            <div className="fab-sel-acoes">
              {a.estado === 'pausa'
                ? <button type="button" className="btn-sec" onClick={() => agir((m) => m.voltar(a.nome))}><Play size={14} aria-hidden="true" />Voltar da pausa</button>
                : <SeletorPausa className="btn-sec" rotulo="Motivo da pausa" onPausar={(mo) => agir((m) => m.pausar(a.nome, mo))} />}
              <button type="button" className="btn-sec" onClick={() => agir((m) => m.deslogar(a.nome))}><LogOut size={14} aria-hidden="true" />Deslogar</button>
            </div>
          </div>
        )}
      </div>
      {!mural && (
        <div className="sd-equipe" role="group" aria-label="Equipe na sala">
          {foto.analistas.filter((x) => x.pa !== null).sort((x, y) => x.nivel - y.nivel || x.pa! - y.pa!).map((x) => (
            <button key={x.nome} type="button" className={`sd-pessoa ${situacao(x)}`} aria-pressed={sel === x.nome} onClick={() => setSel(sel === x.nome ? null : x.nome)}
              aria-label={`${x.nome}, N${x.nivel}, PA ${numPa(x.nivel, x.pa!)}: ${ESTADO_TXT[x.estado].toLowerCase()}`}>
              <i aria-hidden="true" />{x.nome}
            </button>
          ))}
        </div>
      )}
      {!mural && (
        <div className="fab-barra">
          <button type="button" className="btn-ic" onClick={() => cena.current?.visaoGeral()} aria-label="Visão geral da sala"><Maximize2 size={16} /></button>
          <button type="button" className="btn-ic" onClick={() => cena.current?.zoom(0.8)} aria-label="Aproximar"><Plus size={16} /></button>
          <button type="button" className="btn-ic" onClick={() => cena.current?.zoom(1.25)} aria-label="Afastar"><Minus size={16} /></button>
          <span className="fab-leg" aria-hidden="true"><i className="info" />N1 <i className="warn" />N2 <i className="ok" />Resolvido <i className="bad" />Desistiu</span>
        </div>
      )}
    </div>
  );
}

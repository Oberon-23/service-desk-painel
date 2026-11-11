import { useEffect, useRef, useState } from 'react';
import { LogOut, Maximize2, Minus, Pause, Play, Plus } from 'lucide-react';
import type { Cenario } from '../../fila';
import { Segmentado } from '../../kit/ui';
import { useCores } from '../../kit/graficos';
import type { Cena, CoresCena } from '../../central/cena';
import type { Placar, Posto, Selecao } from '../../central/tipos';
import { estouro, numPa, type Foco, type Mudar, type Vivo } from './comum';
import { SeletorPausa } from './Controles';

/** Tons de pele das pessoas na cena: ilustração, não comunicam dado, por isso ficam fora dos tokens. */
const PELE = ['#e0b48f', '#c58c63', '#8d5a3b', '#f1cfb0']; // design-ok: ilustração
const ROTULOS = ['Entrada', 'Fila N1', 'N1 · primeiro atendimento', 'Fila N2', 'N2 · especialistas'];

export default function Central3D({ cenario, postos, foco, onMudar, onTique }: { cenario: Cenario; postos: Posto[]; foco: Foco | null; onMudar: Mudar; onTique: (v: Vivo) => void }) {
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
    ok: cores.good, alerta: cores.warn, ruim: cores.bad, destaque: cores.accent, neutro: cores.muted, pele: PELE,
  });

  useEffect(() => {
    let vivo = true;
    const quando = (fn: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 200));
    void new Promise<void>((ok) => quando(() => ok())).then(() => import('../../central/cena')).then(({ Cena: C, temWebGL }) => {
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
    </div>
  );
}

/* Filas: cada canal com o seu alvo, quem atende o quê e os chamados do N2 por prazo. */
import { useState } from 'react';
import { MessageSquare, MonitorSmartphone, Phone, Wrench } from 'lucide-react';
import { CATEGORIAS } from '../fila';
import { Card } from '../kit/ui';
import { BarrasH, useCores } from '../kit/graficos';
import { CANAIS, numPa, ORDEM_CANAIS, SLA_PRIO, type Canal, type ChamadoN2, type FilaFoto } from '../operacao/motor';
import { useOperacao } from '../operacao/contexto';
import { dur, ESTADO_TXT, META_SLA_N2, pct, situacao, st, tempo } from './partes/formatos';

const ICONE: Record<Canal, typeof Phone> = { telefone: Phone, chat: MessageSquare, portal: MonitorSmartphone };
const ST_TXT: Record<string, string> = { ok: 'Na meta', warn: 'Atenção', bad: 'Fora da meta' };

/** Tamanho da fila ao longo do dia, numa linha pequena. */
function Faisca({ valores, rotulo }: { valores: number[]; rotulo: string }) {
  const n = 120, max = Math.max(4, ...valores), W = 240, H = 44; // 120 amostras de 5 min = o dia inteiro
  const x = (i: number) => (i / (n - 1)) * W, y = (v: number) => H - 2 - (v / max) * (H - 6);
  const pts = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="faisca" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={rotulo} preserveAspectRatio="none">
      <line x1="0" y1={H - 2} x2={W} y2={H - 2} className="faisca-base" />
      {valores.length > 1 && <polygon points={`0,${H - 2} ${pts} ${x(valores.length - 1).toFixed(1)},${H - 2}`} className="faisca-area" />}
      {valores.length > 1 && <polyline points={pts} className="faisca-linha" />}
    </svg>
  );
}

function CartaoFila({ q }: { q: FilaFoto }) {
  const c = CANAIS[q.canal], Ic = ICONE[q.canal];
  const s = q.ns === null ? null : st(q.ns >= c.meta, q.ns >= c.meta - 0.05);
  const apertada = q.esperando > 0 && q.maiorEspera > c.alvo;
  const pico = Math.max(0, ...q.hist);
  return (
    <article className={`fila-card${apertada ? ' apertada' : ''}`} aria-label={`Fila do ${c.rotulo.toLowerCase()}`}>
      <header>
        <h3><Ic size={16} aria-hidden="true" />{c.rotulo}<small>alvo {c.alvo} min</small></h3>
        {s ? <span className={`pill ${s}`}>{ST_TXT[s]}</span> : null}
      </header>
      <div className="fila-agora">
        <div><b>{q.esperando}</b><span>esperando</span></div>
        <div><b className={apertada ? 'txt-bad' : ''}>{q.esperando ? tempo(q.maiorEspera) : '—'}</b><span>maior espera</span></div>
        <div><b>{q.livres}<small> / {q.habilitados}</small></b><span>livres / habilitados</span></div>
      </div>
      <p className="faisca-rot">Fila ao longo do dia <b>pico {pico}</b></p>
      <Faisca valores={q.hist} rotulo={`Maior tamanho da fila do ${c.rotulo.toLowerCase()} a cada 5 minutos, ao longo do dia; pico de ${pico} ${pico === 1 ? 'contato' : 'contatos'}`} />
      <dl className="fila-dia">
        <div><dt>No alvo</dt><dd>{pct(q.ns, 0)}<small> / {pct(c.meta, 0)}</small></dd></div>
        <div><dt>Abandono</dt><dd>{c.paciencia === null ? 'não se aplica' : pct(q.abandono)}</dd></div>
        <div><dt>Espera média</dt><dd>{tempo(q.esperaMedia)}</dd></div>
        <div><dt>Atendimento</dt><dd>{tempo(q.tma)}</dd></div>
        <div><dt>Satisfação</dt><dd>{pct(q.csat, 0)}</dd></div>
        <div><dt>Recebidos</dt><dd>{q.recebidos}</dd></div>
      </dl>
    </article>
  );
}

function Habilidades() {
  const { foto: f, agir } = useOperacao();
  const n1 = f.analistas.filter((a) => a.nivel === 1 && a.pa !== null).sort((a, b) => a.pa! - b.pa!);
  return (
    <Card titulo="Quem atende o quê" sub="Roteamento por habilidade: cada analista do N1 recebe só os canais marcados e pega sempre o contato mais urgente (espera ÷ alvo do canal). Marcar ou desmarcar vale na hora.">
      {n1.length === 0 ? <p className="vazio">Ninguém logado no N1. Logue analistas em Analistas.</p> : (
        <div className="tabela-resp tabela-hab" role="region" aria-label="Habilidades por canal" tabIndex={0}>
          <table>
            <thead>
              <tr><th>Analista</th><th>Situação</th>{ORDEM_CANAIS.map((k) => <th key={k} className="centro">{CANAIS[k].rotulo}<small> {f.filas[k].habilitados}</small></th>)}</tr>
            </thead>
            <tbody>
              {n1.map((a) => (
                <tr key={a.nome}>
                  <td className="c-nome"><b>{a.nome}</b><small className="nivel">PA {numPa(1, a.pa!)}</small></td>
                  <td className="c-sit"><span className={`pill ${situacao(a)}`}>{ESTADO_TXT[a.estado]}</span></td>
                  {ORDEM_CANAIS.map((k) => (
                    <td key={k} className="centro c-canal">
                      <label className="marca-canal"><input type="checkbox" checked={a.canais.includes(k)} onChange={() => agir((m) => m.alternarCanal(a.nome, k))} aria-label={`${a.nome} atende ${CANAIS[k].rotulo.toLowerCase()}`} /><span aria-hidden="true">{CANAIS[k].rotulo}</span></label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ChamadosN2({ chamados, noPrazo, atrasados }: { chamados: ChamadoN2[]; noPrazo: number; atrasados: number }) {
  const [todos, setTodos] = useState(false);
  const vencidos = chamados.filter((k) => k.resta < 0), vencem1h = chamados.filter((k) => k.resta >= 0 && k.resta <= 60);
  const resolvidos = noPrazo + atrasados, taxa = resolvidos ? noPrazo / resolvidos : null;
  const lista = todos ? chamados : chamados.slice(0, 8);
  const sit = (k: ChamadoN2) => (k.resta < 0 ? 'vencido' : k.resta <= 60 ? 'risco' : 'ok');
  return (
    <Card titulo={<span className="tit-ic"><Wrench size={18} aria-hidden="true" />Chamados do N2 por prazo</span>}
      sub={`Ordem de atendimento: o que vence primeiro. Prazo por prioridade (horas úteis): P1 ${SLA_PRIO[1]} h · P2 ${SLA_PRIO[2]} h · P3 ${SLA_PRIO[3]} h · P4 ${SLA_PRIO[4]} h.`}>
      <ul className="resumo" aria-label="Situação do N2">
        <li><span>Abertos</span><b>{chamados.length}</b></li>
        <li><span>Vencidos</span><b className={vencidos.length ? 'txt-bad' : ''}>{vencidos.length}</b></li>
        <li><span>Vencem em até 1 h</span><b>{vencem1h.length}</b></li>
        <li><span>Em atendimento</span><b>{chamados.filter((k) => k.com).length}</b></li>
        <li><span>Resolvidos no prazo hoje</span><b className={taxa !== null && taxa < META_SLA_N2 ? 'txt-bad' : ''}>{pct(taxa, 0)}</b><small>meta {pct(META_SLA_N2, 0)} · {resolvidos} resolvidos</small></li>
      </ul>
      {chamados.length === 0 ? <p className="vazio">Nenhum chamado aberto no N2 agora.</p> : (
        <div className="tabela-resp tabela-n2" role="region" aria-label="Lista de chamados do N2" tabIndex={0}>
          <table>
            <thead><tr><th>Chamado</th><th>Prioridade</th><th>Assunto</th><th>Com quem</th><th className="num">Escalado há</th><th>Prazo</th></tr></thead>
            <tbody>
              {lista.map((k) => (
                <tr key={k.cod} className={sit(k)}>
                  <td className="mono">{k.cod}</td>
                  <td><span className={`prio p${k.prio}`}>P{k.prio}</span></td>
                  <td>{k.assunto}{k.pai ? <small className="nivel">incidente pai</small> : null}</td>
                  <td>{k.com ? `${k.com.nome} · PA ${numPa(2, k.com.pa)}` : <span className="muted">Na fila</span>}</td>
                  <td className="num">{dur(k.aberto)}</td>
                  <td><span className={`pill ${sit(k) === 'vencido' ? 'bad' : sit(k) === 'risco' ? 'warn' : 'ok'}`}>{k.resta < 0 ? `Vencido há ${dur(-k.resta)}` : `Vence em ${dur(k.resta)}`}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chamados.length > 8 && <button type="button" className="btn-sec mais" onClick={() => setTodos(!todos)}>{todos ? 'Mostrar só os 8 mais urgentes' : `Ver todos os ${chamados.length}`}</button>}
    </Card>
  );
}

export default function Filas() {
  const { foto: f } = useOperacao();
  const cores = useCores();
  const assuntos = CATEGORIAS.map((nome, i) => ({ nome, valor: f.recente.porCat[i], cor: f.incidente?.cat === i || (f.surto?.cat === i) ? cores.bad : cores.accent })).sort((a, b) => b.valor - a.valor);
  return (
    <>
      <section className="filas-grid" aria-label="Filas do N1 por canal">
        {ORDEM_CANAIS.map((k) => <CartaoFila key={k} q={f.filas[k]} />)}
      </section>
      <div className="duas">
        <Habilidades />
        <Card titulo="Assuntos dos últimos 30 minutos" sub="Um assunto que dispara de repente costuma ser incidente, e não vários problemas separados.">
          <BarrasH rotulo="Contatos dos últimos 30 minutos por assunto" altura={260} itens={assuntos} semDados={f.recente.total === 0} vazio="Nenhum contato nos últimos 30 minutos."
            dica={(i) => ({ titulo: assuntos[i].nome, linhas: [{ nome: 'Contatos em 30 min', valor: String(assuntos[i].valor) }, { nome: 'Parte do volume', valor: pct(f.recente.total ? assuntos[i].valor / f.recente.total : 0, 0) }] })} />
          <p className="nota">{f.recente.total} contatos em 30 minutos.{f.incidente ? ` Incidente ${f.incidente.cod} declarado para ${CATEGORIAS[f.incidente.cat]}.` : ''}</p>
        </Card>
      </div>
      <ChamadosN2 chamados={f.n2.chamados} noPrazo={f.n2.noPrazo} atrasados={f.n2.atrasados} />
    </>
  );
}

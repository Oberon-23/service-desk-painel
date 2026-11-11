import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Flag, Info, Monitor, Moon, Sun } from 'lucide-react';
import { STATUS_TXT, type Status } from './formato';
import { periodOptions } from './meses';
import { useFiltros } from './filtros';

/* ======================= tema claro / escuro ======================= */

type Pref = 'system' | 'light' | 'dark';
const CHAVE_TEMA = 'rl-theme';

function aplicarTema(p: Pref) {
  if (p === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', p);
}

export function SeletorTema() {
  const [pref, setPref] = useState<Pref>(() => {
    try { return (localStorage.getItem(CHAVE_TEMA) as Pref) || 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    aplicarTema(pref);
    try { localStorage.setItem(CHAVE_TEMA, pref); } catch { /* ignora */ }
  }, [pref]);
  const op: [Pref, string, ReactNode][] = [['light', 'Tema claro', <Sun key="s" />], ['system', 'Automático', <Monitor key="m" />], ['dark', 'Tema escuro', <Moon key="d" />]];
  return (
    <div className="tema" role="group" aria-label="Tema">
      {op.map(([v, l, ic]) => (
        <button key={v} type="button" aria-pressed={pref === v} title={l} aria-label={l} onClick={() => setPref(v)}>{ic}</button>
      ))}
    </div>
  );
}

/* ======================= moldura do painel ======================= */

export type Visao = {
  path: string;
  label: string;
  /** Rótulo curto para o menu no celular (cabe tudo na tela, sem rolar). */
  curto?: string;
  icon: ReactNode;
  heading: string;
  sub: string;
  /** filtros que aparecem nesta tela: 'todos', 'nenhum' ou lista de ids */
  filtros?: 'todos' | 'nenhum' | string[];
  semPeriodo?: boolean;
};

export function Moldura({ produto, icone, visoes, asOf, rodape }: {
  produto: string; icone: ReactNode; visoes: Visao[]; asOf: string; rodape: ReactNode;
}) {
  const { pathname } = useLocation();
  const atual = visoes.find((v) => v.path === pathname) ?? visoes[0];
  const { periodo, setPeriodo, defs, valor, setValor, limpar } = useFiltros();
  const mostra = (id: string) => atual.filtros === undefined || atual.filtros === 'todos' || (Array.isArray(atual.filtros) && atual.filtros.includes(id));
  const semFiltros = atual.filtros === 'nenhum';
  const filtrado = !semFiltros && ((!atual.semPeriodo && (periodo.from !== 0 || periodo.to !== 11)) || defs.some((d) => mostra(d.id) && valor(d.id) !== d.options[0][0]));

  useEffect(() => { document.title = `${atual.label} · ${produto}`; window.scrollTo({ top: 0 }); }, [atual, produto]);

  return (
    <>
      <header className="topo">
        <div className="topo-in">
          <NavLink to="/" className="marca">
            <span className="marca-icone" aria-hidden="true">{icone}</span>
            <span>{produto}<small>Grupo Rotalume</small></span>
          </NavLink>
          <nav className="nav" aria-label="Seções do painel">
            {visoes.map((v) => (
              <NavLink key={v.path} to={v.path} end aria-label={v.label}>{v.icon}<span className="rot-longo">{v.label}</span><span className="rot-curto" aria-hidden="true">{v.curto ?? v.label}</span></NavLink>
            ))}
          </nav>
          <SeletorTema />
        </div>
      </header>
      <div className="faixa">
        <div className="faixa-in">
          <div className="faixa-tit">
            <h1>{atual.heading}</h1>
            <p>{atual.sub}</p>
          </div>
          {semFiltros ? (
            asOf ? <span className="asof">Dados até {asOf}</span> : <span />
          ) : (
            <div className="filtros">
              {!atual.semPeriodo ? (
                <label className="campo">Período
                  <select value={`${periodo.from}-${periodo.to}`} onChange={(e) => { const [a, b] = e.target.value.split('-').map(Number); setPeriodo({ from: a, to: b }); }}>
                    {periodOptions().map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              ) : null}
              {defs.filter((d) => mostra(d.id)).map((d) => (
                <label key={d.id} className="campo">{d.label}
                  <select value={valor(d.id)} onChange={(e) => setValor(d.id, e.target.value)}>
                    {d.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              ))}
              {filtrado ? <button type="button" className="limpar" onClick={limpar}>Limpar filtros</button> : null}
            </div>
          )}
        </div>
      </div>
      <main id="conteudo">
        <ProtecaoErro chave={pathname}><Suspense fallback={<p className="carregando" role="status">Carregando…</p>}><Outlet /></Suspense></ProtecaoErro>
      </main>
      <footer className="rodape">
        <span>{rodape}</span>
        {asOf ? <span>Dados até {asOf}</span> : null}
      </footer>
    </>
  );
}

/* ======================= blocos ======================= */

const ICONE_STATUS: Record<string, ReactNode> = {
  ok: <CheckCircle2 size={20} />, bad: <AlertTriangle size={20} />, warn: <Flag size={20} />, info: <Info size={20} />, neutral: <Info size={20} />,
};

/** Frase-resumo do topo: o que o leitor precisa saber em 5 segundos. */
export function Manchete({ status, titulo, texto, achados }: { status: Status | 'info'; titulo: ReactNode; texto?: ReactNode; achados?: Achado[] }) {
  return (
    <section className={`card manchete ${status}`} aria-live="polite">
      <span className="ic" aria-hidden="true">{ICONE_STATUS[status]}</span>
      <h2>{titulo}</h2>
      {texto ? <p>{texto}</p> : null}
      {achados?.length ? <Achados itens={achados} /> : null}
    </section>
  );
}

export type Achado = { s: 'ok' | 'warn' | 'bad' | 'info'; titulo: ReactNode; texto?: ReactNode };
export function Achados({ itens }: { itens: Achado[] }) {
  if (!itens.length) return null;
  return (
    <ul className="achados">
      {itens.map((a, i) => (
        <li key={i}>
          <span className={`fi ${a.s}`} aria-hidden="true">{ICONE_STATUS[a.s]}</span>
          <div><p>{a.titulo}</p>{a.texto ? <p>{a.texto}</p> : null}</div>
        </li>
      ))}
    </ul>
  );
}

export function Dica({ texto, rotulo }: { texto: string; rotulo: string }) {
  return (
    <button className="dica" type="button" aria-label={`O que é ${rotulo}: ${texto}`}>
      i<span className="bal" role="tooltip" aria-hidden="true">{texto}</span>
    </button>
  );
}

export function Pill({ status, children }: { status: string; children: ReactNode }) {
  return <span className={`pill ${status}`}>{children}</span>;
}

export type KpiProps = {
  label: string;
  tip?: string;
  value: string;
  unit?: string;
  target?: string;
  status?: Status;
  statusText?: string;
  delta?: ReactNode;
  note?: string;
  spark?: number[];
};

export function Kpis({ itens }: { itens: KpiProps[] }) {
  return (
    <section className="kpis" aria-label="Indicadores principais">
      {itens.map((k) => (
        <div className="card kpi" key={k.label}>
          <div className="k-top">
            <span className="k-lab">{k.label}{k.tip ? <Dica texto={k.tip} rotulo={k.label} /> : null}</span>
            {k.status ? <Pill status={k.status}>{k.statusText ?? STATUS_TXT[k.status]}</Pill> : null}
          </div>
          <div className="k-val">{k.value}{k.unit && k.value !== '—' ? <small>{k.unit}</small> : null}</div>
          <div className="k-meta">
            {k.target ? <span>{k.target}</span> : null}
            {k.delta}
            {k.note ? <span>{k.note}</span> : null}
          </div>
          {k.spark ? <Spark valores={k.spark} /> : null}
        </div>
      ))}
    </section>
  );
}

/** Variação contra o período anterior, em verde se melhorou e vermelho se piorou. */
export function Delta({ atual, anterior, sobeBom, fmt }: { atual: number; anterior: number | null | undefined; sobeBom: boolean; fmt: (x: number) => string }) {
  if (anterior == null || !Number.isFinite(anterior) || !Number.isFinite(atual)) return null;
  const d = atual - anterior;
  if (Math.abs(d) < 1e-9) return <span className="delta igual">= período anterior</span>;
  const bom = d > 0 === sobeBom;
  return <span className={`delta ${bom ? 'bom' : 'ruim'}`}>{d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))} vs. anterior</span>;
}

/** Mini linha dos 12 meses, dentro do cartão do indicador. */
export function Spark({ valores }: { valores: number[] }) {
  const v = valores.map((x) => (Number.isFinite(x) ? x : NaN));
  const ok = v.filter((x) => !Number.isNaN(x));
  if (ok.length < 2) return null;
  const W = 200, H = 30, p = 3;
  const mn = Math.min(...ok), mx = Math.max(...ok);
  const X = (i: number) => p + (i * (W - 2 * p)) / (v.length - 1);
  const Y = (x: number) => H - p - (mx === mn ? 0.5 : (x - mn) / (mx - mn)) * (H - 2 * p);
  const d = v.map((x, i) => (Number.isNaN(x) ? '' : `${i && !Number.isNaN(v[i - 1]) ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x).toFixed(1)}`)).join('');
  return (
    <svg className="k-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" width="100%" height={H}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={X(v.length - 1)} cy={Y(v[v.length - 1])} r="2.6" fill="var(--accent)" />
    </svg>
  );
}

export function Card({ titulo, sub, acoes, children, className = '' }: { titulo?: ReactNode; sub?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {titulo || acoes ? (
        <div className="card-h">
          {titulo ? <h2>{titulo}</h2> : <span />}
          {acoes ? <div className="acoes">{acoes}</div> : null}
        </div>
      ) : null}
      {sub ? <p className="card-sub">{sub}</p> : null}
      {children}
    </section>
  );
}

export type ItemLegenda = { label: string; cor?: string; tipo?: 'quadrado' | 'linha' | 'tracejado' | 'faixa' };
export function Legenda({ itens }: { itens: ItemLegenda[] }) {
  return (
    <div className="legenda">
      {itens.map((i) => (
        <span key={i.label}>
          <i className={i.tipo === 'linha' ? 'linha' : i.tipo === 'tracejado' ? 'trac' : i.tipo === 'faixa' ? 'faixa' : ''} style={i.tipo === 'tracejado' ? undefined : { background: i.cor }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Segmentado<T extends string>({ valor, opcoes, onChange, rotulo }: { valor: T; opcoes: [T, string][]; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div className="seg" role="group" aria-label={rotulo}>
      {opcoes.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

/* ======================= tabela ordenável ======================= */

export type Coluna<T> = {
  k: keyof T & string;
  label: string;
  num?: boolean;
  render?: (row: T) => ReactNode;
};

export function TabelaOrdenavel<T extends Record<string, unknown>>({ colunas, linhas, ordemInicial, chave, porPagina = 0, vazio = 'Nada encontrado.' }: {
  colunas: Coluna<T>[]; linhas: T[]; ordemInicial: { k: keyof T & string; d: 1 | -1 }; chave: (r: T) => string | number; porPagina?: number; vazio?: string;
}) {
  const [ord, setOrd] = useState(ordemInicial);
  const [pag, setPag] = useState(1);
  const ordenadas = useMemo(() => [...linhas].sort((a, b) => {
    const x = a[ord.k] as never, y = b[ord.k] as never;
    return ((x > y ? 1 : 0) - (x < y ? 1 : 0)) * ord.d;
  }), [linhas, ord]);
  useEffect(() => setPag(1), [linhas]);
  const paginas = porPagina ? Math.max(1, Math.ceil(ordenadas.length / porPagina)) : 1;
  const vis = porPagina ? ordenadas.slice((pag - 1) * porPagina, pag * porPagina) : ordenadas;
  const clicar = (k: keyof T & string) =>
    setOrd((o) => (o.k === k ? { k, d: (o.d * -1) as 1 | -1 } : { k, d: typeof linhas[0]?.[k] === 'string' ? 1 : -1 }));
  return (
    <>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c.k} className={`ord${c.num ? ' n' : ''}`} tabIndex={0}
                  aria-sort={ord.k === c.k ? (ord.d > 0 ? 'ascending' : 'descending') : undefined}
                  onClick={() => clicar(c.k)} onKeyDown={(e) => { if (e.key === 'Enter') clicar(c.k); }}>
                  {c.label}<span className="seta" aria-hidden="true">{ord.k === c.k ? (ord.d > 0 ? '↑' : '↓') : ''}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vis.length === 0 ? <tr><td colSpan={colunas.length} className="fraco">{vazio}</td></tr> : null}
            {vis.map((r) => (
              <tr key={chave(r)}>
                {colunas.map((c) => <td key={c.k} className={c.num ? 'n' : undefined}>{c.render ? c.render(r) : String(r[c.k] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {porPagina && paginas > 1 ? (
        <div className="tabela-rodape">
          <span>{ordenadas.length} registros · página {pag} de {paginas}</span>
          <span className="seg">
            <button type="button" onClick={() => setPag((p) => Math.max(1, p - 1))} disabled={pag <= 1}>Anterior</button>
            <button type="button" onClick={() => setPag((p) => Math.min(paginas, p + 1))} disabled={pag >= paginas}>Próxima</button>
          </span>
        </div>
      ) : null}
    </>
  );
}

/* ======================= mapa de calor ======================= */

export function MapaCalor({ linhas, colunas, valores, fmt, ativo, titulo }: {
  linhas: string[]; colunas: string[]; valores: number[][]; fmt: (v: number) => string; ativo?: (l: number, c: number) => boolean; titulo: string;
}) {
  const plano = valores.flat().filter(Number.isFinite);
  const mn = Math.min(...plano), mx = Math.max(...plano);
  const nivel = (v: number) => (mx === mn ? 0 : Math.round(((v - mn) / (mx - mn)) * 5));
  return (
    <>
      <div className="calor" role="table" aria-label={titulo} style={{ gridTemplateColumns: `minmax(90px, auto) repeat(${colunas.length}, minmax(0, 1fr))` }}>
        <div role="row" style={{ display: 'contents' }}>
          <span role="columnheader"><span className="sr">Linha</span></span>
          {colunas.map((c) => <span key={c} className="hh" role="columnheader">{c}</span>)}
        </div>
        {linhas.map((l, i) => (
          <div key={l} role="row" style={{ display: 'contents' }}>
            <span className="hl" role="rowheader">{l}</span>
            {colunas.map((c, j) => {
              const v = valores[i][j];
              const k = nivel(v);
              return (
                <span key={c} role="cell" className={`hc${ativo && !ativo(i, j) ? ' fora' : ''}`} title={`${l}, ${c}: ${fmt(v)}`}
                  style={{ background: `var(--seq-${Math.min(6, k + 1)})`, color: `var(--seq-ink-${Math.min(6, k + 1)})` }}>
                  {fmt(v)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="escala" aria-hidden="true">
        <span>menor</span>
        <span className="rampa">{[1, 2, 3, 4, 5, 6].map((i) => <i key={i} style={{ background: `var(--seq-${i})` }} />)}</span>
        <span>maior</span>
      </div>
    </>
  );
}

/** Se uma tela quebrar, mostra um aviso no lugar dela em vez de deixar a página em branco. */
class ProtecaoErro extends Component<{ chave: string; children: ReactNode }, { erro: boolean; chave: string }> {
  state = { erro: false, chave: this.props.chave };
  static getDerivedStateFromError() { return { erro: true }; }
  static getDerivedStateFromProps(p: { chave: string }, s: { erro: boolean; chave: string }) { return p.chave !== s.chave ? { erro: false, chave: p.chave } : null; }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="erro-tela" role="alert">
        <h2>Esta tela não carregou.</h2>
        <p>Tente limpar os filtros ou recarregar a página. As outras telas continuam funcionando.</p>
      </div>
    );
  }
}

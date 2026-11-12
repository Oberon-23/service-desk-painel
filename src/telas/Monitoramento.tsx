/*
 * Monitoramento: a central vista como um serviço monitorado (estilo NOC).
 *   1. Saúde de cada serviço: cor = pior alerta aberto ("mostre problemas, não status")
 *   2. Alertas ativos, com reconhecimento e tempo aberto
 *   3. Sinais de ouro das últimas 2 horas: volume, espera, abandono, ocupação
 *   4. Linha do tempo do dia por serviço e as regras de alerta, com os limites
 */
import { useMemo, useState } from 'react';
import { Activity, AlertOctagon, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import { Card, Legenda } from '../kit/ui';
import { Grafico, useCores } from '../kit/graficos';
import { fmtLimite, fmtValor, ORDEM_SERVICOS, REGRAS, SERVICOS, SEV_TXT, type Alerta, type Amostra, type Servico, type Sev } from '../operacao/alertas';
import { CANAIS, DIA_MIN, relogio } from '../operacao/motor';
import { useOperacao } from '../operacao/contexto';
import { dur } from './partes/formatos';

const ESTADO_TXT: Record<Sev | 'ok', string> = { ok: 'Normal', warn: 'Degradado', crit: 'Crítico' };
const soma = (s: Amostra[], f: (a: Amostra) => number) => s.reduce((t, a) => t + f(a), 0);
/** Janela móvel: para cada minuto, o valor dos últimos n minutos (null sem amostra suficiente). */
const movel = (s: Amostra[], n: number, f: (j: Amostra[]) => number | null) => s.map((_, i) => f(s.slice(Math.max(0, i - n + 1), i + 1)));

/** Leitura principal de cada serviço no cartão de saúde. */
function leituraServico(sv: Servico, serie: Amostra[], l: Record<string, { valor: number | null }>, vencidos: number) {
  const a = serie[serie.length - 1];
  if (!a) return '—';
  if (sv === 'telefone' || sv === 'chat' || sv === 'portal') return `${a.fila[sv]} na fila · maior espera ${fmtValor({ fmt: 'min' }, a.espera[sv])}`;
  if (sv === 'n1') return `nível ${fmtValor({ fmt: 'pct' }, l.ns?.valor ?? null)} · abandono ${fmtValor({ fmt: 'pct' }, l.abandono?.valor ?? null)} (30 min)`;
  if (sv === 'n2') return `${a.fila.n2} na fila · ${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}`;
  if (sv === 'equipe') return `ocupação ${fmtValor({ fmt: 'pct' }, l.ocupacao?.valor ?? null)} · aderência ${fmtValor({ fmt: 'pct' }, l.aderencia?.valor ?? null)}`;
  return l.csat?.valor == null ? 'poucas respostas na última hora' : `satisfação ${fmtValor({ fmt: 'pct' }, l.csat.valor)} na última hora`;
}

function Saude() {
  const { foto: f } = useOperacao();
  const m = f.monitor;
  const vencidos = f.n2.chamados.filter((k) => k.resta < 0).length;
  const abertos = m.alertas.filter((a) => a.resolvido === null);
  return (
    <section className="saude" aria-label="Saúde dos serviços">
      {ORDEM_SERVICOS.map((sv) => {
        const st = m.saude[sv];
        const meus = abertos.filter((a) => a.servico === sv);
        const Ic = st === 'crit' ? AlertOctagon : st === 'warn' ? AlertTriangle : CheckCircle2;
        return (
          <article key={sv} className={`saude-card ${st}`} aria-label={`${SERVICOS[sv].rotulo}: ${ESTADO_TXT[st]}`}>
            <header><h3>{SERVICOS[sv].rotulo}</h3><span className="saude-estado"><Ic size={14} aria-hidden="true" />{ESTADO_TXT[st]}</span></header>
            <p className="saude-leitura">{leituraServico(sv, m.serie, m.leituras, vencidos)}</p>
            <p className="saude-motivo">{meus.length ? meus.map((a) => a.nome).join(' · ') : 'Dentro dos limites'}</p>
          </article>
        );
      })}
    </section>
  );
}

function AlertasAtivos() {
  const { foto: f, agir } = useOperacao();
  const m = f.monitor;
  const abertos = m.alertas.filter((a) => a.resolvido === null).sort((a, b) => (a.sev === b.sev ? a.aberto - b.aberto : a.sev === 'crit' ? -1 : 1));
  const t = m.tempos;
  const hoje = m.alertas.length;
  return (
    <Card titulo={<span className="tit-ic"><Activity size={18} aria-hidden="true" />Alertas ativos</span>}
      sub="Um alerta abre depois de 2 minutos seguidos fora do limite e fecha depois de 3 minutos de volta ao normal. Reconhecer avisa que a coordenação já está tratando.">
      <ul className="resumo" aria-label="Alertas do dia">
        <li><span>Abertos agora</span><b className={abertos.some((a) => a.sev === 'crit') ? 'txt-bad' : ''}>{abertos.length}</b><small>{abertos.filter((a) => a.sev === 'crit').length} críticos</small></li>
        <li><span>Sem reconhecimento</span><b className={abertos.some((a) => a.reconhecido === null) ? 'txt-bad' : ''}>{abertos.filter((a) => a.reconhecido === null).length}</b><small>esperando alguém olhar</small></li>
        <li><span>Alertas hoje</span><b>{hoje}</b><small>{hoje - abertos.length} já normalizaram</small></li>
        <li><span>Tempo até reconhecer</span><b>{t.mtta === null ? '—' : dur(t.mtta)}</b><small>média (MTTA) · {t.nRec} casos</small></li>
        <li><span>Tempo até normalizar</span><b>{t.mttr === null ? '—' : dur(t.mttr)}</b><small>média (MTTR) · {t.nRes} casos</small></li>
      </ul>
      {abertos.length === 0 ? (
        <p className="atencao-ok"><CheckCircle2 size={18} aria-hidden="true" />Nenhum alerta aberto. Todos os sinais dentro dos limites.</p>
      ) : (
        <div className="tabela-resp tabela-alertas" role="region" aria-label="Lista de alertas ativos" tabIndex={0}>
          <table>
            <thead><tr><th>Severidade</th><th>Serviço</th><th>Alerta</th><th className="num">Agora</th><th>Limite</th><th className="num">Aberto há</th><th>Situação</th></tr></thead>
            <tbody>
              {abertos.map((a: Alerta) => {
                const r = REGRAS.find((x) => x.id === a.regra)!;
                return (
                  <tr key={a.id} className={a.sev === 'crit' ? 'vencido' : 'risco'}>
                    <td><span className={`pill ${a.sev === 'crit' ? 'bad' : 'warn'}`}>{SEV_TXT[a.sev]}</span></td>
                    <td>{SERVICOS[a.servico].rotulo}</td>
                    <td className="c-nome"><b>{a.nome}</b><small className="nivel">{r.janela}</small></td>
                    <td className="num">{a.sevAgora === null ? <span className="muted">normalizando</span> : fmtValor(r, a.valor)}</td>
                    <td className="mono">{a.limite}</td>
                    <td className="num">{dur(f.minuto - a.aberto)}</td>
                    <td className="c-acoes">
                      {a.reconhecido === null
                        ? <button type="button" className="btn-sec" onClick={() => agir((mo) => mo.reconhecer(a.id))} aria-label={`Reconhecer alerta: ${a.nome}`}><Eye size={14} aria-hidden="true" />Reconhecer</button>
                        : <span className="pill info">Reconhecido há {dur(f.minuto - a.reconhecido)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Um sinal de ouro: valor de agora, situação e a série das últimas 2 horas com os limites. */
function Sinal({ titulo, pergunta, valor, sev, children }: { titulo: string; pergunta: string; valor: string; sev: Sev | null | undefined; children: React.ReactNode }) {
  return (
    <article className="sinal card" aria-label={titulo}>
      <header>
        <div><h3>{titulo}</h3><p>{pergunta}</p></div>
        <div className="sinal-agora"><b>{valor}</b>{sev ? <span className={`pill ${sev === 'crit' ? 'bad' : 'warn'}`}>{SEV_TXT[sev]}</span> : <span className="pill ok">Normal</span>}</div>
      </header>
      {children}
    </article>
  );
}

function SinaisDeOuro() {
  const { foto: f } = useOperacao();
  const cores = useCores();
  const s = useMemo(() => f.monitor.serie.slice(-120), [f.monitor.serie]);
  const l = f.monitor.leituras;
  if (s.length < 5) return <Card titulo="Sinais de ouro"><p className="vazio">Juntando os primeiros minutos de dados…</p></Card>;
  const rot = s.map((a) => relogio(a.min));
  // volume em blocos de 5 minutos, contra o previsto
  const blocos: Amostra[][] = [];
  s.forEach((a, i) => { if (i % 5 === 0) blocos.push([]); blocos[blocos.length - 1].push(a); });
  const vol = blocos.map((b) => soma(b, (a) => a.chegadas)), prev = blocos.map((b) => soma(b, (a) => a.previsto));
  const espera = (k: 'telefone' | 'chat' | 'portal') => s.map((a) => a.espera[k] / CANAIS[k].alvo);
  const ab = movel(s, 15, (j) => { const d = soma(j, (a) => a.atendidos + a.abandonos); return d >= 5 ? soma(j, (a) => a.abandonos) / d : null; });
  const ns = movel(s, 15, (j) => { const d = soma(j, (a) => a.atendidos + a.abandonos); return d >= 5 ? soma(j, (a) => a.noAlvo) / d : null; });
  const oc = movel(s, 15, (j) => { const d = soma(j, (a) => a.disponiveis); return d ? soma(j, (a) => a.atendendo) / d : null; });
  const maxEsp = Math.max(4.5, ...espera('telefone'), ...espera('chat'), ...espera('portal'));
  const pior = (ids: string[]) => ids.map((i) => l[i]?.sev).find((x) => x === 'crit') ?? ids.map((i) => l[i]?.sev).find((x) => x === 'warn') ?? null;
  const pctF = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <section className="sinais" aria-label="Sinais de ouro das últimas 2 horas">
      <Sinal titulo="Volume" pergunta="Está chegando mais do que o previsto?" valor={fmtValor({ fmt: 'x' }, l.volume?.valor ?? null)} sev={pior(['volume'])}>
        <Legenda itens={[{ label: 'Contatos a cada 5 min', cor: cores.accent }, { label: 'Previsto', cor: cores.ink, tipo: 'linha' }]} />
        <Grafico rotulo="Contatos a cada 5 minutos nas últimas 2 horas, com o previsto" altura={170} n={blocos.length} rotulosX={blocos.map((b) => relogio(b[0].min))}
          y={{ min: 0, max: Math.max(6, ...vol, ...prev) * 1.15, fmt: (v) => String(Math.round(v)) }}
          camadas={[{ tipo: 'barras', valores: vol, cor: cores.accent, larguraMax: 14, raio: 3 }, { tipo: 'linha', valores: prev, cor: cores.ink }]}
          dica={(i) => ({ titulo: `${relogio(blocos[i][0].min)} a ${relogio(blocos[i][0].min + 5)}`, linhas: [{ nome: 'Chegaram', valor: String(vol[i]) }, { nome: 'Previsto', valor: prev[i].toFixed(1).replace('.', ',') }] })} />
      </Sinal>
      <Sinal titulo="Espera" pergunta="Alguém está esperando demais?" valor={fmtValor({ fmt: 'min' }, s[s.length - 1].espera.telefone)} sev={pior(['tel-espera', 'chat-espera', 'portal-espera'])}>
        <Legenda itens={[{ label: 'Telefone', cor: cores.c1 }, { label: 'Chat', cor: cores.c2 }, { label: 'Portal', cor: cores.c3 }, { label: 'Atenção (2×) e crítico (4×)', tipo: 'tracejado' }]} />
        <Grafico rotulo="Maior espera de cada canal em relação ao alvo, minuto a minuto" altura={170} n={s.length} rotulosX={rot}
          y={{ min: 0, max: maxEsp, fmt: (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×` }}
          camadas={[
            { tipo: 'linhaH', y: 2, tracejado: true, cor: cores.warn }, { tipo: 'linhaH', y: 4, tracejado: true, cor: cores.bad },
            { tipo: 'linha', valores: espera('portal'), cor: cores.c3, espessura: 1.5 }, { tipo: 'linha', valores: espera('chat'), cor: cores.c2, espessura: 1.5 }, { tipo: 'linha', valores: espera('telefone'), cor: cores.c1, espessura: 2 },
          ]}
          dica={(i) => ({ titulo: rot[i], linhas: (['telefone', 'chat', 'portal'] as const).map((k) => ({ nome: CANAIS[k].rotulo, valor: `${fmtValor({ fmt: 'min' }, s[i].espera[k])} (alvo ${CANAIS[k].alvo} min)` })) })} />
      </Sinal>
      <Sinal titulo="Abandono e nível de serviço" pergunta="Estamos perdendo contatos?" valor={fmtValor({ fmt: 'pct' }, l.abandono?.valor ?? null)} sev={pior(['abandono', 'ns'])}>
        <Legenda itens={[{ label: 'Nível de serviço (15 min)', cor: cores.good }, { label: 'Abandono (15 min)', cor: cores.bad }, { label: 'Metas 80% e 5%', tipo: 'tracejado' }]} />
        <Grafico rotulo="Nível de serviço e abandono em janela de 15 minutos" altura={170} n={s.length} rotulosX={rot}
          y={{ min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: pctF }}
          camadas={[{ tipo: 'linhaH', y: 0.8, tracejado: true, cor: cores.good }, { tipo: 'linhaH', y: 0.05, tracejado: true, cor: cores.bad }, { tipo: 'linha', valores: ns, cor: cores.good, espessura: 2 }, { tipo: 'linha', valores: ab, cor: cores.bad, espessura: 2 }]}
          dica={(i) => ({ titulo: rot[i], linhas: [{ nome: 'Nível de serviço', valor: ns[i] === null ? '—' : pctF(ns[i]!) }, { nome: 'Abandono', valor: ab[i] === null ? '—' : pctF(ab[i]!) }] })} />
      </Sinal>
      <Sinal titulo="Ocupação do N1" pergunta="A equipe está no limite?" valor={fmtValor({ fmt: 'pct' }, l.ocupacao?.valor ?? null)} sev={pior(['ocupacao'])}>
        <Legenda itens={[{ label: 'Ocupação (15 min)', cor: cores.accent }, { label: 'Atenção 90% e crítico 97%', tipo: 'tracejado' }]} />
        <Grafico rotulo="Ocupação do N1 em janela de 15 minutos" altura={170} n={s.length} rotulosX={rot}
          y={{ min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: pctF }}
          camadas={[{ tipo: 'linhaH', y: 0.9, tracejado: true, cor: cores.warn }, { tipo: 'linhaH', y: 0.97, tracejado: true, cor: cores.bad }, { tipo: 'linha', valores: oc, cor: cores.accent, espessura: 2 }]}
          dica={(i) => ({ titulo: rot[i], linhas: [{ nome: 'Ocupação', valor: oc[i] === null ? '—' : pctF(oc[i]!) }, { nome: 'Atendendo / disponíveis', valor: `${s[i].atendendo} / ${s[i].disponiveis}` }] })} />
      </Sinal>
    </section>
  );
}

/** O dia de cada serviço em blocos de 10 minutos, como uma página de status. */
function LinhaDoDia() {
  const { foto: f } = useOperacao();
  const m = f.monitor;
  const N = DIA_MIN / 10;
  const bloco = (sv: Servico, i: number): Sev | 'ok' | 'futuro' => {
    const de = i * 10, ate = de + 10;
    if (de > f.minuto) return 'futuro';
    let pior: Sev | 'ok' = 'ok';
    for (const a of m.alertas) if (a.servico === sv && a.aberto < ate && (a.resolvido ?? f.minuto) >= de) { if (a.sev === 'crit') return 'crit'; pior = 'warn'; }
    return pior;
  };
  const resolvidos = m.alertas.filter((a) => a.resolvido !== null).slice(0, 8);
  return (
    <Card titulo="Linha do tempo do dia" sub="Cada bloco é um intervalo de 10 minutos, das 8h às 18h. Verde: sem alerta; laranja: atenção; vermelho: crítico.">
      <div className="status-grade" role="list" aria-label="Situação de cada serviço ao longo do dia">
        <div className="status-eixo" aria-hidden="true"><span /><div>{[8, 10, 12, 14, 16, 18].map((h) => <i key={h} style={{ left: `${((h - 8) / 10) * 100}%` }}>{h}h</i>)}</div></div>
        {ORDEM_SERVICOS.map((sv) => {
          const bl = Array.from({ length: N }, (_, i) => bloco(sv, i));
          const ruins = bl.filter((b) => b === 'warn' || b === 'crit').length, passados = bl.filter((b) => b !== 'futuro').length;
          return (
            <div key={sv} className="status-linha" role="listitem" aria-label={`${SERVICOS[sv].rotulo}: ${ruins} de ${passados} intervalos com alerta`}>
              <span className="status-nome">{SERVICOS[sv].rotulo}<small>{passados ? `${Math.round(((passados - ruins) / passados) * 100)}% normal` : '—'}</small></span>
              <div className="status-blocos" aria-hidden="true">{bl.map((b, i) => <i key={i} className={b} title={`${relogio(i * 10)}–${relogio(i * 10 + 10)}: ${b === 'futuro' ? 'ainda não aconteceu' : ESTADO_TXT[b]}`} />)}</div>
            </div>
          );
        })}
      </div>
      {resolvidos.length > 0 && (
        <>
          <h3 className="sub-h">Normalizados hoje</h3>
          <ol className="feed" aria-label="Alertas que já normalizaram">
            {resolvidos.map((a) => <li key={a.id} className="alerta"><time>{relogio(a.aberto)}</time><span className="feed-tipo">{SEV_TXT[a.sev]}</span><span>{a.nome} ({SERVICOS[a.servico].rotulo}), aberto por {dur(a.resolvido! - a.aberto)}{a.reconhecido !== null ? `, reconhecido em ${dur(a.reconhecido - a.aberto)}` : ', sem reconhecimento'}.</span></li>)}
          </ol>
        </>
      )}
    </Card>
  );
}

function Regras() {
  const { foto: f } = useOperacao();
  const [aberto, setAberto] = useState(false);
  return (
    <Card titulo="Regras de alerta" sub="Os limites que acendem cada alerta, com o valor de agora. Transparência: todo alerta vem de uma regra escrita."
      acoes={<button type="button" className="btn-sec" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>{aberto ? 'Esconder regras' : `Ver as ${REGRAS.length} regras`}</button>}>
      {aberto && (
        <div className="tabela-resp tabela-regras" role="region" aria-label="Regras de alerta" tabIndex={0}>
          <table>
            <thead><tr><th>Serviço</th><th>Alerta</th><th>Janela</th><th>Atenção</th><th>Crítico</th><th className="num">Agora</th><th>Situação</th></tr></thead>
            <tbody>
              {REGRAS.map((r) => {
                const l = f.monitor.leituras[r.id];
                return (
                  <tr key={r.id}>
                    <td>{SERVICOS[r.servico].rotulo}</td><td className="c-nome"><b>{r.nome}</b></td><td>{r.janela}</td>
                    <td className="mono">{fmtLimite(r, r.warn)}</td><td className="mono">{fmtLimite(r, r.crit)}</td>
                    <td className="num">{fmtValor(r, l?.valor ?? null)}</td>
                    <td>{l?.sev ? <span className={`pill ${l.sev === 'crit' ? 'bad' : 'warn'}`}>{SEV_TXT[l.sev]}</span> : <span className="pill ok">Normal</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function Monitoramento() {
  const { foto: f } = useOperacao();
  const abertos = f.monitor.alertas.filter((a) => a.resolvido === null);
  const crit = abertos.filter((a) => a.sev === 'crit').length;
  return (
    <>
      <div className="secao-h">
        <h2>Saúde da central</h2>
        <span role="status">{abertos.length ? `${abertos.length} ${abertos.length === 1 ? 'alerta aberto' : 'alertas abertos'}${crit ? `, ${crit} ${crit === 1 ? 'crítico' : 'críticos'}` : ''}` : 'Todos os serviços normais'} · atualizado às {f.relogio}</span>
      </div>
      <Saude />
      <AlertasAtivos />
      <SinaisDeOuro />
      <LinhaDoDia />
      <Regras />
    </>
  );
}

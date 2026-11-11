/* Analistas: quem está em cada PA, como cada um está indo e a linha do tempo do dia. */
import { useState } from 'react';
import { LogIn, LogOut, Play } from 'lucide-react';
import { Card, Legenda } from '../kit/ui';
import { useCores } from '../kit/graficos';
import { DIA_MIN, MAX_PA, MOTIVOS, numPa, type AnalistaFoto } from '../operacao/motor';
import { useOperacao } from '../operacao/contexto';
import { aderencia, dur, META_ADERENCIA, pct, situacao, tempo } from './partes/formatos';
import { SeletorPausa } from './partes/Controles';

const rotuloEstado = (a: AnalistaFoto) => (a.estado === 'pausa' ? MOTIVOS[a.motivo ?? 'descanso'].rotulo : a.estado === 'atendendo' ? 'Atendendo' : 'Disponível');

/** Logar quem está fora numa PA livre do seu nível. */
function LogarForm() {
  const { foto: f, agir } = useOperacao();
  const [nome, setNome] = useState('');
  const [pa, setPa] = useState('');
  const fora = (nivel: 1 | 2) => f.analistas.filter((a) => a.nivel === nivel && a.pa === null);
  const quem = f.analistas.find((a) => a.nome === nome && a.pa === null);
  const pas = quem ? Array.from({ length: MAX_PA[quem.nivel] }, (_, i) => i).filter((i) => !f.analistas.some((a) => a.nivel === quem.nivel && a.pa === i)) : [];
  const paValida = pas.includes(+pa) && pa !== '' ? pa : pas.length ? String(pas[0]) : '';
  return (
    <form className="logar" aria-label="Logar analista" onSubmit={(e) => { e.preventDefault(); if (quem && paValida !== '') { agir((m) => m.logar(quem.nome, +paValida)); setNome(''); setPa(''); } }}>
      <label>Analista
        <select value={quem ? nome : ''} onChange={(e) => { setNome(e.target.value); setPa(''); }}>
          <option value="">Escolha quem vai logar</option>
          <optgroup label="N1">{fora(1).map((a) => <option key={a.nome} value={a.nome}>{a.nome}{a.escalado ? ' (da escala)' : ''}</option>)}</optgroup>
          <optgroup label="N2">{fora(2).map((a) => <option key={a.nome} value={a.nome}>{a.nome}{a.escalado ? ' (da escala)' : ''}</option>)}</optgroup>
        </select>
      </label>
      <label>PA
        <select value={paValida} onChange={(e) => setPa(e.target.value)} disabled={!quem || !pas.length}>
          {!quem ? <option value="">—</option> : pas.length ? pas.map((i) => <option key={i} value={i}>PA {numPa(quem.nivel, i)}</option>) : <option value="">Sem PA livre no N{quem.nivel}</option>}
        </select>
      </label>
      <button type="submit" className="btn-pri" disabled={!quem || paValida === ''}><LogIn size={15} aria-hidden="true" />Logar</button>
    </form>
  );
}

/** O dia de cada analista numa faixa: atendendo, disponível, em pausa. */
function LinhaDoTempo({ lista }: { lista: AnalistaFoto[] }) {
  const { foto: f } = useOperacao();
  const cores = useCores();
  const cor = { atendendo: cores.accent, livre: cores['seq-2'], pausa: cores.warn, fora: 'transparent' } as const;
  const W = 600, x = (m: number) => (Math.min(DIA_MIN, Math.max(0, m)) / DIA_MIN) * W;
  return (
    <Card titulo="Linha do tempo do dia" sub="Cada faixa é o dia de uma pessoa, das 8h às 18h. Muito tempo disponível indica folga; faixas de pausa longas ou fora de hora, problema de aderência.">
      <Legenda itens={[{ label: 'Atendendo', cor: cores.accent }, { label: 'Disponível', cor: cores['seq-2'] }, { label: 'Em pausa', cor: cores.warn }, { label: 'Agora', tipo: 'tracejado' }]} />
      <div className="tempo-grade">
        <div className="tempo-eixo" aria-hidden="true"><span /><div>{[8, 10, 12, 14, 16, 18].map((h) => <i key={h} style={{ left: `${((h - 8) / 10) * 100}%` }}>{h}h</i>)}</div></div>
        {lista.map((a) => {
          const tot = a.linha.reduce((s, g) => ({ ...s, [g.estado]: (s[g.estado] ?? 0) + ((g.ate ?? f.minuto) - g.de) }), {} as Record<string, number>);
          const base = (tot.atendendo ?? 0) + (tot.livre ?? 0) + (tot.pausa ?? 0) || 1;
          return (
            <div key={a.nome} className="tempo-linha">
              <span className="tempo-nome">{a.nome}<small>N{a.nivel}</small></span>
              <svg viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" role="img"
                aria-label={`${a.nome}: ${pct((tot.atendendo ?? 0) / base, 0)} do tempo atendendo, ${pct((tot.livre ?? 0) / base, 0)} disponível e ${pct((tot.pausa ?? 0) / base, 0)} em pausa`}>
                <rect x="0" y="0" width={W} height="14" fill={cores.line} />
                {a.linha.filter((g) => g.estado !== 'fora').map((g, i) => <rect key={i} x={x(g.de)} y="0" width={Math.max(0.4, x(g.ate ?? f.minuto) - x(g.de))} height="14" fill={cor[g.estado]} />)}
                <line x1={x(f.minuto)} x2={x(f.minuto)} y1="0" y2="14" stroke={cores.ink} strokeWidth="1.5" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function Analistas() {
  const { foto: f, agir } = useOperacao();
  const ad = aderencia(f);
  const lista = f.analistas.filter((a) => a.pa !== null).sort((a, b) => a.nivel - b.nivel || a.pa! - b.pa!);
  const livres = (nivel: 1 | 2) => Array.from({ length: MAX_PA[nivel] }, (_, i) => i).filter((i) => !f.analistas.some((a) => a.nivel === nivel && a.pa === i));
  const tmaN1 = f.dia.tma;
  return (
    <>
      <Card titulo="Equipe nas PAs" sub="Quem está logado entra na conta das filas e aparece com o nome na sala em 3D. Em pausa, a pessoa continua na PA, mas não recebe contatos.">
        <ul className="resumo" aria-label="Aderência à escala">
          <li><span>Aderência à escala</span><b className={ad.taxa < META_ADERENCIA ? 'txt-bad' : ''}>{pct(ad.taxa, 0)}</b><small>{ad.atendendo} de {ad.escalados} escalados atendendo · meta {pct(META_ADERENCIA, 0)}</small></li>
          <li><span>Em pausa agora</span><b className={ad.estouradas.length ? 'txt-bad' : ''}>{ad.emPausa.length}</b><small>{ad.estouradas.length ? `${ad.estouradas.length} acima do limite` : 'nenhuma acima do limite'}</small></li>
          <li><span>Tempo em pausa no dia</span><b>{pct(ad.pausaNoDia)}</b><small>do tempo logado da equipe</small></li>
          <li><span>Faltando da escala</span><b className={ad.ausentes.length ? 'txt-bad' : ''}>{ad.ausentes.length}</b><small>{ad.ausentes.length ? ad.ausentes.join(', ') : 'todos presentes'}</small></li>
          <li><span>Fora da escala</span><b>{ad.extras.length}</b><small>{ad.extras.length ? ad.extras.join(', ') : 'ninguém extra'}</small></li>
        </ul>
        <LogarForm />
        {lista.length === 0 ? <p className="vazio">Ninguém logado. Use “Logar analista” para abrir a operação.</p> : (
          <div className="tabela-resp tabela-equipe" role="region" aria-label="Analistas nas PAs" tabIndex={0}>
            <table>
              <thead>
                <tr><th>PA</th><th>Analista</th><th>Situação</th><th className="num">Há</th><th className="num">Atend.</th><th className="num">Tempo médio</th><th className="num">Resolve no 1º</th><th className="num">Satisfação</th><th className="num">Ocupação</th><th className="num">Pausa no dia</th><th><span className="sr-only">Ações</span></th></tr>
              </thead>
              <tbody>
                {lista.map((a) => {
                  const rot = `PA ${numPa(a.nivel, a.pa!)}`;
                  const lento = a.nivel === 1 && a.atend >= 8 && a.tma !== null && tmaN1 !== null && a.tma > tmaN1 * 1.25;
                  return (
                    <tr key={a.nome} className={a.estouro ? 'linha-bad' : a.estado === 'pausa' ? 'linha-warn' : ''}>
                      <td className="mono c-pa">{rot}<small className="nivel">N{a.nivel}</small></td>
                      <td className="c-nome"><b>{a.nome}</b></td>
                      <td className="c-sit"><span className={`pill ${situacao(a)}`}>{rotuloEstado(a)}</span></td>
                      <td className={`num${a.estouro ? ' txt-bad' : ''}`} data-r="Há">{a.estado === 'pausa' && a.motivo ? (a.estouro ? `${dur(a.noEstado)} (+${dur(a.estouro)})` : `${dur(a.noEstado)} de ${MOTIVOS[a.motivo].limite} min`) : dur(a.noEstado)}</td>
                      <td className="num" data-r="Atendimentos">{a.atend}</td>
                      <td className={`num${lento ? ' txt-bad' : ''}`} data-r="Tempo médio">{tempo(a.tma)}</td>
                      <td className="num" data-r="Resolve no 1º">{a.nivel === 1 ? pct(a.fcr, 0) : '—'}</td>
                      <td className="num" data-r="Satisfação">{a.csatN >= 3 ? pct(a.csat, 0) : '—'}</td>
                      <td className="num" data-r="Ocupação">{pct(a.ocupacao, 0)}</td>
                      <td className="num" data-r="Pausa no dia">{dur(a.pausaDia)}</td>
                      <td className="c-acoes"><div className="acoes-linha">
                        {a.estado === 'pausa'
                          ? <button type="button" className="btn-sec" onClick={() => agir((m) => m.voltar(a.nome))} aria-label={`Voltar ${a.nome} da pausa (${rot})`}><Play size={14} aria-hidden="true" />Voltar</button>
                          : <SeletorPausa rotulo={`Pausar ${a.nome} (${rot})`} onPausar={(mo) => agir((m) => m.pausar(a.nome, mo))} />}
                        <button type="button" className="btn-ic" onClick={() => agir((m) => m.deslogar(a.nome))} aria-label={`Deslogar ${a.nome} da ${rot}`} title="Deslogar"><LogOut size={15} /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="nota">Tempo médio em vermelho: mais de 25% acima da média do N1 ({tempo(tmaN1)}). Satisfação aparece a partir de 3 respostas. PAs livres: N1 {livres(1).map((i) => numPa(1, i)).join(', ') || 'nenhuma'} · N2 {livres(2).map((i) => numPa(2, i)).join(', ') || 'nenhuma'}.</p>
      </Card>
      <LinhaDoTempo lista={lista} />
    </>
  );
}

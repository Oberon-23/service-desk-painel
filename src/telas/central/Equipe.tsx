import { useState } from 'react';
import { LogIn, LogOut, Play } from 'lucide-react';
import { NOMES_N1, NOMES_N2 } from '../../fila';
import { Card } from '../../kit/ui';
import { MOTIVOS, type Placar, type Posto } from '../../central/tipos';
import { aderencia, dur, estouro, MAX_PA, META_ADERENCIA, numPa, pausaDe, pct, type Mudar } from './comum';
import { SeletorPausa } from './Controles';

/** Quem está em cada PA, pausas e aderência à escala. */
export default function Equipe({ postos, placar, onMudar, onVer }: { postos: Posto[]; placar: Placar | null; onMudar: Mudar; onVer: (nivel: 1 | 2, pa: number) => void }) {
  const ad = aderencia(postos, placar);
  const linhas = [...postos].sort((a, b) => a.nivel - b.nivel || a.pa - b.pa);
  const livres = (nivel: 1 | 2) => Array.from({ length: MAX_PA[nivel] }, (_, i) => i).filter((i) => !postos.some((p) => p.nivel === nivel && p.pa === i));

  return (
    <Card titulo="Equipe nas PAs" sub="Quem está logado entra na conta da fila e aparece com o nome na mesa da central 3D. Em pausa, a pessoa continua na PA, mas não recebe contatos.">
      <ul className="resumo" aria-label="Aderência à escala">
        <li><span>Aderência à escala</span><b className={ad.taxa < META_ADERENCIA ? 'txt-bad' : ''}>{pct(ad.taxa, 0)}</b><small>{ad.atendendo} de {ad.escalados} escalados atendendo · meta {pct(META_ADERENCIA, 0)}</small></li>
        <li><span>Em pausa agora</span><b className={ad.estouradas.length ? 'txt-bad' : ''}>{ad.emPausa.length}</b><small>{ad.estouradas.length ? `${ad.estouradas.length} acima do limite` : 'nenhuma acima do limite'}</small></li>
        <li><span>Tempo em pausa no dia</span><b>{ad.pausaNoDia === null ? '—' : pct(ad.pausaNoDia)}</b><small>do tempo logado da equipe</small></li>
        <li><span>Faltando da escala</span><b className={ad.ausentes.length ? 'txt-bad' : ''}>{ad.ausentes.length}</b><small>{ad.ausentes.length ? ad.ausentes.join(', ') : 'todos presentes'}</small></li>
        <li><span>Fora da escala</span><b>{ad.extras.length}</b><small>{ad.extras.length ? ad.extras.join(', ') : 'ninguém extra'}</small></li>
      </ul>

      <LogarForm postos={postos} livres={livres} onMudar={onMudar} />

      {linhas.length === 0 ? <p className="vazio">Ninguém logado. Use “Logar analista” para abrir a operação.</p> : (
        <div className="tabela-resp tabela-equipe" role="region" aria-label="Analistas nas PAs" tabIndex={0}>
          <table>
            <thead>
              <tr><th>PA</th><th>Analista</th><th>Situação</th><th className="num">Tempo na pausa</th><th className="num">Pausa no dia</th><th className="num">Atendimentos</th><th><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {linhas.map((p) => {
                const rot = `PA ${numPa(p.nivel, p.pa)}`;
                const pausa = pausaDe(placar, p);
                const acima = estouro(p, pausa);
                const mesa = placar?.mesas.find((m) => m.nivel === p.nivel && m.pa === p.pa);
                const t = placar?.tempo[p.nome];
                const motivo = MOTIVOS[p.motivo ?? 'descanso'];
                const situacao = p.estado === 'pausa'
                  ? <span className={`pill ${acima ? 'bad' : 'warn'}`}>{motivo.rotulo}</span>
                  : <span className={`pill ${mesa?.estado === 'atendendo' ? 'info' : 'ok'}`}>{mesa?.estado === 'atendendo' ? 'Atendendo' : 'Disponível'}</span>;
                return (
                  <tr key={`${p.nivel}-${p.pa}`} className={acima ? 'linha-bad' : p.estado === 'pausa' ? 'linha-warn' : ''}>
                    <td className="mono c-pa">{rot}<small className="nivel">N{p.nivel}</small></td>
                    <td className="c-nome"><button type="button" className="link" onClick={() => onVer(p.nivel, p.pa)} title="Ver na central 3D">{p.nome}</button></td>
                    <td className="c-sit">{situacao}</td>
                    <td className={`num c-pausa${acima ? ' txt-bad' : ''}`} data-vazio={p.estado !== 'pausa' || undefined}>{p.estado === 'pausa' ? (pausa == null ? '—' : acima ? `${dur(pausa)} (+${dur(acima)})` : `${dur(pausa)} de ${motivo.limite} min`) : '—'}</td>
                    <td className="num c-dia">{t ? dur(t.pausa) : '—'}</td>
                    <td className="num c-at">{mesa?.feitos ?? '—'}</td>
                    <td className="c-acoes"><div className="acoes-linha">
                      {p.estado === 'logado'
                        ? <SeletorPausa rotulo={`Pausar ${p.nome} (${rot})`} onPausar={(m) => onMudar(p.nivel, p.pa, 'pausa', undefined, m)} />
                        : <button type="button" className="btn-sec" onClick={() => onMudar(p.nivel, p.pa, 'logado')} aria-label={`Voltar ${p.nome} da pausa (${rot})`}><Play size={14} aria-hidden="true" />Voltar</button>}
                      <button type="button" className="btn-ic" onClick={() => onMudar(p.nivel, p.pa, 'fora')} aria-label={`Deslogar ${p.nome} da ${rot}`} title="Deslogar"><LogOut size={15} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="nota">PAs livres: N1 {livres(1).map((i) => numPa(1, i)).join(', ') || 'nenhuma'} · N2 {livres(2).map((i) => numPa(2, i)).join(', ') || 'nenhuma'}.</p>
    </Card>
  );
}

/** Logar quem está fora numa PA livre do seu nível. */
function LogarForm({ postos, livres, onMudar }: { postos: Posto[]; livres: (n: 1 | 2) => number[]; onMudar: Mudar }) {
  const fora = (nomes: string[]) => nomes.filter((n) => !postos.some((p) => p.nome === n));
  const [nome, setNome] = useState('');
  const [pa, setPa] = useState('');
  const nivel: 1 | 2 | null = NOMES_N1.includes(nome) ? 1 : NOMES_N2.includes(nome) ? 2 : null;
  const pas = nivel ? livres(nivel) : [];
  const paValida = pas.includes(+pa) ? pa : pas.length ? String(pas[0]) : '';
  const logar = () => { if (nivel && paValida !== '') { onMudar(nivel, +paValida, 'logado', nome); setNome(''); setPa(''); } };
  return (
    <form className="logar" onSubmit={(e) => { e.preventDefault(); logar(); }} aria-label="Logar analista">
      <label>Analista
        <select value={nome} onChange={(e) => { setNome(e.target.value); setPa(''); }}>
          <option value="">Escolha quem vai logar</option>
          <optgroup label="N1">{fora(NOMES_N1).map((n) => <option key={n}>{n}</option>)}</optgroup>
          <optgroup label="N2">{fora(NOMES_N2).map((n) => <option key={n}>{n}</option>)}</optgroup>
        </select>
      </label>
      <label>PA
        <select value={paValida} onChange={(e) => setPa(e.target.value)} disabled={!nivel || !pas.length}>
          {!nivel ? <option value="">—</option> : pas.length ? pas.map((i) => <option key={i} value={i}>PA {numPa(nivel, i)}</option>) : <option value="">Sem PA livre no N{nivel}</option>}
        </select>
      </label>
      <button type="submit" className="btn-pri" disabled={!nivel || paValida === ''}><LogIn size={15} aria-hidden="true" />Logar</button>
    </form>
  );
}

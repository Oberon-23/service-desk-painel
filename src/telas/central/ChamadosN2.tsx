import { useState } from 'react';
import { Card } from '../../kit/ui';
import { SLA_PRIO, type ChamadoN2, type Placar } from '../../central/tipos';
import { dur, numPa, pct } from './comum';

/** Chamados abertos no N2, do que vence primeiro ao último. */
export default function ChamadosN2({ chamados, placar }: { chamados: ChamadoN2[] | null; placar: Placar | null }) {
  const [todos, setTodos] = useState(false);
  if (!chamados || !placar) {
    return <Card titulo="Chamados do N2 por prazo" sub="Aparece quando a central 3D estiver rodando."><p className="card-sub">Carregando os chamados…</p></Card>;
  }
  const vencidos = chamados.filter((k) => k.resta < 0);
  const vencem1h = chamados.filter((k) => k.resta >= 0 && k.resta <= 60);
  const resolvidos = placar.n2NoPrazo + placar.n2Atrasados;
  const lista = todos ? chamados : chamados.slice(0, 8);
  const situacao = (k: ChamadoN2) => (k.resta < 0 ? 'vencido' : k.resta <= 60 ? 'risco' : 'ok');
  return (
    <Card titulo="Chamados do N2 por prazo"
      sub={`Ordem de atendimento: o que vence primeiro. Prazo por prioridade (horas úteis): P1 ${SLA_PRIO[1]} h · P2 ${SLA_PRIO[2]} h · P3 ${SLA_PRIO[3]} h · P4 ${SLA_PRIO[4]} h.`}>
      <ul className="resumo" aria-label="Situação do N2">
        <li><span>Abertos</span><b>{chamados.length}</b></li>
        <li><span>Vencidos</span><b className={vencidos.length ? 'var-ruim' : ''}>{vencidos.length}</b></li>
        <li><span>Vencem em até 1 h</span><b className={vencem1h.length ? 'var-alerta' : ''}>{vencem1h.length}</b></li>
        <li><span>Em atendimento</span><b>{chamados.filter((k) => k.com).length}</b></li>
        <li><span>Resolvidos no prazo hoje</span><b>{resolvidos ? pct(placar.n2NoPrazo / resolvidos, 0) : '—'}</b></li>
      </ul>
      {chamados.length === 0 ? <p className="vazio">Nenhum chamado aberto no N2 agora.</p> : (
        <div className="tabela-resp tabela-n2" role="region" aria-label="Lista de chamados do N2" tabIndex={0}>
          <table>
            <thead><tr><th>Chamado</th><th>Prioridade</th><th>Assunto</th><th>Com quem</th><th className="num">Escalado há</th><th>Prazo</th></tr></thead>
            <tbody>
              {lista.map((k) => (
                <tr key={k.cod} className={situacao(k)}>
                  <td className="mono">{k.cod}</td>
                  <td><span className={`prio p${k.prio}`}>P{k.prio}</span></td>
                  <td>{k.assunto}</td>
                  <td>{k.com ? `${k.com.nome} · PA ${numPa(2, k.com.pa)}` : <span className="muted">Na fila</span>}</td>
                  <td className="num">{dur(k.aberto)}</td>
                  <td><span className={`pill ${situacao(k) === 'vencido' ? 'bad' : situacao(k) === 'risco' ? 'warn' : 'ok'}`}>{k.resta < 0 ? `Vencido há ${dur(-k.resta)}` : `Vence em ${dur(k.resta)}`}</span></td>
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


/* Mural: a tela para a TV da sala. Só o que a equipe precisa ver de longe. */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { META_NS } from '../fila';
import { CANAIS, ORDEM_CANAIS } from '../operacao/motor';
import { ORDEM_SERVICOS, SERVICOS } from '../operacao/alertas';
import { useOperacao } from '../operacao/contexto';
import Sala3D, { Relogio } from './partes/Sala3D';
import { pct, st, tempo } from './partes/formatos';

export default function Mural() {
  const { foto: f, sugestoes } = useOperacao();
  useEffect(() => { document.title = 'Mural · Service Desk'; }, []);
  const n1 = f.analistas.filter((a) => a.nivel === 1);
  const conta = (e: string) => n1.filter((a) => a.estado === e).length;
  const vencidos = f.n2.chamados.filter((k) => k.resta < 0).length;
  const sNs = f.dia.ns === null ? 'ok' : st(f.dia.ns >= META_NS, f.dia.ns >= META_NS - 0.05);
  const alerta = sugestoes.find((s) => s.nivel === 'bad') ?? sugestoes.find((s) => s.nivel === 'warn');
  return (
    <main className="mural" id="conteudo">
      <header className="mural-topo">
        <h1>Service Desk <small>Grupo Rotalume · mural</small></h1>
        <Relogio />
        <Link to="/" className="btn-ic" aria-label="Sair do mural"><X size={18} /></Link>
      </header>
      {alerta
        ? <p className={`mural-aviso ${alerta.nivel}`} role="status"><b>{alerta.titulo}</b></p>
        : <p className="mural-aviso ok" role="status"><b>Operação dentro das metas</b></p>}
      <ul className="mural-saude" aria-label="Saúde dos serviços">
        {ORDEM_SERVICOS.map((sv) => <li key={sv} className={f.monitor.saude[sv]}><i aria-hidden="true" />{SERVICOS[sv].rotulo}<b>{f.monitor.saude[sv] === 'ok' ? 'Normal' : f.monitor.saude[sv] === 'crit' ? 'Crítico' : 'Degradado'}</b></li>)}
      </ul>
      <section className="mural-grade" aria-label="Números de agora">
        <div className={`mural-bloco ${sNs}`}><span>Nível de serviço hoje</span><b>{pct(f.dia.ns, 0)}</b><small>meta {pct(META_NS, 0)}</small></div>
        {ORDEM_CANAIS.map((k) => {
          const q = f.filas[k], aperto = q.esperando > 0 && q.maiorEspera > CANAIS[k].alvo;
          return <div key={k} className={`mural-bloco ${aperto ? 'bad' : ''}`}><span>{CANAIS[k].rotulo}: esperando</span><b>{q.esperando}</b><small>{q.esperando ? `maior espera ${tempo(q.maiorEspera)}` : 'fila zerada'}</small></div>;
        })}
        <div className="mural-bloco"><span>N1 livres agora</span><b>{conta('livre')}</b><small>{conta('atendendo')} atendendo · {conta('pausa')} em pausa</small></div>
        <div className={`mural-bloco ${vencidos ? 'bad' : ''}`}><span>N2: chamados na fila</span><b>{f.n2.fila}</b><small>{vencidos ? `${vencidos} vencidos` : 'nenhum vencido'}</small></div>
      </section>
      <Sala3D mural />
    </main>
  );
}

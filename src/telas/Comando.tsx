/*
 * Comando: a tela da coordenação durante o turno.
 *   1. Agora: cinco indicadores do dia até este momento
 *   2. A sala em 3D e o copiloto (o que fazer em seguida)
 *   3. Treino de crise e histórico do turno
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Headset, MonitorPlay, RotateCcw, Siren } from 'lucide-react';
import { CATEGORIAS } from '../fila';
import { Card } from '../kit/ui';
import { CRISES, relogio, type TipoCrise } from '../operacao/motor';
import { useOperacao } from '../operacao/contexto';
import Indicadores from './partes/Indicadores';
import Copiloto from './partes/Copiloto';
import Sala3D from './partes/Sala3D';
import { dur } from './partes/formatos';

const TIPO_TXT = { equipe: 'Equipe', fila: 'Filas', n2: 'N2', crise: 'Crise', copiloto: 'Copiloto' } as const;

export default function Comando() {
  const { foto: f, agir } = useOperacao();
  const [filtro, setFiltro] = useState<'tudo' | keyof typeof TIPO_TXT>('tudo');
  const feed = f.feed.filter((e) => filtro === 'tudo' || e.tipo === filtro);
  return (
    <>
      <div className="secao-h">
        <h2>Agora</h2>
        <span>Hoje até {f.relogio} · simulação</span>
        <Link className="btn-sec secao-acao" to="/mural"><MonitorPlay size={14} aria-hidden="true" />Abrir mural</Link>
      </div>
      <Indicadores />

      <div className="console-grid">
        <Card className="fab-card" titulo={<span className="tit-ic"><Headset size={18} aria-hidden="true" />Sala em 3D</span>}
          sub="Cada cubo é um contato: sai do totem do canal, espera na raia e vai para a mesa de quem atende. Azul no N1, laranja no N2. Clique numa mesa para ver o analista.">
          <Sala3D />
        </Card>
        <Copiloto />
      </div>

      <div className="duas">
        <Card titulo={<span className="tit-ic"><Siren size={18} aria-hidden="true" />Treino de crise</span>} sub="Provoque um problema e veja a operação reagir. O copiloto deve apontar a saída."
          acoes={f.alterado ? <button type="button" className="limpar" onClick={() => agir((m) => m.iniciar())}><RotateCcw size={14} aria-hidden="true" />Recomeçar o dia</button> : undefined}>
          <ul className="crises">
            {(Object.keys(CRISES) as TipoCrise[]).map((t) => (
              <li key={t}>
                <div><b>{CRISES[t].rotulo}</b><span>{CRISES[t].texto}</span></div>
                <button type="button" className="btn-sec" disabled={t !== 'faltas' && !!f.surto} onClick={() => agir((m) => m.injetar(t))}>Disparar</button>
              </li>
            ))}
          </ul>
          <p className="nota" role="status">
            {f.surto ? `Em andamento: ${f.surto.rotulo}, mais ${dur(f.surto.resta)}.` : 'Nenhuma crise em andamento.'}
            {f.incidente ? ` Incidente ${f.incidente.cod} (${CATEGORIAS[f.incidente.cat]}) declarado às ${relogio(f.incidente.desde)}; ${f.dia.desviados} contatos segurados pelo aviso.` : ''}
          </p>
        </Card>

        <Card titulo="Histórico do turno" sub="O que mudou na operação, do mais recente ao mais antigo."
          acoes={<label className="campo-mini">Mostrar
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="tudo">Tudo</option>
              {(Object.keys(TIPO_TXT) as (keyof typeof TIPO_TXT)[]).map((k) => <option key={k} value={k}>{TIPO_TXT[k]}</option>)}
            </select>
          </label>}>
          {feed.length === 0 ? <p className="vazio">Nada registrado ainda. Pausas, logins, crises e ações do copiloto aparecem aqui.</p> : (
            <ol className="feed" aria-label="Histórico do turno">
              {feed.slice(0, 14).map((e) => <li key={e.id} className={e.tipo}><time>{relogio(e.min)}</time><span className="feed-tipo">{TIPO_TXT[e.tipo]}</span><span>{e.texto}</span></li>)}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}

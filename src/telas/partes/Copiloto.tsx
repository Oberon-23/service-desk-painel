import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Lightbulb, Sparkles } from 'lucide-react';
import { Card } from '../../kit/ui';
import { aplicar, type Sugestao } from '../../operacao/copiloto';
import { useOperacao } from '../../operacao/contexto';

const ROTA_TXT = { '/filas': 'Ver filas', '/analistas': 'Ver analistas', '/planejamento': 'Ver planejamento' } as const;

/** Próximas ações sugeridas, do mais grave ao menos grave, com um clique para aplicar. */
export default function Copiloto({ limite }: { limite?: number }) {
  const { sugestoes, agir } = useOperacao();
  const ir = useNavigate();
  const itens = limite ? sugestoes.slice(0, limite) : sugestoes;
  const graves = sugestoes.filter((s) => s.nivel !== 'info').length;
  return (
    <Card className="copiloto" titulo={<span className="tit-ic"><Sparkles size={18} aria-hidden="true" />Copiloto</span>}
      sub={sugestoes.length ? `${graves ? `${graves} ${graves === 1 ? 'ponto pede' : 'pontos pedem'} ação` : 'Nada urgente'}${sugestoes.length > graves ? ` e ${sugestoes.length - graves} ${sugestoes.length - graves === 1 ? 'oportunidade' : 'oportunidades'}` : ''}. Regras sobre o estado da operação e o modelo de fila.` : 'Regras sobre o estado da operação e o modelo de fila.'}>
      {sugestoes.length === 0 ? (
        <p className="atencao-ok"><CheckCircle2 size={18} aria-hidden="true" />Operação dentro das metas. Nenhuma ação sugerida agora.</p>
      ) : (
        <ul className="atencao-lista" aria-label="Sugestões do copiloto">
          {itens.map((s: Sugestao) => (
            <li key={s.id} className={s.nivel}>
              {s.nivel === 'info' ? <Lightbulb size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
              <div>
                <b>{s.titulo}</b><span>{s.texto}</span>
                {(s.acao || s.ver) && (
                  <span className="atencao-acoes">
                    {s.acao && <button type="button" className="btn-pri pequeno" onClick={() => agir((m) => aplicar(m, s))}>{s.acao.rotulo}</button>}
                    {s.ver && <button type="button" className="btn-sec" onClick={() => ir(s.ver!)}>{ROTA_TXT[s.ver]}<ArrowRight size={14} aria-hidden="true" /></button>}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

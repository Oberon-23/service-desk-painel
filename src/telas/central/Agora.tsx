import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { META_NS } from '../../fila';
import { Card, Kpis } from '../../kit/ui';
import type { Posto } from '../../central/tipos';
import { aderencia, META_ABANDONO, META_ADERENCIA, pct, st, type Aba, type Atencao, type Vivo } from './comum';

/** Indicadores do dia até agora, vindos da simulação ao vivo. */
export function IndicadoresAgora({ vivo, postos }: { vivo: Vivo | null; postos: Posto[] }) {
  const p = vivo?.placar;
  const tot = p ? p.atendidos + p.abandonos : 0;
  const ns = p && tot ? p.noPrazo / tot : null;
  const ab = p && tot ? p.abandonos / tot : null;
  const ad = aderencia(postos, p ?? null);
  const vencidos = vivo ? vivo.chamados.filter((k) => k.resta < 0).length : null;
  const risco = vivo ? vivo.chamados.filter((k) => k.resta >= 0 && k.resta <= 60).length : 0;
  return (
    <Kpis rotulo="Indicadores de agora" itens={[
      { label: 'Nível de serviço', tip: 'Hoje, até agora: contatos atendidos em até 60 segundos ÷ contatos que chegaram ao fim da fila.', value: ns === null ? '—' : pct(ns), target: `Meta ≥ ${pct(META_NS, 0)}`, status: ns === null ? undefined : st(ns >= META_NS, ns >= META_NS - 0.05) },
      { label: 'Na fila agora', tip: 'Contatos esperando atendimento neste momento.', value: p ? `${p.filaN1} · ${p.filaN2}` : '—', note: 'N1 · N2' },
      { label: 'Abandono', tip: 'Hoje, até agora: contatos que desistiram de esperar.', value: ab === null ? '—' : pct(ab), target: `Meta ≤ ${pct(META_ABANDONO, 0)}`, status: ab === null ? undefined : st(ab <= META_ABANDONO, ab <= META_ABANDONO * 1.6) },
      { label: 'Aderência', tip: 'Escalados de hoje que estão logados e disponíveis (não em pausa).', value: pct(ad.taxa, 0), target: `Meta ≥ ${pct(META_ADERENCIA, 0)}`, status: st(ad.taxa >= META_ADERENCIA, ad.taxa >= META_ADERENCIA - 0.1) },
      { label: 'N2 vencidos', tip: 'Chamados abertos no N2 que já passaram do prazo da prioridade.', value: vencidos === null ? '—' : String(vencidos), note: risco ? `${risco} vencem em até 1 h` : 'nenhum vence em até 1 h', status: vencidos === null ? undefined : vencidos ? 'bad' : risco ? 'warn' : 'ok', statusText: vencidos ? 'Vencidos' : risco ? 'Atenção' : 'No prazo' },
    ]} />
  );
}

/** O que pede ação da coordenação agora. Cada item leva à aba onde se resolve. */
export function PontosDeAtencao({ itens, pronto, onAbrir }: { itens: Atencao[]; pronto: boolean; onAbrir: (a: Atencao) => void }) {
  return (
    <Card className="atencao" titulo="Pontos de atenção" sub={pronto ? (itens.length ? `${itens.length} ${itens.length === 1 ? 'item pede' : 'itens pedem'} ação agora, do mais grave ao menos grave.` : undefined) : 'Aparecem quando a central estiver rodando.'}>
      {pronto && itens.length === 0 ? (
        <p className="atencao-ok"><CheckCircle2 size={18} aria-hidden="true" />Nada pedindo atenção agora.</p>
      ) : (
        <ul className="atencao-lista" aria-label="Pontos de atenção">
          {itens.map((a) => (
            <li key={a.id} className={a.nivel}>
              <AlertTriangle size={16} aria-hidden="true" />
              <div><b>{a.titulo}</b><span>{a.texto}</span></div>
              <button type="button" className="btn-ic" onClick={() => onAbrir(a)} aria-label={`Abrir: ${a.titulo}`} title={`Abrir em ${ABA_TXT[a.aba]}`}><ChevronRight size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
const ABA_TXT: Record<Aba, string> = { equipe: 'Equipe', chamados: 'Chamados do N2', simulador: 'Simulador' };

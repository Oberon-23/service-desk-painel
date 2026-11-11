import { META_NS } from '../../fila';
import { Kpis } from '../../kit/ui';
import { ORDEM_CANAIS } from '../../operacao/motor';
import { useOperacao } from '../../operacao/contexto';
import { META_ABANDONO, META_CSAT, pct, st } from './formatos';

/** Os cinco números do dia até agora: velocidade junto com qualidade. */
export default function Indicadores() {
  const { foto: f } = useOperacao();
  const d = f.dia;
  const fila = ORDEM_CANAIS.reduce((s, k) => s + f.filas[k].esperando, 0);
  const vencidos = f.n2.chamados.filter((k) => k.resta < 0).length, risco = f.n2.chamados.filter((k) => k.resta >= 0 && k.resta <= 60).length;
  return (
    <Kpis rotulo="Indicadores de agora" itens={[
      { label: 'Nível de serviço', tip: 'Hoje, até agora: contatos atendidos dentro do alvo do canal (telefone 1 min, chat 2 min, portal 15 min) ÷ contatos atendidos ou que desistiram.', value: pct(d.ns), target: `Meta ≥ ${pct(META_NS, 0)}`, status: d.ns === null ? undefined : st(d.ns >= META_NS, d.ns >= META_NS - 0.05) },
      { label: 'Na fila agora', tip: 'Contatos esperando o N1 (telefone, chat e portal) e chamados na fila do N2 neste momento.', value: `${fila} · ${f.n2.fila}`, note: 'N1 · N2' },
      { label: 'Abandono', tip: 'Hoje, até agora: contatos de telefone e chat que desistiram de esperar.', value: pct(d.abandono), target: `Meta ≤ ${pct(META_ABANDONO, 0)}`, status: d.abandono === null ? undefined : st(d.abandono <= META_ABANDONO, d.abandono <= META_ABANDONO * 1.6) },
      { label: 'Satisfação', tip: `Hoje, até agora: respostas "satisfeito" ÷ respostas da pesquisa enviada ao fim do atendimento (${d.csatN} respostas).`, value: pct(d.csat, 0), target: `Meta ≥ ${pct(META_CSAT, 0)}`, status: d.csat === null ? undefined : st(d.csat >= META_CSAT, d.csat >= META_CSAT - 0.05) },
      { label: 'N2 vencidos', tip: 'Chamados abertos no N2 que já passaram do prazo da prioridade.', value: String(vencidos), note: risco ? `${risco} vencem em até 1 h` : 'nenhum vence em até 1 h', status: vencidos ? 'bad' : risco ? 'warn' : 'ok', statusText: vencidos ? 'Vencidos' : risco ? 'Atenção' : 'No prazo' },
    ]} />
  );
}

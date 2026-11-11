import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { ATUAL, META_NS, melhorAlavanca, simular, type Cenario } from '../../fila';
import { Card, Kpis, Legenda, Manchete } from '../../kit/ui';
import { Grafico, useCores } from '../../kit/graficos';
import { brl, META_ABANDONO, META_SLA_N2, num, pct, pp, st, tempo } from './comum';
import { Chave, Faixa } from './Controles';

function Var({ v, bom, fmt }: { v: number; bom: 'sobe' | 'desce'; fmt: (x: number) => string }) {
  if (Math.abs(v) < 1e-4) return <span className="var-neutra">igual a hoje</span>;
  const melhor = bom === 'sobe' ? v > 0 : v < 0;
  return <span className={melhor ? 'var-boa' : 'var-ruim'}>{fmt(v)} vs hoje</span>;
}

/** Previsão do dia pelo modelo de fila (Erlang C) e as alavancas do “e se”. */
export default function Simulador({ c, alterado, onSet, onVoltar }: { c: Cenario; alterado: boolean; onSet: <K extends keyof Cenario>(k: K, v: Cenario[K]) => void; onVoltar: () => void }) {
  const r = useMemo(() => simular(c), [c]);
  const hoje = useMemo(() => simular(ATUAL), []);
  const dica = useMemo(() => melhorAlavanca(c), [c]);
  const cores = useCores();
  const ph = r.piorHora;
  const status = st(r.ns >= META_NS && ph.ns >= META_NS - 0.1, r.ns >= META_NS - 0.05);
  const titulo = r.ns >= META_NS
    ? `${pct(r.ns)} dos contatos atendidos em até 60 s no dia, mas às ${ph.hora}h o nível cai para ${pct(ph.ns, 0)}.`
    : `Só ${pct(r.ns)} dos contatos atendidos em até 60 s no dia; às ${ph.hora}h, ${pct(ph.ns, 0)}.`;

  return (
    <div className="sim-grid">
      <div className="sim-principal">
        <Manchete status={status} titulo={alterado ? `Neste cenário: ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}` : titulo}
          texto={<>
            {r.slaN2 < META_SLA_N2 ? <>O N2 resolveria só {pct(r.slaN2, 0)} dos chamados em até 8 horas. </> : null}
            {dica ? <>Alavanca que mais ajuda: <b>{dica.nome.toLowerCase()}</b> ({pp(dica.ganho)} no nível de serviço).</> : 'O nível de serviço já está no teto deste modelo.'}
          </>} />
        <Kpis itens={[
          { label: 'Nível de serviço', tip: 'Previsão do modelo: contatos atendidos em até 60 segundos ÷ contatos recebidos no dia.', value: pct(r.ns), target: `Meta ≥ ${pct(META_NS, 0)}`, status: st(r.ns >= META_NS, r.ns >= META_NS - 0.05), delta: <Var v={r.ns - hoje.ns} bom="sobe" fmt={pp} /> },
          { label: 'Espera média', tip: 'Previsão do modelo: tempo médio na fila até um analista atender.', value: tempo(r.espera), delta: <Var v={r.espera - hoje.espera} bom="desce" fmt={(x) => `${x > 0 ? '+' : '−'}${tempo(Math.abs(x))}`} /> },
          { label: 'Abandono', tip: 'Previsão do modelo: contatos que desistem antes de ser atendidos.', value: pct(r.abandono), target: `Meta ≤ ${pct(META_ABANDONO, 0)}`, status: st(r.abandono <= META_ABANDONO, r.abandono <= META_ABANDONO * 1.6), delta: <Var v={r.abandono - hoje.abandono} bom="desce" fmt={pp} /> },
          { label: 'SLA do N2', tip: 'Previsão do modelo: chamados escalados resolvidos em até 8 horas úteis.', value: pct(r.slaN2, 0), target: `Meta ≥ ${pct(META_SLA_N2, 0)}`, status: st(r.slaN2 >= META_SLA_N2, r.slaN2 >= META_SLA_N2 - 0.1), delta: <Var v={r.slaN2 - hoje.slaN2} bom="sobe" fmt={pp} /> },
        ]} />
        <Card titulo="Hora a hora" sub="Nível de serviço previsto em cada hora. Horas abaixo da meta mostram onde reforçar a escala (aba Dimensionamento).">
          <Legenda itens={[{ label: 'Na meta (≥ 80%)', cor: cores.good }, { label: 'Abaixo da meta', cor: cores.bad }, { label: 'Meta', tipo: 'tracejado' }]} />
          <Grafico rotulo="Nível de serviço por hora" altura={240} n={r.horas.length} rotulosX={r.horas.map((h) => `${h.hora}h`)}
            y={{ min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: (v) => `${num(v * 100)}%` }}
            camadas={[
              { tipo: 'barras', valores: r.horas.map((h) => h.ns), larguraMax: 44, raio: 5, cor: (i) => (r.horas[i].ns >= META_NS ? cores.good : cores.bad), rotulos: r.horas.map((h) => pct(h.ns, 0)) },
              { tipo: 'linhaH', y: META_NS, tracejado: true, rotulo: 'Meta 80%' },
            ]}
            dica={(i) => { const h = r.horas[i]; return { titulo: `${h.hora}h às ${h.hora + 1}h`, linhas: [{ nome: 'Contatos', valor: num(h.chegadas) }, { nome: 'Nível de serviço', valor: pct(h.ns) }, { nome: 'Espera média', valor: tempo(h.espera) }, { nome: 'Abandono', valor: pct(h.abandono) }, { nome: 'Ocupação dos analistas', valor: pct(h.ocupacao, 0) }] }; }} />
          <p className="nota">
            No dia: {num(r.contatos)} contatos, {num(r.atendidos)} atendidos, {num(r.escalados)} escalados para o N2.
            Ocupação média do N1 {pct(r.ocupacao, 0)} e do N2 {pct(r.ocupacaoN2, 0)}. Custo da equipe {brl(r.custoDia)} por dia, {brl(r.custoPorContato)} por contato atendido.
          </p>
        </Card>
      </div>
      <Card className="sim-controles" titulo="E se…?" sub="A animação e a previsão mudam juntas. A equipe aqui é a mesma da aba Equipe."
        acoes={alterado ? <button type="button" className="limpar" onClick={onVoltar}><RotateCcw size={14} aria-hidden="true" />Voltar para hoje</button> : undefined}>
        <div className="alavancas">
          <Faixa id="n1" rotulo="Analistas logados no N1" valor={c.n1} min={0} max={14} un="" hoje={ATUAL.n1} onChange={(v) => onSet('n1', v)} ajuda="Atendem telefone, chat e portal." />
          <Faixa id="n2" rotulo="Analistas logados no N2" valor={c.n2} min={0} max={8} un="" hoje={ATUAL.n2} onChange={(v) => onSet('n2', v)} ajuda="Recebem o que o N1 não resolve." />
          <Faixa id="volume" rotulo="Volume de contatos" valor={c.volume} min={60} max={160} passo={5} un="%" hoje={ATUAL.volume} onChange={(v) => onSet('volume', v)} ajuda="100% = 300 contatos num dia normal." />
          <Faixa id="tma" rotulo="Tempo médio de atendimento (N1)" valor={c.tma} min={4} max={15} un="min" hoje={ATUAL.tma} onChange={(v) => onSet('tma', v)} ajuda="Roteiros e acesso remoto encurtam o atendimento." />
          <Faixa id="fcr" rotulo="Resolvido no primeiro contato" valor={c.fcr} min={40} max={90} un="%" hoje={ATUAL.fcr} onChange={(v) => onSet('fcr', v)} ajuda="O resto vai para o N2." />
          <Chave rotulo="Portal de autoatendimento" valor={c.autoatendimento} onChange={(v) => onSet('autoatendimento', v)} ajuda="15% menos contatos e atendimento 8% mais curto." />
          <Chave rotulo="Segunda-feira de manhã" valor={c.segunda} onChange={(v) => onSet('segunda', v)} ajuda="40% a mais de demanda das 8h às 12h." />
        </div>
      </Card>
    </div>
  );
}

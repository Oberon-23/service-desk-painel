/*
 * Planejamento: o dia de hoje contra o previsto, o "e se" e a escala ideal.
 * Aqui ficam os números do modelo de fila (Erlang C). Os números ao vivo ficam em Comando, Filas e Analistas.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { ATUAL, CUSTO_HORA, escalaIdeal, horaN1, META_NS, melhorAlavanca, simular, tmaEfetivo, type Cenario } from '../fila';
import { Abas, Card, Kpis, Legenda, Manchete, Segmentado } from '../kit/ui';
import { Grafico, useCores } from '../kit/graficos';
import { useOperacao } from '../operacao/contexto';
import { precisaNaHora } from '../operacao/copiloto';
import { brl, META_ABANDONO, META_SLA_N2, num, pct, pp, st, tempo } from './partes/formatos';
import { Chave, Faixa } from './partes/Controles';

/** Hoje: o que chegou em cada hora contra o previsto, e a projeção para o resto do dia. */
function Intraday() {
  const { foto: f } = useOperacao();
  const cores = useCores();
  const prev = f.dia.previstoHora, real = f.dia.chegadasHora, h = f.hora, parte = (f.minuto % 60) / 60;
  // previsto até este minuto: horas fechadas mais a parte da hora em curso
  const prevAteAgora = prev.slice(0, h).reduce((a, b) => a + b, 0) + prev[h] * parte;
  const realAteAgora = real.slice(0, h + 1).reduce((a, b) => a + b, 0);
  const desvio = prevAteAgora > 0 ? realAteAgora / prevAteAgora - 1 : 0;
  const prevDia = prev.reduce((a, b) => a + b, 0);
  const projecao = realAteAgora + (prevDia - prevAteAgora) * (1 + desvio);
  const logados = f.cenario.n1;
  const precisa = prev.map((_, i) => (i < h ? null : precisaNaHora(f, i)));
  const faltam = precisa.map((p, i) => ({ hora: 8 + i, falta: p === null ? 0 : p - logados })).filter((x) => x.falta > 0);
  const status = Math.abs(desvio) <= 0.1 ? 'ok' : Math.abs(desvio) <= 0.2 ? 'warn' : 'bad';
  return (
    <>
      <Manchete status={faltam.length ? 'warn' : status}
        titulo={`Até ${f.relogio} chegaram ${num(realAteAgora)} contatos, ${Math.abs(desvio) < 0.03 ? 'em linha com o previsto' : `${pct(Math.abs(desvio), 0)} ${desvio > 0 ? 'acima' : 'abaixo'} do previsto`}.`}
        texto={<>Mantido esse ritmo, o dia fecha perto de <b>{num(projecao)} contatos</b> (previsto: {num(prevDia)}). {faltam.length ? <>Com {logados} analistas no N1, o modelo aponta falta de gente às <b>{faltam.map((x) => `${x.hora}h (${x.falta})`).join(', ')}</b>.</> : <>Com {logados} analistas no N1, o modelo não aponta falta de gente no resto do dia.</>}</>} />
      <Kpis rotulo="Indicadores do dia contra o previsto" itens={[
        { label: 'Recebidos até agora', tip: 'Contatos que chegaram hoje, em todos os canais.', value: num(realAteAgora), note: `previsto: ${num(prevAteAgora)}` },
        { label: 'Desvio do previsto', tip: 'Recebidos ÷ previsto até este minuto. Até 10% para mais ou para menos é variação normal.', value: `${desvio >= 0 ? '+' : '−'}${pct(Math.abs(desvio), 0)}`, status, statusText: status === 'ok' ? 'Normal' : desvio > 0 ? 'Acima' : 'Abaixo' },
        { label: 'Projeção do dia', tip: 'Recebidos até agora mais o previsto para o resto do dia, corrigido pelo desvio.', value: num(projecao), note: `previsto: ${num(prevDia)}` },
        { label: 'Horas com falta de gente', tip: 'Horas, de agora até o fim do dia, em que o modelo de fila pede mais analistas no N1 do que há logados.', value: String(faltam.length), status: faltam.length ? 'warn' : 'ok', statusText: faltam.length ? 'Reforçar' : 'Coberto' },
      ]} />
      <Card titulo="Contatos por hora: previsto e realizado" sub="Barras: o que chegou. Linha: o previsto para o tipo de dia. A hora em curso ainda está enchendo.">
        <Legenda itens={[{ label: 'Realizado', cor: cores.accent }, { label: 'Hora em curso', cor: cores['seq-2'] }, { label: 'Previsto', cor: cores.ink, tipo: 'linha' }]} />
        <Grafico rotulo="Contatos por hora, previsto e realizado" altura={260} n={prev.length} rotulosX={prev.map((_, i) => `${8 + i}h`)}
          y={{ min: 0, max: Math.max(...prev, ...real) * 1.15, fmt: (v) => num(v) }}
          camadas={[
            { tipo: 'barras', valores: real.map((v, i) => (i <= h ? v : 0)), larguraMax: 44, raio: 5, cor: (i) => (i === h ? cores['seq-2'] : cores.accent), rotulos: real.map((v, i) => (i <= h ? String(v) : '')) },
            { tipo: 'linha', valores: prev, cor: cores.ink, pontos: 3 },
          ]}
          dica={(i) => ({ titulo: `${8 + i}h às ${9 + i}h`, linhas: [{ nome: 'Previsto', valor: num(prev[i]) }, { nome: i < h ? 'Realizado' : i === h ? 'Realizado até agora' : 'Realizado', valor: i <= h ? num(real[i]) : 'ainda não chegou' }, ...(precisa[i] !== null ? [{ nome: 'Analistas que a hora pede', valor: String(precisa[i]) }] : [])] })} />
        <p className="nota">Segurados pelo aviso de incidente hoje: {f.dia.desviados}. Escalados para o N2: {f.dia.escalados}.</p>
      </Card>
    </>
  );
}

function Var({ v, bom, fmt }: { v: number; bom: 'sobe' | 'desce'; fmt: (x: number) => string }) {
  if (Math.abs(v) < 1e-4) return <span className="var-neutra">igual a hoje</span>;
  const melhor = bom === 'sobe' ? v > 0 : v < 0;
  return <span className={melhor ? 'var-boa' : 'var-ruim'}>{fmt(v)} vs hoje</span>;
}

/** Previsão do dia pelo modelo de fila (Erlang C) e as alavancas do “e se”. */
function ESe() {
  const { foto, agir } = useOperacao();
  const c = foto.cenario, alterado = foto.alterado;
  const onSet = <K extends keyof Cenario>(k: K, v: Cenario[K]) => agir((m) => { if (k === 'n1' || k === 'n2') m.ajustarLogados(k === 'n1' ? 1 : 2, v as number); else m.setParam(k, v as never); });
  const onVoltar = () => agir((m) => m.iniciar());
  const chave = JSON.stringify(c);
  const r = useMemo(() => simular(c), [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const hoje = useMemo(() => simular(ATUAL), []);
  const dica = useMemo(() => melhorAlavanca(c), [chave]); // eslint-disable-line react-hooks/exhaustive-deps
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
        <Card titulo="Hora a hora" sub="Nível de serviço previsto em cada hora. Horas abaixo da meta mostram onde reforçar a escala (aba Escala ideal).">
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
      <Card className="sim-controles" titulo="E se…?" sub="A animação e a previsão mudam juntas. A equipe aqui é a mesma da tela Analistas; mexer num lugar muda o outro."
        acoes={alterado ? <button type="button" className="limpar" onClick={onVoltar}><RotateCcw size={14} aria-hidden="true" />Recomeçar o dia</button> : undefined}>
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

function EscalaIdeal() {
  const cores = useCores();
  const [dia, setDia] = useState<'normal' | 'segunda'>('normal');
  const c: Cenario = { ...ATUAL, segunda: dia === 'segunda' };
  const escala = useMemo(() => escalaIdeal(c), [dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useMemo(() => simular(c), [dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const pico = escala.reduce((a, b) => (b.precisa > a.precisa ? b : a));
  const horasHoje = c.n1 * escala.length;
  const horasPrecisa = escala.reduce((s, x) => s + x.precisa, 0);
  const abaixo = escala.filter((x) => x.precisa > c.n1);
  const sobra = escala.filter((x) => x.precisa < c.n1);
  // nível de serviço na hora de pico conforme o tamanho da equipe
  const tamanhos = Array.from({ length: 12 }, (_, i) => i + 3);
  const tma = tmaEfetivo(c);
  const curva = tamanhos.map((n) => ({ n, pico: horaN1(pico.chegadas, tma, n).ns, dia: simular({ ...c, n1: n }).ns }));

  return (
    <>
      <Manchete status={abaixo.length ? 'warn' : 'ok'}
        titulo={abaixo.length
          ? `Com ${c.n1} analistas o dia todo, faltam pessoas em ${abaixo.length} ${abaixo.length === 1 ? 'hora' : 'horas'} e sobram em ${sobra.length}.`
          : `Com ${c.n1} analistas, a meta é cumprida em todas as horas.`}
        texto={<>O pico pede <b>{pico.precisa} analistas às {pico.hora}h</b>. Uma escala em turnos sobrepostos, seguindo a curva abaixo, cumpre os 80% em até 60 s em todas as horas com {num(horasPrecisa)} horas de analista por dia, contra {num(horasHoje)} hoje.</>} />

      <div className="filtros-linha"><Segmentado rotulo="Tipo de dia" valor={dia} onChange={setDia} opcoes={[['normal', 'Dia normal'], ['segunda', 'Segunda-feira']]} /></div>

      <Kpis itens={[
        { label: 'Analistas no pico', tip: 'Menor equipe que atinge 80% em até 60 s na hora mais cheia.', value: String(pico.precisa), note: `às ${pico.hora}h, ${num(pico.chegadas)} contatos` },
        { label: 'Horas de analista por dia', tip: 'Soma, hora a hora, da equipe mínima para a meta.', value: num(horasPrecisa), note: `hoje: ${num(horasHoje)}` },
        { label: 'Diferença de custo', tip: `Horas a mais ou a menos × R$ ${CUSTO_HORA.n1} por hora de analista N1.`, value: `R$ ${num(Math.abs(horasPrecisa - horasHoje) * CUSTO_HORA.n1)}`, note: horasPrecisa > horasHoje ? 'a mais por dia' : 'a menos por dia', status: horasPrecisa > horasHoje ? 'warn' : 'ok', statusText: horasPrecisa > horasHoje ? 'Custa mais' : 'Economiza' },
        { label: 'Nível de serviço hoje', tip: 'Com a equipe fixa atual, no dia todo.', value: pct(r.ns), target: `Meta ≥ ${pct(META_NS, 0)}`, status: r.ns >= META_NS ? 'ok' : 'bad' },
      ]} />

      <Card titulo="Quantas pessoas cada hora precisa" sub="Barras: equipe mínima para a meta (Erlang C). Linha: equipe atual, fixa o dia todo. Onde a barra passa da linha, a fila cresce; onde fica abaixo, sobra gente.">
        <Legenda itens={[{ label: 'Falta gente', cor: cores.bad }, { label: 'Na medida ou sobra', cor: cores['seq-3'] }, { label: 'Equipe atual', cor: cores.ink, tipo: 'linha' }]} />
        <Grafico rotulo="Equipe mínima por hora contra a equipe atual" altura={270} n={escala.length} rotulosX={escala.map((x) => `${x.hora}h`)}
          y={{ min: 0, max: Math.max(c.n1, pico.precisa) + 2, fmt: (v) => num(v) }}
          camadas={[
            { tipo: 'barras', valores: escala.map((x) => x.precisa), larguraMax: 44, raio: 5, cor: (i) => (escala[i].precisa > c.n1 ? cores.bad : cores['seq-3']), rotulos: escala.map((x) => String(x.precisa)) },
            { tipo: 'linhaH', y: c.n1, cor: cores.ink, largura: 2, rotulo: `Hoje: ${c.n1}` },
          ]}
          dica={(i) => { const x = escala[i]; return { titulo: `${x.hora}h às ${x.hora + 1}h`, linhas: [{ nome: 'Contatos', valor: num(x.chegadas) }, { nome: 'Equipe mínima', valor: String(x.precisa) }, { nome: 'Com a equipe atual', valor: pct(horaN1(x.chegadas, tma, c.n1).ns, 0) }] }; }} />
      </Card>

      <Card titulo="Quanto cada pessoa a mais rende" sub={`Nível de serviço às ${pico.hora}h (barras) e no dia (linha) conforme o tamanho do N1. Os primeiros acréscimos rendem muito; depois o ganho encolhe.`}>
        <Legenda itens={[{ label: `Às ${pico.hora}h`, cor: cores.accent }, { label: 'No dia', cor: cores.ink, tipo: 'linha' }, { label: 'Meta', tipo: 'tracejado' }]} />
        <Grafico rotulo="Nível de serviço conforme o tamanho da equipe" altura={270} n={curva.length} rotulosX={curva.map((x) => `${x.n}`)}
          y={{ min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], fmt: (v) => `${num(v * 100)}%` }}
          camadas={[
            { tipo: 'barras', valores: curva.map((x) => x.pico), larguraMax: 36, raio: 4, cor: cores.accent, contorno: (i) => (curva[i].n === c.n1 ? cores.ink : undefined) },
            { tipo: 'linha', valores: curva.map((x) => x.dia), cor: cores.ink, pontos: 3 },
            { tipo: 'linhaH', y: META_NS, tracejado: true, rotulo: 'Meta 80%' },
          ]}
          dica={(i) => ({ titulo: `${curva[i].n} analistas no N1${curva[i].n === c.n1 ? ' (hoje)' : ''}`, linhas: [{ nome: `Às ${pico.hora}h`, valor: pct(curva[i].pico) }, { nome: 'No dia', valor: pct(curva[i].dia) }] })} />
        <p className="card-sub nota-grafico">Eixo horizontal: número de analistas no N1. O contorno marca a equipe de hoje.</p>
      </Card>
    </>
  );
}

type AbaP = 'hoje' | 'ese' | 'escala';
const ABAS: AbaP[] = ['hoje', 'ese', 'escala'];
export default function Planejamento() {
  const [params, setParams] = useSearchParams();
  const aba: AbaP = ABAS.includes(params.get('aba') as AbaP) ? (params.get('aba') as AbaP) : 'hoje';
  return (
    <Abas rotulo="Planejamento" valor={aba} onChange={(a) => setParams((p) => { p.set('aba', a); return p; }, { replace: true })}
      abas={[{ id: 'hoje', rotulo: 'Hoje contra o previsto' }, { id: 'ese', rotulo: 'E se…?' }, { id: 'escala', rotulo: 'Escala ideal' }]}>
      {aba === 'hoje' && <Intraday />}
      {aba === 'ese' && <ESe />}
      {aba === 'escala' && <EscalaIdeal />}
    </Abas>
  );
}

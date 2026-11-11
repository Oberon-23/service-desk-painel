import { useMemo, useState } from 'react';
import { ATUAL, CUSTO_HORA, escalaIdeal, horaN1, META_NS, simular, tmaEfetivo, type Cenario } from '../fila';
import { Card, Kpis, Legenda, Manchete, Segmentado } from '../kit/ui';
import { Grafico, useCores } from '../kit/graficos';

const pct = (x: number, d = 0) => `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const num = (x: number, d = 0) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function Dimensionamento() {
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
        { label: 'Nível de serviço hoje', tip: 'Com a equipe fixa atual, no dia todo.', value: pct(r.ns, 1), target: `Meta ≥ ${pct(META_NS)}`, status: r.ns >= META_NS ? 'ok' : 'bad' },
      ]} />

      <Card titulo="Quantas pessoas cada hora precisa" sub="Barras: equipe mínima para a meta (Erlang C). Linha: equipe atual, fixa o dia todo. Onde a barra passa da linha, a fila cresce; onde fica abaixo, sobra gente.">
        <Legenda itens={[{ label: 'Falta gente', cor: cores.bad }, { label: 'Na medida ou sobra', cor: cores['seq-3'] }, { label: 'Equipe atual', cor: cores.ink, tipo: 'linha' }]} />
        <Grafico rotulo="Equipe mínima por hora contra a equipe atual" altura={270} n={escala.length} rotulosX={escala.map((x) => `${x.hora}h`)}
          y={{ min: 0, max: Math.max(c.n1, pico.precisa) + 2, fmt: (v) => num(v) }}
          camadas={[
            { tipo: 'barras', valores: escala.map((x) => x.precisa), larguraMax: 44, raio: 5, cor: (i) => (escala[i].precisa > c.n1 ? cores.bad : cores['seq-3']), rotulos: escala.map((x) => String(x.precisa)) },
            { tipo: 'linhaH', y: c.n1, cor: cores.ink, largura: 2, rotulo: `Hoje: ${c.n1}` },
          ]}
          dica={(i) => { const x = escala[i]; return { titulo: `${x.hora}h às ${x.hora + 1}h`, linhas: [{ nome: 'Contatos', valor: num(x.chegadas) }, { nome: 'Equipe mínima', valor: String(x.precisa) }, { nome: 'Com a equipe atual', valor: pct(horaN1(x.chegadas, tma, c.n1).ns) }] }; }} />
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
          dica={(i) => ({ titulo: `${curva[i].n} analistas no N1${curva[i].n === c.n1 ? ' (hoje)' : ''}`, linhas: [{ nome: `Às ${pico.hora}h`, valor: pct(curva[i].pico, 1) }, { nome: 'No dia', valor: pct(curva[i].dia, 1) }] })} />
        <p className="card-sub" style={{ marginTop: 6 }}>Eixo horizontal: número de analistas no N1. O contorno marca a equipe de hoje.</p>
      </Card>
    </>
  );
}

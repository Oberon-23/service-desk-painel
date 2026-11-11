import { describe, expect, it } from 'vitest';
import { ATUAL } from '../fila';
import { CANAIS, DIA_MIN, Motor, ORDEM_CANAIS } from './motor';
import { aplicar, precisaNaHora, sugerir } from './copiloto';

const novo = () => new Motor();

describe('motor da operação', () => {
  it('a mesma semente dá sempre o mesmo dia', () => {
    const a = novo(), b = novo();
    a.avancar(200); b.avancar(200);
    expect(JSON.stringify(a.foto())).toBe(JSON.stringify(b.foto()));
  });
  it('abre às 10h30 com a escala de hoje e a manhã já simulada', () => {
    const f = novo().foto();
    expect(f.relogio).toBe('10:30');
    expect(f.cenario).toEqual(ATUAL);
    expect(f.alterado).toBe(false);
    expect(f.dia.recebidos).toBeGreaterThan(50);
    expect(f.analistas.filter((a) => a.pa !== null)).toHaveLength(ATUAL.n1 + ATUAL.n2);
  });
  it('conta fecha: todo contato recebido foi atendido, desistiu ou está esperando', () => {
    const m = novo(); m.avancar(240);
    const f = m.foto();
    for (const k of ORDEM_CANAIS) expect(f.filas[k].atendidos + f.filas[k].abandonos + f.filas[k].esperando).toBe(f.filas[k].recebidos);
    expect(f.filas.portal.abandonos).toBe(0); // no portal ninguém desiste
  });
  it('analista só recebe contato dos canais em que está habilitado', () => {
    const m = novo();
    for (let i = 0; i < 400; i++) {
      m.avancar(0.5);
      for (const a of m.foto().analistas) if (a.nivel === 1 && a.ticket) expect(a.canais).toContain(a.ticket.canal);
    }
  });
  it('sem ninguém no chat, a fila do chat cresce e o abandono sobe', () => {
    const m = novo();
    for (const a of m.foto().analistas) if (a.nivel === 1 && a.canais.includes('chat')) m.alternarCanal(a.nome, 'chat');
    m.avancar(60);
    const q = m.foto().filas.chat;
    expect(q.habilitados).toBe(0);
    expect(q.esperando + q.abandonos).toBeGreaterThan(5);
    expect(q.maiorEspera).toBeGreaterThan(CANAIS.chat.alvo);
  });
  it('pausar devolve o contato para a fila e conta o tempo e o estouro da pausa', () => {
    const m = novo();
    const ocupado = m.foto().analistas.find((a) => a.nivel === 1 && a.ticket) ?? m.foto().analistas[0];
    m.pausar(ocupado.nome, 'banheiro');
    expect(m.foto().analistas.find((a) => a.nome === ocupado.nome)!.ticket).toBeNull();
    m.avancar(12);
    const a = m.foto().analistas.find((x) => x.nome === ocupado.nome)!;
    expect(a.estado).toBe('pausa');
    expect(a.estouro).toBeCloseTo(7, 0);
    expect(a.pausaDia).toBeCloseTo(12, 0);
    expect(m.foto().feed.some((e) => e.texto.includes('passou do limite da pausa'))).toBe(true);
    m.voltar(ocupado.nome);
    expect(m.foto().analistas.find((x) => x.nome === ocupado.nome)!.estado).not.toBe('pausa');
  });
  it('logar, deslogar e ajustar o número de logados não repetem pessoa nem PA', () => {
    const m = novo();
    m.ajustarLogados(1, 10);
    let f = m.foto();
    expect(f.cenario.n1).toBe(10);
    const pas = f.analistas.filter((a) => a.nivel === 1 && a.pa !== null).map((a) => a.pa);
    expect(new Set(pas).size).toBe(pas.length);
    m.ajustarLogados(1, 4);
    f = m.foto();
    expect(f.cenario.n1).toBe(4);
    expect(f.alterado).toBe(true);
    expect(m.logar('Ana')).toBe(false); // já está logada
    m.iniciar();
    expect(m.foto().alterado).toBe(false);
  });
  it('o N2 atende pela ordem do prazo', () => {
    const m = novo(); m.avancar(60);
    const prazos = m.foto().n2.chamados.map((k) => k.resta);
    expect([...prazos].sort((a, b) => a - b)).toEqual(prazos);
  });
  it('a linha do tempo de cada analista cobre o dia sem buracos', () => {
    const m = novo(); m.pausar('Ana', 'lanche'); m.avancar(30); m.voltar('Ana'); m.avancar(30);
    for (const a of m.foto().analistas) {
      expect(a.linha[0].de).toBe(0);
      a.linha.forEach((g, i) => { if (i) expect(g.de).toBeCloseTo(a.linha[i - 1].ate!, 6); });
      expect(a.linha[a.linha.length - 1].ate).toBeNull();
    }
    expect(m.foto().analistas.find((a) => a.nome === 'Ana')!.linha.some((g) => g.estado === 'pausa')).toBe(true);
  });
  it('virada do dia zera os indicadores e mantém os chamados do N2', () => {
    const m = novo(); m.avancar(DIA_MIN - m.minuto - 1);
    const antes = m.foto().n2.chamados.length;
    m.avancar(2);
    const f = m.foto();
    expect(f.relogio).toBe('08:00');
    expect(f.dia.recebidos).toBeLessThan(3);
    expect(Math.abs(f.n2.chamados.length - antes)).toBeLessThanOrEqual(1);
  });
});

describe('treino de crise e copiloto', () => {
  it('queda da VPN: o copiloto percebe o assunto disparando e declarar o incidente segura contatos', () => {
    const m = novo();
    expect(sugerir(m.foto()).some((s) => s.id.startsWith('surto'))).toBe(false);
    m.injetar('vpn'); m.avancar(25);
    const s = sugerir(m.foto()).find((x) => x.id.startsWith('surto'))!;
    expect(s.nivel).toBe('bad');
    expect(s.titulo).toContain('VPN');
    aplicar(m, s);
    let f = m.foto();
    expect(f.incidente).not.toBeNull();
    expect(f.n2.chamados.some((k) => k.pai && k.prio === 1)).toBe(true);
    expect(f.feed[0].tipo).toBe('copiloto');
    m.avancar(20);
    f = m.foto();
    expect(f.dia.desviados).toBeGreaterThan(3);
    m.avancar(240); // o N2 resolve o chamado pai: o incidente fecha e o alerta não reabre
    f = m.foto();
    expect(f.incidente).toBeNull();
    expect(sugerir(f).some((x) => x.id.startsWith('surto'))).toBe(false);
  });
  it('o alerta de possível incidente não pisca: uma vez ligado, fica até o volume normalizar', () => {
    const m = novo(); m.injetar('vpn');
    let ligou = -1;
    for (let i = 0; i < 80 && ligou < 0; i++) { m.avancar(1); if (m.foto().suspeita) ligou = i; }
    expect(ligou).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 40; i++) { m.avancar(1); expect(m.foto().suspeita).not.toBeNull(); }
  });
  it('declarar o incidente deixa a fila menor do que não declarar', () => {
    const roda = (declara: boolean) => {
      const m = novo(); m.injetar('vpn'); m.avancar(15);
      if (declara) m.declararIncidente(1);
      m.avancar(60);
      const f = m.foto();
      return ORDEM_CANAIS.reduce((s, k) => s + f.filas[k].abandonos + f.filas[k].esperando, 0);
    };
    expect(roda(true)).toBeLessThan(roda(false));
  });
  it('duas faltas: aponta quem falta e oferece alguém de fora da escala para cobrir', () => {
    const m = novo(); m.injetar('faltas');
    const s = sugerir(m.foto()).find((x) => x.id === 'ausentes-1')!;
    expect(s.texto).toMatch(/Gabi|Fábio/);
    expect(s.acao?.cmd).toMatchObject({ t: 'logar' });
    const antes = m.foto().cenario.n1;
    aplicar(m, s);
    expect(m.foto().cenario.n1).toBe(antes + 1);
  });
  it('pausa acima do limite vira ação de chamar de volta', () => {
    const m = novo(); m.pausar('Carla', 'banheiro'); m.avancar(8);
    const s = sugerir(m.foto()).find((x) => x.id === 'pausa-Carla')!;
    expect(s.acao?.cmd).toEqual({ t: 'voltar', nome: 'Carla' });
    aplicar(m, s);
    expect(sugerir(m.foto()).some((x) => x.id === 'pausa-Carla')).toBe(false);
  });
  it('fila de um canal apertada: sugere habilitar quem está livre e não atende o canal', () => {
    const m = novo();
    for (const a of m.foto().analistas) if (a.nivel === 1 && a.canais.includes('chat') && a.nome !== 'Ana') m.alternarCanal(a.nome, 'chat');
    m.pausar('Ana', 'treinamento');
    let s;
    for (let i = 0; i < 120 && !s; i++) { m.avancar(1); s = sugerir(m.foto()).find((x) => x.id === 'fila-chat'); }
    expect(s).toBeDefined();
    expect(s!.acao).toBeDefined();
    const antes = m.foto().filas.chat.habilitados;
    aplicar(m, s!);
    const f = m.foto();
    expect(f.filas.chat.habilitados + f.analistas.filter((a) => a.nome === 'Ana' && a.estado !== 'pausa').length).toBeGreaterThan(antes);
  });
  it('a previsão pede mais gente no pico e as sugestões vêm do mais grave ao menos grave', () => {
    const m = novo();
    const f = m.foto();
    expect(precisaNaHora(f)).toBeGreaterThan(ATUAL.n1);
    m.pausar('Carla', 'banheiro'); m.avancar(8);
    const niveis = sugerir(m.foto()).map((s) => s.nivel);
    const ordem = { bad: 0, warn: 1, info: 2 };
    expect([...niveis].sort((a, b) => ordem[a] - ordem[b])).toEqual(niveis);
    expect(new Set(sugerir(m.foto()).map((s) => s.id)).size).toBe(niveis.length);
  });
  it('com folga, propõe usar a janela para feedback', () => {
    const m = novo();
    m.ajustarLogados(1, 14); m.setParam('volume', 60); m.avancar(240);
    let s;
    for (let i = 0; i < 200 && !s; i++) { m.avancar(0.5); s = sugerir(m.foto()).find((x) => x.id === 'folga'); }
    expect(s?.acao?.cmd).toMatchObject({ t: 'pausar', motivo: 'feedback' });
  });
});

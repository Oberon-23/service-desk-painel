import { describe, expect, it } from 'vitest';
import { ATUAL, chegadas, erlangC, escalaIdeal, horaN1, melhorAlavanca, minimoN1, PERFIL, simular, VOLUME_DIA } from './fila';

describe('Erlang C', () => {
  it('bate com valores de referência', () => {
    // 10 erlangs, 12 pessoas: probabilidade de esperar ≈ 0,4494 (tabela clássica)
    expect(erlangC(10, 12)).toBeCloseTo(0.4494, 3);
    expect(erlangC(2, 3)).toBeCloseTo(0.4444, 3);
    expect(erlangC(5, 5)).toBe(1);
  });
  it('mais gente na fila → menos espera e mais nível de serviço', () => {
    const a = horaN1(50, 9, 8), b = horaN1(50, 9, 10);
    expect(b.ns).toBeGreaterThan(a.ns);
    expect(b.espera).toBeLessThan(a.espera);
    expect(b.abandono).toBeLessThan(a.abandono);
  });
  it('equipe menor que a demanda vira fila crescendo e muito abandono', () => {
    const h = horaN1(60, 10, 5);
    expect(h.estavel).toBe(false);
    expect(h.abandono).toBeGreaterThan(0.1);
  });
});

describe('cenários', () => {
  it('o volume do dia fecha com o perfil por hora', () => {
    expect(PERFIL.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(chegadas(ATUAL).reduce((a, b) => a + b, 0)).toBeCloseTo(VOLUME_DIA, 5);
  });
  it('hoje a central fica abaixo da meta no pico da manhã', () => {
    const r = simular(ATUAL);
    expect(r.piorHora.hora).toBeGreaterThanOrEqual(9);
    expect(r.piorHora.hora).toBeLessThanOrEqual(11);
    expect(r.piorHora.ns).toBeLessThan(0.8);
    expect(r.ns).toBeGreaterThan(0.5);
  });
  it('segunda-feira piora; autoatendimento melhora', () => {
    expect(simular({ ...ATUAL, segunda: true }).ns).toBeLessThan(simular(ATUAL).ns);
    expect(simular({ ...ATUAL, autoatendimento: true }).ns).toBeGreaterThan(simular(ATUAL).ns);
  });
  it('resolver mais no N1 alivia o N2', () => {
    const a = simular({ ...ATUAL, fcr: 55 }), b = simular({ ...ATUAL, fcr: 85 });
    expect(b.escalados).toBeLessThan(a.escalados);
    expect(b.slaN2).toBeGreaterThanOrEqual(a.slaN2);
  });
  it('N2 sem gente suficiente estoura o prazo e acumula fila', () => {
    const r = simular({ ...ATUAL, n2: 1, fcr: 45 });
    expect(r.slaN2).toBeLessThan(0.6);
    expect(r.filaN2FimDoDia).toBeGreaterThan(5);
  });
  it('escala ideal pede mais gente no pico do que no fim do dia', () => {
    const e = escalaIdeal(ATUAL);
    expect(Math.max(...e.map((x) => x.precisa))).toBeGreaterThan(e[e.length - 1].precisa);
    expect(minimoN1(0.01, 9)).toBe(1);
  });
  it('aponta a alavanca de maior ganho', () => {
    const m = melhorAlavanca(ATUAL)!;
    expect(m.ganho).toBeGreaterThan(0);
  });
});

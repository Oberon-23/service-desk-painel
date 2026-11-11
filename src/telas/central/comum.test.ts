import { describe, expect, it } from 'vitest';
import type { ChamadoN2, Placar, Posto } from '../../central/tipos';
import { aderencia, ajustar, estouro, logados, pontosDeAtencao, POSTOS_HOJE } from './comum';

const placar = (over: Partial<Placar> = {}): Placar => ({
  relogio: '10:00', minuto: 120, filaN1: 0, filaN2: 0, atendidos: 100, noPrazo: 90, abandonos: 2, escalados: 20, resolvidosN2: 5,
  n2NoPrazo: 5, n2Atrasados: 0, esperaMedia: 0.3, mesas: [], tempo: {}, ...over,
});
const chamado = (resta: number, prio: 1 | 2 | 3 | 4 = 3, cod = 'INC1'): ChamadoN2 => ({ cod, prio, assunto: 'VPN', com: null, aberto: 60, resta });

describe('equipe nas PAs', () => {
  it('ajustar loga e desloga até o número pedido, sem repetir pessoa nem PA', () => {
    const mais = ajustar(POSTOS_HOJE, 1, 10);
    expect(logados(mais, 1)).toBe(10);
    expect(new Set(mais.map((p) => p.nome)).size).toBe(mais.length);
    expect(new Set(mais.filter((p) => p.nivel === 1).map((p) => p.pa)).size).toBe(mais.filter((p) => p.nivel === 1).length);
    expect(logados(ajustar(mais, 1, 3), 1)).toBe(3);
  });
  it('ajustar tira primeiro quem está em pausa da pausa', () => {
    const ps: Posto[] = POSTOS_HOJE.map((p) => (p.nome === 'Ana' ? { ...p, estado: 'pausa', motivo: 'lanche' } : p));
    const r = ajustar(ps, 1, 7);
    expect(r.find((p) => p.nome === 'Ana')!.estado).toBe('logado');
    expect(r.length).toBe(POSTOS_HOJE.length);
  });
  it('estouro conta só o que passou do limite do motivo', () => {
    const p: Posto = { nivel: 1, pa: 0, nome: 'Ana', estado: 'pausa', motivo: 'banheiro' };
    expect(estouro(p, 4)).toBe(0);
    expect(estouro(p, 8)).toBe(3);
    expect(estouro({ ...p, estado: 'logado' }, 30)).toBe(0);
  });
  it('aderência: escalado em pausa ou ausente não conta; quem está fora da escala é extra', () => {
    const ps: Posto[] = [...POSTOS_HOJE.filter((p) => p.nome !== 'Bruno').map((p) => (p.nome === 'Ana' ? { ...p, estado: 'pausa' as const } : p)), { nivel: 1, pa: 9, nome: 'Nilo', estado: 'logado' }];
    const a = aderencia(ps, null);
    expect(a.atendendo).toBe(POSTOS_HOJE.length - 2);
    expect(a.ausentes).toEqual(['Bruno']);
    expect(a.extras).toEqual(['Nilo']);
  });
});

describe('pontos de atenção', () => {
  it('nada a apontar numa operação tranquila', () => {
    expect(pontosDeAtencao(POSTOS_HOJE, { placar: placar(), chamados: [chamado(300)] })).toEqual([]);
  });
  it('vermelho antes de laranja: P1, vencidos e pausa estourada antes de fila e risco', () => {
    const ps: Posto[] = POSTOS_HOJE.map((p) => (p.nome === 'Carla' ? { ...p, estado: 'pausa', motivo: 'banheiro' } : p));
    const pl = placar({ filaN1: 9, mesas: [{ nivel: 1, pa: 2, nome: 'Carla', estado: 'pausa', feitos: 3, pausaAgora: 12 }] });
    const r = pontosDeAtencao(ps, { placar: pl, chamados: [chamado(-30, 3, 'INC2'), chamado(40, 1, 'INC3'), chamado(50, 3, 'INC4')] });
    expect(r.map((x) => x.id)).toEqual(['p1-INC3', 'vencidos', 'pausa-Carla', 'fila', 'risco']);
    expect(r.findIndex((x) => x.nivel === 'warn')).toBeGreaterThan(r.map((x) => x.nivel).lastIndexOf('bad'));
    expect(r.find((x) => x.id === 'pausa-Carla')!.foco).toEqual({ nivel: 1, pa: 2 });
  });
  it('abandono só vira alerta com amostra mínima', () => {
    expect(pontosDeAtencao(POSTOS_HOJE, { placar: placar({ atendidos: 5, abandonos: 3 }), chamados: [] })).toEqual([]);
    expect(pontosDeAtencao(POSTOS_HOJE, { placar: placar({ atendidos: 80, abandonos: 10 }), chamados: [] }).map((x) => x.id)).toEqual(['abandono']);
  });
});

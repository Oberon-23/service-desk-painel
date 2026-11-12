import { describe, expect, it } from 'vitest';
import { amostraZero, classificar, fmtLimite, REGRAS, Vigia, type Amostra, type Estado } from './alertas';
import { Motor } from './motor';

const regra = (id: string) => REGRAS.find((r) => r.id === id)!;
const calmo: Estado = { vencidosN2: 0, p1Abertos: 0, aderencia: 1, pausasEstouradas: 0 };
/** Série de n minutos com a maior espera do telefone dada por minuto. */
const serieTel = (esperas: number[]): Amostra[] => esperas.map((e, i) => ({ ...amostraZero(i), espera: { telefone: e, chat: 0, portal: 0 } }));

describe('regras de alerta', () => {
  it('classifica pelos limites de atenção e crítico, nos dois sentidos', () => {
    expect(classificar(regra('tel-espera'), 1.5)).toBeNull();
    expect(classificar(regra('tel-espera'), 2.5)).toBe('warn');
    expect(classificar(regra('tel-espera'), 4.5)).toBe('crit');
    expect(classificar(regra('ns'), 0.85)).toBeNull();
    expect(classificar(regra('ns'), 0.75)).toBe('warn');
    expect(classificar(regra('ns'), 0.6)).toBe('crit');
    expect(classificar(regra('n2-vencidos'), 1)).toBe('warn'); // contagem: vale a partir do limite
    expect(classificar(regra('n2-p1'), 1)).toBe('crit');
    expect(classificar(regra('ns'), null)).toBeNull(); // sem amostra suficiente não alerta
  });
  it('espera de cada canal: atenção em 2× e crítico em 4× o alvo', () => {
    expect([regra('tel-espera').warn, regra('tel-espera').crit]).toEqual([2, 4]);
    expect([regra('chat-espera').warn, regra('chat-espera').crit]).toEqual([4, 8]);
    expect([regra('portal-espera').warn, regra('portal-espera').crit]).toEqual([30, 60]);
  });
  it('mostra o limite com o sinal certo', () => {
    expect(fmtLimite(regra('tel-espera'), 2)).toBe('> 2 min');
    expect(fmtLimite(regra('ns'), 0.8)).toBe('< 80%');
    expect(fmtLimite(regra('pausas'), 1)).toBe('≥ 1');
  });
});

describe('vida do alerta', () => {
  it('só abre depois de 2 minutos seguidos fora do limite (um pico isolado não alerta)', () => {
    const v = new Vigia();
    const esperas = [0, 3, 0, 3, 3];
    const abriu = esperas.map((_, i) => v.avaliar(i, { serie: serieTel(esperas.slice(0, i + 1)), estado: calmo }).some((m) => m.tipo === 'abriu'));
    expect(abriu).toEqual([false, false, false, false, true]);
    expect(v.alertas[0]).toMatchObject({ regra: 'tel-espera', sev: 'warn', aberto: 4 });
  });
  it('piora para crítico, guarda o pior, e só fecha depois de 3 minutos no normal', () => {
    const v = new Vigia();
    const esperas = [3, 3, 5, 0, 0, 3, 0, 0, 0];
    const log: string[] = [];
    esperas.forEach((_, i) => v.avaliar(i, { serie: serieTel(esperas.slice(0, i + 1)), estado: calmo }).forEach((m) => log.push(`${i}:${m.tipo}`)));
    expect(log).toEqual(['1:abriu', '2:piorou', '8:fechou']); // a volta ao limite no minuto 5 zera a contagem
    expect(v.alertas[0]).toMatchObject({ sev: 'crit', aberto: 1, resolvido: 8 });
    expect(v.saude().telefone).toBe('ok');
  });
  it('saúde do serviço = pior alerta aberto; reconhecer mede o MTTA e fechar mede o MTTR', () => {
    const v = new Vigia();
    const esp = [5, 5, 5, 0, 0, 0];
    v.avaliar(0, { serie: serieTel(esp.slice(0, 1)), estado: { ...calmo, vencidosN2: 1 } });
    v.avaliar(1, { serie: serieTel(esp.slice(0, 2)), estado: { ...calmo, vencidosN2: 1 } });
    expect(v.saude()).toMatchObject({ telefone: 'crit', n2: 'warn', chat: 'ok' });
    const a = v.alertas.find((x) => x.regra === 'tel-espera')!;
    v.reconhecer(a.id, 3);
    for (let i = 2; i < esp.length; i++) v.avaliar(i, { serie: serieTel(esp.slice(0, i + 1)), estado: calmo });
    const t = v.tempos();
    expect(t.mtta).toBe(2);
    expect(t.nRes).toBe(2);
    expect(v.reconhecer(a.id, 9)?.reconhecido).toBe(3); // não reconhece duas vezes
  });
});

describe('monitoramento no motor', () => {
  it('guarda uma amostra por minuto e começa o dia com a manhã já medida', () => {
    const f = new Motor().foto();
    expect(f.monitor.serie.length).toBeGreaterThanOrEqual(149);
    expect(f.monitor.serie.at(-1)!.min).toBe(149);
    expect(Object.keys(f.monitor.saude)).toHaveLength(7);
  });
  it('a queda da VPN acende volume e espera; reconhecer fica no histórico', () => {
    const m = new Motor();
    m.injetar('vpn'); m.avancar(45);
    const f = m.foto();
    const abertos = f.monitor.alertas.filter((a) => a.resolvido === null).map((a) => a.regra);
    expect(abertos).toContain('volume');
    expect(f.monitor.saude.n1).not.toBe('ok');
    const a = f.monitor.alertas.find((x) => x.regra === 'volume' && x.resolvido === null)!;
    m.reconhecer(a.id);
    const g = m.foto();
    expect(g.monitor.alertas.find((x) => x.id === a.id)!.reconhecido).not.toBeNull();
    expect(g.feed[0]).toMatchObject({ tipo: 'alerta' });
    expect(g.feed.some((e) => e.texto.startsWith('Alerta '))).toBe(true);
  });
  it('recomeçar o dia zera alertas e série', () => {
    const m = new Motor(); m.injetar('vpn'); m.avancar(45); m.iniciar();
    expect(m.foto().monitor.alertas.every((a) => a.aberto < 150)).toBe(true);
  });
});

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type Periodo } from './meses';

export type DefFiltro = { id: string; label: string; options: [string, string][] };

type Ctx = {
  periodo: Periodo;
  setPeriodo: (p: Periodo) => void;
  valor: (id: string) => string;
  setValor: (id: string, v: string) => void;
  /** volta período e filtros ao padrão (12 meses, todos) */
  limpar: () => void;
  defs: DefFiltro[];
};

const FiltrosCtx = createContext<Ctx | null>(null);

function ler(chave: string): Record<string, string> | null {
  try { return JSON.parse(localStorage.getItem(chave) ?? 'null'); } catch { return null; }
}

/** Período e filtros do painel, lembrados entre visitas (por navegador). */
export function FiltrosProvider({ chave, defs, children }: { chave: string; defs: DefFiltro[]; children: ReactNode }) {
  const salvo = ler(chave);
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    const f = Number(salvo?.from), t = Number(salvo?.to);
    return Number.isInteger(f) && Number.isInteger(t) && f >= 0 && t <= 11 && f <= t ? { from: f, to: t } : { from: 0, to: 11 };
  });
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(defs.map((d) => {
      const v = salvo?.[d.id];
      return [d.id, v && d.options.some(([o]) => o === v) ? v : d.options[0][0]];
    })),
  );
  useEffect(() => {
    try { localStorage.setItem(chave, JSON.stringify({ from: periodo.from, to: periodo.to, ...valores })); } catch { /* sem armazenamento */ }
  }, [chave, periodo, valores]);

  const ctx = useMemo<Ctx>(() => ({
    periodo, setPeriodo, defs,
    valor: (id) => valores[id],
    setValor: (id, v) => setValores((o) => ({ ...o, [id]: v })),
    limpar: () => { setPeriodo({ from: 0, to: 11 }); setValores(Object.fromEntries(defs.map((d) => [d.id, d.options[0][0]]))); },
  }), [periodo, valores, defs]);
  return <FiltrosCtx.Provider value={ctx}>{children}</FiltrosCtx.Provider>;
}

export function useFiltros() {
  const c = useContext(FiltrosCtx);
  if (!c) throw new Error('useFiltros fora do FiltrosProvider');
  return c;
}

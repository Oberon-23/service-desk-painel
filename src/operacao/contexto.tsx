/* A operação viva: um motor só, acima das rotas, para a simulação continuar ao trocar de tela. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Motor, type Foto } from './motor';
import { sugerir, type Sugestao } from './copiloto';

export type Velocidade = '1' | '5' | '20';
type Operacao = {
  motor: Motor; foto: Foto; sugestoes: Sugestao[];
  rodando: boolean; setRodando: (v: boolean) => void; vel: Velocidade; setVel: (v: Velocidade) => void;
  /** Executa um comando no motor e atualiza a tela na hora. */
  agir: (fn: (m: Motor) => void) => void;
};
const Ctx = createContext<Operacao | null>(null);

export function OperacaoProvider({ children }: { children: ReactNode }) {
  const [motor] = useState(() => new Motor());
  const [foto, setFoto] = useState(() => motor.foto());
  const [rodando, setRodando] = useState(() => typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [vel, setVel] = useState<Velocidade>('5');
  const estado = useRef({ rodando, vel });
  estado.current = { rodando, vel };

  useEffect(() => {
    let raf = 0, ultimo = 0;
    const laco = (t: number) => {
      raf = requestAnimationFrame(laco);
      const dt = Math.min(0.1, (t - (ultimo || t)) / 1000);
      ultimo = t;
      if (estado.current.rodando && document.visibilityState !== 'hidden') motor.avancar(dt * +estado.current.vel);
    };
    raf = requestAnimationFrame(laco);
    const id = window.setInterval(() => { if (document.visibilityState !== 'hidden') setFoto(motor.foto()); }, 250);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, [motor]);

  const agir = useCallback((fn: (m: Motor) => void) => { fn(motor); setFoto(motor.foto()); }, [motor]);
  const sugestoes = useMemo(() => sugerir(foto), [foto]);
  const valor = useMemo(() => ({ motor, foto, sugestoes, rodando, setRodando, vel, setVel, agir }), [motor, foto, sugestoes, rodando, vel, agir]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOperacao() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOperacao fora do OperacaoProvider');
  return v;
}

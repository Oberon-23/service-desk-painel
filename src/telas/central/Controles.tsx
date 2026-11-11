import { useId } from 'react';
import { MOTIVOS, type Motivo } from '../../central/tipos';

export function Faixa({ id, rotulo, valor, min, max, passo = 1, un, hoje, ajuda, onChange }: { id: string; rotulo: string; valor: number; min: number; max: number; passo?: number; un: string; hoje: number; ajuda: string; onChange: (v: number) => void }) {
  return (
    <div className="alavanca">
      <label htmlFor={`f-${id}`}><span>{rotulo}</span><b>{valor}{un ? ` ${un}` : ''}</b></label>
      <input id={`f-${id}`} type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => onChange(+e.target.value)} aria-describedby={`a-${id}`} />
      <small id={`a-${id}`}>{ajuda} Hoje: {hoje}{un ? ` ${un}` : ''}.</small>
    </div>
  );
}

export function Chave({ rotulo, valor, ajuda, onChange }: { rotulo: string; valor: boolean; ajuda: string; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="alavanca chave">
      <button type="button" role="switch" aria-checked={valor} aria-labelledby={`${id}-r`} aria-describedby={`${id}-a`} onClick={() => onChange(!valor)} className="interruptor"><span /></button>
      <div><b id={`${id}-r`} onClick={() => onChange(!valor)}>{rotulo}</b><small id={`${id}-a`}>{ajuda}</small></div>
    </div>
  );
}

export function SeletorPausa({ rotulo, onPausar, className }: { rotulo: string; onPausar: (m: Motivo) => void; className?: string }) {
  return (
    <select className={className ?? 'sel-pausa'} aria-label={rotulo} value="" onChange={(e) => e.target.value && onPausar(e.target.value as Motivo)}>
      <option value="">Pausa…</option>
      {(Object.keys(MOTIVOS) as Motivo[]).map((m) => <option key={m} value={m}>{MOTIVOS[m].rotulo} (até {MOTIVOS[m].limite} min)</option>)}
    </select>
  );
}


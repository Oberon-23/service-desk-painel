/*
 * Gráficos em SVG próprio, na identidade Rotalume.
 *
 * Antes o painel usava o Recharts (435 KB). Os gráficos aqui são poucos e
 * conhecidos, então um conjunto pequeno de camadas resolve: linha, barras
 * (empilhadas ou em cascata), pontos, faixa, linhas de referência e meses
 * esmaecidos. Cores vêm do tema; a dica de "passar o mouse" funciona também
 * no toque e no teclado (setas).
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const NOMES = ['accent', 'accent-soft', 'ink', 'ink-2', 'muted', 'line', 'line-2', 'surface', 'good', 'warn', 'bad', 'lock',
  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'seq-1', 'seq-2', 'seq-3', 'seq-4', 'seq-5', 'seq-6'] as const;
export type Cores = Record<(typeof NOMES)[number], string> & { serie: string[] };

function lerCores(): Cores {
  const cs = getComputedStyle(document.documentElement);
  const o = Object.fromEntries(NOMES.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()])) as unknown as Cores;
  o.serie = [o.c1, o.c2, o.c3, o.c4, o.c5, o.c6];
  return o;
}

/** Cores do tema atual; muda junto quando o tema troca. */
export function useCores(): Cores {
  const [c, setC] = useState<Cores>(lerCores);
  useEffect(() => {
    const at = () => setC(lerCores());
    const mo = new MutationObserver(at);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', at);
    return () => { mo.disconnect(); mq.removeEventListener('change', at); };
  }, []);
  return c;
}

/** Largura do contêiner, atualizada quando a tela muda de tamanho. */
function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export type LinhaTt = { nome: string; valor: string; cor?: string };
export type Dica = { titulo: ReactNode; linhas: LinhaTt[]; rodape?: ReactNode };

/** Caixinha de "passar o mouse" padrão. */
export function CaixaTt({ titulo, linhas, rodape }: Dica) {
  return (
    <div className="tt">
      <div className="tt-t">{titulo}</div>
      {linhas.map((l) => (
        <div className="tt-l" key={l.nome}>{l.cor ? <i style={{ background: l.cor }} /> : null}<span>{l.nome}</span><b>{l.valor}</b></div>
      ))}
      {rodape ? <div className="tt-f">{rodape}</div> : null}
    </div>
  );
}

/** Marcas redondas no eixo: de lo a hi, de passo em passo. */
export const passos = (lo: number, hi: number, passo: number) => {
  const a = Math.floor(lo / passo) * passo, b = Math.ceil(hi / passo) * passo, r: number[] = [];
  for (let v = a; v <= b + passo / 1000; v += passo) r.push(+v.toFixed(6));
  return r;
};

/** Escala "bonita" para o eixo: 4 a 6 marcas em passos de 1, 2, 2,5 ou 5. */
export function escala(min: number, max: number, alvo = 5): { min: number; max: number; ticks: number[] } {
  if (!(max > min)) max = min + 1;
  const bruto = (max - min) / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => (max - min) / p <= alvo + 0.5) ?? 10 * mag;
  const lo = Math.floor(min / passo + 1e-9) * passo, hi = Math.ceil(max / passo - 1e-9) * passo;
  return { min: lo, max: hi, ticks: passos(lo, hi, passo) };
}

export type Camada =
  | { tipo: 'linha'; valores: (number | null)[]; cor: string; espessura?: number; pontos?: number; eixo?: 'y2' }
  | { tipo: 'barras'; valores: number[]; base?: number[]; cor: string | ((i: number) => string); opacidade?: (i: number) => number; raio?: number; larguraMax?: number; ocupa?: number; rotulos?: string[]; contorno?: (i: number) => string | undefined; eixo?: 'y2'; topo?: 'reto' | 'redondo' }
  | { tipo: 'pontos'; valores: (number | null)[]; cor: string; r?: number }
  | { tipo: 'faixa'; de: number; ate: number; cor: string }
  | { tipo: 'linhaH'; y: number; rotulo?: string; cor?: string; tracejado?: boolean; posRotulo?: 'acima' | 'abaixo'; eixo?: 'y2'; largura?: number }
  | { tipo: 'linhaV'; x: number; rotulo?: string; cor?: string; tracejado?: boolean; largura?: number }
  | { tipo: 'sombra'; de: number; ate: number };

export type Eixo = { min: number; max: number; ticks?: number[]; fmt?: (v: number) => string; largura?: number };

/** Gráfico cartesiano com categorias no eixo X (meses, dias, defeitos...). */
export function Grafico({ rotulo, altura = 280, n, rotulosX, y, y2, camadas, dica, aoClicar, semDados = false, vazio = 'Sem dados suficientes neste recorte. Amplie o período ou retire um filtro.', alturaEixoX = 26, rotuloX, gapX = 12, topo = 12 }: {
  rotulo: string; altura?: number; n: number; rotulosX: string[]; y: Eixo; y2?: Eixo; camadas: Camada[];
  dica?: (i: number) => Dica | null; aoClicar?: (i: number) => void; semDados?: boolean; vazio?: string;
  alturaEixoX?: number; rotuloX?: (texto: string, i: number, cx: number, y: number, passo: number) => ReactNode; gapX?: number; topo?: number;
}) {
  const [ref, W] = useLargura<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const clip = useId().replace(/:/g, '');
  if (semDados || n === 0) return <div className="graf graf-vazio" style={{ height: altura }}><p>{vazio}</p></div>;

  const fy = y.fmt ?? ((v: number) => String(v));
  const fy2 = y2?.fmt ?? ((v: number) => String(v));
  const ticks = y.ticks ?? escala(y.min, y.max).ticks.filter((t) => t >= y.min - 1e-9 && t <= y.max + 1e-9);
  const ticks2 = y2 ? (y2.ticks ?? escala(y2.min, y2.max).ticks) : [];
  const esq = y.largura ?? Math.max(28, ...ticks.map((t) => fy(t).length * 7 + 10));
  const dir = y2 ? (y2.largura ?? Math.max(28, ...ticks2.map((t) => fy2(t).length * 7 + 8))) : 12;
  const iw = Math.max(10, W - esq - dir), ih = altura - topo - alturaEixoX;
  const passo = iw / n;
  const cx = (i: number) => esq + passo * (i + 0.5);
  const sy = (v: number, e?: 'y2') => { const a = e === 'y2' && y2 ? y2 : y; return topo + (1 - (v - a.min) / (a.max - a.min)) * ih; };

  // rótulos do eixo X sem encostar uns nos outros
  const maiorRot = Math.max(...rotulosX.map((s) => s.length)) * 6.6 + gapX;
  const cada = rotuloX ? 1 : Math.max(1, Math.ceil(maiorRot / passo));

  const mover = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.floor((clientX - r.left - esq) / passo);
    setHover(i >= 0 && i < n ? i : null);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)); }
    else if ((e.key === 'Enter' || e.key === ' ') && hover != null && aoClicar) { e.preventDefault(); aoClicar(hover); }
    else if (e.key === 'Escape') setHover(null);
  };
  const d = hover != null && dica ? dica(hover) : null;
  const ttEsq = hover != null && cx(hover) > W * 0.6;

  return (
    <div className="graf" ref={ref} style={{ height: altura }}>
      {W > 0 && (
        <svg width={W} height={altura} role="img" aria-label={rotulo} tabIndex={dica ? 0 : undefined}
          onPointerMove={(e) => mover(e.clientX, e.currentTarget)} onPointerDown={(e) => mover(e.clientX, e.currentTarget)}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }} onKeyDown={tecla} onBlur={() => setHover(null)}
          onClick={aoClicar ? (e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.floor((e.clientX - r.left - esq) / passo); if (i >= 0 && i < n) aoClicar(i); } : undefined}
          style={aoClicar ? { cursor: 'pointer' } : undefined}>
          <defs><clipPath id={clip}><rect x={esq} y={topo - 2} width={iw} height={ih + 4} /></clipPath></defs>
          {/* grade e eixo Y */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={esq} x2={esq + iw} y1={sy(t)} y2={sy(t)} className="g-grade" />
              <text x={esq - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="g-tick">{fy(t)}</text>
            </g>
          ))}
          {y2 && ticks2.map((t) => <text key={`r${t}`} x={esq + iw + 6} y={sy(t, 'y2')} dy="0.32em" className="g-tick">{fy2(t)}</text>)}
          <line x1={esq} x2={esq + iw} y1={topo + ih} y2={topo + ih} className="g-eixo" />
          {/* destaque da coluna sob o mouse */}
          {hover != null && <rect x={esq + passo * hover} y={topo} width={passo} height={ih} className="g-hover" />}
          <g clipPath={`url(#${clip})`}>
            {camadas.map((c, k) => desenhar(c, k, { cx, sy, passo, esq, iw, topo, ih, n, hover }))}
          </g>
          {/* rótulos das linhas de referência por cima de tudo */}
          {camadas.map((c, k) => c.tipo === 'linhaH' && c.rotulo
            ? <text key={`l${k}`} x={esq + iw - 4} y={sy(c.y, c.eixo) + (c.posRotulo === 'abaixo' ? 13 : -5)} textAnchor="end" className="g-ref halo">{c.rotulo}</text>
            : c.tipo === 'linhaV' && c.rotulo ? <text key={`l${k}`} x={esq + passo * c.x} y={topo - 2} textAnchor="middle" className="g-ref halo" style={c.cor ? { fill: c.cor } : undefined}>{c.rotulo}</text> : null)}
          {/* rótulos no topo das barras */}
          {camadas.map((c, k) => c.tipo === 'barras' && c.rotulos ? c.valores.map((v, i) => (
            <text key={`b${k}-${i}`} x={cx(i)} y={sy((c.base?.[i] ?? 0) + v, c.eixo) - 7} textAnchor="middle" className="g-rot halo" style={passo < 64 ? { fontSize: 10.5 } : undefined}>{c.rotulos![i]}</text>
          )) : null)}
          {/* eixo X */}
          {rotulosX.map((s, i) => i % cada === 0 && (
            rotuloX ? <g key={i}>{rotuloX(s, i, cx(i), topo + ih + 16, passo)}</g>
              : <text key={i} x={cx(i)} y={topo + ih + 17} textAnchor="middle" className="g-tick">{s}</text>
          ))}
        </svg>
      )}
      {d && hover != null && (
        <div className="tt-pos" style={{ left: ttEsq ? undefined : cx(hover) + 12, right: ttEsq ? W - cx(hover) + 12 : undefined, top: 4 }} aria-live="polite">
          <CaixaTt {...d} />
        </div>
      )}
    </div>
  );
}

type Ctx = { cx: (i: number) => number; sy: (v: number, e?: 'y2') => number; passo: number; esq: number; iw: number; topo: number; ih: number; n: number; hover: number | null };

function desenhar(c: Camada, k: number, x: Ctx): ReactNode {
  switch (c.tipo) {
    case 'sombra': {
      const de = Math.max(0, c.de), ate = Math.min(x.n - 1, c.ate);
      if (ate < de) return null;
      return <rect key={k} x={x.esq + x.passo * de} y={x.topo} width={x.passo * (ate - de + 1)} height={x.ih} className="g-sombra" />;
    }
    case 'faixa': {
      const a = x.sy(c.ate), b = x.sy(c.de);
      return <g key={k}><rect x={x.esq} y={a} width={x.iw} height={b - a} fill={c.cor} fillOpacity={0.1} /><line x1={x.esq} x2={x.esq + x.iw} y1={a} y2={a} stroke={c.cor} strokeOpacity={0.5} /><line x1={x.esq} x2={x.esq + x.iw} y1={b} y2={b} stroke={c.cor} strokeOpacity={0.5} /></g>;
    }
    case 'linhaH':
      return <line key={k} x1={x.esq} x2={x.esq + x.iw} y1={x.sy(c.y, c.eixo)} y2={x.sy(c.y, c.eixo)} stroke={c.cor ?? 'var(--ink-2)'} strokeWidth={c.largura ?? 1} strokeDasharray={c.tracejado ? '5 4' : undefined} />;
    case 'linhaV': {
      const px = x.esq + x.passo * c.x;
      return <line key={k} x1={px} x2={px} y1={x.topo} y2={x.topo + x.ih} stroke={c.cor ?? 'var(--ink-2)'} strokeWidth={c.largura ?? 1} strokeDasharray={c.tracejado ? '3 3' : undefined} />;
    }
    case 'linha': {
      let d = '', pen = false;
      c.valores.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x.cx(i).toFixed(1)},${x.sy(v, c.eixo).toFixed(1)}`; pen = true; });
      return (
        <g key={k}>
          <path d={d} fill="none" stroke={c.cor} strokeWidth={c.espessura ?? 2} strokeLinejoin="round" strokeLinecap="round" />
          {c.valores.map((v, i) => v == null ? null : (c.pontos || x.hover === i) ? <circle key={i} cx={x.cx(i)} cy={x.sy(v, c.eixo)} r={x.hover === i ? (c.pontos ?? 2) + 2 : c.pontos} fill={c.cor} stroke="var(--surface)" strokeWidth={x.hover === i ? 2 : 0} /> : null)}
        </g>
      );
    }
    case 'pontos':
      return <g key={k}>{c.valores.map((v, i) => v == null ? null : <circle key={i} cx={x.cx(i)} cy={x.sy(v)} r={c.r ?? 4} fill={c.cor} />)}</g>;
    case 'barras': {
      const bw = Math.max(1, Math.min(c.larguraMax ?? 64, x.passo * (c.ocupa ?? 0.72)));
      return (
        <g key={k}>
          {c.valores.map((v, i) => {
            const b0 = c.base?.[i] ?? 0;
            const y1 = x.sy(b0 + v, c.eixo), y0 = x.sy(b0, c.eixo);
            const h = Math.abs(y0 - y1);
            if (h < 0.5 && v === 0) return null;
            const r = Math.min(c.raio ?? 4, bw / 2, h / (c.topo === 'redondo' ? 2 : 1));
            const top = Math.min(y0, y1), xl = x.cx(i) - bw / 2;
            const cor = typeof c.cor === 'function' ? c.cor(i) : c.cor;
            const path = c.topo === 'redondo'
              ? `M${xl},${top + r}a${r},${r} 0 0 1 ${r},${-r}h${bw - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(bw - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}z`
              : `M${xl},${top + h}V${top + r}a${r},${r} 0 0 1 ${r},${-r}h${bw - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${top + h}z`;
            const ct = c.contorno?.(i);
            return <path key={i} d={path} fill={cor} fillOpacity={c.opacidade?.(i) ?? 1} stroke={ct ?? 'none'} strokeWidth={ct ? 2 : 0} />;
          })}
        </g>
      );
    }
  }
}

/** Barras horizontais com rótulo à esquerda (causas, origens...). */
export function BarrasH({ rotulo, itens, dica, semDados = false, vazio, altura = 250, larguraRotulo = 110 }: {
  rotulo: string; itens: { nome: string; valor: number; cor: string }[]; dica?: (i: number) => Dica | null;
  semDados?: boolean; vazio?: string; altura?: number; larguraRotulo?: number;
}) {
  const [ref, W] = useLargura<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (semDados || !itens.length) return <div className="graf graf-vazio" style={{ height: altura }}><p>{vazio}</p></div>;
  const e = escala(0, Math.max(1, ...itens.map((i) => i.valor)), 4);
  const lr = Math.min(larguraRotulo, W * 0.38);
  const iw = Math.max(10, W - lr - 26), base = 4, ih = altura - base - 24, passo = ih / itens.length;
  const sx = (v: number) => lr + (v / e.max) * iw;
  const bh = Math.min(22, passo * 0.62);
  const d = hover != null && dica ? dica(hover) : null;
  const quebra = (s: string) => { const w = s.split(' '); if (s.length <= 13 || w.length < 2) return [s]; const m = Math.ceil(w.length / 2); return [w.slice(0, m).join(' '), w.slice(m).join(' ')]; };
  return (
    <div className="graf" ref={ref} style={{ height: altura }}>
      {W > 0 && (
        <svg width={W} height={altura} role="img" aria-label={rotulo} tabIndex={dica ? 0 : undefined}
          onPointerMove={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); const i = Math.floor((ev.clientY - r.top - base) / passo); setHover(i >= 0 && i < itens.length ? i : null); }}
          onPointerLeave={(ev) => { if (ev.pointerType === 'mouse') setHover(null); }}
          onKeyDown={(ev) => { if (ev.key === 'ArrowDown') { ev.preventDefault(); setHover((h) => Math.min(itens.length - 1, (h ?? -1) + 1)); } else if (ev.key === 'ArrowUp') { ev.preventDefault(); setHover((h) => Math.max(0, (h ?? itens.length) - 1)); } }}
          onBlur={() => setHover(null)}>
          {e.ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={base} y2={base + ih} className="g-grade" />
              <text x={sx(t)} y={base + ih + 17} textAnchor="middle" className="g-tick">{t}</text>
            </g>
          ))}
          {hover != null && <rect x={lr} y={base + passo * hover} width={iw} height={passo} className="g-hover" />}
          {itens.map((it, i) => {
            const cy = base + passo * (i + 0.5), w = sx(it.valor) - lr, r = Math.min(5, bh / 2, w);
            const ls = quebra(it.nome);
            return (
              <g key={it.nome}>
                <text x={lr - 8} y={cy} textAnchor="end" className="g-tick">
                  {ls.map((l, k) => <tspan key={k} x={lr - 8} dy={k === 0 ? (ls.length > 1 ? '-0.25em' : '0.32em') : '1.1em'}>{l}</tspan>)}
                </text>
                {w > 0 && <path d={`M${lr},${cy - bh / 2}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${bh - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`} fill={it.cor} />}
              </g>
            );
          })}
        </svg>
      )}
      {d && hover != null && (
        <div className="tt-pos" style={{ left: Math.min(W - 200, sx(itens[hover].valor) + 10), top: Math.max(0, base + passo * hover - 6) }} aria-live="polite"><CaixaTt {...d} /></div>
      )}
    </div>
  );
}

/**
 * Rótulo de categoria que se ajusta ao espaço: quebra em até três linhas e,
 * quando a coluna fica estreita demais (celular), inclina e encurta.
 */
export function rotuloAjustavel(t: string, cx: number, y: number, passo: number) {
  if (passo < 44) {
    const curto = t.length > 13 ? `${t.slice(0, 12)}…` : t;
    return <text x={cx} y={y - 6} textAnchor="end" className="g-tick" style={{ fontSize: 11 }} transform={`rotate(-40 ${cx} ${y - 6})`}><title>{t}</title>{curto}</text>;
  }
  const max = Math.max(7, Math.floor(passo / 6.4));
  const linhas: string[] = [];
  let cur = '';
  t.split(' ').forEach((w) => { if ((cur + ' ' + w).trim().length > max && cur) { linhas.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  linhas.push(cur);
  const mostrar = linhas.length > 3 ? [...linhas.slice(0, 2), `${linhas[2].slice(0, max - 1)}…`] : linhas;
  return <text x={cx} y={y} textAnchor="middle" className="g-tick" style={{ fontSize: 11.5 }}>{mostrar.map((l, i) => <tspan key={i} x={cx} dy={i ? 13 : 0}>{l}</tspan>)}</text>;
}

/** Opacidade de uma barra mensal conforme o período escolhido. */
export const opMes = (i: number, from: number, to: number) => (i >= from && i <= to ? 1 : 0.35);

/** Sombras dos meses fora do período escolhido (para gráficos mensais). */
export const sombrasForaDoPeriodo = (from: number, to: number): Camada[] => [
  ...(from > 0 ? [{ tipo: 'sombra' as const, de: 0, ate: from - 1 }] : []),
  ...(to < 11 ? [{ tipo: 'sombra' as const, de: to + 1, ate: 11 }] : []),
];

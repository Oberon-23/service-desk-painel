/*
 * Governança de design: as regras de docs/DESIGN.md checadas no CI.
 * Se um teste daqui falhar, use um token ou componente do kit em vez do valor solto.
 * Exceção consciente: comentário `design-ok: <motivo>` na mesma linha.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = new URL('.', import.meta.url).pathname;
const arquivos = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? arquivos(p, ext) : ext.test(n) && !/\.test\.ts$/.test(n) ? [p] : []; });
const css = readFileSync(join(raiz, 'kit/tema.css'), 'utf8');
const codigo = arquivos(raiz, /\.(tsx?|ts)$/).map((p) => ({ p: p.replace(raiz, 'src/'), linhas: readFileSync(p, 'utf8').split('\n') }));
const jsx = codigo.filter((f) => f.p.endsWith('.tsx'));
const achar = (fs: typeof codigo, re: RegExp, ok: (l: string) => boolean = () => false) =>
  fs.flatMap((f) => f.linhas.flatMap((l, i) => (re.test(l) && !l.includes('design-ok') && !ok(l) ? [`${f.p}:${i + 1}  ${l.trim().slice(0, 110)}`] : [])));

/** CSS sem os blocos de definição de tokens (:root e temas). */
function cssForaDosTokens(texto: string) {
  let r = '', i = 0;
  const semComentario = texto.replace(/\/\*[\s\S]*?\*\//g, '');
  while (i < semComentario.length) {
    const a = semComentario.indexOf('{', i);
    if (a < 0) { r += semComentario.slice(i); break; }
    const seletor = semComentario.slice(Math.max(semComentario.lastIndexOf('}', a), semComentario.lastIndexOf('{', a - 1)) + 1, a).trim();
    if (/^:root/.test(seletor)) { // pula o bloco inteiro
      let n = 1, j = a + 1;
      while (n && j < semComentario.length) { if (semComentario[j] === '{') n++; else if (semComentario[j] === '}') n--; j++; }
      r += semComentario.slice(i, a - seletor.length); i = j; continue;
    }
    r += semComentario.slice(i, a + 1); i = a + 1;
  }
  return r;
}

describe('cores', () => {
  it('o CSS só usa cor hexadecimal dentro dos tokens', () => {
    expect(cssForaDosTokens(css).match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });
  it('o código não tem cor solta', () => {
    expect(achar(codigo, /['"`]#[0-9a-f]{3,8}\b/i)).toEqual([]);
  });
});

describe('tipografia e forma', () => {
  it('todo tamanho de fonte vem da escala --fs-*', () => {
    const soltos = [...cssForaDosTokens(css).matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => !/^var\(--fs-[0-7]\)$|^[0-9.]+em$|^inherit$/.test(v));
    expect(soltos).toEqual([]);
  });
  it('todo raio vem dos tokens --r-*', () => {
    const soltos = [...cssForaDosTokens(css).matchAll(/border-radius:\s*([^;}]+)/g)].map((m) => m[1].trim())
      .filter((v) => !v.split(/\s+/).every((x) => /^var\(--(r-(xs|sm|md|lg|pill)|radius)\)$|^0$|^50%$/.test(x)));
    expect(soltos).toEqual([]);
  });
  it('estilo inline não define cor, fonte ou espaçamento com número solto', () => {
    expect(achar(jsx, /style=\{\{[^}]*\b(fontSize|margin\w*|padding\w*|color)\s*:\s*['"]?[0-9#]/)).toEqual([]);
  });
});

describe('acessibilidade dos componentes', () => {
  it('todo botão só de ícone tem nome (aria-label)', () => {
    expect(achar(jsx, /<button[^>]*className="btn-ic"/, (l) => /aria-label=/.test(l))).toEqual([]);
  });
  it('todo gráfico tem rótulo para leitor de tela', () => {
    expect(achar(jsx, /<Grafico\b/, (l) => /rotulo=/.test(l))).toEqual([]);
  });
  it('todo cartão tem título', () => {
    expect(achar(jsx, /<Card\b/, (l) => /titulo=/.test(l))).toEqual([]);
  });
  it('todo select tem rótulo (aria-label ou dentro de <label>)', () => {
    const sem = jsx.flatMap((f) => f.linhas.flatMap((l, i) =>
      /<select\b/.test(l) && !/aria-label(ledby)?=/.test(l) && !/<label\b/.test(f.linhas[i - 1] ?? '') ? [`${f.p}:${i + 1}`] : []));
    expect(sem).toEqual([]);
  });
});

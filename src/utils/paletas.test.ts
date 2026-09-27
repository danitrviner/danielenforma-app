import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/* ═══════════════════════════════════════════════════════════════════════════
   Las dos paletas tienen que ir a la par

   El modo claro funciona porque cada `--color-X` de `@theme` apunta a un
   `var(--p-X)` que las dos paletas definen. Si alguien añade un color y solo
   lo declara en una, `var(--p-X)` resuelve a VACÍO en la otra: la propiedad se
   cae entera, el elemento hereda el color de su padre, y no hay error de
   compilación ni aviso en consola. Un texto que desaparece sobre su propio
   fondo y nadie se entera hasta que lo ve un atleta.

   Es el mismo fallo silencioso que persigue el resto de src/index.css, y es
   exactamente el tipo de cosa que una persona no comprueba al añadir "solo un
   color más". Por eso lo comprueba el test.
   ═══════════════════════════════════════════════════════════════════════════ */

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

/** El cuerpo del bloque que empieza en `selector` (primer nivel de llaves). */
function bloque(selector: string): string {
  const i = css.indexOf(selector);
  expect(i, `no encuentro el bloque ${selector} en index.css`).toBeGreaterThan(-1);
  const abre = css.indexOf('{', i);
  let nivel = 0;
  for (let j = abre; j < css.length; j++) {
    if (css[j] === '{') nivel++;
    else if (css[j] === '}' && --nivel === 0) return css.slice(abre + 1, j);
  }
  throw new Error(`bloque ${selector} sin cerrar`);
}

const declarados = (cuerpo: string) =>
  new Set([...cuerpo.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

// `:root {` a secas — no `:root:not(...)` ni nada dentro de una media query.
const claro = declarados(bloque('\n:root {\n  color-scheme: light;'));
const oscuro = declarados(bloque('\n.dark {'));
const usados = new Set([...css.matchAll(/var\((--p-[a-z0-9-]+)\)/g)].map((m) => m[1]));

describe('paletas de color', () => {
  it('declara algo (si esto falla, el parser dejó de encontrar los bloques)', () => {
    expect(claro.size).toBeGreaterThan(30);
    expect(oscuro.size).toBeGreaterThan(30);
    expect(usados.size).toBeGreaterThan(30);
  });

  it('todo --p-* que se usa está en LAS DOS paletas', () => {
    const faltan = [...usados].filter((v) => !claro.has(v) || !oscuro.has(v));
    expect(faltan, `sin definir en alguna paleta: ${faltan.join(', ')}`).toEqual([]);
  });

  it('las dos paletas declaran exactamente los mismos nombres', () => {
    const soloClaro = [...claro].filter((v) => !oscuro.has(v));
    const soloOscuro = [...oscuro].filter((v) => !claro.has(v));
    expect(soloClaro, `solo en claro: ${soloClaro.join(', ')}`).toEqual([]);
    expect(soloOscuro, `solo en oscuro: ${soloOscuro.join(', ')}`).toEqual([]);
  });

  it('no queda ningún --p-* declarado que nadie use', () => {
    const huerfanos = [...claro].filter((v) => !usados.has(v));
    expect(huerfanos, `declarados y sin usar: ${huerfanos.join(', ')}`).toEqual([]);
  });
});

/* ── Contraste de la escala de tinta ───────────────────────────────────────
   La escala se calibró midiendo en el navegador, pero un alfa es un número
   fácil de tocar «un pelín» seis meses después sin volver a medir nada. Esto
   fija la frontera en el código: de `ink` a `ink-4` todo es texto legible en
   LOS DOS temas; `ink-5` es el único escalón por debajo, y a propósito.

   Se mide contra `inset`, el fondo más exigente que de verdad lleva texto de
   13 px. `track` es más claro todavía, pero es la pista de una barra de
   progreso: ahí no va texto, y calibrar contra él dejaba ink-4 pegado a ink-3.
   ───────────────────────────────────────────────────────────────────────── */

/** Un color CSS (`#rrggbb` o `rgba(r, g, b, a)`) a [r, g, b, a]. */
function color(v: string): [number, number, number, number] {
  const hex = v.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const f = v.match(/rgba?\(([^)]+)\)/);
  expect(f, `no sé leer el color ${v}`).not.toBeNull();
  const p = f![1].split(',').map((x) => parseFloat(x));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

/** Luminancia relativa (WCAG 2.1). */
function luminancia([r, g, b]: number[]): number {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Contraste de `tinta` (con su alfa) compuesta sobre `fondo` (opaco). */
function contraste(tinta: string, fondo: string): number {
  const [r, g, b, a] = color(tinta);
  const bg = color(fondo);
  const mezcla = [0, 1, 2].map((i) => [r, g, b][i] * a + bg[i] * (1 - a));
  const [x, y] = [luminancia(mezcla), luminancia(bg)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** El valor de un `--p-*` dentro del cuerpo de una paleta. */
function valor(cuerpo: string, nombre: string): string {
  const m = cuerpo.match(new RegExp(`^\\s*${nombre}\\s*:\\s*([^;]+);`, 'm'));
  expect(m, `falta ${nombre}`).not.toBeNull();
  return m![1].trim();
}

const CUERPO = {
  claro: bloque('\n:root {\n  color-scheme: light;'),
  oscuro: bloque('\n.dark {'),
};

describe.each(['claro', 'oscuro'] as const)('escala de tinta · %s', (tema) => {
  const cuerpo = CUERPO[tema];
  const inset = valor(cuerpo, '--p-inset');

  it.each(['--p-ink', '--p-ink-2', '--p-ink-3', '--p-ink-4'])(
    '%s se lee sobre inset (>= 4.5:1)',
    (token) => {
      const r = contraste(valor(cuerpo, token), inset);
      expect(r, `${token} da ${r.toFixed(2)}:1 sobre ${inset}`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('la escala no se cruza: cada escalón contrasta menos que el anterior', () => {
    const pasos = ['--p-ink', '--p-ink-2', '--p-ink-3', '--p-ink-4', '--p-ink-5'];
    const rs = pasos.map((t) => contraste(valor(cuerpo, t), inset));
    for (let i = 1; i < rs.length; i++) {
      expect(rs[i], `${pasos[i]} (${rs[i].toFixed(2)}) no baja respecto a ${pasos[i - 1]} (${rs[i - 1].toFixed(2)})`)
        .toBeLessThan(rs[i - 1]);
    }
  });
});

/* ── Nadie apila opacidad sobre la escala ─────────────────────────────────
   `text-ink-2/60` se lee como «ink-2 un poco más flojo», pero ink-2 YA lleva
   0,77 de alfa: el modificador lo multiplica y deja 0,46 efectivo, por debajo
   de ink-4. La escala se salta entera y al escribirlo no se nota.

   Había 15 en la app el 27-09 —entre ellas los rótulos «DÍA A DÍA» y
   «BIBLIOTECA» de la barra lateral del coach, que por eso no se leían—.
   Si necesitas algo más flojo que ink-2, el siguiente escalón existe: úsalo.
   ───────────────────────────────────────────────────────────────────────── */

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const ruta = `${dir}/${e}`;
    if (statSync(ruta).isDirectory()) fuentes(ruta, acc);
    else if (/\.(tsx?|jsx?)$/.test(e)) acc.push(ruta);
  }
  return acc;
}

it('ningún componente apila opacidad sobre un token de tinta', () => {
  const raiz = resolve(__dirname, '..');
  const culpables: string[] = [];
  for (const f of fuentes(raiz)) {
    if (f.endsWith('paletas.test.ts')) continue; // este archivo los nombra
    const texto = readFileSync(f, 'utf8');
    for (const m of texto.matchAll(/\b(?:text|bg|border|fill|stroke)-ink(?:-[2-5])?\/\d+\b/g)) {
      culpables.push(`${f.slice(raiz.length + 1)}: ${m[0]}`);
    }
  }
  expect(culpables, `usa el escalón que toca en vez de multiplicar alfas:\n${culpables.join('\n')}`).toEqual([]);
});

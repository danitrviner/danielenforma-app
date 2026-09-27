import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

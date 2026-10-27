/* Índice por palabras de la copia de Open Food Facts (buscador por nombre).
 *
 * El índice de `indice.json` solo lleva los 30.000 productos más escaneados.
 * Para buscar entre TODOS sin bajarse decenas de MB, cada producto se apunta en
 * el trozo de las tres primeras letras de cada palabra de su nombre y su marca
 * (`n/yog.json`, `n/hac.json`…). Un trozo con demasiados productos se parte por
 * cuatro letras (`n/choc.json`). `n/_prefijos.json` dice qué trozos existen:
 * en Vercel un archivo que no existe devuelve la app (index.html), no un 404.
 *
 * Gemelo de `src/utils/offPalabras.ts` (hay un test que lo comprueba): si
 * divergen, el buscador pide trozos que no son.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Palabras que no distinguen nada: se quedan fuera del índice y de la búsqueda. */
export const PALABRAS_VACIAS = new Set(['con', 'sin', 'para', 'por', 'los', 'las', 'del', 'una', 'uno', 'unos', 'unas', 'que', 'the', 'and', 'with', 'avec', 'sans', 'pour', 'des', 'les', 'aux']);
/** Productos por trozo de tres letras a partir del cual se parte en cuatro. */
export const LIMITE_TROZO = 2000;

/** Igual que `normalizarTexto` de src/utils/busqueda.ts. */
export function normalizar(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Palabras por las que se indexa un producto: las 8 primeras del nombre y las 2 de la marca. */
export function palabrasDeProducto(nombre, marca) {
  const trocear = (t, max) => normalizar(t).split(/[^a-z0-9]+/).filter(Boolean).slice(0, max);
  const todas = [...trocear(nombre, 8), ...trocear(marca ?? '', 2)];
  return Array.from(new Set(todas.filter(p => p.length >= 3 && !PALABRAS_VACIAS.has(p) && !/^\d+$/.test(p))));
}

/** Escribe `n/` dentro de la carpeta de la copia (la que tiene `p/` e `indice.json`). */
export function escribirIndicePalabras(carpeta) {
  const rango = new Map();
  try {
    const { items } = JSON.parse(readFileSync(join(carpeta, 'indice.json'), 'utf8'));
    items.forEach(([c], i) => rango.set(c, i));
  } catch { /* sin índice: todos empatan y se ordena por nombre */ }

  const porTres = new Map();
  for (const f of readdirSync(join(carpeta, 'p')).filter(f => f.endsWith('.json'))) {
    const trozo = JSON.parse(readFileSync(join(carpeta, 'p', f), 'utf8'));
    for (const r of Object.values(trozo)) {
      if ('i' in r) continue; // incompletos: no se apuntan, así que tampoco se buscan
      const entrada = [r.c, r.n, r.b ?? ''];
      const palabras = palabrasDeProducto(r.n, r.b);
      for (const p3 of new Set(palabras.map(p => p.slice(0, 3)))) {
        if (!porTres.has(p3)) porTres.set(p3, []);
        porTres.get(p3).push({ entrada, palabras });
      }
    }
  }

  const ordenar = (lista) => lista.sort((a, b) =>
    (rango.get(a[0]) ?? Infinity) - (rango.get(b[0]) ?? Infinity) || a[1].localeCompare(b[1]));
  const archivos = new Map();
  const partidos = [];
  for (const [p3, lista] of porTres) {
    if (lista.length <= LIMITE_TROZO) { archivos.set(p3, ordenar(lista.map(x => x.entrada))); continue; }
    partidos.push(p3);
    const porCuatro = new Map();
    for (const { entrada, palabras } of lista) {
      for (const p4 of new Set(palabras.filter(p => p.startsWith(p3) && p.length >= 4).map(p => p.slice(0, 4)))) {
        if (!porCuatro.has(p4)) porCuatro.set(p4, []);
        porCuatro.get(p4).push(entrada);
      }
    }
    for (const [p4, l] of porCuatro) archivos.set(p4, ordenar(l));
  }

  const dir = join(carpeta, 'n');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [prefijo, items] of archivos) writeFileSync(join(dir, `${prefijo}.json`), JSON.stringify({ items }));
  const claves = Array.from(archivos.keys()).sort();
  writeFileSync(join(dir, '_prefijos.json'), JSON.stringify({ v: 1, partidos: partidos.sort(), prefijos: claves }));
  return { archivos: archivos.size, partidos: partidos.length };
}

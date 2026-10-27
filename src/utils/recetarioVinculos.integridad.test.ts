import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import type { RecetaCruda } from './recetaVinculada';

/* Integridad del recetario vinculado (revisión de motores, 26-10-2026).
 *
 * El índice (`public/recetas-indice.json`) guarda los valores por 100 g de cada
 * alimento UNA sola vez. Si dos recetas traen un `porCien` distinto para el
 * mismo alimentoId, el generador se queda con el último y la otra receta se
 * desglosa con números que no son los suyos. Aquí se lee el recetario entero
 * (8.929 recetas) y se exige un solo porCien por alimento. Si falla, hay que
 * revincular (`scripts/vincularTodas.ts --revincular` o
 * `scripts/vincularRecetas.ts recalcular`) antes de regenerar el índice. */

const DIR = resolve(__dirname, '../../public/recetas');

describe('recetario vinculado', () => {
  it('cada alimentoId tiene un solo porCien en todas las recetas', () => {
    const versiones = new Map<string, Map<string, string[]>>();
    for (const archivo of readdirSync(DIR).filter(f => /^recetas_.*\.json$/.test(f))) {
      const { recipes } = JSON.parse(readFileSync(resolve(DIR, archivo), 'utf8')) as { recipes: RecetaCruda[] };
      for (const r of recipes) {
        for (const i of r.vinculo?.ingredientes ?? []) {
          if (!i.alimentoId || !i.porCien) continue;
          const clave = [i.porCien.kcal, i.porCien.p, i.porCien.hc, i.porCien.g].join('|');
          const porId = versiones.get(i.alimentoId) ?? new Map<string, string[]>();
          porId.set(clave, [...(porId.get(clave) ?? []), r.id]);
          versiones.set(i.alimentoId, porId);
        }
      }
    }
    const conflictos = [...versiones].filter(([, porId]) => porId.size > 1)
      .map(([id, porId]) => `${id}: ${[...porId].map(([k, ids]) => `${k} (${ids.length})`).join(' vs ')}`);
    expect(conflictos, conflictos.join('\n')).toEqual([]);
  });
});

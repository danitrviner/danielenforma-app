import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* ═══════════════════════════════════════════════════════════════════════════
   Vercel (plan Hobby) admite como mucho 12 funciones por despliegue, y cuenta
   como función CADA archivo de `api/` que no esté en una carpeta con guion
   bajo — también los `*.test.ts`. El 30-10-2026 main estaba justo en 12, una
   función nueva hizo 13 y el despliegue falló con
   `exceeded_serverless_functions_per_deployment` sin que nada en local lo
   avisara. Por eso los tests viven en `api/_tests/` y esta prueba cuenta.
   ═══════════════════════════════════════════════════════════════════════════ */

const LIMITE_HOBBY = 12;

function funcionesDeVercel(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    if (nombre.startsWith('_') || nombre.startsWith('.')) return [];
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return funcionesDeVercel(ruta);
    return /\.(ts|js|mjs|cjs)$/.test(nombre) ? [ruta] : [];
  });
}

describe('funciones de Vercel', () => {
  it(`no pasan de ${LIMITE_HOBBY} (plan Hobby)`, () => {
    const funciones = funcionesDeVercel('api');
    expect(funciones.length,
      `Hay ${funciones.length} funciones en api/ y el plan Hobby admite ${LIMITE_HOBBY}: el despliegue fallaría.\n`
      + 'Junta endpoints en uno, o mueve lo que no sea un endpoint (tests, utilidades) a una carpeta con guion bajo (api/_lib, api/_tests).\n'
      + funciones.join('\n')).toBeLessThanOrEqual(LIMITE_HOBBY);
  });

  it('ningún test está fuera de api/_tests (cada uno contaría como función)', () => {
    expect(funcionesDeVercel('api').filter(f => /\.test\.(ts|js)$/.test(f))).toEqual([]);
  });
});

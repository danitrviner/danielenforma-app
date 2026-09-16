import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

/* ═══════════════════════════════════════════════════════════════════════════
   El latido corre en el servidor: nada de lo que arrastra puede ser del
   navegador.

   Este test no mira estilo, mira que el endpoint SIGA PUDIENDO EXISTIR. Basta
   con que alguien añada en `levelLadder.ts` un `import { db } from
   '../firebase'` —o un import de React para una constante— para que
   `api/latido-diario.ts` deje de poder importarlo: firebase-web intenta tocar
   `window`, React no pinta nada en un proceso sin DOM y ambos se llevan por
   delante el despliegue de la función, no el de la app.

   Y lo haría en silencio: `tsc` pasa, los tests del navegador pasan, y lo que
   revienta es la función de Vercel a las dos de la mañana. Por eso la
   comprobación vive aquí y no en una revisión a ojo.
   ═══════════════════════════════════════════════════════════════════════════ */

const RAIZ = resolve(__dirname, '../..');

/** Paquetes que solo existen dentro de un navegador. */
const SOLO_NAVEGADOR = /^(firebase|react|react-dom|react-router|@tanstack|recharts|@capacitor|@sentry)/;

/** Los módulos que el endpoint importa de `src/`. */
const ENTRADAS = [
  'src/utils/latidoDiario.ts',
  'src/utils/motorRetoSemanal.ts',
  'src/utils/trainingWeek.ts',
  'src/data/defaultLevelLadder.ts',
  'src/utils/atletas.ts',
];

function resolverImport(desde: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(desde), spec.replace(/\.js$/, ''));
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (existsSync(base + ext)) return base + ext;
  }
  return existsSync(base) ? base : null;
}

function recorrer(entradas: string[]): { infracciones: string[]; modulos: number } {
  const visto = new Set<string>();
  const infracciones: string[] = [];

  const visitar = (fichero: string, cadena: string[]) => {
    if (visto.has(fichero)) return;
    visto.add(fichero);
    const src = readFileSync(fichero, 'utf8');
    const imports = src.matchAll(/(?:^|\n)\s*import\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g);
    for (const m of imports) {
      const spec = m[1];
      if (SOLO_NAVEGADOR.test(spec)) {
        const ruta = [...cadena, fichero].map(f => relative(RAIZ, f)).join(' → ');
        infracciones.push(`${spec} desde ${ruta}`);
        continue;
      }
      const sig = resolverImport(fichero, spec);
      if (sig) visitar(sig, [...cadena, fichero]);
    }
  };

  for (const e of entradas) visitar(resolve(RAIZ, e), []);
  return { infracciones, modulos: visto.size };
}

describe('lo que importa el latido diario', () => {
  it('no arrastra firebase, React ni nada de navegador', () => {
    const { infracciones, modulos } = recorrer(ENTRADAS);
    expect(infracciones, infracciones.join('\n')).toEqual([]);
    // Si esto baja mucho, es que el grafo se quedó a medias por un import que
    // no se supo resolver y el test estaría pasando por no mirar nada.
    expect(modulos).toBeGreaterThan(10);
  });

  it('el detector funciona: un módulo del navegador sí se caza', () => {
    // Control del propio test. `dbService` importa firebase por definición.
    const { infracciones } = recorrer(['src/dbService.ts']);
    expect(infracciones.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/* ═══════════════════════════════════════════════════════════════════════════
   Todo lo que alcanza `api/` tiene que importar con `.js`.

   Las funciones de Vercel corren como ESM en Node de verdad, donde la
   extensión NO es opcional: `from './trainingWeek'` lanza
   ERR_MODULE_NOT_FOUND al arrancar la función.

   Y NO basta con mirar `api/`. La regla es transitiva: un fichero de
   `src/utils/` que importe a otro sin extensión rompe igual, porque acaba
   dentro del mismo paquete ESM. La primera versión de este test solo miraba
   `api/`, se desplegó, y el latido siguió devolviendo 500 — esta vez desde
   `latidoDiario.js`, tres saltos más abajo.

   Lo peligroso es que nada en local lo ve: `tsc` resuelve sin extensión,
   vitest también, y `npm run build` solo compila el CLIENTE — las funciones de
   `api/` ni las toca. El fallo aparece por primera vez en producción, y no
   como error de compilación sino como un HTTP 500 al llamar al endpoint.

   Por eso este test recorre el grafo desde cada función de `api/` y exige la
   extensión en todo el camino.
   ═══════════════════════════════════════════════════════════════════════════ */

const IMPORT_RELATIVO = /\bfrom\s+'(\.\.?\/[^']*)'/g;

/** A qué fichero nuestro apunta un especificador, o `null` si no es nuestro. */
function resolverImport(desde: string, especificador: string): string | null {
  const base = resolve(dirname(desde), especificador.replace(/\.js$/, ''));
  for (const candidato of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidato)) return candidato;
  }
  return null;
}

describe('imports de todo lo que corre como función de Vercel', () => {
  it('llevan .js, también los de src/ que api/ arrastra', () => {
    const entradas = readdirSync('api')
      .filter(f => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
      .map(f => resolve('api', f));

    const vistos = new Set<string>();
    const pendientes = [...entradas];
    const culpables: string[] = [];

    while (pendientes.length) {
      const fichero = pendientes.pop()!;
      if (vistos.has(fichero)) continue;
      vistos.add(fichero);

      const texto = readFileSync(fichero, 'utf8');
      for (const m of texto.matchAll(IMPORT_RELATIVO)) {
        const destino = resolverImport(fichero, m[1]);
        if (destino) pendientes.push(destino);
        // Solo se exige extensión a lo que apunta a un fichero NUESTRO: un
        // import que no resuelve aquí es de node_modules y lo resuelve Node.
        if (destino && !m[1].endsWith('.js')) {
          const linea = texto.slice(0, m.index).split('\n').length;
          culpables.push(`${relative(process.cwd(), fichero)}:${linea} → ${m[1]}`);
        }
      }
    }

    // Si esto baja de golpe, es que se ha roto el recorrido, no que se haya
    // limpiado nada: la cifra solo puede crecer al añadir código al latido.
    expect(vistos.size).toBeGreaterThanOrEqual(25);
    expect(culpables).toEqual([]);
  });
});

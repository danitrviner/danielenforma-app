import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* ═══════════════════════════════════════════════════════════════════════════
   Los imports relativos de `api/` tienen que llevar `.js`.

   Las funciones de Vercel corren como ESM en Node de verdad, y ahí la
   extensión NO es opcional: `from '../src/utils/atletas'` lanza
   ERR_MODULE_NOT_FOUND al arrancar la función.

   Lo peligroso es que NADA de lo que corre en local lo ve. `tsc` resuelve sin
   extensión, vitest también, y el `npm run build` solo compila el cliente — las
   funciones de `api/` ni las toca. Así que el fallo aparece por primera vez en
   producción, y no como un error de compilación sino como un HTTP 500 al
   llamar al endpoint.

   Pasó de verdad: el latido diario y el proxy del asistente se desplegaron a
   producción con tres imports sin extensión, y los dos devolvían 500.
   ═══════════════════════════════════════════════════════════════════════════ */

const RELATIVO_SIN_EXTENSION = /\bfrom\s+'(\.\.?\/[^']*)'/g;

function ficherosTs(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) ficherosTs(ruta, salida);
    else if (/\.ts$/.test(ruta) && !/\.test\.ts$/.test(ruta)) salida.push(ruta);
  }
  return salida;
}

describe('imports de las funciones de api/', () => {
  it('todos los relativos acaban en .js', () => {
    const culpables: string[] = [];
    for (const fichero of ficherosTs('api')) {
      const texto = readFileSync(fichero, 'utf8');
      for (const m of texto.matchAll(RELATIVO_SIN_EXTENSION)) {
        if (m[1].endsWith('.js')) continue;
        const linea = texto.slice(0, m.index).split('\n').length;
        culpables.push(`${fichero}:${linea} → ${m[1]}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});

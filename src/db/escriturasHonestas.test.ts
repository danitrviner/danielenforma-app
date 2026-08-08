import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* ═══════════════════════════════════════════════════════════════════════════
   Invariante: una escritura denegada por permisos NO puede fingir que se
   guardó.

   El patrón de src/db/ es `catch → setLocalBypassMode → guardar en localStorage
   → devolver éxito`. Para una LECTURA eso es correcto: se enseña la última copia
   conocida. Para una ESCRITURA ante `permission-denied` es una mentira — ese
   dato no va a sincronizar nunca, y dejarlo en localStorage solo sirve para que
   la persona crea que está a salvo. Por eso cada escritura relanza.

   Esto se comprueba leyendo el código y no ejecutándolo a propósito: son ~107
   funciones repartidas en 19 ficheros, montar un mock de Firestore para cada una
   costaría más de lo que protege. Lo que de verdad hay que impedir es que la
   escritura número 108 se añada sin el relanzamiento, y para eso basta con leer
   el fuente.
   ═══════════════════════════════════════════════════════════════════════════ */

const DIR = new URL('.', import.meta.url).pathname;

const ESCRITURA = /^(create|update|delete|save|add|mark|set|assign|deactivate|submit|invite|bulkUpsert|upsert|guardar)/;

// Excepciones deliberadas. Cada una lleva su comentario en el código explicando
// por qué; si añades una aquí, añade también el porqué allí.
const EXCEPCIONES: Record<string, string> = {
  getOrCreateUserProfile: 'ruta de arranque de sesión: si lanza, nadie entra en la app',
  seedExercisesIfEmpty: 'catálogo del sistema, no dato del usuario',
  seedFoodItemsIfEmpty: 'catálogo del sistema, no dato del usuario',
  inviteClient: 'el correo ya se envió fuera del try; lanzar diría que no se envió',
};

interface Sitio { fichero: string; linea: number; fn: string; relanza: boolean }

function escanear(): Sitio[] {
  const sitios: Sitio[] = [];
  for (const nombre of readdirSync(DIR)) {
    if (!nombre.endsWith('.ts') || nombre.endsWith('.test.ts') || nombre === 'core.ts') continue;
    const lineas = readFileSync(join(DIR, nombre), 'utf8').split('\n');
    let fn = '';
    lineas.forEach((l, i) => {
      const m = /^(?:export )?(?:async )?function (\w+)/.exec(l.trim());
      if (m) fn = m[1];
      if (l.includes('setLocalBypassMode(true, err);')) {
        sitios.push({
          fichero: nombre,
          linea: i + 1,
          fn,
          relanza: (lineas[i + 1] ?? '').includes('if (esFalloDePermisos(err)) throw err;'),
        });
      }
    });
  }
  return sitios;
}

describe('escrituras honestas ante permission-denied', () => {
  const sitios = escanear();

  it('encuentra los catch de src/db (si esto falla, el escáner se ha quedado ciego)', () => {
    expect(sitios.length).toBeGreaterThan(150);
  });

  it('toda escritura relanza ante un fallo de permisos', () => {
    const incumplen = sitios
      .filter(s => ESCRITURA.test(s.fn) && !(s.fn in EXCEPCIONES) && !s.relanza)
      .map(s => `${s.fichero}:${s.linea} ${s.fn}`);
    expect(incumplen).toEqual([]);
  });

  it('ninguna lectura relanza — su fallback local es correcto', () => {
    const incumplen = sitios
      .filter(s => !ESCRITURA.test(s.fn) && s.relanza)
      .map(s => `${s.fichero}:${s.linea} ${s.fn}`);
    expect(incumplen).toEqual([]);
  });

  it('las excepciones siguen siendo excepciones, y no una lista que ya nadie mira', () => {
    const nombres = new Set(sitios.map(s => s.fn));
    for (const fn of Object.keys(EXCEPCIONES)) {
      expect(nombres.has(fn), `${fn} ya no existe: quítalo de EXCEPCIONES`).toBe(true);
    }
    const exceptuadasQueRelanzan = sitios.filter(s => s.fn in EXCEPCIONES && s.relanza);
    expect(exceptuadasQueRelanzan.map(s => s.fn)).toEqual([]);
  });
});

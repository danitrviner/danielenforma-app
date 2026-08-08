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

   LÍMITE QUE CONVIENE CONOCER: el escáner solo ve los `catch` que llaman a
   `setLocalBypassMode(true, err);`. Una escritura nueva cuyo catch se limite a
   avisar por consola y devolver la copia local es invisible aquí y el test
   pasará en verde. Hoy hay dos así a propósito —`markNutritionPhaseSeen` y
   `saveRoadmapLevelProgress`—, y son legítimas porque guardan estado derivado
   que se recalcula solo; pero si mañana alguien copia esa forma para un dato
   real, esto no lo va a pillar. Lo que este test garantiza es que quien copie
   el patrón MAYORITARIO no se deje el relanzamiento, no que no exista otro
   patrón.
   ═══════════════════════════════════════════════════════════════════════════ */

const DIR = new URL('.', import.meta.url).pathname;

// Prefijos que identifican una escritura. Hay verbos en español porque el
// módulo del catálogo de máquinas nombra así sus funciones (`publicarMaquina`,
// `crearMaquinaAdmin`...): sin ellos, una escritura futura con su propio catch
// se clasificaría como LECTURA y el tercer test la marcaría en rojo por
// relanzar — castigando código correcto.
const ESCRITURA = /^(create|update|delete|save|add|mark|set|assign|deactivate|submit|invite|bulkUpsert|upsert|guardar|crear|actualizar|borrar|eliminar|publicar|ocultar|promover|subir|registrar|importar|archivar|desarchivar)/;

// Excepciones deliberadas. Cada una lleva su comentario en el código explicando
// por qué; si añades una aquí, añade también el porqué allí.
const EXCEPCIONES: Record<string, string> = {
  getOrCreateUserProfile: 'ruta de arranque de sesión: si lanza, nadie entra en la app',
  seedExercisesIfEmpty: 'catálogo del sistema, no dato del usuario',
  seedFoodItemsIfEmpty: 'catálogo del sistema, no dato del usuario',
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
          // La ventana se corta en el fin de la función (una línea `}` a
          // columna 0): sin ese tope se colaba en la función siguiente y daba
          // por "relanzadora" a la lectura de arriba.
          //
          // Se acepta cualquier `throw` bajo la guarda de permisos, no solo
          // `throw err`: `inviteClient` lanza un error propio
          // (`invite/registro-denegado`) porque el correo sí salió y relanzar el
          // crudo diría lo contrario. Lo que exige el invariante es que NO se
          // devuelva éxito, no la forma exacta del throw.
          relanza: (() => {
            const resto = lineas.slice(i + 1);
            const fin = resto.findIndex(l => l === '}');
            const ventana = resto.slice(0, fin === -1 ? resto.length : fin);
            const guarda = ventana.findIndex(l => l.includes('esFalloDePermisos(err)'));
            if (guarda === -1) return false;
            return ventana.slice(guarda, guarda + 5).some(l => l.includes('throw'));
          })(),
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

/* ═══════════════════════════════════════════════════════════════════════════
   Segundo invariante: ninguna pantalla puede quedarse colgada porque una
   escritura lance.

   Al hacer que las escrituras relancen, cualquier handler con la forma
   `setX(true) → await escritura() → setX(false)` sin `finally` deja el botón en
   "Guardando..." para siempre si la escritura falla, sin decir por qué y sin
   poder reintentar. Aparecieron dos: ManualSessionModal y CardioSessionDetail.

   El escaneo mira el árbol entero, no solo .tsx, porque un hook en .ts puede
   tener exactamente la misma forma.
   ═══════════════════════════════════════════════════════════════════════════ */

const SRC = join(DIR, '..');

function ficherosFuente(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...ficherosFuente(p));
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

/** Extrae el cuerpo de cada función async, equilibrando llaves. */
function cuerposAsync(src: string): string[] {
  const out: string[] = [];
  const re = /(async\s*\([^)]*\)\s*=>\s*\{|async function \w*\s*\([^)]*\)\s*\{)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let i = m.index + m[0].length - 1, prof = 0, j = i;
    for (; j < src.length; j++) {
      if (src[j] === '{') prof++;
      else if (src[j] === '}' && --prof === 0) break;
    }
    out.push(src.slice(i, j + 1));
  }
  return out;
}

describe('ninguna pantalla se cuelga cuando una escritura lanza', () => {
  const queLanzan = new Set(
    escanear().filter(s => s.relanza).map(s => s.fn)
  );

  it('hay funciones que lanzan (si no, este test no está mirando nada)', () => {
    expect(queLanzan.size).toBeGreaterThan(90);
  });

  it('todo handler con bandera de carga alrededor de una escritura tiene finally', () => {
    const patron = new RegExp(`\\b(${[...queLanzan].join('|')})\\s*\\(`);
    const colgados: string[] = [];
    for (const f of ficherosFuente(SRC)) {
      const src = readFileSync(f, 'utf8');
      if (!patron.test(src)) continue;
      for (const cuerpo of cuerposAsync(src)) {
        if (!patron.test(cuerpo)) continue;
        if (!/set\w+\(true\)/.test(cuerpo)) continue;
        if (cuerpo.includes('finally')) continue;
        colgados.push(`${f.slice(f.indexOf('/src/') + 1)} → ${(/set(\w+)\(true\)/.exec(cuerpo) ?? [])[0]}`);
      }
    }
    expect(colgados).toEqual([]);
  });
});

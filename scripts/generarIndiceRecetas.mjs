/**
 * Genera el índice del recetario que viaja DENTRO de la app.
 *
 * Por qué existe: el recetario son 8.850 documentos que no cambian casi nunca,
 * y hasta ahora la lista los leía de Firestore en cada sesión de cada atleta.
 * Eso agotaba la cuota diaria de lecturas de la base de datos —con la app
 * entera cayéndose a modo local cuando pasaba— y encima pagaba un viaje a
 * us-west1 por cada página. Empaquetado, listar y filtrar recetas cuesta CERO
 * lecturas; solo se va al servidor al abrir una receta concreta, que es cuando
 * hacen falta los pasos y las cantidades.
 *
 * Mismo patrón que el catálogo de máquinas (`src/data/maquinas/`).
 *
 * El índice lleva SOLO lo que la lista necesita para pintar y filtrar. Los
 * campos y el cálculo de intercambios se derivan igual que en
 * `importRecetas.mjs`, y el id es el mismo UUID que el documento de Firestore,
 * para que abrir una receta del índice encuentre su documento.
 *
 * Uso:
 *   node scripts/generarIndiceRecetas.mjs
 *
 * Hay que volver a ejecutarlo cuando cambie el recetario de `public/recetas/`.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';
import { exchangesFromMacros } from './lib/redondeoIntercambios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RECETAS_DIR = resolve(process.env.RECETAS_DIR ?? resolve(__dirname, '../public/recetas'));
const SALIDA      = resolve(__dirname, '../public/recetas-indice.json');

// Recetas del recetario original que también cuentan como básicas. Las nuevas
// ya traen `basica: true` en su propio JSON (recetas_05_basicas_p01.json).
const BASICAS_EXISTENTES = new Set(
  JSON.parse(readFileSync(resolve(RECETAS_DIR, 'basicas_existentes.json'), 'utf8')).ids,
);

function computeExchanges(macros) {
  return exchangesFromMacros(macros ? {
    carb: macros.carbohydrate?.grams ?? 0,
    prot: macros.protein?.grams      ?? 0,
    fat:  macros.fat?.grams          ?? 0,
  } : null);
}

/** Gramos de cada macro (como `Recipe.macros`) y kcal; las kcal que falten se
 *  calculan con 4/4/9. Sin macros, nada: la app cae a los intercambios. */
function macrosYKcal(r) {
  if (!r.macros) return {};
  const macros = {
    carb: r.macros.carbohydrate?.grams ?? 0,
    prot: r.macros.protein?.grams ?? 0,
    fat:  r.macros.fat?.grams ?? 0,
  };
  if (!macros.carb && !macros.prot && !macros.fat) return {};
  const kcal = r.kcal > 0 ? Math.round(r.kcal) : Math.round(macros.carb * 4 + macros.prot * 4 + macros.fat * 9);
  return { macros, kcal };
}

/**
 * Solo los campos que se usan sin abrir la receta:
 *   · id, name, image  → la tarjeta
 *   · macros, kcal     → la tarjeta y el encaje en lo que te queda (10-2026:
 *                        la app cuenta en kcal y gramos, utils/macrosDeReceta.ts)
 *   · exchanges        → el motor de menús, mientras siga en intercambios
 *   · categoria,
 *     intakeTypes      → los filtros de categoría e ingesta
 *   · restrictions     → apto/no apto por régimen (vegano, celiaquía…)
 *   · ingredientsText  → SOLO los nombres: alergias y me-gusta/no-me-gusta se
 *                        resuelven buscando dentro del nombre del ingrediente.
 *                        Las cantidades no hacen falta hasta abrir la receta, y
 *                        son la mitad del peso del campo.
 *
 * Todo lo demás —pasos, cantidades, peso, tiempo, dificultad— se queda fuera y
 * llega con la receta completa desde Firestore al abrirla.
 */
/** Valores por 100 g de los alimentos de los vínculos: [kcal, p, hc, g]. */
const ALIMENTOS = new Map();
// Dónde se vio cada versión de un alimento: id → (kcal|p|hc|g → [recetaIds]).
// Dos recetas con porCien distinto para el mismo alimentoId no pueden
// compartir una entrada de `alimentos`: el índice se queda con una y la otra
// receta se desglosa mal en la app (revisión de motores 26-10-2026: 34
// alimentos, 4.138 recetas afectadas). El generador aborta y lo lista.
const VERSIONES = new Map();
const PALANCA_CORTA = { proteina: 'p', hc: 'h', grasa: 'g' };

function mapEntradaIndice(r) {
  const entrada = {
    id:          r.id,
    name:        r.name,
    exchanges:   computeExchanges(r.macros),
    ...macrosYKcal(r),
    intakeTypes: r.intakeTypes ?? [],
    restrictions: r.forbiddenFor ?? [],
    ingredientsText: (r.ingredients ?? []).map(i => ({ name: i.name })),
  };
  // Se omiten en vez de guardarse como null: son 8.850 entradas y cada clave
  // vacía se paga en cada instalación de la app.
  if (r.image)       entrada.image       = r.image;
  if (r.categoria)   entrada.categoria   = r.categoria;
  // Los usa el motor de menús para repartir recetas rápidas entre semana y
  // tuppers el fin de semana (src/utils/menuEngine.ts).
  if (r.cookingTime) entrada.cookingTime = r.cookingTime;
  if (r.tupper)      entrada.tupper      = r.tupper;
  // Pestaña «Básicas» del recetario.
  if (r.basica === true || BASICAS_EXISTENTES.has(r.id)) entrada.basica = true;
  // Recetas con ingredientes vinculados (N-05, y desde 26-10-2026 casi todas):
  // el generador de menús necesita sus gramos y rangos sin abrir la receta.
  // Compacto: una tupla [n, alimento, gramos, min, max, palanca] por
  // ingrediente (palanca 'p'|'h'|'g', o 0 si es fijo) y los valores por 100 g
  // de cada alimento UNA vez en `alimentos` (ver hidratarEntradaIndice).
  if (r.vinculo) {
    entrada.vin = r.vinculo.ingredientes.map(i => {
      if (i.alimentoId && i.porCien) {
        const v = [i.porCien.kcal, i.porCien.p, i.porCien.hc, i.porCien.g];
        ALIMENTOS.set(i.alimentoId, v);
        const porId = VERSIONES.get(i.alimentoId) ?? new Map();
        const clave = v.join('|');
        porId.set(clave, [...(porId.get(clave) ?? []), r.id]);
        VERSIONES.set(i.alimentoId, porId);
      }
      return [i.n, i.alimentoId, i.gramos, i.min, i.max, i.fijo || !i.palanca ? 0 : PALANCA_CORTA[i.palanca]];
    });
  }
  return entrada;
}

function main() {
  const index = JSON.parse(readFileSync(resolve(RECETAS_DIR, '00_indice.json'), 'utf8'));
  const files = index.archivos ?? index.files ?? [];

  const recetas = [];
  for (const entry of files) {
    const filePath = resolve(RECETAS_DIR, entry.archivo ?? entry.file ?? entry);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    for (const r of raw.recipes ?? raw.recetas ?? []) recetas.push(mapEntradaIndice(r));
  }

  // Ordenado por nombre aquí y no en la app: es el mismo orden que usaba la
  // consulta de Firestore (`orderBy('name')`), y así el móvil no reordena 8.850
  // entradas en cada arranque.
  recetas.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const conflictos = [...VERSIONES].filter(([, porId]) => porId.size > 1);
  if (conflictos.length > 0) {
    console.error(`✗ ${conflictos.length} alimento(s) con más de un porCien en las recetas; no se escribe el índice.`);
    console.error('  Unifica los vínculos (scripts/vincularTodas.ts --revincular o vincularRecetas.ts recalcular) y vuelve a generar.');
    for (const [id, porId] of conflictos) {
      console.error(`  · ${id}`);
      for (const [clave, ids] of porId) {
        const muestra = ids.slice(0, 3).join(', ') + (ids.length > 3 ? ', …' : '');
        console.error(`      ${clave.padEnd(24)} en ${String(ids.length).padStart(5)} receta(s): ${muestra}`);
      }
    }
    process.exit(1);
  }

  const json = JSON.stringify({ generado: new Date().toISOString(), total: recetas.length, alimentos: Object.fromEntries(ALIMENTOS), recetas });
  writeFileSync(SALIDA, json);

  const kb = n => `${(n / 1024).toFixed(0)} KB`;
  console.log(`✔ ${recetas.length} recetas → public/recetas-indice.json`);
  console.log(`  ${kb(Buffer.byteLength(json))} en disco · ${kb(gzipSync(json).length)} al descargarse`);
}

main();

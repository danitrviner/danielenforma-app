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

function computeExchanges(macros) {
  return exchangesFromMacros(macros ? {
    carb: macros.carbohydrate?.grams ?? 0,
    prot: macros.protein?.grams      ?? 0,
    fat:  macros.fat?.grams          ?? 0,
  } : null);
}

/**
 * Solo los campos que se usan sin abrir la receta:
 *   · id, name, image  → la tarjeta
 *   · exchanges        → la tarjeta y el filtro por presupuesto de la dieta
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
function mapEntradaIndice(r) {
  const entrada = {
    id:          r.id,
    name:        r.name,
    exchanges:   computeExchanges(r.macros),
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

  const json = JSON.stringify({ generado: new Date().toISOString(), total: recetas.length, recetas });
  writeFileSync(SALIDA, json);

  const kb = n => `${(n / 1024).toFixed(0)} KB`;
  console.log(`✔ ${recetas.length} recetas → public/recetas-indice.json`);
  console.log(`  ${kb(Buffer.byteLength(json))} en disco · ${kb(gzipSync(json).length)} al descargarse`);
}

main();

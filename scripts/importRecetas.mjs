/**
 * Importa el recetario a Firestore using the Admin SDK.
 *
 * POR DEFECTO ES UN SIMULACRO: lee los JSON, calcula el informe y NO escribe
 * nada. Hace falta --aplicar para escribir de verdad — batch.set() sobreescribe
 * el documento COMPLETO por UUID, así que una re-importación toca las 8.850
 * recetas en producción.
 *
 * Usage:
 *   # simulacro + informe (no toca producción)
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importRecetas.mjs
 *
 *   # escribir de verdad
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importRecetas.mjs --aplicar
 *
 * The Admin SDK bypasses Firestore security rules — no user login needed.
 * Idempotent: batch.set() overwrites the full doc by UUID on every run.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { exchangesFromMacros } from './lib/redondeoIntercambios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const firebaseConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'),
);

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) {
  console.error('Error: GOOGLE_APPLICATION_CREDENTIALS env var is required.');
  console.error('Example: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importRecetas.mjs');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'));

// Por defecto, la copia versionada en el repo: son los mismos 12 JSON que la
// carpeta de origen del escritorio, y así el script no depende de una ruta
// absoluta de la máquina de nadie. `RECETAS_DIR` sigue permitiendo apuntar a otra.
const RECETAS_DIR = resolve(process.env.RECETAS_DIR ?? resolve(__dirname, '../public/recetas'));
const DB_ID     = firebaseConfig.firestoreDatabaseId;
const BATCH_SIZE = 499;
const APLICAR = process.argv.includes('--aplicar');

// ── Firebase Admin init ───────────────────────────────────────────────────────

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(DB_ID);

// ── Exchange calculation ──────────────────────────────────────────────────────

// Antes esto solo redondeaba a cuartos, y salían 1.210 desgloses HC/PROT/GRASA
// distintos para solo 44 totales: dos recetas de las mismas calorías casi nunca
// coincidían en reparto, así que el buscador de alternativas las trataba como
// recetas distintas. Ahora `exchangesFromMacros` redondea además a enteros
// manteniendo el total dentro de ±0,25 intercambios (≈25 kcal), que es lo único
// que el atleta nota. Ver scripts/lib/redondeoIntercambios.mjs.
function computeExchanges(macros) {
  return exchangesFromMacros(macros ? {
    carb: macros.carbohydrate?.grams ?? 0,
    prot: macros.protein?.grams      ?? 0,
    fat:  macros.fat?.grams          ?? 0,
  } : null);
}

// ── Recetas recipe → Firestore doc ─────────────────────────────────────────────

function mapRecipe(r) {
  const data = {
    ownerId:         'recetas',
    name:            r.name,
    // Legacy required arrays kept empty so existing RecipesScreen code doesn't break
    categories:      r.categoria ? [r.categoria] : [],
    ingredients:     [],
    extras:          [],
    steps:           [],
    // Recetas-specific fields
    image:           r.image           ?? null,
    ingredientsText: (r.ingredients    ?? []).map(i => ({ name: i.name, quantity: i.quantity })),
    stepsText:       (r.steps          ?? []).map(s => ({ position: s.position, description: s.description })),
    macros: r.macros ? {
      carb: r.macros.carbohydrate?.grams ?? 0,
      prot: r.macros.protein?.grams      ?? 0,
      fat:  r.macros.fat?.grams          ?? 0,
    } : null,
    kcal:        r.kcal        ?? null,
    weight:      r.weight      ?? null,
    cookingTime: r.cookingTime ?? null,
    difficulty:  r.difficulty  ?? null,
    tupper:      r.tupper      ?? null,
    intakeTypes: r.intakeTypes ?? [],
    categoria:   r.categoria   ?? null,
    exchanges:   computeExchanges(r.macros),
    // Códigos de régimen/patología para los que la receta NO es apta (vegano,
    // celiaquía, embarazo…). El script original los descartaba; ver
    // src/utils/dietaryRestrictions.ts para la leyenda y cómo se usan.
    restrictions: r.forbiddenFor ?? [],
  };

  // Strip nulls for clean Firestore docs
  for (const key of Object.keys(data)) {
    if (data[key] === null) delete data[key];
  }

  return data;
}

// ── Batch write ───────────────────────────────────────────────────────────────

async function batchWrite(recipes) {
  const col = db.collection('recipes');
  let committed = 0;

  for (let i = 0; i < recipes.length; i += BATCH_SIZE) {
    const chunk = recipes.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { id, data } of chunk) {
      batch.set(col.doc(id), data);
    }
    await batch.commit();
    committed += chunk.length;
    process.stdout.write(`  ${committed}/${recipes.length} written…\r`);
  }
  process.stdout.write('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(APLICAR
    ? '⚠️  MODO ESCRITURA — se van a sobreescribir 8.850 documentos en producción.\n'
    : '🔍 SIMULACRO — no se escribe nada. Añade --aplicar para escribir.\n');

  const indexPath = resolve(RECETAS_DIR, '00_indice.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const files = index.archivos ?? index.files ?? [];
  console.log(`Index: ${files.length} files — DB: ${DB_ID}`);

  const all = [];
  let conRestricciones = 0, sinMacros = 0;
  const restriccionesUsadas = new Map();
  for (const entry of files) {
    const filePath = resolve(RECETAS_DIR, entry.archivo ?? entry.file ?? entry);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const recs = raw.recipes ?? raw.recetas ?? [];
    console.log(`  ${entry.archivo ?? entry}: ${recs.length} recipes`);
    for (const r of recs) {
      const data = mapRecipe(r);
      if (data.restrictions?.length > 0) {
        conRestricciones++;
        for (const code of data.restrictions) restriccionesUsadas.set(code, (restriccionesUsadas.get(code) ?? 0) + 1);
      }
      if (!data.macros) sinMacros++;
      all.push({ id: r.id, data });
    }
  }

  console.log(`\n── INFORME ──────────────────────────────────────────────`);
  console.log(`Total recetas:                  ${all.length}`);
  console.log(`Con restricciones (forbiddenFor): ${conRestricciones}`);
  console.log(`Sin macros:                      ${sinMacros}`);
  console.log(`\nCódigos de restricción encontrados (20 más frecuentes):`);
  [...restriccionesUsadas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([code, count]) => console.log(`   ${String(code).padEnd(5)} → ${count} recetas`));

  if (!APLICAR) {
    console.log(`\n🔍 Simulacro terminado. No se ha escrito nada.`);
    console.log(`   Vuelve a lanzarlo con --aplicar cuando quieras escribir de verdad.`);
    process.exit(0);
  }

  console.log(`\n✍️  Escribiendo ${all.length} recetas en Firestore…`);
  await batchWrite(all);
  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});

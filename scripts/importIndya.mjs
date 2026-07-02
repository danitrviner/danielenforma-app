/**
 * Import Indya recipe library into Firestore using the Admin SDK.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importIndya.mjs
 *
 * The Admin SDK bypasses Firestore security rules — no user login needed.
 * Idempotent: batch.set() overwrites the full doc by UUID on every run.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const firebaseConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'),
);

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) {
  console.error('Error: GOOGLE_APPLICATION_CREDENTIALS env var is required.');
  console.error('Example: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importIndya.mjs');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'));

const INDYA_DIR = resolve(
  process.env.INDYA_DIR ?? '/Users/dani/Desktop/App enforma/recetas_indya',
);
const DB_ID     = firebaseConfig.firestoreDatabaseId;
const BATCH_SIZE = 499;

// ── Firebase Admin init ───────────────────────────────────────────────────────

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(DB_ID);

// ── Exchange calculation ──────────────────────────────────────────────────────

function roundToQuarter(x) {
  return Math.round(x / 0.25) * 0.25;
}

function computeExchanges(macros) {
  if (!macros) return { HC: 0, PROT: 0, GRASA: 0 };
  return {
    HC:    roundToQuarter((macros.carbohydrate?.grams ?? 0) / 25),
    PROT:  roundToQuarter((macros.protein?.grams     ?? 0) / 25),
    GRASA: roundToQuarter((macros.fat?.grams         ?? 0) / 11),
  };
}

// ── Indya recipe → Firestore doc ─────────────────────────────────────────────

function mapRecipe(r) {
  const data = {
    ownerId:         'indya',
    name:            r.name,
    // Legacy required arrays kept empty so existing RecipesScreen code doesn't break
    categories:      r.categoria ? [r.categoria] : [],
    ingredients:     [],
    extras:          [],
    steps:           [],
    // Indya-specific fields
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
  const indexPath = resolve(INDYA_DIR, '00_indice.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const files = index.archivos ?? index.files ?? [];
  console.log(`Index: ${files.length} files — DB: ${DB_ID}`);

  const all = [];
  for (const entry of files) {
    const filePath = resolve(INDYA_DIR, entry.archivo ?? entry.file ?? entry);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const recs = raw.recipes ?? raw.recetas ?? [];
    console.log(`  ${entry.archivo ?? entry}: ${recs.length} recipes`);
    for (const r of recs) {
      all.push({ id: r.id, data: mapRecipe(r) });
    }
  }

  console.log(`\nTotal: ${all.length} recipes. Writing to Firestore…`);
  await batchWrite(all);
  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});

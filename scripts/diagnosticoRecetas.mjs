/**
 * Diagnóstico de solo lectura del recetario en Firestore (tarea 24, rastreo
 * 14-08): «ingredientes vacíos» en la ficha de receta.
 *
 * El código de RecipesScreen.tsx lee `recipe.ingredientsText`, y el script de
 * importación (importRecetas.mjs) SÍ escribe ese campo desde el JSON de
 * origen — comprobado con datos reales de public/recetas/, donde el campo
 * `ingredients` de cada receta viene poblado. Así que en el CÓDIGO no hay
 * mismatch de nombre de campo. Lo que no se puede comprobar sin esta
 * credencial es si lo que HAY en Firestore corresponde de verdad a la
 * versión actual del script (pudo importarse con una versión anterior, o no
 * haberse reimportado nunca tras algún cambio).
 *
 * Este script NO escribe nada. Solo lee una muestra y cuenta cuántas recetas
 * tienen `ingredientsText` vacío o ausente, para confirmar o descartar la
 * hipótesis antes de tocar ningún código.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/diagnosticoRecetas.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const firebaseConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'),
);

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) {
  console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.');
  console.error('Ejemplo: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/diagnosticoRecetas.mjs');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'));
const DB_ID = firebaseConfig.firestoreDatabaseId;

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(DB_ID);

const OWNER_RECETARIO_TODOS = ['recetas', 'indya'];

async function main() {
  console.log(`DB: ${DB_ID}\n`);

  const snap = await db.collection('recipes')
    .where('ownerId', 'in', OWNER_RECETARIO_TODOS)
    .get();

  console.log(`Total recetas del catálogo importado: ${snap.size}\n`);

  let sinIngredientsText = 0;
  let sinKcal = 0;
  let sinMacros = 0;
  let sinExchanges = 0;
  const ejemplosRotos = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const ingredientsVacio = !Array.isArray(d.ingredientsText) || d.ingredientsText.length === 0;
    if (ingredientsVacio) {
      sinIngredientsText++;
      if (ejemplosRotos.length < 5) {
        ejemplosRotos.push({ id: doc.id, name: d.name, campos: Object.keys(d) });
      }
    }
    if (d.kcal == null) sinKcal++;
    if (!d.macros) sinMacros++;
    if (!d.exchanges) sinExchanges++;
  }

  console.log(`Sin ingredientsText (vacío o ausente): ${sinIngredientsText} / ${snap.size}`);
  console.log(`Sin kcal:                              ${sinKcal} / ${snap.size}`);
  console.log(`Sin macros:                            ${sinMacros} / ${snap.size}`);
  console.log(`Sin exchanges:                         ${sinExchanges} / ${snap.size}`);

  if (ejemplosRotos.length > 0) {
    console.log('\nEjemplos con ingredientsText vacío (hasta 5):');
    for (const e of ejemplosRotos) {
      console.log(`  · ${e.id} — "${e.name}" — campos presentes: ${e.campos.join(', ')}`);
    }
    console.log('\nSi "ingredientsText" NI SIQUIERA aparece en "campos presentes", la receta se');
    console.log('importó con una versión antigua del script — hace falta reimportar');
    console.log('(node scripts/importRecetas.mjs). Si aparece pero vacío, revisa el JSON de');
    console.log('origen en public/recetas/ para esa receta concreta.');
  } else {
    console.log('\nTodas las recetas tienen ingredientsText poblado — el catálogo está bien.');
    console.log('Si Dani sigue viendo "Sin ingredientes disponibles" en la app, el problema');
    console.log('está en otro sitio (permisos de lectura, caché local desactualizada…).');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Diagnóstico falló:', err);
  process.exit(1);
});

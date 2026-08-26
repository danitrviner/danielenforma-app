/**
 * Limpieza puntual (2026-08-21): borra las 12 dietas de prueba de
 * danielbriz8@gmail.com cuya primera comida se llama "Paco" (resto de QA de la
 * función de renombrar comidas) y quita las 3 comidas "Paco" del menú semanal
 * publicado de la misma cuenta (nombre de una receta ya borrada, que quedó
 * copiado en el menú). Verifica cada documento antes de tocarlo.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/limpiarPaco.mjs
 */
import { readFileSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const cfg = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
const db = abrirDb(sa);

const DIET_IDS = [
  'lerBhuq6w9iIYqeFA2cs', '6qjb6vt0kzqj75zuVp2O', 'cSUyJjXaMkoMllrjuNDP', 'oFb9mcNZ041AsTrGtMSS',
  'BWO4Z5GjZHwW6BJqAeqf', 'LGcwcx8hPazk9jkuqzuN', 'SaljDjb5txpNo8FGkNYv', 'O7A3g5azo7hlq9LbuI5u',
  'UeIIb47rZgcvclga4DL0', 'aPBaIPZuLGhBoeNdQcLF', 'GFepVWcURZqsY9bHgZz4', 'Ygi6JYJ0uzxP3BNXBQwq',
];

async function main() {
  for (const id of DIET_IDS) {
    const doc = await db.collection('diets').doc(id).get();
    if (!doc.exists) { console.log('SKIP (ya no existe):', id); continue; }
    const x = doc.data();
    if (x.athleteId !== 'danielbriz8@gmail.com' || (x.meals ?? [])[0]?.name !== 'Paco') {
      console.error('ABORTADO, no coincide con lo esperado:', id, x.athleteId, x.meals?.[0]?.name);
      process.exit(1);
    }
  }
  const batch = db.batch();
  DIET_IDS.forEach(id => batch.delete(db.collection('diets').doc(id)));
  await batch.commit();
  console.log('Borradas', DIET_IDS.length, 'dietas de prueba.');

  const menuRef = db.collection('weeklyMenus').doc('3VzWyPZ66fwliRNzCOAA');
  const menuSnap = await menuRef.get();
  const menu = menuSnap.data();
  let quitadas = 0;
  const days = menu.days.map(day => ({
    ...day,
    meals: day.meals.filter(m => {
      if (m.recipeName === 'Paco') { quitadas++; return false; }
      return true;
    }),
  }));
  await menuRef.update({ days });
  console.log('Quitadas', quitadas, 'comidas "Paco" del menú semanal.');
}

main().catch(err => { console.error('Fallo:', err); process.exit(1); });

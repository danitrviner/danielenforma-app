/* Retira las dietas «(mi versión)» que dejó el fork automático ya eliminado
 * (el que creaba una copia de la dieta del coach cada vez que el atleta la
 * tocaba, porque las reglas no le dejan escribir en la del coach).
 *
 * ANTES de borrar, MIGRA los días que apuntan a una de ellas: un registro
 * anterior a 09-2026 no guarda sus comidas, las lee de la dieta a la que
 * apunta con `dietId`. Borrar esa dieta sin más dejaría ese día vacío para
 * siempre. La migración copia las comidas y el cupo dentro del propio día
 * —formato nuevo, exactamente lo que hace la app al primer toque— y conserva
 * los ids de comida, así que las marcas de "comido" siguen casando.
 *
 * Uso:
 *   node scripts/limpiarCopiasMiVersion.mjs            → simulacro, no escribe
 *   node scripts/limpiarCopiasMiVersion.mjs --aplicar  → migra, guarda copia y borra
 */
import { readFileSync, writeFileSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const aplicar = process.argv.includes('--aplicar');
const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8')));

const dietas = (await db.collection('diets').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const copias = dietas.filter(d => /\(mi versión\)/i.test(d.name || ''));
const porId = new Map(copias.map(c => [c.id, c]));

const logs = (await db.collection('dietCompletionLogs').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const aMigrar = logs.filter(l => porId.has(l.dietId) && !l.meals);

// Guardarrail: una copia que esté activa, programada o dentro de una fase NO se
// toca. Ninguna lo estaba al escribir esto, pero borrarla sería quitarle al
// atleta la dieta que está usando.
const configs = (await db.collection('athleteDietConfigs').get().catch(() => ({ docs: [] }))).docs.map(d => d.data());
const programas = (await db.collection('nutritionPrograms').get().catch(() => ({ docs: [] }))).docs.map(d => d.data());
const enUso = new Set();
for (const c of configs) {
  for (const id of c.activeDietIds ?? []) enUso.add(id);
  for (const id of Object.values(c.weeklySchedule ?? {})) if (id) enUso.add(id);
}
for (const p of programas) for (const f of p.phases ?? []) if (f.dietId) enUso.add(f.dietId);

const aBorrar = copias.filter(c => !enUso.has(c.id));
const intocables = copias.filter(c => enUso.has(c.id));

console.log(`copias «(mi versión)»: ${copias.length}`);
console.log(`  · días que hay que migrar antes: ${aMigrar.length}`);
console.log(`  · dietas a borrar:               ${aBorrar.length}`);
console.log(`  · intocables (activas o en uso): ${intocables.length}`);
intocables.forEach(c => console.log(`      ~ ${c.athleteId} "${c.name}"`));

if (!aplicar) {
  console.log('\nSIMULACRO. Nada escrito. Repite con --aplicar.');
  process.exit(0);
}

const respaldo = new URL(`../scripts/out/copias-mi-version-${new Date().toISOString().slice(0, 10)}.json`, import.meta.url);
writeFileSync(respaldo, JSON.stringify({ dietas: copias, logs: aMigrar }, null, 1));
console.log(`\nCopia de seguridad: ${respaldo.pathname}`);

for (const log of aMigrar) {
  const dieta = porId.get(log.dietId);
  await db.doc(`dietCompletionLogs/${log.id}`).update({
    meals: dieta.meals ?? [],
    budget: dieta.budget ?? null,
    updatedAt: new Date().toISOString(),
  });
  console.log(`migrado  ${log.id}  ← "${dieta.name}" (${(dieta.meals ?? []).length} comidas)`);
}

for (const c of aBorrar) {
  await db.doc(`diets/${c.id}`).delete();
  console.log(`borrada  ${c.id}  ${c.athleteId}  "${c.name}"`);
}
console.log(`\nListo: ${aMigrar.length} días migrados, ${aBorrar.length} dietas borradas.`);

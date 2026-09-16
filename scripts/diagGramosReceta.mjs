/* Reproduce el salto de gramos del menú a intercambios, con recetas REALES.
 *
 * Traza el valor en cada salto para una receta que contenga el alimento que se
 * le pase, y compara los gramos que dice la receta con los que la app acabaría
 * pintando al convertirla en intercambios.
 *
 * Uso: node scripts/diagGramosReceta.mjs pan
 */
import { readFileSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const buscado = (process.argv[2] || 'pan').toLowerCase();
const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8')));

const GRAMS_PER_EXCHANGE = { HC: 25, PROT: 25, GRASA: 11 };
const parseBaseGrams = (label) => {
  const m = String(label).match(/(\d+(?:[.,]\d+)?)\s*(g|ml|cc|kg|l)\b/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  if (u === 'kg' || u === 'l') v *= 1000;
  return v;
};
const quarter = (n) => Math.round(n / 0.25) * 0.25;

// El banco del atleta: de aquí salen los gramos que la app pinta.
const foods = (await db.collection('foodItems').get()).docs.map(d => d.data());
const bancoDe = (texto) => foods.find(f =>
  String(f.label).toLowerCase().includes(texto) && parseBaseGrams(f.label) != null);

const snap = await db.collection('recipes').limit(3000).get();
const recetas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  .filter(r => Array.isArray(r.ingredientsText) && r.exchanges
    && r.ingredientsText.some(i => String(i.name).toLowerCase().includes(buscado)));

console.log(`Recetas con «${buscado}»: ${recetas.length} (de ${snap.size} miradas)\n`);

for (const r of recetas.slice(0, 4)) {
  const ing = r.ingredientsText.find(i => String(i.name).toLowerCase().includes(buscado));
  const banco = bancoDe(buscado);
  const baseBanco = banco ? parseBaseGrams(banco.label) : null;

  console.log(`── ${r.name}`);
  console.log(`   1. La receta dice:        ${ing.quantity} ${ing.unit ?? 'g'} de ${ing.name}`);
  console.log(`   2. Macros de la receta:   HC ${r.macros?.carb ?? '?'} g · PROT ${r.macros?.prot ?? '?'} g · GRASA ${r.macros?.fat ?? '?'} g`);
  console.log(`   3. Intercambios guardados: HC ${r.exchanges.HC} · PROT ${r.exchanges.PROT} · GRASA ${r.exchanges.GRASA}`);

  if (r.macros?.carb != null) {
    const sinRedondear = r.macros.carb / GRAMS_PER_EXCHANGE.HC;
    console.log(`      (HC = ${r.macros.carb} g de macro / ${GRAMS_PER_EXCHANGE.HC} = ${sinRedondear.toFixed(3)} → cuartos → ${quarter(sinRedondear)})`);
  }

  if (banco) {
    // Esto es lo que hace itemWeightLabel: base del banco × intercambios.
    const pintados = Math.round(baseBanco * r.exchanges.HC * 10) / 10;
    console.log(`   4. Banco del atleta:      «${banco.label}» → ${baseBanco} g por intercambio`);
    console.log(`   5. Gramos que se PINTAN:  ${baseBanco} × ${r.exchanges.HC} = ${pintados} g`);
    console.log(`      RECETA ${ing.quantity} g  →  PANTALLA ${pintados} g   (×${(pintados / ing.quantity).toFixed(2)})`);
  } else {
    console.log(`   4. Sin alimento «${buscado}» con gramos en el banco.`);
  }
  console.log('');
}
process.exit(0);

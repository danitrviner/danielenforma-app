/* ¿Escala bien una receta del recetario? Comprobado con las recetas REALES.
 *
 * Recorre el recetario y, para cada receta, la escala a varios factores y
 * comprueba las invariantes que el atleta va a ver:
 *   · los gramos suben y bajan en proporción
 *   · los intercambios también
 *   · las kcal de la receta cuadran con las que salen de sus intercambios
 *   · y con las que salen de sus macros
 *
 * Uso: node scripts/diagEscaladoRecetas.mjs [cuantas]
 */
import { readFileSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const LIMITE = Number(process.argv[2] || 3000);
const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8')));

const GPE = { HC: 25, PROT: 25, GRASA: 11 };
const KPG = { HC: 4, PROT: 4, GRASA: 9 };
const kcalDeIntercambios = (e) =>
  Math.round(e.HC * GPE.HC * KPG.HC + e.PROT * GPE.PROT * KPG.PROT + e.GRASA * GPE.GRASA * KPG.GRASA);
const kcalDeMacros = (m) =>
  m ? Math.round((m.carb ?? 0) * 4 + (m.prot ?? 0) * 4 + (m.fat ?? 0) * 9) : null;

const roundQuarter = (n) => Math.round(n / 0.25) * 0.25;
const factorDeReceta = (actuales, base) => {
  if (!(base > 0)) return 1;
  const f = actuales / base;
  return Math.abs(f - 1) < 0.05 ? 1 : f;
};

const snap = await db.collection('recipes').limit(LIMITE).get();
const recetas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const c = {
  total: recetas.length, conExchanges: 0, conIngredientes: 0, conMacros: 0, conKcal: 0,
  kcalDescuadraIntercambios: 0, kcalDescuadraMacros: 0,
  sinEscalarPorUmbral: 0, escalaOk: 0, gramosCero: 0,
};
const ejemplos = { kcalInt: [], kcalMacros: [], umbral: [], gramosCero: [] };

for (const r of recetas) {
  const ex = r.exchanges;
  if (!ex) continue;
  c.conExchanges++;
  if (Array.isArray(r.ingredientsText) && r.ingredientsText.length) c.conIngredientes++;
  if (r.macros) c.conMacros++;
  if (r.kcal) c.conKcal++;

  // 1. ¿Las kcal guardadas cuadran con sus intercambios?
  const kInt = kcalDeIntercambios(ex);
  if (r.kcal && Math.abs(r.kcal - kInt) / r.kcal > 0.15) {
    c.kcalDescuadraIntercambios++;
    if (ejemplos.kcalInt.length < 4) ejemplos.kcalInt.push(`${r.name}: guardadas ${r.kcal}, por intercambios ${kInt}`);
  }

  // 2. ¿Y con sus macros?
  const kMac = kcalDeMacros(r.macros);
  if (r.kcal && kMac && Math.abs(r.kcal - kMac) / r.kcal > 0.15) {
    c.kcalDescuadraMacros++;
    if (ejemplos.kcalMacros.length < 4) ejemplos.kcalMacros.push(`${r.name}: guardadas ${r.kcal}, por macros ${kMac}`);
  }

  // 3. Un toque del stepper: ¿se mueve la receta?
  const base = (ex.HC ?? 0) + (ex.PROT ?? 0) + (ex.GRASA ?? 0);
  if (base > 0) {
    const f = factorDeReceta(base + 0.25, base);
    if (f === 1) {
      c.sinEscalarPorUmbral++;
      if (ejemplos.umbral.length < 4) ejemplos.umbral.push(`${r.name}: ${base} int. → +0,25 no mueve nada`);
    } else {
      c.escalaOk++;
    }
  }

  // 4. Al escalar a la mitad, ¿algún ingrediente se queda en 0 g?
  if (Array.isArray(r.ingredientsText)) {
    for (const ing of r.ingredientsText) {
      if (ing.quantity > 0 && Math.round(ing.quantity * 0.5) === 0) {
        c.gramosCero++;
        if (ejemplos.gramosCero.length < 4) ejemplos.gramosCero.push(`${r.name}: ${ing.name} ${ing.quantity} g → 0 g a ×0,5`);
        break;
      }
    }
  }
}

const pct = (n, d) => d ? `${(n / d * 100).toFixed(1)}%` : '—';
console.log(`Recetas miradas: ${c.total}\n`);
console.log(`Con intercambios:   ${c.conExchanges}  (${pct(c.conExchanges, c.total)})`);
console.log(`Con ingredientes:   ${c.conIngredientes}  (${pct(c.conIngredientes, c.total)})`);
console.log(`Con macros:         ${c.conMacros}  (${pct(c.conMacros, c.total)})`);
console.log(`Con kcal:           ${c.conKcal}  (${pct(c.conKcal, c.total)})\n`);

console.log(`── Coherencia de calorías (margen 15 %)`);
console.log(`kcal vs. sus INTERCAMBIOS descuadran: ${c.kcalDescuadraIntercambios}  (${pct(c.kcalDescuadraIntercambios, c.conKcal)})`);
ejemplos.kcalInt.forEach(e => console.log(`    ${e}`));
console.log(`kcal vs. sus MACROS descuadran:       ${c.kcalDescuadraMacros}  (${pct(c.kcalDescuadraMacros, c.conKcal)})`);
ejemplos.kcalMacros.forEach(e => console.log(`    ${e}`));

console.log(`\n── Un toque del stepper (+0,25 int.)`);
console.log(`NO mueve nada por el umbral del 5 %: ${c.sinEscalarPorUmbral}  (${pct(c.sinEscalarPorUmbral, c.escalaOk + c.sinEscalarPorUmbral)})`);
ejemplos.umbral.forEach(e => console.log(`    ${e}`));

console.log(`\n── Escalar a media ración`);
console.log(`Recetas con algún ingrediente que cae a 0 g: ${c.gramosCero}`);
ejemplos.gramosCero.forEach(e => console.log(`    ${e}`));
process.exit(0);

/**
 * Reescribe el campo `exchanges` de las recetas ya guardadas en Firestore
 * aplicándoles el redondeo a enteros (ver scripts/lib/redondeoIntercambios.mjs).
 *
 * POR DEFECTO NO ESCRIBE NADA: hace un simulacro y saca el informe antes/después.
 * Para escribir de verdad hay que pasar --aplicar de forma explícita.
 *
 *   # simulacro + informe (no toca producción)
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     node scripts/redondearIntercambiosRecetas.mjs
 *
 *   # escribir de verdad
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     node scripts/redondearIntercambiosRecetas.mjs --aplicar
 *
 * Es idempotente: el redondeo de un vector ya redondeado es él mismo, así que
 * volver a pasarlo no mueve nada (lo cubre exchangeRounding.test.ts).
 *
 * Guarda el vector original en `exchangesRaw` la primera vez que toca cada
 * receta, para poder revertir o auditar sin recalcular desde los gramos.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { snapExchanges, totalExchanges } from './lib/redondeoIntercambios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APLICAR = process.argv.includes('--aplicar');
const BATCH_SIZE = 400;

const firebaseConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'),
);

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) {
  console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) });
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

const eq = (a, b) => a.HC === b.HC && a.PROT === b.PROT && a.GRASA === b.GRASA;
const fmt = v => `${v.HC}/${v.PROT}/${v.GRASA}`;

async function main() {
  console.log(APLICAR
    ? '⚠️  MODO ESCRITURA — se van a modificar documentos en producción.\n'
    : '🔍 SIMULACRO — no se escribe nada. Añade --aplicar para escribir.\n');

  const snap = await db.collection('recipes').get();
  console.log(`Leídas ${snap.size} recetas.\n`);

  const cambios = [];
  const antes = new Set();
  const despues = new Map();
  let sinExchanges = 0, yaRedondeadas = 0, maxDrift = 0, sumDrift = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    // `exchangesRaw` es la fuente de verdad si ya pasamos por aquí antes; así
    // una segunda ejecución redondea desde el original, no desde lo redondeado.
    const original = data.exchangesRaw ?? data.exchanges;
    if (!original || typeof original.HC !== 'number') { sinExchanges++; continue; }

    const nuevo = snapExchanges(original);
    antes.add(fmt(original));
    despues.set(fmt(nuevo), (despues.get(fmt(nuevo)) ?? 0) + 1);

    const drift = Math.abs(totalExchanges(nuevo) - totalExchanges(original));
    maxDrift = Math.max(maxDrift, drift);
    sumDrift += drift;

    if (eq(original, data.exchanges ?? {}) && eq(nuevo, data.exchanges ?? {})) { yaRedondeadas++; continue; }
    if (eq(nuevo, data.exchanges ?? {})) { yaRedondeadas++; continue; }

    cambios.push({ id: doc.id, name: data.name ?? '(sin nombre)', original, nuevo, drift, kcal: data.kcal ?? null });
  }

  const conExchanges = snap.size - sinExchanges;
  const sizes = [...despues.values()].sort((a, b) => a - b);

  console.log('── INFORME ──────────────────────────────────────────────');
  console.log(`Recetas con intercambios:      ${conExchanges}`);
  console.log(`Sin campo exchanges (saltadas): ${sinExchanges}`);
  console.log(`Ya redondeadas (sin cambio):    ${yaRedondeadas}`);
  console.log(`A modificar:                    ${cambios.length}`);
  console.log(`Desgloses distintos:            ${antes.size} → ${despues.size}`);
  console.log(`Desgloses con una sola receta:  ${sizes.filter(s => s === 1).length}`);
  console.log(`Desviación máxima del total:    ${maxDrift.toFixed(2)} intercambios`);
  console.log(`Desviación media:               ${(sumDrift / conExchanges).toFixed(3)} ≈ ${(sumDrift / conExchanges * 100).toFixed(1)} kcal`);

  const fuera = cambios.filter(c => c.drift > 0.25 + 1e-9);
  if (fuera.length > 0) {
    console.error(`\n❌ ABORTADO: ${fuera.length} recetas se salen de ±0,25. No se escribe nada.`);
    fuera.slice(0, 10).forEach(c => console.error(`   ${c.name}: ${fmt(c.original)} → ${fmt(c.nuevo)} (${c.drift})`));
    process.exit(1);
  }
  console.log('✅ Ninguna receta se sale del margen de ±0,25.');

  console.log('\n── 15 desgloses más frecuentes tras el redondeo ──────────');
  [...despues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([k, v]) => console.log(`   ${k.padEnd(14)} → ${v} recetas`));

  console.log('\n── 20 ejemplos de cambio ────────────────────────────────');
  cambios.slice(0, 20).forEach(c =>
    console.log(`   ${fmt(c.original).padEnd(14)} → ${fmt(c.nuevo).padEnd(14)} (${c.drift === 0 ? 'total exacto' : `Δ${c.drift}`})  ${c.name.slice(0, 45)}`));

  const informe = resolve(__dirname, '../informe-redondeo-intercambios.json');
  writeFileSync(informe, JSON.stringify({
    generado: new Date().toISOString(),
    aplicado: APLICAR,
    resumen: {
      total: snap.size, conExchanges, sinExchanges, yaRedondeadas,
      aModificar: cambios.length,
      desglosesAntes: antes.size, desglosesDespues: despues.size,
      driftMax: maxDrift, driftMedio: sumDrift / conExchanges,
    },
    cambios,
  }, null, 2));
  console.log(`\n📄 Informe completo: ${informe}`);

  if (!APLICAR) {
    console.log('\n🔍 Simulacro terminado. No se ha escrito nada.');
    console.log('   Revisa el informe y vuelve a lanzarlo con --aplicar cuando quieras escribir.');
    return;
  }

  console.log(`\n✍️  Escribiendo ${cambios.length} documentos…`);
  let escritos = 0;
  for (let i = 0; i < cambios.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const c of cambios.slice(i, i + BATCH_SIZE)) {
      batch.update(db.collection('recipes').doc(c.id), {
        exchanges: c.nuevo,
        exchangesRaw: c.original,   // para poder auditar o revertir
      });
    }
    await batch.commit();
    escritos += Math.min(BATCH_SIZE, cambios.length - i);
    console.log(`   ${escritos}/${cambios.length}`);
  }
  console.log('\n✅ Migración completada.');
}

main().catch(err => { console.error('Fallo:', err); process.exit(1); });

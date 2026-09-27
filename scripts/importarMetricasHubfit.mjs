/**
 * Importa el histórico de métricas corporales de HubFit (peso + perímetros)
 * a Firestore, usando el Admin SDK.
 *
 * POR DEFECTO ES UN SIMULACRO: lee el JSON, limpia los datos sucios conocidos,
 * calcula un informe y NO escribe nada. Hace falta --aplicar para escribir de
 * verdad.
 *
 * Colecciones destino:
 *   - bodyweightLogs: un doc por entrada de peso (id autogenerado), campo
 *     `athleteId` = email. Idempotente por (athleteId, date, weight): si ya
 *     existe una entrada igual ese día, no se duplica.
 *   - bodyMeasurements: un doc por (athleteId, date, metricKey) con id
 *     determinista `${athleteId}_${date}_${metricKey}` — reimportar
 *     sobrescribe en vez de duplicar, es seguro relanzar el script.
 *
 * Limpieza aplicada sobre hubfit-metricas-export.json:
 *   - Malena excluida: solo tenía basura de wearable (Weight 8655kg, steps).
 *   - Israel Cabrera: 6 puntos de peso (59.5-60.5) que HubFit guardó por error
 *     dentro de "Perímetro de abdomen" entre el 3 y el 10 de agosto — se
 *     descartan por estar muy fuera de rango (resto del año: 77-81cm).
 *   - Duplicados exactos (misma fecha + mismo valor) en la misma métrica se
 *     colapsan a uno solo.
 *   - Solo se importa a clientes con cuenta activa en En Forma (se busca su
 *     email en user_profiles). Los que no tienen cuenta quedan fuera; cuando
 *     se les dé de alta, basta con relanzar el script para traer su histórico.
 *
 * Usage:
 *   # simulacro + informe (no toca producción)
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importarMetricasHubfit.mjs
 *
 *   # escribir de verdad
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importarMetricasHubfit.mjs --aplicar
 *
 * The Admin SDK bypasses Firestore security rules — no user login needed.
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
  console.error('Example: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importarMetricasHubfit.mjs');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'));

const EXPORT_PATH = resolve(
  process.env.HUBFIT_EXPORT_PATH ?? '/Users/dani/Desktop/App enforma/hubfit-metricas-export.json',
);
const DB_ID = firebaseConfig.firestoreDatabaseId;
const BATCH_SIZE = 499;
const APLICAR = process.argv.includes('--aplicar');

// ── Firebase Admin init ───────────────────────────────────────────────────────

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(DB_ID);

// ── Exclusiones y correcciones conocidas ─────────────────────────────────────

const EXCLUIR_EMAILS = new Set([
  'malenasalinasremiro@gmail.com', // solo basura de wearable
]);

// Clientes que se dieron de alta en En Forma con un email distinto al que
// usaban en HubFit. El histórico se escribe con el email de la cuenta real.
const ALIAS_EMAIL = {
  'dr.israelcabrera87@gmail.com': 'dr.israelcabrera@outlook.com',
  'thebeast097@gmail.com': 'gonzalomiranda97@hotmail.com',
};

// Puntos concretos a descartar por email + métrica + fecha (datos mal metidos
// en HubFit, detectados a mano al revisar el export).
const DESCARTAR_PUNTOS = new Set([
  'dr.israelcabrera87@gmail.com|Perímetro de abdomen|2026-08-03',
  'dr.israelcabrera87@gmail.com|Perímetro de abdomen|2026-08-04',
  'dr.israelcabrera87@gmail.com|Perímetro de abdomen|2026-08-05',
  'dr.israelcabrera87@gmail.com|Perímetro de abdomen|2026-08-06',
  'dr.israelcabrera87@gmail.com|Perímetro de abdomen|2026-08-07',
  'dr.israelcabrera87@gmail.com|Perímetro de abdomen|2026-08-10',
]);

// Cuando HubFit tiene dos valores distintos para la misma métrica del mismo
// cliente el mismo día, se promedian (decisión de Dani, caso Angel Benito
// 96 vs 87 de abdomen). Si la diferencia es grande (>5) se avisa igualmente
// para poder revisarlo, aunque el import ya sigue con la media.
const UMBRAL_AVISO_CONFLICTO = 5;

// Nombre HubFit → { coleccion, campo } de destino en En Forma.
// Los perímetros de HubFit son un único valor por lado ("contraído"), así que
// van a las claves *_contraido del protocolo completo, no a las legacy.
const MAPA_METRICAS = {
  'Peso corporal': { tipo: 'peso' },
  'Perimetro de cintura': { tipo: 'medida', metricKey: 'cintura' },
  'Perímetro de cintura': { tipo: 'medida', metricKey: 'cintura' },
  'Perímetro de abdomen': { tipo: 'medida', metricKey: 'abdomen' },
  'Contorno de pecho': { tipo: 'medida', metricKey: 'pecho' },
  'Bíceps izquierdo contraído': { tipo: 'medida', metricKey: 'biceps_izq_contraido' },
  'Bíceps derecho contraido': { tipo: 'medida', metricKey: 'biceps_der_contraido' },
  'Muslo izquierdo contraido': { tipo: 'medida', metricKey: 'muslo_izq_contraido' },
  'Muslo derecho contraido': { tipo: 'medida', metricKey: 'muslo_der_contraido' },
};

// ── Carga + limpieza ──────────────────────────────────────────────────────────

const raw = JSON.parse(readFileSync(EXPORT_PATH, 'utf8'));

const nowIso = new Date().toISOString();

/** @type {Array<{athleteId:string, date:string, weight:number}>} */
const pesos = [];
/** @type {Array<{athleteId:string, date:string, metricKey:string, value:number}>} */
const medidas = [];

const avisos = [];
let clientesExcluidos = 0;
let puntosDescartados = 0;
let duplicadosColapsados = 0;
let metricasSinMapear = new Set();

// Para el informe detallado por cliente (nombre, rango de fechas, muestra de valores).
const porCliente = new Map(); // email real -> { nombre, hubfitEmail, series: Map(clave -> [{fecha,valor}]) }

for (const cliente of raw) {
  const email = ALIAS_EMAIL[cliente.e] ?? cliente.e;
  if (EXCLUIR_EMAILS.has(cliente.e)) {
    clientesExcluidos++;
    continue;
  }

  if (!porCliente.has(email)) {
    porCliente.set(email, { nombre: cliente.c, hubfitEmail: cliente.e, series: new Map() });
  }

  for (const metrica of cliente.m) {
    const mapa = MAPA_METRICAS[metrica.n];
    if (!mapa) {
      metricasSinMapear.add(metrica.n);
      continue;
    }

    // Agrupar por fecha primero: así se detectan valores contradictorios el
    // mismo día (varios valores DISTINTOS, no duplicados exactos) antes de
    // decidir qué hacer con cada fecha.
    const porFecha = new Map();
    for (const [fecha, valor] of metrica.d) {
      if (!porFecha.has(fecha)) porFecha.set(fecha, []);
      porFecha.get(fecha).push(valor);
    }

    for (const [fecha, valoresBrutos] of porFecha) {
      const claveDescartar = `${cliente.e}|${metrica.n}|${fecha}`;
      if (DESCARTAR_PUNTOS.has(claveDescartar)) {
        puntosDescartados += valoresBrutos.length;
        continue;
      }

      const distintos = [...new Set(valoresBrutos)];
      duplicadosColapsados += valoresBrutos.length - distintos.length;

      let valor;
      if (distintos.length === 1) {
        valor = distintos[0];
      } else {
        valor = distintos.reduce((a, b) => a + b, 0) / distintos.length;
        const spread = Math.max(...distintos) - Math.min(...distintos);
        if (spread > UMBRAL_AVISO_CONFLICTO) {
          avisos.push(
            `REVISAR: ${cliente.c} (${email}) — ${metrica.n} ${fecha} tenía valores muy distintos (${distintos.join(', ')}) → promediado a ${valor}`,
          );
        }
      }

      const serieClave = mapa.tipo === 'peso' ? 'Peso corporal (kg)' : `${mapa.metricKey} (cm)`;
      const serie = porCliente.get(email).series;
      if (!serie.has(serieClave)) serie.set(serieClave, []);
      serie.get(serieClave).push({ fecha, valor });

      if (mapa.tipo === 'peso') {
        pesos.push({ athleteId: email, date: fecha, weight: valor });
      } else {
        medidas.push({ athleteId: email, date: fecha, metricKey: mapa.metricKey, value: valor });
      }
    }
  }
}

if (metricasSinMapear.size) {
  avisos.push(`Métricas sin mapear (ignoradas): ${[...metricasSinMapear].join(', ')}`);
}

// ── Comprobar qué emails tienen cuenta activa en En Forma ────────────────────

async function emailsConCuenta(emails) {
  const encontrados = new Set();
  const lista = [...emails];
  for (let i = 0; i < lista.length; i += 30) {
    const trozo = lista.slice(i, i + 30);
    const snap = await db.collection('user_profiles').where('email', 'in', trozo).get();
    snap.forEach((doc) => encontrados.add(doc.data().email));
  }
  return encontrados;
}

const emailsDelExport = new Set([...pesos, ...medidas].map((r) => r.athleteId));
const conCuenta = await emailsConCuenta(emailsDelExport);
const sinCuenta = [...emailsDelExport].filter((e) => !conCuenta.has(e));

// Excluidos: solo se importa a quien ya tiene cuenta activa en En Forma.
const pesosFiltrados = pesos.filter((p) => conCuenta.has(p.athleteId));
const medidasFiltradas = medidas.filter((m) => conCuenta.has(m.athleteId));
const pesosExcluidos = pesos.length - pesosFiltrados.length;
const medidasExcluidas = medidas.length - medidasFiltradas.length;

// ── Informe ───────────────────────────────────────────────────────────────────

console.log('── Importación de métricas HubFit → En Forma ──────────────────');
console.log(`Origen: ${EXPORT_PATH}`);
console.log(`Modo: ${APLICAR ? 'APLICAR (escribe en Firestore)' : 'SIMULACRO (no escribe nada)'}`);
console.log('');
console.log(`Clientes en el export: ${raw.length}`);
console.log(`Clientes excluidos (sin métricas mapeables o basura): ${clientesExcluidos}`);
console.log(`Emails con cuenta activa en En Forma: ${conCuenta.size} / ${emailsDelExport.size}`);
if (sinCuenta.length) {
  console.log(`  Sin cuenta, EXCLUIDOS de esta importación: ${sinCuenta.join(', ')}`);
  console.log(`  (${pesosExcluidos} registros de peso + ${medidasExcluidas} de medidas quedan fuera; se pueden importar luego dándoles de alta y relanzando el script)`);
}
console.log('');
console.log(`Registros de peso a escribir: ${pesosFiltrados.length}`);
console.log(`Registros de medidas a escribir: ${medidasFiltradas.length}`);
console.log(`Puntos descartados (datos corruptos conocidos): ${puntosDescartados}`);
console.log(`Duplicados exactos colapsados: ${duplicadosColapsados}`);

// ── Detalle por cliente (para revisar antes de --aplicar) ────────────────────

console.log('');
console.log('── Detalle por cliente ──────────────────────────────────────────');
for (const [email, info] of porCliente) {
  if (!conCuenta.has(email)) continue; // ya se ve arriba quién queda fuera
  const aliasNota = info.hubfitEmail !== email ? `  (HubFit: ${info.hubfitEmail})` : '';
  console.log('');
  console.log(`${info.nombre} — ${email}${aliasNota}`);
  for (const [serieClave, puntos] of info.series) {
    const fechas = puntos.map((p) => p.fecha).sort();
    const primero = puntos.find((p) => p.fecha === fechas[0]);
    const ultimo = puntos.find((p) => p.fecha === fechas[fechas.length - 1]);
    console.log(
      `  ${serieClave.padEnd(24)} ${String(puntos.length).padStart(3)} puntos · ` +
        `${fechas[0]} (${primero.valor}) → ${fechas[fechas.length - 1]} (${ultimo.valor})`,
    );
  }
}
console.log('');
if (avisos.length) {
  console.log('');
  avisos.forEach((a) => console.log(`⚠ ${a}`));
}

if (!APLICAR) {
  console.log('');
  console.log('Simulacro completo. Relanza con --aplicar para escribir de verdad.');
  process.exit(0);
}

// ── Escritura ─────────────────────────────────────────────────────────────────

// bodyweightLogs: comprobamos duplicado exacto (athleteId+date+weight) antes
// de crear, para poder relanzar el script sin duplicar si algo falla a mitad.
async function yaExisteBodyweight(athleteId, date, weight) {
  const snap = await db
    .collection('bodyweightLogs')
    .where('athleteId', '==', athleteId)
    .where('date', '==', date)
    .get();
  return snap.docs.some((d) => d.data().weight === weight);
}

let escritosPeso = 0;
let saltadosPeso = 0;
let batch = db.batch();
let enBatch = 0;

async function commitSiToca() {
  if (enBatch >= BATCH_SIZE) {
    await batch.commit();
    batch = db.batch();
    enBatch = 0;
  }
}

for (const p of pesosFiltrados) {
  if (await yaExisteBodyweight(p.athleteId, p.date, p.weight)) {
    saltadosPeso++;
    continue;
  }
  const ref = db.collection('bodyweightLogs').doc();
  batch.set(ref, {
    id: ref.id,
    athleteId: p.athleteId,
    date: p.date,
    weight: p.weight,
    kind: 'daily',
    createdAt: nowIso,
  });
  enBatch++;
  escritosPeso++;
  await commitSiToca();
}

let escritosMedidas = 0;
for (const m of medidasFiltradas) {
  const id = `${m.athleteId}_${m.date}_${m.metricKey}`;
  const ref = db.collection('bodyMeasurements').doc(id);
  batch.set(ref, {
    id,
    athleteId: m.athleteId,
    date: m.date,
    metricKey: m.metricKey,
    value: m.value,
    unit: 'cm',
    source: 'manual',
    createdAt: nowIso,
  });
  enBatch++;
  escritosMedidas++;
  await commitSiToca();
}

if (enBatch > 0) {
  await batch.commit();
}

console.log('');
console.log(`✔ Peso: ${escritosPeso} escritos, ${saltadosPeso} ya existían (saltados)`);
console.log(`✔ Medidas: ${escritosMedidas} escritas (upsert por id determinista)`);
console.log('Hecho.');

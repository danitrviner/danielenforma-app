/**
 * Rellena `tipo` en los servicios y movimientos del CRM que se escribieron
 * antes de que existiera esa columna (paso 2 de docs/crm-modelo-v2.md).
 *
 * `tipo` es lo que permite separar «facturación de altas» de «facturación de
 * renovaciones», y de ahí salen el LTV por servicio, el ticket medio de alta y
 * la tasa de renovación. Sin él, todo lo escrito hasta 09-2026 suma en el total
 * pero no aparece en ningún desglose.
 *
 * POR DEFECTO ES UN SIMULACRO: lee, deduce, escribe el informe y NO toca nada.
 * Hace falta --aplicar para escribir de verdad.
 *
 *   # simulacro + informe (no toca producción)
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrarCrmTipos.mjs
 *
 *   # escribir de verdad
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrarCrmTipos.mjs --aplicar
 *
 * CÓMO DEDUCE (y qué NO deduce):
 *  - Primer servicio de un cliente por `fechaInicio` → `alta`.
 *  - Servicio posterior cuyo nombre ya había usado ese cliente → `renovacion`.
 *  - Cualquier otro servicio posterior → `upsell`.
 *  - Cada movimiento hereda el `tipo` de su servicio.
 *  - Movimiento HUÉRFANO (sin `servicioId`) → se le crea un servicio suelto del
 *    mismo importe y fecha, para que no quede fuera del análisis.
 *
 * Lo que NO encaja se lista al final para clasificarlo a mano. No se adivina en
 * silencio: una cifra de negocio equivocada es peor que una cifra que falta.
 *
 * Idempotente: solo toca documentos SIN `tipo`. Se puede volver a pasar.
 *
 * El Admin SDK se salta las reglas de Firestore — no hace falta iniciar sesión.
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
  console.error('Ejemplo: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrarCrmTipos.mjs');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'));
const DB_ID = firebaseConfig.firestoreDatabaseId;
const APLICAR = process.argv.includes('--aplicar');
const BATCH_SIZE = 400;

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(DB_ID);

const COL_SERVICIOS = 'crmServicios';
const COL_PAGOS = 'crmPagos';

const eur = (cents) => `${((cents ?? 0) / 100).toFixed(2).replace('.', ',')} €`;
const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function leerTodo(col) {
  const snap = await db.collection(col).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function main() {
  console.log(`\n${APLICAR ? '🔴 APLICANDO' : '🔍 SIMULACRO'} · base «${DB_ID}»\n`);

  const [servicios, movimientos] = await Promise.all([leerTodo(COL_SERVICIOS), leerTodo(COL_PAGOS)]);
  console.log(`Leídos ${servicios.length} servicios y ${movimientos.length} movimientos.\n`);

  const dudas = [];

  // ── 1. Tipo de cada servicio ───────────────────────────────────────────────
  // Se recorre cada cliente en orden cronológico: el primero es el alta, y a
  // partir de ahí manda si el nombre del servicio ya se había vendido antes.
  const porCliente = new Map();
  for (const s of servicios) {
    if (!s.clientId) { dudas.push(`Servicio ${s.id} («${s.nombre}») sin clientId — no se puede situar en la línea de nadie.`); continue; }
    if (!porCliente.has(s.clientId)) porCliente.set(s.clientId, []);
    porCliente.get(s.clientId).push(s);
  }

  const tipoPorServicio = new Map();
  const cuenta = { alta: 0, renovacion: 0, upsell: 0, yaTenia: 0 };

  for (const [, lista] of porCliente) {
    lista.sort((a, b) => String(a.fechaInicio ?? a.fechaContratacion ?? '').localeCompare(
      String(b.fechaInicio ?? b.fechaContratacion ?? '')));
    const nombresVistos = new Set();
    lista.forEach((s, i) => {
      if (s.tipo) { cuenta.yaTenia++; tipoPorServicio.set(s.id, s.tipo); nombresVistos.add(normaliza(s.nombre)); return; }
      const nombre = normaliza(s.nombre);
      const tipo = i === 0 ? 'alta' : nombresVistos.has(nombre) ? 'renovacion' : 'upsell';
      // Dos servicios el MISMO día no tienen un orden real: cuál es el alta y
      // cuál el upsell es una decisión de negocio, no de fecha.
      if (i > 0 && lista[i - 1].fechaInicio === s.fechaInicio) {
        dudas.push(`Servicios ${lista[i - 1].id} y ${s.id} de ${s.clientNombre ?? s.clientId} empiezan el mismo día (${s.fechaInicio}) — se ha supuesto «${tipo}» para «${s.nombre}».`);
      }
      tipoPorServicio.set(s.id, tipo);
      cuenta[tipo]++;
      nombresVistos.add(nombre);
    });
  }

  // ── 2. Movimientos: heredan el tipo de su servicio ─────────────────────────
  const tipoPorMovimiento = new Map();
  const serviciosNuevos = [];   // para los huérfanos
  let huerfanos = 0;
  let movYaTenia = 0;

  for (const m of movimientos) {
    if (m.tipo) { movYaTenia++; continue; }

    if (m.servicioId && tipoPorServicio.has(m.servicioId)) {
      tipoPorMovimiento.set(m.id, tipoPorServicio.get(m.servicioId));
      continue;
    }

    // Huérfano: el «Registrar pago» suelto, o lo generado por una suscripción.
    // Se le fabrica un servicio del mismo importe y fecha para que el
    // movimiento pueda atribuirse a algo — si no, queda fuera del LTV por
    // servicio y del desglose de facturación para siempre.
    if (!m.clientId) { dudas.push(`Movimiento ${m.id} («${m.concepto}») sin clientId ni servicio — se queda sin tipo.`); continue; }
    huerfanos++;
    const ref = db.collection(COL_SERVICIOS).doc();
    const fecha = m.fechaEmision ?? m.fechaCobro ?? m.createdAt?.slice?.(0, 10) ?? '';
    // Un cobro suelto de una suscripción es una renovación; uno a mano, sin
    // más contexto, se marca como upsell: no era la primera venta (para eso
    // ya hay un alta) y no sabemos que sea una renovación.
    const tipo = m.suscripcionId ? 'renovacion' : 'upsell';
    serviciosNuevos.push({
      ref,
      datos: {
        clientId: m.clientId,
        clientNombre: m.clientNombre ?? '',
        nombre: m.concepto || 'Cobro suelto',
        importeCents: m.importeCents ?? 0,
        periodicidad: 'unico',
        tipo,
        fechaContratacion: fecha,
        fechaInicio: fecha,
        descripcion: 'Creado por migrarCrmTipos: este cobro no colgaba de ningún servicio.',
        createdAt: m.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: m.createdBy ?? 'migracion',
      },
      movimientoId: m.id,
    });
    tipoPorMovimiento.set(m.id, tipo);
  }

  // ── 3. Informe ─────────────────────────────────────────────────────────────
  console.log('SERVICIOS');
  console.log(`  altas          ${cuenta.alta}`);
  console.log(`  renovaciones   ${cuenta.renovacion}`);
  console.log(`  upsells        ${cuenta.upsell}`);
  console.log(`  ya tenían tipo ${cuenta.yaTenia}\n`);

  const porTipo = { alta: 0, renovacion: 0, upsell: 0 };
  const dineroPorTipo = { alta: 0, renovacion: 0, upsell: 0 };
  for (const m of movimientos) {
    const t = tipoPorMovimiento.get(m.id) ?? m.tipo;
    if (!t || !(t in porTipo)) continue;
    porTipo[t]++;
    if (m.estado === 'pagado') dineroPorTipo[t] += m.importeCents ?? 0;
  }
  console.log('MOVIMIENTOS');
  console.log(`  altas          ${porTipo.alta}  (${eur(dineroPorTipo.alta)} cobrados)`);
  console.log(`  renovaciones   ${porTipo.renovacion}  (${eur(dineroPorTipo.renovacion)} cobrados)`);
  console.log(`  upsells        ${porTipo.upsell}  (${eur(dineroPorTipo.upsell)} cobrados)`);
  console.log(`  ya tenían tipo ${movYaTenia}`);
  console.log(`  huérfanos a los que se crea un servicio: ${huerfanos}\n`);

  if (dudas.length > 0) {
    console.log(`⚠️  ${dudas.length} caso${dudas.length === 1 ? '' : 's'} que conviene mirar a mano:`);
    for (const d of dudas) console.log(`   · ${d}`);
    console.log('');
  }

  const escrituras = tipoPorServicio.size + tipoPorMovimiento.size + serviciosNuevos.length;
  if (!APLICAR) {
    console.log(`Simulacro: no se ha escrito nada. Con --aplicar se harían ~${escrituras} escrituras.\n`);
    return;
  }

  // ── 4. Escritura ───────────────────────────────────────────────────────────
  const ahora = new Date().toISOString();
  let batch = db.batch();
  let n = 0;
  const commit = async () => { if (n > 0) { await batch.commit(); batch = db.batch(); n = 0; } };
  const encolar = async (fn) => { fn(); if (++n >= BATCH_SIZE) await commit(); };

  for (const s of servicios) {
    const tipo = tipoPorServicio.get(s.id);
    if (!tipo || s.tipo) continue;
    await encolar(() => batch.update(db.collection(COL_SERVICIOS).doc(s.id), { tipo, updatedAt: ahora }));
  }
  for (const { ref, datos, movimientoId } of serviciosNuevos) {
    await encolar(() => batch.set(ref, datos));
    await encolar(() => batch.update(db.collection(COL_PAGOS).doc(movimientoId), { servicioId: ref.id, updatedAt: ahora }));
  }
  for (const [id, tipo] of tipoPorMovimiento) {
    await encolar(() => batch.update(db.collection(COL_PAGOS).doc(id), { tipo, updatedAt: ahora }));
  }
  await commit();

  // El sello de versión: sin esto, el navegador del coach sigue sirviendo su
  // copia en caché y no ve nada de la migración hasta que le caduque sola.
  // Ver src/db/catalogoVersionado.ts — es el mismo pie de bala que ya está
  // documentado ahí para cualquier escritor de servidor.
  const version = new Date().toISOString();
  await db.collection('catalogos').doc(COL_SERVICIOS).set({ version }, { merge: true });
  await db.collection('catalogos').doc(COL_PAGOS).set({ version }, { merge: true });

  console.log(`✅ Hecho. Sellos de ${COL_SERVICIOS} y ${COL_PAGOS} actualizados.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });

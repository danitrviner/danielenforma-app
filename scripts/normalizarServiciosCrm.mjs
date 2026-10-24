/**
 * Pone `tipoServicio` (trimestral / semestral / anual / otro) a los servicios
 * del CRM que se escribieron antes de R-01, a partir de su nombre escrito a mano.
 *
 * Tres pasos, y solo el último escribe:
 *
 *   1. INFORME (por defecto, solo lectura). Lee `crmServicios`, propone un tipo
 *      para cada nombre y escribe un CSV para que lo revises:
 *        GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *          node scripts/normalizarServiciosCrm.mjs informe-servicios-crm.csv
 *   2. REVISIÓN. Abre el CSV (separador `;`) y corrige la columna
 *      `tipoServicio_final`. Las filas «dudosa» llevan «otro» por defecto: ahí
 *      hay que mirar. Las semanas («12 semanas») nunca se traducen solas.
 *   3. APLICAR (escribe). Solo con --aplicar y el CSV ya revisado:
 *        GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *          node scripts/normalizarServiciosCrm.mjs informe-servicios-crm.csv --aplicar
 *
 * Solo escribe `tipoServicio`. NO toca nombres, importes, fechas, tipo de venta
 * ni pagos. Idempotente: salta los servicios que ya tienen `tipoServicio`.
 *
 * Volumen: `crmServicios` es una colección pequeña del propio coach (decenas de
 * documentos), no datos de atletas; aun así, ejecutarlo contra producción
 * requiere el permiso explícito de Dani en cada paso.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { clasificarNombre, TIPOS_DE_SERVICIO, sinTildes } from './_lib/clasificarServicio.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const ARCHIVO = args.find(a => !a.startsWith('--'));
if (!ARCHIVO) {
  console.error('Falta el archivo CSV.\nEjemplo: node scripts/normalizarServiciosCrm.mjs informe-servicios-crm.csv [--aplicar]');
  process.exit(1);
}
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) { console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1); }

const firebaseConfig = JSON.parse(readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'));
initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) });
const db = getFirestore(firebaseConfig.firestoreDatabaseId);
const COL = 'crmServicios';

/* ── CSV mínimo con `;` y comillas ───────────────────────────────────────── */
const celda = (v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
function leerCsv(texto) {
  const filas = []; let fila = []; let cur = ''; let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') comillas = false; else cur += c;
    } else if (c === '"') comillas = true;
    else if (c === ';') { fila.push(cur); cur = ''; }
    else if (c === '\n') { fila.push(cur.replace(/\r$/, '')); filas.push(fila); fila = []; cur = ''; }
    else cur += c;
  }
  if (cur || fila.length) { fila.push(cur.replace(/\r$/, '')); filas.push(fila); }
  return filas;
}
const eur = (c) => `${((c ?? 0) / 100).toFixed(2).replace('.', ',')}`;

async function informe() {
  const snap = await db.collection(COL).get();
  const servicios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`\n🔍 INFORME (solo lectura) · base «${firebaseConfig.firestoreDatabaseId}» · ${servicios.length} servicios\n`);

  const cab = ['id', 'cliente', 'nombre_actual', 'venta', 'periodicidad', 'importe_eur', 'fecha_inicio', 'fecha_fin', 'archivado',
    'tipoServicio_actual', 'propuesta', 'confianza', 'tipoServicio_final'];
  const filas = servicios.map(s => {
    const c = clasificarNombre(s.nombre);
    const ya = s.tipoServicio ?? '';
    return [s.id, s.clientNombre ?? '', s.nombre ?? '', s.tipo ?? '', s.periodicidad ?? '', eur(s.importeCents),
      s.fechaInicio ?? '', s.fechaFin ?? '', s.archivado ? 'sí' : '', ya, c.tipo, c.confianza, ya || c.tipo];
  });
  writeFileSync(resolve(ARCHIVO), '﻿' + [cab, ...filas].map(f => f.map(celda).join(';')).join('\n') + '\n', 'utf8');

  // Resumen por nombre normalizado: es lo que de verdad hay que decidir.
  const porNombre = new Map();
  for (const s of servicios) {
    const k = sinTildes(s.nombre) || '(sin nombre)';
    const e = porNombre.get(k) ?? { n: 0, ...clasificarNombre(s.nombre) };
    e.n++; porNombre.set(k, e);
  }
  console.log('Nombre normalizado → propuesta');
  for (const [k, e] of [...porNombre].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${String(e.n).padStart(3)} × ${k.padEnd(40)} → ${e.tipo}${e.confianza === 'dudosa' ? '   ⚠ revisar' : ''}`);
  }
  const dudosas = filas.filter(f => f[11] === 'dudosa').length;
  console.log(`\n${filas.length} filas · ${dudosas} dudosas · CSV: ${resolve(ARCHIVO)}`);
  console.log('Revisa la columna «tipoServicio_final» y luego aplica con --aplicar.\n');
}

async function aplicar() {
  if (!existsSync(resolve(ARCHIVO))) { console.error(`No existe ${ARCHIVO}. Genera primero el informe.`); process.exit(1); }
  const filas = leerCsv(readFileSync(resolve(ARCHIVO), 'utf8').replace(/^﻿/, ''));
  const cab = filas[0];
  const iId = cab.indexOf('id'); const iFinal = cab.indexOf('tipoServicio_final'); const iActual = cab.indexOf('tipoServicio_actual');
  if (iId < 0 || iFinal < 0) { console.error('El CSV no tiene las columnas `id` y `tipoServicio_final`.'); process.exit(1); }

  const cambios = []; const invalidas = [];
  for (const f of filas.slice(1)) {
    if (!f[iId]) continue;
    const final = (f[iFinal] ?? '').trim().toLowerCase();
    if (!TIPOS_DE_SERVICIO.includes(final)) { invalidas.push(`${f[iId]} → «${f[iFinal]}»`); continue; }
    if ((f[iActual] ?? '').trim()) continue; // ya tenía tipo: no se pisa
    cambios.push({ id: f[iId], tipoServicio: final });
  }
  if (invalidas.length) {
    console.error(`\n❌ ${invalidas.length} filas con un tipo que no es del catálogo (${TIPOS_DE_SERVICIO.join(', ')}):\n  ${invalidas.join('\n  ')}\nNo se escribe nada.`);
    process.exit(1);
  }
  console.log(`\n🔴 APLICANDO · base «${firebaseConfig.firestoreDatabaseId}» · ${cambios.length} servicios (solo el campo tipoServicio)\n`);
  let escritos = 0;
  for (let i = 0; i < cambios.length; i += 400) {
    const lote = db.batch();
    for (const c of cambios.slice(i, i + 400)) {
      const ref = db.collection(COL).doc(c.id);
      // Solo si sigue sin tipo: otra sesión pudo ponérselo entre el informe y ahora.
      const actual = await ref.get();
      if (!actual.exists || actual.data().tipoServicio) continue;
      lote.update(ref, { tipoServicio: c.tipoServicio });
      escritos++;
    }
    await lote.commit();
  }
  console.log(`Escritos ${escritos} servicios.\n`);
}

(APLICAR ? aplicar() : informe()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

/**
 * N-04 · Carga el catálogo de alimentos por 100 g desde un CSV de Dani.
 *
 * EN SECO por defecto: valida el CSV, lo compara con lo que hay en Firestore y
 * escribe un informe (CSV, separador `;`) con cada fila: ok / aviso / error.
 * No escribe nada en Firestore.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" \
 *     npx tsx scripts/importarCatalogoAlimentos.ts alimentos.csv [informe.csv]
 *
 * `--aplicar` escribe, solo con el permiso de Dani y tras revisar el informe:
 *   - Fusiona: lo del CSV entra o sustituye por id; lo que ya estaba y no viene
 *     en el CSV SE CONSERVA (se lista como «ausente»). Nunca borra alimentos.
 *   - Idempotente: si no hay nuevos ni cambiados, no escribe nada.
 *   - Reescribe los trozos `catalogoAlimentos/trozo_NNN` y marca el sello
 *     `catalogos/catalogoAlimentos` para que los móviles bajen la versión nueva.
 *   - Las filas con error no se cargan.
 *
 * Plantilla: scripts/plantillas/catalogo-alimentos.csv
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { abrirDb, marcarCatalogoCambiado } from './_lib/firestoreDb.mjs';
import {
  validarCsv, compararCatalogo, fusionarCatalogo, repartirEnTrozos, idDeTrozo,
  COLECCION_CATALOGO, type AlimentoCatalogo, type TrozoCatalogo,
} from '../src/utils/catalogoAlimentos';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const [entrada, salidaArg] = args.filter(a => !a.startsWith('--'));
if (!entrada) {
  console.error('Falta el CSV.\nEjemplo: npx tsx scripts/importarCatalogoAlimentos.ts alimentos.csv [informe.csv] [--aplicar]');
  process.exit(1);
}
const salida = salidaArg ?? resolve('scripts/out/informe-catalogo-alimentos.csv');
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) { console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1); }

const { filas, alimentos, erroresGenerales } = validarCsv(readFileSync(resolve(entrada), 'utf8'));
if (erroresGenerales.length > 0) {
  console.error(erroresGenerales.join('\n'));
  process.exit(1);
}

const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')));
// Solo la colección del catálogo, que son unos pocos trozos: no hay datos de atletas.
const snap = await db.collection(COLECCION_CATALOGO).get();
const trozosActuales = snap.docs.filter(d => d.id.startsWith('trozo_'));
const actual: AlimentoCatalogo[] = trozosActuales.flatMap(d => (d.data() as TrozoCatalogo).alimentos ?? []);
const dif = compararCatalogo(actual, alimentos);

const nuevos = new Set(dif.nuevos.map(a => a.id));
const cambiados = new Set(dif.cambiados.map(c => c.despues.id));
const celda = (v: unknown) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const lineas = [['fila', 'nombre', 'id', 'resultado', 'cambio', 'mensajes']];
for (const f of filas) {
  const resultado = f.errores.length ? 'ERROR (no se carga)' : f.avisos.length ? 'aviso' : 'ok';
  const id = f.alimento?.id ?? '';
  const cambio = !f.alimento ? '' : nuevos.has(id) ? 'nuevo' : cambiados.has(id) ? 'cambiado' : 'igual';
  lineas.push([String(f.fila), f.nombre, id, resultado, cambio, [...f.errores, ...f.avisos].join(' ')]);
}
for (const a of dif.ausentes) lineas.push(['', a.nombre, a.id, 'se conserva', 'no está en el CSV', '']);
writeFileSync(salida, '\uFEFF' + lineas.map(l => l.map(celda).join(';')).join('\n') + '\n', 'utf8');

const conError = filas.filter(f => f.errores.length > 0).length;
const conAviso = filas.filter(f => f.errores.length === 0 && f.avisos.length > 0).length;
console.log(`Filas: ${filas.length} · errores: ${conError} · avisos: ${conAviso}`);
console.log(`En Firestore: ${actual.length} · nuevos: ${dif.nuevos.length} · cambiados: ${dif.cambiados.length} · iguales: ${dif.iguales} · se conservan sin estar en el CSV: ${dif.ausentes.length}`);
console.log(`Informe: ${salida}`);

if (!aplicar) { console.log('EN SECO: no se ha escrito nada. Usa --aplicar para escribir.'); process.exit(0); }
if (dif.nuevos.length === 0 && dif.cambiados.length === 0) { console.log('Nada que escribir: el catálogo ya está al día.'); process.exit(0); }

const final = fusionarCatalogo(actual, alimentos);
const trozos = repartirEnTrozos(final);
const actualizadoEn = new Date().toISOString();
const lote = db.batch();
trozos.forEach((t, i) => lote.set(db.collection(COLECCION_CATALOGO).doc(idDeTrozo(i)), { alimentos: t, actualizadoEn }));
// Trozos que sobran si el catálogo ha encogido de tamaño de trozo (nunca de alimentos: la fusión no borra).
for (const d of trozosActuales) if (Number(d.id.slice(6)) >= trozos.length) lote.delete(d.ref);
await lote.commit();
await marcarCatalogoCambiado(db, COLECCION_CATALOGO);

// Verificación: releer y contar.
const despues = (await db.collection(COLECCION_CATALOGO).get()).docs
  .filter(d => d.id.startsWith('trozo_'))
  .flatMap(d => (d.data() as TrozoCatalogo).alimentos ?? []);
const ok = despues.length === final.length;
console.log(`Escritos ${trozos.length} trozos con ${final.length} alimentos. Releído: ${despues.length} ${ok ? '✓' : '✗ NO CUADRA'}`);
process.exit(ok ? 0 : 1);

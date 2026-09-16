/* Cuántos documentos tiene cada colección de la base NOMBRADA.
 *
 * Existe para dimensionar las copias de seguridad: una copia hecha por script
 * (leyendo documento a documento) gasta una lectura por documento, y el tope de
 * este proyecto es 50.000 al día — al llegar, la base se PAUSA en vez de cobrar
 * (ver scripts/diagCuota.mjs). Antes de decidir cómo se copia hay que saber si
 * un volcado completo cabe ahí o tumbaría la app a los atletas.
 *
 * Usa `count()`, la consulta de agregación: cuesta UNA lectura por cada 1.000
 * documentos contados, no una por documento. Contar una base de 30.000
 * documentos son 30 lecturas, no 30.000.
 *
 * Uso: node scripts/diagTamano.mjs
 */
import { readFileSync } from 'fs';
import { abrirDb, DATABASE_ID } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);

console.log(`Base: ${DATABASE_ID}\n`);

const colecciones = await db.listCollections();
const filas = [];

for (const col of colecciones) {
  const snap = await col.count().get();
  filas.push({ nombre: col.id, n: snap.data().count });
}

filas.sort((a, b) => b.n - a.n);

const ancho = Math.max(...filas.map(f => f.nombre.length));
let total = 0;
for (const f of filas) {
  total += f.n;
  console.log(`${f.nombre.padEnd(ancho)}  ${String(f.n).padStart(7)}`);
}

console.log(`${''.padEnd(ancho, '─')}  ${''.padStart(7, '─')}`);
console.log(`${'TOTAL'.padEnd(ancho)}  ${String(total).padStart(7)}`);
console.log(`\nColecciones: ${filas.length}`);
console.log(`Lecturas que costaría UN volcado completo por script: ${total.toLocaleString('es-ES')}`);
console.log(`Tope diario del proyecto: 50.000 (al superarlo la base se PAUSA).`);
if (total > 50_000) {
  console.log(`\n⚠️  Un volcado completo NO cabe en un día: tumbaría la base.`);
} else if (total > 25_000) {
  console.log(`\n⚠️  Un volcado completo cabe, pero se come más de la mitad del tope diario.`);
}

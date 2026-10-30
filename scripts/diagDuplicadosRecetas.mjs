/* Diagnóstico (SOLO LECTURA) de las recetas con el mismo nombre: ¿son la misma
 * receta? Compara ingredientes, cantidades y pasos de cada grupo.
 *
 * Uso: node scripts/diagDuplicadosRecetas.mjs [salida.json]
 * Credenciales: las de `gcloud auth application-default login`.
 */
import { readFileSync, writeFileSync } from 'fs';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DATABASE_ID } from './_lib/firestoreDb.mjs';

const config = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId: config.projectId });
const db = getFirestore(DATABASE_ID);

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const indice = JSON.parse(readFileSync(new URL('../public/recetas-indice.json', import.meta.url), 'utf8')).recetas;
const grupos = new Map();
for (const r of indice) grupos.set(norm(r.name), [...(grupos.get(norm(r.name)) ?? []), r.id]);
const dup = [...grupos.values()].filter(g => g.length > 1);
const ids = dup.flat();

const docs = new Map();
for (let i = 0; i < ids.length; i += 200) {
  const refs = ids.slice(i, i + 200).map(id => db.collection('recipes').doc(id));
  for (const s of await db.getAll(...refs)) if (s.exists) docs.set(s.id, s.data());
}

const ingNombres = d => (d.ingredientsText ?? []).map(i => norm(i.name)).sort().join('|');
const ingCant = d => (d.ingredientsText ?? []).map(i => `${norm(i.name)}:${Math.round(Number(i.quantity) || 0)}`).sort().join('|');
const pasos = d => (d.stepsText ?? []).map(p => norm(p.description) + (p.items ? '[' + p.items.map(norm).join(',') + ']' : '')).join(' / ');
const kcal = d => Math.round(d.kcal ?? 0);

const out = [];
const tipos = { identicas: 0, misma_otra_cantidad: 0, mismos_ingredientes_otros_pasos: 0, distintas: 0 };
for (const g of dup) {
  const ds = g.map(id => ({ id, d: docs.get(id) })).filter(x => x.d);
  if (ds.length < 2) continue;
  const mismaLista = new Set(ds.map(x => ingNombres(x.d))).size === 1;
  const mismasCant = new Set(ds.map(x => ingCant(x.d))).size === 1;
  const mismosPasos = new Set(ds.map(x => pasos(x.d))).size === 1;
  const tipo = mismaLista && mismasCant && mismosPasos ? 'identicas'
    : mismaLista && mismosPasos ? 'misma_otra_cantidad'
    : mismaLista ? 'mismos_ingredientes_otros_pasos' : 'distintas';
  tipos[tipo]++;
  out.push({ nombre: ds[0].d.name?.trim(), tipo, n: ds.length, recetas: ds.map(x => ({ id: x.id, kcal: kcal(x.d), ing: (x.d.ingredientsText ?? []).map(i => `${i.name} ${Math.round(Number(i.quantity) || 0)}g`), pasos: (x.d.stepsText ?? []).length })) });
}
console.log(JSON.stringify({ grupos: out.length, leidas: docs.size, tipos }, null, 1));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));

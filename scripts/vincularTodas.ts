/**
 * Bloque B (26-10-2026) · Vincula AUTOMÁTICAMENTE todas las recetas del
 * recetario al catálogo de alimentos por 100 g, para que el generador de menús
 * pueda ajustar cada alimento por separado (solo el arroz, solo el pollo…).
 *
 * Solo se vinculan las recetas en las que TODO lo que cuenta empareja con el
 * catálogo con confianza alta o media (`vinculoAutomatico`); las demás quedan
 * en una lista de dudas para revisar y siguen escalándose enteras. Las que ya
 * tienen vínculo (Rápidas, revisadas a mano) no se tocan.
 *
 * Al vincular, la receta recalcula sus kcal, macros y peso con el catálogo
 * (`aplicarVinculo`, que guarda el «antes»): las kcal que se enseñan son las
 * de sus alimentos (decisión de Dani).
 *
 * EN SECO por defecto: cuenta y escribe el informe de dudas. Con --aplicar
 * reescribe `public/recetas/recetas_*.json`; después hay que regenerar el
 * índice (`node scripts/generarIndiceRecetas.mjs`) y, para que la ficha de la
 * receta lo vea, subir los documentos con --firestore (solo con OK de Dani).
 *
 *   npx tsx scripts/vincularTodas.ts [--catalogo-json catalogo.json] [--aplicar] [--firestore]
 *
 * Sin --catalogo-json, el catálogo se lee de Firestore (GOOGLE_APPLICATION_CREDENTIALS).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cargarCatalogoAlimentos } from './_lib/cargarCatalogoAlimentos';
import { abrirDb } from './_lib/firestoreDb.mjs';
import { mapRecipe } from './lib/mapearReceta.mjs';
import { aplicarVinculo, vinculoAutomatico, type RecetaCruda } from '../src/utils/recetaVinculada';
import type { AlimentoCatalogo } from '../src/utils/catalogoAlimentos';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, '../public/recetas');
const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const FIRESTORE = args.includes('--firestore');
const iJson = args.indexOf('--catalogo-json');

const catalogo: AlimentoCatalogo[] = iJson >= 0
  ? JSON.parse(readFileSync(resolve(args[iJson + 1]), 'utf8'))
  : (await cargarCatalogoAlimentos([])).lista;
const porId = new Map(catalogo.map(a => [a.id, a]));
const ahora = new Date().toISOString();

let total = 0, yaVinculadas = 0, vinculadas = 0;
const dudas = new Map<string, number>();
const cambiadas: RecetaCruda[] = [];

for (const archivo of readdirSync(DIR).filter(f => /^recetas_.*\.json$/.test(f)).sort()) {
  const ruta = resolve(DIR, archivo);
  const texto = readFileSync(ruta, 'utf8');
  const json = JSON.parse(texto) as { recipes: RecetaCruda[] };
  let tocado = false;
  json.recipes = json.recipes.map(receta => {
    total++;
    if (receta.vinculo) { yaVinculadas++; return receta; }
    const v = vinculoAutomatico(receta, catalogo);
    if ('dudosos' in v) {
      for (const d of v.dudosos) dudas.set(d, (dudas.get(d) ?? 0) + 1);
      return receta;
    }
    const { receta: nueva, calculo } = aplicarVinculo(receta, (v as { ingredientes: Parameters<typeof aplicarVinculo>[1] }).ingredientes, porId, ahora);
    if (!calculo.ok) return receta;
    vinculadas++;
    tocado = true;
    cambiadas.push(nueva);
    return nueva;
  });
  // Se conserva el formato de cada archivo: compacto o con sangría.
  if (APLICAR && tocado) writeFileSync(ruta, texto.startsWith('{\n') ? JSON.stringify(json, null, 2) + '\n' : JSON.stringify(json));
}

mkdirSync(resolve(__dirname, 'out'), { recursive: true });
const informe = resolve(__dirname, 'out/vincular-dudas.csv');
writeFileSync(informe, '﻿ingrediente;recetas\n' + [...dudas.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n};${c}`).join('\n') + '\n');

console.log(`Recetas: ${total} · ya vinculadas: ${yaVinculadas} · se vinculan ahora: ${vinculadas} · quedan sin vincular: ${total - yaVinculadas - vinculadas}`);
console.log(`Dudas: ${dudas.size} ingredientes distintos → ${informe}`);

if (FIRESTORE) {
  if (!APLICAR) { console.log('--firestore necesita --aplicar.'); process.exit(1); }
  const sa = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!sa) { console.error('Falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1); }
  const db = abrirDb(JSON.parse(readFileSync(resolve(sa), 'utf8')));
  // Solo lo que cambia al vincular: macros, kcal, peso, intercambios y vínculo.
  for (let i = 0; i < cambiadas.length; i += 400) {
    const lote = db.batch();
    for (const r of cambiadas.slice(i, i + 400)) {
      const d = mapRecipe(r);
      lote.set(db.collection('recipes').doc(r.id), {
        macros: d.macros, kcal: d.kcal, weight: d.weight, exchanges: d.exchanges, vinculo: d.vinculo,
      }, { merge: true });
    }
    await lote.commit();
  }
  console.log(`Firestore: ${cambiadas.length} recetas actualizadas.`);
} else if (!APLICAR) {
  console.log('EN SECO: no se ha escrito nada. --aplicar reescribe los JSON; --aplicar --firestore sube además las recetas.');
}

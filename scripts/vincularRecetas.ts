/**
 * N-05 · Vincula los ingredientes de las Rápidas al catálogo por 100 g.
 *
 * Trabaja sobre `public/recetas/recetas_05_basicas_p01.json`, que es de donde
 * salen el índice del generador y los documentos de Firestore. NO escribe en
 * Firestore: para publicar, después, `importarBasicas.mjs --aplicar` (con
 * permiso de Dani) y regenerar el índice (`node scripts/generarIndiceRecetas.mjs`
 * o `npm run build`), y desplegar la web.
 *
 * El catálogo se lee de Firestore o, con `--catalogo alimentos.csv`, del CSV.
 *
 *   1. PROPUESTA (solo lectura): CSV con cada ingrediente emparejado.
 *        npx tsx scripts/vincularRecetas.ts propuesta [salida.csv] [--catalogo alimentos.csv]
 *   2. Dani revisa `alimento_id` («-» = no cuenta), gramos, min, max, palanca, fijo.
 *   3. APLICAR: en seco enseña qué cambia; con --aplicar reescribe el JSON.
 *        npx tsx scripts/vincularRecetas.ts aplicar vinculos.csv [--catalogo …] [--aplicar]
 *   4. RECALCULAR tras cambiar el catálogo (en seco salvo --aplicar):
 *        npx tsx scripts/vincularRecetas.ts recalcular [--catalogo …] [--aplicar]
 *
 * Idempotente: lo que ya está igual no se cuenta ni se reescribe. Una receta
 * con un ingrediente que no está en el catálogo queda «sin calcular» y
 * conserva sus macros.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { cargarCatalogoAlimentos, argumentosSueltos } from './_lib/cargarCatalogoAlimentos';
import {
  filasDePropuesta, leerVinculos, aplicarVinculo, mismoResultado, COLUMNAS_VINCULOS, type RecetaCruda,
} from '../src/utils/recetaVinculada';

const ARCHIVO_RAPIDAS = resolve('public/recetas/recetas_05_basicas_p01.json');
const args = process.argv.slice(2);
const escribir = args.includes('--aplicar');
const [modo, archivo] = argumentosSueltos(args);

const celda = (v: unknown) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const guardarCsv = (ruta: string, filas: string[][]) =>
  writeFileSync(ruta, '\uFEFF' + filas.map(f => f.map(celda).join(';')).join('\n') + '\n', 'utf8');

const contenido = JSON.parse(readFileSync(ARCHIVO_RAPIDAS, 'utf8')) as { metadata: unknown; recipes: RecetaCruda[] };
const { lista, origen } = await cargarCatalogoAlimentos(args);
const catalogo = new Map(lista.map(a => [a.id, a]));
console.log(`Catálogo: ${lista.length} alimentos (${origen}) · Rápidas: ${contenido.recipes.length}`);
if (lista.length === 0) { console.error('El catálogo está vacío: carga antes los alimentos (N-04).'); process.exit(1); }

if (modo === 'propuesta') {
  const salida = archivo ?? resolve('scripts/out/vinculos-rapidas.csv');
  const filas = contenido.recipes.flatMap(r => filasDePropuesta(r, lista));
  guardarCsv(salida, [[...COLUMNAS_VINCULOS], ...filas]);
  const conf = (c: string) => filas.filter(f => f[COLUMNAS_VINCULOS.indexOf('confianza')] === c).length;
  console.log(`${filas.length} ingredientes · alta ${conf('alta')} · media ${conf('media')} · baja ${conf('baja')} · sin pareja ${conf('ninguna')} · ya vinculados ${conf('ya vinculado')}`);
  console.log(`Propuesta: ${salida}\nRevísala y luego: npx tsx scripts/vincularRecetas.ts aplicar ${salida}`);
  process.exit(0);
}

if (modo !== 'aplicar' && modo !== 'recalcular') {
  console.error('Modo: propuesta | aplicar <vinculos.csv> | recalcular');
  process.exit(1);
}

let vinculos: Map<string, NonNullable<RecetaCruda['vinculo']>['ingredientes']>;
if (modo === 'aplicar') {
  if (!archivo) { console.error('Falta el CSV de vínculos.'); process.exit(1); }
  const leidos = leerVinculos(readFileSync(resolve(archivo), 'utf8'), catalogo);
  for (const e of leidos.errores) console.log(`  ✗ fila ${e.fila} · ${e.receta}: ${e.mensaje}`);
  vinculos = leidos.porReceta;
} else {
  vinculos = new Map(contenido.recipes.filter(r => r.vinculo).map(r => [r.id, r.vinculo!.ingredientes]));
}

const ahora = new Date().toISOString();
const idsDelArchivo = new Set(contenido.recipes.map(r => r.id));
for (const id of vinculos.keys()) if (!idsDelArchivo.has(id)) console.log(`  ✗ ${id}: no es una de las Rápidas, se ignora.`);

let cambiadas = 0, sinCalcular = 0, iguales = 0;
const informe: string[][] = [['receta', 'estado', 'kcal_antes', 'kcal_despues', 'p', 'hc', 'g', 'faltan']];
contenido.recipes = contenido.recipes.map(r => {
  const ings = vinculos.get(r.id);
  if (!ings) return r;
  const { receta, calculo } = aplicarVinculo(r, ings, catalogo, ahora);
  if (mismoResultado(r, receta)) { iguales++; return r; }
  cambiadas++;
  if (!calculo.ok) sinCalcular++;
  informe.push([r.name, calculo.ok ? 'calculada' : 'SIN CALCULAR', String(r.kcal ?? ''), calculo.ok ? String(calculo.kcal) : '',
    calculo.ok ? String(calculo.p) : '', calculo.ok ? String(calculo.hc) : '', calculo.ok ? String(calculo.g) : '',
    'faltan' in calculo ? calculo.faltan.join(', ') : '']);
  return receta;
});

const salidaInforme = resolve(`scripts/out/informe-${modo}-rapidas.csv`);
guardarCsv(salidaInforme, informe);
console.log(`Cambian ${cambiadas} recetas (${sinCalcular} sin calcular) · iguales ${iguales} · informe: ${salidaInforme}`);

if (!escribir) { console.log('EN SECO: no se ha escrito nada. Usa --aplicar para reescribir el JSON de las Rápidas.'); process.exit(0); }
if (cambiadas === 0) { console.log('Nada que escribir.'); process.exit(0); }
writeFileSync(ARCHIVO_RAPIDAS, JSON.stringify(contenido, null, 2) + '\n', 'utf8');
// Verificación: releer y comprobar que cada receta vinculada lleva su vínculo.
const releido = JSON.parse(readFileSync(ARCHIVO_RAPIDAS, 'utf8')) as { recipes: RecetaCruda[] };
const faltan = [...vinculos.keys()].filter(id => idsDelArchivo.has(id) && !releido.recipes.find(r => r.id === id)?.vinculo);
console.log(faltan.length ? `✗ Sin vínculo tras escribir: ${faltan.join(', ')}` : `✓ Escrito ${ARCHIVO_RAPIDAS}`);
console.log('Para publicar: importarBasicas.mjs --aplicar (con permiso) + generarIndiceRecetas.mjs + desplegar la web.');
process.exit(faltan.length ? 1 : 0);

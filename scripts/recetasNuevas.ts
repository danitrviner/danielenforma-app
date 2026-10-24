/**
 * N-05 · Recetas nuevas de la biblioteca base desde un CSV de Dani.
 *
 * Una fila por ingrediente; los datos de la receta (momentos, minutos, tupper,
 * no_apta_para, foto, pasos) en su primera fila. Plantilla:
 * scripts/plantillas/recetas-nuevas.csv
 *
 *   npx tsx scripts/recetasNuevas.ts nuevas.csv [--catalogo alimentos.csv] [--aplicar]
 *
 * En seco por defecto. Con --aplicar añade (o actualiza, por id estable a
 * partir del nombre) las recetas en `public/recetas/recetas_05_basicas_p01.json`
 * con `basica: true`, ingredientes vinculados y macros calculados. NO escribe en
 * Firestore: después, `importarBasicas.mjs --aplicar` (con permiso de Dani),
 * regenerar el índice y desplegar la web.
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { cargarCatalogoAlimentos, argumentosSueltos } from './_lib/cargarCatalogoAlimentos';
import { leerRecetasNuevas, recetaCrudaNueva, mismoResultado, type RecetaCruda } from '../src/utils/recetaVinculada';

const ARCHIVO_RAPIDAS = resolve('public/recetas/recetas_05_basicas_p01.json');
// Espacio de nombres fijo para los UUID v5 de las recetas base de En Forma:
// el mismo nombre de receta da siempre el mismo id.
const ESPACIO = 'b6f1c7e2-4a1d-5c3e-9f20-6e5a0b1d2c34';

function uuidV5(nombre: string): string {
  const ns = Buffer.from(ESPACIO.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from(nombre, 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const args = process.argv.slice(2);
const escribir = args.includes('--aplicar');
const [archivo] = argumentosSueltos(args);
if (!archivo) { console.error('Falta el CSV.\nEjemplo: npx tsx scripts/recetasNuevas.ts nuevas.csv [--catalogo alimentos.csv] [--aplicar]'); process.exit(1); }

const { lista, origen } = await cargarCatalogoAlimentos(args);
const catalogo = new Map(lista.map(a => [a.id, a]));
console.log(`Catálogo: ${lista.length} alimentos (${origen})`);

const { recetas, errores, avisos } = leerRecetasNuevas(readFileSync(resolve(archivo), 'utf8'), catalogo);
for (const e of errores) console.log(`  ✗ fila ${e.fila} · ${e.receta}: ${e.mensaje}`);
for (const a of avisos) console.log(`  ! ${a.receta}: ${a.mensaje}`);

const contenido = JSON.parse(readFileSync(ARCHIVO_RAPIDAS, 'utf8')) as { metadata: unknown; recipes: RecetaCruda[] };
const ahora = new Date().toISOString();
let nuevas = 0, actualizadas = 0, iguales = 0;
const escritas: Array<{ id: string; nombre: string }> = [];
for (const r of recetas) {
  const { receta, calculo } = recetaCrudaNueva(r, catalogo, uuidV5, ahora);
  const i = contenido.recipes.findIndex(x => x.id === receta.id);
  // Lo que no viene del CSV (por ejemplo una foto puesta a mano) se conserva.
  const final = i >= 0 ? { ...contenido.recipes[i], ...receta } : receta;
  if (i >= 0 && mismoResultado(contenido.recipes[i], final)) { iguales++; continue; }
  if (i >= 0) { contenido.recipes[i] = final; actualizadas++; } else { contenido.recipes.push(final); nuevas++; }
  escritas.push({ id: receta.id, nombre: r.nombre });
  console.log(`  ${i >= 0 ? '~' : '+'} ${r.nombre}: ${calculo.ok ? `${calculo.kcal} kcal · P ${calculo.p} · HC ${calculo.hc} · G ${calculo.g}` : 'SIN CALCULAR'}`);
}
console.log(`Recetas: ${recetas.length} válidas · nuevas ${nuevas} · actualizadas ${actualizadas} · iguales ${iguales} · con error ${new Set(errores.map(e => e.receta)).size}`);

if (!escribir) { console.log('EN SECO: no se ha escrito nada. Usa --aplicar para añadirlas al JSON de las Rápidas.'); process.exit(0); }
if (nuevas + actualizadas === 0) { console.log('Nada que escribir.'); process.exit(0); }
writeFileSync(ARCHIVO_RAPIDAS, JSON.stringify(contenido, null, 2) + '\n', 'utf8');
const releido = JSON.parse(readFileSync(ARCHIVO_RAPIDAS, 'utf8')) as { recipes: RecetaCruda[] };
const faltan = escritas.filter(e => !releido.recipes.some(x => x.id === e.id));
console.log(faltan.length ? `✗ No aparecen tras escribir: ${faltan.map(e => e.nombre).join(', ')}` : `✓ Escrito ${ARCHIVO_RAPIDAS}`);
console.log('Para publicar: importarBasicas.mjs --aplicar (con permiso) + generarIndiceRecetas.mjs + desplegar la web.');
process.exit(faltan.length ? 1 : 0);

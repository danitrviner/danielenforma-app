/**
 * Genera src/data/ejerciciosOrigen.json — el nombre ORIGINAL en inglés y la
 * categoría de origen de cada ejercicio importado, indexados por su ID de
 * Firestore.
 *
 * Para qué: los 1.681 ejercicios importados se tradujeron con un diccionario
 * palabra por palabra (scripts/traducirEjercicios.mjs), no con IA. Muchos
 * nombres quedaron desordenados, con inglés colado entre corchetes, o
 * describiendo algo que el vídeo no hace. Para revisarlos hace falta ver el
 * original — si no, no hay forma de saber si "Paso atrás jalón" está mal
 * traducido o es que el ejercicio es raro.
 *
 * Por qué un JSON en el bundle y no un campo en Firestore: es información de
 * consulta que nunca cambia y que solo mira el coach mientras revisa. Escribir
 * 1.681 documentos de producción para algo de solo lectura sería gastar cuota
 * y tocar datos vivos sin motivo. Mismo criterio que el catálogo de máquinas
 * (ver docs/catalogo-maquinas.md): la semilla va en el bundle, y a Firestore
 * solo llega lo que el coach decide.
 *
 * El cruce se hace con subida-progreso.json, que mapea fichero de vídeo →
 * exerciseId; ejercicios-propuestos.json aporta el nombre en inglés (dentro
 * del nombre del fichero) y la categoría (su prefijo).
 *
 * Uso:
 *   node scripts/generarOrigenEjercicios.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leer = p => JSON.parse(readFileSync(resolve(raiz, p), 'utf8'));

const propuestos = leer('scripts/out/ejercicios-propuestos.json');
const progreso = leer('scripts/out/subida-progreso.json');

// 'Pecho - Barbell_Bench_Press_304812.mp4' → { categoria: 'Pecho',
//   nombre: 'Barbell Bench Press' }. El sufijo numérico es el id del vídeo en
// el banco de origen, no parte del nombre.
function partirNombreDeVideo(videoFile) {
  const sinExtension = videoFile.replace(/\.mp4$/i, '');
  const guion = sinExtension.indexOf(' - ');
  if (guion === -1) return null;
  const categoria = sinExtension.slice(0, guion);
  const resto = sinExtension.slice(guion + 3).replace(/_\d+$/, '');
  return { categoria, nombre: resto.replace(/_/g, ' ').trim() };
}

// Las categorías se repiten mucho (15 distintas en 1.681 registros), así que
// se guardan una vez y cada ejercicio referencia su índice. Ahorra ~25 KB.
const categorias = [];
const indiceDeCategoria = new Map();
const porId = {};

let sinMapear = 0;
for (const p of propuestos) {
  const entrada = progreso[p.videoFile];
  if (!entrada?.exerciseId) { sinMapear++; continue; }
  const partes = partirNombreDeVideo(p.videoFile);
  if (!partes) { sinMapear++; continue; }

  if (!indiceDeCategoria.has(partes.categoria)) {
    indiceDeCategoria.set(partes.categoria, categorias.length);
    categorias.push(partes.categoria);
  }
  porId[entrada.exerciseId] = [partes.nombre, indiceDeCategoria.get(partes.categoria)];
}

const salida = { categorias, ejercicios: porId };
mkdirSync(resolve(raiz, 'src/data'), { recursive: true });
writeFileSync(
  resolve(raiz, 'src/data/ejerciciosOrigen.json'),
  JSON.stringify(salida),
  'utf8',
);

const total = Object.keys(porId).length;
console.log(`${total} ejercicios con origen (${categorias.length} categorías).`);
if (sinMapear) console.warn(`${sinMapear} propuestos sin ID de Firestore — quedan fuera.`);

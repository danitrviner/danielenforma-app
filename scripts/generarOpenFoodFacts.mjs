/* Genera la copia local de Open Food Facts (D-04) para el escáner y el buscador.
 *
 * Solo lectura sobre Internet y escritura en la carpeta de salida: no toca
 * Firestore ni producción. Descarga el volcado oficial en streaming (1,5 GB
 * comprimido, no se guarda) y se queda con España:
 *   · productos con kcal y los tres macros coherentes → registro completo;
 *   · productos con nombre pero sin datos utilizables → registro INCOMPLETO
 *     (`i`: 1 faltan nutrientes, con `fal`; 2 los datos no cuadran). Sirven para
 *     decirle al atleta qué falta; nunca se apuntan en el diario (D-05).
 * y escribe:
 *   <salida>/indice.json      los N más escaneados (solo completos): [código, nombre, marca]
 *   <salida>/p/NNN.json       todos los registros, repartidos en 1000 trozos
 *   <salida>/n/xxx.json       los completos por las primeras letras de cada palabra (_lib/offPalabras.mjs)
 *   <salida>/resumen.json     cifras de la pasada
 *
 * Uso:
 *   curl -sL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | gunzip | node scripts/generarOpenFoodFacts.mjs <carpeta-salida> [nIndice=30000]
 * (la tubería del sistema frena la lectura; leer el volcado con fetch+zlib dentro de Node agotaba la memoria)
 * Datos de Open Food Facts (ODbL): hay que citarlos en la app.
 */
import { StringDecoder } from 'node:string_decoder';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { trozoDeCodigo, NUM_TROZOS } from './_lib/offBucket.mjs';
import { escribirIndicePalabras } from './_lib/offPalabras.mjs';

const salida = process.argv[2];
const nIndice = Number(process.argv[3] ?? 30000);
if (!salida) { console.error('Falta la carpeta de salida.'); process.exit(1); }

// Columnas de OFF (gramos por 100 g) → clave de la app y factor a su unidad.
// Las claves y unidades son las de src/data/micronutrients.ts (MICRO_META).
const MICROS = [
  ['sodio', 'sodium_100g', 1000], ['potasio', 'potassium_100g', 1000], ['calcio', 'calcium_100g', 1000],
  ['hierro', 'iron_100g', 1000], ['magnesio', 'magnesium_100g', 1000], ['zinc', 'zinc_100g', 1000],
  ['vitA', 'vitamin-a_100g', 1e6], ['vitC', 'vitamin-c_100g', 1000], ['vitD', 'vitamin-d_100g', 1e6],
  ['vitB12', 'vitamin-b12_100g', 1e6], ['folato', 'folates_100g', 1e6], ['omega3', 'omega-3-fat_100g', 1],
];
const EXTRA = [['f', 'fiber_100g'], ['az', 'sugars_100g'], ['sat', 'saturated-fat_100g'], ['sal', 'salt_100g']];

const num = (v) => { if (v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const r2 = (n) => Math.round(n * 100) / 100;
const cifra = (n) => Number(n.toPrecision(3));

const flujo = process.stdin;
// Lector de líneas propio: `readline` acumulaba líneas más rápido de lo que se
// procesaban y reventaba la memoria con las 4,8 millones de filas del volcado.
async function* lineasDe(stream) {
  const dec = new StringDecoder('utf8');
  let resto = '';
  for await (const trozo of stream) {
    const partes = (resto + dec.write(trozo)).split('\n');
    resto = partes.pop();
    for (const l of partes) yield l;
  }
  resto += dec.end();
  if (resto) yield resto;
}
const lineas = lineasDe(flujo);

let col = null; let total = 0; let espana = 0; let validos = 0; let noCuadra = 0; let faltanDatos = 0;
const productos = [];
for await (const linea of lineas) {
  const c = linea.split('\t');
  if (!col) { col = Object.fromEntries(c.map((n, i) => [n, i])); continue; }
  total++;
  if (total % 1_000_000 === 0) console.log(total, espana, validos);
  if (!(c[col.countries_tags] ?? '').split(',').includes('en:spain')) continue;
  espana++;
  // Copia propia: una subcadena de V8 retiene todo el bloque de lectura de donde sale.
  const code = Buffer.from((c[col.code] ?? '').trim()).toString();
  const nombre = (c[col.product_name] ?? '').trim();
  if (!/^\d{8,14}$/.test(code) || !nombre) continue;
  const k = num(c[col['energy-kcal_100g']]); const p = num(c[col.proteins_100g]);
  const h = num(c[col.carbohydrates_100g]); const g = num(c[col.fat_100g]);
  const base = { c: code, n: nombre.slice(0, 120), b: (c[col.brands] ?? '').split(',')[0].trim().slice(0, 60) };
  const qIncompleto = (c[col.quantity] ?? '').trim();
  const incompleto = (i, fal) => ({ ...base, ...(qIncompleto ? { q: qIncompleto.slice(0, 30) } : {}), i, ...(fal ? { fal } : {}) });
  const fal = [['k', k], ['p', p], ['h', h], ['g', g]].filter(([, v]) => v === null || v < 0).map(([x]) => x);
  if (fal.length > 0) {
    faltanDatos++;
    productos.push({ c: code, j: JSON.stringify(incompleto(1, fal)), u: 0, inc: true });
    continue;
  }
  const estimadas = 4 * p + 4 * h + 9 * g;
  if (k > 950 || p + h + g > 105 || (Math.abs(k - estimadas) > 50 && Math.abs(k - estimadas) > 0.35 * Math.max(k, estimadas))) {
    noCuadra++;
    productos.push({ c: code, j: JSON.stringify(incompleto(2)), u: 0, inc: true });
    continue;
  }
  validos++;
  const r = { c: code, n: nombre.slice(0, 120), b: (c[col.brands] ?? '').split(',')[0].trim().slice(0, 60), k: Math.round(k), p: cifra(p), h: cifra(h), g: cifra(g) };
  const q = (c[col.quantity] ?? '').trim(); if (q) r.q = q.slice(0, 30);
  const s = num(c[col.serving_quantity]); if (s && s > 0 && s < 2000) r.s = s;
  for (const [clave, columna] of EXTRA) { const v = num(c[col[columna]]); if (v !== null && v >= 0 && v <= 100) r[clave] = cifra(v); }
  const m = {};
  for (const [clave, columna, factor] of MICROS) {
    const v = num(c[col[columna]]);
    if (v !== null && v > 0 && v <= 100) m[clave] = cifra(v * factor);
  }
  if (Object.keys(m).length) r.m = m;
  const ns = (c[col.nutriscore_grade] ?? '').trim(); if (/^[a-e]$/.test(ns)) r.ns = ns;
  // Se guarda ya serializado: las subcadenas de V8 retienen la línea entera del
  // CSV (~200 columnas), y con 250.000 productos eso son GB.
  productos.push({ c: code, j: JSON.stringify(r), u: num(c[col.unique_scans_n]) ?? 0, micros: !!r.m, fibra: r.f !== undefined, sal: r.sal !== undefined });
  
}

productos.sort((a, b) => b.u - a.u);
mkdirSync(join(salida, 'p'), { recursive: true });
const trozos = Array.from({ length: NUM_TROZOS }, () => []);
for (const { c, j } of productos) trozos[trozoDeCodigo(c)].push(`${JSON.stringify(c)}:${j}`);
trozos.forEach((t, i) => writeFileSync(join(salida, 'p', `${String(i).padStart(3, '0')}.json`), `{${t.join(',')}}`));
const indice = productos.filter(p => !p.inc).slice(0, nIndice).map(({ j }) => { const r = JSON.parse(j); return [r.c, r.n, r.b]; });
writeFileSync(join(salida, 'indice.json'), JSON.stringify({ v: 1, fecha: new Date().toISOString().slice(0, 10), items: indice }));
const conMicros = productos.filter(p => p.micros).length;
const resumen = { fecha: new Date().toISOString(), total, espana, validos, noCuadra, faltanDatos, enIndice: indice.length, conMicros,
  conFibra: productos.filter(p => p.fibra).length, conSal: productos.filter(p => p.sal).length };
writeFileSync(join(salida, 'resumen.json'), JSON.stringify(resumen, null, 2));
console.log('Índice por palabras:', escribirIndicePalabras(salida));
console.log('FIN', resumen);

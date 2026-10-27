/**
 * Bloque B (26-10-2026) · Vincula AUTOMÁTICAMENTE todas las recetas del
 * recetario al catálogo de alimentos por 100 g, para que el generador de menús
 * pueda ajustar cada alimento por separado (solo el arroz, solo el pollo…).
 *
 * Solo se vinculan las recetas en las que TODO lo que cuenta empareja con el
 * catálogo con confianza alta o es un sinónimo revisado (`vinculoAutomatico`);
 * las demás quedan en una lista de dudas para revisar y siguen escalándose
 * enteras. Las que ya tienen vínculo no se tocan… salvo con --revincular.
 *
 * --revincular (revisión de motores 26-10-2026): recalcula el vínculo de las
 * recetas ya vinculadas que NO son Rápidas (`basica`, revisadas a mano). La
 * que ahora da duda pierde el vínculo y recupera sus macros de `antes`; la que
 * cambia de alimento o de porCien se reescribe. Deja en scripts/out/ un CSV con
 * cada receta que cambia y otro con los pares ingrediente → alimento que
 * cambian, con cuántas recetas tocan.
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
 *   npx tsx scripts/vincularTodas.ts [--catalogo-json catalogo.json] [--revincular] [--aplicar] [--firestore]
 *
 * Sin --catalogo-json, el catálogo se lee de Firestore (GOOGLE_APPLICATION_CREDENTIALS).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cargarCatalogoAlimentos } from './_lib/cargarCatalogoAlimentos';
import { abrirDb } from './_lib/firestoreDb.mjs';
import { FieldValue } from 'firebase-admin/firestore';
import { mapRecipe } from './lib/mapearReceta.mjs';
import { aplicarVinculo, calcularIngredientes, candidatosDe, emparejarRevisado, mismoResultado, palabrasDe, vinculoAutomatico, type RecetaCruda } from '../src/utils/recetaVinculada';
import type { AlimentoCatalogo } from '../src/utils/catalogoAlimentos';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, '../public/recetas');
const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const FIRESTORE = args.includes('--firestore');
const REVINCULAR = args.includes('--revincular');
const iJson = args.indexOf('--catalogo-json');

const catalogo: AlimentoCatalogo[] = iJson >= 0
  ? JSON.parse(readFileSync(resolve(args[iJson + 1]), 'utf8'))
  : (await cargarCatalogoAlimentos([])).lista;
const porId = new Map(catalogo.map(a => [a.id, a]));
const ahora = new Date().toISOString();

let total = 0, yaVinculadas = 0, vinculadas = 0, revinculadas = 0, desvinculadas = 0, iguales = 0;
/** Todas las recetas tal y como quedan en los JSON: con --firestore se suben
 *  todas, también las que no tienen vínculo, para que una que lo perdió en
 *  un pase anterior no se quede con el vínculo viejo en su documento. */
const todas: RecetaCruda[] = [];
const dudas = new Map<string, number>();
const cambiadas: RecetaCruda[] = [];
/** Las que ya traían vínculo y no cambian: se suben también, para que Firestore quede igual que los JSON. */
const conVinculo: RecetaCruda[] = [];
/** --revincular: una fila por receta que cambia. */
const filasRecetas: string[][] = [['receta', 'nombre', 'que', 'kcal_antes', 'kcal_despues', 'ingredientes_que_cambian']];
/** --revincular: ingrediente → alimento antes → alimento ahora, con cuántas recetas lo tienen. */
const pares = new Map<string, number>();

/** Quita el vínculo y devuelve los macros a los de «antes» (la receta queda como antes de vincularla). */
function desvincular(receta: RecetaCruda): RecetaCruda {
  const { vinculo, ...resto } = receta;
  const a = vinculo?.antes;
  if (!a) return resto as RecetaCruda;
  return { ...resto, macros: a.macros ?? undefined, kcal: a.kcal ?? undefined, weight: a.weight ?? undefined } as RecetaCruda;
}

/** Nombre del ingrediente n de la receta. */
const nombreIng = (receta: RecetaCruda, n: number) => receta.ingredients[n]?.name ?? `#${n}`;

/* Desempate por las kcal de la receta (Dani, 26-10-2026: «¿no lo puedes saber
   tú con las kcal?»). Si TODO menos UN ingrediente está vinculado y ese tiene
   varios candidatos (garbanzo seco o cocido, arándano fresco o deshidratado,
   coco natural o rallado…), se prueba cada uno y gana el que deja las kcal de
   la receta más cerca de las que declara el recetario. Solo se acepta si el
   error queda dentro del margen y el segundo mejor está claramente peor. */
const MARGEN_KCAL_RESOLVER = 30;
const MARGEN_PCT_RESOLVER = 0.07;
/** Palabras que distinguen presentaciones del MISMO alimento. Un candidato solo
 *  entra en el desempate si ingrediente y alimento se diferencian en estas:
 *  «Garbanzo» puede ser garbanzo seco o cocido, nunca harina de garbanzo;
 *  «Arándano rojo» puede ser el fresco o el deshidratado, nunca la mermelada. */
const VARIANTES = new Set(['deshidratado', 'deshidratada', 'natural', 'rallado', 'rallada', 'lata', 'conserva', 'bote', 'escurrido', 'escurrida',
  'congelado', 'congelada', 'fresco', 'fresca', 'seco', 'seca', 'cocido', 'cocida', 'crudo', 'cruda', 'agua', 'entero', 'entera', 'troceado', 'troceada',
  'copo', 'grano', 'pelado', 'pelada', 'vasito', 'envasado', 'envasada', 'integral']);
function mismoAlimento(ingrediente: string, alimento: string): boolean {
  const a = new Set(palabrasDe(ingrediente));
  const b = new Set(palabrasDe(alimento));
  const distintas = [...a].filter(w => !b.has(w)).concat([...b].filter(w => !a.has(w)));
  return distintas.every(w => VARIANTES.has(w));
}
let resueltasPorKcal = 0;
const paresPorKcal = new Map<string, number>();
function resolverPorKcal(receta: RecetaCruda): ReturnType<typeof vinculoAutomatico> {
  const v = vinculoAutomatico(receta, catalogo);
  if (!('dudosos' in v) || v.dudosos.length !== 1) return v;
  const kcalDeclaradas = receta.vinculo?.antes?.kcal ?? receta.kcal;
  if (!kcalDeclaradas || kcalDeclaradas <= 0) return v;
  const n = receta.ingredients.findIndex(i => i.name === v.dudosos[0]);
  if (n < 0) return v;
  const candidatos = candidatosDe(v.dudosos[0], catalogo).filter(c => mismoAlimento(v.dudosos[0], c.alimento.nombre));
  if (candidatos.length === 0) return v;
  const pruebas = candidatos.map(c => {
    const vv = vinculoAutomatico(receta, catalogo, new Map([[n, c.alimento]]));
    if ('dudosos' in vv) return null;
    const calc = calcularIngredientes(vv.ingredientes, porId);
    if (!calc.ok) return null;
    return { alimento: c.alimento, error: Math.abs(calc.kcal - kcalDeclaradas), v: vv };
  }).filter((p): p is NonNullable<typeof p> => p !== null).sort((a, b) => a.error - b.error);
  if (pruebas.length === 0) return v;
  const [mejor, segundo] = pruebas;
  const margen = Math.max(MARGEN_KCAL_RESOLVER, kcalDeclaradas * MARGEN_PCT_RESOLVER);
  if (mejor.error > margen) return v;
  if (segundo && segundo.alimento.id !== mejor.alimento.id && segundo.error < mejor.error * 2 && segundo.error <= margen) return v;
  resueltasPorKcal++;
  const clave = `${v.dudosos[0]};${mejor.alimento.id}`;
  paresPorKcal.set(clave, (paresPorKcal.get(clave) ?? 0) + 1);
  return mejor.v;
}

for (const archivo of readdirSync(DIR).filter(f => /^recetas_.*\.json$/.test(f)).sort()) {
  const ruta = resolve(DIR, archivo);
  const texto = readFileSync(ruta, 'utf8');
  const json = JSON.parse(texto) as { recipes: RecetaCruda[] };
  let tocado = false;
  json.recipes = json.recipes.map(receta => {
    total++;
    todas.push(receta);
    if (receta.vinculo && (!REVINCULAR || receta.basica === true)) { yaVinculadas++; conVinculo.push(receta); return receta; }
    const v = resolverPorKcal(receta);
    if ('dudosos' in v) {
      for (const d of v.dudosos) dudas.set(d, (dudas.get(d) ?? 0) + 1);
      if (!receta.vinculo) return receta;
      // Estaba vinculada con las reglas viejas y ahora no pasa: fuera el vínculo.
      desvinculadas++;
      tocado = true;
      const sinVinculo = desvincular(receta);
      for (const i of receta.vinculo.ingredientes) {
        if (!i.alimentoId) continue;
        const ahoraId = v.dudosos.includes(nombreIng(receta, i.n)) ? '(duda)' : emparejarRevisado(nombreIng(receta, i.n), catalogo).alimento?.id ?? '(duda)';
        const clave = `${nombreIng(receta, i.n)};${i.alimentoId};${ahoraId}`;
        if (i.alimentoId !== ahoraId) pares.set(clave, (pares.get(clave) ?? 0) + 1);
      }
      filasRecetas.push([receta.id, receta.name, 'se desvincula', String(receta.kcal ?? ''), String(sinVinculo.kcal ?? ''), v.dudosos.join(' | ')]);
      cambiadas.push(sinVinculo);
      return sinVinculo;
    }
    const base = receta.vinculo ? desvincular(receta) : receta;
    // El «antes» original se conserva aunque se recalcule.
    const conAntes = receta.vinculo ? { ...base, vinculo: { ...receta.vinculo } } : base;
    const { receta: nueva, calculo } = aplicarVinculo(conAntes, (v as { ingredientes: Parameters<typeof aplicarVinculo>[1] }).ingredientes, porId, ahora);
    if (!calculo.ok) return receta;
    const vinculoPrevio = receta.vinculo;
    if (vinculoPrevio) {
      if (mismoResultado(receta, nueva)) { iguales++; conVinculo.push(receta); return receta; }
      revinculadas++;
      const cambios: string[] = [];
      for (const i of nueva.vinculo!.ingredientes) {
        const previo = vinculoPrevio.ingredientes.find(x => x.n === i.n);
        const antesId = previo?.alimentoId ?? null;
        if (antesId !== i.alimentoId) {
          const clave = `${nombreIng(receta, i.n)};${antesId ?? '(no cuenta)'};${i.alimentoId ?? '(no cuenta)'}`;
          pares.set(clave, (pares.get(clave) ?? 0) + 1);
          cambios.push(`${nombreIng(receta, i.n)}: ${antesId ?? '—'} → ${i.alimentoId ?? '—'}`);
        } else if (previo && JSON.stringify(previo.porCien ?? null) !== JSON.stringify(i.porCien ?? null)) {
          cambios.push(`${nombreIng(receta, i.n)}: porCien`);
        } else if (previo && (previo.min !== i.min || previo.max !== i.max || previo.gramos !== i.gramos)) {
          cambios.push(`${nombreIng(receta, i.n)}: rango ${previo.min}-${previo.max} → ${i.min}-${i.max}`);
        }
      }
      filasRecetas.push([receta.id, receta.name, 'cambia', String(receta.kcal ?? ''), String(nueva.kcal ?? ''), cambios.join(' | ')]);
    } else {
      vinculadas++;
    }
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

if (REVINCULAR) {
  const csv = (filas: string[][]) => '\ufeff' + filas.map(f => f.map(c => c.includes(';') || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c).join(';')).join('\n') + '\n';
  const rutaRecetas = resolve(__dirname, 'out/revincular-recetas.csv');
  const rutaPares = resolve(__dirname, 'out/revincular-pares.csv');
  writeFileSync(rutaRecetas, csv(filasRecetas));
  writeFileSync(rutaPares, csv([['ingrediente', 'alimento_antes', 'alimento_ahora', 'recetas'],
    ...[...pares.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => [...k.split(';'), String(c)])]));
  console.log(`Recetas: ${total} · Rápidas (no se tocan): ${yaVinculadas} · siguen igual: ${iguales} · cambian de vínculo: ${revinculadas} · se desvinculan: ${desvinculadas} · se vinculan nuevas: ${vinculadas} · sin vincular al final: ${total - yaVinculadas - iguales - revinculadas - vinculadas}`);
  console.log(`Detalle: ${rutaRecetas} · pares que cambian: ${pares.size} → ${rutaPares}`);
} else {
  console.log(`Recetas: ${total} · ya vinculadas: ${yaVinculadas} · se vinculan ahora: ${vinculadas} · quedan sin vincular: ${total - yaVinculadas - vinculadas}`);
}
console.log(`Dudas: ${dudas.size} ingredientes distintos → ${informe}`);
if (resueltasPorKcal > 0) {
  const rutaKcal = resolve(__dirname, 'out/vincular-por-kcal.csv');
  writeFileSync(rutaKcal, '\ufeffingrediente;alimento;recetas\n' + [...paresPorKcal.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k};${c}`).join('\n') + '\n');
  console.log(`Desempatadas por las kcal de la receta: ${resueltasPorKcal} → ${rutaKcal}`);
}

if (FIRESTORE) {
  if (!APLICAR) { console.log('--firestore necesita --aplicar.'); process.exit(1); }
  const sa = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!sa) { console.error('Falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1); }
  const db = abrirDb(JSON.parse(readFileSync(resolve(sa), 'utf8')));
  // Solo lo que cambia al vincular: macros, kcal, peso, intercambios y vínculo.
  // TODAS las recetas, tal y como quedan en los JSON (idempotente): las sin
  // vínculo lo borran del documento, porque pueden haberlo perdido en un pase
  // anterior y Firestore aún lo tendría.
  const porIdReceta = new Map<string, RecetaCruda>();
  for (const r of [...todas, ...cambiadas]) porIdReceta.set(r.id, r);
  const subir = [...porIdReceta.values()];
  let sinVinculo = 0;
  for (let i = 0; i < subir.length; i += 400) {
    const lote = db.batch();
    for (const r of subir.slice(i, i + 400)) {
      const d = mapRecipe(r);
      if (!r.vinculo) sinVinculo++;
      lote.set(db.collection('recipes').doc(r.id), {
        macros: d.macros, kcal: d.kcal, weight: d.weight, exchanges: d.exchanges,
        vinculo: r.vinculo ? d.vinculo : FieldValue.delete(),
      }, { merge: true });
    }
    await lote.commit();
  }
  console.log(`Firestore: ${subir.length} recetas actualizadas (${sinVinculo} sin vínculo, con el vínculo borrado del documento).`);
} else if (!APLICAR) {
  console.log('EN SECO: no se ha escrito nada. --aplicar reescribe los JSON; --aplicar --firestore sube además las recetas.');
}

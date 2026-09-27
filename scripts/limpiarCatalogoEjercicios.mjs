/**
 * Limpieza del catálogo de ejercicios (ver plan: limpieza-catalogo-ejercicios).
 *
 * Lee scripts/out/ejercicios-catalogo.json y genera, SIN tocar Firestore:
 *   - scripts/out/ejercicios-catalogo-limpio.json  (catálogo final)
 *   - scripts/out/mapaIdsEjercicios.json           ({ idViejo: idNuevo|null })
 *   - scripts/out/reporte-limpieza-ejercicios.md    (para revisar con Dani)
 *
 * Cambios aplicados, en orden:
 *  A) Fix de muscleGroup mal etiquetado (Remo en T / Remo Gironda prono "sin
 *     retracción" -> dorsal; familia "dominante cadera" de Belt squat / Pin
 *     squat 90º / Pin squat 90º low bar / Sentadilla hack pendular -> gluteo).
 *  B) Fix de nombres rotos (Dominadas estrictas agarre supino).
 *  C) Fix de typo "Sentadilla safety" -> "Sentadilla safety bar" (para que
 *     empareje con el resto de la familia safety bar).
 *  D) Goma: por cada ejercicio base, se queda 1 variante (se prefiere el tramo
 *     25-35 kg si existe) y se renombra sin mencionar el peso.
 *  E) Dorsiflexión "mayor/menor": se queda la variante "mayor", sin sufijo.
 *  F) Peso muerto "mayor flexión cadera/rodilla": se queda la variante
 *     "cadera", sin sufijo (los huérfanos "Peso muerto rumano en multipower",
 *     que no tienen par de rodilla, se quedan igual pero también pierden el
 *     sufijo).
 *  G) Caja torácica: se borra "amplia", se queda "plana" sin el sufijo.
 *
 * "Dominante cadera/rodilla" (excepto el fix de muscleGroup del punto A) NO
 * se colapsa: Dani confirmó que ambas variantes se quedan porque trabajan
 * músculos distintos, igual que Remo en T con/sin retracción escapular.
 *
 * Uso: node scripts/limpiarCatalogoEjercicios.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN_PATH = resolve(__dirname, 'out/ejercicios-catalogo.json');
const OUT_CATALOGO = resolve(__dirname, 'out/ejercicios-catalogo-limpio.json');
const OUT_MAPA = resolve(__dirname, 'out/mapaIdsEjercicios.json');
const OUT_REPORTE = resolve(__dirname, 'out/reporte-limpieza-ejercicios.md');

const original = JSON.parse(readFileSync(IN_PATH, 'utf8'));

// mapaIds[idViejo] = idNuevo (mismo id si solo cambia metadata, id del
// superviviente si el ejercicio se fusiona/borra).
const mapaIds = {};
const motivos = {}; // idViejo -> motivo humano (para el reporte)
for (const e of original) mapaIds[e.id] = e.id; // por defecto: no cambia

const limpiarEspacios = (s) => s.replace(/\s{2,}/g, ' ').replace(/\(\s*\)/g, '').replace(/\s+,/g, ',').replace(/,\s*\)/g, ')').replace(/\(\s*,/g, '(').trim();

let ejercicios = original.map((e) => ({ ...e }));

// ---------------------------------------------------------------------------
// A) Fix muscleGroup mal etiquetado
// ---------------------------------------------------------------------------
const FIX_MUSCLE_GROUP = {
  'sys_remo-en-t-agarre-prono-sin-retraccion': 'dorsal',
  'sys_remo-en-t-agarre-prono-straps-sin-retraccion': 'dorsal',
  'sys_remo-gironda-agarre-ancho-prono-sin-retraccion': 'dorsal',
  'sys_remo-gironda-agarre-ancho-prono-straps-sin-retraccion': 'dorsal',
  'sys_belt-squat-dominante-de-cadera-mayor-dorsiflexion': 'gluteo',
  'sys_belt-squat-dominante-de-cadera-menor-dorsiflexion': 'gluteo',
  'sys_pin-squat-90-dominante-cadera-mayor-dorsiflexion': 'gluteo',
  'sys_pin-squat-90-dominante-cadera-menor-dorsiflexion': 'gluteo',
  'sys_pin-squat-90-low-bar-dominante-de-cadera-mayor-dorsiflexion': 'gluteo',
  'sys_pin-squat-90-low-bar-dominante-de-cadera-menor-dorsiflexion': 'gluteo',
  'sys_sentadilla-hack-pendular-pies-abajo-dominante-cadera': 'gluteo',
  'sys_sentadilla-hack-pendular-pies-arriba-dominante-cadera': 'gluteo',
};
for (const e of ejercicios) {
  if (FIX_MUSCLE_GROUP[e.id]) {
    motivos[e.id] = (motivos[e.id] || []).concat(
      `muscleGroup ${e.muscleGroup} -> ${FIX_MUSCLE_GROUP[e.id]}`,
    );
    e.muscleGroup = FIX_MUSCLE_GROUP[e.id];
  }
}

// ---------------------------------------------------------------------------
// B) Fix de nombres rotos (Dominadas estrictas agarre supino)
// ---------------------------------------------------------------------------
const FIX_NOMBRE = {
  'sys_dominadas-estrictas-agarre-supino-sin-retraccion-con-retraccion':
    'Dominadas estrictas agarre supino (con retracción)',
  'sys_dominadas-estrictas-agarre-supino-sin-retraccion-sin-retraccion':
    'Dominadas estrictas agarre supino (sin retracción)',
};
for (const e of ejercicios) {
  if (FIX_NOMBRE[e.id]) {
    motivos[e.id] = (motivos[e.id] || []).concat(`nombre roto -> "${FIX_NOMBRE[e.id]}"`);
    e.name = FIX_NOMBRE[e.id];
  }
}

// ---------------------------------------------------------------------------
// C) Fix typo "Sentadilla safety" -> "Sentadilla safety bar"
// ---------------------------------------------------------------------------
for (const e of ejercicios) {
  if (/^Sentadilla safety(?! bar)/.test(e.name)) {
    const antes = e.name;
    e.name = e.name.replace(/^Sentadilla safety(?! bar)/, 'Sentadilla safety bar');
    motivos[e.id] = (motivos[e.id] || []).concat(`typo nombre: "${antes}" -> "${e.name}"`);
  }
}

// ---------------------------------------------------------------------------
// Helpers de fusión: agrupa por "nombre base" tras quitar un patrón, elige un
// superviviente, marca los demás para borrar y actualiza mapaIds.
// ---------------------------------------------------------------------------
function fusionarGrupo(lista, elegirSuperviviente, motivo) {
  const survivorId = elegirSuperviviente(lista).id;
  for (const e of lista) {
    if (e.id !== survivorId) {
      mapaIds[e.id] = survivorId;
      motivos[e.id] = (motivos[e.id] || []).concat(`${motivo} -> fusionado en ${survivorId}`);
    }
  }
  return survivorId;
}

// ---------------------------------------------------------------------------
// D) Goma: colapsar tramos de peso a 1 variante por movimiento base
// ---------------------------------------------------------------------------
{
  const conBracket = ejercicios.filter((e) => /\(\s*\d+-\d+\s*kg\s*\)/i.test(e.name));
  const baseName = (name) => name.replace(/\s*\(\s*\d+-\d+\s*kg\s*\)/gi, '').replace(/\s{2,}/g, ' ').trim();
  const grupos = new Map();
  for (const e of conBracket) {
    const b = baseName(e.name);
    if (!grupos.has(b)) grupos.set(b, []);
    grupos.get(b).push(e);
  }
  for (const [base, lista] of grupos) {
    const survivorId = fusionarGrupo(
      lista,
      (l) => l.find((e) => /25-35\s*kg/i.test(e.name)) || l[0],
      'goma: tramo de peso duplicado',
    );
    const survivor = ejercicios.find((e) => e.id === survivorId);
    survivor.name = limpiarEspacios(survivor.name.replace(/\s*\(\s*\d+-\d+\s*kg\s*\)/gi, ''));
  }
}

// ---------------------------------------------------------------------------
// E) Dorsiflexión "mayor/menor": quedarse con "mayor", quitar sufijo siempre
// ---------------------------------------------------------------------------
{
  const vivos = () => ejercicios.filter((e) => mapaIds[e.id] === e.id);
  const conDorsi = vivos().filter((e) => /dorsiflexi/i.test(e.name));
  const baseName = (name) =>
    name
      .replace(/,?\s*(mayor|menor)\s+dorsiflexi[oó]n/i, '')
      .replace(/[()]/g, (m, off, str) => (/[a-zA-Z0-9]/.test(str.slice(off - 3, off)) ? m : ''))
      .trim();
  // Normaliza: si tras quitar el sufijo queda un paréntesis vacío o huérfano, se limpia después con limpiarEspacios.
  const grupos = new Map();
  for (const e of conDorsi) {
    const b = limpiarEspacios(
      e.name.replace(/,?\s*(mayor|menor)\s+dorsiflexi[oó]n/gi, ''),
    );
    if (!grupos.has(b)) grupos.set(b, []);
    grupos.get(b).push(e);
  }
  for (const [base, lista] of grupos) {
    const survivorId = fusionarGrupo(
      lista,
      (l) => l.find((e) => /mayor\s+dorsiflexi/i.test(e.name)) || l[0],
      'dorsiflexión mayor/menor duplicado',
    );
    const survivor = ejercicios.find((e) => e.id === survivorId);
    survivor.name = limpiarEspacios(
      survivor.name.replace(/,?\s*(mayor|menor)\s+dorsiflexi[oó]n/gi, ''),
    );
  }
}

// ---------------------------------------------------------------------------
// F) Peso muerto "mayor flexión cadera/rodilla": quedarse con "cadera"
// ---------------------------------------------------------------------------
{
  const vivos = () => ejercicios.filter((e) => mapaIds[e.id] === e.id);
  const conFlexion = vivos().filter((e) => /mayor\s+flexi[oó]n\s+(de\s+)?(cadera|rodilla)/i.test(e.name));
  const baseName = (name) =>
    limpiarEspacios(name.replace(/,?\s*mayor\s+flexi[oó]n\s+(de\s+)?(cadera|rodilla)/gi, ''));
  const grupos = new Map();
  for (const e of conFlexion) {
    const b = baseName(e.name);
    if (!grupos.has(b)) grupos.set(b, []);
    grupos.get(b).push(e);
  }
  for (const [base, lista] of grupos) {
    const survivorId = fusionarGrupo(
      lista,
      (l) => l.find((e) => /cadera/i.test(e.name)) || l[0],
      'peso muerto: flexión cadera/rodilla duplicado',
    );
    const survivor = ejercicios.find((e) => e.id === survivorId);
    survivor.name = baseName(survivor.name);
  }
}

// ---------------------------------------------------------------------------
// G) Caja torácica: borrar "amplia", quedarse con "plana" sin sufijo
// ---------------------------------------------------------------------------
{
  const vivos = () => ejercicios.filter((e) => mapaIds[e.id] === e.id);
  const conCaja = vivos().filter((e) => /caja tor[aá]cica/i.test(e.name));
  const baseName = (name) => limpiarEspacios(name.replace(/,?\s*\(?\s*caja tor[aá]cica\s+(plana|amplia)\s*\)?/gi, ''));
  const grupos = new Map();
  for (const e of conCaja) {
    const b = baseName(e.name);
    if (!grupos.has(b)) grupos.set(b, []);
    grupos.get(b).push(e);
  }
  for (const [base, lista] of grupos) {
    const plana = lista.find((e) => /plana/i.test(e.name));
    const amplia = lista.find((e) => /amplia/i.test(e.name));
    if (plana && amplia) {
      // Se borra el doc "amplia", pero el historial de cualquier atleta que
      // la tenga registrada se redirige a la "plana" hermana (mismo
      // movimiento base) en vez de quedar huérfano.
      mapaIds[amplia.id] = plana.id;
      motivos[amplia.id] = (motivos[amplia.id] || []).concat('caja torácica amplia: se elimina, historial se redirige a la versión plana');
      plana.name = baseName(plana.name);
      motivos[plana.id] = (motivos[plana.id] || []).concat('caja torácica plana: se queda, se quita el sufijo del nombre');
    }
  }
}

// ---------------------------------------------------------------------------
// Construir catálogo final: eliminar ids que quedaron marcados con null,
// eliminar ids que se fusionaron en otro (mapaIds[id] !== id && !== null),
// conservar el resto (posiblemente con name/muscleGroup actualizados).
// ---------------------------------------------------------------------------
const finalIds = new Set(
  Object.entries(mapaIds)
    .filter(([id, destino]) => destino === id)
    .map(([id]) => id),
);
const catalogoFinal = ejercicios.filter((e) => finalIds.has(e.id));

// Limpieza cosmética final: colapsa dobles espacios que ya existían en el
// catálogo original (ej. "Remo en TRX  straps"), independiente de los
// cambios anteriores.
for (const e of catalogoFinal) {
  const antes = e.name;
  e.name = limpiarEspacios(e.name);
  if (e.name !== antes) motivos[e.id] = (motivos[e.id] || []).concat(`espacios dobles: "${antes}" -> "${e.name}"`);
}

// Ids que se fusionan en otro id vivo (no null) deben resolver la cadena por
// si el superviviente de un grupo fue a su vez fusionado en otro grupo.
function resolver(id) {
  let actual = id;
  let saltos = 0;
  while (mapaIds[actual] !== actual && mapaIds[actual] !== null && saltos < 10) {
    actual = mapaIds[actual];
    saltos++;
  }
  return mapaIds[actual] === null ? null : actual;
}
const mapaIdsResuelto = {};
for (const id of Object.keys(mapaIds)) mapaIdsResuelto[id] = resolver(id);

// ---------------------------------------------------------------------------
// Reporte
// ---------------------------------------------------------------------------
const seQuedan = catalogoFinal.map((e) => `- \`${e.id}\` — ${e.name} _(${e.muscleGroup ?? 'sin grupo'})_`);
const seVan = Object.entries(mapaIdsResuelto)
  .filter(([id, destino]) => destino !== id)
  .map(([id, destino]) => {
    const original_ = original.find((e) => e.id === id);
    const motivo = (motivos[id] || []).join('; ') || 'fusionado';
    const destinoNombre = destino ? catalogoFinal.find((e) => e.id === destino)?.name : '(sin equivalente)';
    return `- \`${id}\` — ${original_.name}  →  ${destino ? `\`${destino}\` (${destinoNombre})` : '**se elimina**'} _(${motivo})_`;
  });
const soloMetadata = Object.keys(motivos).filter((id) => mapaIdsResuelto[id] === id);

const reporte = `# Reporte de limpieza del catálogo de ejercicios

Generado a partir de \`scripts/out/ejercicios-catalogo.json\` (${original.length} ejercicios).

## Resumen
- Catálogo final: **${catalogoFinal.length}** ejercicios (antes: ${original.length})
- Se eliminan/fusionan: **${Object.values(mapaIdsResuelto).filter((d, i) => Object.keys(mapaIdsResuelto)[i] !== d).length - 0}** ids
- Corregidos solo en metadata (mismo id, cambia \`muscleGroup\` o el nombre): **${soloMetadata.length}**

## Ejercicios que SE VAN (${seVan.length})
${seVan.join('\n')}

## Correcciones de metadata sin cambio de id (${soloMetadata.length})
${soloMetadata.map((id) => `- \`${id}\` — ${(motivos[id] || []).join('; ')}`).join('\n')}

## Ejercicios que SE QUEDAN (${seQuedan.length})
${seQuedan.join('\n')}
`;

writeFileSync(OUT_CATALOGO, JSON.stringify(catalogoFinal, null, 2));
writeFileSync(OUT_MAPA, JSON.stringify(mapaIdsResuelto, null, 2));
writeFileSync(OUT_REPORTE, reporte);

console.log(`Catálogo final: ${catalogoFinal.length} ejercicios (de ${original.length})`);
console.log(`Se van: ${seVan.length}`);
console.log(`Solo metadata corregida: ${soloMetadata.length}`);
console.log(`\nEscrito:\n  ${OUT_CATALOGO}\n  ${OUT_MAPA}\n  ${OUT_REPORTE}`);

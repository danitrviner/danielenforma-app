/**
 * Genera el borrador de ejercicios nuevos a partir de los 1.681 vídeos
 * (tarea 17, ampliado). NO escribe nada en Firestore ni en Storage — es el
 * paso "revisa esto antes de que toquemos nada" que pide el plan.
 *
 * Traduce cada nombre en inglés con un diccionario propio (no una API de
 * traducción) porque el vocabulario es cerrado y muy repetitivo —660
 * palabras distintas, "dumbbell" sola aparece 262 veces— y una API genérica
 * no sabe que en este contexto "raise" es "elevación" y no "aumento". El
 * diccionario vive en scripts/lib/diccionarioEjercicios.mjs, separado en
 * categorías (equipo, postura, movimiento, parte del cuerpo, modificador)
 * para poder reordenar la frase al estilo español («Curl de bíceps con
 * barra», no «Barra bíceps curl»).
 *
 * Toda palabra que NO esté en el diccionario se dice en el propio nombre
 * generado (entre corchetes, en inglés) y el registro se marca
 * `necesitaRevision: true` — no se inventa una traducción a ciegas.
 *
 * Uso:
 *   node scripts/traducirEjercicios.mjs
 *
 * Requiere haber corrido antes scripts/diagnosticoVideos.mjs (lee su
 * catalogo-videos.json). Escribe scripts/out/ejercicios-propuestos.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  EQUIPO, POSTURA, LATERALIDAD, MOVIMIENTO, PARTE, MODIFICADOR, IGNORAR,
} from './lib/diccionarioEjercicios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, 'out');
const CATALOGO_PATH = resolve(OUT_DIR, 'catalogo-videos.json');

// Grupo muscular del nombre del vídeo (español) → MuscleGroup tipado
// (src/types.ts). Solo se rellena cuando el mapeo es inequívoco — "Espalda"
// no dice si es dorsal o trapecio, "Hombros" no dice qué cabeza del
// deltoides, así que esos se dejan sin `muscleGroup` (queda solo
// `primaryFocus`, en texto libre, igual que ya hace SYSTEM_EXERCISES).
const MUSCLE_GROUP_MAP = {
  'Antebrazos': 'antebrazo',
  'Bíceps': 'biceps',
  'Core': 'core',
  'Cuádriceps': 'cuadriceps',
  'Glúteos': 'gluteo',
  'Isquiotibiales': 'isquios',
  'Pantorrillas': 'gemelo',
  'Pecho': 'pecho',
  'Tríceps': 'triceps',
};

const PALABRAS_ESTIRAMIENTO = new Set(['stretch', 'mobilization', 'mobility', 'yoga']);
const PALABRAS_PLIOMETRIA = new Set(['jump', 'jumps', 'hop', 'hops', 'bound', 'plyo', 'plyometric']);

function capitalizar(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clasificarPalabra(palabra) {
  if (IGNORAR.has(palabra)) return { categoria: 'ignorar' };
  if (/^\d+$/.test(palabra)) return { categoria: 'ignorar' }; // ángulos sueltos (45, 90…)
  if (MOVIMIENTO[palabra]) return { categoria: 'movimiento', es: MOVIMIENTO[palabra] };
  if (PARTE[palabra]) return { categoria: 'parte', es: PARTE[palabra] };
  if (EQUIPO[palabra]) return { categoria: 'equipo', es: EQUIPO[palabra] };
  if (POSTURA[palabra]) return { categoria: 'postura', es: POSTURA[palabra] };
  if (LATERALIDAD[palabra]) return { categoria: 'lateralidad', es: LATERALIDAD[palabra] };
  if (MODIFICADOR[palabra]) return { categoria: 'modificador', es: MODIFICADOR[palabra] };
  return { categoria: 'desconocida' };
}

function traducirNombre(englishName) {
  const palabras = englishName.toLowerCase().split(/\s+/).filter(Boolean);
  const bolsas = { movimiento: [], parte: [], equipo: [], postura: [], lateralidad: [], modificador: [] };
  const sinTraducir = [];

  for (const palabra of palabras) {
    const { categoria, es } = clasificarPalabra(palabra);
    if (categoria === 'ignorar') continue;
    if (categoria === 'desconocida') { sinTraducir.push(palabra); continue; }
    if (!bolsas[categoria].includes(es)) bolsas[categoria].push(es);
  }

  const cabeza = bolsas.movimiento.length > 0
    ? bolsas.movimiento.join(' ')
    : (bolsas.parte.length > 0 ? 'Ejercicio' : 'Ejercicio');

  const partes = [];
  partes.push(capitalizar(cabeza));
  if (bolsas.parte.length > 0 && bolsas.movimiento.length > 0) {
    partes.push(`de ${bolsas.parte.join(' y ')}`);
  } else if (bolsas.parte.length > 0) {
    partes.push(bolsas.parte.join(' y '));
  }
  if (bolsas.postura.length > 0) partes.push(bolsas.postura.join(', '));
  if (bolsas.lateralidad.length > 0) partes.push(bolsas.lateralidad.join(' '));
  if (bolsas.equipo.length > 0) partes.push(`con ${bolsas.equipo.join(' y ')}`);
  if (bolsas.modificador.length > 0) partes.push(bolsas.modificador.join(', '));
  if (sinTraducir.length > 0) partes.push(`[${sinTraducir.join(' ')}]`);

  return {
    nombre: partes.join(' '),
    equipoDetectado: bolsas.equipo,
    sinTraducir,
  };
}

function determinarTipo(englishName) {
  const palabras = englishName.toLowerCase().split(/\s+/);
  if (palabras.some(p => PALABRAS_ESTIRAMIENTO.has(p))) return 'estiramiento';
  if (palabras.some(p => PALABRAS_PLIOMETRIA.has(p))) return 'pliometría';
  return 'fuerza';
}

function main() {
  if (!existsSync(CATALOGO_PATH)) {
    console.error('Falta scripts/out/catalogo-videos.json — corre antes: node scripts/diagnosticoVideos.mjs');
    process.exit(1);
  }
  const catalogo = JSON.parse(readFileSync(CATALOGO_PATH, 'utf8'));
  const videos = Object.values(catalogo.porGrupo).flat();

  const propuestos = videos.map(v => {
    const { nombre, equipoDetectado, sinTraducir } = traducirNombre(v.englishName);
    const primaryFocus = v.muscleGroupEs.toLowerCase();
    const muscleGroup = MUSCLE_GROUP_MAP[v.muscleGroupEs];

    return {
      videoFile: v.file,
      videoRenamedFile: v.renamedFile,
      exercise: {
        ownerId: 'system',
        isCustom: false,
        name: nombre,
        primaryFocus,
        ...(muscleGroup ? { muscleGroup } : {}),
        type: determinarTipo(v.englishName),
        equipment: equipoDetectado,
      },
      necesitaRevision: sinTraducir.length > 0,
      palabrasSinTraducir: sinTraducir,
    };
  });

  const necesitanRevision = propuestos.filter(p => p.necesitaRevision);
  const limpios = propuestos.filter(p => !p.necesitaRevision);

  console.log(`Total propuestos: ${propuestos.length}`);
  console.log(`  · traducidos sin palabras sueltas en inglés: ${limpios.length}`);
  console.log(`  · con alguna palabra sin traducir (revisar):  ${necesitanRevision.length}`);

  // Palabras sin traducir más frecuentes, para priorizar qué añadir al
  // diccionario si merece la pena una segunda pasada.
  const conteoSinTraducir = {};
  for (const p of necesitanRevision) {
    for (const palabra of p.palabrasSinTraducir) {
      conteoSinTraducir[palabra] = (conteoSinTraducir[palabra] ?? 0) + 1;
    }
  }
  const topSinTraducir = Object.entries(conteoSinTraducir).sort((a, b) => b[1] - a[1]).slice(0, 30);
  if (topSinTraducir.length > 0) {
    console.log('\nPalabras sin traducir más frecuentes:');
    for (const [palabra, n] of topSinTraducir) console.log(`  ${String(n).padStart(3)}  ${palabra}`);
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUT_DIR, 'ejercicios-propuestos.json'),
    JSON.stringify(propuestos, null, 2),
  );
  console.log('\nEscrito en scripts/out/ejercicios-propuestos.json');

  // Muestra 15 ejemplos al azar-ish (cada N) para una primera impresión rápida.
  console.log('\nEjemplos:');
  const paso = Math.max(1, Math.floor(propuestos.length / 15));
  for (let i = 0; i < propuestos.length; i += paso) {
    const p = propuestos[i];
    console.log(`  ${p.videoFile}`);
    console.log(`    → ${p.exercise.name}${p.necesitaRevision ? '  ⚠ revisar' : ''}`);
  }
}

main();

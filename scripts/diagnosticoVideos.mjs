/**
 * Diagnóstico de los vídeos de ejercicios (tarea 17, rastreo 14-08).
 *
 * NO sube nada. Es el paso previo que pide el plan antes de tocar Firebase
 * Storage: catalogar los 1.681 ficheros locales y, si hay credencial a mano,
 * cruzarlos contra la biblioteca real de ejercicios.
 *
 * El problema de fondo: los ficheros vienen en inglés
 * (`Dumbbell_Seated_One_Leg_Calf_Raise_Hammer_Grip_138012.mp4`) y la
 * biblioteca de ejercicios está en español. Traducir 660 palabras distintas
 * de vocabulario de gimnasio palabra por palabra no da nombres fiables — el
 * orden adjetivo-sustantivo del inglés no es el del español, y una traducción
 * mecánica puede sonar bien y significar otra cosa. Así que este script NO
 * intenta traducir ni emparejar automáticamente: cataloga lo que hay
 * (siempre, sin credencial) y, si hay credencial, ACOTA candidatos por
 * parecido de palabras para que emparejar a mano sea rápido — la decisión
 * final la toma una persona, no un algoritmo de traducción.
 *
 * Uso, fase 1 (sin credencial — cataloga los ficheros locales):
 *   node scripts/diagnosticoVideos.mjs
 *
 * Uso, fase 2 (con credencial — además cruza contra la biblioteca real):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/diagnosticoVideos.mjs
 *
 * Salida: dos ficheros en scripts/out/ (se crea si no existe):
 *   - catalogo-videos.json   — todos los ficheros parseados, con el nombre
 *                              sugerido tras renombrar (sin el número final)
 *   - candidatos-emparejamiento.json — solo si hay credencial: para cada
 *                              vídeo, hasta 5 ejercicios de la biblioteca
 *                              con más palabras en común, para revisar a mano
 */

import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEOS_DIR = process.env.VIDEOS_DIR
  ?? resolve('/Users/dani/Desktop/Videos Ejercicios copia');
const OUT_DIR = resolve(__dirname, 'out');

// ── Fase 1: catalogar los ficheros locales ──────────────────────────────────

function parseFilename(filename) {
  // "Abductores - Cable_Hip_Abduction_304812.mp4"
  const sinExtension = filename.replace(/\.mp4$/i, '');
  const guionIdx = sinExtension.indexOf(' - ');
  if (guionIdx === -1) return null;

  const muscleGroupEs = sinExtension.slice(0, guionIdx).trim();
  const resto = sinExtension.slice(guionIdx + 3).trim();

  // El número final es el id del banco de vídeos de origen, no parte del
  // nombre del ejercicio — el plan pide quitarlo al renombrar.
  const match = resto.match(/^(.+?)_(\d+)$/);
  const englishSlug = match ? match[1] : resto;
  const sourceId = match ? match[2] : null;

  const englishName = englishSlug.replace(/_/g, ' ');
  const renamedFile = `${muscleGroupEs} - ${englishSlug}.mp4`;

  return { file: filename, muscleGroupEs, englishSlug, englishName, sourceId, renamedFile };
}

function catalogarVideos() {
  const entries = readdirSync(VIDEOS_DIR).filter(f => /\.mp4$/i.test(f));
  const parsed = [];
  const sinParsear = [];

  for (const f of entries) {
    const p = parseFilename(f);
    if (p) parsed.push(p);
    else sinParsear.push(f);
  }

  const porGrupo = {};
  for (const p of parsed) {
    (porGrupo[p.muscleGroupEs] ??= []).push(p);
  }

  console.log(`Vídeos encontrados en ${VIDEOS_DIR}: ${entries.length}`);
  console.log(`Parseados correctamente: ${parsed.length}`);
  if (sinParsear.length > 0) {
    console.log(`Sin parsear (nombre inesperado, revisar a mano): ${sinParsear.length}`);
    sinParsear.slice(0, 10).forEach(f => console.log(`  · ${f}`));
  }
  console.log('\nPor grupo muscular:');
  for (const [grupo, lista] of Object.entries(porGrupo).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${grupo.padEnd(18)} ${lista.length}`);
  }

  return { parsed, sinParsear, porGrupo };
}

// ── Fase 2 (opcional): candidatos de emparejamiento contra la biblioteca real ──

// Palabras de relleno del inglés que no aportan nada al comparar contra un
// nombre en español (artículos, preposiciones, "one"/"single" como muletillas
// de conteo). No es una traducción — solo reduce ruido antes de comparar.
const STOPWORDS_EN = new Set([
  'a', 'an', 'the', 'to', 'with', 'and', 'on', 'at', 'of', 'in', 'from',
  'one', 'single', 'each',
]);

function tokenizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos para comparar
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOPWORDS_EN.has(t));
}

async function candidatosEmparejamiento(parsed) {
  const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!cred) {
    console.log('\n(Fase 2 omitida: sin GOOGLE_APPLICATION_CREDENTIALS no se puede leer la');
    console.log(' biblioteca real de ejercicios. El catálogo de vídeos de la fase 1 ya está');
    console.log(' escrito — vuelve a correr el script con la credencial cuando la tengas.)');
    return null;
  }

  const { readFileSync } = await import('fs');
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  const firebaseConfig = JSON.parse(
    readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'),
  );
  const serviceAccount = JSON.parse(readFileSync(resolve(cred), 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(firebaseConfig.firestoreDatabaseId);

  const snap = await db.collection('exercises').get();
  const ejercicios = snap.docs.map(d => ({
    id: d.id,
    name: d.data().name,
    primaryFocus: d.data().primaryFocus,
    tieneVideo: !!d.data().videoUrl,
    tokens: tokenizar(`${d.data().name ?? ''} ${d.data().primaryFocus ?? ''}`),
  }));

  console.log(`\nBiblioteca real: ${ejercicios.length} ejercicios`);
  console.log(`  · con vídeo ya puesto: ${ejercicios.filter(e => e.tieneVideo).length}`);
  console.log(`  · sin vídeo:           ${ejercicios.filter(e => !e.tieneVideo).length}`);

  const candidatos = parsed.map(video => {
    const tokensVideo = new Set(tokenizar(video.englishName));
    const puntuados = ejercicios
      .filter(e => !e.tieneVideo) // no tiene sentido sugerir uno que ya está resuelto
      .map(e => {
        const comunes = e.tokens.filter(t => tokensVideo.has(t)).length;
        return { ejercicioId: e.id, nombre: e.name, puntuacion: comunes };
      })
      .filter(c => c.puntuacion > 0)
      .sort((a, b) => b.puntuacion - a.puntuacion)
      .slice(0, 5);

    return { ...video, candidatos: puntuados };
  });

  const sinCandidatos = candidatos.filter(c => c.candidatos.length === 0).length;
  console.log(`\nVídeos sin ningún candidato (0 palabras en común): ${sinCandidatos} / ${candidatos.length}`);
  console.log('Esos van a necesitar traducción manual antes de poder emparejarse.');

  return candidatos;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const { parsed, sinParsear, porGrupo } = catalogarVideos();
  writeFileSync(
    resolve(OUT_DIR, 'catalogo-videos.json'),
    JSON.stringify({ total: parsed.length, sinParsear, porGrupo }, null, 2),
  );
  console.log(`\nCatálogo escrito en scripts/out/catalogo-videos.json`);

  const candidatos = await candidatosEmparejamiento(parsed);
  if (candidatos) {
    writeFileSync(
      resolve(OUT_DIR, 'candidatos-emparejamiento.json'),
      JSON.stringify(candidatos, null, 2),
    );
    console.log('Candidatos de emparejamiento escritos en scripts/out/candidatos-emparejamiento.json');
  }
}

main().catch(err => {
  console.error('Diagnóstico falló:', err);
  process.exit(1);
});

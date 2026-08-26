/**
 * Sube los vídeos a Firebase Storage y crea los ejercicios en Firestore
 * (tarea 17, ampliación del catálogo). Lee scripts/out/ejercicios-propuestos.json
 * (generado por traducirEjercicios.mjs) — no vuelve a traducir nada.
 *
 * Reanudable: cada vídeo procesado se apunta en scripts/out/subida-progreso.json
 * según se completa, así que si el proceso se corta a medias (red, ctrl-C),
 * volver a correr el script retoma donde se quedó sin duplicar nada.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/subirEjercicios.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, 'out');
const PROPUESTOS_PATH = resolve(OUT_DIR, 'ejercicios-propuestos.json');
const PROGRESO_PATH = resolve(OUT_DIR, 'subida-progreso.json');
const VIDEOS_DIR = process.env.VIDEOS_DIR
  ?? resolve('/Users/dani/Desktop/Videos Ejercicios copia');

const CONCURRENCIA = 6;

function cargarProgreso() {
  if (!existsSync(PROGRESO_PATH)) return {};
  try { return JSON.parse(readFileSync(PROGRESO_PATH, 'utf8')); } catch { return {}; }
}

function guardarProgreso(progreso) {
  writeFileSync(PROGRESO_PATH, JSON.stringify(progreso, null, 2));
}

async function procesarUno(item, db, bucket, progreso) {
  const localPath = resolve(VIDEOS_DIR, item.videoFile);
  if (!existsSync(localPath)) {
    return { ok: false, error: `Fichero local no encontrado: ${item.videoFile}` };
  }

  const docRef = db.collection('exercises').doc();
  const destino = `exerciseVideos/${docRef.id}.mp4`;
  const token = randomUUID();

  await bucket.upload(localPath, {
    destination: destino,
    metadata: {
      contentType: 'video/mp4',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const videoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destino)}?alt=media&token=${token}`;

  await docRef.set({ ...item.exercise, videoUrl });

  progreso[item.videoFile] = { exerciseId: docRef.id, done: true };
  return { ok: true, exerciseId: docRef.id };
}

// Pool sencillo: N promesas activas a la vez, sin librería externa.
async function procesarEnParalelo(items, tarea, concurrencia) {
  const resultados = [];
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await tarea(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrencia }, trabajador));
  return resultados;
}

async function main() {
  const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!cred) {
    console.error('Falta GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  if (!existsSync(PROPUESTOS_PATH)) {
    console.error('Falta scripts/out/ejercicios-propuestos.json — corre antes: node scripts/traducirEjercicios.mjs');
    process.exit(1);
  }

  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');

  const firebaseConfig = JSON.parse(readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'));
  const serviceAccount = JSON.parse(readFileSync(resolve(cred), 'utf8'));
  initializeApp({ credential: cert(serviceAccount), storageBucket: firebaseConfig.storageBucket });
  const db = getFirestore(firebaseConfig.firestoreDatabaseId);
  const bucket = getStorage().bucket();

  const propuestos = JSON.parse(readFileSync(PROPUESTOS_PATH, 'utf8'));
  const progreso = cargarProgreso();

  const pendientes = propuestos.filter(p => !progreso[p.videoFile]?.done);
  console.log(`Total: ${propuestos.length} · ya subidos: ${propuestos.length - pendientes.length} · pendientes: ${pendientes.length}`);

  if (pendientes.length === 0) {
    console.log('Nada que hacer — todo subido ya.');
    return;
  }

  let hechos = 0;
  const errores = [];
  const inicio = Date.now();

  await procesarEnParalelo(pendientes, async (item) => {
    try {
      const r = await procesarUno(item, db, bucket, progreso);
      hechos++;
      if (hechos % 25 === 0 || hechos === pendientes.length) {
        const seg = Math.round((Date.now() - inicio) / 1000);
        console.log(`  ${hechos}/${pendientes.length} (${seg}s) — último: ${item.videoFile}`);
        guardarProgreso(progreso); // checkpoint periódico, no solo al final
      }
      return r;
    } catch (err) {
      errores.push({ videoFile: item.videoFile, error: String(err?.message ?? err) });
      console.warn(`  ✗ ${item.videoFile}: ${err?.message ?? err}`);
      return { ok: false };
    }
  }, CONCURRENCIA);

  guardarProgreso(progreso);

  // Los ejercicios recién creados no aparecerían en ninguna app: `exercises` se
  // sirve desde la caché del dispositivo mientras el sello no cambie. El import
  // va aquí y no arriba para no romper la comprobación de credenciales del
  // principio, que es la que da el mensaje útil cuando faltan.
  if (hechos > 0) {
    const { marcarCatalogoCambiado } = await import('./_lib/firestoreDb.mjs');
    await marcarCatalogoCambiado(db, 'exercises');
  }

  console.log(`\nHecho. Creados/actualizados: ${Object.values(progreso).filter(p => p.done).length}`);
  if (errores.length > 0) {
    console.log(`Errores (${errores.length}), quedan pendientes para el próximo run:`);
    errores.slice(0, 20).forEach(e => console.log(`  · ${e.videoFile} — ${e.error}`));
    writeFileSync(resolve(OUT_DIR, 'subida-errores.json'), JSON.stringify(errores, null, 2));
  }
}

main().catch(err => {
  console.error('Subida falló:', err);
  process.exit(1);
});

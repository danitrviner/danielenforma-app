import { db, collection, doc, setDoc, getDocs, deleteDoc, query, where } from '../firebase';
import { BodyMeasurement } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { escribirLocal } from '../utils/almacenLocal';

// Collection: bodyMeasurements  (athleteId = email)
// docId determinista `${athleteId}_${date}_${metricKey}` (mismo patrón que
// progressPhotos) — responder dos veces el mismo día para el mismo perímetro
// sobrescribe en vez de duplicar. El peso corporal ('bodyweight') NO pasa por
// aquí: reutiliza bodyweightLogs para no partir en dos la serie que ya
// alimenta perfil, reportes y periodización nutricional.

// Sobre los `catch`: hasta 09-2026 los tres llamaban a `setLocalBypassMode(true)`
// SIN pasar el error, y eran los únicos de `src/db` que lo hacían. La diferencia
// no es cosmética: sin el error, `setLocalBypassMode` no puede distinguir un
// `permission-denied` de una caída de red, lo marca como «sin-conexion» en
// Sentry y apaga Firestore para TODA la app (`forceLocalOnly = true`). O sea:
// una regla mal escrita en esta única colección dejaba al atleta trabajando
// en local sin saberlo. Pasando el error, `setLocalBypassMode` ya hace lo
// correcto: reporta el tipo bien y NO apaga Firestore si es de permisos.
// Y en la escritura, un fallo de permisos se propaga en vez de devolver
// éxito — mismo patrón que `addBodyweight` (src/db/athleteMetrics.ts).

const LOCAL_MEASUREMENTS = 'enforma_bodyMeasurements_v1';

function getLocalMeasurements(): BodyMeasurement[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_MEASUREMENTS) || '[]'); } catch { return []; }
}
function saveLocalMeasurements(list: BodyMeasurement[]): void {
  escribirLocal(LOCAL_MEASUREMENTS, JSON.stringify(list));
}

function docIdFor(athleteId: string, date: string, metricKey: string): string {
  return `${athleteId}_${date}_${metricKey}`;
}

export async function getBodyMeasurementsForAthlete(athleteId: string): Promise<BodyMeasurement[]> {
  if (forceLocalOnly) {
    return getLocalMeasurements().filter(m => m.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'bodyMeasurements'), where('athleteId', '==', athleteId)));
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as BodyMeasurement))
      .sort((a, b) => a.date.localeCompare(b.date));
    saveLocalMeasurements([...getLocalMeasurements().filter(m => m.athleteId !== athleteId), ...list]);
    return list;
  } catch (err) {
    console.warn('getBodyMeasurementsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalMeasurements().filter(m => m.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export async function saveBodyMeasurement(data: Omit<BodyMeasurement, 'id'>): Promise<BodyMeasurement> {
  const docId = docIdFor(data.athleteId, data.date, data.metricKey);
  const measurement: BodyMeasurement = { ...data, id: docId };
  if (forceLocalOnly) {
    saveLocalMeasurements([...getLocalMeasurements().filter(m => m.id !== docId), measurement]);
    return measurement;
  }
  try {
    await setDoc(doc(db, 'bodyMeasurements', docId), stripUndefined(measurement));
    saveLocalMeasurements([...getLocalMeasurements().filter(m => m.id !== docId), measurement]);
    return measurement;
  } catch (err) {
    console.warn('saveBodyMeasurement Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    // Un permission-denied NO es «guardado en local»: es que no tienes permiso
    // para escribir esto. Devolver la medición como si nada dejaba al atleta
    // creyendo que había registrado sus centímetros.
    if (esFalloDePermisos(err)) throw err;
    saveLocalMeasurements([...getLocalMeasurements().filter(m => m.id !== docId), measurement]);
    return measurement;
  }
}

export async function deleteBodyMeasurement(id: string): Promise<void> {
  const updated = getLocalMeasurements().filter(m => m.id !== id);
  if (forceLocalOnly) { saveLocalMeasurements(updated); return; }
  try {
    await deleteDoc(doc(db, 'bodyMeasurements', id));
    saveLocalMeasurements(updated);
  } catch (err) {
    console.warn('deleteBodyMeasurement Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalMeasurements(updated);
  }
}

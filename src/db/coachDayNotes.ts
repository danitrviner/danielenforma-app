import { db, collection, doc, getDoc, setDoc, deleteDoc, getDocs, query, where } from '../firebase';
import { CoachDayNote } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { reportarError } from '../monitorizacion';

// ─── COACH DAY NOTES ────────────────────────────────────────────────────────
// Nota del coach sobre un día concreto (Roadmap → Calendario, sheet de Día ·
// botón "Nota") — el atleta la ve en Inicio ese día. Doc ID determinista
// `${athleteId}_${date}`, mismo patrón que dietCompletionLogs/progressPhotos:
// como mucho una por atleta y día, volver a guardar la sustituye.

const LOCAL_KEY = 'enforma_coach_day_notes_v1';

function getLocalNotes(): CoachDayNote[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalNotes(list: CoachDayNote[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}
function upsertLocal(note: CoachDayNote): void {
  saveLocalNotes([...getLocalNotes().filter(n => n.id !== note.id), note]);
}

function docId(athleteId: string, date: string): string {
  return `${athleteId}_${date}`;
}

/**
 * Las LECTURAS de notas no caen al modo local ni encienden el aviso de
 * permisos: solo se reportan.
 *
 * Motivo: `HomeScreen` pide la nota del día en cada carga del atleta. Si las
 * reglas de `coachDayNotes` no están desplegadas todavía —o llegan tarde a un
 * despliegue—, ese `permission-denied` pondría un aviso de permisos delante de
 * TODOS los atletas por un dato decorativo que además no existe. "Hoy no hay
 * nota" y "no puedo leer si hay nota" se ven igual en pantalla, y no merecen
 * asustar a nadie. Las ESCRITURAS sí lo encienden: si la nota del coach no se
 * guarda, tiene que enterarse.
 */
function fallaLecturaSilenciosa(err: unknown, donde: string) {
  console.warn(`${donde} Firestore failed, using local:`, err);
  reportarError(err, 'firestore', { tipo: esFalloDePermisos(err) ? 'permisos' : 'sin-conexion', donde, silencioso: true });
}

export async function getCoachDayNote(athleteId: string, date: string): Promise<CoachDayNote | null> {
  const id = docId(athleteId, date);
  if (forceLocalOnly) return getLocalNotes().find(n => n.id === id) ?? null;
  try {
    const snap = await getDoc(doc(db, 'coachDayNotes', id));
    if (!snap.exists()) return null;
    const note = { id: snap.id, ...snap.data() } as CoachDayNote;
    upsertLocal(note);
    return note;
  } catch (err) {
    fallaLecturaSilenciosa(err, 'getCoachDayNote');
    return getLocalNotes().find(n => n.id === id) ?? null;
  }
}

/**
 * Todas las notas de un atleta — para el calendario del coach (una consulta,
 * no una por día) y para que el atleta compruebe si hoy tiene alguna en Inicio.
 */
export async function getCoachDayNotesForAthlete(athleteId: string): Promise<CoachDayNote[]> {
  if (forceLocalOnly) {
    return getLocalNotes().filter(n => n.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'coachDayNotes'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachDayNote)).sort((a, b) => a.date.localeCompare(b.date));
    saveLocalNotes([...getLocalNotes().filter(n => n.athleteId !== athleteId), ...list]);
    return list;
  } catch (err) {
    fallaLecturaSilenciosa(err, 'getCoachDayNotesForAthlete');
    return getLocalNotes().filter(n => n.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
  }
}

/** Crea o sustituye la nota de un día. `merge:true` conserva `createdAt` si ya existía. */
export async function saveCoachDayNote(athleteId: string, date: string, text: string): Promise<CoachDayNote> {
  const id = docId(athleteId, date);
  const ahora = new Date().toISOString();
  const existente = await getCoachDayNote(athleteId, date);
  const note: CoachDayNote = existente
    ? { ...existente, text, updatedAt: ahora }
    : { id, athleteId, date, text, createdAt: ahora };
  const data = stripUndefined({ athleteId: note.athleteId, date: note.date, text: note.text, createdAt: note.createdAt, updatedAt: note.updatedAt });
  if (forceLocalOnly) { upsertLocal(note); return note; }
  try {
    await setDoc(doc(db, 'coachDayNotes', id), data);
    upsertLocal(note);
    return note;
  } catch (err) {
    console.warn('saveCoachDayNote Firestore failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    upsertLocal(note);
    return note;
  }
}

export async function deleteCoachDayNote(athleteId: string, date: string): Promise<void> {
  const id = docId(athleteId, date);
  const removeLocal = () => saveLocalNotes(getLocalNotes().filter(n => n.id !== id));
  if (forceLocalOnly) { removeLocal(); return; }
  try {
    await deleteDoc(doc(db, 'coachDayNotes', id));
    removeLocal();
  } catch (err) {
    console.warn('deleteCoachDayNote Firestore failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    removeLocal();
  }
}

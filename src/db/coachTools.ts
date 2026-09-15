import { db, collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, deleteField } from '../firebase';
import { CoachNote, CoachClientTask, Resource } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { leerCatalogo, marcarCatalogoCambiado } from './catalogoVersionado';
import { escribirLocal } from '../utils/almacenLocal';

// ─── COACH NOTES (private to-do list, never visible to athletes) ──────────────

const COACH_NOTES_LOCAL_KEY = 'enforma_coach_notes_v1';

function getLocalCoachNotes(): CoachNote[] {
  try { return JSON.parse(localStorage.getItem(COACH_NOTES_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalCoachNotes(list: CoachNote[]): void {
  escribirLocal(COACH_NOTES_LOCAL_KEY, JSON.stringify(list));
}

export async function getCoachNotes(): Promise<CoachNote[]> {
  if (forceLocalOnly) return getLocalCoachNotes();
  try {
    const snap = await getDocs(collection(db, 'coachNotes'));
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachNote));
    saveLocalCoachNotes(notes);
    return notes;
  } catch (err) {
    console.warn('getCoachNotes Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalCoachNotes();
  }
}

export async function createCoachNote(data: Omit<CoachNote, 'id'>): Promise<CoachNote> {
  if (forceLocalOnly) {
    const note: CoachNote = { ...data, id: `local_cn_${Date.now()}` };
    saveLocalCoachNotes([...getLocalCoachNotes(), note]);
    return note;
  }
  try {
    const ref = await addDoc(collection(db, 'coachNotes'), stripUndefined(data));
    const note: CoachNote = { ...data, id: ref.id };
    saveLocalCoachNotes([...getLocalCoachNotes(), note]);
    return note;
  } catch (err) {
    console.warn('createCoachNote Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const note: CoachNote = { ...data, id: `local_cn_${Date.now()}` };
    saveLocalCoachNotes([...getLocalCoachNotes(), note]);
    return note;
  }
}

export async function updateCoachNote(id: string, updates: Partial<CoachNote>): Promise<void> {
  const updated = getLocalCoachNotes().map(n => n.id === id ? { ...n, ...updates } : n);
  if (forceLocalOnly) { saveLocalCoachNotes(updated); return; }
  try {
    await updateDoc(doc(db, 'coachNotes', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalCoachNotes(updated);
  } catch (err) {
    console.warn('updateCoachNote Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalCoachNotes(updated);
  }
}

export async function deleteCoachNote(id: string): Promise<void> {
  const filtered = getLocalCoachNotes().filter(n => n.id !== id);
  if (forceLocalOnly) { saveLocalCoachNotes(filtered); return; }
  try {
    await deleteDoc(doc(db, 'coachNotes', id));
    saveLocalCoachNotes(filtered);
  } catch (err) {
    console.warn('deleteCoachNote Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalCoachNotes(filtered);
  }
}

// ─── COACH CLIENT TASKS (Setup panel checklist) ────────────────────────────────
// Seeded items get a deterministic doc id (`${email}_${itemId}`) and are only
// written the first time the coach toggles them — cheap idempotent upserts,
// same pattern as weeklyChallengeDocId. Extras use Firestore auto-ids.

const COACH_CLIENT_TASKS_LOCAL_KEY = 'enforma_coach_client_tasks_v1';

function getLocalCoachClientTasks(): CoachClientTask[] {
  try { return JSON.parse(localStorage.getItem(COACH_CLIENT_TASKS_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalCoachClientTasks(list: CoachClientTask[]): void {
  escribirLocal(COACH_CLIENT_TASKS_LOCAL_KEY, JSON.stringify(list));
}

export async function getCoachClientTasks(athleteEmail: string): Promise<CoachClientTask[]> {
  if (forceLocalOnly) return getLocalCoachClientTasks().filter(t => t.athleteId === athleteEmail);
  try {
    const snap = await getDocs(query(collection(db, 'coachClientTasks'), where('athleteId', '==', athleteEmail)));
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as CoachClientTask));
    const merged = [...getLocalCoachClientTasks().filter(t => t.athleteId !== athleteEmail), ...tasks];
    saveLocalCoachClientTasks(merged);
    return tasks;
  } catch (err) {
    console.warn('getCoachClientTasks Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalCoachClientTasks().filter(t => t.athleteId === athleteEmail);
  }
}

/**
 * Marca (o desmarca) un ítem sembrado, y de paso deja ponerle fecha.
 *
 * `dueDate` viaja aquí y no en `updateCoachClientTask` porque el documento
 * puede no existir todavía: estas tareas solo se escriben cuando el coach toca
 * una, así que ponerle un recordatorio a un paso que nunca se ha marcado sería
 * un `updateDoc` contra un documento inexistente. El `setDoc(..., {merge:true})`
 * de aquí sirve para las dos cosas.
 *
 * `dueDate: null` BORRA la fecha; `undefined` la deja como esté. Son dos cosas
 * distintas y `stripUndefined` se come la segunda, que es justo lo que hace
 * falta para poder quitar un aviso sin tocar el resto del documento.
 */
export async function setSeededTaskDone(
  athleteEmail: string, itemId: string, title: string, phase: string, done: boolean,
  dueDate?: string | null,
): Promise<void> {
  const id = `${athleteEmail}_${itemId}`;
  const task: CoachClientTask = {
    id, athleteId: athleteEmail, itemId, title, phase, done,
    doneAt: done ? new Date().toISOString() : undefined,
    createdBy: 'seed', createdAt: new Date().toISOString(),
    ...(dueDate === undefined ? {} : { dueDate: dueDate ?? undefined }),
  };
  const updated = [...getLocalCoachClientTasks().filter(t => t.id !== id), task];
  if (forceLocalOnly) { saveLocalCoachClientTasks(updated); return; }
  try {
    // `stripUndefined` quita los campos ausentes, pero para BORRAR uno que ya
    // está en Firestore hace falta `deleteField()`: con merge:true, omitirlo
    // lo deja como estaba.
    const payload = { ...stripUndefined(task) } as Record<string, unknown>;
    if (dueDate === null) payload.dueDate = deleteField();
    await setDoc(doc(db, 'coachClientTasks', id), payload, { merge: true });
    saveLocalCoachClientTasks(updated);
  } catch (err) {
    console.warn('setSeededTaskDone Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalCoachClientTasks(updated);
  }
}

/**
 * Las tareas con fecha ya vencida, de TODOS los atletas, en UNA consulta.
 *
 * Existe por coste, no por comodidad: la campana del coach se calcula
 * recorriendo la lista de atletas, y hacer un `getCoachClientTasks(email)` por
 * cada uno serían N consultas para encontrar, casi siempre, cero tareas. Esta
 * filtra en el servidor y devuelve solo lo que de verdad urge.
 *
 * Legal porque la regla de `coachClientTasks` es `isCoach()` sobre la colección
 * entera; un atleta no puede ejecutarla. Necesita el índice compuesto
 * (done, dueDate) que está en `firestore.indexes.json`.
 */
export async function getCoachTasksVencidas(hasta: string): Promise<CoachClientTask[]> {
  if (forceLocalOnly) {
    return getLocalCoachClientTasks().filter(t => !t.done && !!t.dueDate && t.dueDate <= hasta);
  }
  try {
    const snap = await getDocs(query(
      collection(db, 'coachClientTasks'),
      where('done', '==', false),
      where('dueDate', '<=', hasta),
      orderBy('dueDate'),
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CoachClientTask);
  } catch (err) {
    console.warn('getCoachTasksVencidas Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalCoachClientTasks().filter(t => !t.done && !!t.dueDate && t.dueDate <= hasta);
  }
}

export async function createCoachClientTask(data: Omit<CoachClientTask, 'id'>): Promise<CoachClientTask> {
  if (forceLocalOnly) {
    const task: CoachClientTask = { ...data, id: `local_cct_${Date.now()}` };
    saveLocalCoachClientTasks([...getLocalCoachClientTasks(), task]);
    return task;
  }
  try {
    const ref = await addDoc(collection(db, 'coachClientTasks'), stripUndefined(data));
    const task: CoachClientTask = { ...data, id: ref.id };
    saveLocalCoachClientTasks([...getLocalCoachClientTasks(), task]);
    return task;
  } catch (err) {
    console.warn('createCoachClientTask Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const task: CoachClientTask = { ...data, id: `local_cct_${Date.now()}` };
    saveLocalCoachClientTasks([...getLocalCoachClientTasks(), task]);
    return task;
  }
}

export async function updateCoachClientTask(id: string, updates: Partial<CoachClientTask>): Promise<void> {
  const updated = getLocalCoachClientTasks().map(t => t.id === id ? { ...t, ...updates } : t);
  if (forceLocalOnly) { saveLocalCoachClientTasks(updated); return; }
  try {
    await updateDoc(doc(db, 'coachClientTasks', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalCoachClientTasks(updated);
  } catch (err) {
    console.warn('updateCoachClientTask Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalCoachClientTasks(updated);
  }
}

export async function deleteCoachClientTask(id: string): Promise<void> {
  const filtered = getLocalCoachClientTasks().filter(t => t.id !== id);
  if (forceLocalOnly) { saveLocalCoachClientTasks(filtered); return; }
  try {
    await deleteDoc(doc(db, 'coachClientTasks', id));
    saveLocalCoachClientTasks(filtered);
  } catch (err) {
    console.warn('deleteCoachClientTask Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalCoachClientTasks(filtered);
  }
}

// ─── RESOURCES (coach-shared files/links) ──────────────────────────────────────

const RESOURCES_LOCAL_KEY = 'enforma_resources_v1';

function getLocalResources(): Resource[] {
  try {
    const raw = localStorage.getItem(RESOURCES_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Resource[]) : [];
  } catch { return []; }
}

function saveLocalResources(resources: Resource[]): void {
  escribirLocal(RESOURCES_LOCAL_KEY, JSON.stringify(resources));
}

// Single-coach app — resources aren't filtered per coach, same pattern as
// getFoodItems()/getExercises() (shared library, any authenticated user reads all).
export async function getAllResources(): Promise<Resource[]> {
  if (forceLocalOnly) return getLocalResources();
  try {
    const resources = await leerCatalogo('resources', 'resources', d => ({ id: d.id, ...d.data() } as Resource));
    saveLocalResources(resources);
    return resources;
  } catch (err) {
    console.warn('getAllResources Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalResources();
  }
}

export async function createResource(data: Omit<Resource, 'id'>): Promise<Resource> {
  if (forceLocalOnly) {
    const resource: Resource = { ...data, id: `local_resource_${Date.now()}` };
    saveLocalResources([...getLocalResources(), resource]);
    return resource;
  }
  try {
    const ref = await addDoc(collection(db, 'resources'), stripUndefined(data));
    const resource: Resource = { ...data, id: ref.id };
    saveLocalResources([...getLocalResources(), resource]);
    void marcarCatalogoCambiado('resources');
    return resource;
  } catch (err) {
    console.warn('createResource Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const resource: Resource = { ...data, id: `local_resource_${Date.now()}` };
    saveLocalResources([...getLocalResources(), resource]);
    return resource;
  }
}

export async function deleteResource(id: string): Promise<void> {
  const filtered = getLocalResources().filter(r => r.id !== id);
  if (forceLocalOnly) { saveLocalResources(filtered); return; }
  try {
    await deleteDoc(doc(db, 'resources', id));
    saveLocalResources(filtered);
    void marcarCatalogoCambiado('resources');
  } catch (err) {
    console.warn('deleteResource Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalResources(filtered);
  }
}


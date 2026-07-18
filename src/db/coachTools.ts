import { db, collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { CoachNote, CoachClientTask, Resource } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

// ─── COACH NOTES (private to-do list, never visible to athletes) ──────────────

const COACH_NOTES_LOCAL_KEY = 'enforma_coach_notes_v1';

function getLocalCoachNotes(): CoachNote[] {
  try { return JSON.parse(localStorage.getItem(COACH_NOTES_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalCoachNotes(list: CoachNote[]): void {
  localStorage.setItem(COACH_NOTES_LOCAL_KEY, JSON.stringify(list));
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
  localStorage.setItem(COACH_CLIENT_TASKS_LOCAL_KEY, JSON.stringify(list));
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
    setLocalBypassMode(true);
    return getLocalCoachClientTasks().filter(t => t.athleteId === athleteEmail);
  }
}

export async function setSeededTaskDone(athleteEmail: string, itemId: string, title: string, phase: string, done: boolean): Promise<void> {
  const id = `${athleteEmail}_${itemId}`;
  const task: CoachClientTask = {
    id, athleteId: athleteEmail, itemId, title, phase, done,
    doneAt: done ? new Date().toISOString() : undefined,
    createdBy: 'seed', createdAt: new Date().toISOString(),
  };
  const updated = [...getLocalCoachClientTasks().filter(t => t.id !== id), task];
  if (forceLocalOnly) { saveLocalCoachClientTasks(updated); return; }
  try {
    await setDoc(doc(db, 'coachClientTasks', id), stripUndefined(task), { merge: true });
    saveLocalCoachClientTasks(updated);
  } catch (err) {
    console.warn('setSeededTaskDone Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    saveLocalCoachClientTasks(updated);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
  localStorage.setItem(RESOURCES_LOCAL_KEY, JSON.stringify(resources));
}

// Single-coach app — resources aren't filtered per coach, same pattern as
// getFoodItems()/getExercises() (shared library, any authenticated user reads all).
export async function getAllResources(): Promise<Resource[]> {
  if (forceLocalOnly) return getLocalResources();
  try {
    const snap = await getDocs(collection(db, 'resources'));
    const resources = snap.docs.map(d => ({ id: d.id, ...d.data() } as Resource));
    saveLocalResources(resources);
    return resources;
  } catch (err) {
    console.warn('getAllResources Firestore failed, using local:', err);
    setLocalBypassMode(true);
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
    return resource;
  } catch (err) {
    console.warn('createResource Firestore failed, saving local:', err);
    setLocalBypassMode(true);
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
  } catch (err) {
    console.warn('deleteResource Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalResources(filtered);
  }
}


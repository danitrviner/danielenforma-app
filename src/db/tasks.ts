import { db, collection, doc, getDocs, addDoc, updateDoc, query, where } from '../firebase';
import { TaskItem } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';

// ─── TASKS (dashboard "Tareas pendientes") ─────────────────────────────────────

const TASKS_LOCAL_KEY = 'enforma_tasks_v1';

function getLocalTasks(): TaskItem[] {
  try {
    const raw = localStorage.getItem(TASKS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as TaskItem[]) : [];
  } catch { return []; }
}

function saveLocalTasks(tasks: TaskItem[]): void {
  localStorage.setItem(TASKS_LOCAL_KEY, JSON.stringify(tasks));
}

export async function getTasksForAthlete(athleteId: string): Promise<TaskItem[]> {
  if (forceLocalOnly) return getLocalTasks().filter(t => t.athleteId === athleteId);
  try {
    const q = query(collection(db, 'tasks'), where('athleteId', '==', athleteId));
    const snap = await getDocs(q);
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskItem));
    const others = getLocalTasks().filter(t => t.athleteId !== athleteId);
    saveLocalTasks([...others, ...tasks]);
    return tasks;
  } catch (err) {
    console.warn('getTasksForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalTasks().filter(t => t.athleteId === athleteId);
  }
}

// Tareas de un lote de atletas — para CoachWeekScreen (antes, una consulta
// por atleta con getTasksForAthlete).
export async function getTasksForAthletes(athleteIds: string[]): Promise<TaskItem[]> {
  const unicos = Array.from(new Set(athleteIds));
  if (unicos.length === 0) return [];
  if (forceLocalOnly) {
    return getLocalTasks().filter(t => unicos.includes(t.athleteId));
  }
  try {
    const results: TaskItem[] = [];
    const CHUNK = 30;
    for (let i = 0; i < unicos.length; i += CHUNK) {
      const chunk = unicos.slice(i, i + CHUNK);
      const snap = await getDocs(query(collection(db, 'tasks'), where('athleteId', 'in', chunk)));
      snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as TaskItem));
    }
    const local = getLocalTasks().filter(t => !unicos.includes(t.athleteId));
    saveLocalTasks([...local, ...results]);
    return results;
  } catch (err) {
    console.warn('getTasksForAthletes Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalTasks().filter(t => unicos.includes(t.athleteId));
  }
}

export async function createTask(data: Omit<TaskItem, 'id'>): Promise<TaskItem> {
  if (forceLocalOnly) {
    const task: TaskItem = { ...data, id: `local_task_${Date.now()}` };
    saveLocalTasks([...getLocalTasks(), task]);
    return task;
  }
  try {
    const ref = await addDoc(collection(db, 'tasks'), stripUndefined(data));
    const task: TaskItem = { ...data, id: ref.id };
    saveLocalTasks([...getLocalTasks(), task]);
    return task;
  } catch (err) {
    console.warn('createTask Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const task: TaskItem = { ...data, id: `local_task_${Date.now()}` };
    saveLocalTasks([...getLocalTasks(), task]);
    return task;
  }
}

export async function updateTask(id: string, updates: Partial<TaskItem>): Promise<void> {
  const updated = getLocalTasks().map(t => t.id === id ? { ...t, ...updates } : t);
  if (forceLocalOnly) { saveLocalTasks(updated); return; }
  try {
    await updateDoc(doc(db, 'tasks', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalTasks(updated);
  } catch (err) {
    console.warn('updateTask Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalTasks(updated);
  }
}


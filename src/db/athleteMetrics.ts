import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { BodyweightLog, StepLog } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';


const LOCAL_BW = 'enforma_bodyweight_v1';

function getLocalBw(): BodyweightLog[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_BW) || '[]'); } catch { return []; }
}
function saveLocalBw(list: BodyweightLog[]): void {
  localStorage.setItem(LOCAL_BW, JSON.stringify(list));
}

export async function getBodyweightForAthlete(email: string): Promise<BodyweightLog[]> {
  if (forceLocalOnly) {
    return getLocalBw().filter(b => b.athleteId === email).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'bodyweightLogs'), where('athleteId', '==', email)));
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as BodyweightLog))
      .sort((a, b) => a.date.localeCompare(b.date));
    saveLocalBw([...getLocalBw().filter(b => b.athleteId !== email), ...list]);
    return list;
  } catch (err) {
    console.warn('getBodyweightForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalBw().filter(b => b.athleteId === email).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export async function addBodyweight(data: Omit<BodyweightLog, 'id'>): Promise<BodyweightLog> {
  if (forceLocalOnly) {
    const entry: BodyweightLog = { ...data, id: `local_bw_${Date.now()}` };
    saveLocalBw([...getLocalBw(), entry]);
    return entry;
  }
  try {
    const ref = await addDoc(collection(db, 'bodyweightLogs'), stripUndefined(data));
    const entry: BodyweightLog = { ...data, id: ref.id };
    saveLocalBw([...getLocalBw(), entry]);
    return entry;
  } catch (err) {
    console.warn('addBodyweight Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const entry: BodyweightLog = { ...data, id: `local_bw_${Date.now()}` };
    saveLocalBw([...getLocalBw(), entry]);
    return entry;
  }
}

export async function updateBodyweight(id: string, updates: Partial<Pick<BodyweightLog, 'date' | 'weight' | 'kind'>>): Promise<void> {
  const all = getLocalBw();
  const updated = all.map(b => b.id === id ? { ...b, ...updates } : b);
  if (forceLocalOnly) { saveLocalBw(updated); return; }
  try {
    await updateDoc(doc(db, 'bodyweightLogs', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalBw(updated);
  } catch (err) {
    console.warn('updateBodyweight Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalBw(updated);
  }
}

export async function deleteBodyweight(id: string): Promise<void> {
  const updated = getLocalBw().filter(b => b.id !== id);
  if (forceLocalOnly) { saveLocalBw(updated); return; }
  try {
    await deleteDoc(doc(db, 'bodyweightLogs', id));
    saveLocalBw(updated);
  } catch (err) {
    console.warn('deleteBodyweight Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    saveLocalBw(updated);
  }
}

// Collection: stepLogs  (athleteId = email) — manual entry today; Fase 3 adds
// Apple Health / Google Health Connect as additional `source` values.

const LOCAL_STEPS = 'enforma_steps_v1';

function getLocalSteps(): StepLog[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_STEPS) || '[]'); } catch { return []; }
}
function saveLocalSteps(list: StepLog[]): void {
  localStorage.setItem(LOCAL_STEPS, JSON.stringify(list));
}

export async function getStepsForAthlete(email: string): Promise<StepLog[]> {
  if (forceLocalOnly) {
    return getLocalSteps().filter(s => s.athleteId === email).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    const snap = await getDocs(query(collection(db, 'stepLogs'), where('athleteId', '==', email)));
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as StepLog))
      .sort((a, b) => a.date.localeCompare(b.date));
    saveLocalSteps([...getLocalSteps().filter(s => s.athleteId !== email), ...list]);
    return list;
  } catch (err) {
    console.warn('getStepsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalSteps().filter(s => s.athleteId === email).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export async function addSteps(data: Omit<StepLog, 'id'>): Promise<StepLog> {
  if (forceLocalOnly) {
    const entry: StepLog = { ...data, id: `local_steps_${Date.now()}` };
    saveLocalSteps([...getLocalSteps(), entry]);
    return entry;
  }
  try {
    const ref = await addDoc(collection(db, 'stepLogs'), stripUndefined(data));
    const entry: StepLog = { ...data, id: ref.id };
    saveLocalSteps([...getLocalSteps(), entry]);
    return entry;
  } catch (err) {
    console.warn('addSteps Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const entry: StepLog = { ...data, id: `local_steps_${Date.now()}` };
    saveLocalSteps([...getLocalSteps(), entry]);
    return entry;
  }
}

export async function updateSteps(id: string, updates: Partial<Pick<StepLog, 'steps'>>): Promise<void> {
  const updated = getLocalSteps().map(s => s.id === id ? { ...s, ...updates } : s);
  if (forceLocalOnly) { saveLocalSteps(updated); return; }
  try {
    await updateDoc(doc(db, 'stepLogs', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalSteps(updated);
  } catch (err) {
    console.warn('updateSteps Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    saveLocalSteps(updated);
  }
}


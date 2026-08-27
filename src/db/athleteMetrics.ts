import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, limit, orderBy } from '../firebase';
import { BodyweightLog, StepLog } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';


const LOCAL_BW = 'enforma_bodyweight_v1';

function getLocalBw(): BodyweightLog[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_BW) || '[]'); } catch { return []; }
}
function saveLocalBw(list: BodyweightLog[]): void {
  localStorage.setItem(LOCAL_BW, JSON.stringify(list));
}

export async function getBodyweightForAthlete(email: string, desde?: string): Promise<BodyweightLog[]> {
  if (forceLocalOnly) {
    const propios = getLocalBw().filter(b => b.athleteId === email);
    return (desde ? propios.filter(b => b.date >= desde) : propios).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    let q = query(collection(db, 'bodyweightLogs'), where('athleteId', '==', email));
    if (desde) q = query(q, where('date', '>=', desde));
    const snap = await getDocs(q);
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as BodyweightLog))
      .sort((a, b) => a.date.localeCompare(b.date));
    // Con ventana NO se toca el espejo local: sobrescribirlo con un trozo
    // dejaría al atleta sin el resto de su historial al quedarse sin conexión.
    if (!desde) saveLocalBw([...getLocalBw().filter(b => b.athleteId !== email), ...list]);
    return list;
  } catch (err) {
    console.warn('getBodyweightForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    const propios = getLocalBw().filter(b => b.athleteId === email);
    return (desde ? propios.filter(b => b.date >= desde) : propios).sort((a, b) => a.date.localeCompare(b.date));
  }
}

/**
 * El peso más antiguo o el más reciente del atleta, en UNA lectura.
 *
 * Varias pantallas necesitaban exactamente un valor de frontera —el último peso
 * en Check-in, el primero y el último en Destacados, «¿ha pesado alguna vez?» en
 * la tarjeta de plan— y lo sacaban leyendo el historial entero y mirando el
 * extremo: 728 documentos a los dos años para quedarse con uno. La respuesta es
 * la misma; lo que cambia es lo que cuesta.
 *
 * Necesita el índice compuesto bodyweightLogs (athleteId, date).
 */
export async function getPesoExtremo(
  email: string,
  extremo: 'primero' | 'ultimo',
): Promise<BodyweightLog | null> {
  const deLocal = () => {
    const propios = getLocalBw().filter(b => b.athleteId === email)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (propios.length === 0) return null;
    return extremo === 'primero' ? propios[0] : propios[propios.length - 1];
  };
  if (forceLocalOnly) return deLocal();
  try {
    const snap = await getDocs(query(
      collection(db, 'bodyweightLogs'),
      where('athleteId', '==', email),
      orderBy('date', extremo === 'primero' ? 'asc' : 'desc'),
      limit(1),
    ));
    const d = snap.docs[0];
    return d ? ({ id: d.id, ...d.data() } as BodyweightLog) : null;
    // No se toca el espejo local: un extremo no es el historial, y escribirlo
    // como si lo fuera dejaría al atleta con un único peso sin conexión.
  } catch (err) {
    console.warn('getPesoExtremo Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return deLocal();
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
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
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
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
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
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
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

export async function getStepsForAthlete(email: string, desde?: string): Promise<StepLog[]> {
  if (forceLocalOnly) {
    const propios = getLocalSteps().filter(s => s.athleteId === email);
    return (desde ? propios.filter(s => s.date >= desde) : propios).sort((a, b) => a.date.localeCompare(b.date));
  }
  try {
    let q = query(collection(db, 'stepLogs'), where('athleteId', '==', email));
    if (desde) q = query(q, where('date', '>=', desde));
    const snap = await getDocs(q);
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as StepLog))
      .sort((a, b) => a.date.localeCompare(b.date));
    // Con ventana NO se toca el espejo local (ver getBodyweightForAthlete).
    if (!desde) saveLocalSteps([...getLocalSteps().filter(s => s.athleteId !== email), ...list]);
    return list;
  } catch (err) {
    console.warn('getStepsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    const propios = getLocalSteps().filter(s => s.athleteId === email);
    return (desde ? propios.filter(s => s.date >= desde) : propios).sort((a, b) => a.date.localeCompare(b.date));
  }
}

/**
 * Los pasos de UN día. `StepsWidget` necesita exactamente esto —el registro de
 * hoy, para enseñarlo y para saber si hay que crear o actualizar— y lo estaba
 * consiguiendo leyendo el historial entero y buscando dentro: 728 documentos a
 * los dos años para quedarse con uno.
 *
 * Necesita el índice compuesto stepLogs (athleteId, date).
 */
export async function getStepsForDate(email: string, date: string): Promise<StepLog | null> {
  const enLocal = () => getLocalSteps().find(s => s.athleteId === email && s.date === date) ?? null;
  if (forceLocalOnly) return enLocal();
  try {
    const snap = await getDocs(query(
      collection(db, 'stepLogs'),
      where('athleteId', '==', email),
      where('date', '==', date),
      limit(1),
    ));
    const d = snap.docs[0];
    if (!d) return null;
    const log = { id: d.id, ...d.data() } as StepLog;
    // Un solo día SÍ puede tocar el espejo local: se sustituye esa fecha, no se
    // borra el resto del historial.
    saveLocalSteps([...getLocalSteps().filter(s => !(s.athleteId === email && s.date === date)), log]);
    return log;
  } catch (err) {
    console.warn('getStepsForDate Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return enLocal();
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
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
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
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalSteps(updated);
  }
}


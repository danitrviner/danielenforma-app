import { db, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { AthleteCardioProfile, CardioAssignment, CardioSession, HrTest, HrvReading, CardioZones, CardioWeeklyGoal } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';

// ─── PERFIL CARDIO (zonas, doc id = athleteId) ─────────────────────────────

const PROFILE_LOCAL_KEY = 'enforma_cardio_profile_v1';

function getLocalProfileMap(): Record<string, AthleteCardioProfile> {
  try { return JSON.parse(localStorage.getItem(PROFILE_LOCAL_KEY) || '{}'); } catch { return {}; }
}
function saveLocalProfileMap(map: Record<string, AthleteCardioProfile>): void {
  localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(map));
}

// Karvonen (%FC de reserva) con Tanaka como FCmax de partida hasta que haya
// test real — ver `maxHREstimada` en utils/cardioZones.ts.
//
// Las bandas eran contiguas (z1.max = z2.min = 60% HRR), así que un pulso que
// caía justo en la frontera pertenecía a DOS zonas y `getZoneForBpm` lo
// resolvía por el orden del bucle: siempre la zona baja. Con el tiempo por
// zona eso son segundos mal imputados en cada cruce, que en una sesión de
// intervalos son muchos. Ahora el techo de cada zona es el suelo de la
// siguiente menos 1 ppm: las cinco bandas son disjuntas y cubren todo el
// rango sin huecos.
export function defaultZonesFromAge(restingHR: number, maxHR: number): CardioZones {
  const bpm = (pct: number) => Math.round(restingHR + pct * (maxHR - restingHR));
  const cortesBrutos = [0.5, 0.6, 0.7, 0.8, 0.9].map(bpm);
  // Con FC de reposo y FCmax muy cerca (un dato mal introducido, pero nada lo
  // impedía) dos cortes contiguos podían redondear al mismo ppm, dejando una
  // banda invertida (`min > max`) que `getZoneForBpm` nunca podía satisfacer:
  // esa zona desaparecía en silencio de toda sesión de esa persona. Se fuerza
  // cada corte a ser al menos 1 ppm mayor que el anterior — la única forma de
  // garantizar cinco bandas no vacías sin inventar una FC de reposo/máxima
  // distinta a la que se introdujo.
  const cortes: number[] = [];
  for (const c of cortesBrutos) cortes.push(cortes.length === 0 ? c : Math.max(c, cortes[cortes.length - 1] + 1));
  const techo = Math.max(bpm(1.0), cortes[4] + 1);
  const banda = (i: number) => ({ min: cortes[i], max: i < 4 ? cortes[i + 1] - 1 : techo });
  return { z1: banda(0), z2: banda(1), z3: banda(2), z4: banda(3), z5: banda(4) };
}

export async function getCardioProfile(athleteId: string): Promise<AthleteCardioProfile | null> {
  if (forceLocalOnly) return getLocalProfileMap()[athleteId] ?? null;
  try {
    const snap = await getDoc(doc(db, 'athleteCardioProfile', athleteId));
    const profile = snap.exists() ? (snap.data() as AthleteCardioProfile) : null;
    const map = getLocalProfileMap();
    if (profile) map[athleteId] = profile; else delete map[athleteId];
    saveLocalProfileMap(map);
    return profile;
  } catch (err) {
    console.warn('getCardioProfile Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalProfileMap()[athleteId] ?? null;
  }
}

export async function saveCardioProfile(profile: AthleteCardioProfile): Promise<void> {
  const map = getLocalProfileMap();
  map[profile.athleteId] = profile;
  if (forceLocalOnly) { saveLocalProfileMap(map); return; }
  try {
    await setDoc(doc(db, 'athleteCardioProfile', profile.athleteId), stripUndefined(profile), { merge: true });
    saveLocalProfileMap(map);
  } catch (err) {
    console.warn('saveCardioProfile Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalProfileMap(map);
  }
}

// ─── ASSIGNMENTS (prescripción de cardio) ──────────────────────────────────

const ASSIGNMENTS_LOCAL_KEY = 'enforma_cardio_assignments_v1';

function getLocalAssignments(): CardioAssignment[] {
  try { return JSON.parse(localStorage.getItem(ASSIGNMENTS_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalAssignments(list: CardioAssignment[]): void {
  localStorage.setItem(ASSIGNMENTS_LOCAL_KEY, JSON.stringify(list));
}

export async function getCardioAssignmentsForAthlete(athleteId: string): Promise<CardioAssignment[]> {
  if (forceLocalOnly) return getLocalAssignments().filter(a => a.athleteId === athleteId);
  try {
    const snap = await getDocs(query(collection(db, 'cardioAssignments'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardioAssignment));
    const merged = [...getLocalAssignments().filter(a => a.athleteId !== athleteId), ...list];
    saveLocalAssignments(merged);
    return list;
  } catch (err) {
    console.warn('getCardioAssignmentsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalAssignments().filter(a => a.athleteId === athleteId);
  }
}

export async function createCardioAssignment(data: Omit<CardioAssignment, 'id'>): Promise<CardioAssignment> {
  if (forceLocalOnly) {
    const a: CardioAssignment = { ...data, id: `local_ca_${Date.now()}` };
    saveLocalAssignments([...getLocalAssignments(), a]);
    return a;
  }
  try {
    const ref = await addDoc(collection(db, 'cardioAssignments'), stripUndefined(data));
    const a: CardioAssignment = { ...data, id: ref.id };
    saveLocalAssignments([...getLocalAssignments(), a]);
    return a;
  } catch (err) {
    console.warn('createCardioAssignment Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const a: CardioAssignment = { ...data, id: `local_ca_${Date.now()}` };
    saveLocalAssignments([...getLocalAssignments(), a]);
    return a;
  }
}

export async function updateCardioAssignment(id: string, updates: Partial<CardioAssignment>): Promise<void> {
  const updated = getLocalAssignments().map(a => a.id === id ? { ...a, ...updates } : a);
  if (forceLocalOnly) { saveLocalAssignments(updated); return; }
  try {
    await updateDoc(doc(db, 'cardioAssignments', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalAssignments(updated);
  } catch (err) {
    console.warn('updateCardioAssignment Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalAssignments(updated);
  }
}

export async function deleteCardioAssignment(id: string): Promise<void> {
  const filtered = getLocalAssignments().filter(a => a.id !== id);
  if (forceLocalOnly) { saveLocalAssignments(filtered); return; }
  try {
    await deleteDoc(doc(db, 'cardioAssignments', id));
    saveLocalAssignments(filtered);
  } catch (err) {
    console.warn('deleteCardioAssignment Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalAssignments(filtered);
  }
}

// ─── SESSIONS (sesiones de cardio registradas) ─────────────────────────────

const SESSIONS_LOCAL_KEY = 'enforma_cardio_sessions_v1';

function getLocalSessions(): CardioSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalSessions(list: CardioSession[]): void {
  localStorage.setItem(SESSIONS_LOCAL_KEY, JSON.stringify(list));
}

export async function getCardioSessionsForAthlete(athleteId: string): Promise<CardioSession[]> {
  if (forceLocalOnly) return getLocalSessions().filter(s => s.athleteId === athleteId);
  try {
    const snap = await getDocs(query(collection(db, 'cardioSessions'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardioSession));
    const merged = [...getLocalSessions().filter(s => s.athleteId !== athleteId), ...list];
    saveLocalSessions(merged);
    return list;
  } catch (err) {
    console.warn('getCardioSessionsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalSessions().filter(s => s.athleteId === athleteId);
  }
}

export async function createCardioSession(data: Omit<CardioSession, 'id'>): Promise<CardioSession> {
  if (forceLocalOnly) {
    const s: CardioSession = { ...data, id: `local_cs_${Date.now()}` };
    saveLocalSessions([...getLocalSessions(), s]);
    return s;
  }
  try {
    const ref = await addDoc(collection(db, 'cardioSessions'), stripUndefined(data));
    const s: CardioSession = { ...data, id: ref.id };
    saveLocalSessions([...getLocalSessions(), s]);
    return s;
  } catch (err) {
    console.warn('createCardioSession Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const s: CardioSession = { ...data, id: `local_cs_${Date.now()}` };
    saveLocalSessions([...getLocalSessions(), s]);
    return s;
  }
}

// Edición post-entreno (§6 del análisis): título, notas, etiquetas, y los
// campos manuales de una sesión "alta a mano". El `type` NUNCA se edita aquí
// — como en FITIV, el tipo de sesión es fijo desde que se crea.
export async function updateCardioSession(id: string, updates: Partial<Omit<CardioSession, 'id' | 'athleteId' | 'type'>>): Promise<void> {
  const updated = getLocalSessions().map(s => s.id === id ? { ...s, ...updates } : s);
  if (forceLocalOnly) { saveLocalSessions(updated); return; }
  try {
    await updateDoc(doc(db, 'cardioSessions', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalSessions(updated);
  } catch (err) {
    console.warn('updateCardioSession Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalSessions(updated);
  }
}

// ─── HR TESTS (batería de tests de campo) ──────────────────────────────────

const HRTESTS_LOCAL_KEY = 'enforma_hr_tests_v1';

function getLocalHrTests(): HrTest[] {
  try { return JSON.parse(localStorage.getItem(HRTESTS_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalHrTests(list: HrTest[]): void {
  localStorage.setItem(HRTESTS_LOCAL_KEY, JSON.stringify(list));
}

export async function getHrTestsForAthlete(athleteId: string): Promise<HrTest[]> {
  if (forceLocalOnly) return getLocalHrTests().filter(t => t.athleteId === athleteId);
  try {
    const snap = await getDocs(query(collection(db, 'hrTests'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as HrTest));
    const merged = [...getLocalHrTests().filter(t => t.athleteId !== athleteId), ...list];
    saveLocalHrTests(merged);
    return list;
  } catch (err) {
    console.warn('getHrTestsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalHrTests().filter(t => t.athleteId === athleteId);
  }
}

export async function getAllPendingHrTests(): Promise<HrTest[]> {
  if (forceLocalOnly) return getLocalHrTests().filter(t => !t.approvedByCoach);
  try {
    const snap = await getDocs(query(collection(db, 'hrTests'), where('approvedByCoach', '==', false)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as HrTest));
  } catch (err) {
    console.warn('getAllPendingHrTests Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalHrTests().filter(t => !t.approvedByCoach);
  }
}

export async function createHrTest(data: Omit<HrTest, 'id'>): Promise<HrTest> {
  if (forceLocalOnly) {
    const t: HrTest = { ...data, id: `local_hrt_${Date.now()}` };
    saveLocalHrTests([...getLocalHrTests(), t]);
    return t;
  }
  try {
    const ref = await addDoc(collection(db, 'hrTests'), stripUndefined(data));
    const t: HrTest = { ...data, id: ref.id };
    saveLocalHrTests([...getLocalHrTests(), t]);
    return t;
  } catch (err) {
    console.warn('createHrTest Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const t: HrTest = { ...data, id: `local_hrt_${Date.now()}` };
    saveLocalHrTests([...getLocalHrTests(), t]);
    return t;
  }
}

export async function updateHrTest(id: string, updates: Partial<HrTest>): Promise<void> {
  const updated = getLocalHrTests().map(t => t.id === id ? { ...t, ...updates } : t);
  if (forceLocalOnly) { saveLocalHrTests(updated); return; }
  try {
    await updateDoc(doc(db, 'hrTests', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalHrTests(updated);
  } catch (err) {
    console.warn('updateHrTest Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalHrTests(updated);
  }
}

// ─── OBJETIVO SEMANAL DE CARDIO (F3.9, doc id `${athleteId}_${isoWeek}`) ───

const WEEKLY_GOAL_LOCAL_KEY = 'enforma_cardio_weekly_goal_v1';

function getLocalWeeklyGoals(): Record<string, CardioWeeklyGoal> {
  try { return JSON.parse(localStorage.getItem(WEEKLY_GOAL_LOCAL_KEY) || '{}'); } catch { return {}; }
}
function saveLocalWeeklyGoals(map: Record<string, CardioWeeklyGoal>): void {
  localStorage.setItem(WEEKLY_GOAL_LOCAL_KEY, JSON.stringify(map));
}

export async function getCardioWeeklyGoal(athleteId: string, isoWeek: string): Promise<CardioWeeklyGoal | null> {
  const id = `${athleteId}_${isoWeek}`;
  if (forceLocalOnly) return getLocalWeeklyGoals()[id] ?? null;
  try {
    const snap = await getDoc(doc(db, 'cardioWeeklyGoals', id));
    const goal = snap.exists() ? ({ id, ...snap.data() } as CardioWeeklyGoal) : null;
    const map = getLocalWeeklyGoals();
    if (goal) map[id] = goal; else delete map[id];
    saveLocalWeeklyGoals(map);
    return goal;
  } catch (err) {
    console.warn('getCardioWeeklyGoal Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalWeeklyGoals()[id] ?? null;
  }
}

export async function saveCardioWeeklyGoal(goal: CardioWeeklyGoal): Promise<void> {
  const map = getLocalWeeklyGoals();
  map[goal.id] = goal;
  if (forceLocalOnly) { saveLocalWeeklyGoals(map); return; }
  try {
    await setDoc(doc(db, 'cardioWeeklyGoals', goal.id), stripUndefined(goal), { merge: true });
    saveLocalWeeklyGoals(map);
  } catch (err) {
    console.warn('saveCardioWeeklyGoal Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalWeeklyGoals(map);
  }
}

// ─── HRV MATINAL (F8 — lectura diaria, no requiere aprobación del coach) ───

const HRV_LOCAL_KEY = 'enforma_hrv_readings_v1';

function getLocalHrvReadings(): HrvReading[] {
  try { return JSON.parse(localStorage.getItem(HRV_LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocalHrvReadings(list: HrvReading[]): void {
  localStorage.setItem(HRV_LOCAL_KEY, JSON.stringify(list));
}

export async function getHrvReadingsForAthlete(athleteId: string): Promise<HrvReading[]> {
  if (forceLocalOnly) return getLocalHrvReadings().filter(r => r.athleteId === athleteId);
  try {
    const snap = await getDocs(query(collection(db, 'hrvReadings'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as HrvReading));
    const merged = [...getLocalHrvReadings().filter(r => r.athleteId !== athleteId), ...list];
    saveLocalHrvReadings(merged);
    return list;
  } catch (err) {
    console.warn('getHrvReadingsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalHrvReadings().filter(r => r.athleteId === athleteId);
  }
}

export async function createHrvReading(data: Omit<HrvReading, 'id'>): Promise<HrvReading> {
  if (forceLocalOnly) {
    const r: HrvReading = { ...data, id: `local_hrv_${Date.now()}` };
    saveLocalHrvReadings([...getLocalHrvReadings(), r]);
    return r;
  }
  try {
    const ref = await addDoc(collection(db, 'hrvReadings'), stripUndefined(data));
    const r: HrvReading = { ...data, id: ref.id };
    saveLocalHrvReadings([...getLocalHrvReadings(), r]);
    return r;
  } catch (err) {
    console.warn('createHrvReading Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const r: HrvReading = { ...data, id: `local_hrv_${Date.now()}` };
    saveLocalHrvReadings([...getLocalHrvReadings(), r]);
    return r;
  }
}

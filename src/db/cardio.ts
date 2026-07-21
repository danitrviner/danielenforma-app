import { db, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { AthleteCardioProfile, CardioAssignment, CardioSession, HrTest, CardioZones } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

// ─── PERFIL CARDIO (zonas, doc id = athleteId) ─────────────────────────────

const PROFILE_LOCAL_KEY = 'enforma_cardio_profile_v1';

function getLocalProfileMap(): Record<string, AthleteCardioProfile> {
  try { return JSON.parse(localStorage.getItem(PROFILE_LOCAL_KEY) || '{}'); } catch { return {}; }
}
function saveLocalProfileMap(map: Record<string, AthleteCardioProfile>): void {
  localStorage.setItem(PROFILE_LOCAL_KEY, JSON.stringify(map));
}

// Karvonen (%HRR) con Tanaka como FCmax de partida hasta que haya test real.
export function defaultZonesFromAge(restingHR: number, maxHR: number): CardioZones {
  const band = (loPct: number, hiPct: number) => ({
    min: Math.round(restingHR + loPct * (maxHR - restingHR)),
    max: Math.round(restingHR + hiPct * (maxHR - restingHR)),
  });
  return { z1: band(0.5, 0.6), z2: band(0.6, 0.7), z3: band(0.7, 0.8), z4: band(0.8, 0.9), z5: band(0.9, 1.0) };
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
    const s: CardioSession = { ...data, id: `local_cs_${Date.now()}` };
    saveLocalSessions([...getLocalSessions(), s]);
    return s;
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
    saveLocalHrTests(updated);
  }
}

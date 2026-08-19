import { db, doc, getDoc, setDoc, deleteDoc } from '../firebase';
import { CoachInstructions, CoachQuickReplies } from '../types';
import { DOCTRINA_DEFAULTS, type DoctrinaKind } from '../ai/doctrina';
import { forceLocalOnly, setLocalBypassMode, esFalloDePermisos } from './core';

// ─── INSTRUCCIONES FIJAS DEL COACH (para el asistente IA) ───────────────────────
// Doc único (id determinista 'main'): reglas propias de Dani, con prioridad
// sobre convenciones genéricas del prompt. Editable desde AiChatPanel.

const COACH_INSTRUCTIONS_LOCAL_KEY = 'enforma_coach_instructions_v1';
const COACH_INSTRUCTIONS_DOC_ID = 'main';

export async function getCoachInstructions(): Promise<string> {
  if (forceLocalOnly) return localStorage.getItem(COACH_INSTRUCTIONS_LOCAL_KEY) ?? '';
  try {
    const snap = await getDoc(doc(db, 'coachSettings', COACH_INSTRUCTIONS_DOC_ID));
    const text = snap.exists() ? ((snap.data() as CoachInstructions).text ?? '') : '';
    localStorage.setItem(COACH_INSTRUCTIONS_LOCAL_KEY, text);
    return text;
  } catch (err) {
    console.warn('getCoachInstructions Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return localStorage.getItem(COACH_INSTRUCTIONS_LOCAL_KEY) ?? '';
  }
}

// ─── DOCTRINA DEL COACH (criterio de entrenamiento / nutrición para la IA) ─────
// Dos docs más en la misma colección, mismo patrón que las instrucciones fijas.
// La diferencia con `coachSettings/main`: aquello son reglas puntuales que Dani
// añade sobre la marcha ("empieza con descarga"); esto es su criterio completo,
// que llega con un valor por defecto ya escrito para que el asistente no opere
// nunca sin doctrina. Un doc vacío es una decisión ("no quiero doctrina aquí")
// y se respeta; un doc INEXISTENTE significa que aún no lo ha tocado, y ahí se
// usa el default — por eso hace falta distinguir null de ''.

const DOCTRINA_DOC_IDS: Record<DoctrinaKind, string> = {
  entrenamiento: 'doctrinaEntrenamiento',
  nutricion: 'doctrinaNutricion',
};

const doctrinaLocalKey = (kind: DoctrinaKind) => `enforma_doctrina_${kind}_v1`;

/** Texto guardado, o null si Dani nunca lo ha tocado (→ usar el default). */
async function getDoctrinaRaw(kind: DoctrinaKind): Promise<string | null> {
  const local = localStorage.getItem(doctrinaLocalKey(kind));
  if (forceLocalOnly) return local;
  try {
    const snap = await getDoc(doc(db, 'coachSettings', DOCTRINA_DOC_IDS[kind]));
    if (!snap.exists()) return null;
    const text = (snap.data() as CoachInstructions).text ?? '';
    localStorage.setItem(doctrinaLocalKey(kind), text);
    return text;
  } catch (err) {
    console.warn(`getDoctrina(${kind}) Firestore failed, using local:`, err);
    setLocalBypassMode(true, err);
    return local;
  }
}

/** Lo que se manda al modelo: lo de Dani si lo ha tocado, el default si no. */
export async function getDoctrina(kind: DoctrinaKind): Promise<string> {
  const raw = await getDoctrinaRaw(kind);
  return raw === null ? DOCTRINA_DEFAULTS[kind] : raw;
}

/** Para el editor: además de la doctrina activa, si viene del default o no. */
export async function getDoctrinaParaEditar(
  kind: DoctrinaKind,
): Promise<{ text: string; esDefault: boolean }> {
  const raw = await getDoctrinaRaw(kind);
  return raw === null
    ? { text: DOCTRINA_DEFAULTS[kind], esDefault: true }
    : { text: raw, esDefault: false };
}

export async function saveDoctrina(kind: DoctrinaKind, text: string): Promise<void> {
  localStorage.setItem(doctrinaLocalKey(kind), text);
  if (forceLocalOnly) return;
  try {
    const data: CoachInstructions = { text, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'coachSettings', DOCTRINA_DOC_IDS[kind]), data);
  } catch (err) {
    console.warn(`saveDoctrina(${kind}) Firestore failed, kept local:`, err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

/** Vuelve al criterio por defecto: borra la copia de Dani en vez de escribir el
 *  texto del default como si fuera suyo — así el default sigue evolucionando
 *  con la app y el editor puede seguir diciendo "estás usando el de por defecto". */
export async function resetDoctrina(kind: DoctrinaKind): Promise<void> {
  localStorage.removeItem(doctrinaLocalKey(kind));
  if (forceLocalOnly) return;
  try {
    await deleteDoc(doc(db, 'coachSettings', DOCTRINA_DOC_IDS[kind]));
  } catch (err) {
    console.warn(`resetDoctrina(${kind}) Firestore failed:`, err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

// ─── NOTA DE ESTADO POR ATLETA (panel visual del ClientHub, solo-coach) ─────────
// Texto libre del coach: "qué está haciendo ahora" este cliente. Doc por email
// en athleteStatus. Complementa los datos derivados (fase, objetivo, cambios).

const ATHLETE_STATUS_LOCAL_KEY = 'enforma_athlete_status_v1';

function getLocalStatusNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(ATHLETE_STATUS_LOCAL_KEY) ?? '{}'); } catch { return {}; }
}

export async function getAthleteStatusNote(email: string): Promise<string> {
  if (forceLocalOnly) return getLocalStatusNotes()[email] ?? '';
  try {
    const snap = await getDoc(doc(db, 'athleteStatus', email));
    return snap.exists() ? ((snap.data().note as string) ?? '') : '';
  } catch (err) {
    console.warn('getAthleteStatusNote Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalStatusNotes()[email] ?? '';
  }
}

export async function saveAthleteStatusNote(email: string, note: string): Promise<void> {
  const all = getLocalStatusNotes();
  all[email] = note;
  localStorage.setItem(ATHLETE_STATUS_LOCAL_KEY, JSON.stringify(all));
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, 'athleteStatus', email), { note, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('saveAthleteStatusNote Firestore failed, kept local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

export async function saveCoachInstructions(text: string): Promise<void> {
  localStorage.setItem(COACH_INSTRUCTIONS_LOCAL_KEY, text);
  if (forceLocalOnly) return;
  try {
    const data: CoachInstructions = { text, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'coachSettings', COACH_INSTRUCTIONS_DOC_ID), data);
  } catch (err) {
    console.warn('saveCoachInstructions Firestore failed, kept local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

// ─── PLANTILLAS DE FEEDBACK RÁPIDO (Revisiones) ─────────────────────────────────
// Doc separado ('quickReplies') en la misma colección coachSettings — mismo
// patrón simple que las instrucciones fijas del coach.

const QUICK_REPLIES_LOCAL_KEY = 'enforma_quick_replies_v1';
const QUICK_REPLIES_DOC_ID = 'quickReplies';

export async function getQuickReplies(): Promise<string[]> {
  const local = (): string[] => {
    try { return JSON.parse(localStorage.getItem(QUICK_REPLIES_LOCAL_KEY) ?? '[]'); } catch { return []; }
  };
  if (forceLocalOnly) return local();
  try {
    const snap = await getDoc(doc(db, 'coachSettings', QUICK_REPLIES_DOC_ID));
    const replies = snap.exists() ? ((snap.data() as CoachQuickReplies).replies ?? []) : [];
    localStorage.setItem(QUICK_REPLIES_LOCAL_KEY, JSON.stringify(replies));
    return replies;
  } catch (err) {
    console.warn('getQuickReplies Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return local();
  }
}

export async function saveQuickReplies(replies: string[]): Promise<void> {
  localStorage.setItem(QUICK_REPLIES_LOCAL_KEY, JSON.stringify(replies));
  if (forceLocalOnly) return;
  try {
    const data: CoachQuickReplies = { replies, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'coachSettings', QUICK_REPLIES_DOC_ID), data);
  } catch (err) {
    console.warn('saveQuickReplies Firestore failed, kept local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

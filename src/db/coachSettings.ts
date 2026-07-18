import { db, doc, getDoc, setDoc } from '../firebase';
import { CoachInstructions, CoachQuickReplies } from '../types';
import { forceLocalOnly, setLocalBypassMode } from './core';

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
    setLocalBypassMode(true);
    return localStorage.getItem(COACH_INSTRUCTIONS_LOCAL_KEY) ?? '';
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
  }
}

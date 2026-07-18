import { db, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { Questionnaire, QuestionnaireAssignment, QuestionnaireResponse } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

// ─── QUESTIONNAIRES ──────────────────────────────────────────────────────────
// Collection: questionnaires  (owned by coach — ownerId == coachUid)

const LOCAL_QUESTIONNAIRES = 'questionnaires_v1';

function getLocalQuestionnaires(): Questionnaire[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_QUESTIONNAIRES) || '[]'); } catch { return []; }
}

export async function getQuestionnairesByCoach(coachUid: string): Promise<Questionnaire[]> {
  if (forceLocalOnly) return getLocalQuestionnaires().filter(q => q.ownerId === coachUid);
  try {
    const snap = await getDocs(query(collection(db, 'questionnaires'), where('ownerId', '==', coachUid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Questionnaire));
  } catch (err) {
    console.warn('getQuestionnairesByCoach Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalQuestionnaires().filter(q => q.ownerId === coachUid);
  }
}

export async function createQuestionnaire(data: Omit<Questionnaire, 'id'>): Promise<Questionnaire> {
  if (forceLocalOnly) {
    const q: Questionnaire = { ...data, id: `local_q_${Date.now()}` };
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify([...getLocalQuestionnaires(), q]));
    return q;
  }
  try {
    const ref = await addDoc(collection(db, 'questionnaires'), stripUndefined(data));
    return { ...data, id: ref.id };
  } catch (err) {
    console.warn('createQuestionnaire Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const q: Questionnaire = { ...data, id: `local_q_${Date.now()}` };
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify([...getLocalQuestionnaires(), q]));
    return q;
  }
}

export async function updateQuestionnaire(id: string, updates: Partial<Omit<Questionnaire, 'id'>>): Promise<void> {
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().map(q => q.id === id ? { ...q, ...updates } : q)));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaires', id), stripUndefined(updates) as Record<string, unknown>);
  } catch (err) {
    console.warn('updateQuestionnaire Firestore failed, updating local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().map(q => q.id === id ? { ...q, ...updates } : q)));
  }
}

export async function deleteQuestionnaire(id: string): Promise<void> {
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().filter(q => q.id !== id)));
    return;
  }
  try {
    await deleteDoc(doc(db, 'questionnaires', id));
  } catch (err) {
    console.warn('deleteQuestionnaire Firestore failed, deleting local:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().filter(q => q.id !== id)));
  }
}

// ─── QUESTIONNAIRE ASSIGNMENTS ───────────────────────────────────────────────
// Collection: questionnaireAssignments  (athleteId = email)

const LOCAL_Q_ASSIGNMENTS = 'questionnaireAssignments_v1';

function getLocalQAssignments(): QuestionnaireAssignment[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_Q_ASSIGNMENTS) || '[]'); } catch { return []; }
}

export async function assignQuestionnaire(data: Omit<QuestionnaireAssignment, 'id'>): Promise<QuestionnaireAssignment> {
  // Guarantee schedule is always present — stripUndefined would remove it if undefined,
  // producing a Firestore document that crashes isDueToday on read.
  const safeData = { ...data, schedule: data.schedule ?? { type: 'once' as const } };
  if (forceLocalOnly) {
    const a: QuestionnaireAssignment = { ...safeData, id: `local_qa_${Date.now()}` };
    localStorage.setItem(LOCAL_Q_ASSIGNMENTS, JSON.stringify([...getLocalQAssignments(), a]));
    return a;
  }
  try {
    const ref = await addDoc(collection(db, 'questionnaireAssignments'), stripUndefined(safeData));
    return { ...safeData, id: ref.id };
  } catch (err) {
    console.warn('assignQuestionnaire Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const a: QuestionnaireAssignment = { ...safeData, id: `local_qa_${Date.now()}` };
    localStorage.setItem(LOCAL_Q_ASSIGNMENTS, JSON.stringify([...getLocalQAssignments(), a]));
    return a;
  }
}

export async function getAssignmentsForAthlete(email: string): Promise<QuestionnaireAssignment[]> {
  if (forceLocalOnly) return getLocalQAssignments().filter(a => a.athleteId === email);
  try {
    const snap = await getDocs(query(collection(db, 'questionnaireAssignments'), where('athleteId', '==', email)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionnaireAssignment));
  } catch (err) {
    console.warn('getAssignmentsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalQAssignments().filter(a => a.athleteId === email);
  }
}

export async function deactivateAssignment(id: string): Promise<void> {
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_Q_ASSIGNMENTS, JSON.stringify(getLocalQAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaireAssignments', id), { active: false });
  } catch (err) {
    console.warn('deactivateAssignment Firestore failed:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_Q_ASSIGNMENTS, JSON.stringify(getLocalQAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
  }
}

// ─── QUESTIONNAIRE RESPONSES ─────────────────────────────────────────────────
// Collection: questionnaireResponses  (athleteId = email)

const LOCAL_Q_RESPONSES = 'questionnaireResponses_v1';

function getLocalQResponses(): QuestionnaireResponse[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_Q_RESPONSES) || '[]'); } catch { return []; }
}

export async function submitResponse(data: Omit<QuestionnaireResponse, 'id'>): Promise<QuestionnaireResponse> {
  if (forceLocalOnly) {
    const r: QuestionnaireResponse = { ...data, id: `local_qr_${Date.now()}` };
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify([...getLocalQResponses(), r]));
    return r;
  }
  try {
    const ref = await addDoc(collection(db, 'questionnaireResponses'), stripUndefined(data));
    return { ...data, id: ref.id };
  } catch (err) {
    console.warn('submitResponse Firestore failed, saving local:', err);
    setLocalBypassMode(true);
    const r: QuestionnaireResponse = { ...data, id: `local_qr_${Date.now()}` };
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify([...getLocalQResponses(), r]));
    return r;
  }
}

export async function getQuestionnaireById(id: string): Promise<Questionnaire | null> {
  try {
    const snap = await getDoc(doc(db, 'questionnaires', id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Questionnaire) : null;
  } catch {
    const local: Questionnaire[] = JSON.parse(localStorage.getItem(LOCAL_QUESTIONNAIRES) || '[]');
    return local.find(q => q.id === id) ?? null;
  }
}

export async function getResponsesForAthlete(email: string): Promise<QuestionnaireResponse[]> {
  if (forceLocalOnly) return getLocalQResponses().filter(r => r.athleteId === email);
  try {
    const snap = await getDocs(query(collection(db, 'questionnaireResponses'), where('athleteId', '==', email)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionnaireResponse));
  } catch (err) {
    console.warn('getResponsesForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true);
    return getLocalQResponses().filter(r => r.athleteId === email);
  }
}

export async function getResponsesByQuestionnaireIds(ids: string[]): Promise<QuestionnaireResponse[]> {
  if (ids.length === 0) return [];
  if (forceLocalOnly) {
    const local = getLocalQResponses();
    return local.filter(r => ids.includes(r.questionnaireId));
  }
  try {
    const batches: Promise<QuestionnaireResponse[]>[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      batches.push(
        getDocs(query(collection(db, 'questionnaireResponses'), where('questionnaireId', 'in', batch)))
          .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionnaireResponse)))
      );
    }
    const results = await Promise.all(batches);
    return results.flat();
  } catch (err) {
    console.warn('getResponsesByQuestionnaireIds Firestore failed:', err);
    setLocalBypassMode(true);
    const local = getLocalQResponses();
    return local.filter(r => ids.includes(r.questionnaireId));
  }
}

export async function updateQuestionnaireResponse(
  id: string,
  answers: QuestionnaireResponse['answers'],
): Promise<void> {
  const patch = (list: QuestionnaireResponse[]) =>
    list.map(r => r.id === id ? { ...r, answers } : r);
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaireResponses', id), { answers });
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
  } catch (err) {
    console.warn('updateQuestionnaireResponse failed:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
  }
}

export async function deleteQuestionnaireResponse(id: string): Promise<void> {
  const remove = (list: QuestionnaireResponse[]) => list.filter(r => r.id !== id);
  if (forceLocalOnly) {
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(remove(getLocalQResponses())));
    return;
  }
  try {
    await deleteDoc(doc(db, 'questionnaireResponses', id));
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(remove(getLocalQResponses())));
  } catch (err) {
    console.warn('deleteQuestionnaireResponse failed:', err);
    setLocalBypassMode(true);
    localStorage.setItem(LOCAL_Q_RESPONSES, JSON.stringify(remove(getLocalQResponses())));
  }
}

// Collection: bodyweightLogs  (athleteId = email)

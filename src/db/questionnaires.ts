import { db, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import { Questionnaire, QuestionnaireAssignment, QuestionnairePack, QuestionnaireResponse } from '../types';
import {
  forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos,
  conTimeout, EscrituraEncolada, escribirEnLotes,
} from './core';
import { escribirLocal } from '../utils/almacenLocal';

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
    setLocalBypassMode(true, err);
    return getLocalQuestionnaires().filter(q => q.ownerId === coachUid);
  }
}

export async function createQuestionnaire(data: Omit<Questionnaire, 'id'>): Promise<Questionnaire> {
  if (forceLocalOnly) {
    const q: Questionnaire = { ...data, id: `local_q_${Date.now()}` };
    escribirLocal(LOCAL_QUESTIONNAIRES, JSON.stringify([...getLocalQuestionnaires(), q]));
    return q;
  }
  try {
    const ref = await addDoc(collection(db, 'questionnaires'), stripUndefined(data));
    return { ...data, id: ref.id };
  } catch (err) {
    console.warn('createQuestionnaire Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const q: Questionnaire = { ...data, id: `local_q_${Date.now()}` };
    escribirLocal(LOCAL_QUESTIONNAIRES, JSON.stringify([...getLocalQuestionnaires(), q]));
    return q;
  }
}

export async function updateQuestionnaire(id: string, updates: Partial<Omit<Questionnaire, 'id'>>): Promise<void> {
  if (forceLocalOnly) {
    escribirLocal(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().map(q => q.id === id ? { ...q, ...updates } : q)));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaires', id), stripUndefined(updates) as Record<string, unknown>);
  } catch (err) {
    console.warn('updateQuestionnaire Firestore failed, updating local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    escribirLocal(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().map(q => q.id === id ? { ...q, ...updates } : q)));
  }
}

export async function deleteQuestionnaire(id: string): Promise<void> {
  if (forceLocalOnly) {
    escribirLocal(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().filter(q => q.id !== id)));
    return;
  }
  try {
    await deleteDoc(doc(db, 'questionnaires', id));
  } catch (err) {
    console.warn('deleteQuestionnaire Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    escribirLocal(LOCAL_QUESTIONNAIRES, JSON.stringify(getLocalQuestionnaires().filter(q => q.id !== id)));
  }
}

// ─── PAQUETES DE CUESTIONARIOS ───────────────────────────────────────────────
// Collection: questionnairePacks  (owned by coach — ownerId == coachUid)
//
// Mismo patrón de degradación que el resto del fichero: si Firestore falla, se
// escribe en local y la app sigue. Un paquete no es dato crítico del atleta —
// es una plantilla de trabajo del coach.

const LOCAL_Q_PACKS = 'questionnairePacks_v1';

function getLocalPacks(): QuestionnairePack[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_Q_PACKS) || '[]'); } catch { return []; }
}

export async function getQuestionnairePacksByCoach(coachUid: string): Promise<QuestionnairePack[]> {
  if (forceLocalOnly) return getLocalPacks().filter(p => p.ownerId === coachUid);
  try {
    const snap = await getDocs(query(collection(db, 'questionnairePacks'), where('ownerId', '==', coachUid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionnairePack));
  } catch (err) {
    console.warn('getQuestionnairePacksByCoach Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalPacks().filter(p => p.ownerId === coachUid);
  }
}

export async function createQuestionnairePack(data: Omit<QuestionnairePack, 'id'>): Promise<QuestionnairePack> {
  if (forceLocalOnly) {
    const p: QuestionnairePack = { ...data, id: `local_qp_${Date.now()}` };
    escribirLocal(LOCAL_Q_PACKS, JSON.stringify([...getLocalPacks(), p]));
    return p;
  }
  try {
    const ref = await addDoc(collection(db, 'questionnairePacks'), stripUndefined(data));
    return { ...data, id: ref.id };
  } catch (err) {
    console.warn('createQuestionnairePack Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const p: QuestionnairePack = { ...data, id: `local_qp_${Date.now()}` };
    escribirLocal(LOCAL_Q_PACKS, JSON.stringify([...getLocalPacks(), p]));
    return p;
  }
}

export async function updateQuestionnairePack(id: string, updates: Partial<Omit<QuestionnairePack, 'id'>>): Promise<void> {
  if (forceLocalOnly) {
    escribirLocal(LOCAL_Q_PACKS, JSON.stringify(getLocalPacks().map(p => p.id === id ? { ...p, ...updates } : p)));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnairePacks', id), stripUndefined(updates) as Record<string, unknown>);
  } catch (err) {
    console.warn('updateQuestionnairePack Firestore failed, updating local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    escribirLocal(LOCAL_Q_PACKS, JSON.stringify(getLocalPacks().map(p => p.id === id ? { ...p, ...updates } : p)));
  }
}

export async function deleteQuestionnairePack(id: string): Promise<void> {
  if (forceLocalOnly) {
    escribirLocal(LOCAL_Q_PACKS, JSON.stringify(getLocalPacks().filter(p => p.id !== id)));
    return;
  }
  try {
    await deleteDoc(doc(db, 'questionnairePacks', id));
  } catch (err) {
    console.warn('deleteQuestionnairePack Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    escribirLocal(LOCAL_Q_PACKS, JSON.stringify(getLocalPacks().filter(p => p.id !== id)));
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
    escribirLocal(LOCAL_Q_ASSIGNMENTS, JSON.stringify([...getLocalQAssignments(), a]));
    return a;
  }
  try {
    const ref = await addDoc(collection(db, 'questionnaireAssignments'), stripUndefined(safeData));
    return { ...safeData, id: ref.id };
  } catch (err) {
    console.warn('assignQuestionnaire Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const a: QuestionnaireAssignment = { ...safeData, id: `local_qa_${Date.now()}` };
    escribirLocal(LOCAL_Q_ASSIGNMENTS, JSON.stringify([...getLocalQAssignments(), a]));
    return a;
  }
}

/**
 * Asigna VARIOS cuestionarios de una vez, en un solo lote.
 *
 * Lo pedían dos pantallas que hacían lo mismo mal: la plantilla de
 * cuestionarios del mesociclo y los paquetes de la ficha del atleta, las dos
 * con un `for` y un `await assignQuestionnaire` dentro. Con diez filas, un
 * fallo en la sexta dejaba cinco asignaciones puestas y un error en pantalla:
 * el coach le da otra vez y ahora el atleta tiene cinco duplicadas, cada una
 * generando su propia notificación los lunes.
 *
 * Los ids se reservan ANTES de escribir (`doc(collection(...))` los genera en
 * el cliente), así que las asignaciones se devuelven con su id definitivo sin
 * tener que releer nada.
 */
export async function assignQuestionnairesBatch(
  datos: Omit<QuestionnaireAssignment, 'id'>[],
): Promise<QuestionnaireAssignment[]> {
  const seguros = datos.map(d => ({ ...d, schedule: d.schedule ?? { type: 'once' as const } }));
  if (seguros.length === 0) return [];

  if (forceLocalOnly) {
    const locales = seguros.map((d, i) => ({ ...d, id: `local_qa_${Date.now()}_${i}` }));
    escribirLocal(LOCAL_Q_ASSIGNMENTS, JSON.stringify([...getLocalQAssignments(), ...locales]));
    return locales;
  }
  try {
    const conRef = seguros.map(d => ({ datos: d, ref: doc(collection(db, 'questionnaireAssignments')) }));
    await escribirEnLotes(
      conRef.map(({ datos: d, ref }) => ({ tipo: 'set' as const, ref, datos: d as unknown as Record<string, unknown> })),
      'Asignar cuestionarios',
    );
    return conRef.map(({ datos: d, ref }) => ({ ...d, id: ref.id }));
  } catch (err) {
    console.warn('assignQuestionnairesBatch Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const locales = seguros.map((d, i) => ({ ...d, id: `local_qa_${Date.now()}_${i}` }));
    escribirLocal(LOCAL_Q_ASSIGNMENTS, JSON.stringify([...getLocalQAssignments(), ...locales]));
    return locales;
  }
}

export async function getAssignmentsForAthlete(email: string): Promise<QuestionnaireAssignment[]> {
  if (forceLocalOnly) return getLocalQAssignments().filter(a => a.athleteId === email);
  try {
    const snap = await getDocs(query(collection(db, 'questionnaireAssignments'), where('athleteId', '==', email)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionnaireAssignment));
  } catch (err) {
    console.warn('getAssignmentsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalQAssignments().filter(a => a.athleteId === email);
  }
}

export async function deactivateAssignment(id: string): Promise<void> {
  if (forceLocalOnly) {
    escribirLocal(LOCAL_Q_ASSIGNMENTS, JSON.stringify(getLocalQAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaireAssignments', id), { active: false });
  } catch (err) {
    console.warn('deactivateAssignment Firestore failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    escribirLocal(LOCAL_Q_ASSIGNMENTS, JSON.stringify(getLocalQAssignments().map(a => a.id === id ? { ...a, active: false } : a)));
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
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify([...getLocalQResponses(), r]));
    return r;
  }
  // 05-2. Igual que en createWorkoutLog: el id se reserva en el cliente para
  // que una escritura encolada guarde su copia local con el id definitivo, y no
  // con un `local_qr_<timestamp>` imposible de reconciliar después.
  const ref = doc(collection(db, 'questionnaireResponses'));
  const r: QuestionnaireResponse = { ...data, id: ref.id };

  try {
    await conTimeout('Enviar el cuestionario', setDoc(ref, stripUndefined(data)));
    return r;
  } catch (err) {
    // El check-in es lo que el coach lee para corregir la semana. Sin timeout,
    // enviarlo sin cobertura dejaba el botón girando y la persona repitiéndolo.
    if (err instanceof EscrituraEncolada) {
      console.info('submitResponse encolada, sube al recuperar conexión:', ref.id);
      escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify([...getLocalQResponses(), r]));
      return r;
    }
    console.warn('submitResponse Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const local: QuestionnaireResponse = { ...data, id: `local_qr_${Date.now()}` };
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify([...getLocalQResponses(), local]));
    return local;
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
    setLocalBypassMode(true, err);
    return getLocalQResponses().filter(r => r.athleteId === email);
  }
}

/**
 * Las respuestas de una lista de cuestionarios.
 *
 * `desde` (ISO completo) acota a lo reciente. Sin él se traen TODAS las
 * respuestas de todos los atletas desde siempre, y eso es lo que pagaba la
 * bandeja de Revisiones cada vez que se abría: una colección que solo crece,
 * para enseñar las últimas semanas.
 *
 * Se filtra también en memoria además de en la consulta, para que el camino
 * local y el de respaldo devuelvan lo mismo que el bueno.
 */
export async function getResponsesByQuestionnaireIds(
  ids: string[],
  desde?: string,
): Promise<QuestionnaireResponse[]> {
  if (ids.length === 0) return [];
  const recientes = (rs: QuestionnaireResponse[]) =>
    desde ? rs.filter(r => r.submittedAt >= desde) : rs;
  if (forceLocalOnly) {
    const local = getLocalQResponses();
    return recientes(local.filter(r => ids.includes(r.questionnaireId)));
  }
  try {
    const batches: Promise<QuestionnaireResponse[]>[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const base = [collection(db, 'questionnaireResponses'), where('questionnaireId', 'in', batch)] as const;
      batches.push(
        // `in` + rango sobre otro campo necesita índice compuesto, y este
        // código puede desplegarse antes que el índice. Si falla, se pide sin
        // el rango y se recorta aquí: más caro, pero la bandeja nunca aparece
        // vacía por un índice que falta.
        getDocs(desde
          ? query(...base, where('submittedAt', '>=', desde))
          : query(...base))
          .catch(() => getDocs(query(...base)))
          .then(snap => recientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionnaireResponse))))
      );
    }
    const results = await Promise.all(batches);
    return results.flat();
  } catch (err) {
    console.warn('getResponsesByQuestionnaireIds Firestore failed:', err);
    setLocalBypassMode(true, err);
    const local = getLocalQResponses();
    return recientes(local.filter(r => ids.includes(r.questionnaireId)));
  }
}

export async function updateQuestionnaireResponse(
  id: string,
  answers: QuestionnaireResponse['answers'],
): Promise<void> {
  const patch = (list: QuestionnaireResponse[]) =>
    list.map(r => r.id === id ? { ...r, answers } : r);
  if (forceLocalOnly) {
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaireResponses', id), { answers });
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
  } catch (err) {
    console.warn('updateQuestionnaireResponse failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
  }
}

/**
 * Marca una respuesta como vista por el coach, o le quita la marca.
 *
 * Es lo que permite que la bandeja de Revisiones sea una bandeja y no un
 * archivo: un check-in se saca contestándolo, pero una respuesta de
 * cuestionario no tiene respuesta que dar — se lee y ya.
 *
 * Se escribe `null` para desmarcar y no `undefined`: Firestore ignora
 * `undefined` en un `updateDoc`, así que «desmarcar» no habría hecho nada.
 */
export async function marcarRespuestaVista(id: string, vista: boolean): Promise<void> {
  const reviewedAt = vista ? new Date().toISOString() : undefined;
  const patch = (list: QuestionnaireResponse[]) =>
    list.map(r => r.id === id ? { ...r, reviewedAt } : r);
  if (forceLocalOnly) {
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
    return;
  }
  try {
    await updateDoc(doc(db, 'questionnaireResponses', id), { reviewedAt: reviewedAt ?? null });
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
  } catch (err) {
    console.warn('marcarRespuestaVista failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify(patch(getLocalQResponses())));
  }
}

export async function deleteQuestionnaireResponse(id: string): Promise<void> {
  const remove = (list: QuestionnaireResponse[]) => list.filter(r => r.id !== id);
  if (forceLocalOnly) {
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify(remove(getLocalQResponses())));
    return;
  }
  try {
    await deleteDoc(doc(db, 'questionnaireResponses', id));
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify(remove(getLocalQResponses())));
  } catch (err) {
    console.warn('deleteQuestionnaireResponse failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    escribirLocal(LOCAL_Q_RESPONSES, JSON.stringify(remove(getLocalQResponses())));
  }
}

// Collection: bodyweightLogs  (athleteId = email)

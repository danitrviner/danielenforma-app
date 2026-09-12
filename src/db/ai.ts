import { db, collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, writeBatch } from '../firebase';
import { AiChat, AiProposal, KnowledgeNote } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { leerCatalogo, marcarCatalogoCambiado } from './catalogoVersionado';

// ─── AI ASSISTANT (chats + propuestas, solo coach) ──────────────────────────────

const AI_CHATS_LOCAL_KEY = 'enforma_ai_chats_v1';
const AI_PROPOSALS_LOCAL_KEY = 'enforma_ai_proposals_v1';

function getLocalAiChats(): AiChat[] {
  try {
    const raw = localStorage.getItem(AI_CHATS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as AiChat[]) : [];
  } catch { return []; }
}

function saveLocalAiChats(chats: AiChat[]): void {
  localStorage.setItem(AI_CHATS_LOCAL_KEY, JSON.stringify(chats));
}

export async function getAiChats(): Promise<AiChat[]> {
  if (forceLocalOnly) return getLocalAiChats().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  try {
    const snap = await getDocs(collection(db, 'aiChats'));
    const chats = snap.docs.map(d => ({ id: d.id, ...d.data() } as AiChat));
    saveLocalAiChats(chats);
    return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    console.warn('getAiChats Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalAiChats().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

// Upsert — el id lo genera el panel al abrir el chat, así el mismo doc se va
// reescribiendo turno a turno.
export async function saveAiChat(chat: AiChat): Promise<void> {
  const others = getLocalAiChats().filter(c => c.id !== chat.id);
  saveLocalAiChats([...others, chat]);
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, 'aiChats', chat.id), stripUndefined(chat));
  } catch (err) {
    console.warn('saveAiChat Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

export async function deleteAiChat(id: string): Promise<void> {
  const filtered = getLocalAiChats().filter(c => c.id !== id);
  if (forceLocalOnly) { saveLocalAiChats(filtered); return; }
  try {
    await deleteDoc(doc(db, 'aiChats', id));
    saveLocalAiChats(filtered);
  } catch (err) {
    console.warn('deleteAiChat Firestore failed, deleting local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalAiChats(filtered);
  }
}

function getLocalAiProposals(): AiProposal[] {
  try {
    const raw = localStorage.getItem(AI_PROPOSALS_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as AiProposal[]) : [];
  } catch { return []; }
}

function saveLocalAiProposals(list: AiProposal[]): void {
  localStorage.setItem(AI_PROPOSALS_LOCAL_KEY, JSON.stringify(list));
}

export async function getAiProposalsForAthlete(athleteEmail: string): Promise<AiProposal[]> {
  if (forceLocalOnly) return getLocalAiProposals().filter(p => p.athleteId === athleteEmail);
  try {
    const q = query(collection(db, 'aiProposals'), where('athleteId', '==', athleteEmail));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as AiProposal));
    const others = getLocalAiProposals().filter(p => p.athleteId !== athleteEmail);
    saveLocalAiProposals([...others, ...list]);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    console.warn('getAiProposalsForAthlete Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalAiProposals().filter(p => p.athleteId === athleteEmail);
  }
}

/**
 * Todas las propuestas ya APROBADAS, de todos los atletas. Sirve para una cosa
 * concreta: comparar lo que la IA propuso con lo que quedó vivo y aprender qué
 * corrige Dani sistemáticamente (ver utils/derivaPropuestas.ts).
 *
 * Es un `where` de igualdad sin `orderBy`, a propósito: así le basta el índice
 * de campo simple que Firestore crea solo. Ordenar por `reviewedAt` en la
 * consulta pediría un índice compuesto que habría que desplegar, y las reglas
 * y los índices no se tocan mientras haya una build en revisión.
 */
export async function getApprovedAiProposals(): Promise<AiProposal[]> {
  const ordenar = (list: AiProposal[]) =>
    list.sort((a, b) => (b.reviewedAt ?? b.createdAt).localeCompare(a.reviewedAt ?? a.createdAt));
  if (forceLocalOnly) return ordenar(getLocalAiProposals().filter(p => p.status === 'approved'));
  try {
    const q = query(collection(db, 'aiProposals'), where('status', '==', 'approved'));
    const snap = await getDocs(q);
    return ordenar(snap.docs.map(d => ({ id: d.id, ...d.data() } as AiProposal)));
  } catch (err) {
    console.warn('getApprovedAiProposals Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return ordenar(getLocalAiProposals().filter(p => p.status === 'approved'));
  }
}

/**
 * Todas las propuestas PENDIENTES, de todos los atletas.
 *
 * El panel las pedía por atleta, con el email que venía de la URL. Eso dejaba
 * invisibles dos casos que pasan todos los días: una propuesta hecha para un
 * cliente mientras Dani está mirando la ficha de OTRO (el chat puede hablar de
 * quien quiera), y cualquier propuesta creada desde un chat abierto fuera de
 * `/clients/...`, donde no hay email en la URL y la consulta ni se lanzaba.
 * La IA decía «ya la tienes lista» y no aparecía en ninguna parte.
 *
 * Misma forma que getApprovedAiProposals: un `where` de igualdad sin
 * `orderBy`, que se resuelve con el índice de campo simple que Firestore crea
 * solo. Nada que desplegar.
 */
export async function getPendingAiProposals(): Promise<AiProposal[]> {
  const ordenar = (list: AiProposal[]) =>
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (forceLocalOnly) return ordenar(getLocalAiProposals().filter(p => p.status === 'proposed'));
  try {
    const q = query(collection(db, 'aiProposals'), where('status', '==', 'proposed'));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as AiProposal));
    // El espejo local se queda con estas y con las que no están pendientes
    // (aprobadas/rechazadas de antes), para no perderlas al refrescar.
    const otras = getLocalAiProposals().filter(p => p.status !== 'proposed');
    saveLocalAiProposals([...otras, ...list]);
    return ordenar(list);
  } catch (err) {
    console.warn('getPendingAiProposals Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return ordenar(getLocalAiProposals().filter(p => p.status === 'proposed'));
  }
}

export async function createAiProposal(data: Omit<AiProposal, 'id'>): Promise<AiProposal> {
  if (forceLocalOnly) {
    const proposal: AiProposal = { id: `aiprop_${Date.now()}`, ...data };
    saveLocalAiProposals([...getLocalAiProposals(), proposal]);
    return proposal;
  }
  try {
    const ref = await addDoc(collection(db, 'aiProposals'), stripUndefined(data));
    const proposal: AiProposal = { id: ref.id, ...data };
    saveLocalAiProposals([...getLocalAiProposals(), proposal]);
    return proposal;
  } catch (err) {
    console.warn('createAiProposal Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    const proposal: AiProposal = { id: `aiprop_${Date.now()}`, ...data };
    saveLocalAiProposals([...getLocalAiProposals(), proposal]);
    return proposal;
  }
}

export async function updateAiProposal(id: string, updates: Partial<AiProposal>): Promise<void> {
  const updated = getLocalAiProposals().map(p => p.id === id ? { ...p, ...updates } : p);
  if (forceLocalOnly) { saveLocalAiProposals(updated); return; }
  try {
    await updateDoc(doc(db, 'aiProposals', id), stripUndefined(updates) as Record<string, unknown>);
    saveLocalAiProposals(updated);
  } catch (err) {
    console.warn('updateAiProposal Firestore failed, saving local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    saveLocalAiProposals(updated);
  }
}

// ─── BASE DE CONOCIMIENTO (bóveda del coach, solo-coach) ────────────────────────
// Notas de metodología importadas desde Obsidian. La IA las consulta vía la tool
// search_knowledge. Cache local para búsqueda instantánea sin round-trips.

const KNOWLEDGE_LOCAL_KEY = 'enforma_knowledge_v1';

function getLocalKnowledge(): KnowledgeNote[] {
  try {
    const raw = localStorage.getItem(KNOWLEDGE_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as KnowledgeNote[]) : [];
  } catch { return []; }
}

function saveLocalKnowledge(notes: KnowledgeNote[]): void {
  try { localStorage.setItem(KNOWLEDGE_LOCAL_KEY, JSON.stringify(notes)); } catch { /* quota — la fuente de verdad es Firestore */ }
}

export async function getKnowledgeNotes(): Promise<KnowledgeNote[]> {
  if (forceLocalOnly) return getLocalKnowledge();
  try {
    // Mismo tratamiento versionado que los demás catálogos. Aquí importa
    // porque la bóveda se relee entera en cada arranque del panel de la IA y
    // crece con cada nota que Dani sincroniza, sin techo — y su contenido
    // cambia solo cuando él la resincroniza a propósito, que es justo el caso
    // que el sello de versión resuelve mejor.
    const notes = await leerCatalogo('knowledgeBase', 'knowledgeBase', d => ({ id: d.id, ...d.data() } as KnowledgeNote));
    saveLocalKnowledge(notes);
    return notes;
  } catch (err) {
    console.warn('getKnowledgeNotes Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalKnowledge();
  }
}

// Importa/reemplaza el lote entero de notas (el coach re-sincroniza la bóveda).
// Doc id determinista (`${folder}/${slug}` saneado) → reimportar no duplica.
// writeBatch en trozos de 400 (límite de 500 ops/batch de Firestore).
export async function bulkUpsertKnowledgeNotes(notes: KnowledgeNote[]): Promise<number> {
  saveLocalKnowledge(notes);
  if (forceLocalOnly) return notes.length;
  try {
    for (let i = 0; i < notes.length; i += 400) {
      const batch = writeBatch(db);
      for (const note of notes.slice(i, i + 400)) {
        const docId = note.id.replace(/\//g, '__');
        batch.set(doc(db, 'knowledgeBase', docId), stripUndefined(note));
      }
      await batch.commit();
    }
    void marcarCatalogoCambiado('knowledgeBase');
    return notes.length;
  } catch (err) {
    console.warn('bulkUpsertKnowledgeNotes Firestore failed, kept local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    return notes.length;
  }
}


/* Ficha viva del atleta.
 *
 * El problema que resuelve: al revisar un plan que ha propuesto la IA se
 * perdía todo lo que no era el plan — el porqué de cada decisión, las
 * preguntas que quedaron sin contestar, el foco de la siguiente revisión y los
 * cambios que Dani hacía a mano después. Vivía en un chat que se cierra.
 *
 * Vive en `athleteStatus/{email}`, el mismo documento que ya guardaba la nota
 * de estado del ClientHub: sin colección nueva y sin reglas que desplegar (las
 * de athleteStatus ya son solo-coach). Un documento que solo traiga la nota de siempre es
 * una ficha antigua perfectamente válida: los campos nuevos salen vacíos.
 *
 * Quién escribe qué:
 *   · `appendDossierFacts` — HECHOS. La IA los añade sola. Append-only: nada
 *     de reescribir el historial, porque el valor está justo en poder mirar
 *     atrás y ver qué se probó.
 *   · `saveDossierJudgement` — JUICIOS. Solo se llama al aprobar una propuesta
 *     de tipo 'dossier' o cuando Dani edita la ficha a mano.
 */
import { db, doc, getDoc, setDoc } from '../firebase';
import { AthleteDossier, DossierFact, DossierPatch } from '../types';
import { forceLocalOnly, setLocalBypassMode, esFalloDePermisos } from './core';
import { escribirLocal } from '../utils/almacenLocal';
import { ESCALAS, describirTipificacion, type TipificacionCliente } from '../utils/cdg/tipificacion';

const LOCAL_KEY = 'enforma_athlete_dossier_v1';
const COLECCION = 'athleteStatus';

// Cuántos hechos se conservan por atleta. Sin tope, un año de propuestas
// engorda el documento y el prompt; con 60 entran de sobra los últimos meses.
const MAX_HECHOS = 60;

import { DOSSIER_VACIO, normalizarFicha } from '../utils/fichaViva.js';

const normalizar = normalizarFicha;

function leerLocal(): Record<string, AthleteDossier> {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}'); } catch { return {}; }
}

function guardarLocal(email: string, ficha: AthleteDossier): void {
  const todas = leerLocal();
  todas[email] = ficha;
  escribirLocal(LOCAL_KEY, JSON.stringify(todas));
}

export async function getDossier(email: string): Promise<AthleteDossier> {
  if (forceLocalOnly) return leerLocal()[email] ?? DOSSIER_VACIO;
  try {
    const snap = await getDoc(doc(db, COLECCION, email));
    const ficha = normalizar(snap.exists() ? snap.data() : undefined);
    guardarLocal(email, ficha);
    return ficha;
  } catch (err) {
    console.warn('getDossier Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return leerLocal()[email] ?? DOSSIER_VACIO;
  }
}

async function guardarDossier(email: string, ficha: AthleteDossier): Promise<void> {
  guardarLocal(email, ficha);
  if (forceLocalOnly) return;
  try {
    await setDoc(doc(db, COLECCION, email), ficha, { merge: true });
  } catch (err) {
    console.warn('dossier write Firestore failed, kept local:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

/** Añade hechos al final. No pisa nada de lo que ya había. */
export async function appendDossierFacts(email: string, nuevos: DossierFact[]): Promise<AthleteDossier> {
  if (nuevos.length === 0) return getDossier(email);
  const actual = await getDossier(email);
  const ficha: AthleteDossier = {
    ...actual,
    hechos: [...actual.hechos, ...nuevos].slice(-MAX_HECHOS),
    updatedAt: new Date().toISOString(),
  };
  await guardarDossier(email, ficha);
  return ficha;
}

/** Cambia los campos de juicio. Solo tras el OK de Dani (o editando él). */
export async function saveDossierJudgement(email: string, patch: DossierPatch): Promise<AthleteDossier> {
  const actual = await getDossier(email);
  const ficha: AthleteDossier = { ...actual, ...patch, updatedAt: new Date().toISOString() };
  await guardarDossier(email, ficha);
  return ficha;
}

/** La nota libre del coach, que ya existía antes de la ficha. */
export async function saveDossierNote(email: string, note: string): Promise<AthleteDossier> {
  const actual = await getDossier(email);
  const ficha: AthleteDossier = { ...actual, note, updatedAt: new Date().toISOString() };
  await guardarDossier(email, ficha);
  return ficha;
}

export { renderDossier, DOSSIER_VACIO } from '../utils/fichaViva.js';

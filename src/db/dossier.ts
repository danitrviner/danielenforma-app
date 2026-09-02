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

const LOCAL_KEY = 'enforma_athlete_dossier_v1';
const COLECCION = 'athleteStatus';

// Cuántos hechos se conservan por atleta. Sin tope, un año de propuestas
// engorda el documento y el prompt; con 60 entran de sobra los últimos meses.
const MAX_HECHOS = 60;

export const DOSSIER_VACIO: AthleteDossier = {
  note: '', objetivos: '', evaluacion: '', esperado: '', foco: '',
  preguntasAbiertas: [], hechos: [], updatedAt: '',
};

function normalizar(datos: Record<string, unknown> | undefined): AthleteDossier {
  return {
    ...DOSSIER_VACIO,
    note: typeof datos?.note === 'string' ? datos.note : '',
    objetivos: typeof datos?.objetivos === 'string' ? datos.objetivos : '',
    evaluacion: typeof datos?.evaluacion === 'string' ? datos.evaluacion : '',
    esperado: typeof datos?.esperado === 'string' ? datos.esperado : '',
    foco: typeof datos?.foco === 'string' ? datos.foco : '',
    preguntasAbiertas: Array.isArray(datos?.preguntasAbiertas)
      ? (datos.preguntasAbiertas as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    hechos: Array.isArray(datos?.hechos) ? (datos.hechos as DossierFact[]) : [],
    updatedAt: typeof datos?.updatedAt === 'string' ? datos.updatedAt : '',
  };
}

function leerLocal(): Record<string, AthleteDossier> {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}'); } catch { return {}; }
}

function guardarLocal(email: string, ficha: AthleteDossier): void {
  const todas = leerLocal();
  todas[email] = ficha;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(todas));
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

/** Texto plano de la ficha, tal y como lo lee la IA y lo lee Dani. */
export function renderDossier(ficha: AthleteDossier): string {
  const bloques: string[] = [];
  const seccion = (titulo: string, cuerpo: string) => {
    if (cuerpo.trim()) bloques.push(`${titulo}\n${cuerpo.trim()}`);
  };
  seccion('OBJETIVOS', ficha.objetivos);
  seccion('DÓNDE ESTÁ HOY', ficha.evaluacion);
  seccion('QUÉ ESPERAMOS EN LAS PRÓXIMAS SEMANAS', ficha.esperado);
  seccion('FOCO DE LA SIGUIENTE REVISIÓN', ficha.foco);
  if (ficha.preguntasAbiertas.length) {
    seccion('PREGUNTAS ABIERTAS', ficha.preguntasAbiertas.map(q => `- ${q}`).join('\n'));
  }
  seccion('NOTA DEL COACH', ficha.note);
  if (ficha.hechos.length) {
    const ultimos = ficha.hechos.slice(-25)
      .map(h => `- ${h.at.slice(0, 10)} · ${h.kind}: ${h.text}`)
      .join('\n');
    seccion('QUÉ SE HA HECHO (lo más reciente al final)', ultimos);
  }
  return bloques.join('\n\n');
}

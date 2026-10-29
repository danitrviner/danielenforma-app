/* Mensajes del coach al atleta (`mensajesCoach`): el canal único por el que le
   llegan los textos de los episodios (qué cambia esta semana, una pregunta por
   sus faltas…). Firma siempre Dani; nada de «asistente» en el texto. El atleta
   los lee en su Inicio y marca `leidoEn`. */
import { db, collection, doc, getDocs, setDoc, updateDoc, query, where } from '../firebase.js';
import type { MensajeCoach } from '../types.js';
import { forceLocalOnly, stripUndefined } from './core.js';

export async function enviarMensajeCoach(m: Omit<MensajeCoach, 'id'> & { id?: string }): Promise<MensajeCoach> {
  const id = m.id ?? `${m.athleteId}_${Date.parse(m.creadoEn)}`;
  const mensaje: MensajeCoach = { ...m, id };
  if (forceLocalOnly) return mensaje;
  await setDoc(doc(db, 'mensajesCoach', id), stripUndefined(mensaje));
  return mensaje;
}

export async function getMensajesCoach(athleteEmail: string): Promise<MensajeCoach[]> {
  if (forceLocalOnly) return [];
  const snap = await getDocs(query(collection(db, 'mensajesCoach'), where('athleteId', '==', athleteEmail)));
  return snap.docs.map(d => ({ ...(d.data() as MensajeCoach), id: d.id })).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export async function marcarMensajeLeido(id: string): Promise<void> {
  if (forceLocalOnly) return;
  await updateDoc(doc(db, 'mensajesCoach', id), { leidoEn: new Date().toISOString() });
}

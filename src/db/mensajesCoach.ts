import { db, collection, doc, setDoc, updateDoc, getDocs, query, where } from '../firebase';
import type { EstadoProblema, MensajeCoach } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { reportarError } from '../monitorizacion';
import { escribirLocal } from '../utils/almacenLocal';

/* ═══════════════════════════════════════════════════════════════════════════
   Mensajes del coach (29-10-2026) — ver `MensajeCoach` en types.ts.

   Dos lectores a propósito: el del atleta pide SOLO los aprobados (la regla
   de Firestore exige ese filtro en la consulta; sin él, permiso denegado), el
   del coach pide todo, borradores incluidos. Ids deterministas cuando hay
   origen (`cambio_<id>`, `problema_<responseId>`): repetir no duplica.
   ═══════════════════════════════════════════════════════════════════════════ */

const LOCAL_KEY = 'enforma_mensajes_coach_v1';

function leerLocal(): MensajeCoach[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function guardarLocal(list: MensajeCoach[]): void {
  escribirLocal(LOCAL_KEY, JSON.stringify(list));
}
function upsertLocal(m: MensajeCoach): void {
  guardarLocal([...leerLocal().filter(x => x.id !== m.id), m]);
}
function fallaLectura(err: unknown, donde: string) {
  console.warn(`${donde} Firestore failed, using local:`, err);
  reportarError(err, 'firestore', { tipo: esFalloDePermisos(err) ? 'permisos' : 'sin-conexion', donde, silencioso: true });
}

const aMensaje = (id: string, datos: Record<string, unknown>) => ({ id, ...datos } as MensajeCoach);

/** Los mensajes aprobados de un atleta desde una fecha (lo que ve él). */
export async function getMensajesAprobados(athleteId: string, desde: string): Promise<MensajeCoach[]> {
  const filtro = (ms: MensajeCoach[]) => ms.filter(m => m.athleteId === athleteId && m.estado === 'aprobado' && m.fecha >= desde);
  if (forceLocalOnly) return filtro(leerLocal());
  try {
    const snap = await getDocs(query(
      collection(db, 'mensajesCoach'),
      where('athleteId', '==', athleteId),
      where('estado', '==', 'aprobado'),
      where('fecha', '>=', desde),
    ));
    const list = snap.docs.map(d => aMensaje(d.id, d.data()));
    guardarLocal([...leerLocal().filter(m => m.athleteId !== athleteId), ...list]);
    return list;
  } catch (err) {
    fallaLectura(err, 'getMensajesAprobados');
    return filtro(leerLocal());
  }
}

/** Todos los mensajes de un atleta, borradores incluidos (lo que ve el coach). */
export async function getMensajesDeAtleta(athleteId: string): Promise<MensajeCoach[]> {
  if (forceLocalOnly) return leerLocal().filter(m => m.athleteId === athleteId);
  try {
    const snap = await getDocs(query(collection(db, 'mensajesCoach'), where('athleteId', '==', athleteId)));
    const list = snap.docs.map(d => aMensaje(d.id, d.data()));
    guardarLocal([...leerLocal().filter(m => m.athleteId !== athleteId), ...list]);
    return list;
  } catch (err) {
    fallaLectura(err, 'getMensajesDeAtleta');
    return leerLocal().filter(m => m.athleteId === athleteId);
  }
}

/** Los borradores pendientes de firma de todos los atletas (bandeja del coach). */
export async function getBorradoresPorFirmar(): Promise<MensajeCoach[]> {
  if (forceLocalOnly) return leerLocal().filter(m => m.estado === 'borrador');
  try {
    const snap = await getDocs(query(collection(db, 'mensajesCoach'), where('estado', '==', 'borrador')));
    return snap.docs.map(d => aMensaje(d.id, d.data()));
  } catch (err) {
    fallaLectura(err, 'getBorradoresPorFirmar');
    return leerLocal().filter(m => m.estado === 'borrador');
  }
}

export async function crearMensajeCoach(m: Omit<MensajeCoach, 'id' | 'creadoEn'> & { id?: string }): Promise<MensajeCoach> {
  const id = m.id ?? doc(collection(db, 'mensajesCoach')).id;
  const mensaje: MensajeCoach = { ...m, id, athleteId: m.athleteId.toLowerCase(), creadoEn: new Date().toISOString() };
  if (forceLocalOnly) { upsertLocal(mensaje); return mensaje; }
  try {
    const { id: _id, ...datos } = mensaje;
    await setDoc(doc(db, 'mensajesCoach', id), stripUndefined(datos));
    upsertLocal(mensaje);
    return mensaje;
  } catch (err) {
    console.warn('crearMensajeCoach Firestore failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    upsertLocal(mensaje);
    return mensaje;
  }
}

export async function actualizarMensajeCoach(id: string, cambios: Partial<Pick<MensajeCoach, 'texto' | 'porque' | 'estado' | 'firmadoEn' | 'problema' | 'fecha'>>): Promise<void> {
  const local = () => {
    const actual = leerLocal().find(m => m.id === id);
    if (actual) upsertLocal({ ...actual, ...cambios });
  };
  if (forceLocalOnly) { local(); return; }
  try {
    await updateDoc(doc(db, 'mensajesCoach', id), stripUndefined(cambios));
    local();
  } catch (err) {
    console.warn('actualizarMensajeCoach Firestore failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    local();
  }
}

/** Firmar un borrador: pasa a aprobado con el texto que haya en pantalla. */
export async function firmarMensajeCoach(id: string, texto: string, porque?: string): Promise<void> {
  await actualizarMensajeCoach(id, { texto, porque, estado: 'aprobado', firmadoEn: new Date().toISOString() });
}

export async function cambiarEstadoProblema(id: string, estado: EstadoProblema, detalle?: string): Promise<void> {
  await actualizarMensajeCoach(id, { problema: stripUndefined({ estado, actualizadoEn: new Date().toISOString(), detalle }) as MensajeCoach['problema'] });
}

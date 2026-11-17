import { db, doc, getDoc, setDoc } from '../firebase';
import type { PlanSemanal } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { reportarError } from '../monitorizacion';
import { escribirLocal } from '../utils/almacenLocal';

// ─── PLAN DE LA SEMANA (cocina en tandas) ───────────────────────────────────
// Lo que el atleta va a comer esa semana; ver utils/planSemanal.ts. Doc ID
// determinista `${athleteId}_${lunes}`: uno por atleta y semana. Copia en el
// móvil para que no se pierda sin conexión.
//
// Desde el 17-11-2026 el mismo documento lleva también las sesiones que el
// atleta va a hacer fuera de su gimnasio (`sesionesFuera`, panel de Rutinas):
// el atleta ya puede escribirlo sin reglas nuevas. Son dos pantallas que
// escriben el mismo documento, así que ninguna borra lo de la otra: el plan
// de comidas no toca `sesionesFuera` y `guardarSesionesFuera` no toca los
// platos.

const LOCAL_KEY = 'enforma_planes_semanales_v1';

function getLocal(): PlanSemanal[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function upsertLocal(plan: PlanSemanal): void {
  // Solo las últimas semanas: es un borrador de trabajo, no un archivo.
  const resto = getLocal().filter(p => p.id !== plan.id).slice(-11);
  escribirLocal(LOCAL_KEY, JSON.stringify([...resto, plan]));
}

/** Deja la copia local de un plan como estaba (o sin él, si no había). */
function restaurarLocal(id: string, previo: PlanSemanal | undefined): void {
  if (previo) upsertLocal(previo);
  else escribirLocal(LOCAL_KEY, JSON.stringify(getLocal().filter(p => p.id !== id)));
}

export function planSemanalId(athleteId: string, lunes: string): string {
  return `${athleteId}_${lunes}`;
}

export async function getPlanSemanal(athleteId: string, lunes: string): Promise<PlanSemanal | null> {
  const id = planSemanalId(athleteId, lunes);
  const local = () => getLocal().find(p => p.id === id) ?? null;
  if (forceLocalOnly) return local();
  try {
    const snap = await getDoc(doc(db, 'planesSemanales', id));
    if (!snap.exists()) return local();
    const plan = { id: snap.id, ...snap.data() } as PlanSemanal;
    upsertLocal(plan);
    return plan;
  } catch (err) {
    // Sin reglas desplegadas o sin red: el plan del móvil vale igual.
    console.warn('getPlanSemanal Firestore failed, using local:', err);
    reportarError(err, 'firestore', { tipo: esFalloDePermisos(err) ? 'permisos' : 'sin-conexion', donde: 'getPlanSemanal', silencioso: true });
    return local();
  }
}

export async function savePlanSemanal(plan: Omit<PlanSemanal, 'id' | 'updatedAt'>): Promise<PlanSemanal> {
  const id = planSemanalId(plan.athleteId, plan.semana);
  // Quien guarda solo los platos (Mi semana) no trae `sesionesFuera`: se
  // conservan las de la copia local, y en Firestore se fusiona en vez de
  // sustituir. Así guardar el menú no desmarca las sesiones fuera.
  const conservaFuera = plan.sesionesFuera === undefined;
  const fueraLocal = conservaFuera ? getLocal().find(p => p.id === id)?.sesionesFuera : undefined;
  const guardado: PlanSemanal = {
    ...plan, ...(fueraLocal ? { sesionesFuera: fueraLocal } : {}), id, updatedAt: new Date().toISOString(),
  };
  upsertLocal(guardado);
  if (forceLocalOnly) return guardado;
  try {
    const { id: _id, sesionesFuera: _fuera, ...data } = guardado;
    // Con `merge` los campos que se mandan se sustituyen enteros (también la
    // lista de platos); solo sobrevive lo que no se manda: `sesionesFuera`.
    await (conservaFuera
      ? setDoc(doc(db, 'planesSemanales', id), stripUndefined(data), { merge: true })
      : setDoc(doc(db, 'planesSemanales', id), stripUndefined({ ...data, sesionesFuera: plan.sesionesFuera })));
    return guardado;
  } catch (err) {
    console.warn('savePlanSemanal Firestore failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    return guardado;
  }
}

/**
 * Guarda SOLO las sesiones fuera de una semana (panel de Rutinas), sin tocar
 * los platos del plan de comidas. Lee el plan de esa semana: si existe, se
 * fusiona `sesionesFuera`; si no, se crea con la lista de platos vacía (Mi
 * semana cuenta con que `platos` exista).
 */
export async function guardarSesionesFuera(athleteId: string, lunes: string, sesionesFuera: string[]): Promise<PlanSemanal> {
  const id = planSemanalId(athleteId, lunes);
  const updatedAt = new Date().toISOString();
  const local = getLocal().find(p => p.id === id);
  let guardado: PlanSemanal = { ...(local ?? { id, athleteId, semana: lunes, platos: [] }), id, sesionesFuera, updatedAt };
  upsertLocal(guardado);
  if (forceLocalOnly) return guardado;
  try {
    const ref = doc(db, 'planesSemanales', id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await setDoc(ref, { sesionesFuera, updatedAt }, { merge: true });
      guardado = { ...(snap.data() as Omit<PlanSemanal, 'id'>), id, sesionesFuera, updatedAt };
    } else {
      // Sin documento en Firestore: lo que hubiera en el móvil (un plan hecho
      // sin conexión) sube entero con las sesiones.
      const { id: _id, ...data } = guardado;
      await setDoc(ref, stripUndefined(data));
    }
    upsertLocal(guardado);
    return guardado;
  } catch (err) {
    console.warn('guardarSesionesFuera Firestore failed:', err);
    setLocalBypassMode(true, err);
    // Rechazado (no sin red): la pantalla vuelve atrás, así que la copia local
    // también; si no, al volver a entrar saldría marcada una sesión que no se
    // guardó.
    if (esFalloDePermisos(err)) {
      restaurarLocal(id, local);
      throw err;
    }
    return guardado;
  }
}

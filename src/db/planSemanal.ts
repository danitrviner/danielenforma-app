import { db, doc, getDoc, setDoc } from '../firebase';
import type { PlanSemanal } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';
import { reportarError } from '../monitorizacion';
import { escribirLocal } from '../utils/almacenLocal';

// ─── PLAN DE LA SEMANA (cocina en tandas) ───────────────────────────────────
// Lo que el atleta va a comer esa semana; ver utils/planSemanal.ts. Doc ID
// determinista `${athleteId}_${lunes}`: uno por atleta y semana, guardar lo
// sustituye. Copia en el móvil para que no se pierda sin conexión.

const LOCAL_KEY = 'enforma_planes_semanales_v1';

function getLocal(): PlanSemanal[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function upsertLocal(plan: PlanSemanal): void {
  // Solo las últimas semanas: es un borrador de trabajo, no un archivo.
  const resto = getLocal().filter(p => p.id !== plan.id).slice(-11);
  escribirLocal(LOCAL_KEY, JSON.stringify([...resto, plan]));
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
  const guardado: PlanSemanal = { ...plan, id: planSemanalId(plan.athleteId, plan.semana), updatedAt: new Date().toISOString() };
  upsertLocal(guardado);
  if (forceLocalOnly) return guardado;
  try {
    const { id, ...data } = guardado;
    await setDoc(doc(db, 'planesSemanales', id), stripUndefined(data));
    return guardado;
  } catch (err) {
    console.warn('savePlanSemanal Firestore failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    return guardado;
  }
}

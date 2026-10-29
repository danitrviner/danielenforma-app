import { db, doc, getDoc, setDoc, deleteField } from '../firebase';
import { forceLocalOnly } from './core';
import { escribirLocal } from '../utils/almacenLocal';

/* ═══════════════════════════════════════════════════════════════════════════
   Decisiones del coach sobre el plan, semana a semana (28-10-2026)

   «Mantengo kcal; si la S9 baja menos de 0,4 kg, alargo definición». Son
   notas de trabajo del coach, así que viven en una colección SOLO-COACH
   (`decisionesPlan/{email}`, ver firestore.rules) y no dentro del programa de
   nutrición, que el atleta puede leer. Un documento por atleta con un mapa
   `semanas[lunes ISO] = { texto, at }`; guardar escribe solo esa semana.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DecisionDeSemana { texto: string; at: string }
export type DecisionesPlan = Record<string, DecisionDeSemana>;

const LOCAL = (email: string) => `enforma_decisiones_plan_${email}`;

function leerLocal(email: string): DecisionesPlan {
  try { return JSON.parse(localStorage.getItem(LOCAL(email)) || '{}') as DecisionesPlan; } catch { return {}; }
}

export async function getDecisionesPlan(email: string): Promise<DecisionesPlan> {
  if (forceLocalOnly) return leerLocal(email);
  const snap = await getDoc(doc(db, 'decisionesPlan', email));
  return snap.exists() ? ((snap.data().semanas as DecisionesPlan | undefined) ?? {}) : {};
}

/** Guarda (o borra, con texto vacío) la decisión de la semana que empieza en `desde`. */
export async function guardarDecisionPlan(email: string, desde: string, texto: string): Promise<DecisionDeSemana | null> {
  const limpio = texto.trim();
  const decision = limpio ? { texto: limpio, at: new Date().toISOString() } : null;
  const local = leerLocal(email);
  if (decision) local[desde] = decision; else delete local[desde];
  escribirLocal(LOCAL(email), JSON.stringify(local));
  if (forceLocalOnly) return decision;
  await setDoc(doc(db, 'decisionesPlan', email), { semanas: { [desde]: decision ?? deleteField() } }, { merge: true });
  return decision;
}

import { db, doc, getDoc, setDoc } from '../firebase';
import { forceLocalOnly } from './core';
import { escribirLocal } from '../utils/almacenLocal';
import type { Hipotesis } from '../utils/hipotesis';

/* ═══════════════════════════════════════════════════════════════════════════
   Hipótesis de los cambios (S5, 11-11-2026)

   Qué espera el coach de cada cambio y cuándo lo va a mirar. Son notas de
   trabajo suyas, así que van en el mismo documento SOLO-COACH que las
   decisiones del plan (`decisionesPlan/{email}`, ver firestore.rules), en un
   mapa aparte `hipotesis[id]`. Una por cambio: el id es el del cambio.
   ═══════════════════════════════════════════════════════════════════════════ */

const LOCAL = (email: string) => `enforma_hipotesis_${email}`;

function leerLocal(email: string): Record<string, Hipotesis> {
  try { return JSON.parse(localStorage.getItem(LOCAL(email)) || '{}') as Record<string, Hipotesis>; } catch { return {}; }
}

export async function getHipotesis(email: string): Promise<Hipotesis[]> {
  if (forceLocalOnly) return Object.values(leerLocal(email));
  const snap = await getDoc(doc(db, 'decisionesPlan', email));
  return Object.values((snap.exists() ? (snap.data().hipotesis as Record<string, Hipotesis> | undefined) : undefined) ?? {});
}

/** Guarda la hipótesis entera (crearla, cerrarla o darle más plazo). */
export async function guardarHipotesis(email: string, h: Hipotesis): Promise<void> {
  // Sin campos `undefined`: Firestore los rechaza.
  const limpia = JSON.parse(JSON.stringify(h)) as Hipotesis;
  const local = leerLocal(email);
  local[h.id] = limpia;
  escribirLocal(LOCAL(email), JSON.stringify(local));
  if (forceLocalOnly) return;
  await setDoc(doc(db, 'decisionesPlan', email), { hipotesis: { [h.id]: limpia } }, { merge: true });
}

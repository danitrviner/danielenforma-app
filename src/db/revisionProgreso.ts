import { db, doc, getDoc, setDoc } from '../firebase';
import type { ProgresoRevision } from '../types';
import { forceLocalOnly, stripUndefined, authReady, withAuthRetry } from './core';
import { escribirLocal } from '../utils/almacenLocal';

/* ═══════════════════════════════════════════════════════════════════════════
   Progreso de la revisión semanal (K-02)

   Un documento por atleta y ciclo (`${email}_${viernes}`) con lo que lleva
   respondido, para retomar la revisión en cualquier dispositivo. NO sustituye a
   `questionnaireResponses`: las respuestas se envían como siempre, una por
   cuestionario, y este documento solo guarda el borrador y si se pulsó «Enviar».

   Es un borrador: guardarlo nunca debe romper nada ni avisar con un error.
     · Se escribe SIEMPRE primero en el móvil, así que cerrar la app a medias no
       pierde nada.
     · Si Firestore falla (sin cobertura, o reglas aún sin desplegar) se queda la
       copia local y no se activa el modo local global: un borrador que no sube
       no puede tumbar las escrituras de lo demás.
     · Al leer gana el más reciente entre el servidor y el móvil.
   ═══════════════════════════════════════════════════════════════════════════ */

export const idProgresoRevision = (email: string, ciclo: string) => `${email}_${ciclo}`;

const claveLocal = (id: string) => `enforma_revisionProgreso_${id}`;

function leerLocal(id: string): ProgresoRevision | null {
  try {
    const raw = localStorage.getItem(claveLocal(id));
    return raw ? JSON.parse(raw) as ProgresoRevision : null;
  } catch {
    return null;
  }
}

function escribirEspejo(p: ProgresoRevision): void {
  try { escribirLocal(claveLocal(p.id), JSON.stringify(p)); } catch { /* sin almacenamiento: solo servidor */ }
}

/** De dos copias del mismo progreso, la última que se tocó. */
export function progresoQueGana(a: ProgresoRevision | null, b: ProgresoRevision | null): ProgresoRevision | null {
  if (!a) return b;
  if (!b) return a;
  return a.actualizadoEn >= b.actualizadoEn ? a : b;
}

export async function getProgresoRevision(email: string, ciclo: string): Promise<ProgresoRevision | null> {
  const id = idProgresoRevision(email, ciclo);
  const local = leerLocal(id);
  if (forceLocalOnly) return local;
  try {
    await authReady;
    const remoto = await withAuthRetry(async () => {
      const snap = await getDoc(doc(db, 'revisionProgreso', id));
      return snap.exists() ? ({ ...(snap.data() as ProgresoRevision), id }) : null;
    });
    return progresoQueGana(remoto, local);
  } catch (err) {
    console.warn('getProgresoRevision Firestore failed, using local:', err);
    return local;
  }
}

/** Guarda el progreso. Devuelve si llegó al servidor; la copia local se guarda siempre. */
export async function guardarProgresoRevision(p: ProgresoRevision): Promise<boolean> {
  const conMarca: ProgresoRevision = { ...p, actualizadoEn: new Date().toISOString() };
  escribirEspejo(conMarca);
  if (forceLocalOnly) return false;
  try {
    await authReady;
    await setDoc(doc(db, 'revisionProgreso', p.id), stripUndefined(conMarca));
    return true;
  } catch (err) {
    console.warn('guardarProgresoRevision Firestore failed, kept local:', err);
    return false;
  }
}

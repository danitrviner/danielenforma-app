import { db, collection, doc, setDoc, getDocs, query, where } from '../firebase';
import type { Contacto } from '../types';
import { forceLocalOnly, setLocalBypassMode, esFalloDePermisos } from './core';
import { reportarError } from '../monitorizacion';
import { escribirLocal } from '../utils/almacenLocal';

/* ═══════════════════════════════════════════════════════════════════════════
   Contactos del coach fuera de la app (28-10-2026)

   «Ya le he escrito»: cuando la bandeja del día señala a un atleta y Dani le
   escribe por WhatsApp, deja constancia aquí. Dos usos: la señal se calla unos
   días (no hace falta que la bandeja le repita lo que acaba de hacer) y el
   panel de retención puede medir la latencia real del acompañamiento, que
   hoy ocurre casi entera fuera de la app y no deja rastro en ningún sitio.

   Solo el coach escribe y lee (firestore.rules). docId determinista
   `${email}_${fecha}_${motivo}`: pulsar dos veces el mismo día no duplica.
   ═══════════════════════════════════════════════════════════════════════════ */

const LOCAL_KEY = 'enforma_contactos_v1';

function leerLocal(): Contacto[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function guardarLocal(list: Contacto[]): void {
  escribirLocal(LOCAL_KEY, JSON.stringify(list));
}

export function idDeContacto(athleteId: string, fecha: string, motivo: string): string {
  return `${athleteId.toLowerCase()}_${fecha}_${motivo}`;
}

export async function registrarContacto(c: Omit<Contacto, 'id' | 'createdAt'>): Promise<Contacto> {
  const contacto: Contacto = {
    ...c, athleteId: c.athleteId.toLowerCase(),
    id: idDeContacto(c.athleteId, c.fecha, c.motivo),
    createdAt: new Date().toISOString(),
  };
  const local = () => guardarLocal([...leerLocal().filter(x => x.id !== contacto.id), contacto]);
  if (forceLocalOnly) { local(); return contacto; }
  try {
    const { id, ...datos } = contacto;
    await setDoc(doc(db, 'contactos', id), datos);
    local();
    return contacto;
  } catch (err) {
    console.warn('registrarContacto Firestore failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
    local();
    return contacto;
  }
}

/** Contactos desde una fecha (YYYY-MM-DD), de todos los atletas. */
export async function getContactosDesde(desde: string): Promise<Contacto[]> {
  if (forceLocalOnly) return leerLocal().filter(c => c.fecha >= desde);
  try {
    const snap = await getDocs(query(collection(db, 'contactos'), where('fecha', '>=', desde)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Contacto));
    guardarLocal(list);
    return list;
  } catch (err) {
    console.warn('getContactosDesde Firestore failed, using local:', err);
    reportarError(err, 'firestore', { tipo: esFalloDePermisos(err) ? 'permisos' : 'sin-conexion', donde: 'getContactosDesde', silencioso: true });
    return leerLocal().filter(c => c.fecha >= desde);
  }
}

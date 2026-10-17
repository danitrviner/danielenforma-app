import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from '../firebase';
import type { RepartoGuardado, RepartoPropio } from '../types';
import { stripUndefined } from './core';

/* ═══════════════════════════════════════════════════════════════════════════
   «Mis repartos» — repartos propios guardados por el coach

   Colección nueva (`repartosGuardados`), sin la caché local ni el modo «sin
   conexión» de las colecciones antiguas: si Firestore falla, el error sube y
   la pantalla lo dice. Guardar un reparto que en realidad no se ha guardado
   sería peor que no poder guardarlo.
   ═══════════════════════════════════════════════════════════════════════════ */

const COLECCION = 'repartosGuardados';

/** Solo lo que define el reparto: nada del mesociclo del que salió. */
function soloReparto(r: RepartoPropio): RepartoPropio {
  return {
    nombre: r.nombre.trim() || 'Reparto sin nombre',
    dias: r.dias.map(d => (d ? { tipo: d.tipo, grupos: [...d.grupos] } : null)),
    ...(r.frecuencias ? { frecuencias: { ...r.frecuencias } } : {}),
    ...(r.basadoEn ? { basadoEn: r.basadoEn } : {}),
  };
}

export async function getRepartosGuardados(ownerId: string): Promise<RepartoGuardado[]> {
  const snap = await getDocs(query(collection(db, COLECCION), where('ownerId', '==', ownerId)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as RepartoGuardado))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export async function guardarReparto(ownerId: string, reparto: RepartoPropio): Promise<RepartoGuardado> {
  const datos = { ...soloReparto(reparto), ownerId, creadoEn: new Date().toISOString() };
  const ref = await addDoc(collection(db, COLECCION), stripUndefined(datos));
  return { id: ref.id, ...datos };
}

export async function renombrarRepartoGuardado(id: string, nombre: string): Promise<void> {
  await updateDoc(doc(db, COLECCION, id), { nombre: nombre.trim() || 'Reparto sin nombre' });
}

export async function borrarRepartoGuardado(id: string): Promise<void> {
  await deleteDoc(doc(db, COLECCION, id));
}

/** El reparto listo para ponerlo en un mesociclo (sin id, dueño ni fecha). */
export function repartoDeGuardado(g: RepartoGuardado): RepartoPropio {
  return soloReparto(g);
}

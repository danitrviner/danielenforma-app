/* Deshacer: volver a dejar un documento como estaba.
 *
 * Es la única escritura «cruda» del cliente a propósito: no sabe de dietas ni
 * de rutinas, solo de documentos, porque lo que restaura es el `snapshotAntes`
 * que guardó la propuesta al aplicarse. Los catálogos con sello de versión
 * (`workouts`, `exercises`…) se marcan cambiados para que los demás
 * dispositivos relean. Solo el coach puede llamar a esto (las reglas de las
 * colecciones afectadas ya lo exigen). */
import { db, doc, setDoc, updateDoc, deleteDoc } from '../firebase';
import type { SnapshotDocumento } from '../types';
import { stripUndefined } from './core';
import { marcarCatalogoCambiado } from './catalogoVersionado';

/** Colecciones que las apps sirven desde la copia local mientras el sello no cambie. */
const CON_SELLO = new Set(['workouts', 'exercises', 'mesocycleTemplates']);

export async function restaurarDocumento(foto: SnapshotDocumento): Promise<void> {
  const ref = doc(db, foto.coleccion, foto.id);
  if (foto.datos === null) {
    await deleteDoc(ref);
  } else if (foto.parcial) {
    await updateDoc(ref, stripUndefined(foto.datos) as Record<string, unknown>);
  } else {
    await setDoc(ref, stripUndefined(foto.datos));
  }
  if (CON_SELLO.has(foto.coleccion)) void marcarCatalogoCambiado(foto.coleccion);
}

/** Restaura en orden inverso al de aplicación: lo último que se creó es lo
 *  primero que se borra (las asignaciones antes que la sesión a la que apuntan). */
export async function restaurarTodo(fotos: SnapshotDocumento[]): Promise<{ restaurados: number }> {
  let restaurados = 0;
  for (const foto of [...fotos].reverse()) {
    await restaurarDocumento(foto);
    restaurados++;
  }
  return { restaurados };
}

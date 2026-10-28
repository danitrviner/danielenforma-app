import type { Mesocycle } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Cómo se llaman los mesociclos y sus sesiones

   Nació de un problema real de uso: el generador bautizaba cada sesión como
   «Día 1 – Meso #2», así que el desplegable de «Asignar entrenamiento» era una
   lista de decenas de nombres idénticos entre atletas y entre bloques, y no
   había forma de saber cuál era cuál. Aquí se decide un nombre que distingue,
   en un solo sitio, para que la lista de asignación, el calendario del atleta
   y la pantalla de ejercicios digan todos lo mismo.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cómo se llama un mesociclo por ahí. El coach puede ponerle nombre; si no lo
 * ha hecho, sigue siendo «Meso #N» — nunca una cadena vacía.
 */
export function nombreDeMeso(m: Pick<Mesocycle, 'number' | 'name'>): string {
  const propio = m.name?.trim();
  return propio || `Meso #${m.number}`;
}

/** Igual, pero para sitios donde ya se sabe que hablamos de un mesociclo. */
export function nombreCortoDeMeso(m: Pick<Mesocycle, 'number' | 'name'>): string {
  const propio = m.name?.trim();
  return propio || `#${m.number}`;
}

/**
 * Nombre de UNA sesión del mesociclo.
 *
 * Lleva tres cosas y las tres hacen falta para no volver al problema de los
 * nombres repetidos: el tipo de día del reparto («Torso», «Full body» — lo
 * que el coach reconoce de un vistazo), de quién es, y a qué bloque pertenece.
 * Si el reparto no da un tipo (calendario a mano), se cae a «Sesión N», que
 * al menos sigue siendo único dentro del bloque.
 *
 * El coach puede renombrar cualquier sesión después; esto es solo el nombre
 * con el que nacen.
 */
export function nombreDeSesion(params: {
  tipo?: string;
  dayIdx: number;
  athleteName?: string;
  meso: Pick<Mesocycle, 'number' | 'name'>;
}): string {
  const { tipo, dayIdx, athleteName, meso } = params;
  const base = tipo?.trim() || `Sesión ${dayIdx + 1}`;
  const partes = [base];
  const atleta = athleteName?.trim();
  if (atleta) partes.push(atleta);
  partes.push(nombreDeMeso(meso));
  return partes.join(' · ');
}

/**
 * Nombre de una sesión para cabeceras y pestañas: el tipo de día, sin el
 * atleta ni el bloque que `nombreDeSesion` le añade al nacer («Torso · Javier
 * Vergara · Meso #1» → «Torso»). El nombre completo sigue siendo el guardado;
 * esto es solo cómo se enseña donde el sitio es poco.
 *
 * Solo se recorta lo que sigue el patrón de `nombreDeSesion` (tres partes, o
 * dos si la segunda es «Meso #N»). Un nombre que el coach escribió a mano, con
 * o sin « · », se deja tal cual.
 */
export function nombreCortoDeSesion(nombre: string): string {
  const partes = nombre.split(' · ').map(p => p.trim());
  if (partes.length >= 3 || (partes.length === 2 && /^Meso #\d+$/.test(partes[1]))) {
    return partes[0] || nombre;
  }
  return nombre;
}

/**
 * Los nombres cortos de TODAS las sesiones de un bloque, en su orden. Si dos
 * quedan iguales («Torso» y «Torso») se distinguen con una letra, por orden de
 * aparición: «Torso A» y «Torso B». Un nombre único se queda sin letra.
 */
export function nombresCortosDeSesiones(nombres: string[]): string[] {
  const cortos = nombres.map(nombreCortoDeSesion);
  const total = new Map<string, number>();
  for (const c of cortos) total.set(c, (total.get(c) ?? 0) + 1);
  const visto = new Map<string, number>();
  return cortos.map(c => {
    if ((total.get(c) ?? 0) < 2) return c;
    const n = visto.get(c) ?? 0;
    visto.set(c, n + 1);
    return `${c} ${String.fromCharCode(65 + (n % 26))}`;
  });
}

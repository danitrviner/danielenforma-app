import { ProgressPhoto, PhotoView, BodyweightLog } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Elegir QUÉ DOS FOTOS se comparan.
//
// `PhotoCompareCurtain` (components/progress/) ya era agnóstico: recibe `antes`
// y `ahora` y los superpone con una cortina. Lo que faltaba era la selección, y
// estaba escrita dos veces y distinta: ClientBodyPanel clava baseline + última
// sin dejar elegir, y PhotosScreen tiene su propia lógica con selector para el
// atleta. El coach, que es quien necesita decir «mira de aquí a aquí» mientras
// graba la revisión, era justo el que no podía elegir.
//
// Aquí solo vive la elección y su etiqueta. Nada de React.
// ═══════════════════════════════════════════════════════════════════════════

export interface ParDeFotos {
  antes: ProgressPhoto;
  ahora: ProgressPhoto;
}

/** Las fotos de una vista, de la más antigua a la más reciente. */
export function fotosDeVista(
  photos: ProgressPhoto[],
  vista: PhotoView,
  athleteId?: string,
): ProgressPhoto[] {
  return photos
    .filter(p => p.view === vista && !!p.date && (athleteId == null || p.athleteId === athleteId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * El par por defecto: la primera contra la última.
 *
 * `null` con menos de dos fotos — con una sola no hay comparación que hacer, y
 * devolver la misma foto en los dos lados pintaría una cortina que no se mueve.
 */
export function parPorDefecto(fotos: ProgressPhoto[]): ParDeFotos | null {
  if (fotos.length < 2) return null;
  return { antes: fotos[0], ahora: fotos[fotos.length - 1] };
}

/** Semanas enteras entre dos fechas ISO, mínimo 1 (dos fotos de la misma semana no son «0 semanas»). */
export function semanasEntre(antes: string, ahora: string): number {
  const ms = new Date(ahora + 'T12:00:00').getTime() - new Date(antes + 'T12:00:00').getTime();
  return Math.max(1, Math.round(ms / (7 * 86_400_000)));
}

/** El peso registrado más cercano a una fecha, o `null` si no hay ninguno. */
export function pesoEnFecha(logs: BodyweightLog[], fecha: string): number | null {
  let mejor: BodyweightLog | null = null;
  let mejorDist = Infinity;
  const objetivo = new Date(fecha + 'T12:00:00').getTime();
  for (const l of logs) {
    if (!l.date) continue;
    const d = Math.abs(new Date(l.date + 'T12:00:00').getTime() - objetivo);
    if (d < mejorDist) { mejorDist = d; mejor = l; }
  }
  return mejor ? mejor.weight : null;
}

/**
 * La etiqueta que va encima de la cortina: «11 SEMANAS · −3,8 KG».
 *
 * El peso es opcional a propósito. Si falta en cualquiera de los dos extremos
 * se devuelve solo las semanas, en vez de inventar un delta contra cero — que
 * es exactamente el tipo de número que el coach leería en voz alta en el vídeo
 * sin sospechar que está mal.
 */
export function etiquetaComparativa(
  antes: string,
  ahora: string,
  pesoAntes?: number | null,
  pesoAhora?: number | null,
): string {
  const semanas = semanasEntre(antes, ahora);
  const base = `${semanas} ${semanas === 1 ? 'SEMANA' : 'SEMANAS'}`;
  if (pesoAntes == null || pesoAhora == null) return base;
  const delta = Math.round((pesoAhora - pesoAntes) * 10) / 10;
  if (delta === 0) return `${base} · MISMO PESO`;
  const signo = delta > 0 ? '+' : '−';
  return `${base} · ${signo}${Math.abs(delta).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KG`;
}

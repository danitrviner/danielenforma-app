import type { WeekDay } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Reglas del coach sobre las recetas de UN atleta

   Del pool que el atleta tiene activo (por sus gustos, alergias, condiciones y
   tiempo), el coach puede esconder recetas concretas, en todos los días o solo
   en algunos. Es un filtro DURO más, a la altura de «no me gusta», pero lo
   decide el coach y el atleta no lo ve ni lo puede deshacer.

   Aquí solo vive la lógica pura; el documento está en db/reglasDeReceta.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ReglaDeReceta {
  recipeId: string;
  /** Días en los que NO sale. Ausente o vacío = ningún día. */
  dias?: WeekDay[];
}

export interface ReglasDeReceta {
  athleteId: string;
  reglas: ReglaDeReceta[];
  updatedAt?: string;
}

export const DIAS_SEMANA: { dia: WeekDay; corto: string; largo: string }[] = [
  { dia: 'mon', corto: 'L', largo: 'lunes' },
  { dia: 'tue', corto: 'M', largo: 'martes' },
  { dia: 'wed', corto: 'X', largo: 'miércoles' },
  { dia: 'thu', corto: 'J', largo: 'jueves' },
  { dia: 'fri', corto: 'V', largo: 'viernes' },
  { dia: 'sat', corto: 'S', largo: 'sábado' },
  { dia: 'sun', corto: 'D', largo: 'domingo' },
];

/**
 * Ids de receta que NO pueden salir en esos días.
 *
 * - Sin `dias` (pantallas sin contexto de día, como el buscador del recetario):
 *   solo cuentan las reglas de «todos los días». Una receta que solo se esconde
 *   los martes sigue siendo una receta que el atleta puede ver y elegir otro día.
 * - Con `dias` (el generador de un día, o de una semana en tanda): basta que la
 *   regla afecte a uno de ellos. En una tanda se cocina UNA receta para varios
 *   días, así que si no vale para uno de ellos no vale.
 */
export function recetasOcultas(reglas: ReglaDeReceta[] | undefined, dias?: WeekDay[]): Set<string> {
  const ocultas = new Set<string>();
  for (const r of reglas ?? []) {
    const suyos = r.dias ?? [];
    if (suyos.length === 0 || (dias && dias.some(d => suyos.includes(d)))) ocultas.add(r.recipeId);
  }
  return ocultas;
}

/** ¿Se puede ofrecer esta receta? Atajo de una sola consulta, sin construir el conjunto. */
export function recetaPermitida(recipeId: string, reglas: ReglaDeReceta[] | undefined, dias?: WeekDay[]): boolean {
  const r = reglas?.find(x => x.recipeId === recipeId);
  if (!r) return true;
  const suyos = r.dias ?? [];
  if (suyos.length === 0) return false;
  return !(dias && dias.some(d => suyos.includes(d)));
}

/** Pone, cambia o quita la regla de una receta. `dias` vacío o ausente = todos los días. */
export function conRegla(reglas: ReglaDeReceta[], recipeId: string, dias?: WeekDay[] | null): ReglaDeReceta[] {
  const resto = reglas.filter(r => r.recipeId !== recipeId);
  if (dias === null) return resto;
  const limpios = dias && dias.length < 7 ? [...new Set(dias)] : undefined;
  return [...resto, limpios?.length ? { recipeId, dias: limpios } : { recipeId }];
}

/** Resumen corto para la lista: «todos los días» o «L, X, V». */
export function etiquetaDeDias(dias: WeekDay[] | undefined): string {
  if (!dias || dias.length === 0 || dias.length === 7) return 'todos los días';
  return DIAS_SEMANA.filter(d => dias.includes(d.dia)).map(d => d.corto).join(', ');
}

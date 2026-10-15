import type { WeekDay } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Reglas del coach sobre las recetas de UN atleta

   Del pool que el atleta tiene activo (por sus gustos, alergias, condiciones y
   tiempo), el coach puede esconder recetas concretas, en todos los días o solo
   en algunos. Es un filtro DURO más, a la altura de «no me gusta», pero lo
   decide el coach y el atleta no lo ve ni lo puede deshacer.

   Aquí solo vive la lógica pura; el documento está en db/reglasDeReceta.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Dónde le afecta una regla. */
export type AmbitoDeRegla = 'menu' | 'cambios' | 'recetario';

export const AMBITOS: { ambito: AmbitoDeRegla; etiqueta: string; ayuda: string }[] = [
  { ambito: 'menu', etiqueta: 'Menú', ayuda: 'El menú semanal que genera la app (automático y el que montas tú).' },
  { ambito: 'cambios', etiqueta: 'Cambios', ayuda: 'Al cambiar una comida, las sugerencias y el selector de recetas del día.' },
  { ambito: 'recetario', etiqueta: 'Recetario', ayuda: 'El recetario general que el atleta navega.' },
];

export interface ReglaDeReceta {
  recipeId: string;
  /** Días en los que NO sale. Ausente o vacío = ningún día. */
  dias?: WeekDay[];
  /** Dónde se esconde. Ausente o vacío = en todas partes. */
  ambitos?: AmbitoDeRegla[];
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

const afecta = (r: ReglaDeReceta, ambito: AmbitoDeRegla) => !r.ambitos?.length || r.ambitos.includes(ambito);

/**
 * Ids de receta que NO pueden salir en ese ámbito y en esos días.
 *
 * - Sin `dias` (pantallas sin contexto de día, como el buscador del recetario):
 *   solo cuentan las reglas de «todos los días». Una receta que solo se esconde
 *   los martes sigue siendo una receta que el atleta puede ver y elegir otro día.
 * - Con `dias` (el generador de un día, o de una semana en tanda): basta que la
 *   regla afecte a uno de ellos. En una tanda se cocina UNA receta para varios
 *   días, así que si no vale para uno de ellos no vale.
 */
export function recetasOcultas(
  reglas: ReglaDeReceta[] | undefined, ambito: AmbitoDeRegla, dias?: WeekDay[],
): Set<string> {
  const ocultas = new Set<string>();
  for (const r of reglas ?? []) {
    if (!afecta(r, ambito)) continue;
    const suyos = r.dias ?? [];
    if (suyos.length === 0 || (dias && dias.some(d => suyos.includes(d)))) ocultas.add(r.recipeId);
  }
  return ocultas;
}

/** ¿Se puede ofrecer esta receta? Atajo de una sola consulta, sin construir el conjunto. */
export function recetaPermitida(
  recipeId: string, reglas: ReglaDeReceta[] | undefined, ambito: AmbitoDeRegla, dias?: WeekDay[],
): boolean {
  const r = reglas?.find(x => x.recipeId === recipeId);
  if (!r || !afecta(r, ambito)) return true;
  const suyos = r.dias ?? [];
  if (suyos.length === 0) return false;
  return !(dias && dias.some(d => suyos.includes(d)));
}

/**
 * Pone, cambia o quita la regla de una receta.
 *
 * `null` la quita. Un objeto la crea o la modifica SIN perder lo que no se
 * toca: cambiar los días no resetea el ámbito y al revés. Los siete días, o los
 * tres ámbitos, equivalen a «todos» y no se guardan como lista. Una lista vacía
 * se ignora: dejar una regla que no afecta a nada no esconde nada, y para
 * mostrar la receta está el interruptor.
 */
export function conRegla(
  reglas: ReglaDeReceta[],
  recipeId: string,
  cambio: null | { dias?: WeekDay[]; ambitos?: AmbitoDeRegla[] },
): ReglaDeReceta[] {
  const resto = reglas.filter(r => r.recipeId !== recipeId);
  if (cambio === null) return resto;
  const previa = reglas.find(r => r.recipeId === recipeId);
  const dias = cambio.dias !== undefined ? cambio.dias : previa?.dias;
  const ambitos = cambio.ambitos !== undefined ? cambio.ambitos : previa?.ambitos;
  const nueva: ReglaDeReceta = { recipeId };
  const diasLimpios = dias && dias.length > 0 && dias.length < 7 ? [...new Set(dias)] : undefined;
  const ambitosLimpios = ambitos && ambitos.length > 0 && ambitos.length < AMBITOS.length ? [...new Set(ambitos)] : undefined;
  if (diasLimpios) nueva.dias = diasLimpios;
  if (ambitosLimpios) nueva.ambitos = ambitosLimpios;
  return [...resto, nueva];
}

/** Resumen corto para la lista: «todos los días» o «L, X, V». */
export function etiquetaDeDias(dias: WeekDay[] | undefined): string {
  if (!dias || dias.length === 0 || dias.length === 7) return 'todos los días';
  return DIAS_SEMANA.filter(d => dias.includes(d.dia)).map(d => d.corto).join(', ');
}

/** «Todo», o «Menú, Cambios»: dónde afecta la regla. */
export function etiquetaDeAmbitos(ambitos: AmbitoDeRegla[] | undefined): string {
  if (!ambitos || ambitos.length === 0 || ambitos.length === AMBITOS.length) return 'menú, cambios y recetario';
  return AMBITOS.filter(a => ambitos.includes(a.ambito)).map(a => a.etiqueta.toLowerCase()).join(' y ');
}

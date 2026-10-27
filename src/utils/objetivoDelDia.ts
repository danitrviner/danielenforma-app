import type { AthleteDietConfig, Diet, NutritionProgram, WeekDay } from '../types';
import { computeActivePhase } from './fasesNutricion';
import { dietaDeLaSemana, diaDeLaSemana, kcalDeDieta, macrosDeCupo } from './semanasNutricion';
import { addDays } from './trainingWeek';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants';
import { objetivoDeDieta } from './macrosLegado';

/* ═══════════════════════════════════════════════════════════════════════════
   EL OBJETIVO DEL DÍA — una sola respuesta a «¿qué le toca comer hoy a este
   atleta?».

   Antes había dos respuestas. Inicio elegía la dieta con `pickTodaysDiet` (sin
   ajustes de semana ni ciclado, y con el día libre como `null`) y Nutrición con
   `dietaPautadaDelDia` + `dietaDeLaSemana` (con ajustes, y sin entender el día
   libre). Además, al abrir Nutrición el móvil del atleta reescribía
   `activeDietIds` con la dieta de la fase. Resultado: dos pantallas podían
   contar kcal distintas para el mismo día.

   La fuente es el cupo (`Diet.budget`) de la dieta que le toca ese día, ya con
   lo programado (ajustes de semana, ciclado, comidas libres). Todo lo demás —
   kcal, gramos de cada macro, intercambios— se DERIVA de ese cupo; ningún otro
   campo guarda un objetivo que pueda contradecirlo. `phase.targetKcal` es una
   meta contra la que se compara (aviso), no un segundo objetivo.

   Orden de elección, el mismo para todas las pantallas:
     1. `weeklySchedule[día]`: un id → esa dieta; `null` → día libre, sin cupo.
     2. La dieta de la fase en curso.
     3. La primera de `activeDietIds`.
     4. Ninguna.
   Los borradores y las dietas del propio atleta (`selfManaged`) nunca cuentan.
   ═══════════════════════════════════════════════════════════════════════════ */

export type OrigenObjetivo = 'programada' | 'fase' | 'activa' | 'libre' | 'ninguna';

export type AvisoObjetivo =
  /** La fase pide unas kcal y el cupo de la dieta suma otras. */
  | { tipo: 'fase_difiere'; kcalDieta: number; kcalFase: number }
  /** El calendario semanal pone una dieta distinta de la de la fase y por eso gana. */
  | { tipo: 'calendario_tapa_fase'; dietaProgramada: string; dietaDeFase: string };

export interface ObjetivoDelDia {
  fecha: string;
  origen: OrigenObjetivo;
  /** La dieta tal y como rige ese día (con los ajustes aplicados). `null` si es día libre o no hay. */
  dieta: Diet | null;
  /** La dieta sin ajustes, tal y como la guardó el coach. */
  dietaBase: Diet | null;
  faseId?: string;
  kcal: number | null;
  /** Intercambios de cada macro del cupo, con los mixtos repartidos. */
  intercambios: { HC: number; PROT: number; GRASA: number } | null;
  /** Gramos de cada macro, derivados de los intercambios. */
  gramos: { p: number; hc: number; g: number } | null;
  avisos: AvisoObjetivo[];
}

/** Diferencia de kcal por debajo de la cual fase y cupo se consideran iguales (un cuarto de intercambio ≈ 25 kcal, y un redondeo). */
export const TOLERANCIA_KCAL_FASE = 30;

export interface EntradaObjetivo {
  diets: Diet[];
  config: AthleteDietConfig | null | undefined;
  program: NutritionProgram | null | undefined;
  fecha: string;
  /** Si ese día tiene sesión de entreno (para el ciclado de hidratos). `undefined` = no se sabe. */
  entrena?: boolean;
}

/** Gramos de cada macro a partir de los intercambios del cupo. */
export function gramosDeIntercambios(i: { HC: number; PROT: number; GRASA: number }): { p: number; hc: number; g: number } {
  return {
    p: Math.round(i.PROT * GRAMS_PER_EXCHANGE.PROT),
    hc: Math.round(i.HC * GRAMS_PER_EXCHANGE.HC),
    g: Math.round(i.GRASA * GRAMS_PER_EXCHANGE.GRASA),
  };
}

export function objetivoDelDia({ diets, config, program, fecha, entrena }: EntradaObjetivo): ObjetivoDelDia {
  const propias = diets.filter(d => !d.selfManaged && !d.isDraft);
  const porId = (id: string | null | undefined) => (id ? propias.find(d => d.id === id) : undefined);

  const fase = program ? computeActivePhase(program, fecha) : null;
  const dietaDeFase = porId(fase?.dietId);
  const programadaId = config?.weeklySchedule?.[diaDeLaSemana(fecha)];

  let origen: OrigenObjetivo = 'ninguna';
  let base: Diet | null = null;

  if (programadaId === null) {
    origen = 'libre';
  } else {
    const programada = porId(programadaId);
    if (programada) { base = programada; origen = 'programada'; }
    else if (dietaDeFase) { base = dietaDeFase; origen = 'fase'; }
    else {
      const activas = new Set(config?.activeDietIds ?? []);
      const activa = propias.find(d => activas.has(d.id));
      if (activa) { base = activa; origen = 'activa'; }
    }
  }

  const dieta = base ? dietaDeLaSemana(base, program, fecha, entrena) : null;
  const intercambios = dieta ? macrosDeCupo(dieta.budget) : null;
  const kcal = dieta ? kcalDeDieta(dieta) : null;

  const avisos: AvisoObjetivo[] = [];
  // Se compara la dieta SIN ajustes de ese día: el ciclado o una comida libre
  // mueven las kcal a propósito, y eso no es que la fase y el cupo discrepen.
  const kcalBase = base ? kcalDeDieta(base) : null;
  if (kcalBase != null && fase?.targetKcal != null && Math.abs(kcalBase - fase.targetKcal) > TOLERANCIA_KCAL_FASE) {
    avisos.push({ tipo: 'fase_difiere', kcalDieta: kcalBase, kcalFase: fase.targetKcal });
  }
  if (origen === 'programada' && base && dietaDeFase && base.id !== dietaDeFase.id) {
    avisos.push({ tipo: 'calendario_tapa_fase', dietaProgramada: base.name, dietaDeFase: dietaDeFase.name });
  }

  return {
    fecha, origen, dieta, dietaBase: base, faseId: fase?.id,
    // Los gramos son los del objetivo de la dieta, no una traducción del cupo (B3, 26-10-2026).
    kcal, intercambios, gramos: dieta ? (({ p, hc, g }) => ({ p: Math.round(p), hc: Math.round(hc), g: Math.round(g) }))(objetivoDeDieta(dieta)) : null,
    avisos,
  };
}

/**
 * La dieta «de referencia» del atleta para informes que no miran un día
 * concreto (micronutrientes, hábitos de la revisión, análisis del asistente):
 * la de la fase en curso, si no la primera activa, si no la primera del coach.
 * No depende del calendario semanal ni de que nadie haya reescrito
 * `activeDietIds`. Los borradores y las dietas del atleta nunca cuentan.
 */
export function dietaDeReferencia(
  diets: Diet[], config: AthleteDietConfig | null | undefined, program: NutritionProgram | null | undefined, fecha: string,
): Diet | null {
  const propias = diets.filter(d => !d.selfManaged && !d.isDraft);
  const fase = program ? computeActivePhase(program, fecha) : null;
  const deFase = fase?.dietId ? propias.find(d => d.id === fase.dietId) : undefined;
  if (deFase) return deFase;
  const activas = new Set(config?.activeDietIds ?? []);
  return propias.find(d => activas.has(d.id)) ?? propias[0] ?? null;
}

/**
 * Qué dieta lleva cada día de la semana `semana` del programa en el menú que
 * se genera solo: la MISMA respuesta que da `objetivoDelDia` a las demás
 * pantallas (calendario → fase → activa; `null` = día libre), día a día.
 * Antes el generador leía el calendario a mano: un día sin dieta salía vacío
 * aunque Nutrición le enseñara la de la fase, y una dieta borrador o del propio
 * atleta se usaba si el calendario apuntaba a ella.
 *
 * `dietas` son solo las del coach que cuentan (sin borradores ni propias del
 * atleta). El ciclado por entreno no se aplica (no se sabe qué días entrena la
 * semana que viene), igual que hasta ahora.
 */
export function calendarioDeMenu(
  { diets, config, program, semana }: { diets: Diet[]; config: AthleteDietConfig | null | undefined; program: NutritionProgram; semana: number },
): { schedule: Partial<Record<WeekDay, string | null>>; dietas: Diet[] } {
  const dietas = diets.filter(d => !d.selfManaged && !d.isDraft);
  const schedule: Partial<Record<WeekDay, string | null>> = {};
  for (let i = 0; i < 7; i++) {
    const fecha = addDays(program.startDate, (semana - 1) * 7 + i);
    const dia = diaDeLaSemana(fecha);
    schedule[dia] = objetivoDelDia({ diets, config, program, fecha }).dietaBase?.id ?? null;
  }
  return { schedule, dietas };
}

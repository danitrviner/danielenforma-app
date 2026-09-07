// Helpers puros compartidos por el editor de "Mi plan" (fusión de la antigua
// Intercambios + Mis Dietas) y sus piezas. Extraído tal cual de
// NutritionScreen.tsx (líneas 17-55 de la versión pre-fusión) — sin cambio de
// comportamiento, solo de ubicación.
import { Diet, DietCompletionLog, DietMeal, FoodCategory, WeekDay } from '../../types';
import { comidasDelDia, cupoDelDia } from '../../utils/diaDeDieta';
import { BUDGET_CATS } from '../../utils/exchangeHelpers';

export const COACH_EMAIL = 'danitrviner@gmail.com';
export const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

export function blankDiet(athleteId: string, name = 'Mi menú'): Diet {
  return {
    id: `draft_${makeId()}`,
    athleteId,
    name,
    budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [{ id: makeId(), name: 'Comida 1', items: [] }],
    selfManaged: true,
  };
}

export function dietSnapshot(dt: Pick<Diet, 'name' | 'budget' | 'meals'>): string {
  return JSON.stringify({ name: dt.name, budget: dt.budget, meals: dt.meals });
}

// ── Weekly schedule constants ──────────────────────────────────────────────────

export const JS_TO_WD: Record<number, WeekDay> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
export const TODAY_WD: WeekDay = JS_TO_WD[new Date().getDay()];
export const TODAY_DATE: string = new Date().toISOString().split('T')[0];
export const WD_ORDER: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WD_SHORT: Record<WeekDay, string> = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
export const WD_FULL: Record<WeekDay, string> = { mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo' };

// ── Helpers ────────────────────────────────────────────────────────────────────

export function mealLabel(name: string, n: number): string {
  const stripped = name.replace(/^Comida\s*\d+\s*/i, '').trim();
  return stripped || `Comida ${n}`;
}

// Etiquetas del tracker (panel 01): el handoff usa el nombre completo en mono
// para las tres barras de presupuesto, distinto del CAT_LABEL compartido
// ("Proteína") que usan el resto de pantallas de intercambios.
export const BAR_LABEL: Record<'HC' | 'PROT' | 'GRASA', string> = { HC: 'HIDRATOS', PROT: 'PROTEÍNA', GRASA: 'GRASA' };
export const CHIP_LABEL: Record<'HC' | 'PROT' | 'GRASA', string> = { HC: 'HC', PROT: 'PR', GRASA: 'GR' };

// key = `${mealId}_${itemIdx}`
export type ItemState = { foodLabel: string; done: boolean };

// ── Esqueleto de un día nuevo ─────────────────────────────────────────────────

/**
 * Las comidas con las que arranca un día que todavía no tiene nada registrado.
 *
 * No copia lo que comiste ayer —eso sería inventarte el día— sino la ESTRUCTURA:
 * cuántas ingestas haces, cómo se llaman y en qué franja caen. Sale de la
 * anamnesis del atleta si la rellenó, y si no de un día normal de cinco
 * ingestas. Sin esto, cada día nuevo aparecía como una lista en blanco a la que
 * había que ir creando comidas a mano antes de poder registrar nada.
 */
const COMIDAS_POR_DEFECTO: { name: string; slot: number }[] = [
  { name: 'Desayuno', slot: 1 },
  { name: 'Media mañana', slot: 2 },
  { name: 'Comida', slot: 3 },
  { name: 'Merienda', slot: 4 },
  { name: 'Cena', slot: 5 },
];

export function estructuraDeDia(
  plantilla?: { name: string; slot?: number }[] | null,
): DietMeal[] {
  const base = plantilla?.length ? plantilla : COMIDAS_POR_DEFECTO;
  return base.map((m, i) => ({
    id: makeId() + `_${i}`,   // makeId() usa Date.now(): sin el sufijo, cinco comidas creadas en el mismo milisegundo colisionarían
    name: m.name,
    slot: m.slot,
    items: [],
  }));
}

/** "martes, 2 de septiembre" — la fecha del día que se está viendo, en claro. */
export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Con qué se siembra el editor de «Mi plan» para un día concreto.
 *
 * El fallo que cierra esto (07-09-2026, reproducido por Dani en producción con
 * su propia cuenta de atleta): registraba el día, salía y al volver estaba todo
 * "por comer" otra vez. El registro SÍ estaba guardado —se lee su documento en
 * Firestore y ahí están sus `doneItemIds`—, pero venía en el formato anterior a
 * 09-2026: sin `meals` dentro, apuntando a la dieta con `dietId`. Y la siembra
 * hacía `log.meals?.length ? log.meals : estructuraDeDia(...)`, o sea que para
 * esos días se inventaba una estructura NUEVA, con ids de comida nuevos
 * (`makeId()` = Date.now()), contra la que ninguna marca guardada podía casar.
 *
 * `comidasDelDia`/`cupoDelDia` (utils/diaDeDieta) ya resolvían exactamente esto
 * y las usaban los informes, la adherencia y la pantalla de inicio. La única
 * que no era la pantalla donde el atleta mira su día.
 *
 * Efecto secundario bueno: en cuanto toca ese día, se vuelve a guardar ya en el
 * formato nuevo (con `meals` dentro), así que el rescate solo hace falta una vez.
 */
export function sembrarDiaDelPlan(
  log: DietCompletionLog | null,
  dietas: Diet[],
  plantilla: { name: string; slot?: number }[] | null | undefined,
  cupoPautado: Record<FoodCategory, number> | null,
  /** La dieta que el coach ha programado para este día. Si el atleta todavía no
   *  ha registrado nada, el día se siembra CON ELLA: es lo que promete el panel
   *  del coach ("el atleta la verá cargada automáticamente") y lo que hace que
   *  un atleta con Día A entre semana y Día B el fin de semana vea los dos.
   *  En cuanto registra algo, manda su registro y esto ya no vuelve a mirarse. */
  dietaPautada?: Diet | null,
): { meals: DietMeal[]; budget: Record<FoodCategory, number> } {
  const registradas = comidasDelDia(log, dietas);
  /* «Hay registro» incluye el día que el atleta vació a propósito: `meals: []`
     es una respuesta, no la ausencia de una. Sin esta distinción, vaciar el día
     y volver a entrar te lo repintaba con la dieta programada por el coach —
     justo lo contrario de lo que acabas de hacer. Solo un día del que no hay
     NADA escrito se siembra con la dieta del coach. */
  const hayRegistro = !!log && (Array.isArray(log.meals) || registradas.length > 0);
  const meals = hayRegistro
    ? registradas
    : (clonarComidas(dietaPautada) ?? estructuraDeDia(plantilla));

  const delDia = log ? cupoDelDia(log, dietas) : null;
  const tieneCupo = delDia && BUDGET_CATS.some(c => (delDia[c] ?? 0) > 0);
  const budget = tieneCupo
    ? delDia
    : (cupoPautado ?? dietaPautada?.budget ?? { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 });

  return { meals, budget };
}

/** Las comidas de la dieta del coach, copiadas para que el día del atleta sea
 *  suyo: editarlas no puede tocar la dieta del coach (que además él no tiene
 *  permiso para escribir). Ids nuevos por la misma razón — el día se guarda con
 *  sus propias comidas dentro. */
function clonarComidas(dieta: Diet | null | undefined): DietMeal[] | null {
  if (!dieta || dieta.meals.length === 0) return null;
  return dieta.meals.map((m, i) => ({
    ...m,
    id: `${makeId()}_${i}`,
    items: m.items.map(it => ({ ...it })),
  }));
}

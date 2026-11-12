import type { FoodCategory, Macros, MenuComplement, WeekDay } from '../types.js';
import { nombreDeAlimento, type AlimentoCatalogo } from './catalogoAlimentos.js';
import type { FrutaEnIngesta, MealSlotSpec } from './menuEngine.js';
import type { PaqueteDeRecetas } from './seleccionDeRecetas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Ingesta a medida en el generador de menús (11-2026)

   Dani: «para merendar, solo esto, esto o esto» y «un postre, algo dulce que
   se pueda programar». Dos cosas que el coach fija en cada ingesta:

   - De qué recetas tira: las de su lista (lo de siempre), solo unas que él
     elige, o las de un paquete. El menú rota entre ellas y «cambiar comida»
     no ofrece otras.
   - Un extra fijo además del plato (un alimento del catálogo), con su cantidad
     y los días que toca. Se descuenta del objetivo antes de elegir el plato,
     igual que la fruta obligatoria, y viaja como acompañamiento `fijo`.

   Se guarda por atleta en `athleteRecipeRules/{email}.ingestas`, junto a la
   fruta de cada comida, para que el menú automático y el cambio de comida del
   atleta lo respeten. Aquí solo vive la lógica pura.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DIAS_SEMANA: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const INICIAL_DE_DIA: Record<WeekDay, string> = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const NOMBRE_CORTO: Record<WeekDay, string> = { mon: 'lun', tue: 'mar', wed: 'mié', thu: 'jue', fri: 'vie', sat: 'sáb', sun: 'dom' };

export interface RecetaDeIngesta { id: string; nombre: string; foto?: string; kcal?: number }

/** De qué recetas tira una ingesta. Ausente = las de su lista. */
export interface RecetasDeIngesta {
  /** Solo estas (el menú rota entre ellas y «cambiar comida» no ofrece otras). */
  recetas?: RecetaDeIngesta[];
  /** Solo las de este paquete del coach. */
  paqueteId?: string;
}

/** Algo fijo además del plato: «1 onza de chocolate de lunes a viernes». */
export interface ExtraFijo {
  /** Alimento del catálogo por 100 g. */
  alimentoId: string;
  nombre: string;
  porCien: { kcal: number; p: number; hc: number; g: number };
  /** Con medida casera: cuántas y cómo se llama. */
  piezas?: number;
  unidad?: string;
  gramosPorPieza?: number;
  /** Sin medida casera: en gramos. */
  gramos?: number;
  /** Días que toca. Ausente = todos los días con dieta. */
  dias?: WeekDay[];
}

export type ModoDeRecetas = 'lista' | 'estas' | 'paquete';

export function modoDeRecetas(r: RecetasDeIngesta | undefined): ModoDeRecetas {
  if (r?.paqueteId) return 'paquete';
  return r?.recetas ? 'estas' : 'lista';
}

const r5 = (n: number) => Math.round(n / 5) * 5;

export function gramosDeExtra(e: ExtraFijo): number {
  if (e.piezas != null && e.gramosPorPieza) return Math.round(e.piezas * e.gramosPorPieza);
  return e.gramos ?? 0;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function macrosDeExtraFijo(e: ExtraFijo): Macros {
  const f = gramosDeExtra(e) / 100;
  return { kcal: Math.round(e.porCien.kcal * f), p: r1(e.porCien.p * f), hc: r1(e.porCien.hc * f), g: r1(e.porCien.g * f) };
}

export function kcalDeExtra(e: ExtraFijo): number {
  return macrosDeExtraFijo(e).kcal;
}

/** El extra recién elegido del catálogo: una pieza si tiene medida casera; si
 *  no, la cantidad que ronda las 100 kcal (redondeada a 5 g). */
export function extraDeAlimento(a: AlimentoCatalogo): ExtraFijo {
  const { kcal, p, hc, g } = a.porCien;
  const base = { alimentoId: a.id, nombre: nombreDeAlimento(a), porCien: { kcal, p, hc, g } };
  if (a.unidad && a.unidad.gramos > 0) return { ...base, piezas: 1, unidad: a.unidad.nombre, gramosPorPieza: a.unidad.gramos };
  const gramos = kcal > 0 ? Math.max(5, r5((100 / kcal) * 100)) : 30;
  return { ...base, gramos };
}

/** Grupo del banco al que más se parece, para lo que todavía lee por grupos. */
function categoriaDe(porCien: ExtraFijo['porCien']): FoodCategory {
  const p = porCien.p * 4, hc = porCien.hc * 4, g = porCien.g * 9;
  return g >= p && g >= hc ? 'GRASA' : p >= hc ? 'PROT' : 'HC';
}

/** El extra como acompañamiento del menú: obligatorio (el reajuste del día no
 *  lo quita) y marcado `fijo` para distinguirlo de la fruta que pide el coach. */
export function complementoDeExtraFijo(e: ExtraFijo): MenuComplement {
  return {
    foodLabel: e.nombre,
    category: categoriaDe(e.porCien),
    quantity: 0,
    alimentoId: e.alimentoId,
    gramos: gramosDeExtra(e),
    ...(e.piezas != null ? { piezas: e.piezas, unidad: e.unidad ?? 'unidad' } : {}),
    macros: macrosDeExtraFijo(e),
    obligatoria: true,
    fijo: true,
  };
}

/** Paso con el que sube y baja la cantidad: medias piezas, o gramos según el peso. */
export function pasoDeExtra(e: ExtraFijo): number {
  if (e.piezas != null) return 0.5;
  const g = e.gramos ?? 0;
  return g < 20 ? 1 : g < 100 ? 5 : 10;
}

export function conCantidad(e: ExtraFijo, cantidad: number): ExtraFijo {
  if (e.piezas != null) return { ...e, piezas: Math.max(0.5, Math.round(cantidad * 2) / 2) };
  return { ...e, gramos: Math.max(1, Math.round(cantidad)) };
}

const fmt = (n: number) => n.toLocaleString('es-ES');
const FRACCION: Record<string, string> = { '0.5': '½', '1.5': '1½', '2.5': '2½' };

/** «1 onza de Chocolate negro 85 %», «30 g de Miel», «½ ración de Natillas». */
export function textoDeExtraFijo(e: ExtraFijo): string {
  if (e.piezas != null) {
    const n = FRACCION[String(e.piezas)] ?? fmt(e.piezas);
    return `${n} ${e.unidad ?? 'unidad'} de ${e.nombre}`;
  }
  return `${fmt(e.gramos ?? 0)} g de ${e.nombre}`;
}

/** ¿Toca el extra ese día? Sin días marcados, todos. */
export function tocaElDia(e: ExtraFijo, dia: WeekDay): boolean {
  return !e.dias || e.dias.includes(dia);
}

export function conDiaAlternado(e: ExtraFijo, dia: WeekDay, diasConDieta: readonly WeekDay[]): ExtraFijo {
  const actuales = e.dias ?? [...diasConDieta];
  const nuevos = actuales.includes(dia) ? actuales.filter(d => d !== dia) : [...actuales, dia];
  const ordenados = DIAS_SEMANA.filter(d => nuevos.includes(d));
  const todos = diasConDieta.length > 0 && diasConDieta.every(d => ordenados.includes(d));
  const { dias: _fuera, ...resto } = e;
  return todos ? resto : { ...resto, dias: ordenados };
}

/** «Todos los días», «De lun a vie», «Sáb y dom», «Lun, mié y vie», «Ningún día». */
export function textoDeDias(dias: readonly WeekDay[] | undefined, diasConDieta: readonly WeekDay[] = DIAS_SEMANA): string {
  const d = DIAS_SEMANA.filter(x => (dias ?? diasConDieta).includes(x) && diasConDieta.includes(x));
  if (d.length === 0) return 'Ningún día';
  if (d.length === diasConDieta.length) return 'Todos los días';
  const idx = d.map(x => DIAS_SEMANA.indexOf(x));
  const seguidos = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const may = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (seguidos && d.length >= 3) return `De ${NOMBRE_CORTO[d[0]]} a ${NOMBRE_CORTO[d[d.length - 1]]}`;
  const nombres = d.map(x => NOMBRE_CORTO[x]);
  return may(nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`);
}

/** «De su lista», «3 recetas a elegir», «Paquete Desayunos rápidos». */
export function resumenDeRecetas(r: RecetasDeIngesta | undefined, nombreDePaquete: (id: string) => string | undefined): string {
  const modo = modoDeRecetas(r);
  if (modo === 'paquete') return `Paquete ${nombreDePaquete(r!.paqueteId!) ?? ''}`.trim();
  if (modo === 'lista') return 'De su lista';
  const n = r!.recetas!.length;
  return n === 0 ? 'Sin recetas elegidas' : n === 1 ? 'Siempre la misma receta' : `${n} recetas a elegir`;
}

/** Lo que conviene saber antes de generar con una lista cerrada. `rotan` es
 *  falso con batch cooking o variedad 1–2: ahí sale la misma toda la semana. */
export function avisoDeRecetas(r: RecetasDeIngesta | undefined, diasConDieta: number, rotan = true): string | null {
  if (modoDeRecetas(r) !== 'estas') return null;
  const n = r!.recetas!.length;
  if (n === 0) return 'Elige al menos una receta; sin ninguna, esta comida sale de su lista.';
  if (n === 1) return `Comerá esto los ${diasConDieta} días.`;
  if (!rotan) return 'Con batch cooking o variedad 1–2 sale una sola de estas toda la semana.';
  if (n < diasConDieta) return `Rota entre estas ${n}: cada una sale ${Math.floor(diasConDieta / n)}–${Math.ceil(diasConDieta / n)} veces por semana.`;
  return null;
}

/** Ids entre los que elige el generador en esa ingesta; null = sin cerrar. */
export function idsCerrados(r: RecetasDeIngesta | undefined, paquetes: readonly PaqueteDeRecetas[] = []): string[] | null {
  const modo = modoDeRecetas(r);
  const ids = modo === 'paquete' ? paquetes.find(p => p.id === r!.paqueteId)?.recipeIds : modo === 'estas' ? r!.recetas!.map(x => x.id) : undefined;
  return ids && ids.length > 0 ? ids : null;
}

/* ── Lo que se guarda por atleta ───────────────────────────────────────────── */

export interface IngestaAMedida { fruta?: FrutaEnIngesta; recetas?: RecetasDeIngesta; extra?: ExtraFijo }
/** Por posición y franja (`claveDeIngesta`): si el atleta cambia de número de
 *  comidas, lo guardado para una comida que ya no existe deja de aplicarse. */
export type IngestasAMedida = Record<string, IngestaAMedida>;

export const claveDeIngesta = (sl: Pick<MealSlotSpec, 'slot'>, i: number): string => `${i}_${sl.slot}`;

/** Lo que hay que guardar de las ingestas del editor (solo las que llevan algo). */
export function ingestasDeSlots(slots: readonly MealSlotSpec[]): IngestasAMedida {
  const out: IngestasAMedida = {};
  slots.forEach((sl, i) => {
    const una: IngestaAMedida = {
      ...(sl.fruta ? { fruta: sl.fruta } : {}),
      ...(sl.recetas ? { recetas: sl.recetas } : {}),
      ...(sl.extra ? { extra: sl.extra } : {}),
    };
    if (Object.keys(una).length > 0) out[claveDeIngesta(sl, i)] = una;
  });
  return out;
}

/** Las ingestas del atleta con lo que el coach dejó guardado para cada una. */
export function conIngestasAMedida<T extends MealSlotSpec>(slots: T[], guardadas: IngestasAMedida | undefined): T[] {
  if (!guardadas) return slots;
  return slots.map((sl, i) => {
    const g = guardadas[claveDeIngesta(sl, i)];
    return g ? { ...sl, ...g } : sl;
  });
}

// ─── Roadmap → Calendario del atleta (vista coach) ─────────────────────────────
// Toda la lógica de datos del calendario de 3 niveles (Año/Mes/Día), separada
// de React a propósito — mismo patrón que planEvents.ts/adherence.ts. Ningún
// componente calcula un color, un porcentaje o un estado por su cuenta: todo
// sale de aquí, así que los tres niveles y el sheet no pueden desincronizarse.
//
// Regla dura de todo el módulo: NADA INVENTADO. Un día sin dato es
// `'sin-datos'`, no un 0 ni un `'skipped'` a lo seguro. Un mesociclo sin
// `phaseType` ni palabras clave reconocibles es `null` (color neutro), no un
// tipo adivinado al azar.

import {
  Mesocycle, NutritionProgram, NutritionPhase, PhaseType, NutritionPhaseType,
  WorkoutAssignment, WorkoutLog, Workout, TaskItem, RoadmapItem, DietCompletionLog,
  Diet, CardioSession, BodyweightLog, FoodCategory, RefeedDay,
} from '../types';
import { addDays as addDaysStr } from './trainingWeek';
import { aggregate } from './trainingReport';
import { exchangeToKcal, GRAMS_PER_EXCHANGE } from './nutritionConstants';

// ── Fechas — mismo patrón que trainingWeek.ts: todo en YYYY-MM-DD local,
// nunca `toISOString()` (desplaza un día fuera de UTC — ver hoyIsoLocal). ──

function pad(n: number): string { return String(n).padStart(2, '0'); }
function parseISO(s: string): Date { return new Date(s + 'T00:00:00'); }
function finDeMesociclo(startDate: string, weeks: number): string { return addDaysStr(startDate, weeks * 7 - 1); }

// ── Clasificación de fase ────────────────────────────────────────────────────

const PALABRAS_FUERZA = ['fuerza', 'básicos', 'basicos', '1rm', 'rm est'];
const PALABRAS_HIPERTROFIA = ['hipertrofia', 'volumen', 'masa'];
const PALABRAS_DEFINICION = ['definición', 'definicion', 'grasa', 'cut', 'pérdida', 'perdida'];
const PALABRAS_MANTENIMIENTO = ['mantenimiento', 'recomposición', 'recomposicion'];
const PALABRAS_DESCARGA = ['descarga', 'deload'];

function contieneAlguna(texto: string, palabras: string[]): boolean {
  const t = texto.toLowerCase();
  return palabras.some(p => t.includes(p));
}

/**
 * Tipo de fase de un mesociclo para colorear el calendario. Usa
 * `meso.phaseType` si el coach lo marcó; si no, deduce por palabras clave del
 * objetivo; si no reconoce nada, `null` — el consumidor pinta color neutro,
 * nunca un tipo inventado.
 */
export function clasificarFaseEntreno(meso: Pick<Mesocycle, 'phaseType' | 'objective'>): PhaseType | null {
  if (meso.phaseType) return meso.phaseType;
  const obj = meso.objective ?? '';
  if (!obj.trim()) return null;
  if (contieneAlguna(obj, PALABRAS_DESCARGA)) return 'descarga';
  if (contieneAlguna(obj, PALABRAS_MANTENIMIENTO)) return 'mantenimiento';
  if (contieneAlguna(obj, PALABRAS_DEFINICION)) return 'definicion';
  if (contieneAlguna(obj, PALABRAS_HIPERTROFIA)) return 'hipertrofia';
  if (contieneAlguna(obj, PALABRAS_FUERZA)) return 'fuerza';
  return null;
}

/**
 * Tipo de fase de nutrición. Usa `fase.phaseType` si el coach lo marcó; si
 * no, compara `targetKcal` contra la fase anterior (más alto → superávit, más
 * bajo → déficit, igual → mantenimiento). Sin `targetKcal` en ninguna de las
 * dos, o sin fase anterior, `null`.
 */
export function clasificarFaseNutricion(
  fase: Pick<NutritionPhase, 'phaseType' | 'targetKcal'>,
  anterior: Pick<NutritionPhase, 'targetKcal'> | undefined,
): NutritionPhaseType | null {
  if (fase.phaseType) return fase.phaseType;
  if (fase.targetKcal === undefined || anterior?.targetKcal === undefined) return null;
  if (fase.targetKcal > anterior.targetKcal) return 'superavit';
  if (fase.targetKcal < anterior.targetKcal) return 'deficit';
  return 'mantenimiento';
}

const COLOR_FASE_ENTRENO: Record<PhaseType, string> = {
  fuerza: 'var(--color-phase-fuerza)',
  hipertrofia: 'var(--color-phase-hiper)',
  definicion: 'var(--color-phase-defi)',
  mantenimiento: 'var(--color-phase-mant)',
  descarga: 'var(--color-phase-descarga)',
};
const ICONO_FASE_ENTRENO: Record<PhaseType, string> = {
  fuerza: 'exercise',
  hipertrofia: 'fitness_center',
  definicion: 'local_fire_department',
  mantenimiento: 'balance',
  descarga: 'bedtime',
};
const COLOR_NEUTRO = 'var(--color-ink-4)';

export function colorFaseEntreno(tipo: PhaseType | null): string {
  return tipo ? COLOR_FASE_ENTRENO[tipo] : COLOR_NEUTRO;
}
export function iconoFaseEntreno(tipo: PhaseType | null): string {
  return tipo ? ICONO_FASE_ENTRENO[tipo] : 'help';
}

const COLOR_FASE_NUTRI: Record<NutritionPhaseType, string> = {
  deficit: 'var(--color-phase-defi)',
  mantenimiento: 'var(--color-phase-mant)',
  superavit: 'var(--color-phase-hiper)',
};
const ICONO_FASE_NUTRI: Record<NutritionPhaseType, string> = {
  deficit: 'trending_down',
  mantenimiento: 'balance',
  superavit: 'trending_up',
};
export function colorFaseNutricion(tipo: NutritionPhaseType | null): string {
  return tipo ? COLOR_FASE_NUTRI[tipo] : COLOR_NEUTRO;
}
export function iconoFaseNutricion(tipo: NutritionPhaseType | null): string {
  return tipo ? ICONO_FASE_NUTRI[tipo] : 'restaurant';
}

// ── Bandas (Año/Mes) ─────────────────────────────────────────────────────────

export interface BandaEntreno {
  id: string;
  nombre: string;
  tipo: PhaseType | null;
  color: string;
  icono: string;
  inicio: string; // YYYY-MM-DD
  fin: string;     // YYYY-MM-DD, inclusive
  numero: number;
  semanas: number;
  deloadWeek?: number;
}

export interface BandaNutricion {
  id: string;
  nombre: string;
  tipo: NutritionPhaseType | null;
  color: string;
  icono: string;
  inicio: string;
  fin: string;
  targetKcal?: number;
  dietId: string;
}

/** Bandas de entreno, una por mesociclo, ordenadas por fecha de inicio. */
export function construirBandasEntreno(mesocycles: Mesocycle[]): BandaEntreno[] {
  return [...mesocycles]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map(m => {
      const tipo = clasificarFaseEntreno(m);
      return {
        id: m.id,
        nombre: m.objective?.trim() || `Mesociclo ${m.number}`,
        tipo,
        color: colorFaseEntreno(tipo),
        icono: iconoFaseEntreno(tipo),
        inicio: m.startDate,
        fin: finDeMesociclo(m.startDate, m.weeks),
        numero: m.number,
        semanas: m.weeks,
        deloadWeek: m.deloadWeek,
      };
    });
}

/** Bandas de nutrición, una por fase del programa, en orden. */
export function construirBandasNutricion(program: NutritionProgram | null): BandaNutricion[] {
  if (!program) return [];
  const bandas: BandaNutricion[] = [];
  let cursor = program.startDate;
  program.phases.forEach((fase, i) => {
    const fin = addDaysStr(cursor, fase.weeks * 7 - 1);
    const tipo = clasificarFaseNutricion(fase, program.phases[i - 1]);
    bandas.push({
      id: fase.id,
      nombre: fase.name?.trim() || `Fase ${i + 1}`,
      tipo,
      color: colorFaseNutricion(tipo),
      icono: iconoFaseNutricion(tipo),
      inicio: cursor,
      fin,
      targetKcal: fase.targetKcal,
      dietId: fase.dietId,
    });
    cursor = addDaysStr(cursor, fase.weeks * 7);
  });
  return bandas;
}

/** La banda vigente en una fecha, o `null` si no hay ninguna (fuera de plan). */
export function bandaEnFecha<B extends { inicio: string; fin: string }>(bandas: B[], fecha: string): B | null {
  return bandas.find(b => fecha >= b.inicio && fecha <= b.fin) ?? null;
}

/**
 * Rango de fechas (inclusive) de la semana de descarga marcada en un
 * mesociclo vía `deloadWeek` (1-indexada) — independiente de que el
 * mesociclo tenga o no `phaseType: 'descarga'` propio: un bloque de
 * hipertrofia con una semana de descarga al final sigue siendo hipertrofia
 * el resto del tiempo, la descarga es solo esos 7 días.
 */
export function semanaDeDescarga(banda: BandaEntreno): { inicio: string; fin: string } | null {
  if (banda.deloadWeek === undefined) return null;
  const inicio = addDaysStr(banda.inicio, (banda.deloadWeek - 1) * 7);
  const fin = addDaysStr(inicio, 6);
  return { inicio, fin };
}

// ── Recorte de bandas a un mes (Nivel Mes) ──────────────────────────────────

export interface SegmentoDeMes<B> {
  banda: B;
  entraAntes: boolean;   // la banda ya había empezado antes de este mes → esquina izq. recta, prefijo "←"
  sigueDespues: boolean; // la banda sigue después de este mes → esquina der. recta, sufijo "→"
  leftPct: number;       // 0-100, posición del día 1 del segmento dentro del mes
  widthPct: number;      // 0-100, ancho del segmento dentro del mes
  inicioVisible: string;
  finVisible: string;
}

/** Días del mes (1-indexado por parámetro `mes` 0-11). */
function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes + 1, 0).getDate();
}

/**
 * Nº de celdas vacías que hay que renderizar antes del día 1 para que la
 * semana quede alineada lunes-domingo (`getDay()` es 0=domingo..6=sábado;
 * se traduce a 0=lunes..6=domingo).
 */
export function huecosIniciales(anio: number, mes: number): number {
  const diaSemana = new Date(anio, mes, 1).getDay();
  return diaSemana === 0 ? 6 : diaSemana - 1;
}

/**
 * Recorta las bandas que solapan `[año-mes]` a segmentos con posición
 * relativa al mes, listos para dibujar como carril. Bandas que no tocan el
 * mes no aparecen.
 */
export function recortarAlMes<B extends { inicio: string; fin: string }>(
  bandas: B[], anio: number, mes: number,
): SegmentoDeMes<B>[] {
  const dim = diasDelMes(anio, mes);
  const inicioMes = `${anio}-${pad(mes + 1)}-01`;
  const finMes = `${anio}-${pad(mes + 1)}-${pad(dim)}`;
  const segmentos: SegmentoDeMes<B>[] = [];
  for (const banda of bandas) {
    if (banda.fin < inicioMes || banda.inicio > finMes) continue;
    const inicioVisible = banda.inicio < inicioMes ? inicioMes : banda.inicio;
    const finVisible = banda.fin > finMes ? finMes : banda.fin;
    const diaInicio = parseISO(inicioVisible).getDate();
    const diaFin = parseISO(finVisible).getDate();
    segmentos.push({
      banda,
      entraAntes: banda.inicio < inicioMes,
      sigueDespues: banda.fin > finMes,
      leftPct: ((diaInicio - 1) / dim) * 100,
      widthPct: ((diaFin - diaInicio + 1) / dim) * 100,
      inicioVisible, finVisible,
    });
  }
  return segmentos;
}

// ── Índice de días (el corazón del módulo) ──────────────────────────────────

export type EstadoDia = 'done' | 'partial' | 'skipped' | 'rest' | 'plan' | 'sin-datos';

export interface PuntosDia {
  entreno: boolean;
  nutricion: boolean; // "en objetivo": adherencia del día ≥ 85%
  cardio: boolean;
  peso: boolean;
}

export type TipoHito = TaskItem['type'] | RoadmapItem['type'];

export interface HitoDia {
  id: string;
  titulo: string;
  icono: string;
  tipo: TipoHito;
  completado: boolean;
}

export interface Destacado {
  etiqueta: string;
  icono: string;
  color: string;
}

export interface DetalleEntrenoDia {
  esDescanso: boolean;
  nombreRutina?: string;
  seriesHechas?: number;
  seriesTotal?: number;
  rirMedio?: number;
  tonelaje?: number;
  cardio?: { tipo: string; minutos: number; fcMedia?: number };
}

export interface MacroGramos { hecho: number; objetivo: number }
export interface DetalleNutricionDia {
  kcal?: number;
  kcalObjetivo?: number;
  adherenciaPct?: number;
  comidasHechas?: number;
  comidasTotal?: number;
  /** Gramos de proteína/hidratos/grasa — hecho (items marcados) vs. objetivo
   *  (presupuesto completo de la dieta enlazada). `undefined` en días futuros
   *  o sin dieta activa: no hay nada real que mostrar todavía. */
  macros?: { p: MacroGramos; c: MacroGramos; g: MacroGramos };
}

export interface DiaCalendario {
  fecha: string;
  esFuturo: boolean;
  estado: EstadoDia;
  faseEntreno: { id: string; tipo: PhaseType | null; color: string; icono: string; nombre: string } | null;
  faseNutricion: { id: string; tipo: NutritionPhaseType | null; color: string; nombre: string } | null;
  puntos: PuntosDia;
  hitos: HitoDia[];
  destacado: Destacado | null;
  /** Recarga programada ese día, si la hay (NutritionProgram.refeedDays). */
  refeed: RefeedDay | null;
  entreno: DetalleEntrenoDia;
  nutricion: DetalleNutricionDia;
}

export interface DatosCalendario {
  mesocycles: Mesocycle[];
  nutritionProgram: NutritionProgram | null;
  workoutAssignments: WorkoutAssignment[];
  workoutLogs: WorkoutLog[];
  workouts: Workout[];
  diets: Diet[];
  dietCompletionLogs: DietCompletionLog[];
  cardioSessions: CardioSession[];
  bodyweightLogs: BodyweightLog[];
  tasks: TaskItem[];
  roadmapItems: RoadmapItem[];
  highlightedDays: string[]; // Roadmap.highlightedDays — marcados a mano por el coach
}

// Kcal por intercambio — misma tabla que DietMealsView.tsx (comentario propio
// ahí: HC/PROT/GRASA de la fuente única, MIX_* aproximados a 100, sin
// constante compartida en el repo para esos dos).
const KCAL_POR_INTERCAMBIO: Record<FoodCategory, number> = {
  HC: exchangeToKcal({ HC: 1, PROT: 0, GRASA: 0 }),
  PROT: exchangeToKcal({ HC: 0, PROT: 1, GRASA: 0 }),
  GRASA: exchangeToKcal({ HC: 0, PROT: 0, GRASA: 1 }),
  MIX_HC: 100, MIX_GRASA: 100,
};

function kcalDeDieta(diet: Diet | undefined): number {
  if (!diet) return 0;
  let total = 0;
  for (const meal of diet.meals) for (const item of meal.items) total += item.quantity * KCAL_POR_INTERCAMBIO[item.category];
  return Math.round(total);
}

function kcalDeItemsHechos(diet: Diet | undefined, doneItemIds: string[]): number {
  if (!diet) return 0;
  const hechos = new Set(doneItemIds);
  let total = 0;
  for (const meal of diet.meals) meal.items.forEach((item, idx) => {
    if (hechos.has(`${meal.id}_${idx}`)) total += item.quantity * KCAL_POR_INTERCAMBIO[item.category];
  });
  return Math.round(total);
}

function totalItemsDeDieta(diet: Diet | undefined): number {
  if (!diet) return 0;
  return diet.meals.reduce((s, m) => s + m.items.length, 0);
}

// Gramos de un ítem según su categoría — misma fórmula que documenta
// CLAUDE.md: HC/PROT/GRASA van directos a GRAMS_PER_EXCHANGE; MIX_HC reparte
// mitad HC/mitad PROT y MIX_GRASA mitad GRASA/mitad PROT.
function gramosDeItem(categoria: FoodCategory, cantidad: number): { p: number; c: number; g: number } {
  if (categoria === 'HC') return { p: 0, c: cantidad * GRAMS_PER_EXCHANGE.HC, g: 0 };
  if (categoria === 'PROT') return { p: cantidad * GRAMS_PER_EXCHANGE.PROT, c: 0, g: 0 };
  if (categoria === 'GRASA') return { p: 0, c: 0, g: cantidad * GRAMS_PER_EXCHANGE.GRASA };
  if (categoria === 'MIX_HC') return { p: cantidad * 0.5 * GRAMS_PER_EXCHANGE.PROT, c: cantidad * 0.5 * GRAMS_PER_EXCHANGE.HC, g: 0 };
  return { p: cantidad * 0.5 * GRAMS_PER_EXCHANGE.PROT, c: 0, g: cantidad * 0.5 * GRAMS_PER_EXCHANGE.GRASA }; // MIX_GRASA
}

/** Macros objetivo (dieta completa) vs. hechos (solo ítems marcados) de un día. `undefined` sin dieta. */
function macrosDelDia(diet: Diet | undefined, doneItemIds: string[] | undefined): DetalleNutricionDia['macros'] {
  if (!diet) return undefined;
  const hechos = doneItemIds ? new Set(doneItemIds) : null;
  const objetivo = { p: 0, c: 0, g: 0 };
  const hecho = { p: 0, c: 0, g: 0 };
  for (const meal of diet.meals) meal.items.forEach((item, idx) => {
    const gr = gramosDeItem(item.category, item.quantity);
    objetivo.p += gr.p; objetivo.c += gr.c; objetivo.g += gr.g;
    if (hechos?.has(`${meal.id}_${idx}`)) { hecho.p += gr.p; hecho.c += gr.c; hecho.g += gr.g; }
  });
  const r = (n: number) => Math.round(n);
  return {
    p: { hecho: r(hecho.p), objetivo: r(objetivo.p) },
    c: { hecho: r(hecho.c), objetivo: r(objetivo.c) },
    g: { hecho: r(hecho.g), objetivo: r(objetivo.g) },
  };
}

/** RIR medio de un conjunto de entries, excluyendo series al fallo — mismo criterio que computeAverageRir (rirStats.ts), sin su ventana de 28 días. */
function rirMedioDeEntries(entries: WorkoutLog['entries']): number | undefined {
  const valores: number[] = [];
  for (const e of entries) for (const s of e.sets) {
    if (s.alFallo) continue;
    if (typeof s.rir === 'number' && !isNaN(s.rir)) valores.push(s.rir);
  }
  if (valores.length === 0) return undefined;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10;
}

const ICONO_TIPO_HITO: Record<string, string> = {
  revision: 'fact_check', cuestionario: 'quiz', foto: 'photo_camera', manual: 'flag', otro: 'event_note',
  objetivo: 'target', hito: 'flag', nota: 'sticky_note_2',
};

/**
 * Construye el índice `fecha ISO → DiaCalendario` para todo el rango
 * cubierto por los mesociclos + un margen razonable, en una sola pasada por
 * cada fuente de datos (no una pasada por día × fuente).
 */
export function construirIndiceDeDias(datos: DatosCalendario, hoy: string): Map<string, DiaCalendario> {
  const indice = new Map<string, DiaCalendario>();

  const bandasEntreno = construirBandasEntreno(datos.mesocycles);
  const bandasNutricion = construirBandasNutricion(datos.nutritionProgram);
  const descargas = bandasEntreno.map(semanaDeDescarga).filter((d): d is { inicio: string; fin: string } => d !== null);

  if (bandasEntreno.length === 0 && bandasNutricion.length === 0) return indice;

  const inicioRango = [...bandasEntreno, ...bandasNutricion].reduce((min, b) => b.inicio < min ? b.inicio : min, '9999-12-31');
  const finRango = [...bandasEntreno, ...bandasNutricion].reduce((max, b) => b.fin > max ? b.fin : max, '0000-01-01');

  const workoutsPorId = new Map(datos.workouts.map(w => [w.id, w]));
  const dietsPorId = new Map(datos.diets.map(d => [d.id, d]));

  const asignacionesPorFecha = new Map<string, WorkoutAssignment[]>();
  for (const a of datos.workoutAssignments) {
    const lista = asignacionesPorFecha.get(a.date) ?? [];
    lista.push(a);
    asignacionesPorFecha.set(a.date, lista);
  }
  const logsPorAssignment = new Map<string, WorkoutLog>();
  for (const l of datos.workoutLogs) if (l.assignmentId) logsPorAssignment.set(l.assignmentId, l);
  const logsPorFecha = new Map<string, WorkoutLog[]>();
  for (const l of datos.workoutLogs) {
    const lista = logsPorFecha.get(l.date) ?? [];
    lista.push(l);
    logsPorFecha.set(l.date, lista);
  }
  const dietLogsPorFecha = new Map(datos.dietCompletionLogs.map(l => [l.date, l]));
  const cardioPorFecha = new Map<string, CardioSession[]>();
  for (const c of datos.cardioSessions) {
    const lista = cardioPorFecha.get(c.date) ?? [];
    lista.push(c);
    cardioPorFecha.set(c.date, lista);
  }
  const pesoPorFecha = new Map(datos.bodyweightLogs.map(l => [l.date, l]));

  const hitosPorFecha = new Map<string, HitoDia[]>();
  for (const t of datos.tasks) {
    if (!t.dueDate) continue;
    const lista = hitosPorFecha.get(t.dueDate) ?? [];
    lista.push({ id: t.id, titulo: t.title, icono: ICONO_TIPO_HITO[t.type] ?? 'event_note', tipo: t.type, completado: t.status === 'done' });
    hitosPorFecha.set(t.dueDate, lista);
  }
  for (const it of datos.roadmapItems) {
    const fecha = it.targetDate ?? it.startDate;
    if (!fecha) continue;
    const lista = hitosPorFecha.get(fecha) ?? [];
    lista.push({ id: it.id, titulo: it.title, icono: ICONO_TIPO_HITO[it.type] ?? 'flag', tipo: it.type, completado: it.status === 'logrado' });
    hitosPorFecha.set(fecha, lista);
  }

  const destacadosManual = new Set(datos.highlightedDays);
  const refeedsPorFecha = new Map((datos.nutritionProgram?.refeedDays ?? []).map(r => [r.date, r]));

  let cursor = inicioRango;
  while (cursor <= finRango) {
    const fecha = cursor;
    const esFuturo = fecha >= hoy;
    const bandaEntreno = bandaEnFecha(bandasEntreno, fecha);
    const bandaNutri = bandaEnFecha(bandasNutricion, fecha);

    const enDescarga = descargas.some(d => fecha >= d.inicio && fecha <= d.fin);
    const faseEntreno = bandaEntreno ? {
      id: bandaEntreno.id,
      tipo: enDescarga ? 'descarga' as PhaseType : bandaEntreno.tipo,
      color: enDescarga ? COLOR_FASE_ENTRENO.descarga : bandaEntreno.color,
      icono: enDescarga ? ICONO_FASE_ENTRENO.descarga : bandaEntreno.icono,
      nombre: bandaEntreno.nombre,
    } : null;
    const faseNutricion = bandaNutri ? { id: bandaNutri.id, tipo: bandaNutri.tipo, color: bandaNutri.color, nombre: bandaNutri.nombre } : null;

    const asignacionesDelDia = asignacionesPorFecha.get(fecha) ?? [];
    const logsDelDia = logsPorFecha.get(fecha) ?? [];
    const cardioDelDia = cardioPorFecha.get(fecha) ?? [];
    const pesoDelDia = pesoPorFecha.get(fecha);

    // ── Estado del día ──
    let estado: EstadoDia;
    let esDescansoDelDia = false;
    if (esFuturo) {
      estado = 'plan';
    } else if (asignacionesDelDia.length === 0) {
      // Sin asignación: si hay un mesociclo activo, el split del coach
      // simplemente no programó nada ese día — descanso por diseño, no falta
      // de datos. Sin mesociclo activo, no se sabe nada de ese día.
      estado = bandaEntreno ? 'rest' : 'sin-datos';
      esDescansoDelDia = !!bandaEntreno;
    } else {
      const algunaCompletada = asignacionesDelDia.some(a => a.status === 'completed');
      const todasFalladas = asignacionesDelDia.every(a => a.status === 'skipped' || a.status === 'perdido' || (a.status === 'pending' && !esFuturo));
      if (algunaCompletada) {
        // "Parcial" = hay log pero registra menos series de las previstas por
        // el workout asignado ese día — comparación real contra el plan, no
        // un umbral inventado.
        const wo = workoutsPorId.get(asignacionesDelDia[0].workoutId);
        const seriesPrevistas = wo ? wo.exercises.reduce((s, e) => s + e.sets, 0) : undefined;
        const logsCompletados = asignacionesDelDia
          .filter(a => a.status === 'completed')
          .map(a => logsPorAssignment.get(a.id))
          .filter((l): l is WorkoutLog => !!l);
        const seriesHechas = logsCompletados.reduce((s, l) => s + l.entries.reduce((s2, e) => s2 + e.sets.length, 0), 0);
        estado = (seriesPrevistas !== undefined && seriesHechas > 0 && seriesHechas < seriesPrevistas) ? 'partial' : 'done';
      } else if (todasFalladas) {
        estado = 'skipped';
      } else {
        estado = 'sin-datos';
      }
    }

    // ── Detalle de entreno ──
    let detalleEntreno: DetalleEntrenoDia = { esDescanso: esDescansoDelDia };
    if (asignacionesDelDia.length > 0 && !esFuturo) {
      const asig = asignacionesDelDia[0];
      const wo = workoutsPorId.get(asig.workoutId);
      const log = logsPorAssignment.get(asig.id) ?? logsDelDia[0];
      const seriesTotal = wo ? wo.exercises.reduce((s, e) => s + e.sets, 0) : undefined;
      const seriesHechas = log ? log.entries.reduce((s, e) => s + e.sets.length, 0) : 0;
      detalleEntreno = {
        esDescanso: false,
        nombreRutina: wo?.name,
        seriesTotal,
        seriesHechas: log ? seriesHechas : 0,
        rirMedio: log ? rirMedioDeEntries(log.entries) : undefined,
        tonelaje: log ? aggregate([log]).tonnage : undefined,
      };
    } else if (asignacionesDelDia.length > 0 && esFuturo) {
      const wo = workoutsPorId.get(asignacionesDelDia[0].workoutId);
      detalleEntreno = { esDescanso: false, nombreRutina: wo?.name, seriesTotal: wo ? wo.exercises.reduce((s, e) => s + e.sets, 0) : undefined, seriesHechas: 0 };
    }
    if (cardioDelDia.length > 0) {
      const c = cardioDelDia[0];
      detalleEntreno.cardio = { tipo: c.type, minutos: Math.round(c.durationSec / 60), fcMedia: c.avgHR };
    }

    // ── Detalle de nutrición ──
    let detalleNutricion: DetalleNutricionDia = {};
    if (bandaNutri) {
      const diet = dietsPorId.get(bandaNutri.dietId);
      const kcalObjetivo = bandaNutri.targetKcal ?? (diet ? kcalDeDieta(diet) : undefined);
      if (esFuturo) {
        detalleNutricion = { kcalObjetivo, comidasTotal: diet?.meals.filter(m => m.items.length > 0).length };
      } else {
        const log = dietLogsPorFecha.get(fecha);
        const totalItems = totalItemsDeDieta(diet);
        const adherenciaPct = log && totalItems > 0 ? Math.round(Math.min(100, (log.doneItemIds.length / totalItems) * 100)) : undefined;
        const comidasTotal = diet?.meals.filter(m => m.items.length > 0).length;
        const comidasHechas = log && diet
          ? diet.meals.filter(m => m.items.length > 0 && m.items.every((_, idx) => log.doneItemIds.includes(`${m.id}_${idx}`))).length
          : undefined;
        detalleNutricion = {
          kcal: log ? kcalDeItemsHechos(diet, log.doneItemIds) : undefined,
          kcalObjetivo, adherenciaPct, comidasHechas, comidasTotal,
          macros: log ? macrosDelDia(diet, log.doneItemIds) : undefined,
        };
      }
    }

    // ── Puntos de categoría (fila de puntitos del resumen) ──
    const puntos: PuntosDia = {
      entreno: !esFuturo && asignacionesDelDia.some(a => a.status === 'completed'),
      nutricion: !esFuturo && (detalleNutricion.adherenciaPct ?? 0) >= 85,
      cardio: !esFuturo && cardioDelDia.length > 0,
      peso: !esFuturo && !!pesoDelDia,
    };

    // ── Día destacado ──
    let destacado: Destacado | null = null;
    const refeed = refeedsPorFecha.get(fecha);
    if (destacadosManual.has(fecha)) {
      destacado = { etiqueta: 'Día destacado', icono: 'star', color: 'var(--color-accent)' };
    } else if (refeed) {
      // Va antes que el inicio de fase a propósito: el refeed es lo que cambia
      // lo que el atleta come ESE día, y es lo que hay que ver de un vistazo.
      destacado = { etiqueta: refeed.note?.trim() || 'Recarga', icono: 'local_fire_department', color: 'var(--color-refeed)' };
    } else if (bandaEntreno && bandaEntreno.inicio === fecha && bandaEntreno !== bandasEntreno[0]) {
      destacado = { etiqueta: `Empieza ${bandaEntreno.nombre}`, icono: 'flag', color: bandaEntreno.color };
    } else if (bandaNutri && bandaNutri.inicio === fecha && bandaNutri !== bandasNutricion[0]) {
      destacado = { etiqueta: 'Nueva fase nutri', icono: 'restaurant', color: bandaNutri.color };
    } else {
      const hitoCompeticion = (hitosPorFecha.get(fecha) ?? []).find(h => h.tipo === 'objetivo');
      if (hitoCompeticion) destacado = { etiqueta: hitoCompeticion.titulo, icono: 'emoji_events', color: 'var(--color-accent)' };
    }

    indice.set(fecha, {
      fecha, esFuturo, estado, faseEntreno, faseNutricion, puntos,
      hitos: hitosPorFecha.get(fecha) ?? [],
      destacado,
      refeed: refeed ?? null,
      entreno: detalleEntreno,
      nutricion: detalleNutricion,
    });

    cursor = addDaysStr(cursor, 1);
  }

  return indice;
}

// ── Agregados de mes ─────────────────────────────────────────────────────────

/** Días de un mes calendario concreto que existen en el índice, en orden. */
export function diasDelIndiceEnMes(indice: Map<string, DiaCalendario>, anio: number, mes: number): DiaCalendario[] {
  const dim = diasDelMes(anio, mes);
  const dias: DiaCalendario[] = [];
  for (let d = 1; d <= dim; d++) {
    const fecha = `${anio}-${pad(mes + 1)}-${pad(d)}`;
    const dia = indice.get(fecha);
    if (dia) dias.push(dia);
  }
  return dias;
}

/**
 * % de adherencia de entreno de un mes — hecho cuenta 1, parcial 0.5, sobre
 * los días con dato real (rest/plan/sin-datos no cuentan ni en base ni en
 * numerador). `null` si no hay ningún día evaluable ese mes (no 0%).
 */
export function adherenciaDelMes(indice: Map<string, DiaCalendario>, anio: number, mes: number): number | null {
  const dias = diasDelIndiceEnMes(indice, anio, mes);
  let puntuacion = 0, evaluables = 0;
  for (const d of dias) {
    if (d.estado === 'done') { puntuacion += 1; evaluables++; }
    else if (d.estado === 'partial') { puntuacion += 0.5; evaluables++; }
    else if (d.estado === 'skipped') { evaluables++; }
  }
  if (evaluables === 0) return null;
  return Math.round((puntuacion / evaluables) * 100);
}

/** Hasta `max` hitos del mes, en orden de fecha. */
export function hitosDelMes(
  indice: Map<string, DiaCalendario>, anio: number, mes: number, max = 3,
): { fecha: string; hito: HitoDia }[] {
  const out: { fecha: string; hito: HitoDia }[] = [];
  for (const dia of diasDelIndiceEnMes(indice, anio, mes)) {
    for (const hito of dia.hitos) out.push({ fecha: dia.fecha, hito });
  }
  return out.slice(0, max);
}

/** Objetivos del roadmap SIN fecha — se listan aparte, no entran en el índice de días. */
export function objetivosSinFecha(items: RoadmapItem[]): RoadmapItem[] {
  return items.filter(it => !it.startDate && !it.targetDate);
}

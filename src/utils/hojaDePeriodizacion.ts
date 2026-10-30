import type { Diet, Macros, NutritionPhase, NutritionProgram, PlantillaFase, PlantillaPeriodizacion } from '../types.js';
import { RANGO_PCT_SEMANA, type ObjetivoCorporalTipo } from './verificacionObjetivo.js';
import { resolvePhaseTargetKcal } from './nutritionPeriodization.js';
import { ajusteEnGramos, kcalPorSemana, programarAjuste, totalSemanas } from './semanasNutricion.js';
import { semanasParaElObjetivo } from './ritmoDePeso.js';
import { objetivoYCupo } from './macrosLegado.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La hoja de periodización (30-10-2026)

   Lo que decidió Dani para programar la comida de un cliente «al dedillo»:
   · Fija OBJETIVO, RITMO (% del peso por semana) y SEMANAS; el peso al final
     de cada fase sale solo, encadenando fases.
   · Macros por kg de peso (proteína, grasa); los hidratos son el resto hasta
     las kcal de la fase. Con eso se crea la dieta base de la fase.
   · Escalones: cada N semanas, −kcal / +pasos. Los propone la hoja, los
     confirma él; confirmados se escriben donde ya lee el día del atleta
     (`cambiosSemana`, `pasosPorSemana`). Nada se aplica solo.
   · «Pérdida acelerada» no es solo un ritmo: proteína 1,8-2 g/kg y como
     mucho 8 semanas, luego salida de déficit.
   · Plantillas suyas, editables.
   Todo puro; la pantalla solo pinta y guarda.
   ═══════════════════════════════════════════════════════════════════════════ */

export const KCAL_POR_KG = 7700;

/** Ritmos de referencia en % del peso por semana (en positivo; el signo lo pone el objetivo). */
export const RITMOS = { suave: 0.4, normal: 0.55, rapido: 0.7, acelerada: 0.8 } as const;

/** Lo que distingue a la pérdida acelerada además del ritmo (Dani, 30-10). */
export const ACELERADA = { maxSemanas: 8, proteinaGKg: [1.8, 2.0] as const, ritmoPct: [0.6, 1.0] as const };

export const PROTEINA_MIN_G_KG = 1.8;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** El signo del ritmo según el objetivo: bajar en déficit, subir en volumen, cero en franja. */
export function signoDelRitmo(objetivo: ObjetivoCorporalTipo | undefined): -1 | 0 | 1 {
  if (!objetivo) return 0;
  if (objetivo === 'deficit' || objetivo === 'deficit_acelerado') return -1;
  if (objetivo === 'volumen' || objetivo === 'salida_deficit') return 1;
  return 0;
}

/** Ritmo por defecto para un objetivo, en %/sem con signo (el centro del rango de la doctrina). */
export function ritmoPorDefecto(objetivo: ObjetivoCorporalTipo | undefined): number {
  const r = objetivo ? RANGO_PCT_SEMANA[objetivo] : undefined;
  if (!r) return 0;
  return r2((r.min + r.max) / 2);
}

/** Peso al final de una fase: lineal sobre el peso de entrada (mismo criterio que `planDeFase`). */
export function pesoAlFinal(pesoInicio: number, ritmoPctSem: number, semanas: number): number {
  return r1(pesoInicio * (1 + (ritmoPctSem / 100) * Math.max(0, semanas)));
}

/** kg/semana equivalentes a un % del peso, redondeados a 50 g. */
export function ritmoKgSem(pesoInicio: number, ritmoPctSem: number): number {
  return Math.round((ritmoPctSem / 100) * pesoInicio * 20) / 20;
}

export interface FaseEncadenada {
  pesoInicio: number;
  pesoFinal: number | null;
  weeks: number;
  ritmoKgSem: number | null;
  /** true si el peso final lo ha calculado la hoja (modo ritmo). */
  pesoCalculado: boolean;
  /** true si las semanas las ha calculado el motor viejo (peso objetivo + ritmo). */
  semanasCalculadas: boolean;
}

/**
 * Encadena las fases: cada una empieza donde acaba la anterior.
 *  · modo 'ritmo' (o ritmo en % sin peso objetivo): semanas fijas, el peso sale.
 *  · si no: lo de siempre (peso objetivo + kg/sem → semanas).
 */
export function encadenarFases(pesoInicial: number, fases: readonly Pick<NutritionPhase, 'modo' | 'ritmoPctSem' | 'targetRateKgWeek' | 'targetWeight' | 'weeks' | 'objetivo'>[]): FaseEncadenada[] {
  const out: FaseEncadenada[] = [];
  let peso = pesoInicial;
  for (const f of fases) {
    const porRitmo = f.modo === 'ritmo' || (f.ritmoPctSem != null && f.targetWeight == null);
    if (porRitmo) {
      const pct = f.ritmoPctSem ?? 0;
      const final = pesoAlFinal(peso, pct, f.weeks);
      out.push({ pesoInicio: peso, pesoFinal: final, weeks: f.weeks, ritmoKgSem: ritmoKgSem(peso, pct), pesoCalculado: true, semanasCalculadas: false });
      peso = final;
      continue;
    }
    const calculadas = semanasParaElObjetivo(peso, f.targetWeight, f.targetRateKgWeek);
    const weeks = calculadas ?? f.weeks;
    out.push({
      pesoInicio: peso, pesoFinal: f.targetWeight ?? null, weeks,
      ritmoKgSem: f.targetRateKgWeek ?? (f.targetWeight != null && weeks > 0 ? r2((f.targetWeight - peso) / weeks) : null),
      pesoCalculado: false, semanasCalculadas: calculadas != null,
    });
    if (f.targetWeight != null) peso = f.targetWeight;
  }
  return out;
}

/** Las fases listas para guardar: con `targetWeight` y `targetRateKgWeek` escritos, para que el resto del motor no cambie. */
export function fasesParaGuardar(pesoInicial: number, fases: readonly NutritionPhase[]): NutritionPhase[] {
  const cadena = encadenarFases(pesoInicial, fases);
  return fases.map((f, i) => {
    const c = cadena[i];
    if (!c.pesoCalculado) return c.semanasCalculadas ? { ...f, weeks: c.weeks } : f;
    return { ...f, modo: 'ritmo', targetWeight: c.pesoFinal ?? undefined, targetRateKgWeek: c.ritmoKgSem ?? undefined };
  });
}

/** kcal de MEDIA de la fase para ir a ese ritmo: mantenimiento + pasos + el déficit o superávit diario. */
export function kcalParaElRitmo(e: { mantenimientoKcal: number; pasosKcal: number; ritmoKgSem: number }): number {
  return Math.round((e.mantenimientoKcal + e.pasosKcal + (e.ritmoKgSem * KCAL_POR_KG) / 7) / 10) * 10;
}

/** Macros de la fase por kg de peso; los hidratos son el resto. Gramos redondeados a 5. */
export function macrosPorKg(e: { pesoKg: number; proteinaGKg: number; grasaGKg: number; kcal: number }): Macros {
  const p = Math.round((e.proteinaGKg * e.pesoKg) / 5) * 5;
  const g = Math.round((e.grasaGKg * e.pesoKg) / 5) * 5;
  const hc = Math.max(0, Math.round((e.kcal - p * 4 - g * 9) / 4 / 5) * 5);
  return { kcal: p * 4 + g * 9 + hc * 4, p, g, hc };
}

/** Lo que haría falta para crear la dieta base de una fase con esos macros (sin comidas: el coach las monta o el generador las propone). */
export function dietaDesdeMacros(athleteId: string, nombre: string, macros: Macros): Omit<Diet, 'id'> {
  return { athleteId, name: nombre, meals: [], ...objetivoYCupo(macros) };
}

/** Aviso cuando una fase de pérdida acelerada se sale de sus límites. */
export function avisoAcelerada(f: Pick<NutritionPhase, 'objetivo' | 'weeks' | 'proteinaGKg' | 'ritmoPctSem'>): string | null {
  if (f.objetivo !== 'deficit_acelerado') return null;
  const avisos: string[] = [];
  if (f.weeks > ACELERADA.maxSemanas) avisos.push(`más de ${ACELERADA.maxSemanas} semanas: luego toca salida de déficit`);
  if (f.proteinaGKg != null && (f.proteinaGKg < ACELERADA.proteinaGKg[0] || f.proteinaGKg > ACELERADA.proteinaGKg[1])) avisos.push(`proteína fuera de ${ACELERADA.proteinaGKg[0].toLocaleString('es-ES')}-${ACELERADA.proteinaGKg[1].toLocaleString('es-ES')} g/kg`);
  if (f.ritmoPctSem != null && (Math.abs(f.ritmoPctSem) < ACELERADA.ritmoPct[0] || Math.abs(f.ritmoPctSem) > ACELERADA.ritmoPct[1])) avisos.push(`ritmo fuera de ${ACELERADA.ritmoPct[0]}-${ACELERADA.ritmoPct[1]} %/sem`);
  return avisos.length ? `Pérdida acelerada: ${avisos.join(' · ')}.` : null;
}

// ── Escalones ───────────────────────────────────────────────────────────────

export interface Escalon {
  /** Semanas del programa que cubre el tramo. */
  desde: number;
  hasta: number;
  kcal: number;
  pasos: number | null;
  /** true si lo que ya hay programado en `cambiosSemana`/`pasosPorSemana` coincide. */
  confirmado: boolean;
}

/** Primera semana (del programa) de cada fase. */
export function semanaInicialDeFase(program: Pick<NutritionProgram, 'phases'>, faseIdx: number): number {
  return program.phases.slice(0, faseIdx).reduce((n, f) => n + f.weeks, 0) + 1;
}

const TOLERANCIA_KCAL = 25;

/**
 * Los tramos de una fase según su `escalon`: el primero a las kcal de inicio
 * de la fase, cada tramo siguiente ±kcal (y ±pasos). Mira lo ya programado
 * para marcar cuáles están confirmados. Sin `escalon`, un solo tramo.
 */
export function escalonesDeFase(program: NutritionProgram, diets: Diet[], faseIdx: number, pasosBase: number | null): Escalon[] {
  const fase = program.phases[faseIdx];
  if (!fase) return [];
  const inicio = semanaInicialDeFase(program, faseIdx);
  const fin = inicio + fase.weeks - 1;
  const diet = diets.find(d => d.id === fase.dietId);
  const base = resolvePhaseTargetKcal(fase, diet).kcal;
  const porSemana = kcalPorSemana(program, diets);
  const pasosVigentes = (s: number) => {
    const v = [...(program.pasosPorSemana ?? [])].filter(p => p.semana <= s).sort((a, b) => b.semana - a.semana)[0];
    return v?.pasos ?? pasosBase;
  };
  const cada = Math.max(1, fase.escalon?.cadaSemanas ?? fase.weeks);
  const out: Escalon[] = [];
  for (let k = 0, desde = inicio; desde <= fin; k++, desde += cada) {
    const hasta = Math.min(fin, desde + cada - 1);
    const kcal = base == null ? 0 : base + k * (fase.escalon?.kcal ?? 0);
    // Sin pasos propios, la fase hereda los que estuvieran vigentes al empezar (no vuelve a la base).
    const pasosFase = fase.pasos ?? (inicio > 1 ? pasosVigentes(inicio - 1) : pasosBase);
    const pasos = pasosFase == null ? null : pasosFase + k * (fase.escalon?.pasos ?? 0);
    const real = porSemana[desde];
    const kcalOk = base == null || (real != null && Math.abs(real - kcal) <= TOLERANCIA_KCAL) || (k === 0 && real == null);
    const pasosOk = pasos == null || pasosVigentes(desde) === pasos;
    out.push({ desde, hasta, kcal, pasos, confirmado: kcalOk && pasosOk });
  }
  return out;
}

/**
 * Escribe los escalones de una fase donde ya lee el día del atleta: la
 * diferencia de kcal va a hidratos desde la semana del tramo (`cambiosSemana`)
 * y los pasos a `pasosPorSemana`. Solo toca lo que no coincide.
 */
export function confirmarEscalones(program: NutritionProgram, diets: Diet[], faseIdx: number, pasosBase: number | null): NutritionProgram {
  let p: NutritionProgram = { ...program };
  for (const e of escalonesDeFase(program, diets, faseIdx, pasosBase)) {
    if (e.confirmado) continue;
    const real = kcalPorSemana(p, diets)[e.desde];
    if (real != null && e.kcal > 0 && Math.abs(real - e.kcal) > TOLERANCIA_KCAL) {
      const gramos = Math.round((e.kcal - real) / 4 / 5) * 5;
      if (gramos !== 0) p = { ...p, cambiosSemana: programarAjuste(p, e.desde, false, ajusteEnGramos('HC', gramos)) };
    }
    if (e.pasos != null) {
      const lista = (p.pasosPorSemana ?? []).filter(x => x.semana !== e.desde);
      const vigente = [...lista].filter(x => x.semana < e.desde).sort((a, b) => b.semana - a.semana)[0]?.pasos ?? pasosBase;
      if (vigente !== e.pasos) p = { ...p, pasosPorSemana: [...lista, { semana: e.desde, pasos: e.pasos }].sort((a, b) => a.semana - b.semana) };
    }
  }
  return p;
}

/** Confirma los escalones de TODAS las fases, en orden: así un cambio «desde»
 *  de una fase no se cuela en la siguiente (la primera semana de cada fase se
 *  vuelve a cuadrar con sus propias kcal). */
export function confirmarTodosLosEscalones(program: NutritionProgram, diets: Diet[], pasosBase: number | null): NutritionProgram {
  let p = program;
  for (let i = 0; i < program.phases.length; i++) p = confirmarEscalones(p, diets, i, pasosBase);
  return p;
}

/** kcal, pasos y fase de cada semana del programa, para la tabla «semana a semana». */
export function filasSemanaASemana(program: NutritionProgram, diets: Diet[], pasosBase: number | null): { semana: number; faseIdx: number; fase: NutritionPhase; kcal: number | null; pasos: number | null }[] {
  const n = totalSemanas(program);
  const kcal = kcalPorSemana(program, diets);
  const out = [];
  let acumulado = 0;
  for (let i = 0; i < program.phases.length; i++) {
    const fase = program.phases[i];
    for (let w = 1; w <= fase.weeks; w++) {
      const semana = acumulado + w;
      if (semana > n) break;
      const v = [...(program.pasosPorSemana ?? [])].filter(x => x.semana <= semana).sort((a, b) => b.semana - a.semana)[0];
      out.push({ semana, faseIdx: i, fase, kcal: kcal[semana] ?? fase.targetKcal ?? null, pasos: v?.pasos ?? fase.pasos ?? pasosBase });
    }
    acumulado += fase.weeks;
  }
  return out;
}

// ── Plantillas ──────────────────────────────────────────────────────────────

export const PLANTILLAS_POR_DEFECTO: PlantillaPeriodizacion[] = [
  { id: 'definicion-12', nombre: 'Definición 12 sem + salida', fases: [
    { name: 'Definición', objetivo: 'deficit', weeks: 12, ritmoPctSem: -0.55, proteinaGKg: 2.0, grasaGKg: 0.8, escalon: { cadaSemanas: 3, kcal: -100, pasos: 1000 }, cardio: { sesiones: 2, zona: 'zona 2', minutos: 30 }, paraQue: 'Quitar grasa guardando el músculo' },
    { name: 'Salida de déficit', objetivo: 'salida_deficit', weeks: 2, ritmoPctSem: 0.1, proteinaGKg: 1.8, grasaGKg: 0.9, cardio: { sesiones: 1, zona: 'zona 2', minutos: 30 }, paraQue: 'Subir comida sin recuperar grasa' },
    { name: 'Mantenimiento', objetivo: 'mantenimiento', weeks: 4, ritmoPctSem: 0, proteinaGKg: 1.8, grasaGKg: 1.0, paraQue: 'Asentar el peso y rendir en el gimnasio' },
  ] },
  { id: 'definicion-diet-break', nombre: 'Definición + diet break', fases: [
    { name: 'Definición 1', objetivo: 'deficit', weeks: 6, ritmoPctSem: -0.55, proteinaGKg: 2.0, grasaGKg: 0.8, escalon: { cadaSemanas: 3, kcal: -100 }, cardio: { sesiones: 2, zona: 'zona 2', minutos: 30 }, paraQue: 'Primer tramo de pérdida' },
    { name: 'Diet break', objetivo: 'mantenimiento', weeks: 2, ritmoPctSem: 0, proteinaGKg: 1.8, grasaGKg: 1.0, paraQue: 'Descansar del déficit sin recuperar grasa' },
    { name: 'Definición 2', objetivo: 'deficit', weeks: 6, ritmoPctSem: -0.5, proteinaGKg: 2.0, grasaGKg: 0.8, escalon: { cadaSemanas: 3, kcal: -100, pasos: 1000 }, cardio: { sesiones: 2, zona: 'zona 2', minutos: 30 }, paraQue: 'Segundo tramo, más fino' },
    { name: 'Salida de déficit', objetivo: 'salida_deficit', weeks: 2, ritmoPctSem: 0.1, proteinaGKg: 1.8, grasaGKg: 0.9, paraQue: 'Subir comida sin recuperar grasa' },
  ] },
  { id: 'recomposicion-16', nombre: 'Recomposición 16', fases: [
    { name: 'Recomposición', objetivo: 'recomposicion', weeks: 16, ritmoPctSem: 0, proteinaGKg: 2.0, grasaGKg: 0.9, cardio: { sesiones: 1, zona: 'zona 2', minutos: 30 }, paraQue: 'Mismo peso, menos grasa y más fuerza' },
  ] },
  { id: 'volumen-12', nombre: 'Volumen 12', fases: [
    { name: 'Volumen', objetivo: 'volumen', weeks: 12, ritmoPctSem: 0.25, proteinaGKg: 1.8, grasaGKg: 0.9, escalon: { cadaSemanas: 4, kcal: 100 }, paraQue: 'Ganar músculo con la grasa a raya' },
  ] },
];

/** Fases nuevas a partir de una plantilla (sin dieta aún; se crea al guardar). */
export function fasesDesdePlantilla(plantilla: PlantillaPeriodizacion, ahora = Date.now()): NutritionPhase[] {
  return plantilla.fases.map((f, i) => ({ id: `phase_${ahora}_${i}`, dietId: '', modo: 'ritmo', ...f }));
}

/** Lo que guarda una plantilla de unas fases (sin ids ni dietas). */
export function plantillaDesdeFases(nombre: string, fases: readonly NutritionPhase[], id = `pl_${Date.now()}`): PlantillaPeriodizacion {
  const campos: (keyof PlantillaFase)[] = ['name', 'objetivo', 'weeks', 'ritmoPctSem', 'proteinaGKg', 'grasaGKg', 'pasos', 'cardio', 'escalon', 'paraQue'];
  return { id, nombre, fases: fases.map(f => Object.fromEntries(campos.filter(k => f[k] != null).map(k => [k, f[k]])) as PlantillaFase) };
}

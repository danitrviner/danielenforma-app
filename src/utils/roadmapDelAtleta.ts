import type { BodyweightLog, Mesocycle, NutritionProgram, QuestionnaireResponse, StepLog, WorkoutAssignment, WorkoutLog } from '../types.js';
import type { SemanaDelPlan, EvaluacionDelPlan } from './seguimientoPlan.js';
import { objetivoDeFase } from './objetivoDeFase.js';
import { OBJETIVO_LABEL, type ObjetivoCorporalTipo } from './verificacionObjetivo.js';
import { conEstadoReal } from './estadoDeAsignacion.js';
import { addDays, diasEntreFechas, getWeekStart } from './trainingWeek.js';
import { aggregate, allTimeBestBefore } from './trainingReport.js';
import type { ContextoPesoCorporal } from './pesoCorporal.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El Road map del atleta, derivado de los objetivos (29-10-2026)

   Decisión de Dani (28-10): el Road map es la pantalla con la que el cliente
   sabe en qué momento está, qué le queda y cuáles son los objetivos a corto
   y medio plazo. No se monta aparte: SALE de las fases del programa de
   nutrición (objetivo, semanas, peso meta) y del bloque de entreno. Las
   fases manuales del road map (`roadmap.planPhases`) se retiran.

   Lo que devuelve:
   · dondeEstas: la fase en curso, su objetivo en el idioma del cliente,
     «semana N de M», la franja de peso esperada esta semana y su peso. Sin
     rojo ni «desvío»: si va lento, qué hacer esta semana.
   · camino: TODAS las fases del plan (pasadas, actual, futuras), con el
     bloque de entreno en curso.
   · estaSemana: kcal, pasos (el reto y el cardio los pone la pantalla).
   · proximoHito: lo primero que llega (cambio de fase, fin de bloque, peso
     objetivo).
   · hitos: los que SALEN SOLOS del plan: fase completada, peso objetivo
     conseguido, bloque terminado, y constancia (4 semanas seguidas con todos
     los entrenos, 4 revisiones seguidas, 4 semanas cumpliendo pasos). Y los
     del arranque (29-10, tarde): primera sesión, primer peso, primera
     revisión, primera semana con todos los entrenos, para que «Conseguido»
     no esté en blanco el primer mes.
   · estaSemana.fuerza: kilos levantados esta semana, récords (1RM estimado
     por encima del mejor histórico) y el cambio por sesión frente a la
     semana pasada. En recomposición o volumen el peso engaña; esto no.
   · arranque: sin fases del programa, el camino NO se queda vacío: una sola
     fase «Tu arranque» montada con la fecha de publicación del plan, el
     bloque de entreno y la dieta. Dani ve en la bandeja que faltan fases.

   Puro: recibe `semanasDelPlan` ya calculado (la misma fuente que ve Dani en
   Plan › Objetivo) y lo demás, con la fecha inyectada.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FaseDelCamino {
  idx: number;
  nombre: string;
  objetivo: ObjetivoCorporalTipo | null;
  objetivoTexto: string;
  semanas: number;
  desde: string;
  hasta: string;
  pesoMeta: number | null;
  estado: 'pasada' | 'actual' | 'futura';
  /** Para qué es la fase, con las palabras del coach (hoja de periodización). */
  paraQue: string | null;
  cardio: { sesiones: number; zona?: string; minutos?: number } | null;
}

/** Una semana de la fase en curso, para la tira «semana a semana» del atleta. */
export interface SemanaDeFase {
  n: number;
  semana: number;
  real: number | null;
  esperado: number | null;
  estado: 'en-plan' | 'por-encima' | 'por-debajo' | null;
  enCurso: boolean;
  futura: boolean;
}

/** El siguiente cambio programado que le afecta: escalón de kcal, de pasos o cambio de fase. */
export interface ProximoCambio { semana: number; fecha: string; texto: string }

export interface DondeEstas {
  fase: FaseDelCamino;
  semanaDeFase: number;
  franja: [number, number] | null;
  pesoReal: number | null;
  /** Lo que se le dice del peso: nunca un reproche. */
  mensaje: string;
  /** kg que faltan hasta el peso meta de la fase (positivo = aún no), si hay. */
  faltanKg: number | null;
}

export interface BloqueDelCamino {
  id: string;
  nombre: string;
  semana: number;
  semanas: number;
  desde: string;
  hasta: string;
}

export interface HitoAutomatico {
  id: string;
  titulo: string;
  fecha: string; // YYYY-MM-DD
  icon: string;
  tipo: 'fase' | 'peso' | 'bloque' | 'constancia' | 'arranque';
}

export interface FuerzaDeLaSemana {
  /** kg levantados esta semana (lunes → hoy). */
  tonelaje: number;
  sesiones: number;
  /** Ejercicios cuyo 1RM estimado esta semana supera su mejor marca anterior. */
  records: number;
  /** Cambio del tonelaje por sesión frente a la semana pasada, en %. */
  deltaPct: number | null;
}

export interface ProximoHito { texto: string; fecha: string; tipo: HitoAutomatico['tipo'] }

export interface RoadmapDelAtleta {
  dondeEstas: DondeEstas | null;
  camino: FaseDelCamino[];
  bloque: BloqueDelCamino | null;
  estaSemana: { kcal: number | null; pasos: number | null; cardio: FaseDelCamino['cardio']; fuerza: FuerzaDeLaSemana | null; desde: string; hasta: string } | null;
  proximoHito: ProximoHito | null;
  hitos: HitoAutomatico[];
  /** Las semanas de la fase en curso, con su peso real y el esperado. */
  semanasDeFase: SemanaDeFase[];
  /** Todos los bloques de entreno (pasados, en curso, futuros), para pintarlos en el camino. */
  bloques: (BloqueDelCamino & { estado: 'pasada' | 'actual' | 'futura' })[];
  proximoCambio: ProximoCambio | null;
  /** Sin fases del programa: el camino es la fase de arranque. */
  arranque: boolean;
}

const kg = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

function objetivoTexto(tipo: ObjetivoCorporalTipo | null, pesoMeta: number | null, hasta: string): string {
  const etiqueta = tipo ? OBJETIVO_LABEL[tipo] : 'Fase';
  if (pesoMeta == null) return etiqueta;
  const verbo = tipo === 'volumen' ? 'subir a' : tipo === 'mantenimiento' || tipo === 'recomposicion' ? 'mantener' : 'bajar a';
  return `${etiqueta} · ${verbo} ${kg(pesoMeta)} kg antes del ${fechaCorta(hasta)}`;
}

/** Las fases del programa como camino, a partir de las semanas del plan. */
export function caminoDeFases(program: NutritionProgram, semanas: SemanaDelPlan[], hoy: string): FaseDelCamino[] {
  const out: FaseDelCamino[] = [];
  program.phases.forEach((fase, idx) => {
    const suyas = semanas.filter(s => s.faseIdx === idx);
    if (suyas.length === 0) return;
    const desde = suyas[0].desde, hasta = suyas[suyas.length - 1].hasta;
    const objetivo = objetivoDeFase(program, idx)?.tipo ?? null;
    const pesoMeta = fase.targetWeight ?? null;
    out.push({
      idx, nombre: fase.name, objetivo, objetivoTexto: objetivoTexto(objetivo, pesoMeta, hasta), semanas: suyas.length,
      desde, hasta, pesoMeta, estado: hasta < hoy ? 'pasada' : desde > hoy ? 'futura' : 'actual',
      paraQue: fase.paraQue?.trim() || null, cardio: fase.cardio ?? null,
    });
  });
  return out;
}

/** Semanas que dura «Tu arranque» cuando no hay bloque de entreno que las marque. */
export const SEMANAS_ARRANQUE = 4;

/**
 * Sin fases del programa, el camino no se queda vacío: una fase «Tu arranque»
 * desde que se publicó el plan (o empezó el bloque), que dura lo que el
 * bloque y nunca se queda en el pasado. Sin plan publicado ni bloque, nada.
 */
export function caminoDeArranque(e: { planPublishedAt?: string | null; bloque: BloqueDelCamino | null; hoy: string }): FaseDelCamino[] {
  const publicado = e.planPublishedAt?.slice(0, 10) ?? null;
  const desde = [publicado, e.bloque?.desde ?? null].filter((d): d is string => !!d && d <= e.hoy).sort()[0] ?? null;
  if (!desde) return [];
  const hastaBase = e.bloque?.hasta ?? addDays(desde, SEMANAS_ARRANQUE * 7 - 1);
  const hasta = hastaBase < e.hoy ? addDays(getWeekStart(e.hoy), 6) : hastaBase;
  return [{
    idx: 0, nombre: 'Tu arranque', objetivo: null, objetivoTexto: 'Coger el ritmo: entrenar, pesarte y registrar lo que comes',
    semanas: Math.max(1, Math.ceil((diasEntreFechas(desde, hasta) + 1) / 7)), desde, hasta, pesoMeta: null, estado: 'actual',
    paraQue: null, cardio: null,
  }];
}

const MENSAJE_ARRANQUE = 'Estas semanas cuenta el hábito: la sesión, el peso y la comida registrada. Con eso Dani te pone las fases y el peso meta.';

function mensajeDelPeso(e: { ev: EvaluacionDelPlan | null | undefined; objetivo: ObjetivoCorporalTipo | null; faltanKg: number | null; arranque?: boolean }): string {
  const { ev } = e;
  if (e.arranque) return MENSAJE_ARRANQUE;
  if (!ev || ev.ritmo == null) return 'Pésate tres mañanas por semana: con eso se ve la tendencia, no un día suelto.';
  if (ev.estado === 'en-plan') return 'Vas en el plan. Sigue igual esta semana.';
  const baja = (ev.ritmoPlan ?? 0) < 0;
  const lento = baja ? ev.estado === 'por-encima' : ev.estado === 'por-debajo';
  if (lento) {
    // Enfocado a la acción (Dani, 28-10): qué hacer esta semana, nunca reproche.
    const pasos = ev.pasosPlan && ev.pasosMedios != null && ev.pasosMedios < ev.pasosPlan * 0.9
      ? ` y llega a los ${String(Math.round(ev.pasosPlan)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} pasos`
      : '';
    return `Esta semana: registra la comida todos los días${pasos}. Con eso Dani ajusta el lunes si hace falta.`;
  }
  return baja
    ? 'Vas más rápido de lo previsto. Mantén las kcal del plan; Dani lo mira el lunes.'
    : 'Vas más rápido de lo previsto. Mantén las kcal del plan; Dani lo mira el lunes.';
}

export function dondeEstas(e: { camino: FaseDelCamino[]; semanas: SemanaDelPlan[]; evaluacion?: EvaluacionDelPlan | null; hoy: string; arranque?: boolean; pesos?: readonly Pick<BodyweightLog, 'date' | 'weight'>[] }): DondeEstas | null {
  const fase = e.camino.find(f => f.estado === 'actual');
  if (!fase) return null;
  if (e.arranque) {
    const ultimo = [...(e.pesos ?? [])].filter(p => p.date <= e.hoy).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    return {
      fase, semanaDeFase: Math.floor(diasEntreFechas(fase.desde, e.hoy) / 7) + 1, franja: null, pesoReal: ultimo?.weight ?? null, faltanKg: null,
      mensaje: mensajeDelPeso({ ev: null, objetivo: null, faltanKg: null, arranque: true }),
    };
  }
  const semanaEnCurso = e.semanas.find(s => s.enCurso) ?? e.semanas.filter(s => s.faseIdx === fase.idx && !s.futura).at(-1) ?? null;
  const semanaDeFase = semanaEnCurso ? e.semanas.filter(s => s.faseIdx === fase.idx && s.semana <= semanaEnCurso.semana).length : 1;
  const pesoReal = semanaEnCurso?.real ?? e.semanas.filter(s => s.real != null && !s.futura).at(-1)?.real ?? null;
  const faltanKg = fase.pesoMeta != null && pesoReal != null
    ? Math.round((fase.objetivo === 'volumen' ? fase.pesoMeta - pesoReal : pesoReal - fase.pesoMeta) * 10) / 10
    : null;
  return {
    fase, semanaDeFase, franja: semanaEnCurso?.franja ?? null, pesoReal, faltanKg,
    mensaje: mensajeDelPeso({ ev: e.evaluacion, objetivo: fase.objetivo, faltanKg }),
  };
}

export function bloqueEnCurso(mesociclos: readonly Mesocycle[], hoy: string): BloqueDelCamino | null {
  const m = mesociclos.find(m => !!m.startDate && hoy >= m.startDate && hoy <= addDays(m.startDate, m.weeks * 7 - 1));
  if (!m) return null;
  return {
    id: m.id, nombre: m.name || 'Bloque de entreno',
    semana: Math.floor(diasEntreFechas(m.startDate, hoy) / 7) + 1, semanas: m.weeks,
    desde: m.startDate, hasta: addDays(m.startDate, m.weeks * 7 - 1),
  };
}

/** Todos los bloques de entreno con su estado, en orden. */
export function bloquesDelCamino(mesociclos: readonly Mesocycle[], hoy: string): RoadmapDelAtleta['bloques'] {
  return [...mesociclos].filter(m => !!m.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate)).map(m => {
    const hasta = addDays(m.startDate, m.weeks * 7 - 1);
    return {
      id: m.id, nombre: m.name || 'Bloque de entreno', semanas: m.weeks, desde: m.startDate, hasta,
      semana: Math.min(m.weeks, Math.max(1, Math.floor(diasEntreFechas(m.startDate, hoy) / 7) + 1)),
      estado: hasta < hoy ? 'pasada' : m.startDate > hoy ? 'futura' : 'actual',
    };
  });
}

/** Las semanas de la fase en curso para la tira del atleta. */
export function semanasDeLaFase(semanas: SemanaDelPlan[], faseIdx: number): SemanaDeFase[] {
  return semanas.filter(s => s.faseIdx === faseIdx).map((s, i) => ({ n: i + 1, semana: s.semana, real: s.real, esperado: s.esperado, estado: s.estado, enCurso: s.enCurso, futura: s.futura }));
}

/**
 * El siguiente cambio programado después de esta semana: kcal (escalón),
 * pasos o cambio de fase, lo primero que llegue. `kcalSemana` y
 * `pasosSemana` van indexados por semana del programa (1-based).
 */
export function proximoCambio(e: { semanas: SemanaDelPlan[]; camino: FaseDelCamino[]; kcalSemana?: (number | null)[]; pasosSemana?: (number | null)[]; hoy: string }): ProximoCambio | null {
  const actual = e.semanas.find(s => s.enCurso);
  if (!actual) return null;
  for (let s = actual.semana + 1; s <= e.semanas.length; s++) {
    const fila = e.semanas[s - 1];
    const antes = e.semanas[s - 2];
    const partes: string[] = [];
    if (fila.faseIdx !== antes.faseIdx) {
      const f = e.camino.find(c => c.idx === fila.faseIdx);
      if (f) partes.push(`empiezas «${f.nombre}»`);
    }
    const k0 = e.kcalSemana?.[s - 1], k1 = e.kcalSemana?.[s];
    if (k0 != null && k1 != null && Math.abs(k1 - k0) >= 50) partes.push(`${k1 < k0 ? 'bajas' : 'subes'} a ${String(Math.round(k1)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kcal`);
    const p0 = e.pasosSemana?.[s - 1], p1 = e.pasosSemana?.[s];
    if (p0 != null && p1 != null && p1 !== p0) partes.push(`${p1 > p0 ? 'subes' : 'bajas'} a ${String(p1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} pasos`);
    if (partes.length) return { semana: s, fecha: fila.desde, texto: `En la S${s} ${partes.join(' y ')}.` };
  }
  return null;
}

/** Semanas (lunes) terminadas antes de hoy, de la más antigua a la más reciente, hasta `n` atrás. */
function semanasCerradas(hoy: string, n: number): string[] {
  const lunesActual = getWeekStart(hoy);
  return Array.from({ length: n }, (_, i) => addDays(lunesActual, -7 * (n - i)));
}

/** La racha más reciente de semanas cerradas que cumplen `ok`; devuelve el lunes de la 4.ª si llega a 4. */
function rachaDeCuatro(lunes: string[], ok: (lunes: string) => boolean): string | null {
  let racha = 0, ultimaConCuatro: string | null = null;
  for (const l of lunes) {
    racha = ok(l) ? racha + 1 : 0;
    if (racha >= 4 && racha % 4 === 0) ultimaConCuatro = l;
  }
  return ultimaConCuatro;
}

/** Los primeros logros, desde que se publicó el plan: el primer mes no está en blanco. */
export function hitosDelArranque(e: {
  planPublishedAt?: string | null;
  assignments: readonly WorkoutAssignment[];
  workoutLogs: readonly WorkoutLog[];
  pesos?: readonly Pick<BodyweightLog, 'date'>[];
  respuestas: readonly Pick<QuestionnaireResponse, 'submittedAt'>[];
  hoy: string;
}): HitoAutomatico[] {
  const desde = e.planPublishedAt?.slice(0, 10);
  if (!desde) return [];
  const hitos: HitoAutomatico[] = [];
  const enRango = (d: string) => d >= desde && d <= e.hoy;
  const asignaciones = conEstadoReal(e.assignments, e.workoutLogs).filter(a => enRango(a.date));
  const sesion = asignaciones.filter(a => a.status === 'completed').map(a => a.date).sort()[0];
  if (sesion) hitos.push({ id: 'arranque_sesion', titulo: 'Primera sesión hecha', fecha: sesion, icon: 'check_circle', tipo: 'arranque' });
  const peso = (e.pesos ?? []).map(p => p.date).filter(enRango).sort()[0];
  if (peso) hitos.push({ id: 'arranque_peso', titulo: 'Primer peso registrado', fecha: peso, icon: 'monitor_weight', tipo: 'arranque' });
  const revision = e.respuestas.map(r => r.submittedAt.slice(0, 10)).filter(enRango).sort()[0];
  if (revision) hitos.push({ id: 'arranque_revision', titulo: 'Primera revisión enviada', fecha: revision, icon: 'fact_check', tipo: 'arranque' });
  const primerLunes = getWeekStart(desde);
  for (const l of semanasCerradas(e.hoy, 26)) {
    if (l < primerLunes) continue;
    const deLaSemana = asignaciones.filter(a => a.date >= l && a.date <= addDays(l, 6));
    if (deLaSemana.length > 0 && deLaSemana.every(a => a.status === 'completed')) {
      hitos.push({ id: 'arranque_semana', titulo: 'Primera semana con todos los entrenos', fecha: addDays(l, 6), icon: 'event_available', tipo: 'arranque' });
      break;
    }
  }
  return hitos;
}

/** Kilos levantados esta semana, récords y el cambio por sesión frente a la pasada. */
export function fuerzaDeLaSemana(e: { workoutLogs: readonly WorkoutLog[]; hoy: string; ctx?: ContextoPesoCorporal | null }): FuerzaDeLaSemana | null {
  const lunes = getWeekStart(e.hoy);
  const deSemana = e.workoutLogs.filter(l => l.date >= lunes && l.date <= e.hoy);
  if (deSemana.length === 0) return null;
  const actual = aggregate(deSemana as WorkoutLog[], e.ctx);
  const pasada = aggregate(e.workoutLogs.filter(l => l.date >= addDays(lunes, -7) && l.date < lunes) as WorkoutLog[], e.ctx);
  const mejores = allTimeBestBefore(e.workoutLogs as WorkoutLog[], lunes, e.ctx);
  let records = 0;
  for (const [id, fila] of actual.perExercise) {
    const previo = mejores.get(id);
    // Un ejercicio nuevo no es un récord: hace falta una marca anterior que superar.
    if (previo != null && previo > 0 && fila.bestOrm > previo + 0.5) records++;
  }
  const porSesion = actual.tonnage / Math.max(1, actual.dates.size);
  const porSesionPasada = pasada.dates.size > 0 ? pasada.tonnage / pasada.dates.size : null;
  const deltaPct = porSesionPasada ? Math.round(((porSesion - porSesionPasada) / porSesionPasada) * 100) : null;
  return { tonelaje: Math.round(actual.tonnage), sesiones: actual.dates.size, records, deltaPct };
}

export function hitosAutomaticos(e: {
  camino: FaseDelCamino[];
  semanas: SemanaDelPlan[];
  mesociclos: readonly Mesocycle[];
  assignments: readonly WorkoutAssignment[];
  workoutLogs: readonly WorkoutLog[];
  respuestas: readonly Pick<QuestionnaireResponse, 'submittedAt'>[];
  stepLogs: readonly Pick<StepLog, 'date' | 'steps'>[];
  stepGoal: number;
  hoy: string;
  planPublishedAt?: string | null;
  pesos?: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
}): HitoAutomatico[] {
  const hitos: HitoAutomatico[] = hitosDelArranque(e);

  for (const f of e.camino) {
    if (f.estado !== 'pasada') continue;
    hitos.push({ id: `fase_${f.idx}`, titulo: `Fase «${f.nombre}» completada`, fecha: f.hasta, icon: 'route', tipo: 'fase' });
    const ultima = e.semanas.filter(s => s.faseIdx === f.idx && s.real != null).at(-1);
    if (f.pesoMeta != null && ultima?.real != null) {
      const conseguido = f.objetivo === 'volumen' ? ultima.real >= f.pesoMeta : f.objetivo === 'mantenimiento' || f.objetivo === 'recomposicion' ? Math.abs(ultima.real - f.pesoMeta) <= 1 : ultima.real <= f.pesoMeta;
      if (conseguido) hitos.push({ id: `peso_${f.idx}`, titulo: `Peso objetivo de la fase: ${kg(f.pesoMeta)} kg`, fecha: f.hasta, icon: 'flag', tipo: 'peso' });
    }
  }

  for (const m of e.mesociclos) {
    if (!m.startDate) continue;
    const fin = addDays(m.startDate, m.weeks * 7 - 1);
    if (fin < e.hoy) hitos.push({ id: `bloque_${m.id}`, titulo: `Bloque «${m.name || 'de entreno'}» terminado`, fecha: fin, icon: 'fitness_center', tipo: 'bloque' });
  }

  // Constancia: cuatro semanas seguidas (cerradas) con todos los entrenos,
  // cuatro revisiones seguidas, cuatro semanas cumpliendo pasos.
  const lunes = semanasCerradas(e.hoy, 26);
  const enSemana = (l: string, fecha: string) => fecha >= l && fecha <= addDays(l, 6);
  const asignaciones = conEstadoReal(e.assignments, e.workoutLogs);
  const entrenos = rachaDeCuatro(lunes, l => {
    const deLaSemana = asignaciones.filter(a => enSemana(l, a.date));
    return deLaSemana.length > 0 && deLaSemana.every(a => a.status === 'completed');
  });
  if (entrenos) hitos.push({ id: `const_entrenos_${entrenos}`, titulo: '4 semanas seguidas con todos los entrenos', fecha: addDays(entrenos, 6), icon: 'local_fire_department', tipo: 'constancia' });
  const revisiones = rachaDeCuatro(lunes, l => e.respuestas.some(r => enSemana(l, r.submittedAt.slice(0, 10))));
  if (revisiones) hitos.push({ id: `const_revisiones_${revisiones}`, titulo: '4 revisiones seguidas', fecha: addDays(revisiones, 6), icon: 'fact_check', tipo: 'constancia' });
  const pasos = rachaDeCuatro(lunes, l => {
    const dias = e.stepLogs.filter(s => enSemana(l, s.date));
    return dias.length >= 5 && dias.reduce((a, s) => a + s.steps, 0) / dias.length >= e.stepGoal;
  });
  if (pasos) hitos.push({ id: `const_pasos_${pasos}`, titulo: '4 semanas cumpliendo los pasos', fecha: addDays(pasos, 6), icon: 'directions_walk', tipo: 'constancia' });

  return hitos.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function proximoHito(e: { camino: FaseDelCamino[]; bloque: BloqueDelCamino | null; donde: DondeEstas | null; hoy: string }): ProximoHito | null {
  const candidatos: ProximoHito[] = [];
  const actual = e.camino.find(f => f.estado === 'actual');
  const siguiente = actual ? e.camino.find(f => f.idx === actual.idx + 1) : e.camino.find(f => f.estado === 'futura');
  if (actual && siguiente) {
    const en = diasEntreFechas(e.hoy, siguiente.desde);
    candidatos.push({ texto: `${OBJETIVO_LABEL[siguiente.objetivo ?? 'mantenimiento']} en ${en <= 7 ? `${en} días` : `${Math.round(en / 7)} semanas`}`, fecha: siguiente.desde, tipo: 'fase' });
  } else if (actual && actual.pesoMeta != null) {
    // En el arranque (sin peso meta) no hay fin de fase que anunciar.
    candidatos.push({ texto: `Fin de la fase «${actual.nombre}»`, fecha: addDays(actual.hasta, 1), tipo: 'fase' });
  }
  if (e.bloque) {
    const en = diasEntreFechas(e.hoy, e.bloque.hasta);
    candidatos.push({ texto: `Fin del bloque «${e.bloque.nombre}» en ${en <= 7 ? `${en} días` : `${Math.round(en / 7)} semanas`}`, fecha: e.bloque.hasta, tipo: 'bloque' });
  }
  if (e.donde?.faltanKg != null && e.donde.fase.pesoMeta != null && e.donde.faltanKg > 0 && e.donde.faltanKg <= 1.5) {
    candidatos.push({ texto: `Peso objetivo a ${kg(e.donde.faltanKg)} kg`, fecha: e.hoy, tipo: 'peso' });
  }
  return candidatos.sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null;
}

export function construirRoadmap(e: {
  program: NutritionProgram | null;
  semanas: SemanaDelPlan[];
  evaluacion?: EvaluacionDelPlan | null;
  mesociclos: readonly Mesocycle[];
  assignments: readonly WorkoutAssignment[];
  workoutLogs: readonly WorkoutLog[];
  respuestas: readonly Pick<QuestionnaireResponse, 'submittedAt'>[];
  stepLogs: readonly Pick<StepLog, 'date' | 'steps'>[];
  stepGoal: number;
  hoy: string;
  /** Para el arranque y los primeros hitos: cuándo se publicó el plan y sus pesos. */
  planPublishedAt?: string | null;
  pesos?: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  /** kcal de la dieta activa, para «Esta semana» cuando no hay programa. */
  kcalDieta?: number | null;
  /** Dominadas y fondos cuentan el peso corporal (ver pesoCorporal.ts). */
  ctxFuerza?: ContextoPesoCorporal | null;
  /** kcal y pasos de cada semana del programa (índice = semana), para el próximo cambio. */
  kcalSemana?: (number | null)[];
  pasosSemana?: (number | null)[];
}): RoadmapDelAtleta {
  const bloque = bloqueEnCurso(e.mesociclos, e.hoy);
  const deFases = e.program ? caminoDeFases(e.program, e.semanas, e.hoy) : [];
  const arranque = deFases.length === 0;
  const camino = arranque ? caminoDeArranque({ planPublishedAt: e.planPublishedAt, bloque, hoy: e.hoy }) : deFases;
  const donde = dondeEstas({ camino, semanas: e.semanas, evaluacion: e.evaluacion, hoy: e.hoy, arranque, pesos: e.pesos });
  const enCurso = e.semanas.find(s => s.enCurso) ?? null;
  const fuerza = fuerzaDeLaSemana({ workoutLogs: e.workoutLogs, hoy: e.hoy, ctx: e.ctxFuerza });
  const lunes = getWeekStart(e.hoy);
  const faseActual = camino.find(f => f.estado === 'actual') ?? null;
  const estaSemana = enCurso
    ? { kcal: enCurso.kcalPlan, pasos: enCurso.pasosPlan, cardio: faseActual?.cardio ?? null, fuerza, desde: enCurso.desde, hasta: enCurso.hasta }
    : camino.length > 0 ? { kcal: e.kcalDieta ?? null, pasos: e.stepGoal, cardio: null, fuerza, desde: lunes, hasta: addDays(lunes, 6) } : null;
  return {
    dondeEstas: donde, camino, bloque, estaSemana,
    proximoHito: proximoHito({ camino, bloque, donde, hoy: e.hoy }),
    hitos: hitosAutomaticos({ ...e, camino }),
    semanasDeFase: arranque || !faseActual ? [] : semanasDeLaFase(e.semanas, faseActual.idx),
    bloques: bloquesDelCamino(e.mesociclos, e.hoy),
    proximoCambio: arranque ? null : proximoCambio({
      semanas: e.semanas, camino, hoy: e.hoy,
      kcalSemana: e.kcalSemana ?? [null, ...e.semanas.map(s => s.kcalPlan)],
      pasosSemana: e.pasosSemana ?? [null, ...e.semanas.map(s => s.pasosPlan)],
    }),
    arranque: arranque && camino.length > 0,
  };
}

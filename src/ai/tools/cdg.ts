/* ═══════════════════════════════════════════════════════════════════════════
   TOOLS CDG (H20, diseño §7): el asistente entrena con el Índice de Hipertrofia
   sin recalcular nada. Los tres lectores/propuestas de aquí llaman a los MISMOS
   motores que las pantallas del coach (utils/cdg/*): el modelo recibe IEM,
   agujetas, contexto y la propuesta del protocolo ya calculados, y lo único que
   decide es ENTRE las alternativas que el motor marca (qué cambio descartar,
   qué ejercicio equivalente), más la redacción.

   · get_cdg_semana: IEM programado por zona esta semana y la anterior, lo
     realizado, agujetas vigentes, contexto de la semana y la propuesta
     (freno/acelerador) por zona.
   · propose_progresion_iem: la progresión de la semana que viene con
     `proponerProgresionIem` → propuesta `weekPlan` (origenIem) con los cambios
     por ejercicio. El modelo solo puede descartar cambios o ser más prudente.
   · get_alternativas_ejercicio: ejercicios del mismo grupo, con el material
     del atleta, que cargan menos una articulación dolorida.

   El catálogo CDG es material con licencia del coach: se lee por la fuente de
   datos (Firestore `cdgCatalogo/v4`, solo coach o Admin) y nunca sale entero
   en un resultado.
   ═══════════════════════════════════════════════════════════════════════════ */
import type { Exercise, Mesocycle, MuscleGroup, Workout, WorkoutExercise, WorkoutLog, WeekPlanProposalPayload } from '../../types.js';
import {
  coachActual, createAiProposal, getCdgCatalogoJson, getExercises, getMesocycles, getOnboarding, getQuestionnairesByCoach,
  getResponsesForAthlete, getVolumeLandmarks, getWorkoutLogs, getWorkouts,
} from './datos.js';
import { toResult } from './comunes.js';
import { crearMotor, expandirCatalogo, parsearEsfuerzo, parsearReps, type CdgCatalogoCompacto, type MotorCdg } from '../../utils/cdg/motor.js';
import { ZONAS_IEM, iemPorZona, type ZonaIem } from '../../utils/cdg/zonas.js';
import { agujetasPorZona, agujetasVigentes, contextoDeLaSemana, propuestaZona, sensibilidadDeZona, tipoDeBloque } from '../../utils/cdg/agujetas.js';
import { aplicarOperaciones, iemProgramadoPorZona, proponerProgresionIem, type EjercicioProgramable, type OperacionIem } from '../../utils/cdg/progresionIem.js';
import { resumenSesion } from '../../utils/cdg/programacion.js';
import { semanaRealizadaDesdeLogs } from '../../utils/cdg/adaptadores.js';
import { calcularSemana } from '../../utils/cdg/seguimiento.js';
import { resolverEjercicioDelMeso, mesocycleWeekNumber, vueltasDelCiclo } from '../../utils/progression.js';
import { cicloDiasDeMeso } from '../../utils/asignacionMesociclo.js';
import { mesoActivo } from '../../utils/revisionCoach.js';
import { historialDeSeñal } from '../../utils/signalReading.js';
import { ewmaDeSeñal } from '../../utils/wellnessTrend.js';
import { normalizarTexto as normTexto } from '../../utils/busqueda.js';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek.js';
import { nombreDeMeso } from '../../utils/nombresMeso.js';

// ── Motor ───────────────────────────────────────────────────────────────────

let ultimo: { json: string; motor: MotorCdg } | null = null;
/** El motor se construye una vez por contenido del catálogo (misma idea que useMotorCdg). */
function motorDe(json: string): MotorCdg {
  if (ultimo?.json === json) return ultimo.motor;
  const c = JSON.parse(json) as CdgCatalogoCompacto;
  if (!Array.isArray(c.exercises) || !Array.isArray(c.muscles) || !Array.isArray(c.joints)) {
    throw new Error('El catálogo CDG no tiene el formato esperado (exercises/muscles/joints).');
  }
  const motor = crearMotor(expandirCatalogo(c));
  ultimo = { json, motor };
  return motor;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

interface ContextoCdg {
  motor: MotorCdg;
  meso: Mesocycle;
  /** Las sesiones del bloque por `dayIndex`. */
  dias: Workout[];
  porId: Map<string, Exercise>;
  nombreCdgDe: (id: string) => string | undefined;
  grupoDe: (we: WorkoutExercise) => MuscleGroup | undefined;
  ciclo: number;
  vueltas: number;
  semanaActual: number;
  resolver: (we: WorkoutExercise, semana: number) => WorkoutExercise;
  hoy: string;
}

async function contextoCdg(email: string, mesocycleId?: string): Promise<ContextoCdg | { error: string }> {
  const [json, ejercicios, mesos, workouts] = await Promise.all([getCdgCatalogoJson(), getExercises(), getMesocycles(email), getWorkouts()]);
  if (!json) return { error: 'No hay catálogo CDG en la base de datos: sin él no se calcula el IEM. Usa get_volume_suggestion y el reparto propio.' };
  const motor = motorDe(json);
  const hoy = hoyIsoLocal();
  const meso = mesocycleId ? mesos.find(m => m.id === mesocycleId) ?? null : mesoActivo(mesos, hoy);
  if (!meso) return { error: mesocycleId ? `No existe el mesociclo ${mesocycleId}.` : 'El atleta no tiene ningún mesociclo.' };
  const porId = new Map(ejercicios.map(e => [e.id, e]));
  const nombreCdgDe = (id: string) => porId.get(id)?.cdgNombre;
  const grupoDe = (we: WorkoutExercise) => we.muscleGroup ?? porId.get(we.exerciseId)?.muscleGroup;
  const dias = workouts.filter(w => w.mesocycleId === meso.id).sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));
  const ciclo = cicloDiasDeMeso(meso);
  const vueltas = vueltasDelCiclo(meso.weeks, ciclo);
  const semanaActual = Math.min(vueltas, Math.max(1, mesocycleWeekNumber(meso.startDate, hoy, ciclo)));
  const resolver = (we: WorkoutExercise, s: number) => (s <= 0 ? we : resolverEjercicioDelMeso(we, meso, s));
  return { motor, meso, dias, porId, nombreCdgDe, grupoDe, ciclo, vueltas, semanaActual, resolver, hoy };
}

async function señalesDe(email: string) {
  const [respuestas, cuestionarios] = await Promise.all([getResponsesForAthlete(email), getQuestionnairesByCoach(coachActual().uid)]);
  const serie = (k: string) => historialDeSeñal(k, respuestas, cuestionarios);
  const ultimoDe = (k: string) => serie(k).at(-1)?.value;
  return {
    agujetas: agujetasPorZona(serie),
    sueño: ewmaDeSeñal('wellness.sleep_hours_weekly', respuestas, cuestionarios).at(-1)?.value,
    estres: ultimoDe('wellness.stress_weekly'),
    motivacion: ultimoDe('wellness.motivation_weekly'),
    fatigaPost: ultimoDe('wellness.fatigue_post_weekly'),
  };
}

/** Las zonas con IEM programado y la propuesta del protocolo para cada una, de cara a `semana`. */
function zonasHacia(c: ContextoCdg, s: Awaited<ReturnType<typeof señalesDe>>, semana: number) {
  const { motor, meso, dias, nombreCdgDe, resolver } = c;
  const ref = semana - 1;
  const iemBase = iemProgramadoPorZona(motor, nombreCdgDe, dias.flatMap(d => d.exercises.map(we => resolver(we, ref))));
  const velocidad = tipoDeBloque(meso).velocidad;
  const { contexto, motivos } = contextoDeLaSemana({ estres: s.estres, sueñoHoras: s.sueño, motivacion: s.motivacion });
  const zonas = ZONAS_IEM.filter(z => (iemBase[z.clave] ?? 0) > 0.005).map(z => {
    const lectura = s.agujetas[z.clave];
    const vigente = !!lectura && agujetasVigentes(lectura.fecha, c.hoy);
    const objetivo = meso.cdgObjetivosIem?.[z.clave];
    const modo = sensibilidadDeZona(meso, z.clave);
    const propuesta = propuestaZona({
      agujetas: vigente ? lectura!.valor : undefined, anterior: vigente ? lectura!.anterior : undefined, sensible: z.sensible,
      tipo: { sensibilidad: modo, velocidad }, esObjetivo: objetivo != null, iem: iemBase[z.clave], contexto, fatigaPost: s.fatigaPost, objetivo,
      primeraSemanaTrasParon: !!meso.vuelveDeParon && semana <= 2,
    });
    return { zona: z.clave, nombre: z.nombre, modo, objetivo, iemBase: iemBase[z.clave] ?? 0, agujetas: vigente ? lectura : undefined, propuesta };
  });
  return { zonas, iemBase, contexto, motivos, velocidad };
}

function zonaDeGrupo(grupo: MuscleGroup | undefined): ZonaIem | undefined {
  return grupo ? ZONAS_IEM.find(z => (z.grupos as readonly string[]).includes(grupo))?.clave : undefined;
}

// ── get_cdg_semana ──────────────────────────────────────────────────────────

export async function getCdgSemana(email: string, mesocycleId?: string): Promise<string> {
  const c = await contextoCdg(email, mesocycleId);
  if ('error' in c) return toResult({ error: c.error });
  const s = await señalesDe(email);
  const { zonas, contexto, motivos, velocidad } = zonasHacia(c, s, c.semanaActual + 1);
  const programadoAhora = iemProgramadoPorZona(c.motor, c.nombreCdgDe, c.dias.flatMap(d => d.exercises.map(we => c.resolver(we, c.semanaActual))));

  // Lo REALIZADO la semana pasada, con los logs de esas fechas.
  let realizado: Partial<Record<ZonaIem, number>> | null = null;
  if (c.semanaActual >= 2) {
    const desde = addDays(c.meso.startDate, (c.semanaActual - 2) * c.ciclo);
    const hasta = addDays(desde, c.ciclo - 1);
    const logs: WorkoutLog[] = (await getWorkoutLogs(email)).filter(l => l.date >= desde && l.date <= hasta);
    if (logs.length) {
      const sesionDe = (l: WorkoutLog) => c.dias.find(w => w.id === l.workoutId)?.dayIndex;
      const calc = calcularSemana(c.motor, semanaRealizadaDesdeLogs(logs, c.nombreCdgDe, sesionDe));
      const total = calc.IEM.reduce((acc, dia) => acc.map((v, i) => v + (dia[i] ?? 0)), new Array<number>(c.motor.musculos.length).fill(0));
      realizado = iemPorZona(c.motor, total);
    }
  }

  const sinVinculo = c.dias.flatMap(d => d.exercises).filter(we => !c.nombreCdgDe(we.exerciseId)).map(we => c.porId.get(we.exerciseId)?.name ?? we.exerciseId);
  return toResult({
    mesociclo: { id: c.meso.id, nombre: nombreDeMeso(c.meso), semanaActual: c.semanaActual, vueltas: c.vueltas, cicloDias: c.ciclo, velocidad, descargas: c.meso.semanasDescarga ?? [] },
    contexto: { contexto, motivos, sueñoHoras: s.sueño ?? null, estres: s.estres ?? null, motivacion: s.motivacion ?? null, fatigaPost: s.fatigaPost ?? null },
    zonas: zonas.map(z => ({
      zona: z.zona, nombre: z.nombre, modo: z.modo, objetivoIem: z.objetivo ?? null,
      iemProgramadoEstaSemana: r1(programadoAhora[z.zona] ?? 0),
      iemRealizadoSemanaPasada: realizado ? r1(realizado[z.zona] ?? 0) : null,
      agujetas: z.agujetas ? { valor: z.agujetas.valor, fecha: z.agujetas.fecha, anterior: z.agujetas.anterior ?? null } : null,
      propuestaSemanaQueViene: { tono: z.propuesta.tono, pct: z.propuesta.pct ?? null, iemPropuesto: z.propuesta.iemPropuesto ?? null, texto: z.propuesta.texto },
    })),
    ejerciciosSinVinculoCdg: [...new Set(sinVinculo)],
    note: 'Números del motor CDG, los mismos que Dani ve en Mesociclo › Seguimiento. `propuestaSemanaQueViene` es el protocolo freno/acelerador por zona: con «freno» o «vigilar» NO subas esa zona. Para programar la semana que viene llama a propose_progresion_iem (el motor calcula los cambios; tú solo descartas o recortas).',
  });
}

// ── propose_progresion_iem ──────────────────────────────────────────────────

export async function proposeProgresionIem(email: string, input: Record<string, unknown>, rationale: string, chatId: string): Promise<string> {
  const c = await contextoCdg(email, typeof input.mesocycle_id === 'string' ? input.mesocycle_id : undefined);
  if ('error' in c) return toResult({ valid: false, issues: [c.error] });
  const descargas = c.meso.semanasDescarga ?? [];
  const pedida = typeof input.semana === 'number' ? Math.round(input.semana) : c.semanaActual + 1;
  const issues: string[] = [];
  if (pedida < 2 || pedida > c.vueltas) issues.push(`La semana a programar va de 2 a ${c.vueltas} (semana actual: ${c.semanaActual}).`);
  else if (descargas.includes(pedida)) issues.push(`La S${pedida} es de descarga: no se progresa en ella.`);
  if (c.dias.length === 0) issues.push('El mesociclo no tiene sesiones.');
  if (issues.length) return toResult({ valid: false, issues });

  const [s, alta, landmarks] = await Promise.all([señalesDe(email), getOnboarding(email), getVolumeLandmarks().catch(() => undefined)]);
  const { zonas, iemBase, contexto } = zonasHacia(c, s, pedida);

  // El % por zona: el del motor, o el del modelo si es MÁS prudente (nunca más agresivo).
  const avisos: string[] = [];
  const override = (input.pct_por_zona && typeof input.pct_por_zona === 'object' ? input.pct_por_zona : {}) as Record<string, unknown>;
  const pctPorZona: Partial<Record<ZonaIem, number>> = {};
  for (const z of zonas) {
    const sugerido = z.propuesta.pct ?? 0;
    const pedido = typeof override[z.zona] === 'number' ? (override[z.zona] as number) : undefined;
    let pct = sugerido;
    if (pedido !== undefined) {
      const prudente = (pedido === 0) || (Math.sign(pedido) === Math.sign(sugerido) && Math.abs(pedido) <= Math.abs(sugerido)) || (sugerido >= 0 && pedido < 0 && pedido >= -30);
      if (prudente) pct = pedido; else avisos.push(`${z.nombre}: ${pedido} % ignorado, el motor propone ${sugerido} % y no se puede ser más agresivo.`);
    }
    if (pct !== 0) pctPorZona[z.zona] = pct;
  }

  const descartar = new Set((Array.isArray(input.descartar) ? input.descartar : []).filter((x): x is string => typeof x === 'string'));
  const ejercicios: EjercicioProgramable[] = c.dias.flatMap(d => d.exercises.map((we, i) => ({
    clave: `${d.id}#${i}`, dia: d.id, we: c.resolver(we, pedida), grupo: c.grupoDe(we),
    movible: !descartar.has(we.exerciseId) && !descartar.has(`${d.id}:${we.exerciseId}`),
  })));
  const limiteSeg = alta?.sessionMaxMinutes && alta.sessionMaxMinutes > 0 ? alta.sessionMaxMinutes * 60 : undefined;
  const tiempo = limiteSeg ? {
    limiteSeg,
    porDia: Object.fromEntries(c.dias.map(d => [d.id, resumenSesion(c.motor, d.exercises.map(we => c.resolver(we, pedida)), c.nombreCdgDe).tiempoSeg])),
  } : undefined;
  const mrvPorGrupo = landmarks
    ? (Object.fromEntries(Object.entries(landmarks).map(([g, l]) => [g, (l as { mrv?: number } | undefined)?.mrv])) as Partial<Record<MuscleGroup, number>>)
    : undefined;

  const r = proponerProgresionIem({ motor: c.motor, nombreCdgDe: c.nombreCdgDe, ejercicios, iemBase, pctPorZona, palancas: { rir: true, series: true, tecnica: false }, tiempo, mrvPorGrupo });
  const opsDe = new Map<string, OperacionIem[]>();
  for (const ch of r.cambios) opsDe.set(ch.clave, [...(opsDe.get(ch.clave) ?? []), ch.op]);

  const cambios: NonNullable<WeekPlanProposalPayload['cambios']> = [];
  const lineas: string[] = [];
  for (const x of ejercicios) {
    const ops = opsDe.get(x.clave);
    if (!ops?.length) continue;
    const despues = aplicarOperaciones(x.we, ops);
    const nombre = c.porId.get(x.we.exerciseId)?.name ?? x.we.exerciseId;
    cambios.push({ workoutId: x.dia, exerciseId: x.we.exerciseId, ejercicio: nombre, semana: pedida, sets: despues.sets, reps: despues.reps, rir: despues.rir });
    lineas.push(`${nombre}: ${x.we.sets}×${x.we.reps} RIR ${x.we.rir} → ${despues.sets}×${despues.reps} RIR ${despues.rir}`);
  }
  const resumenZonas = r.zonas.map(z => `${z.nombre} ${r1(z.antes)}→${r1(z.despues)} (${z.pct > 0 ? '+' : ''}${z.pct} %)`).join(' · ');
  if (cambios.length === 0) {
    return toResult({ valid: false, issues: ['El motor no propone ningún cambio para esa semana (zonas en freno, en objetivo o sin margen).'], zonas: r.zonas, avisos });
  }

  const summary = `Progresión IEM S${pedida} de ${nombreDeMeso(c.meso)}: ${cambios.length} ejercicio${cambios.length === 1 ? '' : 's'} · ${resumenZonas}`;
  const payload: WeekPlanProposalPayload = { mesocycleId: c.meso.id, mesocycleName: nombreDeMeso(c.meso), cambios, origenIem: true };
  const proposal = await createAiProposal({
    athleteId: email, kind: 'weekPlan', status: 'proposed', chatId, summary, rationale: rationale || `Protocolo CDG: contexto ${contexto}.`,
    payload, cambios: lineas, createdAt: new Date().toISOString(),
  });
  return toResult({
    proposalCreated: true, proposalId: proposal.id, semana: pedida, contexto,
    zonas: r.zonas.map(z => ({ zona: z.zona, nombre: z.nombre, pct: z.pct, antes: r1(z.antes), despues: r1(z.despues), objetivo: z.objetivo, alcanzado: z.alcanzado, nota: z.nota ?? null })),
    cambios: lineas, avisos,
    note: 'Propuesta weekPlan creada con los cambios del motor. Si algún cambio no procede (molestia, ejercicio que no quiere), vuelve a llamar con `descartar` y la nueva propuesta sustituye a esta cuando Dani la apruebe.',
  });
}

// ── get_alternativas_ejercicio ──────────────────────────────────────────────

export async function getAlternativasEjercicio(email: string, input: Record<string, unknown>): Promise<string> {
  const [ejercicios, alta, json] = await Promise.all([getExercises(), getOnboarding(email), getCdgCatalogoJson()]);
  const buscado = typeof input.exercise_id === 'string' ? input.exercise_id : '';
  const nombre = typeof input.ejercicio === 'string' ? normTexto(input.ejercicio) : '';
  const original = ejercicios.find(e => e.id === buscado) ?? (nombre ? ejercicios.find(e => normTexto(e.name) === nombre) ?? ejercicios.find(e => normTexto(e.name).includes(nombre)) : undefined);
  if (!original) return toResult({ error: 'No encuentro ese ejercicio: pasa exercise_id o el nombre tal y como está en get_exercise_library.' });
  if (!original.muscleGroup) return toResult({ error: `«${original.name}» no tiene grupo muscular: no se puede buscar equivalente.` });

  const material = (alta?.equipment ?? []).map(normTexto);
  const disponible = (e: Exercise) => !e.equipment?.length || material.length === 0
    || e.equipment.every(m => material.some(x => x.includes(normTexto(m)) || normTexto(m).includes(x)));
  const evitar = typeof input.evitar_articulacion === 'string' ? normTexto(input.evitar_articulacion) : '';
  const max = typeof input.max === 'number' ? Math.max(1, Math.min(15, Math.round(input.max))) : 8;

  const motor = json ? motorDe(json) : null;
  const zona = zonaDeGrupo(original.muscleGroup);
  const ficha = (e: Exercise) => {
    if (!motor || !e.cdgNombre || !motor.existe(e.cdgNombre)) return null;
    const r = motor.calcularSerie({ exerciseName: e.cdgNombre, rpe: parsearEsfuerzo(1, '1x1', 'RIR')[0], repetitions: parsearReps('8-12') });
    const art = motor.articulaciones.map((n, i) => ({ nombre: n, valor: r.estresArticular[i] ?? 0 }));
    const masCargada = art.reduce<{ nombre: string; valor: number } | null>((m, a) => (a.valor > 0.005 && (!m || a.valor > m.valor) ? a : m), null);
    const evitada = evitar ? art.filter(a => normTexto(a.nombre).includes(evitar)).reduce((s, a) => s + a.valor, 0) : 0;
    return { IF: r.IF, iemZona: zona ? iemPorZona(motor, r.IEM)[zona] : r.IEM.reduce((a, v) => a + v, 0), masCargada, evitada };
  };
  const fOriginal = ficha(original);

  const candidatos = ejercicios
    .filter(e => e.id !== original.id && e.type === 'fuerza' && e.muscleGroup === original.muscleGroup && disponible(e))
    .map(e => ({ e, f: ficha(e) }))
    // Con una articulación que evitar y motor: solo los que la cargan claramente menos que el original.
    .filter(({ f }) => !evitar || !fOriginal || !f || fOriginal.evitada <= 0.005 || f.evitada <= fOriginal.evitada * 0.6)
    .sort((a, b) => (b.f?.iemZona ?? -1) - (a.f?.iemZona ?? -1))
    .slice(0, max);

  return toResult({
    original: { exerciseId: original.id, nombre: original.name, grupo: original.muscleGroup, cdg: !!fOriginal, ...(fOriginal ? { iemZona: r2(fOriginal.iemZona), IF: r2(fOriginal.IF), articulacionMasCargada: fOriginal.masCargada, ...(evitar ? { estresEnLaEvitada: r2(fOriginal.evitada) } : {}) } : {}) },
    materialDelAtleta: alta?.equipment ?? [],
    alternativas: candidatos.map(({ e, f }) => ({
      exerciseId: e.id, nombre: e.name, material: e.equipment ?? [], cdg: !!f,
      ...(f ? { iemZona: r2(f.iemZona), IF: r2(f.IF), articulacionMasCargada: f.masCargada, ...(evitar ? { estresEnLaEvitada: r2(f.evitada) } : {}) } : {}),
    })),
    note: motor
      ? 'Mismo grupo muscular y material disponible, ordenados por el IEM que dan a la zona en una serie de referencia (8-12 a RIR 1). Elige el que conserve el estímulo de la zona con menos estrés en la articulación que duele; el cambio se propone con propose_workout_days o propose_week_plan (cambios).'
      : 'Sin catálogo CDG no hay IEM: mismo grupo muscular y material disponible, sin ordenar por estímulo.',
  });
}

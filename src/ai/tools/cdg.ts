/* ═══════════════════════════════════════════════════════════════════════════
   TOOLS CDG (H20, diseño §7): el asistente entrena con el Índice de Hipertrofia
   sin recalcular nada. Los tres lectores/propuestas de aquí llaman a los MISMOS
   motores que las pantallas del coach (utils/cdg/*): el modelo recibe IEM,
   agujetas, contexto y la propuesta del protocolo ya calculados, y lo único que
   decide es ENTRE las alternativas que el motor marca (qué cambio descartar,
   qué ejercicio equivalente), más la redacción.

   · get_cdg_semana: IEM programado por zona esta semana y la anterior, lo
     realizado, agujetas vigentes, contexto de la semana y la propuesta
     (freno/acelerador) por zona. Desde el 17-11-2026 (D6r) el cansancio
     al salir sale de lo apuntado en cada sesión (media y cuál fue la más
     dura); sin dato por sesión, del cuestionario semanal. Las agujetas, del
     cuestionario semanal. El cansancio
     frena sesión a sesión (auditoría de cifras, 17-11-2026): una sesión con 8
     o más deja en «mantener» las zonas que trabajó, y la media en 8 o más,
     todas. Y la
     propuesta respeta el ritmo de la hipótesis del bloque: 2 semanas
     sostenidas entre subida y subida (meseta) y, de la segunda subida en
     adelante, los mismos PUNTOS que la primera en vez del porcentaje. Las
     subidas se deducen de lo programado semana a semana.
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
import { agujetasPorZona, agujetasVigentes, contextoDeLaSemana, propuestaZona, semanasFueraDeSubidas, sensibilidadDeZona, subidasDeLaZona, tipoDeBloque, ultimaVigente, type Propuesta } from '../../utils/cdg/agujetas.js';
import { cansancioDeSesiones, nombresDeZonas, sesionesDurasPorZona, zonasDeEjercicios } from '../../utils/cdg/senalesPorSemana.js';
import { avisoDeSemanaBase, motivoSinProgresion, semanaBaseDeIem } from '../../utils/cdg/semanaBase.js';
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
import { hipotesisParaElAsistente } from './hipotesis.js';

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
  /** Todos los bloques del atleta: de sus cierres firmados sale el mapa de respuesta. */
  mesos: Mesocycle[];
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
  return { motor, meso, mesos, dias, porId, nombreCdgDe, grupoDe, ciclo, vueltas, semanaActual, resolver, hoy };
}

/** Igual que la pantalla (`useAgujetasCdg`): «la semana que acaba» son hoy y los seis días anteriores. */
const DIAS_DE_LA_SEMANA_QUE_ACABA = 7;

async function señalesDe(email: string) {
  const [respuestas, cuestionarios, logs] = await Promise.all([getResponsesForAthlete(email), getQuestionnairesByCoach(coachActual().uid), getWorkoutLogs(email)]);
  const serie = (k: string) => historialDeSeñal(k, respuestas, cuestionarios);
  // Igual que la pantalla (`useAgujetasCdg`, F16): una respuesta de hace más de
  // 10 días ya no es el contexto de esta semana. Caducada = sin dato.
  const hoy = hoyIsoLocal();
  const ultimoDe = (k: string) => ultimaVigente(serie(k), hoy)?.value;
  return {
    agujetas: agujetasPorZona(serie),
    sueño: ultimaVigente(ewmaDeSeñal('wellness.sleep_hours_weekly', respuestas, cuestionarios), hoy)?.value,
    estres: ultimoDe('wellness.stress_weekly'),
    motivacion: ultimoDe('wellness.motivation_weekly'),
    /** La cifra del cuestionario semanal: el respaldo cuando no hay cansancio por sesión. */
    fatigaPostSemanal: ultimoDe('wellness.fatigue_post_weekly'),
    logs,
  };
}

/**
 * El cansancio al salir que usa el protocolo (D6r): la media de las sesiones
 * de los últimos 7 días que lo lleven apuntado y cuál fue la más dura; sin
 * ninguna, la cifra del cuestionario semanal. Y, sesión a sesión, las de 8 o
 * más con las zonas que frena cada una.
 */
function cansancioDe(c: ContextoCdg, s: Awaited<ReturnType<typeof señalesDe>>) {
  const sesiones = cansancioDeSesiones(s.logs, {
    desde: addDays(c.hoy, -(DIAS_DE_LA_SEMANA_QUE_ACABA - 1)), hasta: c.hoy,
    nombreDe: id => c.dias.find(w => w.id === id)?.name,
  });
  // Auditoría de cifras (17-11-2026): una sesión con 8 o más frena las zonas
  // que se trabajaron en ella, por el grupo muscular de sus ejercicios.
  const grupoDeEjercicio = (id: string) => c.porId.get(id)?.muscleGroup;
  return {
    fatigaPost: sesiones?.media ?? s.fatigaPostSemanal,
    origen: sesiones ? 'sesiones' as const : s.fatigaPostSemanal != null ? 'cuestionario_semanal' as const : null,
    sesiones,
    durasPorZona: sesionesDurasPorZona(sesiones, grupoDeEjercicio),
    sesionesDuras: (sesiones?.duras ?? []).map(d => ({
      sesion: d.nombre ?? null, fecha: d.fecha, cansancio: d.valor,
      zonasFrenadas: zonasDeEjercicios(d.ejercicios, grupoDeEjercicio),
      texto: `${d.etiqueta}: ${d.valor.toLocaleString('es-ES')}/10${d.ejercicios.length ? ` — frena ${nombresDeZonas(zonasDeEjercicios(d.ejercicios, grupoDeEjercicio)) || 'lo que trabajó'}` : ''}`,
    })),
  };
}

/** Texto del aviso bloqueante de una zona con agujetas de 5 (F6): no lleva %, lo decide el coach. */
const avisoBloqueante = (nombre: string) => `${nombre}: agujetas de 5, duele en reposo. No subir: ningún cambio puede añadirle estímulo. Cuánto bajar lo decide Dani: pregúntaselo antes de poner un porcentaje negativo en pct_por_zona.`;

/** Las zonas con IEM programado y la propuesta del protocolo para cada una, de cara a `semana`. */
function zonasHacia(c: ContextoCdg, s: Awaited<ReturnType<typeof señalesDe>>, semana: number) {
  const { motor, meso, dias, nombreCdgDe, resolver } = c;
  // La base es la última semana NORMAL anterior (F2): una descarga o una puente
  // van recortadas y sobre ellas se propondría partir de media semana.
  const ref = semanaBaseDeIem(meso, semana);
  // Y en una semana de descarga o puente no se propone subida.
  const sinProgresion = motivoSinProgresion(meso, semana);
  const iemBase = iemProgramadoPorZona(motor, nombreCdgDe, dias.flatMap(d => d.exercises.map(we => resolver(we, ref))));
  const velocidad = tipoDeBloque(meso).velocidad;
  const { contexto, motivos } = contextoDeLaSemana({ estres: s.estres, sueñoHoras: s.sueño, motivacion: s.motivacion });
  const cansancio = cansancioDe(c, s);
  const sesionMasCansada = cansancio.sesiones ? { etiqueta: cansancio.sesiones.peor.etiqueta, valor: cansancio.sesiones.peor.valor } : undefined;
  // Lo programado semana a semana hasta la que se propone: de ahí se deducen
  // las subidas de cada zona (meseta y puntos), igual que en Planificar.
  const programadoPorSemana = Array.from({ length: Math.max(0, semana - 1) }, (_, i) =>
    iemProgramadoPorZona(motor, nombreCdgDe, dias.flatMap(d => d.exercises.map(we => resolver(we, i + 1)))));
  const semanasFuera = semanasFueraDeSubidas(meso);
  const zonas = ZONAS_IEM.filter(z => (iemBase[z.clave] ?? 0) > 0.005).map(z => {
    const lectura = s.agujetas[z.clave];
    const vigente = !!lectura && agujetasVigentes(lectura.fecha, c.hoy);
    const objetivo = meso.cdgObjetivosIem?.[z.clave];
    const modo = sensibilidadDeZona(meso, z.clave);
    const subidas = subidasDeLaZona({ programado: programadoPorSemana.map(p => p[z.clave] ?? 0), destino: semana, semanasFuera });
    const calculada = propuestaZona({
      agujetas: vigente ? lectura!.valor : undefined, anterior: vigente ? lectura!.anterior : undefined, sensible: z.sensible,
      tipo: { sensibilidad: modo, velocidad }, esObjetivo: objetivo != null, iem: iemBase[z.clave], contexto, fatigaPost: cansancio.fatigaPost, sesionMasCansada, sesionDura: cansancio.durasPorZona[z.clave], objetivo,
      primeraSemanaTrasParon: !!meso.vuelveDeParon && semana <= 2,
      subidas,
    });
    // Los frenos se respetan; lo que no sale es una subida para una semana recortada.
    const propuesta: Propuesta = sinProgresion && (calculada.pct ?? 0) > 0
      ? { tono: 'mantener', texto: `${sinProgresion} La subida se propone para la siguiente semana normal.` }
      : calculada;
    return { zona: z.clave, nombre: z.nombre, modo, objetivo, iemBase: iemBase[z.clave] ?? 0, agujetas: vigente ? lectura : undefined, propuesta, subidas };
  });
  const bloqueadas = zonas.filter(z => z.propuesta.bloqueante);
  return {
    zonas, iemBase, contexto, motivos, velocidad, semanaBase: ref, sinProgresion, cansancio,
    avisoBase: avisoDeSemanaBase(meso, semana),
    avisosBloqueantes: bloqueadas.map(z => avisoBloqueante(z.nombre)),
    // Zonas que no suben por UNA sesión de 8 o más (17-11-2026): no bloquean
    // como unas agujetas de 5, pero Dani tiene que saber cuál aligerar.
    avisosDeSesionDura: zonas.filter(z => z.propuesta.sesionDura && z.propuesta.tono === 'mantener')
      .map(z => `${z.nombre}: no sube. Salió con ${z.propuesta.sesionDura!.valor.toLocaleString('es-ES')}/10 de ${z.propuesta.sesionDura!.etiqueta}, que la trabaja: antes hay que bajarle la fatiga a esa sesión.`),
    zonasSinSubida: bloqueadas.map(z => z.zona),
  };
}

function zonaDeGrupo(grupo: MuscleGroup | undefined): ZonaIem | undefined {
  return grupo ? ZONAS_IEM.find(z => (z.grupos as readonly string[]).includes(grupo))?.clave : undefined;
}

// ── get_cdg_semana ──────────────────────────────────────────────────────────

export async function getCdgSemana(email: string, mesocycleId?: string): Promise<string> {
  const c = await contextoCdg(email, mesocycleId);
  if ('error' in c) return toResult({ error: c.error });
  const s = await señalesDe(email);
  const { zonas, contexto, motivos, velocidad, semanaBase, sinProgresion, avisoBase, avisosBloqueantes, cansancio } = zonasHacia(c, s, c.semanaActual + 1);
  const programadoAhora = iemProgramadoPorZona(c.motor, c.nombreCdgDe, c.dias.flatMap(d => d.exercises.map(we => c.resolver(we, c.semanaActual))));

  // Lo REALIZADO la semana pasada, con los logs de esas fechas.
  let realizado: Partial<Record<ZonaIem, number>> | null = null;
  if (c.semanaActual >= 2) {
    const desde = addDays(c.meso.startDate, (c.semanaActual - 2) * c.ciclo);
    const hasta = addDays(desde, c.ciclo - 1);
    const logs: WorkoutLog[] = s.logs.filter(l => l.date >= desde && l.date <= hasta);
    if (logs.length) {
      const sesionDe = (l: WorkoutLog) => c.dias.find(w => w.id === l.workoutId)?.dayIndex;
      const calc = calcularSemana(c.motor, semanaRealizadaDesdeLogs(logs, c.nombreCdgDe, sesionDe));
      const total = calc.IEM.reduce((acc, dia) => acc.map((v, i) => v + (dia[i] ?? 0)), new Array<number>(c.motor.musculos.length).fill(0));
      realizado = iemPorZona(c.motor, total);
    }
  }

  const sinVinculo = c.dias.flatMap(d => d.exercises).filter(we => !c.nombreCdgDe(we.exerciseId)).map(we => c.porId.get(we.exerciseId)?.name ?? we.exerciseId);
  return toResult({
    mesociclo: { id: c.meso.id, nombre: nombreDeMeso(c.meso), semanaActual: c.semanaActual, vueltas: c.vueltas, cicloDias: c.ciclo, velocidad, descargas: c.meso.semanasDescarga ?? [], semanasPuente: c.meso.semanasPivot ?? [], ...hipotesisParaElAsistente(c.meso, c.mesos) },
    // De dónde parte la propuesta de la semana que viene y si esa semana admite subida (F2).
    semanaQueViene: { semana: c.semanaActual + 1, semanaBase, sinProgresion, avisoBase },
    // Agujetas de 5: no llevan % (lo decide Dani), pero bloquean la zona (F6).
    avisosBloqueantes,
    contexto: {
      contexto, motivos, sueñoHoras: s.sueño ?? null, estres: s.estres ?? null, motivacion: s.motivacion ?? null,
      fatigaPost: cansancio.fatigaPost ?? null,
      // De dónde sale el cansancio: de lo apuntado al terminar cada sesión (media) o del cuestionario semanal.
      fatigaPostOrigen: cansancio.origen,
      sesionMasCansada: cansancio.sesiones
        ? { sesion: cansancio.sesiones.peor.nombre ?? null, fecha: cansancio.sesiones.peor.fecha, cansancio: cansancio.sesiones.peor.valor, sesionesConDato: cansancio.sesiones.sesiones }
        : null,
      // Las sesiones de las que salió con 8 o más y las zonas que frena cada una (17-11-2026).
      sesionesDuras: cansancio.sesionesDuras,
    },
    zonas: zonas.map(z => ({
      zona: z.zona, nombre: z.nombre, modo: z.modo, objetivoIem: z.objetivo ?? null,
      iemProgramadoEstaSemana: r1(programadoAhora[z.zona] ?? 0),
      iemRealizadoSemanaPasada: realizado ? r1(realizado[z.zona] ?? 0) : null,
      agujetas: z.agujetas ? { valor: z.agujetas.valor, fecha: z.agujetas.fecha, anterior: z.agujetas.anterior ?? null } : null,
      // Subidas ya programadas en el bloque (deducidas de lo programado): de ahí salen la meseta y los puntos.
      subidasDelBloque: z.subidas.subidas.map(x => ({ semana: x.semana, puntos: x.puntos, pct: x.pct })),
      propuestaSemanaQueViene: {
        tono: z.propuesta.tono, pct: z.propuesta.pct ?? null, iemPropuesto: z.propuesta.iemPropuesto ?? null, bloqueante: !!z.propuesta.bloqueante,
        enMeseta: !!z.propuesta.enMeseta, puntos: z.propuesta.puntos ?? null, texto: z.propuesta.texto,
        // No sube por UNA sesión de 8 o más que trabajó esta zona: cuál fue.
        frenadaPorSesion: z.propuesta.sesionDura ? { sesion: z.propuesta.sesionDura.etiqueta, cansancio: z.propuesta.sesionDura.valor } : null,
      },
    })),
    ejerciciosSinVinculoCdg: [...new Set(sinVinculo)],
    note: 'Números del motor CDG, los mismos que Dani ve en Mesociclo › Seguimiento. `propuestaSemanaQueViene` es el protocolo freno/acelerador por zona: con «freno» o «vigilar» NO subas esa zona, y con `bloqueante: true` (agujetas de 5, duele en reposo) no subas NADA que la trabaje y díselo a Dani: cuánto bajar lo decide él. `semanaQueViene.semanaBase` es la semana sobre la que se calcula el % (la última que no es descarga ni puente). Ritmo de subidas: con `enMeseta: true` la zona subió hace menos de 2 semanas sostenidas y esta semana MANTIENE (no es un freno: se vuelve a mirar la semana que viene); con `puntos` la subida repite los puntos de IEM de la primera subida del bloque en vez del porcentaje (el `pct` ya viene calculado para esos puntos: no lo sustituyas por el de la velocidad). `contexto.fatigaPost` es el cansancio al salir (0-10): con `fatigaPostOrigen: "sesiones"` es la media de lo que apuntó al terminar cada sesión de los últimos 7 días y `sesionMasCansada` dice cuál fue la más dura. El cansancio frena de dos maneras: con la MEDIA en 8 o más no se sube ninguna zona; y con UNA sesión en 8 o más (`contexto.sesionesDuras`) no se suben las zonas que se trabajaron en ella (`zonasFrenadas`), aunque la media deje margen: esas zonas llegan con tono «mantener» y `frenadaPorSesion`. En los dos casos díselo a Dani con el nombre de la sesión y propón bajarle la fatiga a ESA sesión antes de subir nada de lo suyo. Para programar la semana que viene llama a propose_progresion_iem (el motor calcula los cambios; tú solo descartas o recortas).',
  });
}

// ── propose_progresion_iem ──────────────────────────────────────────────────

export async function proposeProgresionIem(email: string, input: Record<string, unknown>, rationale: string, chatId: string): Promise<string> {
  const c = await contextoCdg(email, typeof input.mesocycle_id === 'string' ? input.mesocycle_id : undefined);
  if ('error' in c) return toResult({ valid: false, issues: [c.error] });
  const pedida = typeof input.semana === 'number' ? Math.round(input.semana) : c.semanaActual + 1;
  const issues: string[] = [];
  // Ni descarga ni puente son destino de una subida (F2).
  const sinProgresion = motivoSinProgresion(c.meso, pedida);
  if (pedida < 2 || pedida > c.vueltas) issues.push(`La semana a programar va de 2 a ${c.vueltas} (semana actual: ${c.semanaActual}).`);
  else if (sinProgresion) issues.push(sinProgresion);
  if (c.dias.length === 0) issues.push('El mesociclo no tiene sesiones.');
  if (issues.length) return toResult({ valid: false, issues });

  const [s, alta, landmarks] = await Promise.all([señalesDe(email), getOnboarding(email), getVolumeLandmarks().catch(() => undefined)]);
  const { zonas, iemBase, contexto, semanaBase, avisoBase, avisosBloqueantes, avisosDeSesionDura, zonasSinSubida } = zonasHacia(c, s, pedida);

  // El % por zona: el del motor, o el del modelo si es MÁS prudente (nunca más agresivo).
  // Los avisos bloqueantes (agujetas de 5) y la semana base van siempre por delante.
  const avisos: string[] = [...avisosBloqueantes, ...avisosDeSesionDura, ...(avisoBase ? [avisoBase] : [])];
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

  const r = proponerProgresionIem({ motor: c.motor, nombreCdgDe: c.nombreCdgDe, ejercicios, iemBase, pctPorZona, palancas: { rir: true, series: true, tecnica: false }, tiempo, mrvPorGrupo, zonasSinSubida });
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

  // Las zonas bloqueadas quedan a la vista en la propuesta que aprueba Dani, no solo en el chat.
  const sinSubir = zonas.filter(z => z.propuesta.bloqueante).map(z => z.nombre);
  const summary = `Progresión IEM S${pedida} de ${nombreDeMeso(c.meso)}: ${cambios.length} ejercicio${cambios.length === 1 ? '' : 's'} · ${resumenZonas}`
    + (sinSubir.length ? ` · Sin subir (agujetas de 5, decide tú cuánto bajar): ${sinSubir.join(', ')}` : '')
    + (semanaBase !== pedida - 1 ? ` · sobre ${semanaBase === 0 ? 'Base' : `S${semanaBase}`}` : '');
  const payload: WeekPlanProposalPayload = { mesocycleId: c.meso.id, mesocycleName: nombreDeMeso(c.meso), cambios, origenIem: true };
  const proposal = await createAiProposal({
    athleteId: email, kind: 'weekPlan', status: 'proposed', chatId, summary, rationale: rationale || `Protocolo CDG: contexto ${contexto}.`,
    payload, cambios: lineas, createdAt: new Date().toISOString(),
  });
  return toResult({
    proposalCreated: true, proposalId: proposal.id, semana: pedida, semanaBase, contexto,
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

// Retos de RENDIMIENTO (28-10-2026): los que recibe un atleta que ya entrena en
// serio, en vez de «registra tus pasos». Todos salen de lo que tiene
// PROGRAMADO esta semana en su mesociclo activo y de lo que hizo la última vez
// en cada ejercicio — nunca de un ejercicio que no le toca.
//
//   · Semanas especiales mandan: test → «bate 3 récords»; descarga o vuelta de
//     un parón → «ninguna serie por debajo de RIR 3»; vacaciones/viaje →
//     «mínimo 2 sesiones».
//   · El resto de semanas compiten por score y rotan con la memoria del motor:
//     doble progresión, supera tu sesión, AMRAP en la última serie, grupo
//     estancado, mismo peso con más reserva y récord de repeticiones.
//
// Devuelve opciones con el mismo contrato que challengeOptions; quien llama
// les aplica la rotación y el orden final.

import { Exercise, WorkoutLog, MuscleGroup, MUSCLE_LABELS } from '../types.js';
import type { ChallengeOption } from './challengeOptions.js';
import { ChallengeMemory, difficultyFor, pickVariant } from './challengeMemory.js';
import {
  PlanDeLaSemana, SesionPlaneada, EjercicioPlaneado, Marca,
  sesionesPendientes, ultimaVez, ultimasDosVeces, serieTop, superaA, referenciaDe,
  recordDeReps, tablaDeRecords, seguroParaAmrap, esGuiado,
} from './planDeLaSemana.js';

export const SCORE_RENDIMIENTO = {
  semanaEspecial: 95,
  dobleProgresion: 84,
  superaSesion: 80,
  amrap: 78,
  grupoEstancado: 76,
  masReserva: 74,
  recordReps: 70,
} as const;

function fmtKg(n: number): string {
  return `${n.toLocaleString('es-ES')} kg`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface Candidato {
  sesion: SesionPlaneada;
  ej: EjercicioPlaneado;
  series: Marca[];       // la última vez, series principales
  top: Marca;
}

export interface EntradaRendimiento {
  plan: PlanDeLaSemana;
  workoutLogs: WorkoutLog[];
  exercises: Exercise[];
  memory: ChallengeMemory;
  today: string;
  seed: number;
  cierre: string;
}

export function opcionesDeRendimiento(input: EntradaRendimiento): ChallengeOption[] {
  const { plan, workoutLogs, memory, today, seed, cierre } = input;
  const options: ChallengeOption[] = [];
  const contexto = plan.contexto;
  const tipo = contexto?.tipoSemana;
  const pendientes = sesionesPendientes(plan, today);
  const exById = new Map(input.exercises.map(e => [e.id, e]));
  const meta = (o: Omit<ChallengeOption, 'contexto'>): ChallengeOption => ({ ...o, ...(contexto ? { contexto } : {}) });

  // Un candidato por ejercicio: la primera sesión pendiente en la que sale.
  const candidatos: Candidato[] = [];
  {
    const vistos = new Set<string>();
    for (const sesion of pendientes) {
      for (const ej of sesion.ejercicios) {
        if (vistos.has(ej.exerciseId)) continue;
        vistos.add(ej.exerciseId);
        const uv = ultimaVez(workoutLogs, ej.exerciseId, today);
        const top = uv ? serieTop(uv.series) : null;
        if (uv && top) candidatos.push({ sesion, ej, series: uv.series, top });
      }
    }
  }
  const claves = new Set((plan.meso?.ejerciciosClave ?? []).map(k => k.split('::').pop() ?? k));
  const esClave = (c: Candidato) => (claves.has(c.ej.exerciseId) ? 0 : 1);

  // ── Semanas especiales ──────────────────────────────────────────────────────
  if (tipo === 'test') {
    const conHistorial = plan.sesiones.flatMap(s => s.ejercicios)
      .filter((e, i, arr) => arr.findIndex(x => x.exerciseId === e.exerciseId) === i)
      .filter(e => ultimaVez(workoutLogs, e.exerciseId, today) != null).length;
    if (conHistorial > 0) {
      const target = Math.min(3, conHistorial);
      options.push(meta({
        kind: 'record_reps',
        score: SCORE_RENDIMIENTO.semanaEspecial,
        difficulty: 'justo',
        title: `Semana de test: bate ${target} récord${target === 1 ? '' : 's'}`,
        description: `Esta semana tus ejercicios van a AMRAP. Bate tu récord de repeticiones en ${target} de ellos: más repeticiones que nunca con ese peso, o más kilos que nunca. ${cierre}`,
        reason: `Semana ${contexto?.semana} de test del bloque — el reto es aprovecharla`,
        metric: { unit: 'récords', target },
      }));
    }
  }

  if (tipo === 'descarga' || tipo === 'paron') {
    const descarga = tipo === 'descarga';
    options.push(meta({
      kind: 'rir_minimo',
      score: SCORE_RENDIMIENTO.semanaEspecial,
      difficulty: 'justo',
      title: descarga ? 'Descarga de verdad' : 'Vuelve con cabeza',
      description: descarga
        ? 'Semana de descarga: ninguna serie por debajo de RIR 3 y nada al fallo. Recuperar también es entrenar, y la semana que viene lo notarás.'
        : 'Vuelves de un parón: esta semana ni una serie por debajo de RIR 3 ni al fallo. Primero se readapta el cuerpo; apretar viene después.',
      reason: descarga
        ? 'Semana de descarga del bloque — el reto es no convertirla en una semana normal'
        : 'Primera semana tras un parón (RPE 6-7)',
      metric: {
        unit: '%', target: 100, minRir: 3,
        sesiones: plan.sesiones.length,
        ...(plan.meso ? { mesocycleId: plan.meso.id } : {}),
      },
    }));
    // En estas semanas no se pide progresar: ni AMRAP, ni récords, ni dobles.
    return options;
  }

  if (tipo === 'evento' && plan.sesiones.length > 0) {
    const target = Math.min(2, plan.sesiones.length);
    options.push(meta({
      kind: 'entrenos_completados',
      score: SCORE_RENDIMIENTO.semanaEspecial,
      difficulty: 'suave',
      title: `Semana fuera: mínimo ${target} sesiones`,
      description: plan.notaEvento
        ? `${plan.notaEvento} El reto es no cortar: ${target} sesiones esta semana, aunque sean cortas.`
        : `Esta semana estás fuera. El reto es no cortar: ${target} sesiones, aunque sean cortas.`,
      reason: 'Semana con evento (vacaciones/viaje) — mantener el hilo, no el volumen',
      metric: { unit: 'sesiones', target, ...(plan.meso ? { mesocycleId: plan.meso.id } : {}) },
    }));
    return options;
  }

  if (candidatos.length === 0) return options;

  // ── Doble progresión ────────────────────────────────────────────────────────
  {
    const conRango = candidatos
      .filter(c => c.ej.rango && c.ej.rango[1] > c.ej.rango[0])
      .map(c => ({ c, falta: c.ej.rango![1] - c.top.reps }))
      .filter(x => x.falta <= 2)
      .sort((a, b) => esClave(a.c) - esClave(b.c) || a.falta - b.falta);
    const elegido = conRango[0];
    if (elegido) {
      const { c } = elegido;
      const [lo, hi] = c.ej.rango!;
      const tuning = difficultyFor('doble_progresion', memory);
      if (c.top.reps >= hi) {
        options.push(meta({
          kind: 'doble_progresion',
          score: SCORE_RENDIMIENTO.dobleProgresion,
          difficulty: tuning.label,
          title: `${c.ej.nombre}: toca subir de ${fmtKg(c.top.weight)}`,
          description: `Rango ${lo}-${hi}. La última vez: ${fmtKg(c.top.weight)} × ${c.top.reps}, ya en el tope. Esta semana sube al siguiente peso y saca al menos ${lo} repeticiones. Así se progresa.`,
          reason: `Doble progresión: llegó al tope del rango en ${c.ej.nombre} (${c.sesion.nombre})`,
          metric: {
            unit: 'reps', target: lo, baseline: c.top.reps, subirDe: c.top.weight,
            exerciseId: c.ej.exerciseId, exerciseName: c.ej.nombre,
            workoutId: c.sesion.workoutId, workoutName: c.sesion.nombre,
            assignmentId: c.sesion.assignmentId, sessionDate: c.sesion.date,
          },
        }));
      } else {
        const target = tuning.factor < 1 ? Math.min(hi, c.top.reps + 1) : hi;
        options.push(meta({
          kind: 'doble_progresion',
          score: SCORE_RENDIMIENTO.dobleProgresion,
          difficulty: tuning.label,
          title: `${c.ej.nombre}: ${target} con ${fmtKg(c.top.weight)}`,
          description: `Rango ${lo}-${hi}. La última vez: ${fmtKg(c.top.weight)} × ${c.top.reps}. Saca ${target} repeticiones con ${fmtKg(c.top.weight)}${target === hi ? ' y la próxima vez toca subir peso' : ''}. ${cierre}`,
          reason: `Doble progresión: a ${hi - c.top.reps} repeticiones del tope del rango en ${c.ej.nombre}`,
          metric: {
            unit: 'reps', target, baseline: c.top.reps, atWeight: c.top.weight,
            exerciseId: c.ej.exerciseId, exerciseName: c.ej.nombre,
            workoutId: c.sesion.workoutId, workoutName: c.sesion.nombre,
            assignmentId: c.sesion.assignmentId, sessionDate: c.sesion.date,
          },
        }));
      }
    }
  }

  // ── Supera tu sesión ────────────────────────────────────────────────────────
  {
    const porSesion = pendientes
      .map(sesion => ({
        sesion,
        refs: candidatos.filter(c => c.sesion.assignmentId === sesion.assignmentId)
          .map(c => referenciaDe(c.ej.exerciseId, c.ej.nombre, c.top)),
      }))
      .filter(x => x.refs.length >= 3)
      .sort((a, b) => b.refs.length - a.refs.length || a.sesion.date.localeCompare(b.sesion.date));
    const elegida = porSesion[0];
    if (elegida) {
      const n = elegida.refs.length;
      const tuning = difficultyFor('supera_sesion', memory);
      const target = clamp(Math.round(n * 0.5 * tuning.factor), 2, n);
      options.push(meta({
        kind: 'supera_sesion',
        score: SCORE_RENDIMIENTO.superaSesion,
        difficulty: tuning.label,
        title: `${elegida.sesion.nombre}: supera a la última vez`,
        description: `Tienes marca de la última vez en ${n} ejercicios de esta sesión. Mejora al menos ${target}: más kilos con las mismas repeticiones, o más repeticiones con los mismos kilos.`,
        reason: `Progresión de sesión completa (${target}/${n} ejercicios)`,
        metric: {
          unit: 'ejercicios', target, baseline: 0,
          workoutId: elegida.sesion.workoutId, workoutName: elegida.sesion.nombre,
          assignmentId: elegida.sesion.assignmentId, sessionDate: elegida.sesion.date,
          referencias: elegida.refs,
        },
      }));
    }
  }

  // ── AMRAP en la última serie ────────────────────────────────────────────────
  if (tipo !== 'test') {
    const aptos = candidatos
      .filter(c => !c.ej.prescripcion.technique && seguroParaAmrap(exById.get(c.ej.exerciseId)))
      // Primero lo guiado (máquina, polea): ahí la última repetición no se paga.
      .sort((a, b) => Number(!esGuiado(exById.get(a.ej.exerciseId))) - Number(!esGuiado(exById.get(b.ej.exerciseId)))
        || esClave(a) - esClave(b) || a.sesion.date.localeCompare(b.sesion.date));
    if (aptos.length > 0) {
      // Rota entre los aptos semana a semana: «de vez en cuando», no siempre el mismo.
      const c = pickVariant(aptos.slice(0, 4), seed);
      const peso = c.series[c.series.length - 1].weight;
      const record = recordDeReps(workoutLogs, c.ej.exerciseId, peso, today);
      const tuning = difficultyFor('amrap_serie', memory);
      const target = record + clamp(Math.round(tuning.factor), 1, 2);
      options.push(meta({
        kind: 'amrap_serie',
        score: SCORE_RENDIMIENTO.amrap,
        difficulty: tuning.label,
        title: `AMRAP en ${c.ej.nombre}`,
        description: `En la última serie de ${c.ej.nombre} (${c.sesion.nombre}), con ${fmtKg(peso)}, saca todas las repeticiones que puedas con buena técnica. Tu récord con ese peso: ${record}. A por ${target}.`,
        reason: `Serie al máximo en un ejercicio seguro para ir al fallo (${c.sesion.nombre})`,
        metric: {
          unit: 'reps', target, baseline: record, atWeight: peso,
          exerciseId: c.ej.exerciseId, exerciseName: c.ej.nombre,
          workoutId: c.sesion.workoutId, workoutName: c.sesion.nombre,
          assignmentId: c.sesion.assignmentId, sessionDate: c.sesion.date,
        },
      }));
    }
  }

  // ── Grupo estancado ─────────────────────────────────────────────────────────
  {
    const porGrupo = new Map<string, { estancados: Candidato[]; todos: Candidato[] }>();
    for (const c of candidatos) {
      if (!c.ej.grupo) continue;
      const g = porGrupo.get(c.ej.grupo) ?? { estancados: [], todos: [] };
      g.todos.push(c);
      const dos = ultimasDosVeces(workoutLogs, c.ej.exerciseId, today);
      const topUltima = dos ? serieTop(dos[0]) : null;
      const topAnterior = dos ? serieTop(dos[1]) : null;
      if (topUltima && topAnterior && !superaA(topAnterior, topUltima)) g.estancados.push(c);
      porGrupo.set(c.ej.grupo, g);
    }
    const peor = [...porGrupo.entries()]
      .filter(([, g]) => g.estancados.length > 0 && g.estancados.length * 2 >= g.todos.length)
      .sort((a, b) => b[1].estancados.length - a[1].estancados.length)[0];
    if (peor) {
      const [grupo, g] = peor;
      const label = MUSCLE_LABELS[grupo as MuscleGroup] ?? grupo;
      const refs = g.estancados.map(c => referenciaDe(c.ej.exerciseId, c.ej.nombre, c.top));
      const tuning = difficultyFor('grupo_estancado', memory);
      const target = clamp(Math.round(refs.length * 0.5 * tuning.factor + 0.5), 1, refs.length);
      const lista = refs.slice(0, 3).map(r => r.exerciseName).join(', ');
      options.push(meta({
        kind: 'grupo_estancado',
        score: SCORE_RENDIMIENTO.grupoEstancado,
        difficulty: tuning.label,
        title: `${label}: rompe el estancamiento`,
        description: `${label} lleva dos sesiones sin subir en ${lista}. Esta semana: +1 repetición o más kilos en ${target === refs.length && target > 1 ? 'todos' : `${target} de ${refs.length}`}.`,
        reason: `${g.estancados.length} ejercicio(s) de ${label.toLowerCase()} sin mejora en sus dos últimas sesiones`,
        metric: {
          unit: 'ejercicios', target, baseline: 0,
          muscleGroup: grupo as MuscleGroup, muscleLabel: label,
          referencias: refs,
        },
      }));
    }
  }

  // ── Mismo peso, más reserva ────────────────────────────────────────────────
  {
    const alFallo = candidatos
      .map(c => ({ c, s: [...c.series].filter(s => s.rir === 0).sort((a, b) => b.weight - a.weight)[0] }))
      .filter((x): x is { c: Candidato; s: Marca } => !!x.s && x.s.reps >= 3)
      .sort((a, b) => esClave(a.c) - esClave(b.c));
    const elegido = alFallo[0];
    if (elegido) {
      const { c, s } = elegido;
      options.push(meta({
        kind: 'mas_reserva',
        score: SCORE_RENDIMIENTO.masReserva,
        difficulty: 'justo',
        title: `${fmtKg(s.weight)} × ${s.reps} en ${c.ej.nombre}, sin fallo`,
        description: `La última vez, ${fmtKg(s.weight)} × ${s.reps} te costó ir al fallo. Esta semana: lo mismo dejando al menos 1 repetición en reserva. Si sale, has ganado fuerza.`,
        reason: `Misma carga con más reserva en ${c.ej.nombre} — fuerza sin más fatiga`,
        metric: {
          unit: 'serie', target: 1, minRir: 1, atWeight: s.weight, baseline: s.reps,
          exerciseId: c.ej.exerciseId, exerciseName: c.ej.nombre,
          workoutId: c.sesion.workoutId, workoutName: c.sesion.nombre,
          assignmentId: c.sesion.assignmentId, sessionDate: c.sesion.date,
        },
      }));
    }
  }

  // ── Récord de repeticiones en un ejercicio ─────────────────────────────────
  {
    const conTabla = candidatos
      .map(c => ({ c, tabla: tablaDeRecords(workoutLogs, c.ej.exerciseId, today) }))
      .filter(x => x.tabla.length >= 2)
      .sort((a, b) => esClave(a.c) - esClave(b.c) || b.tabla.length - a.tabla.length);
    const elegido = conTabla[0];
    if (elegido) {
      const { c, tabla } = elegido;
      const lista = tabla.slice(0, 3).map(r => `${r.weight.toLocaleString('es-ES')}×${r.reps}`).join(', ');
      options.push(meta({
        kind: 'record_reps',
        score: SCORE_RENDIMIENTO.recordReps,
        difficulty: 'justo',
        title: `Bate un récord en ${c.ej.nombre}`,
        description: `Tus récords: ${lista}. Bate cualquiera — más repeticiones con uno de esos pesos, o más kilos que nunca. Tú eliges dónde apretar.`,
        reason: `Récord flexible en ${c.ej.nombre} (${tabla.length} marcas vigentes)`,
        metric: {
          unit: 'récords', target: 1,
          exerciseId: c.ej.exerciseId, exerciseName: c.ej.nombre,
          workoutId: c.sesion.workoutId, workoutName: c.sesion.nombre,
          assignmentId: c.sesion.assignmentId, sessionDate: c.sesion.date,
        },
      }));
    }
  }

  return options;
}

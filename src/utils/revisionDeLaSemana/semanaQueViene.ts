import type {
  EventoDeSemana, Exercise, Mesocycle, Questionnaire, QuestionnaireAssignment, Workout, WorkoutEntryLog, WorkoutExercise, WorkoutLog,
} from '../../types.js';
import { mesocycleWeekNumber, resolverEjercicioDelMeso, vueltasDelCiclo } from '../progression.js';
import { cicloDiasDeMeso } from '../asignacionMesociclo.js';
import { novedadesDeSemana, type Novedad } from '../semanasDelBloque.js';
import { sugerirCarga, saltoReal, veredictoDeSerie, rangoDeReps } from '../cargaSugerida.js';
import { expandSetGroups } from '../setGroups.js';
import { seriesPrincipales } from '../tecnicaDeSerie.js';
import { tipoDeSemana } from '../tipoDeSemana.js';
import { nombreDeMeso } from '../nombresMeso.js';
import { addDays } from '../trainingWeek.js';
import { num } from './ventana.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «La semana que viene» — solo lo que ya está decidido (18-11-2026)

   Dani: «si nos vamos a inventar datos, prefiero que no salga». Así que esto
   solo junta lo que la app ya sabe de la semana siguiente:

     · Qué semana es: normal, descarga, puente, test, vuelta de parón o con un
       evento suyo (de las semanas del bloque), o la primera de un bloque nuevo.
     · Los cambios que el coach ya programó para esa semana (progresiones
       planificadas), con la misma lectura que ve el atleta en sus novedades.
     · El cuestionario que le toca contestar esos días.
     · El siguiente paso de carga de sus ejercicios principales, con el mismo
       criterio que la tarjeta de su sesión (`sugerirCarga`).

   Si no hay nada de eso, devuelve `null` y la sección no sale. Una semana
   «normal» sin nada más tampoco es algo que contar.
   ═══════════════════════════════════════════════════════════════════════════ */

export type TipoDeSemanaQueViene = 'normal' | 'descarga' | 'puente' | 'test' | 'paron' | 'evento';

export interface CargaQueViene {
  exerciseId: string;
  ejercicio: string;
  /** «Prueba con 72,5 kg» o «Antes de subir de 70 kg, llega a 12 repeticiones». */
  texto: string;
  que: 'subir' | 'esperar';
}

export interface SemanaQueViene {
  /** Fecha en que empieza la semana que viene. */
  desde: string;
  bloque: string;
  semana: number;
  semanas: number;
  /** La semana que viene es la primera de un bloque nuevo. */
  bloqueNuevo: boolean;
  tipo: TipoDeSemanaQueViene;
  evento?: EventoDeSemana;
  /** Vuelve el volumen normal tras una descarga. */
  vuelveElVolumen: boolean;
  cambios: Novedad[];
  cuestionarios: { titulo: string; fecha: string }[];
  cargas: CargaQueViene[];
}

/** Los ejercicios principales del bloque: los que el coach marcó para planificar
 *  su progresión y, si no marcó ninguno, el primero de cada sesión. */
export function ejerciciosPrincipales(meso: Pick<Mesocycle, 'ejerciciosClave'>, rutinas: readonly Workout[]): WorkoutExercise[] {
  const todos = rutinas.flatMap(w => [...(w.exercises ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  const clave = new Set((meso.ejerciciosClave ?? []).map(k => k.slice(k.lastIndexOf('::') + 2)).filter(Boolean));
  const elegidos = clave.size > 0
    ? todos.filter(we => clave.has(we.exerciseId))
    : rutinas.map(w => [...(w.exercises ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]).filter((we): we is WorkoutExercise => !!we);
  const vistos = new Set<string>();
  return elegidos.filter(we => (vistos.has(we.exerciseId) ? false : (vistos.add(we.exerciseId), true)));
}

/** La última vez que hizo ese ejercicio (hasta `hoy`), para saber qué le toca. */
function ultimaEntrada(logs: readonly WorkoutLog[], exerciseId: string, hoy: string): WorkoutEntryLog | undefined {
  let mejor: { date: string; e: WorkoutEntryLog } | null = null;
  for (const l of logs) {
    if (l.date > hoy) continue;
    const e = l.entries.find(x => x.exerciseId === exerciseId && x.sets.some(s => s.repsDone > 0));
    if (e && (!mejor || l.date >= mejor.date)) mejor = { date: l.date, e };
  }
  return mejor?.e;
}

const kg = (n: number) => `${num(n, 2)} kg`;

/** El siguiente paso de carga de cada ejercicio principal, si lo hay. */
export function cargasQueVienen(o: {
  meso: Mesocycle; semana: number; rutinas: readonly Workout[]; logs: readonly WorkoutLog[];
  exercises: readonly Pick<Exercise, 'id' | 'name'>[]; hoy: string;
}): CargaQueViene[] {
  const tipo = tipoDeSemana(o.meso, o.semana);
  // En test no se sugiere carga: se va a AMRAP. En descarga, puente o parón,
  // `sugerirCarga` ya no sube.
  if (tipo || o.meso.semanasTest?.includes(o.semana)) return [];
  const nombreDe = new Map(o.exercises.map(e => [e.id, e.name]));
  const out: CargaQueViene[] = [];
  for (const base of ejerciciosPrincipales(o.meso, o.rutinas)) {
    const we = resolverEjercicioDelMeso(base, o.meso, o.semana);
    if (!we.reps || !rangoDeReps(we.reps) || !(we.sets > 0 || (we.setGroups?.length ?? 0) > 0)) continue;
    const previa = ultimaEntrada(o.logs, we.exerciseId, o.hoy);
    if (!previa) continue;
    const salto = saltoReal(o.logs, we.exerciseId);
    const nombre = nombreDe.get(we.exerciseId) ?? 'Ejercicio';
    const s = sugerirCarga(we, previa, salto, null);
    const suben = s.series.filter((x): x is { peso: number; reps: number } => x != null);
    if (suben.length > 0) {
      const peso = Math.max(...suben.map(x => x.peso));
      out.push({ exerciseId: we.exerciseId, ejercicio: nombre, que: 'subir', texto: `Prueba con ${kg(peso)}` });
      continue;
    }
    // Llegó al tope pero el salto es grande: primero más repeticiones.
    const filas = expandSetGroups(we);
    const previas = seriesPrincipales(previa.sets);
    const v = filas.length > 0 ? veredictoDeSerie(previas[0], filas[0], salto) : null;
    if (v?.que === 'esperar') {
      out.push({ exerciseId: we.exerciseId, ejercicio: nombre, que: 'esperar', texto: `Antes de subir de ${kg(v.peso)}, llega a ${v.reps} repeticiones` });
    }
  }
  return out;
}

function tipoDe(meso: Mesocycle, semana: number): { tipo: TipoDeSemanaQueViene; evento?: EventoDeSemana } {
  const evento = meso.eventosSemana?.[String(semana)];
  if (meso.semanasTest?.includes(semana)) return { tipo: 'test', evento };
  const t = tipoDeSemana(meso, semana);
  if (t) return { tipo: t, evento };
  if (evento) return { tipo: 'evento', evento };
  return { tipo: 'normal' };
}

export function semanaQueViene(o: {
  hoy: string;
  mesocycles: readonly Mesocycle[];
  workouts: readonly Workout[];
  exercises: readonly Pick<Exercise, 'id' | 'name'>[];
  logs: readonly WorkoutLog[];
  asignaciones?: readonly QuestionnaireAssignment[];
  cuestionarios?: readonly Pick<Questionnaire, 'id' | 'title'>[];
  /** Próxima fecha en que toca una asignación (scheduleEngine). Inyectable para probar. */
  proximaDe?: (a: QuestionnaireAssignment) => string | null;
}): SemanaQueViene | null {
  const { hoy } = o;
  const empezados = [...o.mesocycles].filter(m => !!m.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const actual = empezados.filter(m => m.startDate <= hoy && hoy <= addDays(m.startDate, m.weeks * 7 - 1)).pop() ?? null;

  // De qué bloque y qué semana de ciclo es la semana que viene.
  let meso: Mesocycle | null = null;
  let semana = 1;
  let desde = addDays(hoy, 7);
  let bloqueNuevo = false;
  if (actual) {
    const ciclo = cicloDiasDeMeso(actual);
    const vueltas = vueltasDelCiclo(actual.weeks, ciclo);
    const ahora = mesocycleWeekNumber(actual.startDate, hoy, ciclo);
    if (ahora < vueltas) {
      meso = actual; semana = ahora + 1; desde = addDays(actual.startDate, ahora * ciclo);
    } else {
      desde = addDays(actual.startDate, vueltas * ciclo);
    }
  }
  if (!meso) {
    // El bloque siguiente, si ya está creado y empieza en los próximos días.
    const siguiente = empezados.find(m => m.startDate > hoy && m.startDate <= addDays(hoy, 7) && m.id !== actual?.id);
    if (siguiente) { meso = siguiente; semana = 1; desde = siguiente.startDate; bloqueNuevo = true; }
  }

  const finDeLaSemana = addDays(desde, 6);
  const tituloDe = new Map((o.cuestionarios ?? []).map(q => [q.id, q.title]));
  const cuestionarios = (o.asignaciones ?? [])
    .filter(a => a.active && a.schedule)
    .map(a => ({ titulo: tituloDe.get(a.questionnaireId) ?? 'Cuestionario', fecha: o.proximaDe?.(a) ?? null }))
    .filter((c): c is { titulo: string; fecha: string } => c.fecha != null && c.fecha > hoy && c.fecha <= finDeLaSemana)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (!meso) {
    return cuestionarios.length > 0
      ? { desde, bloque: '', semana: 0, semanas: 0, bloqueNuevo: false, tipo: 'normal', vuelveElVolumen: false, cambios: [], cuestionarios, cargas: [] }
      : null;
  }

  const ciclo = cicloDiasDeMeso(meso);
  const vueltas = vueltasDelCiclo(meso.weeks, ciclo);
  const rutinas = o.workouts.filter(w => w.mesocycleId === meso!.id);
  const nombreDe = (id: string) => o.exercises.find(e => e.id === id)?.name ?? 'Ejercicio';
  const n = novedadesDeSemana(rutinas.flatMap(w => (w.exercises ?? []).map(we => ({ we, dia: w.name }))), meso, semana, nombreDe);
  const { tipo, evento } = tipoDe(meso, semana);
  const cargas = cargasQueVienen({ meso, semana, rutinas, logs: o.logs, exercises: o.exercises, hoy });

  const r: SemanaQueViene = {
    desde, bloque: nombreDeMeso(meso), semana, semanas: vueltas, bloqueNuevo,
    tipo, ...(evento ? { evento } : {}),
    vuelveElVolumen: n.vuelveElVolumen,
    cambios: bloqueNuevo ? [] : n.cambios,
    cuestionarios, cargas,
  };
  return hayAlgoQueDecir(r) ? r : null;
}

export function hayAlgoQueDecir(s: SemanaQueViene): boolean {
  return s.tipo !== 'normal' || s.bloqueNuevo || s.vuelveElVolumen
    || s.cambios.length > 0 || s.cuestionarios.length > 0 || s.cargas.length > 0;
}

export const TEXTO_TIPO_SEMANA: Record<TipoDeSemanaQueViene, string> = {
  normal: 'Semana normal',
  descarga: 'Semana de descarga: menos series para recuperar',
  puente: 'Semana puente: menos series, salvo en lo que es prioridad',
  test: 'Semana de test: la última serie, a tope',
  paron: 'Vuelta tras el parón: con más margen en cada serie',
  evento: 'Semana con un plan especial',
};

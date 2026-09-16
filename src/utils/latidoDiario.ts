import {
  AppNotification, AthleteDietConfig, BodyweightLog, Exercise, LevelLadder,
  NutritionProgram, Roadmap, StepLog, UserProfile, WorkoutAssignment, WorkoutLog,
} from '../types.js';
import { addDays } from './trainingWeek.js';
import { conEstadoReal } from './estadoDeAsignacion.js';
import { computeActivePhase } from './fasesNutricion.js';
import { computeLadderStatus } from './levelLadder.js';
import { DEFAULT_LEVEL_LADDER } from '../data/defaultLevelLadder.js';

/* ═══════════════════════════════════════════════════════════════════════════
   EL LATIDO DIARIO — qué hay que hacerle a cada atleta hoy.

   Hasta ahora todo esto pasaba cuando el atleta ABRÍA una pantalla
   («generate-on-read»): marcar como perdidas las sesiones que se dejó, aplicar
   el cambio de fase de la dieta, anunciar un nivel nuevo. Funciona, pero tiene
   dos agujeros que no se arreglan desde el cliente:

    · Un atleta que no abre la app en diez días no se entera de nada, y el
      coach tampoco: sus sesiones siguen «pendientes», su fase de nutrición no
      cambia y no le llega ningún aviso. Justo el atleta del que hay que
      enterarse es el invisible.
    · El trabajo lo paga el móvil del atleta, en el primer render. Cada
      apertura de la app arrastra el historial entero para decidir cosas que se
      deciden igual una vez al día.

   Este módulo es la DECISIÓN, no la escritura: recibe una foto de los datos de
   un atleta y devuelve una lista de acciones. Así se puede probar entero con
   objetos en memoria, y quien ejecuta —el endpoint `api/latido-diario.ts`, con
   el SDK de administración— no tiene ninguna regla de negocio dentro.

   Todo lo que devuelve es IDEMPOTENTE: pasarlo dos veces el mismo día no
   duplica nada. Es lo que permite que el latido y el cliente convivan mientras
   se despliega, en vez de tener que apagar uno para encender el otro.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Días que una sesión pendiente aguanta antes de darse por perdida. */
export const DIAS_PARA_DARSE_POR_PERDIDA = 7;

export type AccionDelLatido =
  | { tipo: 'marcar_sesion_perdida'; assignmentId: string; fecha: string }
  | { tipo: 'activar_dieta'; athleteEmail: string; activeDietIds: string[] }
  | { tipo: 'marcar_fase_vista'; athleteEmail: string; phaseId: string }
  | { tipo: 'guardar_niveles'; athleteEmail: string; achievedLevelIds: Record<string, string> }
  | { tipo: 'actualizar_peldanos'; userId: string; peldanos: number }
  | { tipo: 'aviso'; dedupeKey: string; notificacion: Omit<AppNotification, 'id'> };

export interface FotoDelAtleta {
  profile: UserProfile;
  assignments: WorkoutAssignment[];
  workoutLogs: WorkoutLog[];
  bodyweightLogs: BodyweightLog[];
  stepLogs: StepLog[];
  exercises: Exercise[];
  nutritionProgram: NutritionProgram | null;
  dietConfig: AthleteDietConfig | null;
  roadmap: Roadmap | null;
}

export interface OpcionesLatido {
  /** Fecha del latido, en la zona horaria del coach. */
  hoy: string;
  coachEmail: string;
  /** El momento que se escribe en los avisos. Inyectable para poder testear. */
  ahoraIso?: string;
}

export interface ResultadoDelLatido {
  acciones: AccionDelLatido[];
  /** Una línea por cosa hecha, para el resumen que queda en `latidos/{fecha}`. */
  resumen: string[];
}

export function planificarLatido(
  foto: FotoDelAtleta,
  opciones: OpcionesLatido,
): ResultadoDelLatido {
  const { hoy, coachEmail } = opciones;
  const ahora = opciones.ahoraIso ?? new Date().toISOString();
  const acciones: AccionDelLatido[] = [];
  const resumen: string[] = [];
  const email = foto.profile.email;

  // ── 1. Las sesiones que se dejó atrás ────────────────────────────────────
  // Mismo criterio que tenía TrainingScreen: una semana de margen. Antes de
  // eso una sesión pendiente puede recuperarse y no es un fallo.
  const corte = addDays(hoy, -DIAS_PARA_DARSE_POR_PERDIDA);
  // Primero, la verdad: un día con entreno GUARDADO está hecho, diga lo que
  // diga `status`. Hay asignaciones en producción que quedaron en `pending`
  // por la reasignación vieja (auditoría §4.1) aunque el atleta las entrenó;
  // sin esto, la primera pasada nocturna las habría marcado como perdidas —
  // y las pantallas que no aplican `conEstadoReal` las habrían enseñado como
  // falladas para siempre.
  const asignaciones = conEstadoReal(foto.assignments, foto.workoutLogs);
  const perdidas = asignaciones.filter(a => a.status === 'pending' && a.date < corte);
  for (const a of perdidas) {
    acciones.push({ tipo: 'marcar_sesion_perdida', assignmentId: a.id, fecha: a.date });
  }
  if (perdidas.length > 0) {
    resumen.push(perdidas.length === 1
      ? '1 sesión marcada como perdida'
      : `${perdidas.length} sesiones marcadas como perdidas`);
  }

  // ── 2. El cambio de fase de la nutrición ─────────────────────────────────
  const programa = foto.nutritionProgram;
  const fase = programa && programa.phases.length > 0 ? computeActivePhase(programa, hoy) : null;
  if (programa && fase?.dietId) {
    const activas = new Set(foto.dietConfig?.activeDietIds ?? []);
    // Se reescribe solo si de verdad cambia: ni si ya está puesta, ni si es la
    // única. Sin esta condición, el latido escribiría el mismo documento todas
    // las noches de todos los atletas.
    if (!activas.has(fase.dietId) || activas.size !== 1) {
      acciones.push({ tipo: 'activar_dieta', athleteEmail: email, activeDietIds: [fase.dietId] });
      resumen.push(`dieta activa → ${fase.dietId}`);
    }
    if (programa.lastSeenPhaseId !== fase.id) {
      acciones.push({ tipo: 'marcar_fase_vista', athleteEmail: email, phaseId: fase.id });
      const clave = `notif_np_${email}_${fase.id}`;
      const cuerpo = `Plan de nutrición cambió a: ${fase.name}`;
      acciones.push({
        tipo: 'aviso', dedupeKey: `${clave}_athlete`,
        notificacion: {
          recipientEmail: email, type: 'nutrition_phase_change',
          title: 'Plan de nutrición actualizado', body: cuerpo,
          link: 'nutrition', createdAt: ahora, read: false,
        },
      });
      acciones.push({
        tipo: 'aviso', dedupeKey: `${clave}_coach`,
        notificacion: {
          recipientEmail: coachEmail, type: 'nutrition_phase_change',
          title: `Fase de nutrición cambiada (${foto.profile.displayName})`,
          body: `${foto.profile.displayName}: ${cuerpo}`,
          link: 'clients', createdAt: ahora, read: false,
        },
      });
      resumen.push(`fase de nutrición → ${fase.name}`);
    }
  }

  // ── 3. Los peldaños de la escalera ───────────────────────────────────────
  const escalera: LevelLadder = foto.roadmap?.levelLadder ?? DEFAULT_LEVEL_LADDER;
  const nivel = computeLadderStatus(escalera, {
    bodyweightLogs: foto.bodyweightLogs,
    stepLogs: foto.stepLogs,
    workoutLogs: foto.workoutLogs,
    exercises: foto.exercises,
    initialWeight: foto.profile.initialWeight,
    today: hoy,
  });

  if (nivel.newlyAchieved.length > 0) {
    const conseguidos = { ...(foto.roadmap?.levelLadder?.achievedLevelIds ?? {}) };
    for (const lvl of nivel.newlyAchieved) conseguidos[lvl.id] = hoy;
    acciones.push({ tipo: 'guardar_niveles', athleteEmail: email, achievedLevelIds: conseguidos });

    for (const lvl of nivel.newlyAchieved) {
      acciones.push({
        tipo: 'aviso', dedupeKey: `notif_lvl_${email}_${lvl.id}`,
        notificacion: {
          recipientEmail: email, type: 'level_up', title: 'Nuevo nivel 🏅',
          body: `Has alcanzado el nivel ${lvl.name}. ¡Enorme!`,
          link: 'roadmap', createdAt: ahora, read: false,
        },
      });
      acciones.push({
        tipo: 'aviso', dedupeKey: `notif_lvl_${email}_${lvl.id}_coach`,
        notificacion: {
          recipientEmail: coachEmail, type: 'level_up', title: 'Nuevo nivel',
          body: `${email} ha alcanzado el nivel ${lvl.name}`,
          createdAt: ahora, read: false,
        },
      });
    }

    // `UserProfile.level` es CUÁNTOS peldaños lleva — lo usa la Academia para
    // la regla de desbloqueo «nivel mínimo».
    const peldanos = Object.keys(conseguidos).length;
    if (peldanos !== foto.profile.level) {
      acciones.push({ tipo: 'actualizar_peldanos', userId: foto.profile.userId, peldanos });
    }
    resumen.push(`nivel: ${nivel.newlyAchieved.map(l => l.name).join(', ')}`);
  }

  return { acciones, resumen };
}

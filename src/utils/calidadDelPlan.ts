import {
  AthleteDietConfig, Diet, Mesocycle, MuscleGroup, MUSCLE_LABELS,
  PhotoAssignment, QSchedule, QuestionnaireAssignment, Roadmap, UserProfile, WeekDay, Workout,
} from '../types';
import { addDays } from './trainingWeek';
import { mesocycleWeekNumber } from './progression';

/* ═══════════════════════════════════════════════════════════════════════════
   ANTES DE PUBLICAR — lo que está puesto pero mal puesto.

   La checklist de Implantación contesta a «¿está hecho?». Esto contesta a otra
   cosa: «¿está bien?». Son distintas y el hueco entre las dos es por donde se
   escapan los planes rotos.

   Un mesociclo con el pecho a prioridad alta y cero series está HECHO —existe,
   la checklist lo da por bueno— y es un plan roto. Una dieta activa sin ni un
   alimento está creada y el atleta abre la app y ve una pantalla vacía. Cuatro
   días de la semana sin dieta asignada no dan ningún error: simplemente esos
   días el atleta no tiene nada que comer.

   Ninguna de estas cosas la caza el tipo, ni `tsc`, ni una prueba. Se cazan
   mirando, y mirando solo se cazan si alguien se acuerda de mirar. Por eso
   este motor existe: para que la pantalla lo pregunte por ti antes de que el
   atleta lo descubra.

   Puro y determinista, con la fecha inyectada.
   ═══════════════════════════════════════════════════════════════════════════ */

export type GravedadDefecto = 'bloquea' | 'revisa';

export interface DefectoDelPlan {
  id: string;
  /** `bloquea` = el atleta ve algo roto. `revisa` = probablemente no es lo que querías. */
  gravedad: GravedadDefecto;
  titulo: string;
  /** Qué pasa si se queda así, dicho en concreto. */
  consecuencia: string;
  /** La pestaña donde se arregla. */
  tab?: string;
}

export interface EntradaCalidadDelPlan {
  profile: UserProfile;
  mesocycles: Mesocycle[];
  /** Rutinas del atleta, para mirar dentro del bloque activo. */
  workouts: Workout[];
  diets: Diet[];
  dietConfig: AthleteDietConfig | null;
  qAssignments: QuestionnaireAssignment[];
  photoAssignments: PhotoAssignment[];
  roadmap: Roadmap | null;
  today: string;
}

const DIAS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NOMBRE_DIA: Record<WeekDay, string> = {
  mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves',
  fri: 'viernes', sat: 'sábado', sun: 'domingo',
};

function listar(xs: string[]): string {
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
}

/** El bloque en curso a día de hoy, o null si no hay ninguno abierto. */
/** Días antes del final del bloque en los que empieza a avisarse de la
 *  renovación. Lo leen la bandeja del coach y la pestaña de Implantación:
 *  con dos constantes, cambiar una dejaba a la otra avisando en otro día. */
export const DIAS_AVISO_RENOVACION = 7;

export function mesoEnCurso(mesocycles: Mesocycle[], today: string): Mesocycle | null {
  for (const m of mesocycles) {
    if (!m.startDate) continue;
    const fin = addDays(m.startDate, m.weeks * 7 - 1);
    if (today >= m.startDate && today <= fin) return m;
  }
  return null;
}

export function revisarCalidadDelPlan(entrada: EntradaCalidadDelPlan): DefectoDelPlan[] {
  const { profile, mesocycles, workouts, diets, dietConfig, qAssignments, photoAssignments, roadmap, today } = entrada;
  const defectos: DefectoDelPlan[] = [];
  const meso = mesoEnCurso(mesocycles, today);

  // ── 1. Grupos prioritarios sin series programadas ────────────────────────
  if (meso?.groups) {
    const abandonados = (Object.entries(meso.groups) as [MuscleGroup, { series: number; priority: string }][])
      .filter(([, cfg]) => cfg.priority === 'alta' && (cfg.series ?? 0) === 0)
      .map(([g]) => MUSCLE_LABELS[g]);
    if (abandonados.length > 0) {
      defectos.push({
        id: 'prioritarios_a_cero',
        gravedad: 'revisa',
        titulo: `${listar(abandonados)} ${abandonados.length === 1 ? 'está marcado' : 'están marcados'} como prioridad alta con cero series`,
        consecuencia: 'La prioridad no hace nada por sí sola: si no hay series, ese grupo no se entrena.',
        tab: 'entrenamientos',
      });
    }
  }

  // ── 2. Sesiones del bloque vacías ────────────────────────────────────────
  if (meso) {
    const delBloque = workouts.filter(w => w.mesocycleId === meso.id);
    if (delBloque.length === 0) {
      defectos.push({
        id: 'bloque_sin_sesiones',
        gravedad: 'bloquea',
        titulo: 'El bloque en curso no tiene ni una sesión',
        consecuencia: 'El atleta abre Entrenamiento y no hay nada que hacer.',
        tab: 'entrenamientos',
      });
    } else {
      const vacias = delBloque.filter(w => (w.exercises?.length ?? 0) === 0);
      if (vacias.length > 0) {
        defectos.push({
          id: 'sesiones_vacias',
          gravedad: 'bloquea',
          titulo: vacias.length === 1
            ? `Una sesión sin ejercicios: ${vacias[0].name}`
            : `${vacias.length} sesiones sin ejercicios: ${listar(vacias.map(w => w.name))}`,
          consecuencia: vacias.length === 1
            ? 'Al abrirla el atleta se encuentra una sesión en blanco.'
            : 'Al abrirlas el atleta se encuentra una sesión en blanco.',
          tab: 'entrenamientos',
        });
      }
    }
  }

  // ── 3. Dietas activas sin comidas ────────────────────────────────────────
  const activas = (dietConfig?.activeDietIds ?? [])
    .map(id => diets.find(d => d.id === id))
    .filter((d): d is Diet => !!d);
  const vaciasDeComida = activas.filter(d => (d.meals?.length ?? 0) === 0);
  if (vaciasDeComida.length > 0) {
    defectos.push({
      id: 'dieta_activa_sin_comidas',
      gravedad: 'bloquea',
      titulo: `Dieta activa sin alimentos: ${listar(vaciasDeComida.map(d => d.name))}`,
      consecuencia: 'Tiene el presupuesto de intercambios puesto pero ninguna comida, así que en «Mi plan» le sale el día en blanco.',
      tab: 'dietas',
    });
  }
  // Una dieta activa que ya no existe: el id quedó apuntando a nada.
  const huerfanas = (dietConfig?.activeDietIds ?? []).filter(id => !diets.some(d => d.id === id));
  if (huerfanas.length > 0) {
    defectos.push({
      id: 'dieta_activa_borrada',
      gravedad: 'bloquea',
      titulo: `${huerfanas.length === 1 ? 'Hay una dieta activa que ya no existe' : `Hay ${huerfanas.length} dietas activas que ya no existen`}`,
      consecuencia: 'Se borró después de activarla. El atleta no ve ninguna dieta esos días.',
      tab: 'dietas',
    });
  }

  // ── 4. Días de la semana sin dieta ───────────────────────────────────────
  // Solo se avisa si el calendario está EMPEZADO: sin ningún día puesto, eso ya
  // lo dice la checklist («calendario semanal de dietas»), y repetirlo aquí
  // convierte el bloque en ruido para un cliente a medio montar.
  const horario = dietConfig?.weeklySchedule;
  if (horario) {
    const puestos = DIAS.filter(d => !!horario[d]);
    const sinDieta = DIAS.filter(d => !horario[d]);
    if (puestos.length > 0 && sinDieta.length > 0) {
      defectos.push({
        id: 'dias_sin_dieta',
        gravedad: 'revisa',
        titulo: `Sin dieta asignada: ${listar(sinDieta.map(d => NOMBRE_DIA[d]))}`,
        consecuencia: 'Esos días el atleta abre «Mi plan» y no tiene nada pautado.',
        tab: 'dietas',
      });
    }
  }

  // ── 5. Cuestionario activo que no se le va a pedir nunca ─────────────────
  // No se avisa de los de tipo `once`: pedir algo una sola vez —la anamnesis,
  // por ejemplo— es una decisión legítima. Lo que se avisa es la cadencia
  // ROTA: «cada N días» sin N, «los martes» sin ningún día marcado. Eso no es
  // una elección, es una asignación que no se va a disparar jamás y que
  // aparece como activa en la pantalla.
  const nuncaSeDispara = qAssignments.filter(a => a.active && cadenciaRota(a.schedule));
  if (nuncaSeDispara.length > 0) {
    defectos.push({
      id: 'cuestionario_sin_cadencia',
      gravedad: 'bloquea',
      titulo: nuncaSeDispara.length === 1
        ? 'Un cuestionario activo tiene la cadencia a medias'
        : `${nuncaSeDispara.length} cuestionarios activos tienen la cadencia a medias`,
      consecuencia: 'Figura como activo pero no se le va a pedir nunca: le falta el día o el intervalo.',
      tab: 'revisiones',
    });
  }

  // ── 6. Fotos asignadas sin vistas ────────────────────────────────────────
  const fotosSinVistas = photoAssignments.filter(a => a.active && (a.views?.length ?? 0) === 0);
  if (fotosSinVistas.length > 0) {
    defectos.push({
      id: 'fotos_sin_vistas',
      gravedad: 'revisa',
      titulo: 'Las fotos de seguimiento no tienen ninguna vista elegida',
      consecuencia: 'No se le pide ninguna foto concreta, así que manda lo que quiere o no manda nada.',
      tab: 'revisiones',
    });
  }

  // ── 7. El plan no tiene fin ──────────────────────────────────────────────
  if (profile.planStartDate && !profile.planDurationMonths) {
    defectos.push({
      id: 'plan_sin_fin',
      gravedad: 'revisa',
      titulo: 'El plan tiene fecha de inicio pero no duración',
      consecuencia: 'Sin fin no hay renovación que preparar ni cuenta atrás que enseñarle.',
      tab: 'ficha',
    });
  }

  // ── 8. El bloque se acaba y no hay hitos dentro ──────────────────────────
  if (meso) {
    const fin = addDays(meso.startDate, meso.weeks * 7 - 1);
    const hitosDentro = (roadmap?.items ?? []).filter(
      it => !!it.targetDate && it.targetDate >= meso.startDate && it.targetDate <= fin,
    );
    if (hitosDentro.length === 0) {
      const semana = mesocycleWeekNumber(meso.startDate, today);
      defectos.push({
        id: 'bloque_sin_hitos',
        gravedad: 'revisa',
        titulo: `El bloque en curso (semana ${semana} de ${meso.weeks}) no tiene ningún hito`,
        consecuencia: 'El atleta no ve nada a lo que llegar dentro de estas semanas.',
        tab: 'roadmap',
      });
    }
  }

  return defectos;
}

/**
 * Una cadencia que no puede dispararse nunca porque le falta su parámetro.
 * `once` y `mesocycle_end` no necesitan ninguno: no se comprueban.
 */
function cadenciaRota(schedule: QSchedule | undefined): boolean {
  if (!schedule) return true;
  switch (schedule.type) {
    case 'weekdays': return (schedule.weekdays?.length ?? 0) === 0;
    case 'interval': return !schedule.intervalDays || schedule.intervalDays <= 0;
    case 'monthly': return !schedule.dayOfMonth;
    case 'plan_week': return !schedule.planWeek;
    default: return false;
  }
}

/** Los que de verdad rompen algo que el atleta ve. */
export function defectosQueBloquean(defectos: DefectoDelPlan[]): DefectoDelPlan[] {
  return defectos.filter(d => d.gravedad === 'bloquea');
}

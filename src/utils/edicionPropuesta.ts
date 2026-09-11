/* Qué tocó Dani en la propuesta ANTES de aprobarla.
 *
 * Hermano de derivaPropuestas.ts, que mira lo que cambia DESPUÉS. Los dos
 * responden a la misma pregunta —qué corrige— pero en momentos distintos, y
 * este es el más barato: la corrección está delante, sin comparar con nada
 * vivo. Se escribe en la ficha en lenguaje de coach, no como un diff, porque
 * quien lo va a leer luego es el asistente, para no volver a proponer lo mismo.
 */
import type {
  SetupConfigProposalPayload, WeeklyChallengeProposalPayload,
  WorkoutTemplateProposalPayload, MesocycleTemplateProposalPayload,
  AiProposal, AiProposalPayload, Diet, DossierPatch, LevelLadder, Mesocycle,
  MuscleGroup, NutritionProgramProposalPayload, PeriodizationBlockPayload, RoadmapProposalPayload,
  SpecialDayProposalPayload, WorkoutDaysProposalPayload,
} from '../types';
import { MUSCLE_LABELS } from '../types';
import { BUDGET_CATS, computeDietPlaced } from './exchangeHelpers';

function mesoDe(kind: AiProposal['kind'], payload: AiProposalPayload): Omit<Mesocycle, 'id'> {
  return kind === 'periodizationBlock'
    ? (payload as PeriodizationBlockPayload).mesocycle
    : (payload as Omit<Mesocycle, 'id'>);
}

export function describirEdicion(original: AiProposal, editado: AiProposalPayload): string {
  const cambios: string[] = [];
  const antes = original.payload;

  if (original.kind === 'mesocycle' || original.kind === 'periodizationBlock') {
    const a = mesoDe(original.kind, antes);
    const b = mesoDe(original.kind, editado);
    if (a.weeks !== b.weeks) cambios.push(`semanas ${a.weeks} → ${b.weeks}`);
    if (a.daysPerWeek !== b.daysPerWeek) cambios.push(`días/ciclo ${a.daysPerWeek} → ${b.daysPerWeek}`);
    for (const g of Object.keys(MUSCLE_LABELS) as MuscleGroup[]) {
      const sa = a.groups?.[g]?.series ?? 0;
      const sb = b.groups?.[g]?.series ?? 0;
      if (sa !== sb) cambios.push(`${g} ${sa} → ${sb} series`);
    }
    if (original.kind === 'periodizationBlock') {
      const ca = (antes as PeriodizationBlockPayload).reviewCadenceWeeks;
      const cb = (editado as PeriodizationBlockPayload).reviewCadenceWeeks;
      if (ca !== cb) cambios.push(`revisiones cada ${ca} → ${cb} semanas`);
    }
  }

  if (original.kind === 'workoutDays') {
    const a = antes as WorkoutDaysProposalPayload;
    const b = editado as WorkoutDaysProposalPayload;
    for (const diaA of a.days) {
      const diaB = b.days.find(d => d.dayIndex === diaA.dayIndex);
      if (!diaB) continue;
      const idsB = new Set(diaB.exercises.map(e => e.exerciseId));
      const quitados = diaA.exercises.filter(e => !idsB.has(e.exerciseId)).map(e => e.exerciseName);
      if (quitados.length) cambios.push(`día ${diaA.dayIndex + 1}: quitó ${quitados.join(', ')}`);
      for (const exA of diaA.exercises) {
        const exB = diaB.exercises.find(e => e.exerciseId === exA.exerciseId);
        if (!exB) continue;
        if (exA.sets !== exB.sets) cambios.push(`${exA.exerciseName} ${exA.sets} → ${exB.sets} series`);
        if (exA.reps !== exB.reps) cambios.push(`${exA.exerciseName} reps ${exA.reps} → ${exB.reps}`);
        if (exA.rir !== exB.rir) cambios.push(`${exA.exerciseName} RIR ${exA.rir} → ${exB.rir}`);
      }
    }
  }

  if (original.kind === 'levelLadder') {
    const a = antes as LevelLadder;
    const b = editado as LevelLadder;
    const nombresB = b.levels.map(l => l.name);
    const quitados = a.levels.filter(l => !b.levels.some(x => x.id === l.id)).map(l => l.name);
    if (quitados.length) cambios.push(`quitó los niveles ${quitados.join(', ')}`);
    for (const nivelA of a.levels) {
      const nivelB = b.levels.find(x => x.id === nivelA.id);
      if (!nivelB) continue;
      if (nivelA.name !== nivelB.name) cambios.push(`nivel "${nivelA.name}" → "${nivelB.name}"`);
      for (const cA of nivelA.criteria) {
        const cB = nivelB.criteria.find(x => x.id === cA.id);
        if (!cB) { cambios.push(`quitó el criterio "${cA.label}"`); continue; }
        if (cA.label !== cB.label) cambios.push(`criterio "${cA.label}" → "${cB.label}"`);
        if (cA.targetValue !== cB.targetValue) cambios.push(`"${cB.label}": objetivo ${cA.targetValue} → ${cB.targetValue}`);
      }
    }
    if (cambios.length === 0 && a.levels.length !== b.levels.length) cambios.push(`niveles ${a.levels.length} → ${nombresB.length}`);
  }

  if (original.kind === 'roadmap') {
    const a = antes as RoadmapProposalPayload;
    const b = editado as RoadmapProposalPayload;
    const quitados = a.items.filter(i => !b.items.some(x => x.id === i.id)).map(i => i.title);
    if (quitados.length) cambios.push(`quitó ${quitados.join(', ')}`);
    for (const itA of a.items) {
      const itB = b.items.find(x => x.id === itA.id);
      if (!itB) continue;
      if (itA.title !== itB.title) cambios.push(`"${itA.title}" → "${itB.title}"`);
      if (itA.targetDate !== itB.targetDate) cambios.push(`"${itB.title}": fecha ${itA.targetDate ?? 'sin fecha'} → ${itB.targetDate ?? 'sin fecha'}`);
    }
  }

  if (original.kind === 'specialDay') {
    const a = antes as SpecialDayProposalPayload;
    const b = editado as SpecialDayProposalPayload;
    if (a.date !== b.date) cambios.push(`fecha ${a.date} → ${b.date}`);
    if (a.title !== b.title) cambios.push(`título "${a.title}" → "${b.title}"`);
    if (a.athleteNote !== b.athleteNote) cambios.push('reescribió la nota que lee el atleta');
  }

  if (original.kind === 'diet') {
    const a = antes as Omit<Diet, 'id'>;
    const b = editado as Omit<Diet, 'id'>;
    for (const cat of ['HC', 'PROT', 'GRASA'] as const) {
      if (a.budget?.[cat] !== b.budget?.[cat]) cambios.push(`${cat} ${a.budget?.[cat] ?? 0} → ${b.budget?.[cat] ?? 0} intercambios`);
    }
    const quitadas = (a.meals ?? []).filter(m => !(b.meals ?? []).some(x => x.id === m.id)).map(m => m.name);
    if (quitadas.length) cambios.push(`quitó ${quitadas.join(', ')}`);
  }

  if (original.kind === 'nutritionProgram') {
    const a = antes as NutritionProgramProposalPayload;
    const b = editado as NutritionProgramProposalPayload;
    if (a.startDate !== b.startDate) cambios.push(`inicio ${a.startDate} → ${b.startDate}`);
    const quitadas = a.phases.filter(f => !b.phases.some(x => x.name === f.name)).map(f => f.name);
    if (quitadas.length) cambios.push(`quitó las fases ${quitadas.join(', ')}`);
    for (const fa of a.phases) {
      const fb = b.phases.find(x => x.name === fa.name);
      if (!fb) continue;
      if (fa.weeks !== fb.weeks) cambios.push(`${fa.name} ${fa.weeks} → ${fb.weeks} semanas`);
      if (fa.targetKcal !== fb.targetKcal) cambios.push(`${fa.name} ${fa.targetKcal ?? 'sin kcal'} → ${fb.targetKcal ?? 'sin kcal'} kcal`);
    }
    const recargasA = (a.refeedDays ?? []).length;
    const recargasB = (b.refeedDays ?? []).length;
    if (recargasA !== recargasB) cambios.push(`recargas ${recargasA} → ${recargasB}`);
  }

  if (original.kind === 'checkinFeedback') {
    const a = antes as { feedback: string };
    const b = editado as { feedback: string };
    if (a.feedback !== b.feedback) cambios.push('reescribió el feedback');
  }

  if (original.kind === 'dossier') {
    const a = antes as DossierPatch;
    const b = editado as DossierPatch;
    for (const clave of Object.keys(a) as (keyof DossierPatch)[]) {
      if (JSON.stringify(a[clave]) !== JSON.stringify(b[clave])) cambios.push(`reescribió ${clave}`);
    }
  }

  return cambios.length ? cambios.join(' · ') : 'retoques menores';
}

/**
 * Por qué esta propuesta, tal y como está ahora, no se puede aprobar.
 * `null` = se puede.
 *
 * Mira lo que Dani puede haber roto editando: quitar las fases de una
 * periodización, vaciar de ejercicios un día, dejar la escalera con un nivel,
 * o mover el presupuesto de una dieta hasta que deje de cuadrar con lo que hay
 * puesto en las comidas. Todo eso lo valida la IA ANTES de proponer, pero esos
 * validadores no vuelven a correr sobre lo editado: aprobar así no da error en
 * ninguna parte, escribe un plan roto y el atleta se lo encuentra.
 */
export function motivoParaNoAprobar(kind: AiProposal['kind'], payload: AiProposalPayload): string | null {
  if (kind === 'nutritionProgram') {
    const v = payload as NutritionProgramProposalPayload;
    if (v.phases.length === 0) return 'Has quitado todas las fases: no quedaría periodización.';
  }
  if (kind === 'workoutDays') {
    const v = payload as WorkoutDaysProposalPayload;
    const vacios = v.days.filter(d => d.exercises.length === 0).map(d => d.dayIndex + 1);
    if (vacios.length === v.days.length) return 'Todos los días se han quedado sin ejercicios.';
    if (vacios.length) return `Los días ${vacios.join(', ')} se han quedado sin ejercicios.`;
  }
  if (kind === 'levelLadder') {
    const v = payload as LevelLadder;
    if (v.levels.length < 2) return 'Con menos de dos niveles no es una escalera.';
    const sinCriterios = v.levels.filter(l => l.criteria.length === 0).map(l => l.name);
    if (sinCriterios.length) return `Sin criterios, estos niveles se desbloquearían solos: ${sinCriterios.join(', ')}.`;
  }
  if (kind === 'roadmap') {
    const v = payload as RoadmapProposalPayload;
    if (v.items.length === 0) return 'No queda ningún hito que añadir.';
  }
  if (kind === 'diet') {
    const v = payload as Omit<Diet, 'id'>;
    if ((v.meals ?? []).length === 0) return 'La dieta se ha quedado sin comidas.';
    // El mismo margen que usa el validador de la IA: 0.26, por los redondeos
    // de 0.25 repartidos entre varias comidas.
    const colocado = computeDietPlaced(v.meals ?? []);
    const descuadre = BUDGET_CATS
      .filter(cat => Math.abs((colocado[cat] ?? 0) - (v.budget?.[cat] ?? 0)) > 0.26)
      .map(cat => `${cat}: presupuesto ${v.budget?.[cat] ?? 0}, puesto ${colocado[cat] ?? 0}`);
    if (descuadre.length) {
      return `Las comidas ya no cuadran con el presupuesto (${descuadre.join('; ')}). Ábrela en el editor de dietas para recolocarlas.`;
    }
  }

  if (kind === 'workoutDays') {
    const v = payload as WorkoutDaysProposalPayload;
    for (const dia of v.days) {
      for (const ex of dia.exercises) {
        if (!Number.isInteger(ex.sets) || ex.sets < 1 || ex.sets > 10) {
          return `${ex.exerciseName}: ${ex.sets} series no es una serie de trabajo (1 a 10).`;
        }
        if (!Number.isFinite(ex.rir) || ex.rir < 0 || ex.rir > 5) {
          return `${ex.exerciseName}: el RIR va de 0 a 5.`;
        }
        if (!ex.reps.trim()) return `${ex.exerciseName} se ha quedado sin repeticiones.`;
      }
    }
  }

  if (kind === 'mesocycle' || kind === 'periodizationBlock') {
    const meso = kind === 'periodizationBlock'
      ? (payload as PeriodizationBlockPayload).mesocycle
      : (payload as Omit<Mesocycle, 'id'>);
    if (!Number.isInteger(meso.weeks) || meso.weeks < 1 || meso.weeks > 16) return 'Las semanas del bloque van de 1 a 16.';
    if (!Number.isInteger(meso.daysPerWeek) || meso.daysPerWeek < 1 || meso.daysPerWeek > 10) return 'Las sesiones por ciclo van de 1 a 10.';
    const pasado = (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).find(g => (meso.groups?.[g]?.series ?? 0) > 25);
    if (pasado) return `${MUSCLE_LABELS[pasado]} pasa de 25 series semanales.`;
    const total = (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).reduce((s, g) => s + (meso.groups?.[g]?.series ?? 0), 0);
    if (total === 0) return 'El bloque se ha quedado sin series en ningún grupo.';
  }

  if (kind === 'weeklyChallenge') {
    const v = payload as WeeklyChallengeProposalPayload;
    if (!v.title.trim()) return 'El reto se ha quedado sin título.';
    if (!v.description.trim()) return 'El reto se ha quedado sin lo que lee el atleta.';
    if (!(Number(v.metric?.target) > 0)) return 'Un reto con objetivo 0 se cumple solo.';
  }

  if (kind === 'workoutTemplate') {
    const v = payload as WorkoutTemplateProposalPayload;
    if (!v.name.trim()) return 'La plantilla se ha quedado sin nombre.';
    if (v.exercises.length === 0) return 'La plantilla se ha quedado sin ejercicios.';
    const mal = v.exercises.find(e => !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 10);
    if (mal) return `${mal.exerciseName}: ${mal.sets} series no es una serie de trabajo (1 a 10).`;
  }

  if (kind === 'mesocycleTemplate') {
    const v = payload as MesocycleTemplateProposalPayload;
    if (!v.name.trim()) return 'La plantilla se ha quedado sin nombre.';
    if (v.stages.length === 0) return 'La plantilla se ha quedado sin etapas.';
  }

  if (kind === 'setupConfig') {
    const v = payload as SetupConfigProposalPayload;
    const algo = Object.values(v).some(x => x !== undefined);
    if (!algo) return 'No queda nada que configurar.';
  }

  if (kind === 'levelLadder') {
    const v = payload as LevelLadder;
    const sinObjetivo = v.levels
      .flatMap(l => l.criteria)
      .find(c => c.kind !== 'manual' && !(Number(c.targetValue) > 0));
    if (sinObjetivo) return `"${sinObjetivo.label}" se ha quedado sin objetivo: no se cumpliría nunca.`;
  }

  return null;
}

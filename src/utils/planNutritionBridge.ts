// Puente entre las fases del plan (roadmap) y la periodización nutricional:
// las fases del plan mandan — se programan una vez y este módulo genera el
// borrador de NutritionProgram (el coach solo asigna dieta y ajusta kcal en
// NutritionPeriodizationPanel, que no se toca). También calcula el estado de
// peso de la fase actual para el hero del atleta (PhaseHeroCard).

import { PlanPhase, NutritionProgram, NutritionPhase } from '../types';
import { computeActivePhase } from '../dbService';
import { ProjectionResult } from './nutritionPeriodization';

function draftNutritionPhase(planPhase: PlanPhase, startWeightKg: number): NutritionPhase {
  const weeks = planPhase.suggestedWeeks ?? 6;
  const direction = planPhase.weightDirection ?? 'mantenimiento';
  const rate = planPhase.weightRateKgWeek ?? (direction === 'mantenimiento' ? 0 : 0.5);
  const sign = direction === 'deficit' ? -1 : direction === 'superavit' ? 1 : 0;
  const targetWeight = direction === 'mantenimiento'
    ? undefined
    : Math.round((startWeightKg + sign * rate * weeks) * 10) / 10;
  return {
    id: `nph_${planPhase.id}`, // determinista → idempotente al regenerar
    name: planPhase.name,
    weeks,
    dietId: '', // placeholder: resolvePhaseTargetKcal tolera dieta desconocida (source 'none')
    targetWeight,
  };
}

function linkGenerated(planPhases: PlanPhase[], generated: NutritionPhase[]): PlanPhase[] {
  const byId = new Map(generated.map(ph => [ph.id, ph]));
  return planPhases.map(pp => {
    const ph = byId.get(`nph_${pp.id}`);
    return ph ? { ...pp, nutritionPhaseId: ph.id } : pp;
  });
}

export interface BuildProgramDraftParams {
  athleteId: string;
  planPhases: PlanPhase[];
  currentWeightKg: number;
  startDate: string;         // solo se usa en mode 'full'
  existing: NutritionProgram | null;
  mode: 'full' | 'futuras';
  today: string;
}

export interface ProgramDraftResult {
  program: NutritionProgram;
  linkedPlanPhases: PlanPhase[];
}

export function buildNutritionProgramDraft(params: BuildProgramDraftParams): ProgramDraftResult {
  const { athleteId, planPhases, currentWeightKg, startDate, existing, mode, today } = params;
  const relevant = [...planPhases]
    .filter(p => p.status !== 'completada')
    .sort((a, b) => a.order - b.order);

  if (mode === 'full' || !existing) {
    let weight = currentWeightKg;
    const phases: NutritionPhase[] = [];
    for (const pp of relevant) {
      const ph = draftNutritionPhase(pp, weight);
      phases.push(ph);
      weight = ph.targetWeight ?? weight;
    }
    return {
      program: { athleteId, startDate, phases },
      linkedPlanPhases: linkGenerated(planPhases, phases),
    };
  }

  // mode 'futuras': conserva el historial + la fase en curso del programa
  // existente, y regenera solo las NutritionPhases de las fases del plan que
  // sigan 'futura', encadenando el peso desde donde queda el programa actual.
  const activePhase = computeActivePhase(existing, today);
  const activeIdx = activePhase ? existing.phases.findIndex(p => p.id === activePhase.id) : -1;
  const kept = existing.phases.slice(0, activeIdx + 1);
  let weight = kept.length > 0 ? (kept[kept.length - 1].targetWeight ?? currentWeightKg) : currentWeightKg;

  const futurePlanPhases = relevant.filter(p => p.status === 'futura');
  const regenerated: NutritionPhase[] = [];
  for (const pp of futurePlanPhases) {
    const ph = draftNutritionPhase(pp, weight);
    regenerated.push(ph);
    weight = ph.targetWeight ?? weight;
  }

  return {
    program: { ...existing, phases: [...kept, ...regenerated] },
    linkedPlanPhases: linkGenerated(planPhases, regenerated),
  };
}

// ── Estado de peso de la fase actual (para PhaseHeroCard) ─────────────────────

export interface PhaseWeightStatus {
  startKg: number;
  currentKg: number | null;
  targetKg: number | null;
  projectedKg: number | null;
  pct: number;               // avance start→target con el peso real, 0-100
  deltaVsPlanKg: number | null; // real − esperado con adherencia (negativo = mejor en déficit)
}

export function computePhaseWeightStatus(
  projection: ProjectionResult,
  program: NutritionProgram,
  nutritionPhaseId: string,
): PhaseWeightStatus | null {
  const phase = program.phases.find(p => p.id === nutritionPhaseId);
  if (!phase) return null;
  const points = projection.points.filter(p => p.phaseId === nutritionPhaseId);
  if (points.length === 0) return null;

  const startKg = points[0].expected100 ?? projection.startWeightKg;
  if (startKg == null) return null;

  const realPoints = points.filter(p => p.real != null);
  const currentKg = realPoints.length > 0 ? realPoints[realPoints.length - 1].real : null;

  const currentPoint = points.find(p => p.week === projection.currentWeek) ?? points[points.length - 1];
  const projectedKg = currentPoint?.expectedAdherence ?? null;

  const targetKg = phase.targetWeight ?? null;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  let pct = 0;
  if (targetKg != null && currentKg != null) {
    const span = Math.abs(startKg - targetKg);
    const moved = startKg <= targetKg ? currentKg - startKg : startKg - currentKg;
    pct = span > 0 ? clamp((moved / span) * 100) : 100;
  }

  const deltaVsPlanKg = currentPoint?.real != null && currentPoint.expectedAdherence != null
    ? Math.round((currentPoint.real - currentPoint.expectedAdherence) * 10) / 10
    : null;

  return { startKg, currentKg, targetKg, projectedKg, pct, deltaVsPlanKg };
}

import { CoachReport, CoachReportSection, WorkoutLog, Exercise, Mesocycle } from '../types';
import { buildTrainingReport, ComparisonMode, ExercisePerf, MuscleGroupPerf } from './trainingReport';

// Assembles a draft CoachReport from the deterministic engines. The coach then
// edits title/intro, toggles sections and adds notes before sending. Section
// `data` payloads are typed here and consumed read-only by ReportView.

export interface HighlightsSectionData { items: string[]; }
export interface TonnageSectionData {
  current: number;
  previous: number | null;
  deltaPct: number | null;
  sessions: number;
  comparisonLabel: string;
}
export interface PerExerciseSectionData { rows: ExercisePerf[]; }
export interface MuscleSectionData { rows: MuscleGroupPerf[]; }

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fmtReportDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_ES[parseInt(m) - 1]}`;
}

export function buildTrainingReportDraft(params: {
  athleteEmail: string;
  coachId: string;
  logs: WorkoutLog[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
  periodStart: string;
  periodEnd: string;
  comparison: ComparisonMode;
}): CoachReport {
  const tr = buildTrainingReport({
    logs: params.logs,
    exercises: params.exercises,
    mesocycles: params.mesocycles,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    comparison: params.comparison,
  });

  const sections: CoachReportSection[] = [];

  if (tr.highlights.length > 0) {
    sections.push({
      id: 'highlights',
      title: 'Lo más destacado',
      included: true,
      data: { items: tr.highlights } as HighlightsSectionData,
    });
  }

  sections.push({
    id: 'tonnage',
    title: 'Tonelaje total',
    included: true,
    data: {
      current: tr.tonnage.current,
      previous: tr.tonnage.previous,
      deltaPct: tr.tonnage.deltaPct,
      sessions: tr.sessions,
      comparisonLabel: tr.comparisonLabel,
    } as TonnageSectionData,
  });

  sections.push({
    id: 'per-exercise',
    title: 'Desempeño por ejercicio',
    included: true,
    data: { rows: tr.perExercise } as PerExerciseSectionData,
  });

  sections.push({
    id: 'muscle-progression',
    title: 'Progresión por grupo muscular',
    included: true,
    data: { rows: tr.muscleGroups } as MuscleSectionData,
  });

  const now = new Date().toISOString();
  return {
    id: `report_${params.athleteEmail}_${Date.now()}`,
    athleteId: params.athleteEmail,
    coachId: params.coachId,
    kind: 'entrenamiento',
    periodStart: tr.periodStart,
    periodEnd: tr.periodEnd,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    title: `Reporte · ${fmtReportDate(tr.periodStart)}–${fmtReportDate(tr.periodEnd)}`,
    intro: '',
    sections,
  };
}

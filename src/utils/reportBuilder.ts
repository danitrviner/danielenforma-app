import {
  CoachReport, CoachReportSection, WorkoutLog, Exercise, Mesocycle,
  BodyweightLog, WorkoutAssignment, DietCompletionLog, Diet, WeeklyChallenge,
} from '../types';
import { buildTrainingReport, resolveWindows, ComparisonMode, ExercisePerf, MuscleGroupPerf } from './trainingReport';
import {
  computeBodyweightSection, computeAdherenceSection, computeNutritionSection, computeChallengesSection,
  BodyweightSectionData, AdherenceSectionData, NutritionSectionData, ChallengesSectionData,
} from './reportExtras';
import { buildNarrativeIntro } from './reportNarrative';

export type {
  BodyweightSectionData, AdherenceSectionData, NutritionSectionData, ChallengesSectionData,
} from './reportExtras';

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

function fmtDelta(pct: number | null): string {
  if (pct == null) return '—';
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

// Plain-text rendering of a report, for the coach to copy/paste into WhatsApp,
// email, etc. Mirrors ReportView.tsx's per-section formatting but as text —
// keep the two in sync when adding a new section type.
export function buildReportText(report: CoachReport): string {
  const lines: string[] = [];
  lines.push(report.title);
  lines.push(`${fmtReportDate(report.periodStart)} – ${fmtReportDate(report.periodEnd)}`);
  lines.push('');
  if (report.intro.trim()) {
    lines.push(report.intro.trim());
    lines.push('');
  }

  for (const s of report.sections.filter(sec => sec.included)) {
    switch (s.id) {
      case 'highlights': {
        const d = s.data as HighlightsSectionData;
        if (!d.items?.length) break;
        lines.push(`🏆 ${s.title}`);
        d.items.forEach(it => lines.push(`- ${it}`));
        lines.push('');
        break;
      }
      case 'tonnage': {
        const d = s.data as TonnageSectionData;
        lines.push(`📊 ${s.title}`);
        lines.push(`${d.current.toLocaleString('es-ES')} kg (${fmtDelta(d.deltaPct)}${d.previous != null ? ` vs ${d.comparisonLabel}: ${d.previous.toLocaleString('es-ES')} kg` : ''})`);
        lines.push(`${d.sessions} sesión${d.sessions !== 1 ? 'es' : ''} en el periodo`);
        lines.push('');
        break;
      }
      case 'per-exercise': {
        const d = s.data as PerExerciseSectionData;
        if (!d.rows?.length) break;
        lines.push(`💪 ${s.title}`);
        d.rows.forEach(r => {
          lines.push(`- ${r.name}${r.isPR ? ' [PR]' : ''}: ${r.sets} series · ${r.reps} reps · ${r.tonnage.toLocaleString('es-ES')} kg · 1RM est. ${r.bestOrm} kg (${fmtDelta(r.deltaOrmPct)})`);
        });
        lines.push('');
        break;
      }
      case 'muscle-progression': {
        const d = s.data as MuscleSectionData;
        if (!d.rows?.length) break;
        lines.push(`🎯 ${s.title}`);
        d.rows.forEach(r => {
          lines.push(`- ${r.label}: ${r.tonnage.toLocaleString('es-ES')} kg vol. (${fmtDelta(r.tonnageDeltaPct)}) · 1RM medio ${r.meanOrm != null ? `${r.meanOrm} kg` : '—'} (${fmtDelta(r.ormDeltaPct)})`);
        });
        lines.push('');
        break;
      }
      case 'bodyweight': {
        const d = s.data as BodyweightSectionData;
        if (d.endWeight == null) break;
        lines.push(`⚖️ ${s.title}`);
        const deltaTxt = d.deltaKg != null ? ` (${d.deltaKg > 0 ? '+' : ''}${d.deltaKg} kg en el periodo)` : '';
        lines.push(`${d.endWeight.toLocaleString('es-ES')} kg${deltaTxt}${d.targetWeight != null ? ` · objetivo ${d.targetWeight} kg` : ''}`);
        lines.push('');
        break;
      }
      case 'adherence': {
        const d = s.data as AdherenceSectionData;
        if (!d.planned) break;
        lines.push(`✅ ${s.title}`);
        lines.push(`${d.completed} de ${d.planned} sesiones programadas completadas${d.pct != null ? ` (${d.pct}%)` : ''}${d.prevPct != null ? ` · periodo anterior: ${d.prevPct}%` : ''}`);
        lines.push('');
        break;
      }
      case 'nutrition': {
        const d = s.data as NutritionSectionData;
        if (!d.daysLogged) break;
        lines.push(`🥗 ${s.title}`);
        lines.push(`Cumplimiento medio de la dieta: ${d.avgPct}% (${d.daysLogged} día${d.daysLogged !== 1 ? 's' : ''} registrado${d.daysLogged !== 1 ? 's' : ''} de ${d.periodDays})${d.prevAvgPct != null ? ` · antes: ${d.prevAvgPct}%` : ''}`);
        lines.push('');
        break;
      }
      case 'challenges': {
        const d = s.data as ChallengesSectionData;
        if (!d.items?.length) break;
        lines.push(`🎖️ ${s.title}`);
        d.items.forEach(c => {
          const st = c.status === 'conseguido' ? '✔ Conseguido' : c.status === 'fallido' ? '✖ No salió' : 'En marcha';
          lines.push(`- ${c.title}: ${st}${c.progressValue != null ? ` (${c.progressValue}/${c.target} ${c.unit})` : ''}`);
        });
        lines.push('');
        break;
      }
    }
    if (s.coachNote) {
      lines.push(`Nota: ${s.coachNote}`);
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

// Datos opcionales más allá del entrenamiento; cada uno que llegue con datos
// añade su sección al borrador (el coach puede desmarcarla en el editor).
export interface ReportExtrasInput {
  athleteName?: string;
  bodyweightLogs?: BodyweightLog[];
  assignments?: WorkoutAssignment[];
  dietLogs?: DietCompletionLog[];
  diets?: Diet[];
  challenges?: WeeklyChallenge[];
  targetWeight?: number;
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
  extras?: ReportExtrasInput;
}): CoachReport {
  const tr = buildTrainingReport({
    logs: params.logs,
    exercises: params.exercises,
    mesocycles: params.mesocycles,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    comparison: params.comparison,
  });
  const extras = params.extras ?? {};
  // Las secciones extra comparan sobre las mismas ventanas que el entrenamiento.
  const w = resolveWindows(params.periodStart, params.periodEnd, params.comparison, params.mesocycles);

  const bodyweight = extras.bodyweightLogs?.length
    ? computeBodyweightSection(extras.bodyweightLogs, w.curStart, w.curEnd, extras.targetWeight)
    : null;
  const adherence = extras.assignments?.length
    ? computeAdherenceSection(extras.assignments, w.curStart, w.curEnd, w.prevStart, w.prevEnd)
    : null;
  const nutrition = extras.dietLogs?.length && extras.diets?.length
    ? computeNutritionSection(extras.dietLogs, extras.diets, w.curStart, w.curEnd, w.prevStart, w.prevEnd)
    : null;
  const challenges = extras.challenges?.length
    ? computeChallengesSection(extras.challenges, w.curStart, w.curEnd)
    : null;

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

  if (bodyweight && bodyweight.endWeight != null) {
    sections.push({
      id: 'bodyweight',
      title: 'Peso corporal',
      included: true,
      data: bodyweight,
    });
  }

  if (adherence && adherence.planned > 0) {
    sections.push({
      id: 'adherence',
      title: 'Constancia',
      included: true,
      data: adherence,
    });
  }

  if (nutrition && nutrition.daysLogged > 0) {
    sections.push({
      id: 'nutrition',
      title: 'Nutrición',
      included: true,
      data: nutrition,
    });
  }

  if (challenges && challenges.items.length > 0) {
    sections.push({
      id: 'challenges',
      title: 'Retos de la semana',
      included: true,
      data: challenges,
    });
  }

  const intro = buildNarrativeIntro({
    athleteName: extras.athleteName ?? '',
    training: tr,
    bodyweight, adherence, nutrition, challenges,
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
    intro,
    sections,
  };
}

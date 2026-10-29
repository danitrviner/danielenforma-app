// Tools que ESCRIBEN: todas crean una propuesta (`aiProposals`) que Dani
// aprueba, salvo las que dejan hechos en la ficha viva (log_dossier_fact),
// notas para Dani (add_coach_task) y el borrador de reporte. Nada de esto
// llega al atleta sin aprobación.
import { appendDossierFacts, coachActual, createAiProposal, createCoachClientTask, getAthleteNutritionConfig, getBodyweightForAthlete, getCoachClientTasks, getDietCompletionLogsForAthlete, getDietsForAthlete, getExercises, getMesocycles, getNutritionProgram, getQuestionnairesByCoach, getResponsesForAthlete, getRoadmap, getWeeklyChallenge, getWeeklyChallengesForAthlete, getWorkoutAssignments, getWorkoutLogs, getWorkouts, saveCoachReport } from './datos.js';
import { sesionesDeMesociclo, fechasDelMesociclo, cicloDiasDeMeso } from '../../utils/asignacionMesociclo.js';
import { vueltasDelCiclo } from '../../utils/progression.js';
import { repartoDesdeAsistente, sesionesDelReparto } from '../repartoAsistente.js';
import { camposDeCalendario } from '../../utils/reordenarMeso.js';
import { distribucionDeMeso } from '../../utils/distribucionDeMeso.js';
import { totalSemanas as totalSemanasNutri } from '../../utils/semanasNutricion.js';
import { normalizarTexto as normTexto } from '../../utils/busqueda.js';
import { nombreDeMeso } from '../../utils/nombresMeso.js';
import type { LevelLadder, LadderLevel, LevelCriterionKind, WorkoutDayProposal, WorkoutDaysProposalPayload, RoadmapItem, NutritionPhaseProposal, NutritionProgramProposalPayload, RoadmapProposalPayload, SpecialDayProposalPayload, SpecialDayKind, WeekPlanProposalPayload, MacroAjustable } from '../../types.js';
import { PROTOCOLOS_VO2MAX } from '../../utils/cardioProgression.js';
import type { SetupConfigProposalPayload, PublishBlockProposalPayload, WeeklyChallengeProposalPayload, WorkoutTemplateProposalPayload, MesocycleTemplateProposalPayload, MesocycleTemplateStageProposal, WorkoutDayExerciseProposal, QSchedule, WeekDay, ChallengeKind } from '../../types.js';
import { isoWeekKey } from '../../utils/challengeOptions.js';
import { OBJETIVOS_ORDEN, ObjetivoCorporalTipo } from '../../utils/verificacionObjetivo.js';
import { phaseTypeDeObjetivo } from '../../utils/objetivoDeFase.js';
import { buildTrainingReportDraft } from '../../utils/reportBuilder.js';
import { objetivoDeDieta, objetivoYCupo } from '../../utils/macrosLegado.js';
import { ajusteEnGramos } from '../../utils/semanasNutricion.js';
import { GRAMS_PER_EXCHANGE } from '../../utils/nutritionConstants.js';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek.js';
import { leerDietaPropuesta, DietUpdatePayload, validateMesocyclePayload, avisosDeMesociclo, revisarObjetivoNutricional, MesocycleProposalPayload, validateNutritionPhases, validateWorkoutDays, claveDeEjercicio, WorkoutDayInput, WorkoutExerciseInput, validateLevelLadder, LadderLevelInput, LadderCriterionInput } from '../validators.js';
import { Diet, Macros, Mesocycle, MuscleGroup, MuscleGroupConfig, MUSCLE_LABELS, PeriodizationBlockPayload, ProposalExpediente, DossierFact, DossierPatch } from '../../types.js';
import { cambiosDeMesociclo, cambiosDeDieta, cambiosDePeriodizacion } from '../cambiosPropuesta.js';
import { alimentosDelBancoDelCoach, contextoNutricional, findProfile, textoDeObjetivo, toResult } from './comunes.js';

export async function generateReportDraft(email: string, periodDaysInput: number, introOverride?: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });
  const coachId = (coachActual().uid || undefined);
  if (!coachId) return toResult({ error: 'Sesión de coach no disponible' });

  const [logs, exercises, mesos, assignments, bwLogs, dietLogs, diets, challenges] = await Promise.all([
    getWorkoutLogs(email),
    getExercises(),
    getMesocycles(email),
    getWorkoutAssignments({ uid: profile.userId, email: profile.email }),
    getBodyweightForAthlete(email),
    getDietCompletionLogsForAthlete(email),
    getDietsForAthlete(email),
    getWeeklyChallengesForAthlete(email),
  ]);
  if (logs.length === 0) {
    return toResult({ error: 'Este cliente no tiene entrenamientos registrados; no se puede generar un reporte.' });
  }

  const periodDays = periodDaysInput === 14 ? 14 : 7;
  const periodEnd = hoyIsoLocal();
  const periodStart = addDays(periodEnd, -(periodDays - 1));
  const comparisonWeeks = periodDays === 14 ? 2 : 1;

  const draft = buildTrainingReportDraft({
    athleteEmail: email,
    coachId,
    logs, exercises, mesocycles: mesos,
    periodStart, periodEnd,
    comparison: { mode: 'weeks', n: comparisonWeeks },
    extras: {
      // Aquí NO se pone alias, y es a propósito: esto alimenta al motor de
      // reportes LOCAL, cuyo texto lo va a leer el atleta («Marta, esta semana
      // has…»), y `reportNarrative` se queda solo con el nombre de pila. Lo que
      // vuelve al modelo es `introUsed`, que ya solo lleva ese nombre de pila.
      athleteName: profile.displayName,
      assignments, bodyweightLogs: bwLogs, dietLogs, diets, challenges,
      targetWeight: profile.targetWeight || undefined,
    },
  });
  if (introOverride?.trim()) draft.intro = introOverride.trim();
  draft.status = 'draft'; // defensivo: nunca lo marca como enviado

  await saveCoachReport(draft);
  return toResult({
    reportId: draft.id,
    title: draft.title,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    sectionsIncluded: draft.sections.filter(s => s.included).map(s => s.id),
    introUsed: draft.intro,
    note: 'Borrador guardado (draft). El atleta no lo ve hasta que Dani lo revise y lo envíe desde Análisis > Reportes.',
  });
}

/* ── El resto del plan ─────────────────────────────────────────────────────
   El entreno concreto lo sigue montando Dani. Esto es lo demás: los hitos que
   el atleta ve venir, las fases de nutrición encadenadas y los días señalados.
   Todo pasa por propuesta: al aprobar, el atleta lo ve inmediatamente. */

export async function proposeRoadmapItems(
  athleteEmail: string, itemsInput: Partial<RoadmapItem>[], rationale: string, chatId: string, expediente?: ProposalExpediente,
): Promise<string> {
  const items: RoadmapItem[] = itemsInput
    .filter(i => typeof i.title === 'string' && i.title.trim())
    .map((i, idx) => ({
      id: `rmi_${Date.now()}_${idx}`,
      title: (i.title as string).trim(),
      description: i.description,
      type: i.type ?? 'hito',
      lane: i.lane ?? 'general',
      startDate: i.startDate,
      targetDate: i.targetDate,
      status: 'pendiente',
    }));
  if (items.length === 0) return toResult({ error: 'Ningún hito con título' });

  const payload: RoadmapProposalPayload = { items };
  const summary = items.length === 1
    ? `Hito: ${items[0].title}${items[0].targetDate ? ` (${items[0].targetDate})` : ''}`
    : `${items.length} hitos nuevos en el roadmap`;
  const proposal = await createAiProposal({
    athleteId: athleteEmail, kind: 'roadmap', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload,
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({ proposalCreated: true, proposalId: proposal.id, note: 'El atleta los verá en su roadmap en cuanto Dani apruebe.' });
}

// La escalera de niveles. Reemplaza la que hubiera, pero conserva
// `achievedLevelIds`: si el atleta ya subió a "Hombre Sano", cambiar los
// criterios no puede quitárselo — eso es lo único que la escalera promete.
export async function proposeLevelLadder(
  athleteEmail: string, nivelesInput: LadderLevelInput[], rationale: string, chatId: string,
): Promise<string> {
  const profile = await findProfile(athleteEmail);
  if (!profile) return toResult({ valid: false, issues: [{ field: 'athlete_email', message: `No existe ningún cliente con email ${athleteEmail}` }] });

  const issues = validateLevelLadder(nivelesInput);
  if (issues.length > 0) {
    return toResult({ valid: false, issues, note: 'Corrige esto y vuelve a llamar a propose_level_ladder.' });
  }

  const roadmap = await getRoadmap(athleteEmail);
  const logrados = roadmap?.levelLadder?.achievedLevelIds ?? {};

  const base = Date.now();
  const levels: LadderLevel[] = nivelesInput.map((n, i) => {
    const nombre = (n.name as string).trim();
    // Id estable por nombre: si Dani vuelve a proponer la misma escalera con un
    // criterio distinto, el nivel ya conseguido sigue siendo el mismo nivel.
    const slug = claveDeEjercicio(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = slug ? `lvl-${slug}` : `lvl-${base}-${i}`;
    return {
      id,
      order: i,
      name: nombre,
      icon: typeof n.icon === 'string' && n.icon.trim() ? n.icon.trim() : 'military_tech',
      criteria: (n.criteria as LadderCriterionInput[]).map((c, j) => ({
        id: `${id}-c${j}`,
        kind: c.kind as LevelCriterionKind,
        label: (c.label as string).trim(),
        ...(c.kind !== 'manual' ? { targetValue: Number(c.target_value) } : {}),
        ...(typeof c.exercise_name_match === 'string' && c.exercise_name_match.trim()
          ? { exerciseNameMatch: c.exercise_name_match.trim() } : {}),
      })),
    };
  });

  const payload: LevelLadder = { levels, ...(Object.keys(logrados).length ? { achievedLevelIds: logrados } : {}) };
  const summary = `Escalera de ${levels.length} niveles: ${levels.map(l => l.name).join(' → ')}`;
  const proposal = await createAiProposal({
    athleteId: athleteEmail, kind: 'levelLadder', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload,
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    nivelesConservados: Object.keys(logrados).length || undefined,
    note: 'El atleta la verá en su road map en cuanto Dani apruebe. Los niveles que ya tenía conseguidos se conservan.',
  });
}

export async function proposeNutritionProgram(
  athleteEmail: string,
  startDate: string | undefined,
  fasesInput: Record<string, unknown>[],
  refeedsInput: Record<string, unknown>[],
  rationale: string,
  chatId: string,
  expediente?: ProposalExpediente,
): Promise<string> {
  if (fasesInput.length === 0) return toResult({ error: 'La periodización necesita al menos una fase' });

  const [dietasDelAtleta, alimentosDelCoach, contexto] = await Promise.all([
    getDietsForAthlete(athleteEmail),
    alimentosDelBancoDelCoach(athleteEmail),
    contextoNutricional(athleteEmail),
  ]);
  const avisos: string[] = [];

  // La validación vive en validators.ts, con sus tests: aquí solo se construye.
  const issues = validateNutritionPhases(fasesInput, dietasDelAtleta.map(d => d.id));
  if (issues.length) {
    return toResult({ valid: false, issues, note: 'Corrige y vuelve a llamar a propose_nutrition_program.' });
  }

  const fases: NutritionPhaseProposal[] = [];
  const problemas: string[] = [];

  fasesInput.forEach((f, i) => {
    const nombre = typeof f.name === 'string' ? f.name.trim() : '';
    const semanas = Number(f.weeks);
    if (!nombre || !Number.isFinite(semanas) || semanas <= 0) {
      problemas.push(`Fase ${i + 1}: falta name o weeks`);
      return;
    }
    const objetivoValido = typeof f.objetivo === 'string' && (OBJETIVOS_ORDEN as string[]).includes(f.objetivo)
      ? f.objetivo as ObjetivoCorporalTipo : undefined;
    const fase: NutritionPhaseProposal = {
      name: nombre,
      weeks: Math.round(semanas),
      phaseType: typeof f.phase_type === 'string' ? f.phase_type as NutritionPhaseProposal['phaseType']
        : objetivoValido ? phaseTypeDeObjetivo(objetivoValido) : undefined,
      objetivo: objetivoValido,
      targetKcal: Number.isFinite(Number(f.target_kcal)) ? Number(f.target_kcal) : undefined,
      targetWeight: Number.isFinite(Number(f.target_weight)) ? Number(f.target_weight) : undefined,
    };

    if (typeof f.diet_id === 'string' && f.diet_id) {
      if (!dietasDelAtleta.some(d => d.id === f.diet_id)) {
        problemas.push(`Fase "${nombre}": la dieta ${f.diet_id} no es de este atleta`);
        return;
      }
      fase.dietId = f.diet_id;
    } else if (f.diet && typeof f.diet === 'object') {
      const bruta = f.diet as DietUpdatePayload & { name?: string };
      if (!bruta.name) {
        problemas.push(`Fase "${nombre}": la dieta necesita name`);
        return;
      }
      const leida = leerDietaPropuesta(bruta, alimentosDelCoach);
      if (leida.issues.length || !leida.objetivo) {
        problemas.push(`Fase "${nombre}": ${leida.issues.map(x => x.message).join(' · ')}`);
        return;
      }
      const revision = revisarObjetivoNutricional(leida.objetivo, { ...contexto, objetivoFase: objetivoValido });
      if (revision.issues.length) {
        problemas.push(`Fase "${nombre}": ${revision.issues.map(x => x.message).join(' · ')}`);
        return;
      }
      avisos.push(...revision.avisos.map(a => `Fase "${nombre}": ${a}`));
      fase.diet = dietaDePropuesta(athleteEmail, bruta.name, leida.objetivo, leida.meals, `${i}_`);
    } else {
      problemas.push(`Fase "${nombre}": necesita diet_id (dieta existente) o diet (dieta nueva)`);
      return;
    }
    fases.push(fase);
  });

  if (problemas.length) {
    return toResult({ valid: false, issues: problemas, note: 'Corrige y vuelve a llamar a propose_nutrition_program.' });
  }

  const payload: NutritionProgramProposalPayload = {
    startDate: startDate?.trim() || hoyIsoLocal(),
    phases: fases,
    refeedDays: refeedsInput
      .filter(r => typeof r.date === 'string')
      .map(r => ({ date: r.date as string, note: typeof r.note === 'string' ? r.note : undefined })),
  };

  const semanas = fases.reduce((t, f) => t + f.weeks, 0);
  const nuevas = fases.filter(f => f.diet).length;
  const summary = `Periodización nutricional: ${fases.length} fases / ${semanas} semanas (${fases.map(f => f.name).join(' → ')})`
    + (nuevas ? ` · ${nuevas} dieta${nuevas !== 1 ? 's' : ''} nueva${nuevas !== 1 ? 's' : ''}` : '')
    + (payload.refeedDays?.length ? ` · ${payload.refeedDays.length} recarga(s)` : '');

  const cambios = cambiosDePeriodizacion(await getNutritionProgram(athleteEmail), payload);
  const proposal = await createAiProposal({
    athleteId: athleteEmail, kind: 'nutritionProgram', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload,
    ...(cambios.length ? { cambios } : {}),
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true, proposalId: proposal.id,
    ...(avisos.length ? { avisos } : {}),
    note: 'Al aprobar se crean las dietas nuevas y se reemplaza la periodización anterior.',
  });
}

const numeros = (v: unknown): number[] => Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).map(Math.round) : [];

export async function proposeWeekPlan(
  athleteEmail: string, input: Record<string, unknown>, rationale: string, chatId: string, expediente?: ProposalExpediente,
): Promise<string> {
  const payload: WeekPlanProposalPayload = {};
  const partes: string[] = [];
  const errores: string[] = [];
  const hoy = hoyIsoLocal();

  const quiereEntreno = ['semanas_descarga', 'semanas_test', 'rir', 'series', 'cambios'].some(k => input[k] !== undefined);
  if (quiereEntreno) {
    const mesos = await getMesocycles(athleteEmail);
    const meso = typeof input.mesocycle_id === 'string'
      ? mesos.find(m => m.id === input.mesocycle_id)
      : [...mesos].sort((a, b) => b.startDate.localeCompare(a.startDate)).find(m => m.startDate <= hoy) ?? mesos[mesos.length - 1];
    if (!meso) return toResult({ error: 'El atleta no tiene mesociclos: crea el mesociclo antes de programar sus semanas.' });
    const vueltas = vueltasDelCiclo(meso.weeks, cicloDiasDeMeso(meso));
    const fuera = (s: number) => s < 1 || s > vueltas;
    payload.mesocycleId = meso.id;
    payload.mesocycleName = nombreDeMeso(meso);
    const desc = numeros(input.semanas_descarga);
    const test = numeros(input.semanas_test);
    if ([...desc, ...test].some(fuera)) errores.push(`Las semanas del mesociclo van de 1 a ${vueltas}.`);
    if (desc.length) { payload.semanasDescarga = desc; partes.push(`descarga en ${desc.map(s => `S${s}`).join(', ')}`); }
    if (test.length) { payload.semanasTest = test; partes.push(`test en ${test.map(s => `S${s}`).join(', ')}`); }
    const rir = input.rir as { desde?: number; hasta?: number } | undefined;
    if (rir && typeof rir.desde === 'number' && typeof rir.hasta === 'number') {
      payload.rir = { desde: Math.round(rir.desde), hasta: Math.round(rir.hasta) };
      partes.push(`RIR ${payload.rir.desde} → ${payload.rir.hasta}`);
    }
    const series = input.series as { cada?: number; hasta?: number } | undefined;
    if (series && typeof series.cada === 'number' && typeof series.hasta === 'number') {
      payload.series = { cada: Math.max(1, Math.round(series.cada)), hasta: Math.min(vueltas, Math.round(series.hasta)) };
      partes.push(`+1 serie cada ${payload.series.cada} semanas hasta la S${payload.series.hasta}`);
    }
    if (Array.isArray(input.cambios) && input.cambios.length > 0) {
      const [workouts, catalogo] = await Promise.all([getWorkouts(), getExercises()]);
      const delMeso = workouts.filter(w => w.mesocycleId === meso.id);
      const nombre = (id: string) => catalogo.find(e => e.id === id)?.name ?? id;
      payload.cambios = [];
      for (const c of input.cambios as Record<string, unknown>[]) {
        const buscado = typeof c.ejercicio === 'string' ? normTexto(c.ejercicio) : '';
        const semana = typeof c.semana === 'number' ? Math.round(c.semana) : NaN;
        if (!buscado || !Number.isFinite(semana) || fuera(semana)) { errores.push(`Cambio mal formado o fuera del mesociclo: ${JSON.stringify(c)}`); continue; }
        let encontrado: { workoutId: string; exerciseId: string } | null = null;
        for (const w of delMeso) {
          const we = w.exercises.find(e => normTexto(nombre(e.exerciseId)).includes(buscado) || buscado.includes(normTexto(nombre(e.exerciseId))));
          if (we) { encontrado = { workoutId: w.id, exerciseId: we.exerciseId }; break; }
        }
        if (!encontrado) { errores.push(`«${c.ejercicio}» no está en las rutinas de ${nombreDeMeso(meso)}.`); continue; }
        const bloques = Array.isArray(c.bloques)
          ? (c.bloques as Record<string, unknown>[]).map(b => ({
              ...(typeof b.etiqueta === 'string' ? { label: b.etiqueta } : {}),
              sets: Number(b.series) || 1, reps: String(b.reps ?? ''), rir: Number(b.rir) || 0,
            }))
          : undefined;
        payload.cambios.push({
          ...encontrado, ejercicio: nombre(encontrado.exerciseId), semana,
          ...(c.solo === true ? { solo: true } : {}),
          ...(typeof c.series === 'number' ? { sets: Math.round(c.series) } : {}),
          ...(typeof c.reps === 'string' ? { reps: c.reps } : {}),
          ...(typeof c.rir === 'number' ? { rir: Math.round(c.rir) } : {}),
          ...(typeof c.descanso_seg === 'number' ? { restSeconds: Math.round(c.descanso_seg) } : {}),
          ...(bloques?.length ? { bloques } : {}),
        });
      }
      if (payload.cambios.length) partes.push(`${payload.cambios.length} cambio${payload.cambios.length === 1 ? '' : 's'} de ejercicio`);
    }
  }

  const nut = input.nutricion as Record<string, unknown> | undefined;
  if (nut && typeof nut === 'object') {
    const programa = await getNutritionProgram(athleteEmail);
    if (!programa) return toResult({ error: 'El atleta no tiene periodización nutricional: propón primero propose_nutrition_program.' });
    const n = totalSemanasNutri(programa);
    const fuera = (s: number) => s < 1 || s > n;
    payload.nutricion = {};
    if (Array.isArray(nut.ajustes)) {
      payload.nutricion.ajustes = (nut.ajustes as Record<string, unknown>[])
        // En gramos del macro; `delta` (intercambios) solo llega de chats viejos.
        .map(a => ({
          a,
          gramos: Math.round(typeof a.gramos === 'number' ? a.gramos
            : typeof a.delta === 'number' && ['HC', 'PROT', 'GRASA'].includes(String(a.macro)) ? a.delta * GRAMS_PER_EXCHANGE[a.macro as MacroAjustable] : 0),
        }))
        .filter(({ a, gramos }) => typeof a.semana === 'number' && ['HC', 'PROT', 'GRASA'].includes(String(a.macro)) && Number.isFinite(gramos) && gramos !== 0)
        .map(({ a, gramos }) => ({
          semana: Math.round(a.semana as number),
          ...ajusteEnGramos(a.macro as MacroAjustable, gramos, typeof a.franja === 'number' ? Math.round(a.franja) : undefined),
          ...(a.solo === true ? { solo: true } : {}),
        }));
      if (payload.nutricion.ajustes.some(a => fuera(a.semana))) errores.push(`Las semanas de la periodización van de 1 a ${n}.`);
      if (payload.nutricion.ajustes.length) partes.push(`${payload.nutricion.ajustes.length} ajuste${payload.nutricion.ajustes.length === 1 ? '' : 's'} de dieta`);
    }
    const mant = numeros(nut.semanas_mantenimiento);
    if (mant.length) { payload.nutricion.semanasMantenimiento = mant; partes.push(`mantenimiento en ${mant.map(s => `S${s}`).join(', ')}`); }
    if (Array.isArray(nut.suplementos)) {
      payload.nutricion.suplementos = (nut.suplementos as Record<string, unknown>[])
        .filter(x => typeof x.nombre === 'string' && x.nombre.trim())
        .map(x => ({
          nombre: String(x.nombre).trim(),
          ...(typeof x.dosis === 'string' ? { dosis: x.dosis } : {}),
          ...(typeof x.momento === 'string' ? { momento: x.momento } : {}),
          ...(typeof x.desde === 'number' ? { desde: Math.round(x.desde) } : {}),
          ...(typeof x.hasta === 'number' ? { hasta: Math.round(x.hasta) } : {}),
        }));
      if (payload.nutricion.suplementos.length) partes.push(`suplementación: ${payload.nutricion.suplementos.map(x => x.nombre).join(', ')}`);
    }
    if (Array.isArray(nut.pasos_por_semana)) {
      payload.nutricion.pasosPorSemana = (nut.pasos_por_semana as Record<string, unknown>[])
        .filter(x => typeof x.semana === 'number' && typeof x.pasos === 'number')
        .map(x => ({ semana: Math.round(x.semana as number), pasos: Math.round(x.pasos as number) }));
      if (payload.nutricion.pasosPorSemana.length) partes.push('pasos por semana');
    }
  }

  if (errores.length) return toResult({ error: errores.join(' ') });
  if (partes.length === 0) return toResult({ error: 'No hay nada que programar: manda al menos una descarga, RIR, series, cambio o ajuste de nutrición.' });

  const summary = `Semanas del bloque: ${partes.join(' · ')}`;
  const proposal = await createAiProposal({
    athleteId: athleteEmail, kind: 'weekPlan', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload,
    ...(payload.mesocycleId ? { baseEntityId: payload.mesocycleId } : {}),
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({ proposalCreated: true, proposalId: proposal.id, summary });
}

export async function proposeSpecialDay(
  athleteEmail: string, date: string, kind: string, title: string, athleteNote: string,
  description: string | undefined, rationale: string, chatId: string, expediente?: ProposalExpediente,
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toResult({ error: 'date debe ser YYYY-MM-DD' });
  if (!title.trim() || !athleteNote.trim()) return toResult({ error: 'Faltan title o athlete_note' });

  // La consulta de asignaciones exige las DOS claves (email y uid): con solo el
  // email devolvería cero documentos sin dar error — ver src/db/clavesDeAtleta.ts.
  // `findProfile` además compara el email sin distinguir mayúsculas, cosa que el
  // `===` de antes no hacía: un atleta dado de alta con una mayúscula se quedaba
  // sin perfil aquí y su día señalado salía sin nota sobre el entreno.
  const perfil = await findProfile(athleteEmail);
  const asignaciones = perfil
    ? await getWorkoutAssignments({ uid: perfil.userId, email: perfil.email })
    : [];
  const hayEntreno = asignaciones.some(a => a.date === date);

  const payload: SpecialDayProposalPayload = {
    date,
    kind: (['amrap', 'marcas', 'subida', 'otro'].includes(kind) ? kind : 'otro') as SpecialDayKind,
    title: title.trim(),
    athleteNote: athleteNote.trim(),
    description: description?.trim() || undefined,
  };
  const summary = `Día señalado ${date}: ${payload.title}`;
  const proposal = await createAiProposal({
    athleteId: athleteEmail, kind: 'specialDay', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload,
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    entrenoEseDia: hayEntreno,
    note: hayEntreno
      ? 'Al aprobar: hito en su roadmap + tarea con fecha + la nota encima de su entreno de ese día.'
      : 'OJO: ese día no tiene entreno asignado, así que la nota no tendrá dónde salir. Se creará el hito y la tarea igual. Si querías que cayera en un día de entreno, propón otra fecha.',
  });
}

/* ── Ficha viva ────────────────────────────────────────────────────────────
   Los HECHOS los escribe la IA sola; los JUICIOS (objetivos, evaluación, foco)
   solo cambian con el OK de Dani, vía propose_dossier_update. Proponer algo es
   un hecho, así que se apunta aquí y no hace falta que el modelo lo recuerde. */

async function registrarPropuesta(email: string, proposalId: string, chatId: string, summary: string): Promise<void> {
  try {
    await appendDossierFacts(email, [{ at: new Date().toISOString(), kind: 'propuesta', text: summary, proposalId, chatId }]);
  } catch (err) {
    // La ficha es memoria, no el producto: si falla, la propuesta ya existe y
    // tumbar la tool por esto sería peor que perder una línea de historial.
    console.warn('No se pudo apuntar la propuesta en la ficha del atleta:', err);
  }
}

/** Lee del input de la tool los cuatro campos del expediente, si vienen. */
export function leerExpediente(input: Record<string, unknown>): ProposalExpediente | undefined {
  const datos = typeof input.expediente_datos === 'string' ? input.expediente_datos.trim() : '';
  const huecos = typeof input.expediente_huecos === 'string' ? input.expediente_huecos.trim() : '';
  const esperado = typeof input.expediente_esperado === 'string' ? input.expediente_esperado.trim() : '';
  const preguntas = Array.isArray(input.expediente_preguntas)
    ? input.expediente_preguntas.filter((x): x is string => typeof x === 'string')
    : [];
  if (!datos && !huecos && !esperado && preguntas.length === 0) return undefined;
  return { datos, huecos, esperado, preguntas };
}

export async function apuntarHecho(email: string, kind: string, text: string, chatId: string): Promise<string> {
  const tipo: DossierFact['kind'] = kind === 'cambio' ? 'cambio' : 'observacion';
  await appendDossierFacts(email, [{ at: new Date().toISOString(), kind: tipo, text: text.trim(), chatId }]);
  return toResult({ apuntado: true, note: 'Queda en la ficha del atleta, visible para Dani en el ClientHub.' });
}

export async function proposeDossierUpdate(
  athleteEmail: string, patch: DossierPatch, rationale: string, chatId: string,
): Promise<string> {
  const campos = Object.keys(patch);
  if (campos.length === 0) return toResult({ error: 'No has mandado ningún campo que cambiar' });
  const etiquetas: Record<string, string> = {
    objetivos: 'objetivos', evaluacion: 'evaluación', esperado: 'qué esperamos',
    foco: 'foco de la revisión', preguntasAbiertas: 'preguntas abiertas',
  };
  const summary = `Ficha del atleta: ${campos.map(c => etiquetas[c] ?? c).join(', ')}`;
  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'dossier',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload: patch,
    createdAt: new Date().toISOString(),
  });
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    note: 'Propuesta de ficha creada. No cambia nada hasta que Dani la apruebe en el panel.',
  });
}

export async function draftCheckinFeedback(
  checkInId: string, athleteEmail: string, feedback: string, rationale: string, chatId: string,
  expediente?: ProposalExpediente,
): Promise<string> {
  if (!checkInId || !athleteEmail || !feedback.trim()) {
    return toResult({ error: 'Faltan check_in_id, athlete_email o feedback' });
  }
  const summary = feedback.length > 90 ? `${feedback.slice(0, 87)}…` : feedback;
  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'checkinFeedback',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload: { checkInId, feedback: feedback.trim() },
    baseEntityId: checkInId,
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    note: 'Propuesta creada. Dani la revisa y aprueba desde el panel del asistente antes de que el atleta la vea.',
  });
}

/** La dieta que se guarda al aprobar: el objetivo en kcal y gramos y, para los
 *  binarios viejos, su cupo en intercambios equivalente. */
/** La respuesta a una revisión (cuestionario): el canal que de verdad usa el
 *  atleta desde 10-2026. La respuesta de cuestionario tiene que existir y ser
 *  suya; si ya tiene respuesta del coach, se dice (se sobrescribiría). */
export async function proposeRespuestaRevision(
  athleteEmail: string, responseId: string, texto: string, rationale: string, chatId: string,
  expediente?: ProposalExpediente,
): Promise<string> {
  const limpio = texto.trim();
  if (!responseId || !athleteEmail || !limpio) return toResult({ valid: false, issues: ['Faltan athlete_email, response_id o texto'] });
  if (/\b(IA|inteligencia artificial|asistente)\b/i.test(limpio)) {
    return toResult({ valid: false, issues: ['El texto no puede mencionar al asistente ni a la IA: lo firma Dani.'] });
  }
  const respuesta = (await getResponsesForAthlete(athleteEmail)).find(r => r.id === responseId);
  if (!respuesta) return toResult({ valid: false, issues: [`No hay ninguna respuesta de cuestionario ${responseId} de este atleta (mira get_client_brief).`] });
  const avisos: string[] = [];
  if (respuesta.respuestaCoach?.texto) avisos.push('Esa revisión ya tiene respuesta de Dani: al aprobar se sustituiría.');
  const summary = `Respuesta a su revisión del ${respuesta.submittedAt.slice(0, 10)}: «${limpio.length > 80 ? `${limpio.slice(0, 77)}…` : limpio}»`;
  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'respuestaRevision',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload: { responseId, texto: limpio, submittedAt: respuesta.submittedAt },
    baseEntityId: responseId,
    paraAtleta: limpio,
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true, proposalId: proposal.id,
    ...(avisos.length ? { avisos } : {}),
    note: 'Propuesta creada. Dani la revisa y la envía desde el panel; el atleta la lee en su revisión.',
  });
}

function dietaDePropuesta(
  athleteEmail: string, name: string, objetivo: Macros,
  meals: { name: string; items: Diet['meals'][number]['items'] }[], prefijoId = '',
): Omit<Diet, 'id'> {
  return {
    athleteId: athleteEmail,
    name,
    ...objetivoYCupo(objetivo),
    meals: meals.map((m, i) => ({ id: `meal_${Date.now()}_${prefijoId}${i}`, name: m.name, items: m.items })),
  };
}

export async function proposeDietUpdate(
  athleteEmail: string,
  baseDietId: string | undefined,
  name: string,
  propuesta: DietUpdatePayload,
  rationale: string,
  chatId: string,
  expediente?: ProposalExpediente,
): Promise<string> {
  const [banco, contexto] = await Promise.all([alimentosDelBancoDelCoach(athleteEmail), contextoNutricional(athleteEmail)]);
  const leida = leerDietaPropuesta(propuesta, banco);
  if (leida.issues.length > 0 || !leida.objetivo) {
    return toResult({ valid: false, issues: leida.issues, note: 'Corrige estos problemas y vuelve a llamar a propose_diet_update.' });
  }
  // Doctrina en código (28-10-2026): proteína y grasa por kg, techo de déficit.
  // Antes solo se acotaban las kcal entre 600 y 7.000 y el asistente proponía
  // 2,9 g/kg de proteína o 0,4 g/kg de grasa sin que nada lo parase.
  const revision = revisarObjetivoNutricional(leida.objetivo, contexto);
  if (revision.issues.length > 0) {
    return toResult({ valid: false, issues: revision.issues, note: 'Corrige el objetivo y vuelve a llamar a propose_diet_update.' });
  }

  const kcal = Math.round(leida.objetivo.kcal);

  let baseSummary = '';
  let base: Diet | undefined;
  if (baseDietId) {
    base = (await getDietsForAthlete(athleteEmail)).find(d => d.id === baseDietId);
    if (base) {
      const prevKcal = Math.round(objetivoDeDieta(base).kcal);
      baseSummary = ` (ajuste de "${base.name}": ${prevKcal} → ${kcal} kcal)`;
    }
  }
  const dietPayload = dietaDePropuesta(athleteEmail, name, leida.objetivo, leida.meals);
  // Un ajuste del objetivo sobre una dieta que ya tiene comidas colocadas las
  // conserva: la propuesta solo trae comidas si el asistente las ha escrito.
  if (base && leida.meals.length === 0 && (base.meals?.length ?? 0) > 0) dietPayload.meals = base.meals;
  const cambios = cambiosDeDieta(base, dietPayload);

  const summary = `Dieta "${name}"${baseSummary || ' (nueva)'} · ${textoDeObjetivo(dietPayload)}`;
  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'diet',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload: dietPayload,
    ...(cambios.length ? { cambios } : {}),
    baseEntityId: baseDietId,
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    kcal,
    ...(revision.avisos.length ? { avisos: revision.avisos } : {}),
    note: 'Propuesta creada. Dani la revisa y aprueba desde el panel del asistente antes de que el atleta la vea.',
  });
}

export async function proposeMesocycle(
  athleteEmail: string,
  weeks: number,
  daysPerWeek: number,
  objective: string,
  groupsInput: MesocycleProposalPayload['groups'],
  startDate: string | undefined,
  rationale: string,
  chatId: string,
  expediente?: ProposalExpediente,
  repartoInput?: unknown,
): Promise<string> {
  const issues = validateMesocyclePayload({ weeks, daysPerWeek, objective, groups: groupsInput });
  const { reparto, issues: issuesReparto } = repartoDesdeAsistente(repartoInput);
  issues.push(...issuesReparto);
  if (reparto && sesionesDelReparto(reparto) !== daysPerWeek) {
    issues.push({ field: 'days_per_week', message: `El reparto tiene ${sesionesDelReparto(reparto)} sesiones y days_per_week dice ${daysPerWeek}: tienen que coincidir.` });
  }
  if (issues.length > 0) {
    return toResult({ valid: false, issues, note: 'Corrige estos problemas y vuelve a llamar a propose_mesocycle.' });
  }
  const avisos = avisosDeMesociclo({ weeks, daysPerWeek, objective, groups: groupsInput });

  const profile = await findProfile(athleteEmail);
  if (!profile) return toResult({ valid: false, issues: [{ field: 'athlete_email', message: `No existe ningún cliente con email ${athleteEmail}` }] });

  const existing = await getMesocycles(athleteEmail);
  // Tras borrar un mesociclo, `length + 1` repetía número (B14, 26-10-2026).
  const number = Math.max(0, ...existing.map(m => m.number ?? 0)) + 1;

  // Rellena todos los grupos: los omitidos van a 0 series (shape completo que
  // espera el editor de la app).
  const groups = Object.fromEntries(
    (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).map(g => {
      const cfg = groupsInput[g];
      return [g, { series: cfg?.series ?? 0, priority: cfg?.priority ?? 'media' }];
    })
  ) as Record<MuscleGroup, MuscleGroupConfig>;

  const payload: Omit<Mesocycle, 'id'> = {
    athleteId: athleteEmail,
    number,
    weeks,
    startDate: startDate?.trim() || hoyIsoLocal(),
    objective,
    daysPerWeek,
    groups,
  };
  // Con reparto: el calendario sale de él y la distribución se calcula ya, la
  // misma que daría «Distribución automática» en el editor.
  if (reparto) {
    const { cycleDays } = camposDeCalendario(reparto);
    payload.reparto = reparto;
    if (cycleDays !== undefined) payload.cycleDays = cycleDays;
    payload.distribution = distribucionDeMeso({ ...payload, id: '' });
  }

  const trained = (Object.keys(MUSCLE_LABELS) as MuscleGroup[])
    .filter(g => groups[g].series > 0)
    .map(g => `${MUSCLE_LABELS[g]} ${groups[g].series}`);
  const totalSeries = trained.length > 0
    ? (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).reduce((s, g) => s + groups[g].series, 0)
    : 0;
  const summary = `Mesociclo #${number} · ${objective} · ${weeks} sem × ${daysPerWeek} días · ${totalSeries} series/sem${reparto ? ` · ${reparto.nombre}` : ''}`;
  const anterior = [...existing].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const cambios = cambiosDeMesociclo(anterior, payload);

  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'mesocycle',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload,
    ...(cambios.length ? { cambios } : {}),
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    number,
    trainedGroups: trained,
    ...(avisos.length ? { avisos } : {}),
    note: 'Propuesta creada. Dani la revisa y aprueba desde el panel; luego materializa los entrenamientos por día en la app.',
  });
}

// Las sesiones completas de un mesociclo que ya existe. Es la única propuesta
// que toca lo que el atleta ve el mismo día que entrena, así que aquí no se
// aceptan aproximaciones: el nombre del ejercicio se resuelve contra el
// catálogo ANTES de guardar la propuesta, y lo que Dani aprueba ya apunta a
// ejercicios reales.
export async function proposeWorkoutDays(
  athleteEmail: string,
  mesocycleId: string | undefined,
  diasInput: WorkoutDayInput[],
  rationale: string,
  chatId: string,
  expediente?: ProposalExpediente,
): Promise<string> {
  const profile = await findProfile(athleteEmail);
  if (!profile) return toResult({ valid: false, issues: [{ field: 'athlete_email', message: `No existe ningún cliente con email ${athleteEmail}` }] });

  const mesos = await getMesocycles(athleteEmail);
  if (mesos.length === 0) {
    return toResult({
      valid: false,
      issues: [{ field: 'mesocycle_id', message: 'Este atleta no tiene ningún mesociclo. Propón primero el bloque (propose_mesocycle o propose_periodization_block) y monta las sesiones cuando esté aprobado.' }],
    });
  }
  const meso = mesocycleId
    ? mesos.find(m => m.id === mesocycleId)
    : [...mesos].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (!meso) {
    return toResult({ valid: false, issues: [{ field: 'mesocycle_id', message: `El mesociclo ${mesocycleId} no es de este atleta. Mesociclos suyos: ${mesos.map(m => `${m.id} (#${m.number})`).join(', ')}` }] });
  }

  const exercises = await getExercises();
  const issues = validateWorkoutDays(diasInput, exercises, meso.daysPerWeek);
  if (issues.length > 0) {
    return toResult({ valid: false, mesocycleId: meso.id, issues, note: 'Corrige esto y vuelve a llamar a propose_workout_days.' });
  }

  const porNombre = new Map(exercises.map(e => [claveDeEjercicio(e.name), e]));
  const days: WorkoutDayProposal[] = diasInput.map(d => {
    const ejercicios = (d.exercises as WorkoutExerciseInput[]).map(ex => {
      const cat = porNombre.get(claveDeEjercicio(String(ex.exercise)))!;
      const notas = typeof ex.notes === 'string' ? ex.notes.trim() : '';
      return {
        exerciseId: cat.id,
        exerciseName: cat.name,
        sets: Number(ex.sets),
        reps: String(ex.reps).trim(),
        rir: Number(ex.rir),
        restSeconds: ex.rest_seconds === undefined ? 90 : Number(ex.rest_seconds),
        ...(notas ? { notes: notas } : {}),
        ...(cat.muscleGroup ? { muscleGroup: cat.muscleGroup } : {}),
      };
    });
    return {
      dayIndex: Number(d.day_index),
      ...(typeof d.name === 'string' && d.name.trim() ? { name: d.name.trim() } : {}),
      exercises: ejercicios,
    };
  }).sort((a, b) => a.dayIndex - b.dayIndex);

  // Las series que salen de estas sesiones frente a las que dice el mesociclo.
  // No bloquea: el reparto por día nunca cuadra al milímetro con el semanal, y
  // el que decide si la desviación importa es Dani. Pero se le enseña.
  const seriesPorGrupo = new Map<string, number>();
  for (const d of days) {
    for (const ex of d.exercises) {
      if (!ex.muscleGroup) continue;
      seriesPorGrupo.set(ex.muscleGroup, (seriesPorGrupo.get(ex.muscleGroup) ?? 0) + ex.sets);
    }
  }
  const desvios = (Object.keys(MUSCLE_LABELS) as MuscleGroup[])
    .map(g => ({ grupo: MUSCLE_LABELS[g], plan: meso.groups[g]?.series ?? 0, sesiones: seriesPorGrupo.get(g) ?? 0 }))
    .filter(x => (x.plan > 0 || x.sesiones > 0) && Math.abs(x.plan - x.sesiones) >= 2)
    .map(x => `${x.grupo}: mesociclo ${x.plan} / sesiones ${x.sesiones}`);

  const totalSeries = days.reduce((s, d) => s + d.exercises.reduce((t, e) => t + e.sets, 0), 0);
  const summary = `Sesiones de ${nombreDeMeso(meso)} · ${days.length} ${days.length === 1 ? 'día' : 'días'} · ${totalSeries} series`;

  const payload: WorkoutDaysProposalPayload = { mesocycleId: meso.id, days };
  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'workoutDays',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload,
    baseEntityId: meso.id,
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    mesocycle: `${nombreDeMeso(meso)} (${meso.id})`,
    dias: days.map(d => `${d.dayIndex}: ${d.exercises.length} ejercicios`),
    desviacionRespectoAlMesociclo: desvios.length ? desvios : undefined,
    note: 'Propuesta creada. Dani puede editar series, reps, RIR y quitar ejercicios antes de aprobarla.',
  });
}

// Bloque H2.1 — mismo mesociclo que proposeMesocycle (misma validación, mismo
// relleno de grupos) más la cadencia de revisiones. Al aprobar (AiChatPanel),
// se crea el mesociclo Y las tareas de revisión de una vez — el calendario
// (Bloque H) las pinta solas en cuanto existen, sin nada más que hacer.
export async function proposePeriodizationBlock(
  athleteEmail: string,
  weeks: number,
  daysPerWeek: number,
  objective: string,
  groupsInput: MesocycleProposalPayload['groups'],
  startDate: string | undefined,
  deloadWeek: number | undefined,
  reviewCadenceWeeks: number,
  reviewType: 'revision' | 'cuestionario' | 'foto',
  rationale: string,
  chatId: string,
  expediente?: ProposalExpediente,
): Promise<string> {
  const issues = validateMesocyclePayload({ weeks, daysPerWeek, objective, groups: groupsInput });
  if (deloadWeek !== undefined && (deloadWeek < 1 || deloadWeek > weeks)) {
    issues.push({ field: 'deload_week', message: `deload_week debe estar entre 1 y ${weeks}` });
  }
  if (!Number.isFinite(reviewCadenceWeeks) || reviewCadenceWeeks < 1) {
    issues.push({ field: 'review_cadence_weeks', message: 'review_cadence_weeks debe ser un número >= 1' });
  }
  if (issues.length > 0) {
    return toResult({ valid: false, issues, note: 'Corrige estos problemas y vuelve a llamar a propose_periodization_block.' });
  }

  const profile = await findProfile(athleteEmail);
  if (!profile) return toResult({ valid: false, issues: [{ field: 'athlete_email', message: `No existe ningún cliente con email ${athleteEmail}` }] });

  const existing = await getMesocycles(athleteEmail);
  // Tras borrar un mesociclo, `length + 1` repetía número (B14, 26-10-2026).
  const number = Math.max(0, ...existing.map(m => m.number ?? 0)) + 1;
  const groups = Object.fromEntries(
    (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).map(g => {
      const cfg = groupsInput[g];
      return [g, { series: cfg?.series ?? 0, priority: cfg?.priority ?? 'media' }];
    })
  ) as Record<MuscleGroup, MuscleGroupConfig>;

  const mesocycle: Omit<Mesocycle, 'id'> = {
    athleteId: athleteEmail,
    number,
    weeks,
    startDate: startDate?.trim() || hoyIsoLocal(),
    objective,
    daysPerWeek,
    groups,
    ...(deloadWeek !== undefined ? { deloadWeek } : {}),
  };

  const reviewCount = Math.max(1, Math.floor(weeks / reviewCadenceWeeks));
  const trained = (Object.keys(MUSCLE_LABELS) as MuscleGroup[])
    .filter(g => groups[g].series > 0)
    .map(g => `${MUSCLE_LABELS[g]} ${groups[g].series}`);
  const totalSeries = (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).reduce((s, g) => s + groups[g].series, 0);
  const summary = `Bloque #${number} · ${objective} · ${weeks} sem × ${daysPerWeek} días · ${totalSeries} series/sem`
    + (deloadWeek ? ` · descarga en sem. ${deloadWeek}` : '')
    + ` · revisión cada ${reviewCadenceWeeks} sem (${reviewCount})`;

  const payload: PeriodizationBlockPayload = { mesocycle, reviewCadenceWeeks, reviewType };
  const anterior = [...existing].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const cambios = cambiosDeMesociclo(anterior, mesocycle);

  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'periodizationBlock',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload,
    ...(cambios.length ? { cambios } : {}),
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    number,
    trainedGroups: trained,
    reviewCount,
    note: 'Propuesta de bloque completo creada. Dani la revisa y aprueba desde el panel — al aprobar se crean el mesociclo y todas las revisiones de golpe; los entrenamientos por día y la progresión por ejercicio los configura después en la app.',
  });
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/* A-2. Toda tool que lea datos de UN atleta concreto pasa por aquí. Se pone la
   puerta en este punto y no en cada función por el mismo motivo por el que el
   filtro de NaN de `05-7` se puso en `setAnswer`: es el único sitio por el que
   pasan todas, así que ninguna tool futura puede saltárselo por descuido.

   Se falla cerrado: sin decisión registrada no sale nada. El coste es real y
   conocido —el día del despliegue ningún cliente actual tiene decisión, así que
   el asistente no podrá analizarlos hasta que contesten— y por eso el mensaje
   explica la situación en vez de parecer un error. */

/* ── Lo demás que se programa al atleta ─────────────────────────────────────
   La checklist de Setup pide cosas que la IA no podía tocar: fechas del plan,
   pasos, calendario de dietas, cuestionario y fotos periódicas, retos
   elegibles, cardio, publicar el bloque, el reto de la semana. Y las
   plantillas del coach. Todo pasa por propuesta; lo único que se escribe
   directo es la NOTA para Dani (add_coach_task), que es para él, no para el
   atleta. */

const WEEKDAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const CHALLENGE_KINDS: ChallengeKind[] = ['pasos_media', 'pasos_total', 'carga_ejercicio', 'reps_ejercicio', 'adherencia_dieta', 'peso_objetivo', 'entrenos_completados', 'series_grupo', 'cardio_zona2', 'racha_registro', 'custom'];

function leerSchedule(raw: unknown): QSchedule | string {
  if (!raw || typeof raw !== 'object') return 'schedule tiene que ser un objeto {type, ...}';
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (type === 'once') return { type: 'once' };
  if (type === 'weekdays') {
    const dias = Array.isArray(r.weekdays) ? r.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    return dias.length ? { type: 'weekdays', weekdays: dias } : 'schedule.weekdays necesita días 0 (domingo) a 6 (sábado)';
  }
  if (type === 'interval') {
    const n = Number(r.interval_days);
    return Number.isInteger(n) && n >= 1 ? { type: 'interval', intervalDays: n } : 'schedule.interval_days debe ser un entero ≥ 1';
  }
  if (type === 'monthly') {
    const d = Number(r.day_of_month);
    return Number.isInteger(d) && d >= 1 && d <= 28 ? { type: 'monthly', dayOfMonth: d } : 'schedule.day_of_month va de 1 a 28';
  }
  if (type === 'plan_week') {
    const w = Number(r.plan_week);
    if (!Number.isInteger(w) || w < 1) return 'schedule.plan_week debe ser un entero ≥ 1';
    const wd = r.plan_weekday === undefined ? undefined : Number(r.plan_weekday);
    return { type: 'plan_week', planWeek: w, ...(wd !== undefined && Number.isInteger(wd) ? { planWeekday: wd } : {}) };
  }
  if (type === 'mesocycle_end') {
    const off = r.mesocycle_offset_days === undefined ? 0 : Number(r.mesocycle_offset_days);
    return { type: 'mesocycle_end', mesocycleOffsetDays: Number.isFinite(off) ? off : 0 };
  }
  return 'schedule.type debe ser once | weekdays | interval | monthly | plan_week | mesocycle_end';
}

function describirSchedule(s: QSchedule): string {
  switch (s.type) {
    case 'once': return 'una vez';
    case 'weekdays': return `los días ${(s.weekdays ?? []).join(',')} de la semana`;
    case 'interval': return `cada ${s.intervalDays} días`;
    case 'monthly': return `el día ${s.dayOfMonth} de cada mes`;
    case 'plan_week': return `la semana ${s.planWeek} del plan`;
    case 'mesocycle_end': return 'al acabar el mesociclo';
  }
}

/** Resuelve nombres del catálogo a ejercicios reales, tras validateWorkoutDays. */
function ejerciciosResueltos(
  exs: WorkoutExerciseInput[],
  porNombre: Map<string, { id: string; name: string; muscleGroup?: MuscleGroup }>,
): WorkoutDayExerciseProposal[] {
  return exs.map(ex => {
    const cat = porNombre.get(claveDeEjercicio(String(ex.exercise)))!;
    const notas = typeof ex.notes === 'string' ? ex.notes.trim() : '';
    return {
      exerciseId: cat.id,
      exerciseName: cat.name,
      sets: Number(ex.sets),
      reps: String(ex.reps).trim(),
      rir: Number(ex.rir),
      restSeconds: ex.rest_seconds === undefined ? 90 : Number(ex.rest_seconds),
      ...(notas ? { notes: notas } : {}),
      ...(cat.muscleGroup ? { muscleGroup: cat.muscleGroup } : {}),
    };
  });
}

export async function proposeSetupConfig(
  athleteEmail: string, input: Record<string, unknown>, rationale: string, chatId: string, expediente?: ProposalExpediente,
): Promise<string> {
  const profile = await findProfile(athleteEmail);
  if (!profile) return toResult({ valid: false, issues: [`No existe ningún cliente con email ${athleteEmail}`] });

  const payload: SetupConfigProposalPayload = {};
  const problemas: string[] = [];
  const partes: string[] = [];
  const cambios: string[] = [];
  const iso = /^\d{4}-\d{2}-\d{2}$/;

  if (input.plan_start_date !== undefined) {
    if (typeof input.plan_start_date !== 'string' || !iso.test(input.plan_start_date)) problemas.push('plan_start_date debe ser YYYY-MM-DD');
    else { payload.planStartDate = input.plan_start_date; partes.push(`inicio ${input.plan_start_date}`); cambios.push(`Inicio del plan: ${profile.planStartDate ?? '—'} → ${input.plan_start_date}`); }
  }
  if (input.plan_duration_months !== undefined) {
    const n = Number(input.plan_duration_months);
    if (!Number.isInteger(n) || n < 1 || n > 24) problemas.push('plan_duration_months va de 1 a 24');
    else { payload.planDurationMonths = n; partes.push(`${n} meses`); cambios.push(`Duración: ${profile.planDurationMonths ?? '—'} → ${n} meses`); }
  }
  if (input.target_weight !== undefined) {
    const n = Number(input.target_weight);
    if (!Number.isFinite(n) || n < 30 || n > 250) problemas.push('target_weight debe ser un peso en kg (30-250)');
    else { payload.targetWeight = n; partes.push(`objetivo ${n} kg`); cambios.push(`Peso objetivo: ${profile.targetWeight || '—'} → ${n} kg`); }
  }
  if (input.step_goal !== undefined) {
    const n = Number(input.step_goal);
    if (!Number.isInteger(n) || n < 1000 || n > 30000) problemas.push('step_goal va de 1000 a 30000');
    else {
      payload.stepGoal = n; partes.push(`${n} pasos/día`);
      const cfg = await getAthleteNutritionConfig(athleteEmail);
      cambios.push(`Pasos diarios: ${cfg.stepGoal ?? '—'} → ${n}`);
    }
  }
  if (input.active_diet_names !== undefined) {
    const nombres = Array.isArray(input.active_diet_names) ? input.active_diet_names.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
    if (!nombres.length) problemas.push('active_diet_names debe ser una lista de nombres de dieta');
    else { payload.activeDietNames = nombres; partes.push(`dietas activas: ${nombres.join(', ')}`); }
  }
  if (input.weekly_schedule !== undefined) {
    const raw = input.weekly_schedule;
    if (!raw || typeof raw !== 'object') problemas.push('weekly_schedule debe ser {mon..sun: nombre de dieta | null}');
    else {
      const sched: Partial<Record<WeekDay, string | null>> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!WEEKDAYS.includes(k as WeekDay)) { problemas.push(`weekly_schedule: día desconocido "${k}" (usa mon..sun)`); continue; }
        if (v !== null && typeof v !== 'string') { problemas.push(`weekly_schedule.${k} debe ser el nombre de una dieta o null`); continue; }
        sched[k as WeekDay] = v as string | null;
      }
      payload.weeklyScheduleByName = sched;
      partes.push(`calendario de dietas (${Object.values(sched).filter(Boolean).length} días)`);
    }
  }
  if (input.questionnaire !== undefined) {
    const q = input.questionnaire as Record<string, unknown> | null;
    const coachUid = (coachActual().uid || undefined);
    const disponibles = coachUid ? await getQuestionnairesByCoach(coachUid) : [];
    const titulo = typeof q?.title === 'string' ? q.title : '';
    const encontrado = disponibles.find(x => claveDeEjercicio(x.title) === claveDeEjercicio(titulo));
    const schedule = leerSchedule(q?.schedule);
    if (!encontrado) problemas.push(`questionnaire.title "${titulo}" no existe. Disponibles: ${disponibles.map(x => x.title).join(' | ') || '(ninguno: Dani tiene que crear uno en Cuestionarios)'}`);
    else if (typeof schedule === 'string') problemas.push(`questionnaire: ${schedule}`);
    else {
      const startDate = typeof q?.start_date === 'string' && iso.test(q.start_date) ? q.start_date : hoyIsoLocal();
      payload.questionnaire = { questionnaireId: encontrado.id, questionnaireTitle: encontrado.title, schedule, startDate };
      partes.push(`cuestionario «${encontrado.title}» ${describirSchedule(schedule)}`);
    }
  }
  if (input.photos !== undefined) {
    const f = input.photos as Record<string, unknown> | null;
    const schedule = leerSchedule(f?.schedule);
    const views = Array.isArray(f?.views) ? f!.views.filter((v): v is 'front' | 'side' | 'back' => v === 'front' || v === 'side' || v === 'back') : [];
    if (typeof schedule === 'string') problemas.push(`photos: ${schedule}`);
    else if (!views.length) problemas.push('photos.views necesita al menos una de front | side | back');
    else {
      const startDate = typeof f?.start_date === 'string' && iso.test(f.start_date) ? f.start_date : hoyIsoLocal();
      payload.photos = { schedule, startDate, views };
      partes.push(`fotos (${views.join('/')}) ${describirSchedule(schedule)}`);
    }
  }
  if (input.lift_exercise_names !== undefined) {
    const nombres = Array.isArray(input.lift_exercise_names) ? input.lift_exercise_names.filter((x): x is string => typeof x === 'string') : [];
    const catalogo = await getExercises();
    const porNombre = new Map(catalogo.map(e => [claveDeEjercicio(e.name), e.name]));
    const noEstan = nombres.filter(n => !porNombre.has(claveDeEjercicio(n)));
    if (!nombres.length) problemas.push('lift_exercise_names debe ser una lista de nombres del catálogo');
    else if (noEstan.length) problemas.push(`lift_exercise_names: no están en el catálogo: ${noEstan.join(', ')}`);
    else { payload.liftExerciseNames = nombres.map(n => porNombre.get(claveDeEjercicio(n))!); partes.push(`retos de carga en ${payload.liftExerciseNames.join(', ')}`); }
  }
  if (input.cardio !== undefined) {
    const c = input.cardio as Record<string, unknown> | null;
    const kind = c?.kind;
    const startDate = typeof c?.start_date === 'string' && iso.test(c.start_date) ? c.start_date : hoyIsoLocal();
    if (kind === 'zona2') {
      const base = c?.base_minutes === undefined ? undefined : Number(c.base_minutes);
      if (base !== undefined && (!Number.isFinite(base) || base < 10 || base > 120)) problemas.push('cardio.base_minutes va de 10 a 120');
      else { payload.cardio = { kind: 'zona2', startDate, ...(base !== undefined ? { baseMinutes: base } : {}) }; partes.push(`programa de Zona 2 desde ${startDate}`); }
    } else if (kind === 'vo2max') {
      const protocolo = PROTOCOLOS_VO2MAX.find(p => p.id === c?.protocol_id);
      if (!protocolo) problemas.push(`cardio.protocol_id debe ser uno de: ${PROTOCOLOS_VO2MAX.map(p => p.id).join(' | ')}`);
      else { payload.cardio = { kind: 'vo2max', protocolId: protocolo.id, startDate }; partes.push(`programa VO₂máx «${protocolo.label}» desde ${startDate}`); }
    } else problemas.push('cardio.kind debe ser zona2 | vo2max');
  }

  if (problemas.length) return toResult({ valid: false, issues: problemas, note: 'Corrige y vuelve a llamar a propose_setup_config.' });
  if (!partes.length) return toResult({ valid: false, issues: ['No has mandado ningún campo que configurar.'] });

  const summary = `Configuración del plan: ${partes.join(' · ')}`;
  const proposal = await createAiProposal({
    athleteId: athleteEmail, kind: 'setupConfig', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload,
    ...(cambios.length ? { cambios } : {}),
    ...(expediente ? { expediente } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({ proposalCreated: true, proposalId: proposal.id, configurado: partes, note: 'Propuesta creada. Las dietas del calendario se resuelven por NOMBRE al aprobar: si vienen de una periodización propuesta en este mismo chat, Dani tiene que aprobar antes la periodización.' });
}

export async function proposePublishBlock(athleteEmail: string, mesocycleId: string | undefined, rationale: string, chatId: string): Promise<string> {
  const profile = await findProfile(athleteEmail);
  if (!profile) return toResult({ valid: false, issues: [`No existe ningún cliente con email ${athleteEmail}`] });
  const mesos = await getMesocycles(athleteEmail);
  const meso = mesocycleId
    ? mesos.find(m => m.id === mesocycleId)
    : [...mesos].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (!meso) return toResult({ valid: false, issues: [mesocycleId ? `El mesociclo ${mesocycleId} no es de este atleta` : 'El atleta no tiene ningún mesociclo todavía: propón primero propose_mesocycle.'] });
  const sesiones = sesionesDeMesociclo(await getWorkouts(), meso.id);
  const asignadas = (await getWorkoutAssignments({ uid: profile.userId, email: profile.email })).filter(a => a.mesocycleId === meso.id);
  const fechas = sesiones.length ? fechasDelMesociclo(meso, sesiones.length) : [];
  const nombre = nombreDeMeso(meso);
  const summary = sesiones.length
    ? `Publicar ${nombre} en el calendario: ${sesiones.length} sesiones × ${Math.max(...fechas.map(f => f.vuelta), 0)} vueltas = ${fechas.length} entrenos${asignadas.length ? ` (ya había ${asignadas.length})` : ''}`
    : `Publicar ${nombre} en el calendario (todavía sin sesiones: aprueba antes las sesiones)`;
  const payload: PublishBlockProposalPayload = { mesocycleId: meso.id, mesocycleName: nombre };
  const proposal = await createAiProposal({
    athleteId: athleteEmail, kind: 'publishBlock', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload, baseEntityId: meso.id, createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(athleteEmail, proposal.id, chatId, summary);
  return toResult({
    proposalCreated: true, proposalId: proposal.id, mesociclo: nombre, sesionesExistentes: sesiones.length,
    note: sesiones.length
      ? 'Al aprobar se crean las asignaciones que falten (las fechas ya asignadas no se duplican).'
      : 'Las sesiones todavía no existen: esta propuesta se aprueba DESPUÉS de las de propose_workout_days, y entonces publica lo que haya.',
  });
}

export async function proposeWeeklyChallenge(email: string, input: Record<string, unknown>, rationale: string, chatId: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ valid: false, issues: [`No existe ningún cliente con email ${email}`] });
  const problemas: string[] = [];
  const kind = input.kind as ChallengeKind;
  if (!CHALLENGE_KINDS.includes(kind)) problemas.push(`kind debe ser uno de: ${CHALLENGE_KINDS.join(' | ')}`);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!title) problemas.push('Falta title');
  if (!description) problemas.push('Falta description (lo que lee el atleta)');
  const m = (input.metric ?? {}) as Record<string, unknown>;
  const target = Number(m.target);
  if (typeof m.unit !== 'string' || !m.unit.trim()) problemas.push('metric.unit es obligatorio (pasos, kg, %, sesiones, series, min, días…)');
  if (!Number.isFinite(target) || target <= 0) problemas.push('metric.target debe ser un número > 0');
  const metric: WeeklyChallengeProposalPayload['metric'] = { unit: String(m.unit ?? ''), target };
  if (m.baseline !== undefined && Number.isFinite(Number(m.baseline))) metric.baseline = Number(m.baseline);
  if (m.at_weight !== undefined && Number.isFinite(Number(m.at_weight))) metric.atWeight = Number(m.at_weight);
  if (typeof m.muscle_group === 'string') {
    if (!(m.muscle_group in MUSCLE_LABELS)) problemas.push(`metric.muscle_group desconocido: ${m.muscle_group}`);
    else metric.muscleGroup = m.muscle_group as MuscleGroup;
  }
  if (typeof m.exercise_name === 'string' && m.exercise_name.trim()) {
    const cat = (await getExercises()).find(e => claveDeEjercicio(e.name) === claveDeEjercicio(String(m.exercise_name)));
    if (!cat) problemas.push(`metric.exercise_name "${m.exercise_name}" no está en el catálogo`);
    else { metric.exerciseId = cat.id; metric.exerciseName = cat.name; }
  }
  if ((kind === 'carga_ejercicio' || kind === 'reps_ejercicio') && !metric.exerciseId) problemas.push(`${kind} necesita metric.exercise_name`);
  if (kind === 'series_grupo' && !metric.muscleGroup) problemas.push('series_grupo necesita metric.muscle_group');
  if (problemas.length) return toResult({ valid: false, issues: problemas, note: 'Corrige y vuelve a llamar a propose_weekly_challenge.' });

  const today = typeof input.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.today) ? input.today : hoyIsoLocal();
  const semana = isoWeekKey(today);
  const actual = await getWeeklyChallenge(email, semana);
  const payload: WeeklyChallengeProposalPayload = {
    kind, title, description, metric, today,
    ...(typeof input.difficulty === 'string' && ['suave', 'justo', 'ambicioso'].includes(input.difficulty) ? { difficulty: input.difficulty as WeeklyChallengeProposalPayload['difficulty'] } : {}),
    ...(input.is_milestone === true ? { isMilestone: true } : {}),
  };
  const summary = `Reto de la semana ${semana}: ${title} (${target} ${metric.unit})${actual ? ` · sustituye a «${actual.title}»` : ''}`;
  const proposal = await createAiProposal({
    athleteId: email, kind: 'weeklyChallenge', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload,
    ...(actual ? { cambios: [`Reto de la semana: «${actual.title}» (${actual.origin === 'auto' ? 'automático' : 'del coach'}) → «${title}»`] } : {}),
    createdAt: new Date().toISOString(),
  });
  await registrarPropuesta(email, proposal.id, chatId, summary);
  return toResult({ proposalCreated: true, proposalId: proposal.id, semana, note: 'Al aprobar, el atleta lo ve en su road map esa misma semana.' });
}

export async function proposeWorkoutTemplate(email: string, name: string, exsInput: WorkoutExerciseInput[], rationale: string, chatId: string): Promise<string> {
  const catalogo = await getExercises();
  const issues = validateWorkoutDays([{ day_index: 0, name, exercises: exsInput }], catalogo, 1);
  if (issues.length) return toResult({ valid: false, issues, note: 'Corrige y vuelve a llamar a propose_workout_template.' });
  const porNombre = new Map(catalogo.map(e => [claveDeEjercicio(e.name), e]));
  const exercises = ejerciciosResueltos(exsInput, porNombre);
  const payload: WorkoutTemplateProposalPayload = { name: name.trim(), exercises };
  const series = exercises.reduce((s, e) => s + e.sets, 0);
  const summary = `Plantilla de rutina «${payload.name}»: ${exercises.length} ejercicios · ${series} series`;
  const proposal = await createAiProposal({
    athleteId: email, kind: 'workoutTemplate', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload, createdAt: new Date().toISOString(),
  });
  return toResult({ proposalCreated: true, proposalId: proposal.id, ejercicios: exercises.map(e => e.exerciseName), note: 'Al aprobar se guarda como rutina del coach (sin mesociclo), reutilizable desde Entrenamientos con cualquier atleta.' });
}

export async function proposeMesocycleTemplate(email: string, name: string, description: string | undefined, stagesInput: Record<string, unknown>[], rationale: string, chatId: string): Promise<string> {
  const catalogo = await getExercises();
  const porNombre = new Map(catalogo.map(e => [claveDeEjercicio(e.name), e]));
  const problemas: string[] = [];
  const stages: MesocycleTemplateStageProposal[] = [];
  stagesInput.forEach((st, i) => {
    const nombre = typeof st.name === 'string' && st.name.trim() ? st.name.trim() : `Etapa ${i + 1}`;
    const weeks = Number(st.weeks);
    const daysPerWeek = Number(st.days_per_week);
    const groupsInput = (st.groups ?? {}) as MesocycleProposalPayload['groups'];
    const issues = validateMesocyclePayload({ weeks, daysPerWeek, objective: nombre, groups: groupsInput });
    if (issues.length) { problemas.push(`Etapa "${nombre}": ${issues.map(x => x.message).join(' · ')}`); return; }
    const groups = Object.fromEntries(
      (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).map(g => [g, { series: groupsInput[g]?.series ?? 0, priority: groupsInput[g]?.priority ?? 'media' }]),
    ) as Record<MuscleGroup, MuscleGroupConfig>;
    const stage: MesocycleTemplateStageProposal = { name: nombre, weeks, daysPerWeek, groups };
    const { reparto, issues: issuesReparto } = repartoDesdeAsistente(st.reparto);
    if (issuesReparto.length) { problemas.push(`Etapa "${nombre}", reparto: ${issuesReparto.map(x => x.message).join(' · ')}`); return; }
    if (reparto) {
      if (sesionesDelReparto(reparto) !== daysPerWeek) {
        problemas.push(`Etapa "${nombre}": el reparto tiene ${sesionesDelReparto(reparto)} sesiones y days_per_week dice ${daysPerWeek}`);
        return;
      }
      const { cycleDays } = camposDeCalendario(reparto);
      stage.reparto = reparto;
      if (cycleDays !== undefined) stage.cycleDays = cycleDays;
      stage.distribution = distribucionDeMeso({
        id: '', athleteId: '', number: i + 1, startDate: hoyIsoLocal(), objective: nombre,
        weeks, daysPerWeek, groups, reparto, ...(cycleDays !== undefined ? { cycleDays } : {}),
      });
    }
    if (Array.isArray(st.days) && st.days.length) {
      const dias = (st.days as Record<string, unknown>[]).map((d, k) => ({ day_index: k, name: d.name, exercises: d.exercises }));
      const issuesDias = validateWorkoutDays(dias as WorkoutDayInput[], catalogo, daysPerWeek);
      if (issuesDias.length) { problemas.push(`Etapa "${nombre}", sesiones: ${issuesDias.map(x => x.message).join(' · ')}`); return; }
      stage.days = dias.map((d, k) => ({
        name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : `Día ${k + 1}`,
        exercises: ejerciciosResueltos(d.exercises as WorkoutExerciseInput[], porNombre),
      }));
    }
    if (st.deload_week !== undefined) {
      const dw = Number(st.deload_week);
      if (Number.isInteger(dw) && dw >= 1 && dw <= weeks) stage.deloadWeek = dw; else problemas.push(`Etapa "${nombre}": deload_week fuera de 1..${weeks}`);
    }
    if (st.review_cadence_weeks !== undefined) {
      const rc = Number(st.review_cadence_weeks);
      if (Number.isInteger(rc) && rc >= 1) { stage.reviewCadenceWeeks = rc; stage.reviewType = st.review_type === 'cuestionario' || st.review_type === 'foto' ? st.review_type : 'revision'; }
      else problemas.push(`Etapa "${nombre}": review_cadence_weeks debe ser ≥ 1`);
    }
    stages.push(stage);
  });
  if (!stagesInput.length) problemas.push('stages necesita al menos una etapa');
  if (problemas.length) return toResult({ valid: false, issues: problemas, note: 'Corrige y vuelve a llamar a propose_mesocycle_template.' });

  const payload: MesocycleTemplateProposalPayload = { name: name.trim(), ...(description?.trim() ? { description: description.trim() } : {}), stages };
  const semanas = stages.reduce((s, st) => s + st.weeks, 0);
  const summary = `Plantilla de mesociclo «${payload.name}»: ${stages.length} etapa${stages.length !== 1 ? 's' : ''} / ${semanas} semanas (${stages.map(s => `${s.name} ${s.weeks}sem×${s.daysPerWeek}d`).join(' → ')})`;
  const proposal = await createAiProposal({
    athleteId: email, kind: 'mesocycleTemplate', status: 'proposed', chatId,
    summary, rationale: rationale || '', payload, createdAt: new Date().toISOString(),
  });
  return toResult({ proposalCreated: true, proposalId: proposal.id, etapas: stages.map(s => `${s.name}: ${s.weeks} sem × ${s.daysPerWeek} días${s.days ? `, ${s.days.length} sesiones` : ''}`), note: 'Al aprobar se guarda en la biblioteca de plantillas del coach (Entrenamientos › Plantillas), lista para aplicar a cualquier atleta.' });
}

export async function addCoachTask(email: string, title: string, phase: string | undefined, dueDate: string | undefined, chatId: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });
  const fases = ['alta', 'programacion', 'primeras_semanas', 'consolidacion'];
  const existentes = await getCoachClientTasks(email);
  const repetida = existentes.find(t => !t.done && claveDeEjercicio(t.title) === claveDeEjercicio(title));
  if (repetida) return toResult({ creada: false, note: `Ya existe esa nota pendiente («${repetida.title}»), no se duplica.` });
  const tarea = await createCoachClientTask({
    athleteId: email, title: title.trim(), done: false, createdBy: 'coach', createdAt: new Date().toISOString(),
    ...(phase && fases.includes(phase) ? { phase } : {}),
    ...(dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? { dueDate } : {}),
  });
  await appendDossierFacts(email, [{ at: new Date().toISOString(), kind: 'observacion', text: `Nota para Dani: ${title.trim()}`, chatId }]);
  return toResult({ creada: true, taskId: tarea.id, note: 'Queda en la pestaña Setup del cliente como tarea pendiente de Dani. No la ve el atleta.' });
}

/* El mismo progreso que pintan los titulares de Revisión › El cuerpo, en texto.
   Se reutilizan las utilidades de esa pantalla (US Navy, índices, IRP,
   resumirSerie con el margen de error de cada perímetro) para que lo que lea
   la IA y lo que vea Dani no puedan contarse distinto. */
/* Lo que Dani le ha dicho a una propuesta sin llegar a aprobarla. Es la
   corrección más barata que existe —más que rechazar y volver a empezar— y
   hasta ahora no había forma de dársela sin escribirla otra vez en el chat. */

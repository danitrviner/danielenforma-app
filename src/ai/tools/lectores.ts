// Tools de LECTURA: no escriben nada. Leen Firestore (por ahora con el SDK de
// cliente, bajo la sesión del coach) y pasan los datos por los motores
// deterministas de src/utils. Son las que un bucle en servidor podrá reutilizar
// cambiando solo el lector.
import { auth } from '../../firebase';
import { estadoConsentimiento, aliasDeAtleta } from '../consentimientoIA';
import { getDossier, renderDossier } from '../../db/dossier';
import { calcularDerivas, resumirPatrones } from '../../utils/derivaPropuestas';
import { repartoDelMesociclo } from '../../utils/trainingSplits';
import { repartoParaAsistente, sesionesDelReparto, diasSemanaDesdeAsistente, calcularRepartoParaAsistente } from '../repartoAsistente';
import { frecuenciaPorDefecto } from '../../utils/calculadoraReparto';
import { getRepartosGuardados } from '../../db/repartos';
import { getAllUserProfiles, getCheckIns, getWorkoutAssignments, getWorkouts, getCardioAssignmentsForAthlete, getWorkoutLogs, getExercises, getMesocycles, getDietsForAthlete, getWorkoutAssignmentsByMesocycleIds, getDietCompletionLogsForAthlete, getAthleteNutritionConfig, getAthleteDietConfig, getPhotoAssignmentsForAthlete, getProgressPhotos, getCoachClientTasks, getWeeklyChallenge, getNutritionProgram, getBodyweightForAthlete, getWeeklyChallengesForAthlete, getOnboarding, getOnboardingTemplate, getResponsesForAthlete, getAssignmentsForAthlete, getQuestionnairesByCoach, getAiProposalsForAthlete, getApprovedAiProposals, getRoadmap, getTasksForAthlete, getKnowledgeNotes, getStepsForAthlete, getCardioSessionsForAthlete, getBodyMeasurementsForAthlete } from '../../dbService';
import { computeAnthropometricIndices, ANTHROPOMETRIC_INDEX_LABELS } from '../../utils/anthropometricIndices';
import { pctGrasaUSNavy, masaMagraEstimadaKg, computeIRC } from '../../utils/bodyFatUSNavy';
import { historialIRP } from '../../utils/readinessIndex';
import { resumirSerie } from '../../utils/progressSummary';
import { mdcDeMetrica } from '../../utils/mdc';
import { leerSexo } from '../../utils/athleteProfileSignals';
import { BODY_METRIC_LABELS, type BodyMetricKey } from '../../types';
import { generateChallengeOptions, buildChallengeMemory } from '../../utils/weeklyChallenge';
import { buildNutritionReport } from '../../utils/nutritionAnalysis';
import { athleteConditions, restrictionLabel } from '../../utils/dietaryRestrictions';
import { computeAdherenceScore } from '../../utils/adherence';
import { computeSetupChecklist } from '../../utils/clientSetup';
import { isoWeekKey } from '../../utils/challengeOptions';
import { computeWeightTrend } from '../../utils/nutritionAnalysis';
import { estimateMaintenanceKcal } from '../../utils/energyCalc';
import { buildTrainingReport } from '../../utils/trainingReport';
import { buildRevisionCoach, PeriodoRevision, mesoActivo, pesoVsSemanaPasada } from '../../utils/revisionCoach';
import { suggestVolume, VolumeIntent } from '../../utils/volumeSuggestion';
import { buildVolumeHistoryFrom } from '../../utils/volumeHistory';
import { VOLUME_LANDMARKS_DEFAULT } from '../../data/volumeLandmarks';
import { construirTitulares } from '../../utils/titularesRevision';
import { construirComidaDeLaSemana } from '../../utils/comidaDeLaSemana';
import { getVolumeLandmarks } from '../../db/coachSettings';
import { macrosDeLinea, macrosDeLineas } from '../../utils/macrosLegado';
import { alimentoGeneral } from '../../utils/alimentosGenerales';
import { buildPhaseEnergyPlans } from '../../utils/nutritionPeriodization';
import { computeActivePhase } from '../../utils/fasesNutricion';
import { dietaDeReferencia } from '../../utils/objetivoDelDia';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import { weekKey } from '../../utils/seriesCorrelation';
import { resolveQuestions } from '../../utils/questionnaireResolve';
import { SYSTEM_FOODS } from '../../nutricion_seed_en_forma';
import { Macros, MuscleGroup, MuscleGroupConfig, MUSCLE_LABELS, MUSCLE_ORDER, ExperienceLevel } from '../../types';
import { tareaPorId, type BriefSeccion } from '../tareas';
import { mediana } from '../../utils/perfilProgramacion';
import { checkinsOf, findProfile, isoDate, markAthleteText, objetivoParaElAsistente, toResult } from './comunes';

// ── Ejecutores ────────────────────────────────────────────────────────────────

export async function listClients(): Promise<string> {
  const [profiles, allCheckins] = await Promise.all([getAllUserProfiles(), getCheckIns()]);
  const clients = profiles.filter(p => p.role === 'client');

  /* A-2 punto 4. `name` era el nombre completo de cada cliente, y esta tool
     manda la lista ENTERA en cada conversación. Pasa a ser el alias («Ana G.»).

     El email se queda, y conviene decir por qué en vez de dar a entender que
     esto anonimiza: es la clave con la que el asistente llama al resto de
     tools, así que quitarlo exigiría un identificador opaco por sesión y una
     tabla de equivalencia en las nueve tools. Lo que se consigue aquí es no
     mandar el nombre y apellidos de todos los clientes por sistema; el email
     sigue viajando como identificador y así está declarado en la política. */
  const consentimientos = await Promise.all(
    clients.map(p => getOnboarding(p.email).then(estadoConsentimiento).catch(() => 'sin_responder' as const)),
  );

  const rows = clients.map((p, i) => {
    const checks = checkinsOf(allCheckins, p.email);
    const last = checks[0];
    const pending = checks.filter(c => !c.coachFeedback && !c.approved).length;
    return {
      name: aliasDeAtleta(p.displayName, p.email),
      email: p.email,
      // Para que el asistente sepa de antemano a quién NO puede analizar, en
      // vez de descubrirlo tool a tool y volver a intentarlo.
      analisisConIA: consentimientos[i] === 'aceptado' ? 'permitido' : 'no permitido',
      lastCheckin: last ? isoDate(last.timestamp) : null,
      pendingCheckins: pending,
      latestWeight: last?.weight ?? p.actualWeight ?? null,
      targetWeight: p.targetWeight || null,
      setupPct: p.setupSummary?.pct ?? null,
      planStartDate: p.planStartDate ?? null,
      planDurationMonths: p.planDurationMonths ?? null,
    };
  });
  return toResult({ totalClients: rows.length, clients: rows });
}

export async function getClientOverview(email: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });

  const [onboarding, bwLogs, allCheckins, assignments, diets, mesos, program, nutriConfig] = await Promise.all([
    getOnboarding(email),
    getBodyweightForAthlete(email),
    getCheckIns(),
    getWorkoutAssignments({ uid: profile.userId, email: profile.email }),
    getDietsForAthlete(email),
    getMesocycles(email),
    getNutritionProgram(email),
    getAthleteNutritionConfig(email),
  ]);

  const checks = checkinsOf(allCheckins, email);
  const weightTrend = computeWeightTrend(bwLogs, profile.targetWeight || undefined);
  const latestWeight = weightTrend.latestWeight ?? checks[0]?.weight ?? onboarding?.weightKg;
  const maintenanceKcal = onboarding ? estimateMaintenanceKcal(onboarding, latestWeight ?? undefined) : null;
  const adherence = computeAdherenceScore(assignments, checks);
  const activeMeso = [...mesos].sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;

  return toResult({
    profile: {
      // A-2 punto 4: alias, no nombre y apellidos. Ver listClients.
      name: aliasDeAtleta(profile.displayName, profile.email),
      email: profile.email,
      actualWeight: latestWeight ?? null,
      targetWeight: profile.targetWeight || null,
      planStartDate: profile.planStartDate ?? null,
      planDurationMonths: profile.planDurationMonths ?? null,
    },
    onboarding: onboarding ? {
      sex: onboarding.sex ?? null,
      birthDate: onboarding.birthDate ?? null,
      heightCm: onboarding.heightCm ?? null,
      activityLevel: onboarding.activityLevel ?? null,
      goalBody: onboarding.goalBody ?? null,
      goalCapacity: onboarding.goalCapacity ?? null,
      experienceLevel: onboarding.experienceLevel,
      // El SYSTEM_PROMPT le dice al modelo que aquí están las preferencias de
      // entrenamiento del atleta, pero estos dos campos no se proyectaban.
      equipment: onboarding.equipment ?? null,
      techniqueLevel: onboarding.techniqueLevel ?? null,
      muscleGroupsToImprove: onboarding.muscleGroupsToImprove ?? null,
      dietType: onboarding.dietType,
      targetCalories: onboarding.targetCalories,
      injuries: markAthleteText(onboarding.injuries || onboarding.currentInjuryLocation),
      allergies: onboarding.allergies,
      // Condiciones que descartan recetas enteras (celiaquía, intolerancias…).
      // Sin esto el modelo solo veía el texto libre de alergias y podía
      // proponerle seitán a un celíaco, igual que hacía el generador.
      healthConditions: athleteConditions(onboarding).map(restrictionLabel),
      dislikedFoods: onboarding.dislikedFoods,
    } : null,
    weightTrend28d: weightTrend,
    maintenanceKcalEstimated: maintenanceKcal,
    adherence4w: adherence,
    diets: diets.map(d => ({
      id: d.id, name: d.name, isDraft: !!d.isDraft, selfManaged: !!d.selfManaged,
      objetivo: objetivoParaElAsistente(d),
    })),
    nutritionModes: nutriConfig.enabledModes,
    stepGoal: nutriConfig.stepGoal ?? null,
    activeMesocycle: activeMeso ? {
      id: activeMeso.id, number: activeMeso.number, weeks: activeMeso.weeks,
      startDate: activeMeso.startDate, objective: activeMeso.objective,
      daysPerWeek: activeMeso.daysPerWeek,
    } : null,
    nutritionProgram: program ? {
      startDate: program.startDate,
      phases: program.phases.map(ph => ({ id: ph.id, name: ph.name, weeks: ph.weeks, targetKcal: ph.targetKcal ?? null, targetWeight: ph.targetWeight ?? null })),
    } : null,
    lastCheckin: checks[0] ? { date: isoDate(checks[0].timestamp), weight: checks[0].weight, adherence: checks[0].adherence } : null,
    pendingCheckins: checks.filter(c => !c.coachFeedback && !c.approved).length,
  });
}

// El alta entera. getClientOverview proyecta un resumen (18 campos de más de
// 70): sirve para el día a día, pero deja fuera justo lo que hace falta para
// montar un plan por primera vez — cuántos días puede entrenar, cuánto dura su
// sesión, qué ejercicios odia, qué le duele y con qué gesto, hasta dónde se
// deja ayudar. Eso lo contestó el atleta y estaba muerto en Firestore.
export async function getOnboardingCompleto(email: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });

  const coachEmail = auth.currentUser?.email ?? '';
  const [ob, plantilla] = await Promise.all([
    getOnboarding(email),
    coachEmail ? getOnboardingTemplate(coachEmail) : Promise.resolve(null),
  ]);
  if (!ob) {
    return toResult({
      onboarding: null,
      note: 'Este atleta todavía no ha completado el alta. Sin ella no sabes ni qué días puede entrenar ni qué le duele: dilo antes de proponer nada.',
    });
  }

  // Las preguntas propias de Dani viven como extraAnswers con la id de la
  // plantilla por clave. Sin la plantilla son pares sin sentido ("q3": 7).
  const preguntasPropias = Object.entries(ob.extraAnswers ?? {}).map(([id, valor]) => {
    const q = plantilla?.questions.find(x => x.id === id);
    return {
      pregunta: q?.label ?? id,
      seccion: q?.section ?? null,
      respuesta: typeof valor === 'string' ? markAthleteText(valor) : valor,
      unidad: q?.unit ?? null,
    };
  });

  return toResult({
    completadoEl: ob.completedAt ?? null,
    persona: {
      sexo: ob.sex ?? null,
      fechaNacimiento: ob.birthDate ?? null,
      alturaCm: ob.heightCm ?? null,
      pesoAltaKg: ob.weightKg ?? null,
      grasaPct: ob.bodyFatPct ?? null,
      musculoPct: ob.musclePct ?? null,
      perimetros: { cuelloCm: ob.neckCm ?? null, cinturaCm: ob.waistCm ?? null, caderaCm: ob.hipCm ?? null },
      ocupacion: markAthleteText(ob.occupation),
      comoNosConocio: markAthleteText(ob.referralSource),
    },
    objetivo: {
      cuerpo: ob.goalBody ?? null,
      capacidad: ob.goalCapacity ?? null,
      comoSeVeAlLograrlo: markAthleteText(ob.goalFreeText),
      paraCuandoYPorQue: markAthleteText(ob.goalTimelineMotivation),
      queEsperaDeSuEntrenador: markAthleteText(ob.coachExpectations),
      nivelActividad: ob.activityLevel ?? null,
    },
    salud: {
      lesionActual: ob.hasCurrentInjury ?? null,
      lesionDonde: markAthleteText(ob.currentInjuryLocation),
      lesionIntensidad1a10: ob.currentInjuryIntensity ?? null,
      lesionQueGestosDuelen: markAthleteText(ob.currentInjuryMovements),
      lesionesPasadas: ob.hadPastInjuries ?? null,
      lesionesPasadasDetalle: markAthleteText(ob.pastInjuriesDetail),
      lesionesTextoLibre: markAthleteText(ob.injuries),
      medicacion: ob.takesMedication ?? null,
      medicacionDetalle: markAthleteText(ob.medicationDetail),
      cirugiaReciente: ob.recentSurgery ?? null,
      cirugiaDetalle: markAthleteText(ob.recentSurgeryDetail),
      tabacoAlcoholSustancias: markAthleteText(ob.smokesAlcoholSubstances),
      exposicionSolarSemanal: markAthleteText(ob.sunExposureWeekly),
    },
    entrenamiento: {
      // Las dos cifras con las que se programa un mesociclo, y que hasta ahora
      // el asistente tenía que suponer.
      diasDisponiblesPorSemana: ob.availableDaysPerWeek ?? null,
      minutosPorSesion: ob.sessionMaxMinutes ?? null,
      experiencia: ob.experienceLevel,
      tecnica: ob.techniqueLevel ?? null,
      material: ob.equipment ?? [],
      ejerciciosFavoritos: ob.favoriteExercises ?? [],
      ejerciciosQueOdia: ob.hatedExercises ?? [],
      gruposAMejorar: markAthleteText(ob.muscleGroupsToImprove),
      sumaDe1RM: ob.oneRepMaxTotal ?? null,
      conQueFacilidadProgresa: ob.progressFrequency ?? null,
      motivacion1a10: ob.currentMotivation ?? null,
    },
    nutricion: {
      tipoDieta: ob.dietType,
      desdeCuandoEsaDieta: markAthleteText(ob.dietSince),
      kcalObjetivoAlta: ob.targetCalories,
      reparto: ob.macroSplit,
      gramos: ob.macroGrams,
      comidasAlDia: ob.mealCount ?? null,
      comidas: ob.meals ?? null,
      horaDeMasApetito: markAthleteText(ob.appetitePeakTime),
      historialDeSobrepeso: ob.hadOverweightHistory ?? null,
      buenaRelacionConLaComida: ob.foodRelationshipGood ?? null,
      porQueNo: markAthleteText(ob.foodRelationshipReason),
      comeDemasiadoRapido: ob.eatsTooFast ?? null,
      tendenciaDePeso: markAthleteText(ob.weightTendency),
      suplementos: ob.supplements ?? [],
      leGustan: ob.likedFoods ?? [],
      noLeGustan: ob.dislikedFoods ?? [],
      alergias: ob.allergies ?? [],
      condicionesQueDescartanRecetas: athleteConditions(ob).map(restrictionLabel),
    },
    cocina: {
      minutosMaximos: ob.cookingMaxTime ?? null,
      variedadDelMenu1a5: ob.menuVariety ?? null,
      cocinaEnTandas: ob.batchCookingPreferred ?? null,
      quiereRecetasRapidas: ob.quiereRapidas ?? null,
      tiposDePlatoQueQuiere: ob.preferredDishTypes ?? [],
      tiposDePlatoQueEvita: ob.excludedDishTypes ?? [],
    },
    // Esto decide el TONO del acompañamiento, no solo el plan: hasta dónde
    // quiere llegar y en qué se deja meter mano. Empujar fuera de estas áreas
    // es empujar donde no te han dado permiso.
    habitos: {
      hastaDondeQuiereLlegar: ob.lifestyleScope ?? null,
      areasEnLasQueSeDejaAyudar: ob.lifestyleAreas ?? [],
      seMueveEnDiaDeDescanso: ob.restDayActive ?? null,
      queHaceEseDia: markAthleteText(ob.restDayActiveDetail),
      horasSentadoAlDia: ob.sittingHoursPerDay ?? null,
      motivoDeSuEstres: markAthleteText(ob.stressReason),
    },
    descanso: {
      porQueDuermeMal: ob.sleepDeficitCauses ?? [],
      antesDeDormirRutinaOPantalla: ob.sleepRoutineOrScreen ?? null,
      medicacionParaDormir: ob.sleepMedication ?? null,
      medicacionDetalle: markAthleteText(ob.sleepMedicationDetail),
    },
    preguntasPropiasDeDani: preguntasPropias.length ? preguntasPropias : undefined,
  });
}

// La misma checklist que ve Dani en la pestaña Setup, contada para el modelo.
// Existe para que el asistente deje de tratar a todos los clientes igual: a uno
// del día 3 no le propones la escalera de niveles, le terminas el alta.
export async function getSetupStatus(email: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });

  const hoy = hoyIsoLocal();
  const [
    onboarding, allCheckins, mesocycles, workoutAssignments, diets, dietConfig,
    nutritionConfig, qAssignments, photoAssignments, photos, workoutLogs,
    roadmap, nutritionProgram, weeklyChallenge, manualTasks,
    workouts, cardioAssignments, dossier,
  ] = await Promise.all([
    getOnboarding(email),
    getCheckIns(),
    getMesocycles(email),
    getWorkoutAssignments({ uid: profile.userId, email: profile.email }),
    getDietsForAthlete(email),
    getAthleteDietConfig(email),
    getAthleteNutritionConfig(email),
    getAssignmentsForAthlete(email),
    getPhotoAssignmentsForAthlete(email),
    getProgressPhotos(email),
    getWorkoutLogs(email),
    getRoadmap(email),
    getNutritionProgram(email),
    getWeeklyChallenge(email, isoWeekKey(hoy)),
    getCoachClientTasks(email),
    // Las tres que cierran «sesiones con ejercicios», «cardio» y «ficha viva».
    // Sin ellas la checklist las da por «todavía no aplica» y el asistente
    // le decía al modelo que NO las propusiera — para todos los clientes,
    // siempre — mientras la pestaña de Implantación las enseñaba en rojo.
    getWorkouts(),
    getCardioAssignmentsForAthlete(email),
    getDossier(email),
  ]);

  const resultado = computeSetupChecklist({
    profile, onboarding, checkins: checkinsOf(allCheckins, email), mesocycles,
    workoutAssignments, diets, dietConfig, nutritionConfig, qAssignments,
    photoAssignments, photos, workoutLogs, roadmap, nutritionProgram,
    weeklyChallenge, manualTasks, today: hoy,
    workouts, cardioAssignments, dossier,
  });

  const diasDePlan = profile.planStartDate
    ? Math.floor((new Date(hoy).getTime() - new Date(profile.planStartDate).getTime()) / 86_400_000)
    : null;

  return toResult({
    diaDelPlan: diasDePlan,
    completado: `${resultado.globalPct}%`,
    siguientePaso: resultado.nextStep ? resultado.nextStep.title : null,
    fases: resultado.phases.map(f => ({
      fase: f.title,
      cuando: f.subtitle ?? null,
      completada: `${f.donePct}%`,
      hecho: f.items.filter(i => i.status === 'done').map(i => i.title),
      necesitaAtencion: f.items.filter(i => i.status === 'attention').map(i => i.title),
      pendiente: f.items.filter(i => i.status === 'pending').map(i => i.title),
      todaviaNoAplica: f.items.filter(i => i.status === 'na').map(i => i.title),
    })),
    avisos: resultado.alerts.map(a => `${a.severity === 'critical' ? '[grave] ' : ''}${a.title}${a.detail ? ` — ${a.detail}` : ''}`),
    note: 'Trabaja por fases y en este orden. Lo que sale como "todavía no aplica" es porque falta la fecha de inicio del plan o el cliente no ha llegado a ese punto: no lo propongas.',
  });
}

// El expediente entero en una llamada. Cada sección reutiliza la tool que ya
// existía (misma proyección, mismas marcas de «dato del atleta») — lo único
// nuevo es que van juntas: una ronda del modelo en vez de siete u ocho, y el
// historial que se cachea después es uno solo en vez de ocho intercalados.
export async function getClientBrief(email: string, tareaId: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });

  const tarea = tareaPorId(tareaId);
  const secciones: BriefSeccion[] = tarea?.brief ?? ['estado', 'ficha', 'resumen', 'alta', 'plan', 'dieta', 'entrenos', 'revisiones', 'cuestionarios', 'ajustes'];

  const lectores: Record<BriefSeccion, { titulo: string; leer: () => Promise<string> }> = {
    estado: { titulo: 'ESTADO DEL MONTAJE (get_setup_status)', leer: () => getSetupStatus(email) },
    ficha: { titulo: 'FICHA VIVA (get_athlete_dossier)', leer: () => leerFicha(email) },
    resumen: { titulo: 'RESUMEN (get_client_overview)', leer: () => getClientOverview(email) },
    alta: { titulo: 'ALTA COMPLETA (get_onboarding)', leer: () => getOnboardingCompleto(email) },
    plan: { titulo: 'PLAN: ROADMAP, PERIODIZACIÓN Y TAREAS (get_plan_context)', leer: () => leerContextoDelPlan(email) },
    dieta: { titulo: 'DIETA (get_diet)', leer: () => getDietInfo(email) },
    entrenos: { titulo: 'ENTRENOS DE LAS ÚLTIMAS 4 SEMANAS (get_training_history)', leer: () => getTrainingHistory(email, 4) },
    revisiones: { titulo: 'ÚLTIMOS CHECK-INS (get_checkins)', leer: () => getCheckinsInfo(email, 3) },
    cuestionarios: { titulo: 'TENDENCIAS DE CUESTIONARIOS (get_questionnaire_trends)', leer: () => getQuestionnaireTrends(email, undefined, 8) },
    // Lo suyo Y lo de toda la cartera: en septiembre Dani quitó glúteo, gemelo,
    // core y deltoides en cuatro atletas distintos y alargó seis bloques a 12
    // semanas, y el asistente no lo vio porque solo miraba al atleta de turno
    // (y get_coach_adjustments suelta se llamó 3 veces en 254).
    ajustes: {
      titulo: 'LO QUE DANI CORRIGE A MANO (get_coach_adjustments)',
      leer: async () => {
        const [suyo, cartera] = await Promise.all([getCoachAdjustments(email), getCoachAdjustments()]);
        return `### En este atleta\n${suyo}\n\n### En toda la cartera (los patrones que se repiten son su criterio: aplícalos ya)\n${cartera}`;
      },
    },
    nutricion: { titulo: 'ANÁLISIS NUTRICIONAL (get_nutrition_analysis)', leer: () => getNutritionAnalysis(email) },
    cuerpo: { titulo: 'PROGRESO DEL CUERPO (get_progress_metrics)', leer: () => getProgressMetrics(email) },
  };

  const partes = await Promise.all(secciones.map(async s => {
    const { titulo, leer } = lectores[s];
    let cuerpo: string;
    try {
      cuerpo = await leer();
    } catch (err) {
      cuerpo = `(no disponible: ${err instanceof Error ? err.message : String(err)})`;
    }
    return `## ${titulo}\n${cuerpo}`;
  }));

  const cabecera = `BRIEF DE ${aliasDeAtleta(profile.displayName, profile.email)} (${profile.email}) para la tarea "${tarea?.label ?? tareaId}". `
    + 'Ya tienes aquí todo lo que leerían las tools entre paréntesis: no las llames por separado.';
  // Sin toResult: cada sección ya viene acotada por su propia tool, y el
  // brief entero no cabe en el tope de una sola.
  return [cabecera, ...partes].join('\n\n');
}

export async function getTrainingHistory(email: string, weeks: number): Promise<string> {
  const w = Math.min(Math.max(1, Math.round(weeks || 4)), 16);
  const [logs, exercises, mesos] = await Promise.all([
    getWorkoutLogs(email),
    getExercises(),
    getMesocycles(email),
  ]);
  if (logs.length === 0) return toResult({ error: 'Este cliente no tiene entrenamientos registrados' });

  const today = hoyIsoLocal();
  const periodStart = addDays(today, -(w * 7 - 1));

  const report = buildTrainingReport({
    logs, exercises, mesocycles: mesos,
    periodStart, periodEnd: today,
    comparison: { mode: 'weeks', n: w },
  });

  return toResult({
    window: { periodStart, periodEnd: today, comparison: report.comparisonLabel },
    sessions: report.sessions,
    tonnage: report.tonnage,
    // `sets`/`setsDeltaPct` se calculaban y se tiraban aquí: sin ellos el
    // modelo proponía volumen por grupo sin poder ver cuántas series se
    // hicieron de verdad, que es el dato que decide si se sube o se sostiene.
    muscleGroups: report.muscleGroups.map(g => ({
      group: g.label, tonnage: g.tonnage, tonnageDeltaPct: g.tonnageDeltaPct, ormDeltaPct: g.ormDeltaPct,
      sets: g.sets, setsDeltaPct: g.setsDeltaPct,
    })),
    topExercises: report.perExercise
      .sort((a, b) => b.tonnage - a.tonnage)
      .slice(0, 12)
      .map(e => ({ name: e.name, sets: e.sets, tonnage: e.tonnage, bestOrm: e.bestOrm, deltaOrmPct: e.deltaOrmPct, isPR: e.isPR })),
    highlights: report.highlights,
  });
}

export async function getDietInfo(email: string): Promise<string> {
  const [diets, config, program] = await Promise.all([
    getDietsForAthlete(email),
    getAthleteNutritionConfig(email),
    getNutritionProgram(email),
  ]);
  return toResult({
    enabledModes: config.enabledModes,
    stepGoal: config.stepGoal ?? null,
    vegServingsPerDay: config.vegServingsPerDay ?? null,
    diets: diets.map(d => ({
      id: d.id,
      name: d.name,
      isDraft: !!d.isDraft,
      selfManaged: !!d.selfManaged,
      objetivo: objetivoParaElAsistente(d),
      // Lo que suman los alimentos colocados (si los hay), en kcal y gramos.
      colocado: d.meals.some(m => m.items.length > 0)
        ? (({ kcal, p, hc, g }) => ({ kcal: Math.round(kcal), proteina_g: Math.round(p), hidratos_g: Math.round(hc), grasa_g: Math.round(g) }))(macrosDeLineas(d.meals.flatMap(m => m.items)))
        : null,
      coachNote: d.coachNote ?? null,
      meals: d.meals.map(m => ({
        name: m.name,
        items: m.items.map(i => {
          const gramos = i.baseGrams ? Math.round(i.baseGrams * i.quantity) : null;
          return { food: i.foodLabel, ...(gramos ? { gramos } : { raciones: i.quantity }), kcal: Math.round(macrosDeLinea(i).kcal) };
        }),
      })),
    })),
    nutritionProgram: program ? {
      startDate: program.startDate,
      phases: buildPhaseEnergyPlans(program, diets),
    } : null,
  });
}

export async function getCheckinsInfo(email: string, limitN: number): Promise<string> {
  const n = Math.min(Math.max(1, Math.round(limitN || 8)), 20);
  const coachUid = auth.currentUser?.uid;
  const [allCheckins, responses, questionnaires] = await Promise.all([
    getCheckIns(),
    getResponsesForAthlete(email),
    coachUid ? getQuestionnairesByCoach(coachUid) : Promise.resolve([]),
  ]);
  const labelOf = new Map<string, string>();
  for (const q of questionnaires) for (const question of q.questions) labelOf.set(question.id, question.label);

  const checks = checkinsOf(allCheckins, email).slice(0, n);
  const recentResponses = [...responses]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, 5);

  return toResult({
    checkins: checks.map(c => ({
      id: c.id,
      date: isoDate(c.timestamp),
      weight: c.weight,
      mood: c.mood,
      adherence: c.adherence,
      notes: markAthleteText(c.notes),
      coachFeedback: c.coachFeedback || null,
      pendingFeedback: !c.coachFeedback && !c.approved,
    })),
    questionnaireResponses: recentResponses.map(r => ({
      submittedAt: r.submittedAt.slice(0, 10),
      answers: r.answers.map(a => ({ question: labelOf.get(a.questionId) ?? a.questionId, value: a.value })),
    })),
  });
}

export async function getQuestionnaireTrends(email: string, questionIds: string[] | undefined, weeksInput: number): Promise<string> {
  const weeks = Math.min(Math.max(1, Math.round(weeksInput || 8)), 26);
  const coachUid = auth.currentUser?.uid;
  const [responses, questionnaires, assignments] = await Promise.all([
    getResponsesForAthlete(email),
    coachUid ? getQuestionnairesByCoach(coachUid) : Promise.resolve([]),
    getAssignmentsForAthlete(email),
  ]);
  const qById = new Map(questionnaires.map(q => [q.id, q]));
  const aById = new Map(assignments.map(a => [a.id, a]));
  const since = addDays(hoyIsoLocal(), -weeks * 7);

  const acc = new Map<string, { label: string; qTitle: string; unit?: string; byWeek: Map<string, number[]> }>();

  for (const r of responses) {
    const date = r.submittedAt.slice(0, 10);
    if (date < since) continue;
    const q = qById.get(r.questionnaireId);
    if (!q) continue;
    const assignment = aById.get(r.assignmentId);
    const resolved = assignment ? resolveQuestions(q, assignment) : q.questions;
    for (const ans of r.answers) {
      if (questionIds && questionIds.length > 0 && !questionIds.includes(ans.questionId)) continue;
      const question = resolved.find(rq => rq.id === ans.questionId);
      if (!question) continue;
      const graphable = question.graphable || question.type === 'numeric' || question.type === 'scale' || question.type === 'metric';
      if (!graphable) continue;
      const val = Number(ans.value);
      if (isNaN(val)) continue;
      const wk = weekKey(date);
      const e = acc.get(question.id) ?? { label: question.label, qTitle: q.title, unit: question.unit, byWeek: new Map<string, number[]>() };
      const arr = e.byWeek.get(wk) ?? [];
      arr.push(val);
      e.byWeek.set(wk, arr);
      acc.set(question.id, e);
    }
  }

  const trends = [...acc.entries()].map(([id, e]) => ({
    questionId: id,
    questionnaire: e.qTitle,
    label: e.label,
    unit: e.unit ?? null,
    weeklySeries: [...e.byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, vals]) => ({
        week,
        avg: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10,
        n: vals.length,
      })),
  }));

  return toResult({ weeks, trends });
}

export async function leerContextoDelPlan(email: string): Promise<string> {
  const [roadmap, programa, tareas] = await Promise.all([
    getRoadmap(email),
    getNutritionProgram(email),
    getTasksForAthlete(email),
  ]);
  const hoy = hoyIsoLocal();

  const fases = (roadmap?.planPhases ?? []).map(f => ({
    nombre: f.name, estado: f.status, desde: f.startedAt,
    semanasOrientativas: f.suggestedWeeks, direccionPeso: f.weightDirection,
    criterioDeSalida: f.exitCriteria,
  }));

  const hitos = (roadmap?.items ?? [])
    .filter(i => !i.targetDate || i.targetDate >= hoy || i.status !== 'logrado')
    .slice(0, 25)
    .map(i => ({ titulo: i.title, tipo: i.type, carril: i.lane, fecha: i.targetDate ?? i.startDate, estado: i.status }));

  const nutricion = programa ? {
    empieza: programa.startDate,
    fases: programa.phases.map(f => ({ nombre: f.name, semanas: f.weeks, tipo: f.phaseType, objetivo: f.objetivo, kcal: f.targetKcal, dietId: f.dietId })),
    recargas: (programa.refeedDays ?? []).map(r => ({ dia: r.date, nota: r.note })),
  } : null;

  const pendientes = tareas
    .filter(t => t.status === 'pending')
    .slice(0, 20)
    .map(t => ({ titulo: t.title, tipo: t.type, dia: t.dueDate }));

  return toResult({
    fasesDelPlan: fases.length ? fases : null,
    hitosYObjetivos: hitos.length ? hitos : null,
    periodizacionNutricional: nutricion,
    tareasPendientes: pendientes.length ? pendientes : null,
    note: 'Antes de proponer nada de esto, comprueba que no esté ya puesto: duplicar un hito es peor que no ponerlo.',
  });
}

export async function leerFicha(email: string): Promise<string> {
  const [ficha, propuestas, mesos, dietas] = await Promise.all([
    getDossier(email),
    getAiProposalsForAthlete(email),
    getMesocycles(email),
    getDietsForAthlete(email),
  ]);
  const texto = renderDossier(ficha);

  // Lo que Dani tocó DESPUÉS de aprobar. Es la señal más honesta que hay sobre
  // su criterio: no lo que dijo que quería, sino lo que corrigió a mano.
  const derivas = calcularDerivas(propuestas, mesos, dietas)
    .slice(0, 6)
    .map(d => `${d.fecha.slice(0, 10)} · ${d.que}: ${d.cambios.join(' · ')}`);

  const notas = propuestas
    .filter(p => p.expediente?.notaAlAprobar?.trim())
    .slice(0, 6)
    .map(p => `${(p.reviewedAt ?? p.createdAt).slice(0, 10)} · ${p.summary}: ${p.expediente!.notaAlAprobar}`);

  if (!texto && derivas.length === 0 && notas.length === 0) {
    return toResult({
      ficha: null,
      note: 'Este atleta todavía no tiene ficha. Si de esta conversación sale algo que deba sobrevivirla, apúntalo con log_dossier_fact o propónmelo con propose_dossier_update.',
    });
  }

  return toResult({
    ficha: texto || null,
    cambiosQueHizoDani: derivas.length ? derivas : undefined,
    porQueLosHizo: notas.length ? notas : undefined,
    actualizada: ficha.updatedAt || null,
    note: derivas.length
      ? 'cambiosQueHizoDani son retoques suyos POSTERIORES a aprobar tu propuesta: trátalos como su criterio, no como un error a corregir.'
      : undefined,
  });
}

export function getFoodLibrary(mode?: string, grupo?: string): string {
  let foods = SYSTEM_FOODS;
  if (mode) foods = foods.filter(f => f.mode === mode);
  const generales = foods.map(alimentoGeneral).filter(a => !grupo || a.grupo === grupo);
  const cifras = (m: Macros) => ({ kcal: Math.round(m.kcal), p: Math.round(m.p * 10) / 10, hc: Math.round(m.hc * 10) / 10, g: Math.round(m.g * 10) / 10 });
  return toResult({
    count: generales.length,
    foods: generales.map(a => ({
      label: a.food.label, mode: a.food.mode, grupo: a.grupo, racion: a.racion,
      porRacion: cifras(a.porRacion),
      ...(a.porCien ? { porCien: cifras(a.porCien) } : { sinPesar: true }),
    })),
  });
}

// Búsqueda por palabras clave sobre la bóveda. Sin embeddings: puntúa por
// coincidencias de términos en título (peso 5) + tags (3) + cuerpo (1); devuelve
// un extracto de las mejores notas para que el modelo parafrasee sobre ellas.
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export async function searchKnowledge(queryText: string, folder?: string): Promise<string> {
  let notes = await getKnowledgeNotes();
  if (notes.length === 0) {
    return toResult({ results: [], note: 'La bóveda está vacía — Dani aún no la ha sincronizado desde el panel del asistente.' });
  }
  if (folder) notes = notes.filter(n => n.folder === folder);

  const terms = [...new Set(normalize(queryText).split(/\s+/).filter(t => t.length >= 3))];
  if (terms.length === 0) return toResult({ results: [], note: 'Consulta demasiado corta.' });

  const scored = notes.map(n => {
    const title = normalize(n.title);
    const tags = normalize(n.tags.join(' '));
    const body = normalize(n.text);
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 5;
      if (tags.includes(t)) score += 3;
      const m = body.split(t).length - 1;
      score += Math.min(m, 5); // cap por término para no premiar notas largas
    }
    return { n, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return toResult({
    query: queryText,
    results: scored.map(({ n }) => ({
      title: n.title,
      folder: n.folder,
      tags: n.tags,
      excerpt: n.text.length > 1200 ? n.text.slice(0, 1200) + '…' : n.text,
    })),
    reminder: 'Parafrasea y aplica estos principios; no cites el texto literal al atleta.',
  });
}

export async function getExerciseLibrary(muscleGroup?: string): Promise<string> {
  const exercises = await getExercises();
  const filtered = muscleGroup ? exercises.filter(e => e.muscleGroup === muscleGroup) : exercises;
  return toResult({
    count: filtered.length,
    exercises: filtered.map(e => ({
      name: e.name,
      muscleGroup: e.muscleGroup ?? null,
      primaryFocus: e.primaryFocus,
      type: e.type,
      equipment: e.equipment ?? [],
    })),
  });
}

// Qué ejercicios elige Dani de verdad. El catálogo dice lo que existe; esto
// sale de las rutinas que ya ha montado él, que es la única fuente honesta de
// su criterio de selección. Sin esto, proponer ejercicios es inventarse un
// entrenador genérico con el material de otro.
function masFrecuente(valores: string[]): string | null {
  if (valores.length === 0) return null;
  const cuenta = new Map<string, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export async function getExerciseUsage(muscleGroup?: string, athleteEmail?: string): Promise<string> {
  const [workouts, exercises] = await Promise.all([getWorkouts(), getExercises()]);
  const porId = new Map(exercises.map(e => [e.id, e]));

  let rutinas = workouts;
  let onboarding: Awaited<ReturnType<typeof getOnboarding>> = null;
  if (athleteEmail) {
    const profile = await findProfile(athleteEmail);
    if (!profile) return toResult({ error: `No existe ningún cliente con email ${athleteEmail}` });
    const [asignaciones, mesos, ob] = await Promise.all([
      getWorkoutAssignments({ uid: profile.userId, email: profile.email }),
      getMesocycles(athleteEmail),
      getOnboarding(athleteEmail),
    ]);
    onboarding = ob;
    const idsAsignados = new Set(asignaciones.map(a => a.workoutId));
    const idsMeso = new Set(mesos.map(m => m.id));
    rutinas = workouts.filter(w => idsAsignados.has(w.id) || (w.mesocycleId && idsMeso.has(w.mesocycleId)));
  }

  interface Uso {
    nombre: string; grupo: string | null; material: string[];
    veces: number; series: number[]; reps: string[]; rir: number[];
    descanso: number[]; posiciones: number[];
  }
  const usos = new Map<string, Uso>();

  for (const w of rutinas) {
    const ordenados = [...w.exercises].sort((a, b) => a.order - b.order);
    ordenados.forEach((ex, i) => {
      const cat = porId.get(ex.exerciseId);
      const grupo = ex.muscleGroup ?? cat?.muscleGroup ?? null;
      if (muscleGroup && grupo !== muscleGroup) return;
      const clave = ex.exerciseId;
      const uso = usos.get(clave) ?? {
        nombre: cat?.name ?? `(ejercicio borrado ${clave})`,
        grupo, material: cat?.equipment ?? [],
        veces: 0, series: [], reps: [], rir: [], descanso: [], posiciones: [],
      };
      uso.veces += 1;
      uso.series.push(ex.sets);
      if (ex.reps) uso.reps.push(ex.reps);
      if (typeof ex.rir === 'number') uso.rir.push(ex.rir);
      if (ex.restSeconds) uso.descanso.push(ex.restSeconds);
      uso.posiciones.push(i + 1);
      usos.set(clave, uso);
    });
  }

  const lista = [...usos.values()]
    .sort((a, b) => b.veces - a.veces)
    .map(u => ({
      ejercicio: u.nombre,
      grupo: u.grupo,
      material: u.material,
      vecesProgramado: u.veces,
      seriesHabituales: mediana(u.series),
      repsHabituales: masFrecuente(u.reps),
      rirHabitual: mediana(u.rir),
      descansoHabitualSeg: mediana(u.descanso),
      posicionMediaEnLaSesion: mediana(u.posiciones),
    }));

  // Los que existen en el catálogo y Dani no ha puesto NUNCA. No es una
  // laguna a rellenar: casi siempre es una decisión suya.
  const usados = new Set([...usos.keys()]);
  const nuncaUsados = exercises
    .filter(e => !usados.has(e.id) && (!muscleGroup || e.muscleGroup === muscleGroup))
    .map(e => e.name);

  return toResult({
    ambito: athleteEmail ? `rutinas de ${athleteEmail}` : 'todas las rutinas de Dani',
    rutinasAnalizadas: rutinas.length,
    ejercicios: lista.slice(0, 60),
    nuncaProgramados: nuncaUsados.slice(0, 40),
    ...(onboarding ? {
      esteAtleta: {
        material: onboarding.equipment ?? [],
        ejerciciosFavoritos: onboarding.favoriteExercises ?? [],
        ejerciciosQueOdia: onboarding.hatedExercises ?? [],
        minutosPorSesion: onboarding.sessionMaxMinutes ?? null,
      },
    } : {}),
    note: 'seriesHabituales/repsHabituales/rirHabitual son lo que Dani pone de verdad, no una recomendación de libro. Si te sales de ahí, di por qué.',
  });
}

// Lo que Dani corrige a mano después de aprobar. Ya se le contaba por atleta
// dentro de la ficha viva; el patrón sólo aparece mirando toda la cartera —
// una corrección es una anécdota, la misma corrección cinco veces es su
// criterio, y hacérsela repetir cada bloque es el fallo que esto evita.
export async function getCoachAdjustments(athleteEmail?: string): Promise<string> {
  const propuestas = athleteEmail
    ? (await getAiProposalsForAthlete(athleteEmail)).filter(p => p.status === 'approved')
    : await getApprovedAiProposals();

  if (propuestas.length === 0) {
    return toResult({
      ajustes: [],
      note: 'Todavía no hay propuestas aprobadas con las que comparar. Propón con el criterio de la doctrina y la ficha.',
    });
  }

  // Solo los atletas que tienen algo aprobado: no barrer la cartera entera.
  // Y de esos, solo los que han aceptado el análisis: sin esto la vista de
  // cartera sacaba derivas de atletas sin consentimiento (28-10-2026).
  const candidatos = [...new Set(propuestas.map(p => p.athleteId))];
  const consentidos = await Promise.all(candidatos.map(async e => {
    try { return estadoConsentimiento(await getOnboarding(e)) === 'aceptado'; } catch { return false; }
  }));
  const emails = candidatos.filter((_, i) => consentidos[i]);
  const porAtleta = await Promise.all(emails.map(async email => {
    const [mesos, dietas] = await Promise.all([getMesocycles(email), getDietsForAthlete(email)]);
    return calcularDerivas(propuestas.filter(p => p.athleteId === email), mesos, dietas)
      .map(d => ({ ...d, atleta: aliasDeAtleta(undefined, email) }));
  }));

  const derivas = porAtleta.flat().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const patrones = resumirPatrones(derivas);

  return toResult({
    ambito: athleteEmail ? `ajustes en ${athleteEmail}` : 'ajustes en toda la cartera',
    propuestasAprobadas: propuestas.length,
    aplicadasTalCual: propuestas.length - derivas.length,
    patronesQueSeRepiten: patrones.length ? patrones : undefined,
    ultimosAjustes: derivas.slice(0, 20).map(d => `${d.fecha.slice(0, 10)} · ${d.atleta} · ${d.que}: ${d.cambios.join(' · ')}`),
    note: 'Esto es criterio de Dani, no errores suyos. Si un patrón se repite, incorpóralo a la propuesta en vez de proponer lo mismo otra vez.',
  });
}

/* ── Reparto: la calculadora y «Mis repartos» (16-10) ──────────────────────
   Las mismas piezas que usa Dani en Mesociclo › Distribución, para que lo que
   propone el asistente salga del mismo motor y no de una regla de memoria. */
export async function calcularRepartoTool(email: string | undefined, input: Record<string, unknown>): Promise<string> {
  const diasSemana = diasSemanaDesdeAsistente(input.dias_semana);
  const mesos = email ? await getMesocycles(email) : [];
  const actual = mesoActivo(mesos, hoyIsoLocal()) ?? [...mesos].sort((a, b) => b.number - a.number)[0] ?? null;

  const seriesPedidas = (input.series ?? {}) as Record<string, unknown>;
  const grupos = Object.fromEntries(MUSCLE_ORDER.map(g => {
    const s = Number(seriesPedidas[g]);
    const series = seriesPedidas[g] !== undefined && Number.isFinite(s) && s >= 0 ? s : (actual?.groups[g]?.series ?? 0);
    return [g, { series, priority: actual?.groups[g]?.priority ?? 'media' }];
  })) as Record<MuscleGroup, MuscleGroupConfig>;

  const pedidas = (input.frecuencias ?? {}) as Record<string, unknown>;
  const frecuencias = Object.fromEntries(MUSCLE_ORDER.map(g => {
    const f = Number(pedidas[g]);
    return [g, pedidas[g] !== undefined && Number.isFinite(f) && f >= 0 ? Math.round(f * 2) / 2 : frecuenciaPorDefecto(grupos[g].series)];
  })) as Record<MuscleGroup, number>;

  const inicioSemana = actual?.startDate ? (new Date(`${actual.startDate}T12:00:00`).getDay() + 6) % 7 : 0;
  const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
  return toResult(calcularRepartoParaAsistente({
    diasSemana, inicioSemana, frecuencias, grupos,
    maxSeriesSesion: n(input.max_series_sesion), maxSeriesGrupoSesion: n(input.max_series_grupo_sesion),
  }, actual));
}

export async function listMisRepartos(): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) return toResult({ repartos: [], note: 'Sin sesión de coach no se pueden leer.' });
  try {
    const lista = await getRepartosGuardados(uid);
    return toResult({
      repartos: lista.map(r => ({ ...repartoParaAsistente(r), sesiones: sesionesDelReparto(r), cicloDias: r.dias.length })),
      note: lista.length ? 'Pásale el que encaje a propose_mesocycle en "reparto".' : 'Dani no tiene repartos guardados todavía.',
    });
  } catch {
    return toResult({ repartos: [], note: 'No se han podido leer «Mis repartos» (puede que sus reglas aún no estén desplegadas).' });
  }
}

async function cargarDatosDeRetos(email: string) {
  const profile = await findProfile(email);
  if (!profile) return null;
  const [stepLogs, bodyweightLogs, workoutLogs, exercises, completionLogs, diets, assignments, roadmap, cardioSessions, history] = await Promise.all([
    getStepsForAthlete(email), getBodyweightForAthlete(email), getWorkoutLogs(email), getExercises(),
    getDietCompletionLogsForAthlete(email), getDietsForAthlete(email),
    getWorkoutAssignments({ uid: profile.userId, email: profile.email }), getRoadmap(email),
    getCardioSessionsForAthlete(email), getWeeklyChallengesForAthlete(email),
  ]);
  return {
    stepLogs, bodyweightLogs, workoutLogs, exercises, completionLogs,
    coachDiets: diets.filter(d => !d.selfManaged), assignments,
    liftExerciseIds: roadmap?.challengeConfig?.liftExerciseIds, cardioSessions, history,
  };
}

export async function getChallengeOptions(email: string): Promise<string> {
  const datos = await cargarDatosDeRetos(email);
  if (!datos) return toResult({ error: `No existe ningún cliente con email ${email}` });
  const today = hoyIsoLocal();
  const actual = await getWeeklyChallenge(email, isoWeekKey(today));
  const opciones = generateChallengeOptions({ ...datos, athleteId: email, today });
  const memoria = buildChallengeMemory(datos.history, isoWeekKey(today));
  const ultimos = [...datos.history].sort((a, b) => b.isoWeek.localeCompare(a.isoWeek)).slice(0, 4)
    .map(c => ({ semana: c.isoWeek, titulo: c.title, tipo: c.kind, estado: c.status, dificultad: c.difficulty ?? null, origen: c.origin }));
  return toResult({
    semana: isoWeekKey(today),
    retoDeEstaSemana: actual ? { titulo: actual.title, tipo: actual.kind, estado: actual.status, origen: actual.origin, objetivo: `${actual.metric.target} ${actual.metric.unit}` } : null,
    ultimosRetos: ultimos,
    retosResueltos: memoria.resolvedCount,
    retosConseguidos: memoria.wonCount,
    tasaDeExito: memoria.resolvedCount > 0 ? Math.round(memoria.winRate * 100) : null,
    opciones: opciones.slice(0, 6).map(o => ({
      kind: o.kind, title: o.title, description: o.description, reason: o.reason, difficulty: o.difficulty,
      score: o.score, metric: o.metric, isMilestone: !!o.isMilestone,
    })),
    note: 'Las opciones salen del motor de retos de la app con SUS datos (memoria de 4 semanas, dificultad adaptativa). Para poner una, llama a propose_weekly_challenge copiando kind, title, description y metric tal cual; si ya hay reto esta semana, la propuesta lo sustituye al aprobar.',
  });
}
export async function getProposalFeedback(email: string): Promise<string> {
  const pendientes = (await getAiProposalsForAthlete(email)).filter(p => p.status === 'proposed');
  if (pendientes.length === 0) {
    return toResult({ pendientes: [], note: 'Este atleta no tiene ninguna propuesta tuya pendiente. Si te pide ajustar algo, proponlo de nuevo desde cero.' });
  }
  return toResult({
    pendientes: pendientes.map(p => ({
      proposalId: p.id,
      tipo: p.kind,
      resumen: p.summary,
      creada: p.createdAt.slice(0, 10),
      comentariosDeDani: (p.comentarios ?? []).map(c => `${c.at.slice(0, 10)}: ${c.text}`),
    })),
    note: 'Los comentarios son de Dani y mandan sobre lo que tú propusiste. Vuelve a proponer atendiéndolos (la propuesta nueva sustituye a la vieja cuando él la apruebe) y di qué has cambiado por cada uno. Una propuesta sin comentarios está esperando su decisión: no la rehagas si no te lo pide.',
  });
}

export async function getProgressMetrics(email: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });
  const coachUid = auth.currentUser?.uid;
  const [medidas, bwLogs, responses, questionnaires] = await Promise.all([
    getBodyMeasurementsForAthlete(email),
    getBodyweightForAthlete(email),
    getResponsesForAthlete(email),
    coachUid ? getQuestionnairesByCoach(coachUid) : Promise.resolve([]),
  ]);
  if (medidas.length === 0 && bwLogs.length === 0) {
    return toResult({ note: 'Este atleta no tiene todavía ni mediciones corporales ni registros de peso: no hay progreso que medir.' });
  }

  const sexo = leerSexo(responses, questionnaires);
  const alturaCm = [...medidas].reverse().find(m => m.metricKey === 'altura')?.value;
  const pesoEn = (fecha: string): number | null => {
    const previos = bwLogs.filter(b => b.date <= fecha).sort((a, b) => a.date.localeCompare(b.date));
    return previos.length ? previos[previos.length - 1].weight : null;
  };

  // Un resumen por perímetro, con su margen de error: un cambio por debajo del
  // MDC es ruido de la cinta métrica, no progreso.
  const porMetrica = new Map<string, { date: string; value: number }[]>();
  for (const m of medidas) {
    if (!porMetrica.has(m.metricKey)) porMetrica.set(m.metricKey, []);
    porMetrica.get(m.metricKey)!.push({ date: m.date, value: m.value });
  }
  const perimetros = [...porMetrica.entries()]
    .map(([clave, pts]) => {
      const r = resumirSerie({
        id: clave,
        label: BODY_METRIC_LABELS[clave as BodyMetricKey] ?? clave,
        unit: clave === 'bodyweight' ? 'kg' : 'cm',
        points: [...pts].sort((a, b) => a.date.localeCompare(b.date)),
        mejorSiSube: null,
        umbralRuido: mdcDeMetrica(clave as BodyMetricKey) ?? 0,
      });
      return r && {
        medida: r.label, desde: r.desde, mediciones: r.puntos,
        primero: r.primero, ultimo: r.ultimo, cambio: r.delta,
        esRuidoDeMedicion: r.direccion === 'neutro' && r.delta !== 0,
      };
    })
    .filter(Boolean);

  // Composición corporal por fecha de medición (mismo cálculo que la pantalla).
  const porFecha = new Map<string, Partial<Record<BodyMetricKey, number>>>();
  for (const m of medidas) {
    if (m.metricKey === 'bodyweight' || m.metricKey === 'altura') continue;
    if (!porFecha.has(m.date)) porFecha.set(m.date, {});
    porFecha.get(m.date)![m.metricKey] = m.value;
  }
  const composicion: { fecha: string; pctGrasa: number; masaMagraKg: number | null; irc: number | null }[] = [];
  let ultimosIndices: Record<string, number> | null = null;
  for (const [fecha, vals] of [...porFecha.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const snapshot: Partial<Record<BodyMetricKey, { value: number }>> = {};
    for (const [k, v] of Object.entries(vals)) snapshot[k as BodyMetricKey] = { value: v! };
    if (alturaCm != null) snapshot.altura = { value: alturaCm };
    const indices = computeAnthropometricIndices(snapshot as Parameters<typeof computeAnthropometricIndices>[0]);
    ultimosIndices = Object.fromEntries(
      Object.entries(indices)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [ANTHROPOMETRIC_INDEX_LABELS[k as keyof typeof ANTHROPOMETRIC_INDEX_LABELS] ?? k, v as number]),
    );
    if (!sexo || alturaCm == null || vals.cuello == null || vals.cintura == null) continue;
    const pct = pctGrasaUSNavy({ sexo, cuelloCm: vals.cuello, cinturaCm: vals.cintura, caderaCm: vals.cadera, alturaCm });
    if (pct == null) continue;
    const peso = pesoEn(fecha);
    const magra = peso != null ? masaMagraEstimadaKg(peso, pct) : null;
    const whtr = indices.whtr;
    composicion.push({
      fecha, pctGrasa: pct, masaMagraKg: magra,
      irc: magra != null && whtr != null ? computeIRC(magra, whtr) : null,
    });
  }

  const irp = historialIRP({ responses, questionnaires });
  const resumenIrp = resumirSerie({ id: 'irp', label: 'IRP (readiness)', points: irp, mejorSiSube: true });

  return toResult({
    sexoConocido: sexo ?? null,
    alturaCm: alturaCm ?? null,
    perimetros,
    composicionCorporal: composicion.slice(-6),
    indicesAntropometricos: ultimosIndices,
    readiness: resumenIrp ? { ultimo: resumenIrp.ultimo, cambio: resumenIrp.delta, desde: resumenIrp.desde, mediciones: resumenIrp.puntos } : null,
    note: composicion.length === 0
      ? 'Sin % de grasa: hace falta sexo (de la anamnesis), altura, cuello y cintura en la misma medición. Si falta, díselo a Dani con add_coach_task en vez de estimarlo a ojo.'
      : 'El % de grasa es una estimación US Navy por perímetros, no una analítica. Un cambio marcado como ruido de medición NO es progreso.',
  });
}

export async function getNutritionAnalysis(email: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });
  const [diets, dietConfig, completionLogs, stepLogs, bodyweightLogs, onboarding, nutriConfig, programa] = await Promise.all([
    getDietsForAthlete(email), getAthleteDietConfig(email), getDietCompletionLogsForAthlete(email),
    getStepsForAthlete(email), getBodyweightForAthlete(email), getOnboarding(email), getAthleteNutritionConfig(email),
    getNutritionProgram(email).catch(() => null),
  ]);
  const coachDiets = diets.filter(d => !d.selfManaged);
  const activeDiet = dietaDeReferencia(diets, dietConfig, programa, hoyIsoLocal());
  // La fase que rige hoy: sin ella, los macros se comparaban contra el alta
  // —calculada para mantener— y cualquier atleta en déficit salía con una
  // alerta falsa que el modelo leía como un problema del plan.
  const faseActiva = programa && programa.phases.length > 0
    ? computeActivePhase(programa, hoyIsoLocal())
    : null;
  const informe = buildNutritionReport({
    completionLogs, diets: coachDiets, activeDiet, stepLogs, stepGoal: nutriConfig.stepGoal ?? 8000,
    bodyweightLogs, targetWeight: profile.targetWeight || undefined, onboarding, faseActiva,
  });
  return toResult({
    dietaActiva: activeDiet ? { id: activeDiet.id, nombre: activeDiet.name, objetivo: objetivoParaElAsistente(activeDiet) } : null,
    objetivoPasos: nutriConfig.stepGoal ?? null,
    resumen: informe.summary,
    adherencia: informe.adherence,
    pasos: informe.steps,
    faseDeNutricion: faseActiva ? { nombre: faseActiva.name, kcal: faseActiva.targetKcal ?? null } : null,
    desviacionMacros: informe.macroDeviation,
    tendenciaPeso: informe.weightTrend,
    alertas: informe.flags,
    note: 'Es el mismo análisis que Dani ve en Cliente › Revisión › Adherencia y hábitos. Ventana: la de la app (últimas semanas con registro).',
  });
}

/**
 * La Revisión del coach, para el asistente.
 *
 * Todo lo que devuelve sale de `buildRevisionCoach` y `construirTitulares`, que
 * son los MISMOS motores que pintan la pantalla que Dani graba en vídeo. No hay
 * un segundo cálculo aquí: si el asistente redactara el feedback a partir de los
 * logs crudos, diría porcentajes que no coinciden con los que el coach tiene
 * delante, y el cliente vería dos versiones del mismo mes.
 *
 * Se manda MASTICADO, no en crudo: los titulares ya ordenados, los patrones y
 * los grupos con su zona, el bienestar y el resumen de comida. Volcar los logs
 * de cuatro semanas era lo que hacía `get_training_history` y se lleva miles de
 * tokens en decirle al modelo lo que el motor ya resolvió.
 */
export async function getRevisionEngine(email: string, periodoPedido: string): Promise<string> {
  const coachUid = auth.currentUser?.uid;
  const [logs, exercises, mesos, responses, questionnaires, landmarks, registros, dietas, bwLogs] =
    await Promise.all([
      getWorkoutLogs(email),
      getExercises(),
      getMesocycles(email),
      getResponsesForAthlete(email),
      coachUid ? getQuestionnairesByCoach(coachUid) : Promise.resolve([]),
      getVolumeLandmarks().catch(() => undefined),
      getDietCompletionLogsForAthlete(email),
      getDietsForAthlete(email),
      getBodyweightForAthlete(email),
    ]);

  const hoy = hoyIsoLocal();
  const activo = mesoActivo(mesos, hoy);
  const periodo: PeriodoRevision =
    periodoPedido === '7d' ? { tipo: '7d' }
    : periodoPedido === '14d' ? { tipo: '14d' }
    : activo ? { tipo: 'meso', mesoId: activo.id }
    : { tipo: '7d' };

  const revision = buildRevisionCoach({
    logs, exercises, mesocycles: mesos, periodo, landmarks, hoy, responses, questionnaires,
  });
  const { ventana, informe, bienestar } = revision;

  const comida = construirComidaDeLaSemana({
    logs: registros, diets: dietas, desde: ventana.desde, hasta: ventana.hasta,
  });
  const peso = pesoVsSemanaPasada(bwLogs, ventana.desde, ventana.hasta);
  const { titulares, resumenParaCliente } = construirTitulares({ revision, comida, peso });

  return toResult({
    ventana: {
      desde: ventana.desde, hasta: ventana.hasta,
      etiqueta: ventana.etiqueta, comparacion: ventana.etiquetaComparacion,
    },
    titulares: titulares.map(t => ({ tono: t.tono, texto: t.texto, paraCliente: t.paraCliente ?? null })),
    borradorParaElCliente: resumenParaCliente,
    entreno: {
      sesiones: informe.sessions,
      tonelaje: informe.tonnage,
      records: informe.perExercise.filter(e => e.isPR).map(e => e.name),
      suben: revision.suben.map(e => ({ ejercicio: e.name, deltaPct: e.deltaOrmPct })),
      bajan: revision.bajan.map(e => ({ ejercicio: e.name, deltaPct: e.deltaOrmPct })),
      patrones: revision.patrones.map(p => ({ patron: p.label, series: p.sets, deltaOrmPct: p.ormDeltaPct })),
    },
    volumenPorGrupo: revision.mapa
      .filter(c => c.realizadasSemana > 0 || c.planificadasSemana != null)
      .map(c => ({
        grupo: c.label, seriesSemana: c.realizadasSemana, programadas: c.planificadasSemana,
        zona: c.zonaLabel, prioridad: c.prioridad, cumplimientoPct: c.cumplimientoPct,
        agujetasCronicas: bienestar.domsPorGrupo[c.group] ?? null,
      })),
    comoHaLlegado: {
      disposicion: bienestar.irp.valor,
      sueñoHoras: bienestar.irp.horasSueño,
      estres: bienestar.irp.estres,
      agujetasCronicas: bienestar.domsCronico.map(d => ({ grupo: d.grupo, media: d.media })),
    },
    comida: {
      diasRegistrados: comida.patrones.diasRegistrados,
      diasSinRegistrar: comida.patrones.diasSinRegistrar,
      diasPorEncima: comida.patrones.diasPorEncima,
      diasPorDebajo: comida.patrones.diasPorDebajo,
      kcalMediaComido: comida.patrones.kcalMediaComido,
      kcalMediaCupo: comida.patrones.kcalMediaCupo,
      alimentosFrecuentes: comida.patrones.alimentosFrecuentes.slice(0, 8),
    },
    peso: { estaSemana: peso.estaSemana, deltaKg: peso.deltaKg },
    note: 'Son los mismos números que Dani tiene delante en Cliente › Revisión. Los `titulares` ya están ordenados por lo que cambia una decisión, y `paraCliente` es la única versión que se le puede decir al atleta: lo que salga a null es criterio de coach y NO se le cuenta.',
  });
}

/**
 * El sugeridor de volumen, para el asistente.
 *
 * Mismo motor que el botón «Sugerir volumen» del editor de mesociclos:
 * `suggestVolume` sobre `buildVolumeHistoryFrom`. El modelo proponía repartos
 * de series a ojo, y eso tiene dos problemas — no conoce los umbrales por grupo
 * de la doctrina de Dani (el MAV del pecho no es el del antebrazo) y no mira lo
 * que pasó en el bloque anterior. El motor sí hace las dos cosas, y además
 * devuelve `razones`, así que la propuesta se puede auditar en vez de tener que
 * creérsela.
 */
export async function getVolumeSuggestion(
  email: string,
  input: Record<string, unknown>,
): Promise<string> {
  const coachUid = auth.currentUser?.uid;
  const mesos = await getMesocycles(email);
  // Las asignaciones se piden por los ids de los bloques, no por atleta: es la
  // misma consulta acotada que usa «Sugerir volumen» en el editor, y evita
  // traerse el calendario entero de alguien que lleva un año.
  const mesoIds = mesos.map(m => m.id);
  const [logs, exercises, assignments, responses, questionnaires, landmarks, onboarding] =
    await Promise.all([
      getWorkoutLogs(email),
      getExercises(),
      mesoIds.length > 0 ? getWorkoutAssignmentsByMesocycleIds(mesoIds) : Promise.resolve([]),
      getResponsesForAthlete(email),
      coachUid ? getQuestionnairesByCoach(coachUid) : Promise.resolve([]),
      getVolumeLandmarks().catch(() => VOLUME_LANDMARKS_DEFAULT),
      getOnboarding(email).catch(() => null),
    ]);

  const hoy = hoyIsoLocal();
  const actual = mesoActivo(mesos, hoy) ?? [...mesos].sort((a, b) => b.number - a.number)[0] ?? null;

  const history = buildVolumeHistoryFrom({
    mesocycles: mesos,
    currentId: actual?.id ?? '',
    logs, exercises, assignments, responses, questionnaires,
  });

  const diasPorSemana = Number(input.dias_por_semana) > 0
    ? Math.round(Number(input.dias_por_semana))
    : (actual?.daysPerWeek ?? 4);

  const nivel = ['principiante', 'intermedio', 'avanzado'].includes(String(input.nivel))
    ? (input.nivel as ExperienceLevel)
    : ((onboarding?.experienceLevel as ExperienceLevel) ?? 'intermedio');

  const intent: VolumeIntent = ['conservador', 'estandar', 'agresivo'].includes(String(input.intencion))
    ? (input.intencion as VolumeIntent)
    : 'estandar';

  // Lo que no venga se queda en 'media'. Nunca se hereda del bloque anterior a
  // ciegas: si el coach quiere repetir prioridades, las dice.
  const pedidas = (input.prioridades ?? {}) as Record<string, string>;
  const priorities = {} as Record<MuscleGroup, 'alta' | 'media' | 'baja'>;
  for (const g of MUSCLE_ORDER) {
    const v = pedidas[g];
    priorities[g] = v === 'alta' || v === 'baja' ? v : 'media';
  }

  const r = suggestVolume({
    landmarks: landmarks ?? VOLUME_LANDMARKS_DEFAULT,
    daysPerWeek: diasPorSemana,
    splitId: actual?.splitId,
    reparto: actual ? repartoDelMesociclo(actual) : undefined,
    level: nivel,
    intent,
    priorities,
    history,
  });

  return toResult({
    partiendoDe: {
      bloqueAnterior: actual ? { id: actual.id, numero: actual.number, nombre: actual.name } : null,
      diasPorSemana, nivel, intencionPedida: intent, intencionAplicada: r.intentAplicado,
    },
    totalSeries: r.totalSeries,
    grupos: MUSCLE_ORDER.map(g => ({
      grupo: MUSCLE_LABELS[g],
      clave: g,
      series: r.groups[g].series,
      prioridad: r.groups[g].priority,
      porQue: r.reasons[g],
    })).filter(x => x.series > 0 || x.prioridad === 'alta'),
    avisos: r.warnings,
    note: r.intentAplicado !== intent
      ? `El motor ha bajado la intención a "${r.intentAplicado}" por la recuperación del bloque anterior. Respétalo.`
      : 'Son los mismos números que salen en «Sugerir volumen» del editor de mesociclos. Si te desvías de alguno en propose_mesocycle, di por qué.',
  });
}

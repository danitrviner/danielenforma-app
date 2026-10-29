/* ═══════════════════════════════════════════════════════════════════════════
   APLICAR UNA PROPUESTA — la decisión, sin la escritura.

   Hasta el 28-10-2026 esto vivía dentro de `useProposalActions.ts`, mezclado
   con React (`useQueryClient`, `setError`) y con las funciones de `dbService`
   (SDK de cliente, espejo en localStorage). Eso tenía dos consecuencias: no se
   podía probar sin montar un componente, y no se podía ejecutar en un servidor
   —que es justo lo que el autopiloto necesita.

   Aquí no se escribe nada. Se recibe la propuesta y un LECTOR (quien llama
   decide si lee con el SDK de cliente o con el de administración), y se
   devuelve:
     · la lista de OPERACIONES de dominio que hay que ejecutar, en orden;
     · el SNAPSHOT de lo que había antes en cada documento que se va a tocar,
       que es lo que permite «Deshacer»;
     · o un MOTIVO para no aplicar (dieta por nombre que no existe, bloque sin
       sesiones, mesociclo borrado), que antes era un `setError` en el hook.

   Las operaciones son de dominio («crearDieta», «guardarRoadmap»), no de
   Firestore: el ejecutor del cliente las traduce a las funciones de `dbService`
   de siempre (con sus espejos, sus sellos de catálogo y su historial de
   cambios), y el del servidor al SDK de administración. Una propuesta aplicada
   desde cualquiera de los dos deja exactamente los mismos documentos.

   Los ids que se generan al crear (dieta nueva de una fase, mesociclo nuevo)
   no se conocen aquí: la operación lleva una `ref` y lo que la necesite usa
   `$ref:<nombre>`; el ejecutor la sustituye por el id real.
   ═══════════════════════════════════════════════════════════════════════════ */

import type {
  AiProposal, AthleteDietConfig, AthleteDossier, AthleteNutritionConfig, CardioAssignment, CardioProgram, Diet,
  DossierPatch, Exercise, LevelLadder, Mesocycle, MesocycleTemplate, MesocycleTemplateProposalPayload,
  NutritionPhase, NutritionProgram, NutritionProgramProposalPayload, PeriodizationBlockPayload, PhotoAssignment,
  PublishBlockProposalPayload, QuestionnaireAssignment, Roadmap, RoadmapProposalPayload, SetupConfigProposalPayload,
  SnapshotDocumento, SpecialDayProposalPayload, TaskItem, TemplateStage, UserProfile, WeekDay, WeekPlanProposalPayload,
  WeeklyChallenge, WeeklyChallengeProposalPayload, WeightCheckIn, Workout, WorkoutAssignment, WorkoutDaysProposalPayload,
  WorkoutExercise, WorkoutTemplateProposalPayload,
} from '../types';
import { rirDescendente, subirSeries, programarEnSemanas } from '../utils/semanasDelBloque';
import { programarAjuste } from '../utils/semanasNutricion';
import { objetivoDeDieta } from '../utils/macrosLegado';
import { vueltasDelCiclo } from '../utils/progression';
import { sesionesDeMesociclo, fechasDelMesociclo, cicloDiasDeMeso } from '../utils/asignacionMesociclo';
import { prescripcionDeSemana, ZONA2_BASE_MIN_DEFECTO } from '../utils/cardioProgression';
import { isoWeekKey, isoWeekBounds } from '../utils/challengeOptions';
import { nombreDeSesion } from '../utils/nombresMeso';
import { nombrePropioDeSesion } from '../utils/draftEjercicios';
import { repartoDelMesociclo, tiposDeEntrenamiento } from '../utils/trainingSplits';
import { distribucionDeMeso } from '../utils/distribucionDeMeso';
import { addDays } from '../utils/trainingWeek';

// ── Lo que hay que poder leer ────────────────────────────────────────────────

export interface LectorAplicacion {
  dietas(email: string): Promise<Diet[]>;
  mesociclos(email: string): Promise<Mesocycle[]>;
  /** Todas las rutinas del coach (como `getWorkouts`). */
  rutinas(): Promise<Workout[]>;
  roadmap(email: string): Promise<Roadmap | null>;
  programa(email: string): Promise<NutritionProgram | null>;
  perfil(email: string): Promise<UserProfile | null>;
  asignaciones(perfil: UserProfile): Promise<WorkoutAssignment[]>;
  configNutricion(email: string): Promise<AthleteNutritionConfig | null>;
  configDieta(email: string): Promise<AthleteDietConfig | null>;
  ejercicios(): Promise<Exercise[]>;
  /** Opcionales: solo para el snapshot. Sin ellos la propuesta se aplica igual
   *  pero esa parte no se puede deshacer. */
  checkin?(id: string): Promise<WeightCheckIn | null>;
  ficha?(email: string): Promise<AthleteDossier | null>;
}

export interface OpcionesAplicacion {
  /** UID del coach: `ownerId` de las rutinas y plantillas nuevas. */
  coachUid: string;
  /** ISO de «ahora»; inyectable para que los ids y las fechas sean deterministas en tests. */
  ahora: string;
}

// ── Las operaciones de dominio ───────────────────────────────────────────────

export type Operacion =
  | { tipo: 'crearDieta'; ref: string; dieta: Omit<Diet, 'id'> }
  | { tipo: 'actualizarDieta'; id: string; cambios: Partial<Diet> }
  | { tipo: 'crearMesociclo'; ref: string; mesociclo: Omit<Mesocycle, 'id'> }
  | { tipo: 'actualizarMesociclo'; id: string; cambios: Partial<Omit<Mesocycle, 'id'>> }
  | { tipo: 'crearRutina'; ref: string; rutina: Omit<Workout, 'id'> }
  | { tipo: 'actualizarRutina'; id: string; cambios: Partial<Workout> }
  | { tipo: 'crearAsignacion'; asignacion: Omit<WorkoutAssignment, 'id'> }
  | { tipo: 'actualizarAsignacion'; id: string; cambios: Partial<WorkoutAssignment> }
  | { tipo: 'guardarRoadmap'; roadmap: Roadmap }
  | { tipo: 'guardarPrograma'; programa: NutritionProgram }
  | { tipo: 'crearTarea'; tarea: Omit<TaskItem, 'id'> }
  | { tipo: 'guardarJuicioFicha'; athleteId: string; patch: DossierPatch }
  | { tipo: 'actualizarPerfil'; userId: string; cambios: Partial<UserProfile> }
  | { tipo: 'guardarConfigNutricion'; config: AthleteNutritionConfig }
  | { tipo: 'guardarConfigDieta'; config: AthleteDietConfig }
  | { tipo: 'asignarCuestionario'; asignacion: Omit<QuestionnaireAssignment, 'id'> }
  | { tipo: 'asignarFotos'; asignacion: Omit<PhotoAssignment, 'id'> }
  | { tipo: 'crearCardio'; asignacion: Omit<CardioAssignment, 'id'> }
  | { tipo: 'guardarReto'; reto: WeeklyChallenge }
  | { tipo: 'crearPlantillaMesociclo'; ref: string; plantilla: Omit<MesocycleTemplate, 'id'> }
  | { tipo: 'feedbackCheckin'; checkInId: string; feedback: string };

/** Colección de Firestore que toca cada operación (para el snapshot de lo creado). */
export const COLECCION_DE_OPERACION: Record<Operacion['tipo'], string> = {
  crearDieta: 'diets', actualizarDieta: 'diets',
  crearMesociclo: 'mesocycles', actualizarMesociclo: 'mesocycles',
  crearRutina: 'workouts', actualizarRutina: 'workouts',
  crearAsignacion: 'workoutAssignments', actualizarAsignacion: 'workoutAssignments',
  guardarRoadmap: 'roadmaps', guardarPrograma: 'nutritionPrograms', crearTarea: 'tasks',
  guardarJuicioFicha: 'athleteStatus', actualizarPerfil: 'user_profiles',
  guardarConfigNutricion: 'athleteNutritionConfigs', guardarConfigDieta: 'athleteDietConfigs',
  asignarCuestionario: 'questionnaireAssignments', asignarFotos: 'photoAssignments', crearCardio: 'cardioAssignments',
  guardarReto: 'weeklyChallenges', crearPlantillaMesociclo: 'mesocycleTemplates', feedbackCheckin: 'checkins',
};

export type ResultadoAplicacion =
  | {
      ok: true;
      operaciones: Operacion[];
      /** Documentos que EXISTÍAN y se van a tocar, tal y como estaban. Los
       *  creados los añade el ejecutor cuando sabe su id. */
      snapshotAntes: SnapshotDocumento[];
      /** Id de la entidad resultante, o la `ref` de la que se crea. */
      resultEntityId?: string;
      resultEntityRef?: string;
    }
  | { ok: false; motivo: string };

const REF = (nombre: string) => `$ref:${nombre}`;

/** Una propuesta de antes de pasar a kcal trae solo el cupo en intercambios:
 *  se le pone su objetivo. Sin esto, al aplicarla sobre una dieta que ya tiene
 *  `objetivo` se cambiaría el cupo y el objetivo viejo seguiría mandando. */
function conObjetivo<T extends Pick<Diet, 'objetivo' | 'budget'>>(d: T): T {
  return d.objetivo ? d : { ...d, objetivo: objetivoDeDieta(d) };
}

const sinId = <T extends { id: string }>(doc: T): Record<string, unknown> => {
  const { id: _id, ...resto } = doc;
  return resto as Record<string, unknown>;
};
const sinAthleteId = <T extends { athleteId: string }>(doc: T): Record<string, unknown> => {
  const { athleteId: _a, ...resto } = doc;
  return resto as Record<string, unknown>;
};
const foto = (coleccion: string, id: string, datos: Record<string, unknown> | null, parcial = false): SnapshotDocumento =>
  ({ coleccion, id, datos, ...(parcial ? { parcial: true } : {}) });

/**
 * Decide qué hay que escribir para aplicar `p`. No escribe. Lanza solo por
 * errores de lectura; lo que es decisión («no encuentro estas dietas») vuelve
 * como `{ ok: false, motivo }`.
 */
export async function aplicarPropuesta(
  p: AiProposal, lector: LectorAplicacion, opciones: OpcionesAplicacion,
): Promise<ResultadoAplicacion> {
  const { ahora } = opciones;
  const ops: Operacion[] = [];
  const antes: SnapshotDocumento[] = [];

  switch (p.kind) {
    case 'checkinFeedback': {
      const { checkInId, feedback } = p.payload as { checkInId: string; feedback: string };
      const previo = lector.checkin ? await lector.checkin(checkInId) : null;
      if (previo) antes.push(foto('checkins', checkInId, { coachFeedback: previo.coachFeedback ?? null, approved: previo.approved ?? false, approvedAt: previo.approvedAt ?? null }, true));
      ops.push({ tipo: 'feedbackCheckin', checkInId, feedback });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: checkInId };
    }

    case 'diet': {
      const dietPayload = conObjetivo(p.payload as Omit<Diet, 'id'>);
      if (p.baseEntityId) {
        const base = (await lector.dietas(p.athleteId)).find(d => d.id === p.baseEntityId);
        if (!base) return { ok: false, motivo: 'La dieta que ajusta esta propuesta ya no existe.' };
        // Sobre una dieta existente, una propuesta sin comidas solo cambia el
        // objetivo: no borra las que el coach tiene colocadas.
        const { meals, ...soloObjetivo } = dietPayload;
        antes.push(foto('diets', base.id, sinId(base)));
        ops.push({ tipo: 'actualizarDieta', id: base.id, cambios: meals.length > 0 ? dietPayload : soloObjetivo });
        return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: base.id };
      }
      ops.push({ tipo: 'crearDieta', ref: 'dieta', dieta: dietPayload });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityRef: 'dieta' };
    }

    case 'mesocycle': {
      const meso = p.payload as Omit<Mesocycle, 'id'>;
      // Con reparto, la distribución se rehace al aprobar: Dani ha podido
      // tocar las series en la propuesta y la de la propuesta sería vieja.
      ops.push({ tipo: 'crearMesociclo', ref: 'meso', mesociclo: meso.reparto ? { ...meso, distribution: distribucionDeMeso({ ...meso, id: '' }) } : meso });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityRef: 'meso' };
    }

    case 'periodizationBlock': {
      // Al aprobar se crea el mesociclo Y toda la cadencia de revisiones de
      // golpe; el carril "Revisiones" las pinta solas en cuanto existen.
      const { mesocycle, reviewCadenceWeeks, reviewType } = p.payload as PeriodizationBlockPayload;
      ops.push({ tipo: 'crearMesociclo', ref: 'meso', mesociclo: mesocycle });
      const reviewCount = Math.max(1, Math.floor(mesocycle.weeks / reviewCadenceWeeks));
      const reviewTitle = reviewType === 'revision' ? 'Revisión' : reviewType === 'cuestionario' ? 'Cuestionario' : 'Fotos de check-in';
      for (let i = 0; i < reviewCount; i++) {
        const dueDate = addDays(mesocycle.startDate, (i + 1) * reviewCadenceWeeks * 7);
        ops.push({ tipo: 'crearTarea', tarea: {
          athleteId: p.athleteId, type: reviewType, title: `${reviewTitle} — bloque #${mesocycle.number}`,
          dueDate, status: 'pending', createdBy: 'coach', createdAt: ahora,
        } });
      }
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityRef: 'meso' };
    }

    case 'roadmap': {
      // Se AÑADEN a lo que ya tiene: el roadmap es suyo, no se reemplaza.
      const { items, planPhases } = p.payload as RoadmapProposalPayload;
      const actual = await lector.roadmap(p.athleteId);
      const base: Roadmap = actual ?? { athleteId: p.athleteId, items: [] };
      if (actual) antes.push(foto('roadmaps', p.athleteId, sinAthleteId(actual)));
      ops.push({ tipo: 'guardarRoadmap', roadmap: { ...base, items: [...base.items, ...items], ...(planPhases ? { planPhases } : {}) } });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: p.athleteId };
    }

    case 'nutritionProgram': {
      // Las fases que traían dieta nueva la crean AQUÍ y se enlazan por id:
      // una fase sin dieta enlazada no le enseña nada al atleta.
      const { startDate, phases, refeedDays } = p.payload as NutritionProgramProposalPayload;
      const fases: NutritionPhase[] = [];
      const base = Date.parse(ahora);
      phases.forEach((fase, i) => {
        let dietId = fase.dietId ?? '';
        if (!dietId && fase.diet) {
          const ref = `dieta_${i}`;
          ops.push({ tipo: 'crearDieta', ref, dieta: conObjetivo(fase.diet) });
          dietId = REF(ref);
        }
        fases.push({
          id: `nph_${base}_${i}`,
          name: fase.name,
          weeks: fase.weeks,
          dietId,
          ...(fase.targetKcal != null ? { targetKcal: fase.targetKcal } : {}),
          ...(fase.targetWeight != null ? { targetWeight: fase.targetWeight } : {}),
          ...(fase.phaseType ? { phaseType: fase.phaseType } : {}),
          ...(fase.objetivo ? { objetivo: fase.objetivo } : {}),
          // Sin esto, el ritmo que propone el asistente se perdía al aprobar
          // y la fase volvía a definirse solo por semanas.
          ...(fase.targetRateKgWeek != null ? { targetRateKgWeek: fase.targetRateKgWeek } : {}),
        });
      });
      // Lo programado semana a semana (suplementos, pasos, ajustes…) no viene
      // en la propuesta: se conserva del programa que hubiera.
      const previo = await lector.programa(p.athleteId);
      if (previo) antes.push(foto('nutritionPrograms', p.athleteId, sinAthleteId(previo)));
      ops.push({ tipo: 'guardarPrograma', programa: {
        athleteId: p.athleteId,
        startDate,
        phases: fases,
        ...(refeedDays?.length ? { refeedDays } : {}),
        ...(previo?.cambiosSemana ? { cambiosSemana: previo.cambiosSemana } : {}),
        ...(previo?.semanasMantenimiento ? { semanasMantenimiento: previo.semanasMantenimiento } : {}),
        ...(previo?.mantenimientoG ? { mantenimientoG: previo.mantenimientoG } : {}),
        ...(previo?.comidasLibres ? { comidasLibres: previo.comidasLibres } : {}),
        ...(previo?.suplementos ? { suplementos: previo.suplementos } : {}),
        ...(previo?.ciclado ? { ciclado: previo.ciclado } : {}),
        ...(previo?.pasosPorSemana ? { pasosPorSemana: previo.pasosPorSemana } : {}),
        ...(previo?.reglasPeso ? { reglasPeso: previo.reglasPeso } : {}),
        ...(previo?.proteinaMinGKg ? { proteinaMinGKg: previo.proteinaMinGKg } : {}),
        ...(previo?.minimos ? { minimos: previo.minimos } : {}),
      } });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: p.athleteId };
    }

    case 'weekPlan': {
      const plan = p.payload as WeekPlanProposalPayload;
      if (plan.mesocycleId) {
        const meso = (await lector.mesociclos(p.athleteId)).find(m => m.id === plan.mesocycleId);
        if (!meso) return { ok: false, motivo: 'El mesociclo de esta propuesta ya no existe.' };
        const ciclo = cicloDiasDeMeso(meso);
        const vueltas = vueltasDelCiclo(meso.weeks, ciclo);
        const descargas = Array.from(new Set<number>([...(meso.semanasDescarga ?? []), ...(plan.semanasDescarga ?? [])])).sort((a, b) => a - b);
        const tests = Array.from(new Set<number>([...(meso.semanasTest ?? []), ...(plan.semanasTest ?? [])])).sort((a, b) => a - b);
        const workouts = (await lector.rutinas()).filter(w => w.mesocycleId === meso.id);
        for (const w of workouts) {
          const exercises = w.exercises.map(we0 => {
            let we = we0;
            if (plan.rir) we = { ...we, weeklyProgression: rirDescendente(we, vueltas, plan.rir.desde, plan.rir.hasta, descargas) };
            if (plan.series) we = { ...we, weeklyProgression: subirSeries(we, plan.series.cada, plan.series.hasta) };
            for (const c of (plan.cambios ?? []).filter(c => c.workoutId === w.id && c.exerciseId === we.exerciseId)) {
              we = { ...we, weeklyProgression: programarEnSemanas(we, [c.semana], !!c.solo, r => ({
                ...r,
                ...(c.sets !== undefined ? { sets: c.sets } : {}),
                ...(c.reps !== undefined ? { reps: c.reps } : {}),
                ...(c.rir !== undefined ? { rir: c.rir } : {}),
                ...(c.restSeconds !== undefined ? { restSeconds: c.restSeconds } : {}),
                ...(c.bloques ? { setGroups: c.bloques } : {}),
              })) };
            }
            return we;
          });
          if (JSON.stringify(exercises) !== JSON.stringify(w.exercises)) {
            antes.push(foto('workouts', w.id, sinId(w)));
            ops.push({ tipo: 'actualizarRutina', id: w.id, cambios: { exercises } });
          }
        }
        const cambiosMeso: Partial<Omit<Mesocycle, 'id'>> = {
          ...(plan.semanasDescarga?.length ? { semanasDescarga: descargas, deloadWeek: Math.floor(((descargas[0] - 1) * ciclo) / 7) + 1 } : {}),
          ...(plan.semanasTest?.length ? { semanasTest: tests } : {}),
        };
        antes.push(foto('mesocycles', meso.id, sinId(meso)));
        ops.push({ tipo: 'actualizarMesociclo', id: meso.id, cambios: cambiosMeso });
      }
      if (plan.nutricion) {
        const programa = await lector.programa(p.athleteId);
        if (!programa) return { ok: false, motivo: 'El atleta ya no tiene periodización nutricional.' };
        let nuevo = { ...programa };
        for (const a of plan.nutricion.ajustes ?? []) {
          nuevo = { ...nuevo, cambiosSemana: programarAjuste(nuevo, a.semana, !!a.solo, { cat: a.cat, delta: a.delta, ...(a.gramos !== undefined ? { gramos: a.gramos } : {}), ...(a.slot !== undefined ? { slot: a.slot } : {}) }) };
        }
        if (plan.nutricion.semanasMantenimiento?.length) {
          nuevo.semanasMantenimiento = Array.from(new Set<number>([...(nuevo.semanasMantenimiento ?? []), ...plan.nutricion.semanasMantenimiento])).sort((a, b) => a - b);
        }
        if (plan.nutricion.suplementos?.length) {
          const base = Date.parse(ahora);
          nuevo.suplementos = [...(nuevo.suplementos ?? []), ...plan.nutricion.suplementos.map((x, i) => ({ ...x, id: `sup_${base}_${i}` }))];
        }
        if (plan.nutricion.pasosPorSemana?.length) {
          const porSemana = new Map((nuevo.pasosPorSemana ?? []).map(x => [x.semana, x]));
          for (const x of plan.nutricion.pasosPorSemana) porSemana.set(x.semana, x);
          nuevo.pasosPorSemana = [...porSemana.values()].sort((a, b) => a.semana - b.semana);
        }
        antes.push(foto('nutritionPrograms', p.athleteId, sinAthleteId(programa)));
        ops.push({ tipo: 'guardarPrograma', programa: nuevo });
      }
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: plan.mesocycleId ?? p.athleteId };
    }

    case 'specialDay': {
      // Las tres cosas a la vez: por separado ninguna se nota. El hito lo ve
      // venir, la tarea le salta ese día, y la nota la lee encima de la sesión.
      const dia = p.payload as SpecialDayProposalPayload;
      const actual = await lector.roadmap(p.athleteId);
      const base: Roadmap = actual ?? { athleteId: p.athleteId, items: [] };
      if (actual) antes.push(foto('roadmaps', p.athleteId, sinAthleteId(actual)));
      ops.push({ tipo: 'guardarRoadmap', roadmap: { ...base, items: [...base.items, {
        id: `rmi_${Date.parse(ahora)}`,
        title: dia.title,
        description: dia.description,
        type: 'hito',
        lane: dia.kind === 'otro' ? 'general' : 'entreno',
        targetDate: dia.date,
        status: 'pendiente',
      }] } });
      ops.push({ tipo: 'crearTarea', tarea: {
        athleteId: p.athleteId, type: 'manual', title: dia.title, dueDate: dia.date,
        status: 'pending', linkTab: 'training', createdBy: 'coach', createdAt: ahora,
      } });
      const perfil = await lector.perfil(p.athleteId);
      if (perfil) {
        const delDia = (await lector.asignaciones(perfil)).find(a => a.date === dia.date);
        if (delDia) {
          antes.push(foto('workoutAssignments', delDia.id, { note: delDia.note ?? null }, true));
          ops.push({ tipo: 'actualizarAsignacion', id: delDia.id, cambios: { note: dia.athleteNote } });
        }
      }
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: p.athleteId };
    }

    case 'dossier': {
      const patch = p.payload as DossierPatch;
      const ficha = lector.ficha ? await lector.ficha(p.athleteId) : null;
      if (ficha) {
        const campos: Record<string, unknown> = {};
        for (const k of Object.keys(patch) as (keyof DossierPatch)[]) campos[k] = ficha[k] ?? null;
        antes.push(foto('athleteStatus', p.athleteId, campos, true));
      }
      ops.push({ tipo: 'guardarJuicioFicha', athleteId: p.athleteId, patch });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: p.athleteId };
    }

    case 'workoutDays': {
      // Cada día se guarda como LA rutina de ese día del mesociclo. Si ya
      // había una, se reescribe conservando su id: las asignaciones del
      // calendario del atleta apuntan a ese documento, y crear uno nuevo
      // dejaría al atleta entrenando la rutina vieja para siempre.
      const { mesocycleId, days } = p.payload as WorkoutDaysProposalPayload;
      const [todas, mesos, perfil] = await Promise.all([lector.rutinas(), lector.mesociclos(p.athleteId), lector.perfil(p.athleteId)]);
      const meso = mesos.find(m => m.id === mesocycleId);
      const delMeso = todas.filter(w => w.mesocycleId === mesocycleId);
      const athleteName = perfil?.displayName;
      for (const dia of days) {
        const exercises: WorkoutExercise[] = dia.exercises.map((ex, i) => ({
          exerciseId: ex.exerciseId,
          order: i,
          sets: ex.sets,
          reps: ex.reps,
          rir: ex.rir,
          restSeconds: ex.restSeconds,
          ...(ex.notes ? { notes: ex.notes } : {}),
          ...(ex.muscleGroup ? { muscleGroup: ex.muscleGroup } : {}),
        }));
        // Sin nombre, el mismo que pondría el editor: el que le puso Dani a
        // esa sesión o el tipo de día de su reparto («Pierna», «Empuje»…).
        const tipo = meso
          ? nombrePropioDeSesion(meso.nombresSesion, dia.dayIndex)
            ?? (() => { const r = repartoDelMesociclo(meso); return r ? tiposDeEntrenamiento(r)[dia.dayIndex] : undefined; })()
          : undefined;
        const nombre = dia.name?.trim() || (meso
          ? nombreDeSesion({ tipo, dayIdx: dia.dayIndex, athleteName, meso })
          : `Sesión ${dia.dayIndex + 1}`);
        const existente = delMeso.find(w => w.dayIndex === dia.dayIndex);
        if (existente) {
          antes.push(foto('workouts', existente.id, sinId(existente)));
          ops.push({ tipo: 'actualizarRutina', id: existente.id, cambios: { name: nombre, exercises } });
        } else {
          ops.push({ tipo: 'crearRutina', ref: `rutina_${dia.dayIndex}`, rutina: { ownerId: opciones.coachUid, name: nombre, mesocycleId, dayIndex: dia.dayIndex, exercises } });
        }
      }
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: mesocycleId };
    }

    case 'levelLadder': {
      const ladder = p.payload as LevelLadder;
      const actual = await lector.roadmap(p.athleteId);
      const base: Roadmap = actual ?? { athleteId: p.athleteId, items: [] };
      if (actual) antes.push(foto('roadmaps', p.athleteId, sinAthleteId(actual)));
      ops.push({ tipo: 'guardarRoadmap', roadmap: { ...base, levelLadder: ladder } });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: p.athleteId };
    }

    case 'setupConfig': {
      // Cada campo va a su sitio; los que no vengan no se tocan. Las dietas
      // del calendario llegan por NOMBRE porque al proponerlas todavía no
      // existían (las crea la periodización al aprobarse), así que se
      // resuelven aquí contra las que el atleta tiene YA.
      const v = p.payload as SetupConfigProposalPayload;
      const perfilUpdates: Partial<UserProfile> = {};
      if (v.planStartDate) perfilUpdates.planStartDate = v.planStartDate;
      if (v.planDurationMonths) perfilUpdates.planDurationMonths = v.planDurationMonths as UserProfile['planDurationMonths'];
      if (v.targetWeight) perfilUpdates.targetWeight = v.targetWeight;
      if (Object.keys(perfilUpdates).length) {
        const perfil = await lector.perfil(p.athleteId);
        if (!perfil) return { ok: false, motivo: `No se encuentra el perfil de ${p.athleteId}.` };
        const previos: Record<string, unknown> = {};
        for (const k of Object.keys(perfilUpdates)) previos[k] = (perfil as unknown as Record<string, unknown>)[k] ?? null;
        antes.push(foto('user_profiles', perfil.userId, previos, true));
        ops.push({ tipo: 'actualizarPerfil', userId: perfil.userId, cambios: perfilUpdates });
      }
      if (v.stepGoal !== undefined) {
        const cfg = await lector.configNutricion(p.athleteId);
        if (cfg) antes.push(foto('athleteNutritionConfigs', p.athleteId, sinAthleteId(cfg)));
        ops.push({ tipo: 'guardarConfigNutricion', config: { ...(cfg ?? { athleteId: p.athleteId }), stepGoal: v.stepGoal } as AthleteNutritionConfig });
      }
      if (v.activeDietNames || v.weeklyScheduleByName) {
        const dietas = await lector.dietas(p.athleteId);
        const idDe = (nombre: string) => dietas.find(d => d.name.trim().toLowerCase() === nombre.trim().toLowerCase())?.id ?? null;
        const sinResolver = [
          ...(v.activeDietNames ?? []),
          ...Object.values(v.weeklyScheduleByName ?? {}).filter((x): x is string => typeof x === 'string'),
        ].filter(n => !idDe(n));
        if (sinResolver.length) {
          return { ok: false, motivo: `No encuentro estas dietas de ${p.athleteId}: ${[...new Set(sinResolver)].join(', ')}. Aprueba antes la propuesta de dietas o de periodización nutricional.` };
        }
        const cfg = await lector.configDieta(p.athleteId);
        const base = cfg ?? { athleteId: p.athleteId, activeDietIds: [] };
        if (cfg) antes.push(foto('athleteDietConfigs', p.athleteId, sinAthleteId(cfg)));
        const schedule: Partial<Record<WeekDay, string | null>> = { ...(base.weeklySchedule ?? {}) };
        for (const [dia, nombre] of Object.entries(v.weeklyScheduleByName ?? {})) {
          schedule[dia as WeekDay] = nombre ? idDe(nombre) : null;
        }
        ops.push({ tipo: 'guardarConfigDieta', config: {
          ...base,
          ...(v.activeDietNames ? { activeDietIds: v.activeDietNames.map(n => idDe(n)!) } : {}),
          ...(v.weeklyScheduleByName ? { weeklySchedule: schedule } : {}),
        } });
      }
      if (v.questionnaire) {
        ops.push({ tipo: 'asignarCuestionario', asignacion: {
          questionnaireId: v.questionnaire.questionnaireId, athleteId: p.athleteId,
          schedule: v.questionnaire.schedule, startDate: v.questionnaire.startDate, active: true, createdAt: ahora,
        } });
      }
      if (v.photos) {
        ops.push({ tipo: 'asignarFotos', asignacion: {
          athleteId: p.athleteId, schedule: v.photos.schedule, startDate: v.photos.startDate, views: v.photos.views, active: true, createdAt: ahora,
        } });
      }
      if (v.liftExerciseNames?.length) {
        const catalogo = await lector.ejercicios();
        const ids = v.liftExerciseNames
          .map(n => catalogo.find(e => e.name.trim().toLowerCase() === n.trim().toLowerCase())?.id)
          .filter((x): x is string => !!x);
        const actual = await lector.roadmap(p.athleteId);
        const base: Roadmap = actual ?? { athleteId: p.athleteId, items: [] };
        if (actual && !antes.some(f => f.coleccion === 'roadmaps')) antes.push(foto('roadmaps', p.athleteId, sinAthleteId(actual)));
        ops.push({ tipo: 'guardarRoadmap', roadmap: { ...base, challengeConfig: { ...(base.challengeConfig ?? {}), liftExerciseIds: ids } } });
      }
      if (v.cardio) {
        const program: CardioProgram = v.cardio.kind === 'vo2max'
          ? { kind: 'vo2max', protocolId: v.cardio.protocolId ?? 'noruego4x4', startDate: v.cardio.startDate }
          : { kind: 'zona2', protocolId: 'zona2', startDate: v.cardio.startDate, baseMinutes: v.cardio.baseMinutes ?? ZONA2_BASE_MIN_DEFECTO, targetZone: 'z2' };
        const semana1 = prescripcionDeSemana(program, 1);
        ops.push({ tipo: 'crearCardio', asignacion: {
          athleteId: p.athleteId,
          type: v.cardio.kind === 'vo2max' ? 'intervalos' : 'zona2',
          targetDurationSec: semana1.intervals
            ? semana1.intervals.reduce((sum, b) => sum + b.durationSec, 0)
            : semana1.targetDurationSec,
          ...(v.cardio.kind === 'zona2' ? { targetZone: 'z2' as const } : {}),
          ...(semana1.intervals ? { intervals: semana1.intervals } : {}),
          timesPerWeek: semana1.sesionesPorSemana,
          active: true,
          createdAt: ahora,
          program,
        } });
      }
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: p.athleteId };
    }

    case 'publishBlock': {
      // El paso que hace que el atleta VEA sus entrenos: una asignación por
      // sesión y vuelta. Las fechas que ya tenga asignadas no se duplican, así
      // que volver a aprobar después de un fallo termina el trabajo en vez de
      // dejarle el calendario doble.
      const { mesocycleId, mesocycleName } = p.payload as PublishBlockProposalPayload;
      const perfil = await lector.perfil(p.athleteId);
      if (!perfil) return { ok: false, motivo: `No se encuentra el perfil de ${p.athleteId}.` };
      const [todas, mesos, yaAsignadas] = await Promise.all([lector.rutinas(), lector.mesociclos(p.athleteId), lector.asignaciones(perfil)]);
      const meso = mesos.find(m => m.id === mesocycleId);
      if (!meso) return { ok: false, motivo: `El mesociclo de «${mesocycleName}» ya no existe.` };
      const sesiones = sesionesDeMesociclo(todas, mesocycleId);
      if (sesiones.length === 0) {
        return { ok: false, motivo: `«${mesocycleName}» todavía no tiene sesiones. Aprueba antes la propuesta de sesiones y vuelve a aprobar esta.` };
      }
      const ocupadas = new Set(yaAsignadas.filter(a => a.mesocycleId === mesocycleId).map(a => `${a.workoutId}_${a.date}`));
      for (const f of fechasDelMesociclo(meso, sesiones.length)) {
        const workoutId = sesiones[f.dayIdx]?.id;
        if (!workoutId || ocupadas.has(`${workoutId}_${f.date}`)) continue;
        ops.push({ tipo: 'crearAsignacion', asignacion: { workoutId, athleteId: p.athleteId, mesocycleId, date: f.date, status: 'pending' } });
      }
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: mesocycleId };
    }

    case 'weeklyChallenge': {
      const v = p.payload as WeeklyChallengeProposalPayload;
      const { weekStart, weekEnd } = isoWeekBounds(v.today);
      const isoWeek = isoWeekKey(v.today);
      const reto: WeeklyChallenge = {
        id: `${p.athleteId}_${isoWeek}`,
        athleteId: p.athleteId,
        isoWeek, weekStart, weekEnd,
        kind: v.kind, title: v.title, description: v.description,
        origin: 'coach', metric: v.metric,
        status: 'activo',
        createdAt: ahora,
        ...(v.isMilestone ? { isMilestone: true } : {}),
        ...(v.difficulty ? { difficulty: v.difficulty } : {}),
      };
      ops.push({ tipo: 'guardarReto', reto });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityId: reto.id };
    }

    case 'workoutTemplate': {
      // Rutina del coach SIN mesocycleId: es una plantilla suya, no el
      // entreno de nadie. Aparece en Entrenamientos para reutilizarla.
      const v = p.payload as WorkoutTemplateProposalPayload;
      ops.push({ tipo: 'crearRutina', ref: 'plantilla', rutina: {
        ownerId: opciones.coachUid,
        name: v.name,
        exercises: v.exercises.map((ex, i) => ({
          exerciseId: ex.exerciseId, order: i, sets: ex.sets, reps: ex.reps,
          rir: ex.rir, restSeconds: ex.restSeconds,
          ...(ex.notes ? { notes: ex.notes } : {}),
          ...(ex.muscleGroup ? { muscleGroup: ex.muscleGroup } : {}),
        })),
      } });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityRef: 'plantilla' };
    }

    case 'mesocycleTemplate': {
      const v = p.payload as MesocycleTemplateProposalPayload;
      const base = Date.parse(ahora);
      const stages: TemplateStage[] = v.stages.map((st, i) => ({
        id: `stage_${base}_${i}`,
        name: st.name, weeks: st.weeks, daysPerWeek: st.daysPerWeek, groups: st.groups,
        ...(st.reparto ? { reparto: st.reparto } : {}),
        ...(st.cycleDays !== undefined ? { cycleDays: st.cycleDays } : {}),
        ...(st.distribution ? { distribution: st.distribution } : {}),
        ...(st.deloadWeek !== undefined ? { deloadWeek: st.deloadWeek } : {}),
        ...(st.reviewCadenceWeeks !== undefined ? { reviewCadenceWeeks: st.reviewCadenceWeeks, reviewType: st.reviewType ?? 'revision' } : {}),
        ...(st.days ? {
          days: st.days.map((d, k) => ({
            id: `tday_${base}_${i}_${k}`,
            name: d.name,
            exercises: d.exercises.map((ex, j) => ({
              exerciseId: ex.exerciseId, order: j, sets: ex.sets, reps: ex.reps,
              rir: ex.rir, restSeconds: ex.restSeconds,
              ...(ex.notes ? { notes: ex.notes } : {}),
              ...(ex.muscleGroup ? { muscleGroup: ex.muscleGroup } : {}),
            })),
          })),
        } : {}),
      }));
      ops.push({ tipo: 'crearPlantillaMesociclo', ref: 'plantilla', plantilla: {
        ownerId: opciones.coachUid, name: v.name, ...(v.description ? { description: v.description } : {}), stages,
      } });
      return { ok: true, operaciones: ops, snapshotAntes: antes, resultEntityRef: 'plantilla' };
    }

    case 'latido':
      return { ok: false, motivo: 'Lo que hizo el latido ya está aplicado: solo se puede deshacer.' };
  }
}

/** Sustituye los `$ref:<nombre>` que haya en `valor` por los ids reales. */
export function resolverReferencias<T>(valor: T, refs: Record<string, string>): T {
  if (typeof valor === 'string') {
    if (!valor.startsWith('$ref:')) return valor;
    const id = refs[valor.slice(5)];
    if (!id) throw new Error(`Referencia sin resolver: ${valor}`);
    return id as unknown as T;
  }
  if (Array.isArray(valor)) return valor.map(v => resolverReferencias(v, refs)) as unknown as T;
  if (valor && typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) salida[k] = resolverReferencias(v, refs);
    return salida as T;
  }
  return valor;
}

/** Lo que una operación crea, para el snapshot (`datos: null` = borrar al deshacer). */
export function fotoDeCreacion(op: Operacion, id: string): SnapshotDocumento {
  return { coleccion: COLECCION_DE_OPERACION[op.tipo], id, datos: null };
}

/** Las operaciones que CREAN documento y por tanto necesitan un id nuevo. */
export function esCreacion(op: Operacion): boolean {
  return op.tipo === 'crearDieta' || op.tipo === 'crearMesociclo' || op.tipo === 'crearRutina'
    || op.tipo === 'crearAsignacion' || op.tipo === 'crearTarea' || op.tipo === 'asignarCuestionario'
    || op.tipo === 'asignarFotos' || op.tipo === 'crearCardio' || op.tipo === 'crearPlantillaMesociclo'
    || op.tipo === 'guardarReto';
}

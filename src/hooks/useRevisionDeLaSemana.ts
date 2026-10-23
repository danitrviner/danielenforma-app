import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import type { Questionnaire } from '../types';
import {
  getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, getPesoExtremo,
  getPhotoAssignmentsForAthlete, getProgressPhotos, getMesocycles,
} from '../dbService';
import { todayStr, type ScheduleContext } from '../utils/questionnaireSchedule';
import { revisionDeLaSemana, pasosQueFaltan } from '../utils/revisionSemanal';
import { pesoUltimoKey } from './useAthleteWeight';
import { useProgresoRevision } from './useProgresoRevision';

/**
 * La revisión de ESTA semana y todo lo que hace falta para calcularla: un solo
 * sitio para Check-ins, la hoja del «+» y el contador de la barra, con las
 * mismas claves de caché (una lectura compartida).
 *
 * `cargar: false` no lee nada: solo usa lo que ya esté en caché. Es lo que usa la
 * barra inferior, que no debe leer el historial completo del atleta al arrancar.
 * Mientras falte algún dato, `listo` es false y `faltan` es null (no se inventa
 * un número a medias).
 */
export function useRevisionDeLaSemana(email: string, cargar = true) {
  const habilitado = cargar && !!email;

  const { data: ultimoPesoQ } = useQuery({
    queryKey: pesoUltimoKey(email),
    queryFn: () => getPesoExtremo(email, 'ultimo'),
    enabled: habilitado,
  });
  const ultimoPeso = ultimoPesoQ ?? null;

  const { data: rawAssignmentsQ, isPending: loadingAssignments } = useQuery({
    queryKey: ['assignmentsForAthlete', email],
    queryFn: () => getAssignmentsForAthlete(email),
    enabled: habilitado,
  });
  const { data: responsesQ, isPending: loadingResponses } = useQuery({
    queryKey: ['responsesForAthlete', email],
    queryFn: () => getResponsesForAthlete(email),
    enabled: habilitado,
  });
  const rawAssignments = useMemo(() => rawAssignmentsQ ?? [], [rawAssignmentsQ]);
  const responses = useMemo(() => responsesQ ?? [], [responsesQ]);
  const assignments = useMemo(() => rawAssignments.filter(a => a.active), [rawAssignments]);

  // Plantillas de las asignaciones activas y de toda respuesta ya enviada (el
  // historial titula respuestas de cuestionarios que el coach desasignó).
  const activeQuestionnaireIds = useMemo(
    () => [...new Set([...assignments.map(a => a.questionnaireId), ...responses.map(r => r.questionnaireId)])],
    [assignments, responses],
  );
  const questionnaireQueries = useQueries({
    queries: activeQuestionnaireIds.map(id => ({
      queryKey: ['questionnaireById', id],
      queryFn: (): Promise<Questionnaire | null> => getQuestionnaireById(id),
      enabled: habilitado,
    })),
  });
  const templates = useMemo(() => {
    const tMap = new Map<string, Questionnaire>();
    for (const q of questionnaireQueries) {
      const t = q.data as Questionnaire | null | undefined;
      if (t) tMap.set(t.id, t);
    }
    return tMap;
  }, [questionnaireQueries]);

  const { data: mesocyclesQ } = useQuery({
    queryKey: ['mesocycles', email],
    queryFn: () => getMesocycles(email),
    enabled: habilitado,
  });
  const scheduleCtx: ScheduleContext = useMemo(() => ({ mesocycles: mesocyclesQ ?? [] }), [mesocyclesQ]);

  const loadingQ = loadingAssignments || loadingResponses
    || (activeQuestionnaireIds.length > 0 && questionnaireQueries.some(q => q.isPending));

  const { data: rawPhotoAssignmentsQ, isPending: loadingPhotoAssignmentsQ } = useQuery({
    queryKey: ['photoAssignmentsForAthlete', email],
    queryFn: () => getPhotoAssignmentsForAthlete(email),
    enabled: habilitado,
  });
  const { data: progressPhotosQ, isPending: loadingProgressPhotos } = useQuery({
    queryKey: ['progressPhotos', email],
    queryFn: () => getProgressPhotos(email),
    enabled: habilitado,
  });
  const rawPhotoAssignments = useMemo(() => rawPhotoAssignmentsQ ?? [], [rawPhotoAssignmentsQ]);
  const progressPhotos = useMemo(() => progressPhotosQ ?? [], [progressPhotosQ]);
  const photoAssignments = useMemo(() => rawPhotoAssignments.filter(a => a.active), [rawPhotoAssignments]);
  const loadingPhotoAssignments = loadingPhotoAssignmentsQ || loadingProgressPhotos;

  const { progreso, cargado: progresoCargado, guardarBorrador, marcarEnviada } = useProgresoRevision(email, cargar);

  const revision = useMemo(() => revisionDeLaSemana({
    hoy: todayStr(),
    assignments,
    responses,
    templates,
    scheduleCtx,
    photoAssignments,
    fotos: progressPhotos,
    ultimoPeso,
    progreso,
  }), [assignments, responses, templates, scheduleCtx, photoAssignments, progressPhotos, ultimoPeso, progreso]);

  // «Listo» = todo lo que entra en el cálculo se ha leído (nada a medias). El
  // peso puede ser null (nunca se ha pesado), pero tiene que haberse leído.
  const listo = ultimoPesoQ !== undefined && rawAssignmentsQ !== undefined && responsesQ !== undefined
    && mesocyclesQ !== undefined && rawPhotoAssignmentsQ !== undefined && progressPhotosQ !== undefined
    && progresoCargado && !loadingQ && !loadingPhotoAssignments
    && questionnaireQueries.every(q => q.data !== undefined);

  return {
    revision,
    /** Pasos que le faltan (para el contador), o null si aún no se sabe o no hay nada pendiente. */
    faltan: listo ? pasosQueFaltan(revision) : null,
    listo,
    ultimoPeso,
    rawAssignments, assignments, responses, templates, scheduleCtx,
    loadingQ,
    photoAssignments, progressPhotos, loadingPhotoAssignments,
    progreso, guardarBorrador, marcarEnviada,
  };
}

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Questionnaire, QuestionnaireResponse } from '../types';
import { getQuestionnairesByCoach, getResponsesByQuestionnaireIds } from '../dbService';
import { revisionesSinLeerPorAtleta } from '../utils/revisionSemanal';

/* ═══════════════════════════════════════════════════════════════════════════
   Revisiones sin leer del coach (K-05)

   Sustituye al contador de `checkins` (la colección antigua, que ya no se
   crea). Cuenta, por atleta, las semanas en que envió algo que el coach no ha
   marcado como visto.

   NO añade lecturas propias: usa la misma consulta —mismas claves, misma
   ventana— que la bandeja de Revisiones, así que la lista de clientes y la
   bandeja se reparten UNA sola lectura. Y solo se pide cuando se abre una de
   las dos (`cargar`). La barra lateral la lee SIN cargar (`cargar: false`): si
   todavía no se ha abierto ninguna, no hay número y no cuesta nada; en cuanto
   se abre, la insignia se rellena sola desde la caché.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cuántos días atrás llega la bandeja. */
export const DIAS_DE_BANDEJA = 60;

/** Inicio de la ventana, a medianoche UTC: así dos pantallas que abren con
 *  minutos de diferencia comparten clave de caché (con milisegundos no). */
export function desdeDeLaBandeja(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - DIAS_DE_BANDEJA);
  return d.toISOString();
}

export const clavePlantillasDelCoach = (coachId: string) => ['questionnairesByCoach', coachId] as const;
export const claveRespuestasDeBandeja = (ids: string[], desde: string) => ['responsesByQuestionnaireIds', ids, desde] as const;

/** Las plantillas del coach y las respuestas de su bandeja (ventana de `DIAS_DE_BANDEJA`). */
export function useRespuestasDeLaBandeja(coachId: string, cargar: boolean) {
  const desde = useMemo(desdeDeLaBandeja, []);
  const { data: questionnaires = [], isPending: loadingQuestionnaires } = useQuery({
    queryKey: clavePlantillasDelCoach(coachId),
    queryFn: (): Promise<Questionnaire[]> => getQuestionnairesByCoach(coachId),
    enabled: cargar && !!coachId,
  });
  const questionnaireIds = useMemo(() => questionnaires.map(q => q.id), [questionnaires]);
  const { data: responses = [], isPending: loadingResponsesQuery } = useQuery({
    // El `desde` va en la clave: sin él, esta consulta acotada compartiría
    // caché con cualquier otra pantalla que pida el historial entero.
    queryKey: claveRespuestasDeBandeja(questionnaireIds, desde),
    queryFn: (): Promise<QuestionnaireResponse[]> => getResponsesByQuestionnaireIds(questionnaireIds, desde),
    enabled: cargar && !!coachId && questionnaireIds.length > 0,
  });
  return {
    questionnaires, questionnaireIds, responses, desde,
    loading: loadingQuestionnaires || (questionnaireIds.length > 0 && loadingResponsesQuery),
  };
}

/** Revisiones sin leer por atleta (clave: email en minúsculas) y en total. */
export function useRevisionesSinLeer(coachId: string, cargar: boolean) {
  const { responses, loading } = useRespuestasDeLaBandeja(coachId, cargar);
  return useMemo(() => {
    const porAtleta = revisionesSinLeerPorAtleta(responses);
    let total = 0;
    for (const n of porAtleta.values()) total += n;
    return { porAtleta, total, loading };
  }, [responses, loading]);
}

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProgresoRevision } from '../types';
import { getProgresoRevision, guardarProgresoRevision, idProgresoRevision } from '../db/revisionProgreso';
import { todayStr, viernesDelCiclo } from '../utils/questionnaireSchedule';
import type { BorradorDeCuestionario } from '../components/QuestionnaireWizard';

/* Progreso de la revisión de ESTA semana (K-02): lectura y escritura del
   documento `revisionProgreso`. Escribir es siempre «guardar y seguir»: el
   borrador no debe frenar ni asustar al atleta (ver db/revisionProgreso). */

export function useProgresoRevision(email: string, cargar = true) {
  const queryClient = useQueryClient();
  const ciclo = viernesDelCiclo(todayStr());
  const key = ['revisionProgreso', email, ciclo] as const;

  // `cargar: false` solo mira la caché (el contador del «+» no lee nada al arrancar).
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getProgresoRevision(email, ciclo),
    staleTime: 60_000,
    enabled: !!email && cargar,
  });
  const progreso = data ?? null;

  const cambiar = useCallback((fn: (p: ProgresoRevision) => ProgresoRevision) => {
    const actual = queryClient.getQueryData<ProgresoRevision | null>(key) ?? {
      id: idProgresoRevision(email, ciclo), athleteId: email, ciclo, respuestas: {}, actualizadoEn: new Date().toISOString(),
    };
    const nuevo = fn(actual);
    queryClient.setQueryData(key, nuevo);
    void guardarProgresoRevision(nuevo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, email, ciclo]);

  /** Guarda (o, con `null`, quita) el borrador de un cuestionario. */
  const guardarBorrador = useCallback((assignmentId: string, borrador: BorradorDeCuestionario | null) => {
    cambiar(p => {
      const { [assignmentId]: _quitado, ...resto } = p.respuestas;
      return { ...p, respuestas: borrador ? { ...resto, [assignmentId]: borrador } : resto };
    });
  }, [cambiar]);

  /** El atleta pulsó «Enviar» en el resumen. `incompleta`: faltaba algún paso. */
  const marcarEnviada = useCallback((incompleta: boolean) => {
    cambiar(p => ({ ...p, enviadaEn: new Date().toISOString(), incompleta }));
  }, [cambiar]);

  return { progreso, /** Ya se sabe (aunque sea «sin progreso»): distingue «no hay» de «aún no se ha leído». */ cargado: data !== undefined, ciclo, guardarBorrador, marcarEnviada };
}

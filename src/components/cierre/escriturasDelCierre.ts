import { createContext, useContext } from 'react';
import type { CierreDeHipotesis, Mesocycle, Workout } from '../../types';
import { createMesocycle, createWorkoutStrict, updateMesocycle } from '../../db/training';

/* Lo que la Revisión ESCRIBE en el bloque (17-11-2026): firmar los veredictos,
   crear el bloque siguiente y, desde el 23-11, confirmar hipótesis pendientes. Va por contexto para que el banco de pruebas
   (/dev/revision-coach, sin sesión de coach) pueda enseñar el cierre firmado y
   el bloque creado sin tocar Firestore. Fuera de él nadie lo provee y valen
   las funciones de base de datos de siempre. */

export interface EscriturasDelCierre {
  /** Escribe `Mesocycle.cierreDeHipotesis`. */
  guardarCierre: (mesoId: string, cierre: CierreDeHipotesis) => Promise<void>;
  /** Confirma hipótesis desde la revisión semanal (23-11-2026): escribe lo de
   *  `camposAlConfirmar` (`hipotesis`, techos y modo por zona), como el editor. */
  guardarHipotesis: (mesoId: string, campos: Partial<Mesocycle>) => Promise<void>;
  crearMesociclo: (meso: Omit<Mesocycle, 'id'>) => Promise<Mesocycle>;
  crearRutina: (rutina: Omit<Workout, 'id'>) => Promise<Workout>;
  /** Solo el banco de pruebas: qué hacer en vez de navegar al editor. */
  alAbrirEditor?: (athleteEmail: string) => void;
}

const DE_VERDAD: EscriturasDelCierre = {
  guardarCierre: (mesoId, cierre) => updateMesocycle(mesoId, { cierreDeHipotesis: cierre }),
  guardarHipotesis: (mesoId, campos) => updateMesocycle(mesoId, campos),
  crearMesociclo: createMesocycle,
  crearRutina: createWorkoutStrict,
};

export const EscriturasDelCierreContext = createContext<EscriturasDelCierre>(DE_VERDAD);
export const useEscriturasDelCierre = () => useContext(EscriturasDelCierreContext);

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Exercise, Mesocycle, NutritionProgram, WorkoutLog } from '../../types';
import { useToast } from '../../hooks/useToast';
import { avisoDePendientes, type AvisoDePendientes } from '../../utils/hipotesisDeBloque/avisoDePendientes';
import { camposAlConfirmar, completarHipotesis, hipotesisPendientes, zonasConEstrella } from '../../utils/hipotesisDelMeso';
import { semanaDelBloque, totalDeSemanasDelBloque } from '../../utils/semanaDelBloque';
import { useEscriturasDelCierre } from '../cierre/escriturasDelCierre';
import { useHipotesisDelBloque } from '../mesociclo/useHipotesisDelBloque';

/* ═══════════════════════════════════════════════════════════════════════════
   Las hipótesis pendientes del bloque en curso, para la revisión semanal
   (23-11-2026)

   Si el bloque lleva zonas con estrella sin hipótesis guardada (o guardada sin
   cifras de proceso y ya hay de dónde sacarlas), devuelve la fila que enseña
   «Lo que pide decisión» y cómo confirmarla. La propuesta es la misma del
   editor (`useHipotesisDelBloque`): los registros y el catálogo ya están
   cargados en esta pantalla, así que no cuesta lecturas salvo el alta del
   atleta si no estaba en caché.

   Confirmar escribe lo mismo que el botón «Confirmar hipótesis» del editor
   (`camposAlConfirmar`): las hipótesis, el techo de cada zona y el modo por
   zona, que es lo que lee el protocolo semanal. A partir de ahí el Seguimiento
   enseña el semáforo, el cierre dará veredicto y el atleta ve el objetivo del
   bloque en una frase.

   Sin estrellas no pide nada: el hook de la propuesta queda apagado.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PendientesDeHipotesis {
  aviso: AvisoDePendientes;
  confirmando: boolean;
  onConfirmar: () => void;
}

export function usePendientesDeHipotesis(o: {
  athleteEmail: string;
  /** El bloque en curso (`mesoDelObjetivo`); `null` si no hay. */
  meso: Mesocycle | null;
  mesocycles: readonly Mesocycle[];
  logs: WorkoutLog[];
  exercises: readonly Exercise[];
  hoy: string;
  /** La periodización nutricional si la pantalla ya la tiene (`undefined` = aún cargando). */
  programaNutricion?: NutritionProgram | null;
}): PendientesDeHipotesis | null {
  const { meso, athleteEmail, hoy } = o;
  const conEstrellas = !!meso && zonasConEstrella(meso.groups).length > 0;
  const { propuesta, cargando } = useHipotesisDelBloque({
    meso: conEstrellas ? meso : null, mesocycles: o.mesocycles, athleteEmail, exercises: o.exercises, logs: o.logs,
    activo: conEstrellas, programaNutricion: o.programaNutricion,
  });
  const { guardarHipotesis } = useEscriturasDelCierre();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [confirmando, setConfirmando] = useState(false);

  const aviso = useMemo(() => {
    if (!meso || !conEstrellas || cargando) return null;
    return avisoDePendientes({
      pendientes: hipotesisPendientes(meso, propuesta),
      hipotesis: propuesta.hipotesis,
      semanaActual: semanaDelBloque(meso, hoy),
      semanas: totalDeSemanasDelBloque(meso),
    });
  }, [meso, conEstrellas, cargando, propuesta, hoy]);

  if (!aviso || !meso) return null;

  const onConfirmar = async () => {
    setConfirmando(true);
    try {
      const campos = camposAlConfirmar(meso, completarHipotesis(meso, propuesta));
      await guardarHipotesis(meso.id, campos);
      queryClient.setQueryData<Mesocycle[]>(['mesocycles', athleteEmail], prev =>
        prev?.map(m => (m.id === meso.id ? { ...m, ...campos } : m)));
      showToast(aviso.zonas.length === 1 ? 'Hipótesis confirmada en el bloque' : 'Hipótesis confirmadas en el bloque', 'success');
    } catch (err) {
      console.error('usePendientesDeHipotesis: no se pudieron confirmar las hipótesis', err);
      showToast('No se han podido confirmar las hipótesis', 'error');
    } finally {
      setConfirmando(false);
    }
  };

  return { aviso, confirmando, onConfirmar: () => void onConfirmar() };
}

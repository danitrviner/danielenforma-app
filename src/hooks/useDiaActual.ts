import { useEffect, useState } from 'react';
import { hoyIsoLocal } from '../utils/trainingWeek';
import { JS_TO_WD } from '../components/nutrition/dietHelpers';
import type { WeekDay } from '../types';

/**
 * Qué día es AHORA, no qué día era cuando arrancó la app.
 *
 * Antes esto vivía en dos constantes de módulo (`TODAY_DATE`/`TODAY_WD` en
 * dietHelpers) y de ahí salían dos fallos que el atleta veía como "se me ha
 * borrado lo que había registrado":
 *
 *  1. `TODAY_DATE` usaba `toISOString()`, que da la fecha en UTC. En España
 *     (UTC+1/+2) entre medianoche y las 2:00 el registro del día se escribía
 *     con la fecha de AYER, mientras que `TODAY_WD` —que sí usaba la hora
 *     local— ya decía el día siguiente. Los dos no podían estar de acuerdo.
 *  2. Al ser constantes de módulo se calculaban UNA vez, al cargar. La app
 *     nativa no se recarga: se queda en segundo plano y vuelve. Un atleta que
 *     abría la app el martes sobre lo que había dejado el lunes seguía
 *     escribiendo y leyendo en la fecha del lunes.
 *
 * Este hook recalcula al volver la app a primer plano (`visibilitychange` y
 * `focus`, que es lo que dispara un webview nativo al reanudarse) y, si nada
 * de eso pasa porque la app está abierta a la vista, con un temporizador
 * puesto justo en el siguiente cambio de día.
 */
export function useDiaActual(): { fecha: string; diaSemana: WeekDay } {
  const [fecha, setFecha] = useState(hoyIsoLocal);

  useEffect(() => {
    const revisar = () => setFecha(actual => {
      const ahora = hoyIsoLocal();
      return ahora === actual ? actual : ahora;   // misma referencia = sin re-render
    });

    const alCambiarVisibilidad = () => { if (!document.hidden) revisar(); };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('focus', revisar);

    // Temporizador hasta la próxima medianoche local (+1s de margen), para la
    // app que se queda abierta y a la vista mientras cambia el día.
    const ahora = new Date();
    const medianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 1);
    const t = setTimeout(revisar, medianoche.getTime() - ahora.getTime());

    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('focus', revisar);
      clearTimeout(t);
    };
  }, [fecha]);   // al cambiar el día se rearma el temporizador para el siguiente

  return { fecha, diaSemana: diaSemanaDe(fecha) };
}

/** Día de la semana de una fecha YYYY-MM-DD, leída como fecha local. */
export function diaSemanaDe(fecha: string): WeekDay {
  const [y, m, d] = fecha.split('-').map(Number);
  return JS_TO_WD[new Date(y, m - 1, d).getDay()];
}

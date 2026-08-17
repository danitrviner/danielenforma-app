import React from 'react';
import { CardioZones } from '../../../../types';
import ZoneBars from '../../ZoneBars';

/* Página 3 del carrusel — tiempo por zona en vivo. Envuelve ZoneBars, que en
   F4 ganó la barra de progreso interna que le faltaba (§8bis del análisis).

   El fondo oscuro NO es decorativo: verificado en el navegador con datos
   simulados, el texto de cada fila usa el color de SU zona (rojo para Z5,
   naranja para Z4…) — sin este fondo, cuando la zona ACTUAL coincide con la
   de una fila (p. ej. en Z5, la propia fila de Z5), el texto rojo cae sobre
   un fondo rojo y se vuelve casi ilegible. Con el fondo oscuro, las cinco
   filas se leen igual sea cual sea el color de la pantalla en ese momento. */

interface Props {
  timeInZone: Record<keyof CardioZones, number>;
  belowZoneSec: number;
  elapsedSec: number;
  currentZone?: keyof CardioZones | null;
}

export default function PageZonas(props: Props) {
  return (
    <div className="flex h-full flex-col justify-center px-5">
      <div className="bg-black/25 rounded-surface p-3">
        <ZoneBars {...props} />
      </div>
    </div>
  );
}

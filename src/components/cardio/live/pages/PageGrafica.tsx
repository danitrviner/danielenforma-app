import React from 'react';
import { CardioZones } from '../../../../types';
import HrChart from '../../HrChart';

/* Página 4 del carrusel — gráfica de FC con bandas de zona macizas de fondo
   (§4bis.1 del análisis: "las bandas SON la referencia"). Sin la tarjeta
   negra que la envolvía antes: aquí vive directamente sobre el color de
   zona a pantalla completa, como en FITIV. */

interface Props {
  chartData: { t: number; bpm: number }[];
  zones: CardioZones;
  maxHR?: number;
}

export default function PageGrafica({ chartData, zones, maxHR }: Props) {
  if (chartData.length < 2) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <p className="text-caption font-sans uppercase text-white/50 text-center">Reuniendo datos de la sesión…</p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col justify-center px-3">
      <HrChart data={chartData} zones={zones} maxHR={maxHR} height={220} />
    </div>
  );
}

import React from 'react';
import Sparkline from '../../../components/ui/Sparkline';
import { formatEurosCompacto, variacionMensualPct, type IngresoMensual } from '../lib/dinero';

interface Props {
  serie: IngresoMensual[];
  onClick?: () => void;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function mesCorto(clave: string): string {
  const mesIdx = Number(clave.slice(5, 7)) - 1;
  return MESES_CORTOS[mesIdx] ?? clave;
}

// Tarjeta "RECURRENTE/MES" del Resumen: cobrado del mes en curso + histograma
// de los últimos 7 meses (Sparkline, misma primitiva que el resto de F3) +
// badge de variación vs. el mes anterior.
export default function RecurringRevenueCard({ serie, onClick }: Props) {
  const mesActual = serie[serie.length - 1];
  const variacion = variacionMensualPct(serie);
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`w-full text-left bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface p-3 flex flex-col gap-3 ${
        onClick ? 'hover:border-strong transition-colors cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-2">
          <span className="font-sans text-caption uppercase tracking-widest text-ink-2 leading-tight">Recurrente/mes</span>
          <span className="font-sans font-bold text-title-l text-ink leading-none tabular-nums">
            {mesActual ? formatEurosCompacto(mesActual.totalCents) : '—'}
          </span>
        </div>
        {variacion !== null && (
          <span
            className={`font-sans text-caption tabular-nums px-2 py-1 rounded-full shrink-0 ${
              variacion >= 0 ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger'
            }`}
          >
            {variacion >= 0 ? '+' : ''}{variacion}%
          </span>
        )}
      </div>
      <Sparkline
        values={serie.map(m => m.totalCents)}
        label={`Cobrado por mes, últimos ${serie.length} meses: ${serie.map(m => `${mesCorto(m.mes)} ${formatEurosCompacto(m.totalCents)}`).join(', ')}`}
        className="h-10"
      />
    </Wrapper>
  );
}

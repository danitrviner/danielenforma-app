import React from 'react';
import { formatEuros } from '../lib/dinero';
import { ETIQUETA_SIN_CLASIFICAR } from '../lib/catalogoServicios';
import type { FilaIngresos } from '../lib/ingresosPorServicio';

/* Ingresos por servicio (R-03): una fila por tipo (trimestral, semestral,
   anual, otro) y, al final, «Sin clasificar». Sin «rentabilidad»: no hay costes
   ni comisiones en el CRM. */

export default function IngresosPorServicio({ filas }: { filas: FilaIngresos[] }) {
  if (filas.length === 0) {
    return (
      <p className="rounded-surface border border-dashed border-hairline p-4 font-sans text-body-s text-ink-3">
        No hay cobros en este periodo.
      </p>
    );
  }
  const sinClasificar = filas.find(f => f.tipo === null);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-surface border border-hairline bg-surface">
        <table className="w-full min-w-[520px] text-left">
          <thead>
            <tr className="border-b border-hairline font-mono text-caption uppercase tracking-widest text-ink-3">
              <th scope="col" className="p-3 font-semibold">Servicio</th>
              <th scope="col" className="p-3 text-right font-semibold">Cobrado neto</th>
              <th scope="col" className="p-3 text-right font-semibold">Altas</th>
              <th scope="col" className="p-3 text-right font-semibold">Ticket medio</th>
              <th scope="col" className="p-3 text-right font-semibold">Renovación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {filas.map(f => (
              <tr key={f.grupo} className={f.tipo === null ? 'bg-warning/5' : undefined}>
                <th scope="row" className="p-3 font-sans text-body-s font-semibold text-ink">{f.grupo}</th>
                <td className="p-3 text-right font-mono text-body-s font-bold tabular-nums text-ink">{formatEuros(f.cobradoNetoCents)}</td>
                <td className="p-3 text-right font-mono text-body-s tabular-nums text-ink-2">{f.altas || '—'}</td>
                <td className="p-3 text-right font-mono text-body-s tabular-nums text-ink-2">
                  {f.ticketMedioCents === null ? '—' : formatEuros(f.ticketMedioCents)}
                </td>
                <td className="p-3 text-right font-mono text-body-s tabular-nums text-ink-2">
                  {f.tasaRenovacion === null ? '—' : `${String(f.tasaRenovacion).replace('.', ',')} %`}
                  {f.renovados + f.perdidos > 0 && <span className="block text-caption text-ink-3">{f.renovados} de {f.renovados + f.perdidos}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sinClasificar && (
        <p className="font-sans text-caption text-ink-3">
          «{ETIQUETA_SIN_CLASIFICAR}» son servicios antiguos o cobros sueltos sin tipo. Cobrado neto = cobrado menos devoluciones.
        </p>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useSuscripcionesDe } from '../hooks/useSuscripciones';
import { formatEuros, sumaCents } from '../lib/dinero';
import { mesesDePeriodicidad } from '../lib/fechas';
import MetricCard from './MetricCard';
import SuscripcionesBlock from './SuscripcionesBlock';
import SuscripcionModal from './SuscripcionModal';
import type { Cliente, CrmSuscripcion, Periodicidad } from '../types';

// Mensualiza el importe de una suscripción activa para poder sumarlas todas
// en una sola cifra comparable, aunque tengan periodicidades distintas
// (mensual, trimestral, semestral, anual). No incluye 'unico': una
// suscripción no debería tener esa periodicidad (el tipo la hereda de
// Periodicidad pero en la práctica solo usa mensual/trimestral/semestral/anual).
function mensualizado(s: CrmSuscripcion): number {
  const meses = mesesDePeriodicidad(s.periodicidad as Periodicidad);
  if (!meses) return s.importeCents;
  return Math.round(s.importeCents / meses);
}

export default function RenovacionesTab({ cliente, coachEmail }: { cliente: Cliente; coachEmail: string }) {
  const { data: suscripciones = [], isPending, isError } = useSuscripcionesDe(cliente.id);
  const [modalAbierto, setModalAbierto] = useState(false);

  const activas = suscripciones.filter(s => s.estado === 'activa');
  const recurrenteMensual = sumaCents(activas.map(s => ({ importeCents: mensualizado(s) })));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard icon="autorenew" label="Suscripciones activas" value={activas.length} sub={`${suscripciones.length} en total`} />
        <MetricCard icon="calendar_month" label="Recurrente / mes" value={formatEuros(recurrenteMensual)} sub="mensualizado" />
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-black font-sans font-bold text-[11px] hover:bg-accent-press transition-colors"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Nueva suscripción
        </button>
      </div>

      <SuscripcionesBlock
        suscripciones={suscripciones}
        cargando={isPending}
        error={isError}
        mostrarCliente={false}
        coachEmail={coachEmail}
        onNuevaSuscripcion={() => setModalAbierto(true)}
      />

      {modalAbierto && (
        <SuscripcionModal
          cliente={cliente}
          coachEmail={coachEmail}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { usePagosDe } from '../hooks/usePagos';
import { formatEuros, sumaCents } from '../lib/dinero';
import MetricCard from './MetricCard';
import PagosTable from './PagosTable';
import PagoModal from './PagoModal';
import type { Cliente } from '../types';

export default function PagosTab({ cliente, coachEmail }: { cliente: Cliente; coachEmail: string }) {
  const { data: pagos = [], isPending } = usePagosDe(cliente.id);
  const [modalAbierto, setModalAbierto] = useState(false);

  const cobrado = sumaCents(pagos.filter(p => p.estado === 'pagado'));
  const pendiente = sumaCents(pagos.filter(p => p.estado === 'pendiente'));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard icon="paid" label="Cobrado" value={formatEuros(cobrado)} sub={`${pagos.filter(p => p.estado === 'pagado').length} pagos`} />
        <MetricCard icon="schedule" label="Pendiente" value={formatEuros(pendiente)} sub={`${pagos.filter(p => p.estado === 'pendiente').length} pagos`} accent="#fdba74" />
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#fbcb1a] text-black font-sans font-bold text-[11px] hover:bg-[#d4a800] transition-colors"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Registrar pago
        </button>
      </div>

      <PagosTable
        pagos={pagos}
        cargando={isPending}
        mostrarCliente={false}
        coachEmail={coachEmail}
        onNuevoPago={() => setModalAbierto(true)}
      />

      {modalAbierto && (
        <PagoModal
          cliente={cliente}
          coachEmail={coachEmail}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </div>
  );
}

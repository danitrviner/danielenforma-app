import React, { useState } from 'react';
import { usePagosDe } from '../hooks/usePagos';
import { formatEuros, sumaCents } from '../lib/dinero';
import MetricCard from './MetricCard';
import PagosTable from './PagosTable';
import PagoModal from './PagoModal';
import type { Cliente } from '../types';
import { Button } from '../../../components/ui';

export default function PagosTab({ cliente, coachEmail }: { cliente: Cliente; coachEmail: string }) {
  const { data: pagos = [], isPending, isError } = usePagosDe(cliente.id);
  const [modalAbierto, setModalAbierto] = useState(false);

  const cobrado = sumaCents(pagos.filter(p => p.estado === 'pagado'));
  const pendiente = sumaCents(pagos.filter(p => p.estado === 'pendiente'));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard icon="paid" label="Cobrado" value={formatEuros(cobrado)} sub={`${pagos.filter(p => p.estado === 'pagado').length} pagos`} />
        <MetricCard icon="schedule" label="Pendiente" value={formatEuros(pendiente)} sub={`${pagos.filter(p => p.estado === 'pendiente').length} pagos`} accent="var(--color-warning)" />
      </div>

      <div className="flex items-center justify-end">
        <Button variant="primary" size="s" icon="add" onClick={() => setModalAbierto(true)}>
          Registrar pago
        </Button>
      </div>

      <PagosTable
        pagos={pagos}
        cargando={isPending}
        error={isError}
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

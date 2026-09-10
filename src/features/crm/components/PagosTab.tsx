import React, { useState } from 'react';
import { usePagosDe } from '../hooks/usePagos';
import { formatEuros, sumaCobrado, sumaPendiente, cobradoDe, pendienteDe } from '../lib/dinero';
import MetricCard from './MetricCard';
import PagosTable from './PagosTable';
import PagoModal from './PagoModal';
import type { Cliente } from '../types';
import { Button } from '../../../components/ui';

export default function PagosTab({ cliente, coachEmail }: { cliente: Cliente; coachEmail: string }) {
  const { data: pagos = [], isPending, isError } = usePagosDe(cliente.id);
  const [modalAbierto, setModalAbierto] = useState(false);

  // `sumaCobrado`/`sumaPendiente` y no un filtro por estado: un pago `parcial`
  // tiene dinero dentro que un `=== 'pagado'` se deja fuera, y un `impagado`
  // no es `pendiente`, así que desaparecía de las dos cifras a la vez — el
  // dinero que más falta hace era justo el que no se veía (Dani, 10-09-2026).
  const cobrado = sumaCobrado(pagos);
  const pendiente = sumaPendiente(pagos);
  const impagado = sumaPendiente(pagos.filter(p => p.estado === 'impagado'));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard icon="paid" label="Cobrado" value={formatEuros(cobrado)} sub={`${pagos.filter(p => cobradoDe(p) > 0).length} pagos`} />
        <MetricCard
          icon="schedule" label="Pendiente" value={formatEuros(pendiente)}
          sub={impagado > 0 ? `${formatEuros(impagado)} impagado` : `${pagos.filter(p => pendienteDe(p) > 0).length} pagos`}
          accent={impagado > 0 ? 'var(--color-danger)' : 'var(--color-warning)'}
        />
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

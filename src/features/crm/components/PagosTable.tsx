import React, { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useActualizarPago, useEliminarPago } from '../hooks/usePagos';
import { formatEuros } from '../lib/dinero';
import { formatDia, hoyISO } from '../lib/fechas';
import DataTable, { Columna } from './DataTable';
import { EstadoPagoPill } from './StatusPill';
import EmptyState from './EmptyState';
import PagoModal from './PagoModal';
import type { CrmPago } from '../types';

interface Props {
  pagos: CrmPago[];
  cargando?: boolean;
  mostrarCliente: boolean;
  coachEmail: string;
  onNuevoPago?: () => void;
}

// Tabla de pagos compartida entre PagosScreen (global) y PagosTab (por
// cliente). "Borrar" solo se pinta para pagos pendientes — un pago ya cobrado
// no se puede borrar y la regla de Firestore lo rechazaría; no tiene sentido
// ofrecer un botón que va a fallar siempre. Confirmación con window.confirm,
// el único patrón de confirmación que usa el resto del repo (no hay modal de
// confirmación custom en ningún sitio, ver ServiciosTab.tsx).
export default function PagosTable({ pagos, cargando, mostrarCliente, coachEmail, onNuevoPago }: Props) {
  const { showToast } = useToast();
  const actualizar = useActualizarPago();
  const eliminar = useEliminarPago();
  const [editando, setEditando] = useState<CrmPago | null>(null);

  const marcarPagado = async (p: CrmPago) => {
    try {
      await actualizar.mutateAsync({
        id: p.id,
        clientId: p.clientId,
        updates: { estado: 'pagado', fechaCobro: hoyISO() },
      });
      showToast('Pago marcado como cobrado', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido marcar como pagado', 'error');
    }
  };

  const borrar = async (p: CrmPago) => {
    if (!window.confirm(`¿Borrar el pago «${p.concepto}» (${formatEuros(p.importeCents)})?\n\nSolo se puede borrar mientras está pendiente.`)) return;
    try {
      await eliminar.mutateAsync({ id: p.id, clientId: p.clientId });
      showToast('Pago borrado', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido borrar el pago', 'error');
    }
  };

  const columnas: Columna<CrmPago>[] = [
    ...(mostrarCliente ? [{
      id: 'cliente',
      header: 'Cliente',
      render: (p: CrmPago) => <span className="font-bold truncate">{p.clientNombre}</span>,
    }] : []),
    {
      id: 'concepto',
      header: 'Concepto',
      render: p => <span className="truncate">{p.concepto}</span>,
    },
    {
      id: 'importe',
      header: 'Importe',
      width: '110px',
      align: 'right',
      render: p => <span className="font-bold">{formatEuros(p.importeCents)}</span>,
    },
    {
      id: 'estado',
      header: 'Estado',
      width: '100px',
      render: p => <EstadoPagoPill estado={p.estado} />,
    },
    {
      id: 'fecha',
      header: 'Fecha',
      width: '110px',
      render: p => (
        <span className="tabular-nums">{formatDia(p.estado === 'pagado' ? p.fechaCobro : p.fechaEmision)}</span>
      ),
    },
    {
      id: 'acciones',
      header: '',
      width: '120px',
      align: 'right',
      render: p => (
        <div className="flex items-center justify-end gap-1">
          {p.estado === 'pendiente' && (
            <button
              type="button"
              onClick={() => marcarPagado(p)}
              aria-label="Marcar como pagado"
              title="Marcar como pagado"
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-emerald-400 hover:bg-white/6 transition-colors"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditando(p)}
            aria-label="Editar"
            title="Editar"
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[#a8a89e] hover:bg-white/6 transition-colors"
          >
            <span className="material-symbols-outlined text-base">edit</span>
          </button>
          {p.estado === 'pendiente' && (
            <button
              type="button"
              onClick={() => borrar(p)}
              aria-label="Borrar"
              title="Borrar"
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[#fca5a5] hover:bg-white/6 transition-colors"
            >
              <span className="material-symbols-outlined text-base">delete</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="bg-[#181816]/80 backdrop-blur-sm border border-white/7 rounded-2xl overflow-hidden">
        <DataTable
          columnas={columnas}
          filas={pagos}
          keyOf={p => p.id}
          cargando={cargando}
          vacio={
            <EmptyState
              icon="euro"
              titulo="Aún no hay pagos"
              descripcion="Los pagos generados por servicios y suscripciones aparecerán aquí, o regístralos a mano."
              cta={onNuevoPago ? { label: 'Registrar pago', onClick: onNuevoPago } : undefined}
            />
          }
        />
      </div>

      {editando && (
        <PagoModal
          pago={editando}
          coachEmail={coachEmail}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}

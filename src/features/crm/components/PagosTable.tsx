import React, { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useActualizarPago, useEliminarPago } from '../hooks/usePagos';
import { formatEuros } from '../lib/dinero';
import { formatDia, hoyISO, diasDeRetraso, diasHasta, tiempoRelativo, fechaDeCobroSugerida } from '../lib/fechas';
import DataTable, { Columna } from './DataTable';
import { EstadoPagoPill } from './StatusPill';
import EmptyState from './EmptyState';
import PagoModal from './PagoModal';
import type { CrmPago } from '../types';
import { Icon } from '../../../components/ui';

interface Props {
  pagos: CrmPago[];
  cargando?: boolean;
  error?: boolean;
  mostrarCliente: boolean;
  coachEmail: string;
  onNuevoPago?: () => void;
}

// Un pago pendiente con más de esto de retraso desde su fechaEmision se
// resalta en la tabla. Decidido con Dani el 2026-08-02 — no es una nueva
// colección ni un cambio de estado en Firestore, solo derivado en el
// render: `diasDeRetraso` es pura, se recalcula cada vez, nada que
// desincronizar.
const UMBRAL_DIAS_AVISO = 7;

// Tabla de pagos compartida entre PagosScreen (global) y PagosTab (por
// cliente). "Borrar" solo se pinta para pagos pendientes — un pago ya cobrado
// no se puede borrar y la regla de Firestore lo rechazaría; no tiene sentido
// ofrecer un botón que va a fallar siempre. Confirmación con window.confirm,
// el único patrón de confirmación que usa el resto del repo (no hay modal de
// confirmación custom en ningún sitio, ver ServiciosTab.tsx).
export default function PagosTable({ pagos, cargando, error, mostrarCliente, coachEmail, onNuevoPago }: Props) {
  const { showToast } = useToast();
  const actualizar = useActualizarPago();
  const eliminar = useEliminarPago();
  const [editando, setEditando] = useState<CrmPago | null>(null);

  const marcarPagado = async (p: CrmPago) => {
    try {
      // La fecha de cobro NO es siempre hoy: una cuota que vencía el 31 de
      // agosto y se confirma el 3 de septiembre es facturación de agosto. Ver
      // `fechaDeCobroSugerida` — antes esto escribía `hoyISO()` a pelo y el
      // dinero cambiaba de mes en silencio.
      const fechaCobro = fechaDeCobroSugerida(p.fechaEmision);
      await actualizar.mutateAsync({
        id: p.id,
        clientId: p.clientId,
        updates: { estado: 'pagado', fechaCobro },
      });
      showToast(
        fechaCobro === hoyISO()
          ? 'Pago marcado como cobrado'
          : `Cobrado con fecha ${formatDia(fechaCobro)}, que es cuando vencía`,
        'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido marcar como pagado', 'error');
    }
  };

  /* Un pendiente que ya tenía que haber entrado. Lo marca el coach, NUNCA el
     reloj: deducirlo de los días de retraso convertiría un olvido en una deuda
     (docs/crm-modelo-v2.md). Y se puede deshacer, que marcarlo por error y no
     poder volver atrás dejaría la cifra de impagados mintiendo para siempre. */
  const marcarImpagado = async (p: CrmPago, impagado: boolean) => {
    try {
      await actualizar.mutateAsync({
        id: p.id,
        clientId: p.clientId,
        updates: { estado: impagado ? 'impagado' : 'pendiente' },
      });
      showToast(impagado ? 'Marcado como impagado' : 'Vuelve a estar pendiente', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido guardar', 'error');
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
      render: p => {
        const retraso = (p.estado === 'pendiente' || p.estado === 'impagado') ? diasDeRetraso(p.fechaEmision) : 0;
        const atrasado = retraso > UMBRAL_DIAS_AVISO;
        // Un pendiente con fecha futura (el plan que empieza el lunes que
        // viene) no está atrasado ni es de hoy: sin decirlo, la fila parecía
        // un cobro sin explicación en medio de la lista.
        const porVenir = p.estado === 'pendiente' && diasHasta(p.fechaEmision) > 0;
        return (
          <div>
            <span className={`tabular-nums ${atrasado ? 'text-danger font-bold' : ''}`}>
              {formatDia(p.estado === 'pagado' ? p.fechaCobro : p.fechaEmision)}
            </span>
            {porVenir && (
              <p className="font-mono text-caption text-ink-3">{tiempoRelativo(p.fechaEmision)}</p>
            )}
            {atrasado && (
              <p className="flex items-center font-mono text-caption text-danger">
                <Icon name="warning" size="s" />
                {retraso} días de retraso
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: 'acciones',
      header: '',
      width: '120px',
      align: 'right',
      render: p => (
        <div className="flex items-center justify-end gap-1">
          {(p.estado === 'pendiente' || p.estado === 'impagado' || p.estado === 'parcial') && (
            <button
              type="button"
              onClick={() => marcarPagado(p)}
              aria-label="Marcar como pagado"
              title="Marcar como pagado"
              className="w-7 h-7 rounded-control inline-flex items-center justify-center text-success hover:bg-white/6 transition-colors"
            >
              <Icon name="check_circle" size="m" />
            </button>
          )}
          {(p.estado === 'pendiente' || p.estado === 'impagado') && (
            <button
              type="button"
              onClick={() => marcarImpagado(p, p.estado !== 'impagado')}
              aria-label={p.estado === 'impagado' ? 'Volver a pendiente' : 'Marcar como impagado'}
              title={p.estado === 'impagado' ? 'Volver a pendiente' : 'Marcar como impagado'}
              className={`w-7 h-7 rounded-control inline-flex items-center justify-center hover:bg-white/6 transition-colors ${
                p.estado === 'impagado' ? 'text-warning' : 'text-ink-2'
              }`}
            >
              <Icon name={p.estado === 'impagado' ? 'undo' : 'report'} size="m" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditando(p)}
            aria-label="Editar"
            title="Editar"
            className="w-7 h-7 rounded-control inline-flex items-center justify-center text-ink-2 hover:bg-white/6 transition-colors"
          >
            <Icon name="edit" size="m" />
          </button>
          {(p.estado === 'pendiente' || p.estado === 'impagado') && (
            <button
              type="button"
              onClick={() => borrar(p)}
              aria-label="Borrar"
              title="Borrar"
              className="w-7 h-7 rounded-control inline-flex items-center justify-center text-danger hover:bg-white/6 transition-colors"
            >
              <Icon name="delete" size="m" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface overflow-hidden">
        <DataTable
          columnas={columnas}
          filas={pagos}
          keyOf={p => p.id}
          cargando={cargando}
          error={error}
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

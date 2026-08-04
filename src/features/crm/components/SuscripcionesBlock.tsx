import React, { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useActualizarSuscripcion, useRegistrarCobro } from '../hooks/useSuscripciones';
import { formatEuros } from '../lib/dinero';
import { formatDia, tiempoRelativo } from '../lib/fechas';
import DataTable, { Columna } from './DataTable';
import { EstadoSuscripcionPill } from './StatusPill';
import EmptyState from './EmptyState';
import SuscripcionModal from './SuscripcionModal';
import type { CrmSuscripcion } from '../types';
import { Icon } from '../../../components/ui';

interface Props {
  suscripciones: CrmSuscripcion[];
  cargando?: boolean;
  error?: boolean;
  mostrarCliente: boolean;
  coachEmail: string;
  onNuevaSuscripcion?: () => void;
}

// Lista de suscripciones, compartida entre PagosScreen (global, con columna
// Cliente) y RenovacionesTab (por cliente, sin esa columna). Es la única
// pieza de UI que llama a "Registrar cobro" — la transacción idempotente del
// backend hace el trabajo pesado, aquí solo se deshabilita el botón de la fila
// concreta mientras esa mutación está en vuelo (un doble clic humano ni
// siquiera llega a disparar la segunda llamada; la protección real contra
// dos pestañas / reintentos de red vive en el backend).
export default function SuscripcionesBlock({ suscripciones, cargando, error, mostrarCliente, coachEmail, onNuevaSuscripcion }: Props) {
  const { showToast } = useToast();
  const actualizar = useActualizarSuscripcion();
  const registrar = useRegistrarCobro();
  const [editando, setEditando] = useState<CrmSuscripcion | null>(null);

  const filaMutandoRegistro = (id: string) =>
    registrar.isPending && registrar.variables?.suscripcion.id === id;
  const filaMutandoPausa = (id: string) =>
    actualizar.isPending && actualizar.variables?.id === id;

  const onPausarReanudar = async (s: CrmSuscripcion) => {
    try {
      await actualizar.mutateAsync({
        id: s.id,
        clientId: s.clientId,
        updates: { estado: s.estado === 'activa' ? 'pausada' : 'activa' },
      });
      showToast(s.estado === 'activa' ? 'Suscripción pausada' : 'Suscripción reanudada', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido actualizar la suscripción', 'error');
    }
  };

  const columnas: Columna<CrmSuscripcion>[] = [
    ...(mostrarCliente ? [{
      id: 'cliente',
      header: 'Cliente',
      render: (s: CrmSuscripcion) => <span className="font-bold truncate">{s.clientNombre}</span>,
    }] : []),
    {
      id: 'concepto',
      header: 'Concepto',
      render: s => <span className="truncate">{s.concepto}</span>,
    },
    {
      id: 'importe',
      header: 'Importe',
      width: '130px',
      align: 'right',
      render: s => (
        <div>
          <p className="font-bold">{formatEuros(s.importeCents)}</p>
          <p className="font-mono text-caption text-ink-3">{s.periodicidad}</p>
        </div>
      ),
    },
    {
      id: 'proximoCobro',
      header: 'Próximo cobro',
      width: '140px',
      render: s => (
        <div>
          <p className="tabular-nums">{formatDia(s.proximoCobro)}</p>
          <p className="font-mono text-caption text-ink-3">{tiempoRelativo(s.proximoCobro)}</p>
        </div>
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      width: '100px',
      render: s => <EstadoSuscripcionPill estado={s.estado} />,
    },
    {
      id: 'acciones',
      header: '',
      width: '190px',
      align: 'right',
      render: s => (
        <div className="flex items-center justify-end gap-1">
          {s.estado === 'activa' && (
            <button
              type="button"
              onClick={() => registrar.mutate({ suscripcion: s, coachEmail })}
              disabled={filaMutandoRegistro(s.id)}
              className="px-2 py-1 rounded-control bg-accent/15 text-accent border border-accent/30 font-mono text-caption uppercase tracking-widest hover:bg-accent/25 disabled:opacity-40 transition-colors"
            >
              {filaMutandoRegistro(s.id) ? 'Registrando…' : 'Registrar cobro'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onPausarReanudar(s)}
            disabled={filaMutandoPausa(s.id)}
            aria-label={s.estado === 'activa' ? 'Pausar' : 'Reanudar'}
            title={s.estado === 'activa' ? 'Pausar' : 'Reanudar'}
            className="w-7 h-7 rounded-control inline-flex items-center justify-center text-ink-2 hover:bg-white/6 disabled:opacity-40 transition-colors"
          >
            <span className="material-symbols-outlined text-title-s">
              {s.estado === 'activa' ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setEditando(s)}
            aria-label="Editar"
            title="Editar"
            className="w-7 h-7 rounded-control inline-flex items-center justify-center text-ink-2 hover:bg-white/6 transition-colors"
          >
            <Icon name="edit" size="m" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface overflow-hidden">
        <DataTable
          columnas={columnas}
          filas={suscripciones}
          keyOf={s => s.id}
          cargando={cargando}
          error={error}
          vacio={
            <EmptyState
              icon="autorenew"
              titulo="Aún no hay suscripciones"
              descripcion="Cuando des de alta una, aparecerá aquí con su próximo cobro."
              cta={onNuevaSuscripcion ? { label: 'Nueva suscripción', onClick: onNuevaSuscripcion } : undefined}
            />
          }
        />
      </div>

      {editando && (
        <SuscripcionModal
          suscripcion={editando}
          coachEmail={coachEmail}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}

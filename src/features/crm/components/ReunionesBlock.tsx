import React, { useMemo, useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useActualizarReunion } from '../hooks/useReuniones';
import { useClientes } from '../hooks/useClientes';
import { formatDia, tiempoRelativo } from '../lib/fechas';
import { enlaceWhatsApp } from '../lib/identidad';
import DataTable, { Columna } from './DataTable';
import EmptyState from './EmptyState';
import ReunionModal from './ReunionModal';
import ResultadoGraduacionModal from './ResultadoGraduacionModal';
import type { CrmReunion } from '../types';
import { Icon } from '../../../components/ui';

interface Props {
  reuniones: CrmReunion[];
  cargando?: boolean;
  error?: boolean;
  mostrarCliente: boolean;
  coachEmail: string;
  onNuevaReunion?: () => void;
}

const TIPO_LABEL: Record<CrmReunion['tipo'], string> = {
  optimizacion: 'Optimización',
  graduacion: 'Graduación',
};

// Lista de reuniones compartida entre ReunionesScreen (global) y ReunionesTab
// (por cliente). El enlace de WhatsApp necesita el teléfono del cliente, que
// CrmReunion no guarda (solo clientId/clientNombre denormalizado) — se resuelve
// aquí contra `useClientes()`, la misma fuente unificada que ya usa el resto
// del CRM.
export default function ReunionesBlock({ reuniones, cargando, error, mostrarCliente, coachEmail, onNuevaReunion }: Props) {
  const { showToast } = useToast();
  const { clientes } = useClientes();
  const actualizar = useActualizarReunion();
  const [editando, setEditando] = useState<CrmReunion | null>(null);
  const [preguntandoGraduacion, setPreguntandoGraduacion] = useState<CrmReunion | null>(null);

  const telefonoPorClientId = useMemo(() => {
    const m = new Map<string, { prefijo: string; numero: string } | undefined>();
    for (const c of clientes) m.set(c.id, c.telefono);
    return m;
  }, [clientes]);

  const marcarRealizada = async (r: CrmReunion) => {
    // Marcar una GRADUACIÓN como realizada por primera vez pregunta antes si
    // el cliente pasa a continuidad — ver ResultadoGraduacionModal. Revertir
    // (quitar "realizada") y las de optimización siguen siendo un toggle directo.
    if (!r.realizada && r.tipo === 'graduacion') {
      setPreguntandoGraduacion(r);
      return;
    }
    try {
      await actualizar.mutateAsync({ id: r.id, clientId: r.clientId, updates: { realizada: !r.realizada } });
      showToast(r.realizada ? 'Reunión marcada como pendiente' : 'Reunión marcada como realizada', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido actualizar la reunión', 'error');
    }
  };

  const columnas: Columna<CrmReunion>[] = [
    ...(mostrarCliente ? [{
      id: 'cliente',
      header: 'Cliente',
      render: (r: CrmReunion) => <span className="font-bold truncate">{r.clientNombre}</span>,
    }] : []),
    {
      id: 'tipo',
      header: 'Tipo',
      width: '130px',
      render: r => <span>{TIPO_LABEL[r.tipo]}</span>,
    },
    {
      id: 'fecha',
      header: 'Fecha',
      width: '140px',
      render: r => (
        <div>
          <p className="tabular-nums">{formatDia(r.fecha)}</p>
          <p className="font-mono text-caption text-ink-3">{tiempoRelativo(r.fecha)}</p>
        </div>
      ),
    },
    {
      id: 'acciones',
      header: '',
      width: '170px',
      align: 'right',
      render: r => {
        const whatsapp = enlaceWhatsApp(telefonoPorClientId.get(r.clientId));
        return (
          <div className="flex items-center justify-end gap-1">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir WhatsApp"
                title="WhatsApp"
                className="w-7 h-7 rounded-control inline-flex items-center justify-center text-ink-2 hover:bg-white/6 transition-colors"
                onClick={e => e.stopPropagation()}
              >
                <Icon name="chat" size="m" />
              </a>
            )}
            <button
              type="button"
              onClick={() => setEditando(r)}
              aria-label="Editar"
              title="Editar"
              className="w-7 h-7 rounded-control inline-flex items-center justify-center text-ink-2 hover:bg-white/6 transition-colors"
            >
              <Icon name="edit" size="m" />
            </button>
            <button
              type="button"
              onClick={() => marcarRealizada(r)}
              disabled={actualizar.isPending && actualizar.variables?.id === r.id}
              className={`px-2 py-1 rounded-control font-mono text-caption uppercase tracking-widest transition-colors disabled:opacity-40 ${
                r.realizada
                  ? 'bg-white/6 text-ink-2 hover:bg-white/10'
                  : 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25'
              }`}
            >
              {r.realizada ? 'Realizada' : 'Marcar realizada'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface overflow-hidden">
        <DataTable
          columnas={columnas}
          filas={reuniones}
          keyOf={r => r.id}
          cargando={cargando}
          error={error}
          vacio={
            <EmptyState
              icon="event"
              titulo="Aún no hay reuniones"
              descripcion="Las reuniones de optimización y graduación aparecerán aquí, ordenadas por fecha."
              cta={onNuevaReunion ? { label: 'Nueva reunión', onClick: onNuevaReunion } : undefined}
            />
          }
        />
      </div>

      {editando && (
        <ReunionModal reunion={editando} coachEmail={coachEmail} onCerrar={() => setEditando(null)} />
      )}
      {preguntandoGraduacion && (
        <ResultadoGraduacionModal reunion={preguntandoGraduacion} onCerrar={() => setPreguntandoGraduacion(null)} />
      )}
    </>
  );
}

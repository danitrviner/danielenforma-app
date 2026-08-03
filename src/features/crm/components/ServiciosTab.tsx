import React, { useMemo, useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useServiciosDe, useArchivarServicio, servicioActual } from '../hooks/useServicios';
import { formatEuros, sumaCents } from '../lib/dinero';
import { formatDia, tiempoRelativo, hoyISO } from '../lib/fechas';
import DataTable, { Columna } from './DataTable';
import EmptyState from './EmptyState';
import MetricCard from './MetricCard';
import NuevoServicioModal from './NuevoServicioModal';
import type { Cliente, CrmServicio } from '../types';

export default function ServiciosTab({ cliente, coachEmail }: { cliente: Cliente; coachEmail: string }) {
  const { showToast } = useToast();
  const { data: servicios = [], isPending, isError } = useServiciosDe(cliente.id);
  const archivar = useArchivarServicio(cliente.id);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [verArchivados, setVerArchivados] = useState(false);

  const hoy = hoyISO();

  const visibles = useMemo(
    () => servicios
      .filter(s => verArchivados || !s.archivado)
      .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio)),
    [servicios, verArchivados]
  );

  const actual = servicioActual(servicios, hoy);
  const activos = servicios.filter(s => !s.archivado && (!s.fechaFin || s.fechaFin >= hoy));

  const onArchivar = async (s: CrmServicio) => {
    const accion = s.archivado ? 'desarchivar' : 'archivar';
    if (!s.archivado && !window.confirm(`¿Archivar «${s.nombre}»?\n\nNo se borra: seguirá contando en el historial y en lo facturado.`)) return;
    try {
      await archivar.mutateAsync({ id: s.id, archivar: !s.archivado });
      showToast(s.archivado ? 'Servicio recuperado' : 'Servicio archivado', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : `No se ha podido ${accion} el servicio`, 'error');
    }
  };

  const columnas: Columna<CrmServicio>[] = [
    {
      id: 'nombre',
      header: 'Servicio',
      render: s => (
        <div className="min-w-0">
          <p className={`font-bold truncate ${s.archivado ? 'text-ink-3 line-through' : ''}`}>{s.nombre}</p>
          {s.descripcion && <p className="font-mono text-caption text-ink-3 truncate">{s.descripcion}</p>}
        </div>
      ),
    },
    {
      id: 'importe',
      header: 'Importe',
      width: '120px',
      align: 'right',
      render: s => (
        <div>
          <p className="font-bold">{formatEuros(s.importeCents)}</p>
          <p className="font-mono text-caption text-ink-3">{s.periodicidad}</p>
        </div>
      ),
    },
    {
      id: 'periodo',
      header: 'Periodo',
      width: '170px',
      render: s => (
        <div>
          <p className="tabular-nums">{formatDia(s.fechaInicio)}{s.fechaFin ? ` → ${formatDia(s.fechaFin)}` : ''}</p>
          <p className="font-mono text-caption text-ink-3">
            {s.fechaFin
              ? (s.fechaFin < hoy ? 'finalizado' : `acaba ${tiempoRelativo(s.fechaFin)}`)
              : 'sin fecha de fin'}
          </p>
        </div>
      ),
    },
    {
      id: 'acciones',
      header: '',
      width: '48px',
      align: 'right',
      render: s => (
        <button
          type="button"
          onClick={() => onArchivar(s)}
          aria-label={s.archivado ? 'Recuperar servicio' : 'Archivar servicio'}
          title={s.archivado ? 'Recuperar' : 'Archivar'}
          className="w-7 h-7 rounded-control inline-flex items-center justify-center text-ink-2 hover:bg-white/6 transition-colors"
        >
          <span className="material-symbols-outlined text-base">
            {s.archivado ? 'unarchive' : 'archive'}
          </span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <MetricCard icon="sell" label="Servicio actual" value={actual ? formatEuros(actual.importeCents) : '—'} sub={actual?.nombre ?? 'ninguno vigente'} />
        <MetricCard icon="layers" label="Activos" value={activos.length} sub={`${servicios.length} en total`} />
        <MetricCard icon="euro" label="Contratado" value={formatEuros(sumaCents(servicios))} sub="suma histórica" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-widest text-ink-2 cursor-pointer">
          <input
            type="checkbox"
            checked={verArchivados}
            onChange={e => setVerArchivados(e.target.checked)}
            className="accent-accent"
          />
          Ver archivados
        </label>
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-control bg-accent text-black font-sans font-bold text-caption hover:bg-accent-press transition-colors"
        >
          <span className="material-symbols-outlined text-body-s">add</span>
          Nuevo servicio
        </button>
      </div>

      <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface overflow-hidden">
        <DataTable
          columnas={columnas}
          filas={visibles}
          keyOf={s => s.id}
          cargando={isPending}
          error={isError}
          vacio={
            <EmptyState
              icon="sell"
              titulo="Aún no hay servicios"
              descripcion="Al dar de alta un servicio con importe, se genera su cobro pendiente automáticamente."
              cta={{ label: 'Nuevo servicio', onClick: () => setModalAbierto(true) }}
            />
          }
        />
      </div>

      {modalAbierto && (
        <NuevoServicioModal
          cliente={cliente}
          coachEmail={coachEmail}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </div>
  );
}

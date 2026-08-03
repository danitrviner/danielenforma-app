import React, { useState } from 'react';
import { useReunionesDe } from '../hooks/useReuniones';
import { useServiciosDe, fechaFinPrograma } from '../hooks/useServicios';
import { formatDia, tiempoRelativo } from '../lib/fechas';
import ReunionesBlock from './ReunionesBlock';
import ReunionModal from './ReunionModal';
import type { Cliente } from '../types';

export default function ReunionesTab({ cliente, coachEmail }: { cliente: Cliente; coachEmail: string }) {
  const { data: reuniones = [], isPending, isError } = useReunionesDe(cliente.id);
  const { data: servicios = [] } = useServiciosDe(cliente.id);
  const [modalAbierto, setModalAbierto] = useState(false);

  const finPrograma = fechaFinPrograma(servicios);

  return (
    <div className="space-y-3">
      <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface p-4 flex items-center gap-3">
        <span className="material-symbols-outlined text-lg text-accent">flag</span>
        <div>
          <p className="font-mono text-caption uppercase tracking-widest text-ink-2">Fin de programa</p>
          <p className="font-sans font-bold text-body-s text-ink">
            {finPrograma ? `${formatDia(finPrograma)} · ${tiempoRelativo(finPrograma)}` : 'Sin fecha de fin definida'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-control bg-accent text-black font-sans font-bold text-caption hover:bg-accent-press transition-colors"
        >
          <span className="material-symbols-outlined text-body-s">add</span>
          Nueva reunión
        </button>
      </div>

      <ReunionesBlock
        reuniones={reuniones}
        cargando={isPending}
        error={isError}
        mostrarCliente={false}
        coachEmail={coachEmail}
        onNuevaReunion={() => setModalAbierto(true)}
      />

      {modalAbierto && (
        <ReunionModal cliente={cliente} coachEmail={coachEmail} onCerrar={() => setModalAbierto(false)} />
      )}
    </div>
  );
}

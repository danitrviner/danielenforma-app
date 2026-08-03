import React, { useMemo, useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useReuniones, useActualizarReunion } from '../hooks/useReuniones';
import { useServicios } from '../hooks/useServicios';
import { useClientes } from '../hooks/useClientes';
import { formatDia, tiempoRelativo, hoyISO } from '../lib/fechas';
import { enlaceWhatsApp } from '../lib/identidad';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import ReunionModal from '../components/ReunionModal';
import ResultadoGraduacionModal from '../components/ResultadoGraduacionModal';
import type { CrmReunion } from '../types';

const TIPO_LABEL: Record<CrmReunion['tipo'], string> = {
  optimizacion: 'Optimización',
  graduacion: 'Graduación',
};

// Evento unificado: una reunión pendiente o el fin de un programa. El prompt
// original pide una sola lista ordenada por fecha combinando ambas cosas — un
// coach que ve "a Marcos le acaba el programa en 5 días" sabe que le toca
// agendar la graduación, aunque esa reunión concreta todavía no exista.
interface Evento {
  id: string;
  fecha: string;
  clientId: string;
  clientNombre: string;
  tipo: 'reunion' | 'fin_programa';
  reunion?: CrmReunion;
  etiqueta: string;
}

export default function ReunionesScreen({ coachEmail }: { coachEmail: string }) {
  const { showToast } = useToast();
  const { data: reuniones = [], isPending: cargandoReuniones, isError: errorReuniones } = useReuniones();
  const { data: servicios = [], isPending: cargandoServicios, isError: errorServicios } = useServicios();
  const { clientes } = useClientes();
  const actualizar = useActualizarReunion();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<CrmReunion | null>(null);
  const [preguntandoGraduacion, setPreguntandoGraduacion] = useState<CrmReunion | null>(null);

  const cargando = cargandoReuniones || cargandoServicios;
  const error = errorReuniones || errorServicios;
  const hoy = hoyISO();

  const telefonoPorClientId = useMemo(() => {
    const m = new Map<string, { prefijo: string; numero: string } | undefined>();
    for (const c of clientes) m.set(c.id, c.telefono);
    return m;
  }, [clientes]);

  const eventos = useMemo<Evento[]>(() => {
    const deReuniones: Evento[] = reuniones
      .filter(r => !r.realizada)
      .map(r => ({
        id: `reunion_${r.id}`, fecha: r.fecha, clientId: r.clientId, clientNombre: r.clientNombre,
        tipo: 'reunion' as const, reunion: r, etiqueta: TIPO_LABEL[r.tipo],
      }));

    // Un fin de programa por CLIENTE (el más lejano), no uno por servicio —
    // si un cliente tiene tres servicios que acaban el mismo mes, la agenda
    // del coach no necesita tres avisos idénticos.
    const finPorCliente = new Map<string, { fecha: string; clientNombre: string }>();
    for (const s of servicios) {
      if (s.archivado || !s.fechaFin || s.fechaFin < hoy) continue;
      const actual = finPorCliente.get(s.clientId);
      if (!actual || s.fechaFin > actual.fecha) finPorCliente.set(s.clientId, { fecha: s.fechaFin, clientNombre: s.clientNombre });
    }
    const deFines: Evento[] = [...finPorCliente.entries()].map(([clientId, v]) => ({
      id: `fin_${clientId}`, fecha: v.fecha, clientId, clientNombre: v.clientNombre,
      tipo: 'fin_programa' as const, etiqueta: 'Fin de programa',
    }));

    return [...deReuniones, ...deFines].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [reuniones, servicios, hoy]);

  const marcarRealizada = async (r: CrmReunion) => {
    // Ver ResultadoGraduacionModal: una graduación pregunta si el cliente pasa
    // a continuidad antes de marcarse como realizada.
    if (r.tipo === 'graduacion') {
      setPreguntandoGraduacion(r);
      return;
    }
    try {
      await actualizar.mutateAsync({ id: r.id, clientId: r.clientId, updates: { realizada: true } });
      showToast('Reunión marcada como realizada', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido actualizar la reunión', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-sans font-black text-xl text-ink">Reuniones</h1>
          <p className="font-mono text-[9px] uppercase tracking-widest text-ink-3">
            Optimización, graduación y fin de programa — ordenadas por fecha
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-control bg-accent text-black font-sans font-bold text-[11px] hover:bg-accent-press transition-colors"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Nueva reunión
        </button>
      </header>

      {error ? (
        <ErrorState />
      ) : cargando ? (
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-surface bg-white/4 animate-pulse" />)}
        </div>
      ) : eventos.length === 0 ? (
        <EmptyState
          icon="event"
          titulo="Nada pendiente"
          descripcion="Sin reuniones pendientes ni fines de programa a la vista."
          cta={{ label: 'Nueva reunión', onClick: () => setModalAbierto(true) }}
        />
      ) : (
        <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface divide-y divide-white/7">
          {eventos.map(ev => {
            const whatsapp = enlaceWhatsApp(telefonoPorClientId.get(ev.clientId));
            const pasada = ev.fecha < hoy;
            return (
              <div key={ev.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${ev.tipo === 'fin_programa' ? 'bg-warning' : 'bg-accent'}`} />
                  <div className="min-w-0">
                    <p className="font-sans text-[11px] text-ink truncate">
                      <span className="font-bold">{ev.clientNombre}</span> · {ev.etiqueta}
                    </p>
                    <p className={`font-mono text-[9px] tabular-nums ${pasada ? 'text-danger' : 'text-ink-3'}`}>
                      {formatDia(ev.fecha)} · {tiempoRelativo(ev.fecha)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {whatsapp && (
                    <a
                      href={whatsapp} target="_blank" rel="noopener noreferrer"
                      aria-label="Abrir WhatsApp" title="WhatsApp"
                      className="w-7 h-7 rounded-control inline-flex items-center justify-center text-ink-2 hover:bg-white/6 transition-colors"
                    >
                      <span className="material-symbols-outlined text-base">chat</span>
                    </a>
                  )}
                  {ev.tipo === 'reunion' && ev.reunion && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditando(ev.reunion!)}
                        aria-label="Editar" title="Editar"
                        className="w-7 h-7 rounded-control inline-flex items-center justify-center text-ink-2 hover:bg-white/6 transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => marcarRealizada(ev.reunion!)}
                        disabled={actualizar.isPending && actualizar.variables?.id === ev.reunion!.id}
                        className="px-2 py-1 rounded-control bg-accent/15 text-accent border border-accent/30 font-mono text-[9px] uppercase tracking-widest hover:bg-accent/25 disabled:opacity-40 transition-colors"
                      >
                        Realizada
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalAbierto && (
        <ReunionModal coachEmail={coachEmail} onCerrar={() => setModalAbierto(false)} />
      )}
      {editando && (
        <ReunionModal reunion={editando} coachEmail={coachEmail} onCerrar={() => setEditando(null)} />
      )}
      {preguntandoGraduacion && (
        <ResultadoGraduacionModal reunion={preguntandoGraduacion} onCerrar={() => setPreguntandoGraduacion(null)} />
      )}
    </div>
  );
}

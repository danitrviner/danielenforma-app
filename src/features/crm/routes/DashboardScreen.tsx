import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientes } from '../hooks/useClientes';
import { useReuniones } from '../hooks/useReuniones';
import { usePagos } from '../hooks/usePagos';
import { formatEuros, sumaCents } from '../lib/dinero';
import { formatDia, tiempoRelativo, hoyISO } from '../lib/fechas';
import MetricCard from '../components/MetricCard';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

const MAX_FILAS = 6;

export default function DashboardScreen() {
  const navigate = useNavigate();
  const { contadores, isPending: cargandoClientes, error: errorClientes } = useClientes();
  const { data: reuniones = [], isPending: cargandoReuniones, isError: errorReuniones } = useReuniones();
  const { data: pagos = [], isPending: cargandoPagos, isError: errorPagos } = usePagos();

  // "—" cubre TANTO cargando como error: en una tarjeta pequeña no hay sitio
  // para distinguirlos, y mostrar "0,00 €" cuando en realidad la lectura
  // falló sería peor — un cero falso, no un "no lo sé todavía".
  const clientesSinDato = cargandoClientes || Boolean(errorClientes);
  const reunionesSinDato = cargandoReuniones || errorReuniones;
  const pagosSinDato = cargandoPagos || errorPagos;

  const hoy = hoyISO();

  const proximasReuniones = useMemo(
    () => reuniones.filter(r => !r.realizada).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, MAX_FILAS),
    [reuniones]
  );
  const pagosPendientes = useMemo(
    () => pagos.filter(p => p.estado === 'pendiente').sort((a, b) => a.fechaEmision.localeCompare(b.fechaEmision)).slice(0, MAX_FILAS),
    [pagos]
  );

  const facturado = sumaCents(pagos.filter(p => p.estado === 'pagado'));
  const totalPendiente = sumaCents(pagos.filter(p => p.estado === 'pendiente'));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-sans font-black text-xl text-[#f5f5f0]">Resumen</h1>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          icon="group" label="Clientes activos"
          value={clientesSinDato ? '—' : contadores.activo}
          onClick={() => navigate('/crm/clientes?estado=activo')}
        />
        <MetricCard
          icon="event" label="Próximas reuniones"
          value={reunionesSinDato ? '—' : reuniones.filter(r => !r.realizada).length}
          onClick={() => navigate('/crm/reuniones')}
        />
        <MetricCard
          icon="schedule" label="Pagos pendientes"
          value={pagosSinDato ? '—' : formatEuros(totalPendiente)}
          accent="#fdba74"
          onClick={() => navigate('/crm/pagos?estado=pendiente')}
        />
        <MetricCard
          icon="paid" label="Facturado"
          value={pagosSinDato ? '—' : formatEuros(facturado)}
          onClick={() => navigate('/crm/pagos?estado=pagado')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section className="space-y-2">
          <h2 className="font-mono text-[9px] uppercase tracking-widest text-[#a8a89e]">Próximas reuniones</h2>
          <div className="bg-[#181816]/80 backdrop-blur-sm border border-white/7 rounded-2xl divide-y divide-white/7">
            {errorReuniones ? (
              <ErrorState />
            ) : proximasReuniones.length === 0 ? (
              <EmptyState icon="event" titulo="Nada pendiente" descripcion="Sin reuniones pendientes." />
            ) : (
              proximasReuniones.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-3">
                  <p className="font-sans text-[11px] text-[#f5f5f0] truncate">{r.clientNombre}</p>
                  <p className="font-mono text-[9px] text-[#555550] shrink-0 tabular-nums">{tiempoRelativo(r.fecha)}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-mono text-[9px] uppercase tracking-widest text-[#a8a89e]">Pagos pendientes</h2>
          <div className="bg-[#181816]/80 backdrop-blur-sm border border-white/7 rounded-2xl divide-y divide-white/7">
            {errorPagos ? (
              <ErrorState />
            ) : pagosPendientes.length === 0 ? (
              <EmptyState icon="euro" titulo="Nada pendiente" descripcion="Sin pagos pendientes." />
            ) : (
              pagosPendientes.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-3">
                  <p className="font-sans text-[11px] text-[#f5f5f0] truncate">{p.clientNombre}</p>
                  <p className="font-mono text-[9px] text-[#fdba74] shrink-0 tabular-nums">{formatEuros(p.importeCents)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

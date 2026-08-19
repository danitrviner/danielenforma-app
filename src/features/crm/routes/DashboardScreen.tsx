import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientes } from '../hooks/useClientes';
import { useReuniones } from '../hooks/useReuniones';
import { usePagos } from '../hooks/usePagos';
import { formatEuros, sumaCents, ingresosPorMes } from '../lib/dinero';
import { formatDia, tiempoRelativo, hoyISO, aDiaISO } from '../lib/fechas';
import MetricCard from '../components/MetricCard';
import RecurringRevenueCard from '../components/RecurringRevenueCard';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Skeleton from '../../../components/ui/Skeleton';

const MAX_FILAS = 6;

export default function DashboardScreen() {
  const navigate = useNavigate();
  const { clientes, contadores, isPending: cargandoClientes, error: errorClientes } = useClientes();
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

  const serieIngresos = useMemo(() => ingresosPorMes(pagos), [pagos]);

  const facturado = sumaCents(pagos.filter(p => p.estado === 'pagado'));
  const totalPendiente = sumaCents(pagos.filter(p => p.estado === 'pendiente'));

  // Conversión a continuidad: % de graduaciones YA resueltas que pasan a
  // continuidad. Es la palanca de negocio más grande según
  // objetivo-100k-desglose.md (el 40% de continuidad baja las ventas nuevas
  // necesarias de ~10/mes a ~6-7/mes) — sin esto, era incalculable.
  const graduacionesConResultado = reuniones.filter(r => r.tipo === 'graduacion' && r.resultadoGraduacion);
  const conversionContinuidad = graduacionesConResultado.length > 0
    ? Math.round((graduacionesConResultado.filter(r => r.resultadoGraduacion === 'continua').length / graduacionesConResultado.length) * 100)
    : null;

  // Churn: misma fórmula que la celda "% Renovación" (=Renovaciones/Clientes
  // a renovar) del Cuadro de Mandos General de Dani, en su forma complementaria
  // — Bajas / Clientes a renovar. Aquí "a renovar" es la graduación con
  // decisión ya tomada (graduacionesConResultado) y "baja" es resultadoGraduacion
  // === 'no_continua'. Ojo: NO es bajas / clientes activos totales — ese
  // denominador daría un número distinto del que Dani lee en su Excel.
  const churn = graduacionesConResultado.length > 0
    ? Math.round((graduacionesConResultado.filter(r => r.resultadoGraduacion === 'no_continua').length / graduacionesConResultado.length) * 100)
    : null;

  // Bajas de los últimos 30 días — el churn mensual del cuadro de mando
  // (kpis-mensuales.md, objetivo <10%) necesita ESTE número, no solo el total
  // histórico de `contadores.baja`.
  const hace30dias = aDiaISO(new Date(Date.now() - 30 * 86_400_000));
  const bajasRecientes = clientes.filter(c => c.fechaBaja && c.fechaBaja >= hace30dias);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-sans font-bold text-title-m text-ink">Resumen</h1>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          icon="group" label="Clientes activos"
          value={clientesSinDato ? '—' : contadores.activo}
          sub={clientesSinDato ? undefined : `${contadores.lead + contadores.llamada_agendada} en preventa`}
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
          accent="var(--color-warning)"
          onClick={() => navigate('/crm/pagos?estado=pendiente')}
        />
        <MetricCard
          icon="paid" label="Facturado"
          value={pagosSinDato ? '—' : formatEuros(facturado)}
          onClick={() => navigate('/crm/pagos?estado=pagado')}
        />
      </div>

      {pagosSinDato ? (
        <Skeleton className="h-[104px] w-full" />
      ) : (
        <RecurringRevenueCard serie={serieIngresos} onClick={() => navigate('/crm/pagos?estado=pagado')} />
      )}

      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          icon="trending_up" label="Continuidad"
          value={reunionesSinDato ? '—' : conversionContinuidad !== null ? `${conversionContinuidad}%` : '—'}
          sub={conversionContinuidad === null ? 'sin graduaciones aún' : `${graduacionesConResultado.length} graduaciones`}
        />
        <MetricCard
          icon="trending_down" label="Churn"
          value={reunionesSinDato ? '—' : churn !== null ? `${churn}%` : '—'}
          accent={churn !== null && churn > 0 ? 'var(--color-danger)' : undefined}
          sub={churn === null ? 'sin graduaciones aún' : `${graduacionesConResultado.length} graduaciones`}
        />
        <MetricCard
          icon="person_remove" label="Bajas (30 días)"
          value={clientesSinDato ? '—' : bajasRecientes.length}
          accent={bajasRecientes.length > 0 ? 'var(--color-danger)' : undefined}
          onClick={() => navigate('/crm/clientes?estado=baja')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section className="space-y-2">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-2">Próximas reuniones</h2>
          <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface divide-y divide-white/7">
            {errorReuniones ? (
              <ErrorState />
            ) : proximasReuniones.length === 0 ? (
              <EmptyState icon="event" titulo="Nada pendiente" descripcion="Sin reuniones pendientes." />
            ) : (
              proximasReuniones.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-3">
                  <p className="font-sans text-caption text-ink truncate">{r.clientNombre}</p>
                  <p className="font-mono text-caption text-ink-3 shrink-0 tabular-nums">{tiempoRelativo(r.fecha)}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-2">Pagos pendientes</h2>
          <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface divide-y divide-white/7">
            {errorPagos ? (
              <ErrorState />
            ) : pagosPendientes.length === 0 ? (
              <EmptyState icon="euro" titulo="Nada pendiente" descripcion="Sin pagos pendientes." />
            ) : (
              pagosPendientes.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-3">
                  <p className="font-sans text-caption text-ink truncate">{p.clientNombre}</p>
                  <p className="font-mono text-caption text-warning shrink-0 tabular-nums">{formatEuros(p.importeCents)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientes } from '../hooks/useClientes';
import { useReuniones } from '../hooks/useReuniones';
import { usePagos } from '../hooks/usePagos';
import { formatEuros, sumaCobrado, pendienteDe, ingresosPorMes } from '../lib/dinero';
import {
  facturacionDelMes, mesDe, mrr, permanenciaMedia, ltvMedio, ticketMedio, agrupaCobrado,
  churnDelMes, porCobrar,
} from '../lib/metricas';
import { cobradoDe } from '../lib/dinero';
import type { CrmPago } from '../types';
import { useServicios } from '../hooks/useServicios';
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
    // Los impagados primero: son los que hay que llamar hoy.
    () => pagos.filter(p => pendienteDe(p) > 0)
      .sort((a, b) => Number(b.estado === 'impagado') - Number(a.estado === 'impagado')
        || a.fechaEmision.localeCompare(b.fechaEmision))
      .slice(0, MAX_FILAS),
    [pagos]
  );

  const serieIngresos = useMemo(() => ingresosPorMes(pagos), [pagos]);

  // Nada de filtrar por `estado === 'pagado'`/`'pendiente'`: un pago `parcial`
  // lleva dinero dentro que el primero se deja fuera, y un `impagado` no es
  // `pendiente`, así que se caía de las dos cifras (Dani, 10-09-2026).
  const facturado = sumaCobrado(pagos);
  const { pendienteCents: totalPendiente, impagadoCents: impagado } = porCobrar(pagos);

  /* Las métricas de valor razonan POR CLIENTE, así que hacen falta los
     movimientos y los servicios agrupados por su id. Se hace una vez aquí y
     no dentro de cada métrica: son los mismos dos recorridos para las cinco. */
  const { data: servicios = [] } = useServicios();
  const porClienteMovimientos = useMemo(() => {
    const m = new Map<string, typeof pagos>();
    for (const p of pagos) m.set(p.clientId, [...(m.get(p.clientId) ?? []), p]);
    return m;
  }, [pagos]);
  const porClienteServicios = useMemo(() => {
    const m = new Map<string, typeof servicios>();
    for (const sv of servicios) m.set(sv.clientId, [...(m.get(sv.clientId) ?? []), sv]);
    return m;
  }, [servicios]);

  const recurrente = useMemo(() => mrr(servicios, hoy), [servicios, hoy]);
  const churnMes = useMemo(
    () => churnDelMes(clientes, mesDe(hoy), porClienteServicios),
    [clientes, hoy, porClienteServicios],
  );
  const permanencia = useMemo(() => permanenciaMedia(porClienteServicios, hoy), [porClienteServicios, hoy]);
  const valorMedio = useMemo(() => ltvMedio(porClienteMovimientos), [porClienteMovimientos]);
  const ticketAlta = useMemo(() => ticketMedio(pagos, 'alta'), [pagos]);

  /* Qué servicio deja más dinero. Es la comparación que no se podía hacer
     —«el B cobra menos de alta pero tiene más recorrido»— y sale de agrupar lo
     cobrado por el NOMBRE del servicio del que cuelga cada movimiento. */
  const porServicio = useMemo(() => {
    const nombrePorId = new Map(servicios.map(sv => [sv.id, sv.nombre]));
    return agrupaCobrado<CrmPago>(pagos, p => (p.servicioId ? nombrePorId.get(p.servicioId) : undefined), cobradoDe)
      .filter(g => g.totalCents > 0)
      .slice(0, 4);
  }, [pagos, servicios]);

  // Lo del MES en curso, desglosado por clase de venta.
  const delMes = useMemo(() => facturacionDelMes(pagos, mesDe(hoy)), [pagos, hoy]);
  const desgloseClasificado = delMes.altasCents + delMes.renovacionesCents + delMes.upsellsCents;

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
          sub={!pagosSinDato && impagado > 0 ? `${formatEuros(impagado)} impagado` : undefined}
          accent={impagado > 0 ? 'var(--color-danger)' : 'var(--color-warning)'}
          onClick={() => navigate('/crm/pagos?estado=pendiente')}
        />
        {/* «Facturado» a secas se leía como «este mes» y era el total de toda
            la vida: un mes flojo seguía enseñando una cifra enorme y parecía
            que las fechas no funcionaban (Dani, 10-09-2026). Ahora la tarjeta
            grande es la del MES, que es lo que se mira para saber cómo va, y
            el histórico queda de subtítulo. */}
        <MetricCard
          icon="paid" label="Facturado este mes"
          value={pagosSinDato ? '—' : formatEuros(delMes.totalCents)}
          sub={pagosSinDato ? undefined : `${formatEuros(facturado)} en total`}
          onClick={() => navigate('/crm/pagos?estado=pagado')}
        />
      </div>

      {/* De dónde sale el dinero del mes: vender a alguien nuevo, que un
          cliente siga, o venderle más al que ya está. Es la pregunta que el
          CRM no podía contestar porque los movimientos no llevaban `tipo`
          (docs/crm-modelo-v2.md). Solo se pinta cuando hay algo clasificado:
          antes de pasar `scripts/migrarCrmTipos.mjs` esto sería una fila de
          ceros que haría pensar que no se ha facturado nada. */}
      {!pagosSinDato && desgloseClasificado > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <MetricCard icon="person_add"     label="Altas"        value={formatEuros(delMes.altasCents)} sub="este mes" />
          <MetricCard icon="autorenew"      label="Renovaciones" value={formatEuros(delMes.renovacionesCents)} sub="este mes" />
          <MetricCard icon="trending_up"    label="Upsells"      value={formatEuros(delMes.upsellsCents)} sub="este mes" />
        </div>
      )}

      {pagosSinDato ? (
        <Skeleton className="h-[104px] w-full" />
      ) : (
        <RecurringRevenueCard serie={serieIngresos} onClick={() => navigate('/crm/pagos?estado=pagado')} />
      )}

      {/* ── La forma del negocio ────────────────────────────────────────────
          Las cuatro de arriba dicen cómo va ESTE mes; estas cuatro dicen qué
          clase de negocio es. Cien clientes de tres meses no son cien clientes
          de doce, y hasta ahora el CRM no distinguía esos dos negocios
          (docs/crm-modelo-v2.md). Cada una se calla si aún no tiene con qué
          responder, en vez de enseñar un cero que se lee como un dato malo. */}
      <section className="space-y-2">
        <h2 className="font-mono text-caption uppercase tracking-widest text-ink-3">Cómo es tu negocio</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard
            icon="autorenew" label="Recurrente / mes"
            value={recurrente > 0 ? formatEuros(recurrente) : '—'}
            sub="servicios en curso"
          />
          <MetricCard
            icon="schedule" label="Permanencia"
            value={permanencia != null ? `${permanencia.toString().replace('.', ',')} meses` : '—'}
            sub="de media"
          />
          <MetricCard
            icon="insights" label="Valor por cliente"
            value={valorMedio != null ? formatEuros(valorMedio) : '—'}
            sub="cobrado, de media"
          />
          <MetricCard
            icon="sell" label="Ticket de alta"
            value={ticketAlta != null ? formatEuros(ticketAlta) : '—'}
            sub="medio"
          />
        </div>
      </section>

      {/* Qué servicio deja más. Solo con dos o más: con uno no hay comparación
          que hacer, solo un número que ya está arriba. */}
      {porServicio.length >= 2 && (
        <section className="space-y-2">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-3">Qué servicio deja más</h2>
          <div className="bg-surface border border-hairline rounded-surface divide-y divide-hairline">
            {porServicio.map(g => {
              const pct = Math.round((g.totalCents / porServicio[0].totalCents) * 100);
              return (
                <div key={g.grupo} className="p-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-sans text-body-s text-ink truncate">{g.grupo}</span>
                    <span className="font-mono text-caption text-ink font-bold tabular-nums shrink-0">
                      {formatEuros(g.totalCents)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-track rounded-full overflow-hidden">
                      <div className="h-full bg-accent/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-caption text-ink-4 shrink-0">
                      {g.n} {g.n === 1 ? 'cobro' : 'cobros'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
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
          // El porcentaje va de subtítulo y no de tarjeta propia: arriba ya
          // hay un «churn» (el de graduaciones, que mide otra cosa) y dos
          // cosas llamadas churn en la misma pantalla no se distinguen. Este
          // es el de verdad: bajas del mes sobre los que ya eran clientes.
          sub={churnMes != null ? `${churnMes.toString().replace('.', ',')} % de tus clientes` : undefined}
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

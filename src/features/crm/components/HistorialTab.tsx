import React, { useMemo } from 'react';
import { useServiciosDe } from '../hooks/useServicios';
import { usePagosDe } from '../hooks/usePagos';
import { useReunionesDe } from '../hooks/useReuniones';
import { formatEuros, sumaCobrado, sumaPendiente, cobradoDe } from '../lib/dinero';
import { formatDia, hoyISO } from '../lib/fechas';
import { mesesContratados } from '../lib/metricas';
import MetricCard from './MetricCard';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import { Skeleton } from '../../../components/ui';
import type { Cliente } from '../types';

// Todo lo de esta pestaña es DERIVADO — nunca se almacena en Firestore. Un solo
// useMemo sobre los datos que las otras pestañas ya cargan (mismas queries,
// mismo caché de TanStack Query — entrar aquí no dispara peticiones nuevas si
// ya se visitó Servicios/Pagos/Renovaciones antes). Así evitamos contadores
// duplicados en Firestore que puedan desincronizarse del origen real.
export default function HistorialTab({ cliente }: { cliente: Cliente }) {
  const { data: servicios = [], isPending: cargandoServicios, isError: errorServicios } = useServiciosDe(cliente.id);
  const { data: pagos = [], isPending: cargandoPagos, isError: errorPagos } = usePagosDe(cliente.id);
  const { data: reuniones = [], isPending: cargandoReuniones, isError: errorReuniones } = useReunionesDe(cliente.id);

  const cargando = cargandoServicios || cargandoPagos || cargandoReuniones;
  const error = errorServicios || errorPagos || errorReuniones;
  const hoy = hoyISO();

  const resumen = useMemo(() => {
  // Nada de filtrar por `estado === 'pagado'`/`'pendiente'`: un pago `parcial`
  // lleva dinero dentro que el primero se deja fuera, y un `impagado` no es
  // `pendiente`, así que se caía de las dos cifras (Dani, 10-09-2026).
    const pagosPagados = pagos.filter(p => cobradoDe(p) > 0);
    const reunionesRealizadas = reuniones.filter(r => r.realizada);

    const primerPrograma = servicios.length
      ? servicios.reduce((min, s) => (s.fechaInicio < min ? s.fechaInicio : min), servicios[0].fechaInicio)
      : null;
    const ultimoFin = servicios.reduce<string | null>((max, s) => {
      if (!s.fechaFin) return max;
      return !max || s.fechaFin > max ? s.fechaFin : max;
    }, null);

    const timeline = [...servicios].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));

    // Conversión a continuidad: solo cuenta entre las graduaciones que YA
    // tienen resultado registrado. Sin graduaciones resueltas, no se puede
    // calcular — mejor 'null' que un falso 0%.
    const graduacionesConResultado = reuniones.filter(r => r.tipo === 'graduacion' && r.resultadoGraduacion);
    const graduacionesQueContinuan = graduacionesConResultado.filter(r => r.resultadoGraduacion === 'continua');
    const conversionContinuidad = graduacionesConResultado.length > 0
      ? Math.round((graduacionesQueContinuan.length / graduacionesConResultado.length) * 100)
      : null;

    return {
      numProgramas: servicios.length,
      // Esto ES el LTV del cliente: todo lo que ha dejado, neto de
      // devoluciones. Se llamaba «total pagado», que es lo mismo dicho de una
      // forma que no invita a compararlo con nada.
      totalPagado: sumaCobrado(pagos),
      // Meses que ha estado contratado de verdad — la unión de los rangos de
      // sus servicios, no la distancia entre el alta y hoy: si pausó, esos
      // meses no cuentan (docs/crm-modelo-v2.md).
      meses: mesesContratados(servicios, hoy),
      pagosRealizados: pagosPagados.length,
      reunionesRealizadas: reunionesRealizadas.length,
      primerPrograma,
      ultimoFin,
      pendienteCobro: sumaPendiente(pagos),
      timeline,
      conversionContinuidad,
    };
  }, [servicios, pagos, reuniones, hoy]);

  if (error) return <ErrorState />;

  if (cargando) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <React.Fragment key={i}><Skeleton className="h-24 w-full" /></React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          icon="layers" label="Contratado"
          value={resumen.numProgramas}
          sub={resumen.meses > 0 ? `${resumen.meses.toString().replace('.', ',')} meses` : undefined}
        />
        <MetricCard
          icon="paid" label="Ha dejado"
          value={formatEuros(resumen.totalPagado)}
          sub={`${resumen.pagosRealizados} ${resumen.pagosRealizados === 1 ? 'cobro' : 'cobros'}`}
        />
        <MetricCard icon="event_available" label="Reuniones" value={resumen.reunionesRealizadas} sub="realizadas" />
        <MetricCard icon="schedule" label="Pendiente" value={formatEuros(resumen.pendienteCobro)} accent="var(--color-warning)" />
      </div>

      <div className={`grid gap-2 ${resumen.conversionContinuidad !== null ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface p-3">
          <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Primer programa</p>
          <p className="font-sans font-bold text-body-s text-ink mt-1">
            {resumen.primerPrograma ? formatDia(resumen.primerPrograma) : '—'}
          </p>
        </div>
        <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface p-3">
          <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Último fin</p>
          <p className="font-sans font-bold text-body-s text-ink mt-1">
            {resumen.ultimoFin ? formatDia(resumen.ultimoFin) : '—'}
          </p>
        </div>
        {resumen.conversionContinuidad !== null && (
          <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface p-3">
            <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Conversión continuidad</p>
            <p className="font-sans font-bold text-body-s text-ink mt-1">{resumen.conversionContinuidad}%</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-mono text-caption uppercase tracking-widest text-ink-2">Línea de tiempo</h2>
        {resumen.timeline.length === 0 ? (
          <EmptyState icon="history" titulo="Sin programas todavía" descripcion="La línea de tiempo aparecerá cuando el cliente tenga al menos un servicio." />
        ) : (
          <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface divide-y divide-white/7">
            {resumen.timeline.map(s => {
              const enCurso = !s.fechaFin || s.fechaFin >= hoy;
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-sans text-caption text-ink truncate">{s.nombre}</p>
                    <p className="font-mono text-caption text-ink-3 tabular-nums">
                      {formatDia(s.fechaInicio)}{s.fechaFin ? ` → ${formatDia(s.fechaFin)}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 rounded-full font-mono text-caption uppercase tracking-widest border ${
                    enCurso
                      ? 'bg-success/12 text-success border-success/25'
                      : 'bg-white/5 text-ink-2 border-hairline'
                  }`}>
                    {enCurso ? 'En curso' : 'Finalizado'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

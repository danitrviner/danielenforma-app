import React, { useMemo } from 'react';
import { useServiciosDe } from '../hooks/useServicios';
import { usePagosDe } from '../hooks/usePagos';
import { useReunionesDe } from '../hooks/useReuniones';
import { useSuscripcionesDe } from '../hooks/useSuscripciones';
import { formatEuros, sumaCobrado, sumaPendiente, cobradoDe } from '../lib/dinero';
import { formatDia, hoyISO } from '../lib/fechas';
import { mesesContratados } from '../lib/metricas';
import { eventosDelCliente, ventasDe, type TipoEvento } from '../lib/eventosDelCliente';
import MetricCard from './MetricCard';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import PagosTable from './PagosTable';
import { Skeleton } from '../../../components/ui';
import type { Cliente } from '../types';

// Todo lo de esta pestaña es DERIVADO — nunca se almacena en Firestore. Un solo
// useMemo sobre los datos que las otras pestañas ya cargan (mismas queries,
// mismo caché de TanStack Query — entrar aquí no dispara peticiones nuevas si
// ya se visitó Servicios/Pagos/Renovaciones antes). Así evitamos contadores
// duplicados en Firestore que puedan desincronizarse del origen real.
const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  alta: 'Alta', servicio: 'Servicio', renovacion: 'Renovación',
  suscripcion: 'Suscripción', cobro: 'Cobro', devolucion: 'Devolución', fin: 'Fin',
};

const ESTILO_EVENTO: Record<TipoEvento, string> = {
  alta:        'bg-accent/12 text-accent border-accent/25',
  renovacion:  'bg-success/12 text-success border-success/25',
  servicio:    'bg-white/5 text-ink-2 border-hairline',
  suscripcion: 'bg-white/5 text-ink-2 border-hairline',
  cobro:       'bg-success/12 text-success border-success/25',
  devolucion:  'bg-warning/12 text-warning border-warning/25',
  fin:         'bg-white/5 text-ink-3 border-hairline',
};

export default function HistorialTab({ cliente, coachEmail }: { cliente: Cliente; coachEmail: string }) {
  const { data: servicios = [], isPending: cargandoServicios, isError: errorServicios } = useServiciosDe(cliente.id);
  const { data: pagos = [], isPending: cargandoPagos, isError: errorPagos } = usePagosDe(cliente.id);
  const { data: reuniones = [], isPending: cargandoReuniones, isError: errorReuniones } = useReunionesDe(cliente.id);
  // Las suscripciones no salían por ningún lado del historial, aunque fueran
  // dinero real del cliente (auditoría §1.6).
  const { data: suscripciones = [] } = useSuscripcionesDe(cliente.id);

  const cargando = cargandoServicios || cargandoPagos || cargandoReuniones;
  const error = errorServicios || errorPagos || errorReuniones;
  const hoy = hoyISO();

  const resumen = useMemo(() => {
  // Nada de filtrar por `estado === 'pagado'`/`'pendiente'`: un pago `parcial`
  // lleva dinero dentro que el primero se deja fuera, y un `impagado` no es
  // `pendiente`, así que se caía de las dos cifras (Dani, 10-09-2026).
    const pagosPagados = pagos.filter(p => cobradoDe(p) > 0);

    const primerPrograma = servicios.length
      ? servicios.reduce((min, s) => (s.fechaInicio < min ? s.fechaInicio : min), servicios[0].fechaInicio)
      : null;
    const ultimoFin = servicios.reduce<string | null>((max, s) => {
      if (!s.fechaFin) return max;
      return !max || s.fechaFin > max ? s.fechaFin : max;
    }, null);

    // Registro de actividad de verdad —altas, renovaciones, cobros, fines—, no
    // solo la lista de servicios. Ver lib/eventosDelCliente.ts.
    const timeline = eventosDelCliente(servicios, pagos, suscripciones);

    /* Conversión a continuidad: solo cuenta entre las graduaciones que YA
     * tienen resultado registrado. Sin graduaciones resueltas, no se puede
     * calcular — mejor 'null' que un falso 0 %.
     *
     * Se queda aunque la pestaña de Reuniones haya salido de la ficha: es un
     * dato de negocio sobre ESTE cliente (¿continuó al graduarse?), no una
     * métrica de la agenda. El contador crudo de «reuniones realizadas» sí se
     * ha quitado: ya no hay forma de verlas desde aquí, así que era una cifra
     * sin ningún sitio al que llevar. */
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
      // VENTAS, no documentos de cobro: un plan de 3×329 € son tres pagos y una
      // sola venta, y el contador anterior decía «3 cobros».
      ventas: ventasDe(servicios, suscripciones),
      pagosRealizados: pagosPagados.length,
      primerPrograma,
      ultimoFin,
      pendienteCobro: sumaPendiente(pagos),
      timeline,
      conversionContinuidad,
    };
  }, [servicios, pagos, reuniones, suscripciones, hoy]);

  // Pendientes, impagados y parciales: los tres estados sobre los que hay algo
  // que hacer. Ordenados por vencimiento, que es como se cobran.
  const porCobrar = useMemo(
    () => pagos
      .filter(p => p.estado === 'pendiente' || p.estado === 'impagado' || p.estado === 'parcial')
      .sort((a, b) => a.fechaEmision.localeCompare(b.fechaEmision)),
    [pagos],
  );

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
          sub={`${resumen.ventas} ${resumen.ventas === 1 ? 'venta' : 'ventas'}`}
        />
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

      {/* Lo que falta por cobrar, con sus botones. La línea de tiempo de abajo
          solo lista lo que YA ha pasado (altas, cobros hechos, fines): una
          cuota pendiente no aparecía en la ficha por ningún sitio salvo como
          cifra en «Pendiente», y el único lugar con el botón de marcar cobrado
          era la pantalla global de Pagos. La pestaña que sí lo tenía se borró
          al unificar el historial (Dani, 16-09: «no lo puedo marcar de ninguna
          de las maneras»). Misma tabla que la global, sin la columna de
          cliente. */}
      {porCobrar.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-2">Pendiente de cobro</h2>
          <PagosTable pagos={porCobrar} mostrarCliente={false} coachEmail={coachEmail} />
        </div>
      )}

      <div className="space-y-2">
        <h2 className="font-mono text-caption uppercase tracking-widest text-ink-2">Línea de tiempo</h2>
        {resumen.timeline.length === 0 ? (
          <EmptyState icon="history" titulo="Sin actividad todavía" descripcion="Aquí irán las altas, las renovaciones y los cobros de este cliente." />
        ) : (
          <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface divide-y divide-white/7">
            {resumen.timeline.map(ev => (
              <div key={ev.id} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-sans text-caption text-ink truncate">
                    {ev.titulo}
                    {ev.esCuota && <span className="text-ink-3"> · cuota</span>}
                  </p>
                  <p className="font-mono text-caption text-ink-3 tabular-nums">
                    {formatDia(ev.fecha)}{ev.detalle ? ` · ${ev.detalle}` : ''}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {ev.importeCents != null && (
                    <span className="font-mono text-caption text-ink-2 tabular-nums">{formatEuros(ev.importeCents)}</span>
                  )}
                  <span className={`px-2 rounded-full font-mono text-caption uppercase tracking-widest border ${ESTILO_EVENTO[ev.tipo]}`}>
                    {ETIQUETA_EVENTO[ev.tipo]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useMemo } from 'react';
import { useServiciosDe } from '../hooks/useServicios';
import { usePagosDe } from '../hooks/usePagos';
import { useReunionesDe } from '../hooks/useReuniones';
import { formatEuros, sumaCents } from '../lib/dinero';
import { formatDia, hoyISO } from '../lib/fechas';
import MetricCard from './MetricCard';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
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
    const pagosPagados = pagos.filter(p => p.estado === 'pagado');
    const pagosPendientes = pagos.filter(p => p.estado === 'pendiente');
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
      totalPagado: sumaCents(pagosPagados),
      pagosRealizados: pagosPagados.length,
      reunionesRealizadas: reunionesRealizadas.length,
      primerPrograma,
      ultimoFin,
      pendienteCobro: sumaCents(pagosPendientes),
      timeline,
      conversionContinuidad,
    };
  }, [servicios, pagos, reuniones]);

  if (error) return <ErrorState />;

  if (cargando) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-white/4 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard icon="layers" label="Programas" value={resumen.numProgramas} />
        <MetricCard icon="paid" label="Total pagado" value={formatEuros(resumen.totalPagado)} sub={`${resumen.pagosRealizados} pagos`} />
        <MetricCard icon="event_available" label="Reuniones" value={resumen.reunionesRealizadas} sub="realizadas" />
        <MetricCard icon="schedule" label="Pendiente" value={formatEuros(resumen.pendienteCobro)} accent="#fdba74" />
      </div>

      <div className={`grid gap-2 ${resumen.conversionContinuidad !== null ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <div className="bg-surface/80 backdrop-blur-sm border border-white/7 rounded-2xl p-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#555550]">Primer programa</p>
          <p className="font-sans font-bold text-sm text-ink mt-1">
            {resumen.primerPrograma ? formatDia(resumen.primerPrograma) : '—'}
          </p>
        </div>
        <div className="bg-surface/80 backdrop-blur-sm border border-white/7 rounded-2xl p-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#555550]">Último fin</p>
          <p className="font-sans font-bold text-sm text-ink mt-1">
            {resumen.ultimoFin ? formatDia(resumen.ultimoFin) : '—'}
          </p>
        </div>
        {resumen.conversionContinuidad !== null && (
          <div className="bg-surface/80 backdrop-blur-sm border border-white/7 rounded-2xl p-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#555550]">Conversión continuidad</p>
            <p className="font-sans font-bold text-sm text-ink mt-1">{resumen.conversionContinuidad}%</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-mono text-[9px] uppercase tracking-widest text-[#a8a89e]">Línea de tiempo</h2>
        {resumen.timeline.length === 0 ? (
          <EmptyState icon="history" titulo="Sin programas todavía" descripcion="La línea de tiempo aparecerá cuando el cliente tenga al menos un servicio." />
        ) : (
          <div className="bg-surface/80 backdrop-blur-sm border border-white/7 rounded-2xl divide-y divide-white/7">
            {resumen.timeline.map(s => {
              const enCurso = !s.fechaFin || s.fechaFin >= hoy;
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-sans text-[11px] text-ink truncate">{s.nombre}</p>
                    <p className="font-mono text-[9px] text-[#555550] tabular-nums">
                      {formatDia(s.fechaInicio)}{s.fechaFin ? ` → ${formatDia(s.fechaFin)}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-widest border ${
                    enCurso
                      ? 'bg-success/12 text-success border-success/25'
                      : 'bg-white/5 text-[#a8a89e] border-white/10'
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

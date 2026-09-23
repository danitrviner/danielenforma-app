import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePagos } from '../hooks/usePagos';
import { useSuscripciones } from '../hooks/useSuscripciones';
import { formatEuros } from '../lib/dinero';
import { resumenPeriodo } from '../lib/metricas';
import { hoyISO } from '../lib/fechas';
import MetricCard from '../components/MetricCard';
import SuscripcionesBlock from '../components/SuscripcionesBlock';
import PagosTable from '../components/PagosTable';
import SuscripcionModal from '../components/SuscripcionModal';
import PagoModal from '../components/PagoModal';
import type { EstadoPago } from '../types';
import { Button, Icon } from '../../../components/ui';
import { coincideBusqueda } from '../../../utils/busqueda';

/* Rangos rápidos del filtro de cash por periodo.

   Un rango va SIEMPRE de punta a punta del periodo, nunca «hasta hoy», y eso
   no es un detalle: las cuotas futuras de un fraccionamiento ya existen como
   pagos pendientes con su `fechaEmision` en su mes (`createCrmServicioConPago`
   las crea todas de golpe). Cortando en hoy, un 300 € a tres meses contratado
   en septiembre no sumaba en «este año» las cuotas de octubre y noviembre —
   quedaban fuera del rango por ser futuras, y el cash contratado del año salía
   corto (Dani, 22-09-2026). */
const FIN_DE_LOS_TIEMPOS = '2999-12-31';

function ultimoDiaDelMes(anio: number, mes: number): string {
  // `new Date(a, m, 0)` con `m` 1-indexado da el último día de ESE mes.
  const dia = new Date(anio, mes, 0).getDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function rangoDe(preset: string, hoy: string): { desde: string; hasta: string } {
  const [anio, mes] = hoy.split('-').map(Number);
  switch (preset) {
    case 'mes':
      return { desde: `${anio}-${String(mes).padStart(2, '0')}-01`, hasta: ultimoDiaDelMes(anio, mes) };
    case 'mes_anterior': {
      const m = mes === 1 ? 12 : mes - 1;
      const a = mes === 1 ? anio - 1 : anio;
      return { desde: `${a}-${String(m).padStart(2, '0')}-01`, hasta: ultimoDiaDelMes(a, m) };
    }
    case 'anio':
      return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
    default:
      return { desde: '2000-01-01', hasta: FIN_DE_LOS_TIEMPOS };
  }
}

// Pantalla global /crm/pagos: vista de negocio a través de TODOS los clientes,
// a diferencia de PagosTab/RenovacionesTab que están scopeados a uno. El
// buscador y el filtro viven en la URL (?estado=&q=), mismo patrón que
// ClientesList.tsx — un refresco o el botón atrás recuperan la vista exacta.
const FILTROS: { id: EstadoPago | 'todos'; label: string }[] = [
  { id: 'todos',     label: 'Todos' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'impagado',  label: 'Impagados' },
  { id: 'parcial',   label: 'A medias' },
  { id: 'pagado',    label: 'Pagados' },
];

export default function PagosScreen({ coachEmail }: { coachEmail: string }) {
  const [params, setParams] = useSearchParams();
  const [modalSuscripcion, setModalSuscripcion] = useState(false);
  const [modalPago, setModalPago] = useState(false);

  const filtro = (params.get('estado') as EstadoPago | 'todos') || 'todos';
  const busqueda = params.get('q') ?? '';
  // Por defecto «este mes»: es lo que se mira día a día. El histórico y lo
  // pendiente ya viven en «Todo» y en el filtro de estado de la tabla de abajo
  // (Dani, 22-09-2026: quitar las tarjetas fijas de histórico/pendiente/
  // suscripciones de aquí arriba, redundantes con este filtro).
  const periodo = params.get('periodo') || 'mes';
  const hoy = hoyISO();
  // 'custom' arranca sobre el mes en curso, no sobre el rango abierto: los dos
  // inputs de fecha tienen que nacer con algo que se pueda leer, no con
  // 01/01/2000 – 31/12/2999.
  const rangoPreset = rangoDe(periodo === 'custom' ? 'mes' : periodo, hoy);
  // En 'custom' el rango lo da el propio coach; en cualquier otro preset se
  // deriva de la fecha de hoy y los inputs de fecha solo lo reflejan.
  const desde = periodo === 'custom' ? (params.get('desde') || rangoPreset.desde) : rangoPreset.desde;
  const hasta = periodo === 'custom' ? (params.get('hasta') || rangoPreset.hasta) : rangoPreset.hasta;

  const setParam = (clave: string, valor: string) => {
    const next = new URLSearchParams(params);
    if (valor) next.set(clave, valor); else next.delete(clave);
    setParams(next, { replace: true });
  };

  const { data: pagos = [], isPending: cargandoPagos, isError: errorPagos } = usePagos();
  const { data: suscripciones = [], isPending: cargandoSuscripciones, isError: errorSuscripciones } = useSuscripciones();

  const cashPeriodo = useMemo(() => resumenPeriodo(pagos, desde, hasta), [pagos, desde, hasta]);

  const pagosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pagos.filter(p => {
      if (filtro !== 'todos' && p.estado !== filtro) return false;
      if (!q) return true;
      return coincideBusqueda(p.clientNombre, q) || coincideBusqueda(p.concepto, q);
    });
  }, [pagos, filtro, busqueda]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-sans font-bold text-title-m text-ink">Pagos</h1>
      </header>

      {/* Cash por periodo, en dos cifras que NO se solapan: recaudado (lo que
          entró, por fecha de cobro) y contratado (lo que queda por cobrar de lo
          vendido, por la fecha en que vence cada cuota). Sumadas dan el valor
          del periodo sin contar dos veces el mismo euro: un 300 € a tres meses
          aporta 100 € a recaudado del mes cobrado y 100 € a contratado de cada
          uno de los dos meses que quedan. */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-2">Cash por periodo</h2>
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'mes', label: 'Este mes' },
              { id: 'mes_anterior', label: 'Mes anterior' },
              { id: 'anio', label: 'Este año' },
              { id: 'todo', label: 'Todo' },
              { id: 'custom', label: 'Rango' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setParam('periodo', id === 'mes' ? '' : id)}
                aria-pressed={periodo === id}
                className={`shrink-0 px-3 py-2 rounded-control font-mono text-caption uppercase tracking-widest transition-colors ${
                  periodo === id
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-field text-ink-2 border border-hairline hover:border-strong'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {periodo === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 font-mono text-caption text-ink-2">
              Desde
              <input
                type="date"
                value={desde}
                onChange={e => setParam('desde', e.target.value)}
                className="px-2 py-1.5 rounded-control bg-field border border-hairline text-body-s text-ink focus:outline-none focus:border-accent/40"
              />
            </label>
            <label className="flex items-center gap-2 font-mono text-caption text-ink-2">
              Hasta
              <input
                type="date"
                value={hasta}
                onChange={e => setParam('hasta', e.target.value)}
                className="px-2 py-1.5 rounded-control bg-field border border-hairline text-body-s text-ink focus:outline-none focus:border-accent/40"
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard icon="paid" label="Cash recaudado" value={formatEuros(cashPeriodo.recaudadoCents)} sub="cobrado en el periodo" />
          <MetricCard icon="sell" label="Cash contratado" value={formatEuros(cashPeriodo.contratadoCents)} sub="vendido, aún sin cobrar" />
          <MetricCard icon="autorenew" label="Recaudado renovaciones" value={formatEuros(cashPeriodo.recaudadoRenovacionesCents)} sub="cobrado en el periodo" />
          <MetricCard icon="autorenew" label="Contratado renovaciones" value={formatEuros(cashPeriodo.contratadoRenovacionesCents)} sub="vendido, aún sin cobrar" />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-2">Suscripciones</h2>
          <button
            type="button"
            onClick={() => setModalSuscripcion(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-control bg-white/6 text-ink font-sans font-bold text-caption hover:bg-white/10 transition-colors"
          >
            <Icon name="add" size="s" />
            Nueva suscripción
          </button>
        </div>
        <SuscripcionesBlock
          suscripciones={suscripciones}
          cargando={cargandoSuscripciones}
          error={errorSuscripciones}
          mostrarCliente
          coachEmail={coachEmail}
          onNuevaSuscripcion={() => setModalSuscripcion(true)}
        />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-2">Pagos</h2>
          <Button variant="primary" size="s" icon="add" onClick={() => setModalPago(true)}>
            Registrar pago
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Icon name="search" size="s" className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
            <input
              type="search"
              value={busqueda}
              onChange={e => setParam('q', e.target.value)}
              placeholder="Buscar por cliente o concepto"
              aria-label="Buscar pagos"
              className="w-full pl-8 pr-2 py-2 rounded-control bg-field border border-hairline text-title-s text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/40"
            />
          </div>
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto hide-scrollbar" role="group" aria-label="Filtrar por estado">
            {/* Los cinco estados. Antes solo se podía filtrar por pendiente y
                pagado, así que un pago marcado como impagado o cobrado a medias
                no había forma de sacarlo por pantalla (Dani, 10-09-2026). */}
            {FILTROS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setParam('estado', id === 'todos' ? '' : id)}
                aria-pressed={filtro === id}
                className={`shrink-0 px-3 py-2 rounded-control font-mono text-caption uppercase tracking-widest transition-colors ${
                  filtro === id
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-field text-ink-2 border border-hairline hover:border-strong'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <PagosTable
          pagos={pagosFiltrados}
          cargando={cargandoPagos}
          error={errorPagos}
          mostrarCliente
          coachEmail={coachEmail}
          onNuevoPago={() => setModalPago(true)}
        />
      </section>

      {modalSuscripcion && (
        <SuscripcionModal coachEmail={coachEmail} onCerrar={() => setModalSuscripcion(false)} />
      )}
      {modalPago && (
        <PagoModal coachEmail={coachEmail} onCerrar={() => setModalPago(false)} />
      )}
    </div>
  );
}

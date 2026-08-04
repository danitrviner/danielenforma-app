import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePagos } from '../hooks/usePagos';
import { useSuscripciones } from '../hooks/useSuscripciones';
import { formatEuros, sumaCents } from '../lib/dinero';
import MetricCard from '../components/MetricCard';
import SuscripcionesBlock from '../components/SuscripcionesBlock';
import PagosTable from '../components/PagosTable';
import SuscripcionModal from '../components/SuscripcionModal';
import PagoModal from '../components/PagoModal';
import type { EstadoPago } from '../types';

// Pantalla global /crm/pagos: vista de negocio a través de TODOS los clientes,
// a diferencia de PagosTab/RenovacionesTab que están scopeados a uno. El
// buscador y el filtro viven en la URL (?estado=&q=), mismo patrón que
// ClientesList.tsx — un refresco o el botón atrás recuperan la vista exacta.
export default function PagosScreen({ coachEmail }: { coachEmail: string }) {
  const [params, setParams] = useSearchParams();
  const [modalSuscripcion, setModalSuscripcion] = useState(false);
  const [modalPago, setModalPago] = useState(false);

  const filtro = (params.get('estado') as EstadoPago | 'todos') || 'todos';
  const busqueda = params.get('q') ?? '';

  const setParam = (clave: string, valor: string) => {
    const next = new URLSearchParams(params);
    if (valor) next.set(clave, valor); else next.delete(clave);
    setParams(next, { replace: true });
  };

  const { data: pagos = [], isPending: cargandoPagos, isError: errorPagos } = usePagos();
  const { data: suscripciones = [], isPending: cargandoSuscripciones, isError: errorSuscripciones } = useSuscripciones();

  const facturado = sumaCents(pagos.filter(p => p.estado === 'pagado'));
  const pendienteDeCobro = sumaCents(pagos.filter(p => p.estado === 'pendiente'));
  const suscripcionesActivas = suscripciones.filter(s => s.estado === 'activa').length;

  const pagosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pagos.filter(p => {
      if (filtro !== 'todos' && p.estado !== filtro) return false;
      if (!q) return true;
      return p.clientNombre.toLowerCase().includes(q) || p.concepto.toLowerCase().includes(q);
    });
  }, [pagos, filtro, busqueda]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-sans font-bold text-title-m text-ink">Pagos</h1>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <MetricCard icon="paid" label="Facturado" value={formatEuros(facturado)} sub="pagos cobrados" />
        <MetricCard icon="schedule" label="Pendiente de cobro" value={formatEuros(pendienteDeCobro)} sub="pagos pendientes" accent="var(--color-warning)" />
        <MetricCard icon="autorenew" label="Suscripciones activas" value={suscripcionesActivas} sub={`${suscripciones.length} en total`} />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-caption uppercase tracking-widest text-ink-2">Suscripciones</h2>
          <button
            type="button"
            onClick={() => setModalSuscripcion(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-control bg-white/6 text-ink font-sans font-bold text-caption hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-body-s">add</span>
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
          <button
            type="button"
            onClick={() => setModalPago(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-control bg-accent text-black font-sans font-bold text-caption hover:bg-accent-press transition-colors"
          >
            <span className="material-symbols-outlined text-body-s">add</span>
            Registrar pago
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-body-s text-ink-3 pointer-events-none">
              search
            </span>
            <input
              type="search"
              value={busqueda}
              onChange={e => setParam('q', e.target.value)}
              placeholder="Buscar por cliente o concepto"
              aria-label="Buscar pagos"
              className="w-full pl-8 pr-2 py-2 rounded-control bg-field border border-hairline text-title-s text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/40"
            />
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Filtrar por estado">
            {(['todos', 'pendiente', 'pagado'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setParam('estado', f === 'todos' ? '' : f)}
                aria-pressed={filtro === f}
                className={`px-3 py-2 rounded-control font-mono text-caption uppercase tracking-widest transition-colors ${
                  filtro === f
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-field text-ink-2 border border-hairline hover:border-strong'
                }`}
              >
                {f === 'todos' ? 'Todos' : f === 'pendiente' ? 'Pendientes' : 'Pagados'}
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

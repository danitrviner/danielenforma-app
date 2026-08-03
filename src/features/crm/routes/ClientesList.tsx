import React, { Suspense, lazy, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCrmServicios } from '../../../dbService';
import { useClientes } from '../hooks/useClientes';
import { servicioActual } from '../hooks/useServicios';
import { crmKeys } from '../lib/crmQueries';
import { normalizarDni, formatDni } from '../lib/identidad';
import { formatEurosCompacto } from '../lib/dinero';
import DataTable, { Columna } from '../components/DataTable';
import { EstadoClientePill } from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import NuevoClienteModal from '../components/NuevoClienteModal';
import type { Cliente, EstadoCrm, CrmServicio } from '../types';

// Lazy: read-excel-file + papaparse (las dependencias de este modal) pesan más
// que el resto de la pantalla junta, y la mayoría de visitas a /crm/clientes
// nunca pulsan «Importar». Igual que App.tsx separa las pantallas de coach de
// las de atleta, esto separa el peso de la importación del resto del CRM.
const ImportarClientes = lazy(() => import('../components/ImportarClientes'));

// El filtro y la búsqueda viven en la URL (?estado=&q=), no en useState: así un
// refresco o el botón atrás recuperan la vista exacta, y una lista filtrada se
// puede compartir por enlace. Es el patrón que ya siguen las rutas de
// /clients/:athleteId/:hubTab en App.tsx.

const FILTROS: { id: EstadoCrm | 'todos'; label: string }[] = [
  { id: 'todos',            label: 'Todos' },
  { id: 'lead',             label: 'Leads' },
  { id: 'llamada_agendada', label: 'Llamadas' },
  { id: 'activo',           label: 'Activos' },
  { id: 'pausado',          label: 'Pausados' },
  { id: 'baja',             label: 'Bajas' },
];

export default function ClientesList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [importarAbierto, setImportarAbierto] = useState(false);

  const filtro = (params.get('estado') as EstadoCrm | 'todos') || 'todos';
  const busqueda = params.get('q') ?? '';

  const setParam = (clave: string, valor: string) => {
    const next = new URLSearchParams(params);
    if (valor) next.set(clave, valor); else next.delete(clave);
    setParams(next, { replace: true });
  };

  const { clientes, isPending, error, contadores } = useClientes();

  const { data: servicios = [] } = useQuery({
    queryKey: crmKeys.servicios,
    queryFn: getCrmServicios,
  });

  // Un solo agrupado por cliente en vez de filtrar la lista entera por cada
  // fila (que sería O(clientes × servicios) en cada render).
  const serviciosPorCliente = useMemo(() => {
    const m = new Map<string, CrmServicio[]>();
    for (const s of servicios) {
      const lista = m.get(s.clientId);
      if (lista) lista.push(s); else m.set(s.clientId, [s]);
    }
    return m;
  }, [servicios]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const qDni = normalizarDni(busqueda);
    return clientes.filter(c => {
      if (filtro !== 'todos' && c.estadoCrm !== filtro) return false;
      if (!q) return true;
      return (
        c.nombre.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (qDni.length >= 3 && (c.dni ?? '').includes(qDni))
      );
    });
  }, [clientes, filtro, busqueda]);

  const columnas: Columna<Cliente>[] = [
    {
      id: 'cliente',
      header: 'Cliente',
      render: c => (
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <p className="font-bold truncate">{c.nombre}</p>
            <p className="font-mono text-[9px] text-ink-3 truncate">
              {c.dni ? formatDni(c.dni) : c.email ?? '—'}
            </p>
          </div>
          {!c.userId && (
            <span
              className="material-symbols-outlined text-[13px] text-ink-3 shrink-0"
              title="Contacto sin cuenta en la app"
            >
              person_off
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'servicio',
      header: 'Servicio actual',
      render: c => {
        const actual = servicioActual(serviciosPorCliente.get(c.id) ?? []);
        if (!actual) return <span className="text-ink-3">—</span>;
        return (
          <div className="min-w-0">
            <p className="truncate">{actual.nombre}</p>
            <p className="font-mono text-[9px] text-ink-3 tabular-nums">
              {formatEurosCompacto(actual.importeCents)} · {actual.periodicidad}
            </p>
          </div>
        );
      },
    },
    {
      id: 'estado',
      header: 'Estado',
      width: '110px',
      render: c => <EstadoClientePill estado={c.estadoCrm} />,
    },
    {
      id: 'acciones',
      header: '',
      width: '44px',
      align: 'right',
      render: () => (
        <span className="material-symbols-outlined text-base text-ink-3">chevron_right</span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-sans font-black text-xl text-ink">Clientes</h1>
          <p className="font-mono text-[9px] uppercase tracking-widest text-ink-3 tabular-nums">
            {contadores.lead} leads · {contadores.llamada_agendada} llamadas · {contadores.activo} activos · {contadores.pausado} pausados · {contadores.baja} bajas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportarAbierto(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-control bg-white/6 text-ink font-sans font-bold text-[11px] hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">upload_file</span>
            Importar
          </button>
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-control bg-accent text-black font-sans font-bold text-[11px] hover:bg-accent-press transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Nuevo cliente
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-sm text-ink-3 pointer-events-none">
            search
          </span>
          <input
            type="search"
            value={busqueda}
            onChange={e => setParam('q', e.target.value)}
            placeholder="Buscar por nombre, email o DNI"
            aria-label="Buscar clientes"
            className="w-full pl-7 pr-2 py-1.5 rounded-control bg-field border border-hairline text-[11px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/40"
          />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Filtrar por estado">
          {FILTROS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setParam('estado', f.id === 'todos' ? '' : f.id)}
              aria-pressed={filtro === f.id}
              className={`px-2.5 py-1.5 rounded-control font-mono text-[9px] uppercase tracking-widest transition-colors ${
                filtro === f.id
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-field text-ink-2 border border-hairline hover:border-white/12'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface overflow-hidden">
        <DataTable
          columnas={columnas}
          filas={filas}
          keyOf={c => c.id}
          cargando={isPending}
          error={Boolean(error)}
          onRowClick={c => navigate(`/crm/clientes/${c.id}`)}
          vacio={
            clientes.length === 0 ? (
              <EmptyState
                icon="group"
                titulo="Aún no hay clientes"
                descripcion="Crea el primero a mano, o importa tu cartera desde una hoja de cálculo."
                cta={{ label: 'Nuevo cliente', onClick: () => setModalAbierto(true) }}
              />
            ) : (
              <EmptyState
                icon="search_off"
                titulo="Ningún cliente coincide"
                descripcion="Prueba con otro término o quita el filtro de estado."
              />
            )
          }
        />
      </div>

      {modalAbierto && <NuevoClienteModal onCerrar={() => setModalAbierto(false)} />}
      {importarAbierto && (
        <Suspense fallback={null}>
          <ImportarClientes onCerrar={() => setImportarAbierto(false)} />
        </Suspense>
      )}
    </div>
  );
}

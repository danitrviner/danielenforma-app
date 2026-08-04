import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCliente } from '../hooks/useClientes';
import { EstadoClientePill } from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import DatosPersonalesTab from '../components/DatosPersonalesTab';
import ServiciosTab from '../components/ServiciosTab';
import PagosTab from '../components/PagosTab';
import RenovacionesTab from '../components/RenovacionesTab';
import ReunionesTab from '../components/ReunionesTab';
import HistorialTab from '../components/HistorialTab';
import { enlaceWhatsApp, formatTelefono } from '../lib/identidad';
import { Icon } from '../../../components/ui';

// La pestaña activa va en `?tab=`, como pediste — no en useState. Refrescar o
// volver atrás recupera la pestaña exacta.
//
// Pagos y Renovaciones son DOS pestañas separadas, no una (decisión tomada
// tras ver la referencia visual de otro CRM): Renovaciones = suscripciones,
// con su propio "Registrar cobro"; Pagos es el histórico de cobros sueltos.
// Historial es puramente derivado — nunca escribe nada, solo lee lo que las
// demás pestañas ya cargaron.

type Tab = 'datos' | 'servicios' | 'pagos' | 'renovaciones' | 'reuniones' | 'historial';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'datos',        label: 'Datos',        icon: 'badge' },
  { id: 'servicios',    label: 'Servicios',    icon: 'sell' },
  { id: 'pagos',        label: 'Pagos',        icon: 'euro' },
  { id: 'renovaciones', label: 'Renovaciones', icon: 'autorenew' },
  { id: 'reuniones',    label: 'Reuniones',    icon: 'event' },
  { id: 'historial',    label: 'Historial',    icon: 'history' },
];

export default function ClienteDetail({ coachEmail }: { coachEmail: string }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const { cliente, isPending } = useCliente(id);
  const tab = (params.get('tab') as Tab) || 'datos';

  const irATab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  if (isPending) {
    return <div className="h-40 rounded-surface bg-white/4 animate-pulse" />;
  }

  if (!cliente) {
    return (
      <EmptyState
        icon="person_search"
        titulo="Cliente no encontrado"
        descripcion="Puede que se haya eliminado, o que el enlace sea de otra cuenta."
        cta={{ label: 'Volver a clientes', onClick: () => navigate('/crm/clientes') }}
      />
    );
  }

  const whatsapp = enlaceWhatsApp(cliente.telefono);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => navigate('/crm/clientes')}
        className="flex items-center gap-1 font-mono text-caption uppercase tracking-widest text-ink-2 hover:text-ink transition-colors"
      >
        <Icon name="arrow_back" size="s" />
        Clientes
      </button>

      <header className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-sans font-bold text-title-m text-ink truncate">{cliente.nombre}</h1>
            <EstadoClientePill estado={cliente.estadoCrm} />
          </div>
          <p className="font-mono text-caption text-ink-3 ">
            {cliente.email ?? 'Sin email'}
            {cliente.telefono?.numero && ` · ${formatTelefono(cliente.telefono)}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-2 rounded-control bg-white/6 text-ink font-sans font-bold text-caption hover:bg-white/10 transition-colors"
            >
              <Icon name="chat" size="s" />
              WhatsApp
            </a>
          )}
          {/* Puente con la app de entrenamiento: solo tiene sentido si la
              persona tiene cuenta. Un contacto importado no tiene ClientHub. */}
          {cliente.userId && (
            <button
              type="button"
              onClick={() => navigate(`/clients/${cliente.userId}`)}
              className="flex items-center gap-1 px-3 py-2 rounded-control bg-white/6 text-ink font-sans font-bold text-caption hover:bg-white/10 transition-colors"
            >
              <Icon name="fitness_center" size="s" />
              Ficha de entreno
            </button>
          )}
        </div>
      </header>

      <nav className="flex items-center gap-1" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => irATab(t.id)}
            className={`flex items-center gap-1 px-3 py-2 rounded-control font-mono text-caption uppercase tracking-widest transition-colors ${
              tab === t.id
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-field text-ink-2 border border-hairline hover:border-strong'
            }`}
          >
            <span className="material-symbols-outlined text-body-s">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'datos' && <DatosPersonalesTab cliente={cliente} />}
      {tab === 'servicios' && <ServiciosTab cliente={cliente} coachEmail={coachEmail} />}
      {tab === 'pagos' && <PagosTab cliente={cliente} coachEmail={coachEmail} />}
      {tab === 'renovaciones' && <RenovacionesTab cliente={cliente} coachEmail={coachEmail} />}
      {tab === 'reuniones' && <ReunionesTab cliente={cliente} coachEmail={coachEmail} />}
      {tab === 'historial' && <HistorialTab cliente={cliente} />}
    </div>
  );
}

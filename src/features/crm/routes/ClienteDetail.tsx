import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCliente } from '../hooks/useClientes';
import { useArchivarCliente, useEliminarCliente } from '../hooks/useClienteMutations';
import { motivoNoBorrable } from '../lib/archivado';
import { useToast } from '../../../hooks/useToast';
import { ClienteConCobros } from '../../../db/crm';
import { useSuscripcionesDe, useRegistrarCobro } from '../hooks/useSuscripciones';
import { estadoSuscripcionCliente } from '../lib/suscripcionEstado';
import { EstadoClientePill } from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import DatosPersonalesTab from '../components/DatosPersonalesTab';
import ServiciosTab from '../components/ServiciosTab';
import PagosTab from '../components/PagosTab';
import RenovacionesTab from '../components/RenovacionesTab';
import ReunionesTab from '../components/ReunionesTab';
import HistorialTab from '../components/HistorialTab';
import InvitarAtletaModal from '../components/InvitarAtletaModal';
import { enlaceWhatsApp, formatTelefono } from '../lib/identidad';
import { Button, Icon, Skeleton } from '../../../components/ui';

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
  const [invitando, setInvitando] = useState(false);

  const { showToast } = useToast();
  const { cliente, isPending } = useCliente(id);
  const archivar = useArchivarCliente();
  const eliminar = useEliminarCliente();
  const { data: suscripciones = [] } = useSuscripcionesDe(id);
  const registrar = useRegistrarCobro();
  const tab = (params.get('tab') as Tab) || 'datos';

  const irATab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  if (isPending) {
    return <Skeleton className="h-40 w-full" />;
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
  // Acceso rápido de "Renovar plan" en la cabecera: solo cuando la
  // suscripción vence pronto (mismo umbral que la lista partida del CRM,
  // ver suscripcionEstado.ts) — un plan sin plan o al día ya tiene su alta
  // o su seguimiento normal en la pestaña Renovaciones, no hace falta un
  // botón destacado. No se duplica adherencia/KPIs de entreno aquí — eso es
  // de ClientHub, no de esta ficha de facturación (decisión con Dani, F3.13d).
  const estadoSuscripcion = estadoSuscripcionCliente(suscripciones);
  const bloqueoBorrado = motivoNoBorrable(cliente);

  const onArchivar = async () => {
    try {
      await archivar.mutateAsync({ cliente, archivar: !cliente.archivado });
      showToast(cliente.archivado ? 'Vuelve a tus listas' : 'Archivado — ya no sale en tus listas', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se ha podido archivar', 'error');
    }
  };

  const onEliminar = async () => {
    if (bloqueoBorrado) { showToast(bloqueoBorrado, 'info'); return; }
    if (!window.confirm(
      `¿Borrar «${cliente.nombre}» para siempre?\n\n` +
      'Se borra también todo su rastro en el CRM: servicios, cobros pendientes, ' +
      'suscripciones y reuniones. Esto no se puede deshacer.\n\n' +
      'Si solo quieres quitarlo de en medio, archívalo.'
    )) return;
    try {
      await eliminar.mutateAsync(cliente);
      showToast('Cliente borrado', 'success');
      navigate('/crm/clientes');
    } catch (err) {
      if (err instanceof ClienteConCobros) { showToast(err.message, 'error'); return; }
      showToast(err instanceof Error ? err.message : 'No se ha podido borrar', 'error');
    }
  };

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
          {estadoSuscripcion.tipo === 'vence_pronto' && (
            <Button
              variant="primary"
              size="s"
              icon="autorenew"
              disabled={registrar.isPending}
              onClick={() => registrar.mutate({ suscripcion: estadoSuscripcion.suscripcion, coachEmail })}
            >
              {registrar.isPending ? 'Renovando…' : 'Renovar plan'}
            </Button>
          )}
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
          <button
            type="button"
            onClick={onArchivar}
            disabled={archivar.isPending}
            className="flex items-center gap-1 px-3 py-2 rounded-control bg-white/6 text-ink font-sans font-bold text-caption hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            <Icon name={cliente.archivado ? 'unarchive' : 'archive'} size="s" />
            {cliente.archivado ? 'Desarchivar' : 'Archivar'}
          </button>
          {/* Borrar solo donde no deja huérfano a nadie: contactos sin cuenta y
              perfiles ya anonimizados. Ver `motivoNoBorrable`. */}
          {!bloqueoBorrado && (
            <button
              type="button"
              onClick={onEliminar}
              disabled={eliminar.isPending}
              className="flex items-center gap-1 px-3 py-2 rounded-control bg-danger/12 text-danger font-sans font-bold text-caption hover:bg-danger/20 disabled:opacity-40 transition-colors"
            >
              <Icon name="delete" size="s" />
              {eliminar.isPending ? 'Borrando…' : 'Borrar'}
            </button>
          )}
          {/* Puente con la app de entrenamiento: solo tiene sentido si la
              persona tiene cuenta. Un contacto importado no tiene ClientHub. */}
          {cliente.userId ? (
            <button
              type="button"
              onClick={() => navigate(`/clients/${cliente.userId}`)}
              className="flex items-center gap-1 px-3 py-2 rounded-control bg-white/6 text-ink font-sans font-bold text-caption hover:bg-white/10 transition-colors"
            >
              <Icon name="fitness_center" size="s" />
              Ficha de entreno
            </button>
          ) : cliente.email && (
            // 14-08 (tarea 11). Antes no había forma, desde esta ficha, de
            // convertir un contacto en atleta programable: solo se podía
            // desde el alta genérica, tecleando el email otra vez a mano.
            <button
              type="button"
              onClick={() => setInvitando(true)}
              className="flex items-center gap-1 px-3 py-2 rounded-control bg-accent/12 text-accent font-sans font-bold text-caption hover:bg-accent/20 transition-colors"
            >
              <Icon name="person_add" size="s" />
              Dar de alta en la app
            </button>
          )}
        </div>
      </header>

      {cliente.archivado && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-surface bg-warning/10 border border-warning/25">
          <Icon name="inventory_2" size="s" className="text-warning shrink-0" />
          <p className="font-sans text-caption text-warning">
            {cliente.anonimizado
              ? 'Cuenta borrada por la propia persona. Se conserva anonimizada para no reescribir el histórico del negocio.'
              : 'Archivado: no sale en tus listas ni en los contadores del CRM hasta que lo desarchives.'}
          </p>
        </div>
      )}

      {/* Las seis pestañas no caben en 402 pt. Sin `overflow-x-auto` la fila
          desbordaba su contenedor y el scroll horizontal se lo comía el
          documento entero: al arrastrar hacia la izquierda se movía TODA la
          pantalla —cabecera, pestañas de CRM y campos— y quedaba media
          pantalla en negro. `min-w-0` es lo que impide que la fila estire a su
          padre flex; sin él, `overflow-x-auto` no llega a activarse nunca.
          `hide-scrollbar` quita la barra gris, que aquí sobra. */}
      <nav className="flex items-center gap-1 min-w-0 overflow-x-auto hide-scrollbar" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => irATab(t.id)}
            className={`flex shrink-0 items-center gap-1 px-3 py-2 rounded-control font-mono text-caption uppercase tracking-widest transition-colors ${
              tab === t.id
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-field text-ink-2 border border-hairline hover:border-strong'
            }`}
          >
            <Icon name={t.icon} size="s" />
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

      {invitando && cliente.email && (
        <InvitarAtletaModal emailInicial={cliente.email} onCerrar={() => setInvitando(false)} />
      )}
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../hooks/useToast';
import { useRegistrarCobro } from '../hooks/useSuscripciones';
import { estadoSuscripcionCliente } from '../lib/suscripcionEstado';
import { tiempoRelativo } from '../lib/fechas';
import { Icon } from '../../../components/ui';
import Skeleton from '../../../components/ui/Skeleton';
import ClienteSwipeRow from './ClienteSwipeRow';
import SuscripcionModal from './SuscripcionModal';
import EmptyState from './EmptyState';
import type { Cliente, CrmSuscripcion } from '../types';

interface Props {
  clientes: Cliente[];
  suscripciones: CrmSuscripcion[];
  coachEmail: string;
  cargando?: boolean;
}

/** `tel`+`numero` a dígitos puros para un enlace `wa.me` — sin espacios, sin el `+`. */
function enlaceWhatsapp(c: Cliente): string | null {
  if (!c.telefono?.numero) return null;
  const digitos = `${c.telefono.prefijo}${c.telefono.numero}`.replace(/\D/g, '');
  return digitos ? `https://wa.me/${digitos}` : null;
}

// "Mensaje" abre WhatsApp o el correo del cliente — no hay mensajería
// coach↔atleta en la app (el paso de chat del tutorial se descartó a
// propósito en F3.12), así que se apoya en contacto real ya guardado en
// `Cliente.telefono`/`Cliente.email` en vez de inventar infra nueva.
export default function ClientesActionList({ clientes, suscripciones, coachEmail, cargando }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const registrar = useRegistrarCobro();
  const [asignando, setAsignando] = useState<Cliente | null>(null);

  const suscripcionesPorCliente = useMemo(() => {
    const m = new Map<string, CrmSuscripcion[]>();
    for (const s of suscripciones) {
      const lista = m.get(s.clientId);
      if (lista) lista.push(s); else m.set(s.clientId, [s]);
    }
    return m;
  }, [suscripciones]);

  const filas = useMemo(
    () => clientes.map(c => ({ cliente: c, estado: estadoSuscripcionCliente(suscripcionesPorCliente.get(c.id) ?? []) })),
    [clientes, suscripcionesPorCliente]
  );

  const requiereAccion = filas.filter(f => f.estado.tipo !== 'al_dia');
  const alDia = filas.filter(f => f.estado.tipo === 'al_dia');

  const abrirMensaje = (c: Cliente) => {
    const wa = enlaceWhatsapp(c);
    if (wa) { window.open(wa, '_blank', 'noopener'); return; }
    if (c.email) { window.location.href = `mailto:${c.email}`; return; }
    showToast('Este cliente no tiene teléfono ni email guardado', 'info');
  };

  const renovar = (s: CrmSuscripcion) => {
    registrar.mutate({ suscripcion: s, coachEmail });
  };

  if (cargando) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <React.Fragment key={i}><Skeleton className="h-16 w-full" /></React.Fragment>)}
      </div>
    );
  }

  if (filas.length === 0) {
    return (
      <EmptyState
        icon="group"
        titulo="Sin clientes activos"
        descripcion="Los clientes activos con suscripción aparecerán aquí, agrupados por si requieren atención."
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-sans text-caption uppercase tracking-widest text-ink-2">Requiere acción</h2>
          {requiereAccion.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-1 font-sans text-caption font-bold text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
              {requiereAccion.length}
            </span>
          )}
        </div>
        {requiereAccion.length === 0 ? (
          <p className="font-sans text-caption text-ink-3 px-1">Nada pendiente — todas las suscripciones están al día.</p>
        ) : (
          <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface divide-y divide-white/7 overflow-hidden">
            {requiereAccion.map(({ cliente: c, estado }) => (
              <ClienteSwipeRow
                key={c.id}
                mensaje={{ label: 'Mensaje', icon: 'chat', onClick: () => abrirMensaje(c) }}
                principal={
                  estado.tipo === 'sin_plan'
                    ? { label: 'Asignar', icon: 'add_circle', onClick: () => setAsignando(c) }
                    : { label: 'Renovar', icon: 'autorenew', onClick: () => renovar(estado.suscripcion) }
                }
              >
                <button
                  type="button"
                  onClick={() => navigate(`/crm/clientes/${c.id}`)}
                  className="w-full flex items-center justify-between gap-2 p-3 text-left bg-bg"
                >
                  <span className="min-w-0">
                    <span className="block font-sans text-caption font-bold text-ink truncate">{c.nombre}</span>
                    <span className="block font-sans text-caption text-warning">
                      {estado.tipo === 'sin_plan' ? 'Sin plan asignado' : `Vence ${tiempoRelativo(estado.suscripcion.proximoCobro)}`}
                    </span>
                  </span>
                  <Icon name="chevron_right" size="m" className="text-ink-3 shrink-0" />
                </button>
              </ClienteSwipeRow>
            ))}
          </div>
        )}
      </section>

      {alDia.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-sans text-caption uppercase tracking-widest text-ink-2 px-1">Al día ({alDia.length})</h2>
          <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface divide-y divide-white/7 overflow-hidden">
            {alDia.map(({ cliente: c }) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/crm/clientes/${c.id}`)}
                className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-white/4 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block font-sans text-caption text-ink truncate">{c.nombre}</span>
                  <span className="block font-sans text-caption text-ink-3">{c.createdAt ? tiempoRelativo(c.createdAt) : ''}</span>
                </span>
                <Icon name="check_circle" size="s" className="text-success shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {asignando && (
        <SuscripcionModal
          cliente={asignando}
          coachEmail={coachEmail}
          onCerrar={() => setAsignando(null)}
        />
      )}
    </div>
  );
}

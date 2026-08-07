import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UserProfile, WeightCheckIn, WorkoutAssignment } from '../types';
import { getCrmSuscripciones } from '../dbService';
import { Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   HomeCoachScreen (F3.13a, "Home Coach" del handoff transversal)

   La entrada del coach: "Requiere acción" (revisiones, pagos, planes sin
   publicar) separada de "Al día", reutilizando el punto pulsante ya
   establecido en la cabecera de ClientsScreen (`animate-pulse` + bg-data,
   ahora también en oro para lo urgente). No sustituye a la parrilla de
   atletas ni al alta de nuevo cliente que ya vivían en ClientsScreen — esos
   siguen debajo, sin tocar: CRM→Clientes es un directorio de facturación
   (con contactos que ni siquiera tienen cuenta en la app, ver `Cliente.
   fuente`), no el lanzador del Hub de coaching por atleta. La tarjeta
   "Revisiones Pendientes" que vivía arriba de la parrilla SÍ se retira de
   ClientsScreen: esta pantalla la sustituye 1:1.
   ═══════════════════════════════════════════════════════════════════════════ */

interface ActionRow {
  key: string;
  label: string;
  detail: string;
  onClick: () => void;
}

interface Props {
  athletes: UserProfile[];
  checkins: WeightCheckIn[];
  assignmentsByEmail: Map<string, WorkoutAssignment[]>;
  loadingAssignments: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HomeCoachScreen({ athletes, checkins, assignmentsByEmail, loadingAssignments }: Props) {
  const navigate = useNavigate();
  const { data: suscripciones = [] } = useQuery({
    queryKey: ['crmSuscripciones'],
    queryFn: getCrmSuscripciones,
  });

  const nameByEmail = new Map(athletes.map(a => [a.email, a.displayName]));

  const revisionRows: ActionRow[] = [];
  const seenReviewEmail = new Set<string>();
  for (const c of checkins) {
    if (c.approved && c.coachFeedback) continue;
    if (seenReviewEmail.has(c.email)) continue;
    seenReviewEmail.add(c.email);
    const pendingForAthlete = checkins.filter(x => x.email === c.email && (!x.approved || !x.coachFeedback)).length;
    revisionRows.push({
      key: `revision-${c.email}`,
      label: nameByEmail.get(c.email) ?? c.email,
      detail: `${pendingForAthlete} revisión${pendingForAthlete === 1 ? '' : 'es'} pendiente${pendingForAthlete === 1 ? '' : 's'}`,
      onClick: () => navigate(`/clients/${encodeURIComponent(c.email)}/revisiones`),
    });
  }

  const today = todayIso();
  const overdueSubs = suscripciones.filter(s => s.estado === 'activa' && s.proximoCobro <= today);
  const pagoClientIds = new Set(overdueSubs.map(s => s.clientId));
  const pagoRows: ActionRow[] = overdueSubs.map(s => ({
    key: `pago-${s.id}`,
    label: s.clientNombre,
    detail: `Pago vencido · ${s.concepto}`,
    onClick: () => navigate(`/crm/clientes/${s.clientId}`),
  }));

  const planRows: ActionRow[] = loadingAssignments ? [] : athletes
    .filter(a => (assignmentsByEmail.get(a.email) ?? []).length === 0)
    .map(a => ({
      key: `plan-${a.email}`,
      label: a.displayName,
      detail: 'Plan sin publicar',
      onClick: () => navigate(`/clients/${encodeURIComponent(a.email)}/entrenamientos`),
    }));
  const planPendingEmails = new Set(planRows.map(r => r.key.slice('plan-'.length)));

  const requiereAccion = [...revisionRows, ...pagoRows, ...planRows];
  const alDia = athletes.filter(a =>
    !seenReviewEmail.has(a.email)
    && !(a.userId && pagoClientIds.has(a.userId))
    && !planPendingEmails.has(a.email)
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-title-l font-black uppercase text-ink">Home Coach</h2>
        {requiereAccion.length > 0 ? (
          <span className="inline-flex items-center gap-2 rounded-control border border-accent-line bg-accent/10 px-3 py-1 font-mono text-caption font-bold uppercase text-accent">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            {requiereAccion.length} requiere{requiereAccion.length === 1 ? '' : 'n'} acción
          </span>
        ) : (
          <span className="rounded-control border border-hairline bg-surface px-3 py-1 font-mono text-caption font-bold uppercase text-ink-2">Al día</span>
        )}
      </div>

      {requiereAccion.length > 0 && (
        <div className="space-y-2">
          {requiereAccion.map(row => (
            <button
              key={row.key}
              onClick={row.onClick}
              className="w-full flex items-center gap-3 rounded-control border border-hairline bg-surface p-4 text-left hover:border-accent-line transition-colors"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-accent animate-pulse" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-sans text-body-s font-bold text-ink">{row.label}</span>
                <span className="block font-mono text-caption text-ink-2">{row.detail}</span>
              </span>
              <Icon name="chevron_right" size="m" className="text-ink-2 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {alDia.length > 0 && (
        <details className="rounded-control border border-hairline bg-surface p-3">
          <summary className="cursor-pointer select-none font-mono text-caption uppercase text-ink-2">Al día ({alDia.length})</summary>
          <div className="mt-3 space-y-1">
            {alDia.map(a => (
              <button
                key={a.email}
                onClick={() => navigate(`/clients/${encodeURIComponent(a.email)}`)}
                className="w-full flex items-center justify-between rounded-control px-3 py-2 text-left hover:bg-raised transition-colors"
              >
                <span className="font-sans text-body-s text-ink-2">{a.displayName}</span>
                <Icon name="check_circle" size="s" className="text-success" />
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

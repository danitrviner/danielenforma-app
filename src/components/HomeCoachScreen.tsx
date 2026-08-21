import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UserProfile, WeightCheckIn, WorkoutAssignment } from '../types';
import { getCrmSuscripciones } from '../dbService';
import { ActionRow as ActionRowPrimitive, EmptyState } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   HomeCoachScreen (F3.13a, "Home Coach" del handoff transversal)

   La entrada del coach: "Requiere acción" (revisiones, pagos, planes sin
   publicar). Restilizada sobre `Home Coach - Experiencia.dc.html`
   (docs/design/fase3): filtro por chips, fila con avatar de iniciales
   (`ui/ActionRow`, nueva — el propio handoff pide reutilizarla en vez de
   inventar un tratamiento por pantalla), y estado vacío a pantalla completa
   cuando no hay nada pendiente. La sección "Al día" que vivía aquí se quitó
   en el rediseño (handoff Fase 3.2, "Home Coach"): esos atletas siguen
   accesibles desde la parrilla completa de `ClientsScreen`.

   La maqueta dibuja esto como una pantalla propia titulada "Hoy" — aquí
   vive insertada bajo la cabecera "Clientes" de `ClientsScreen`, así que no
   repetimos el título grande (quedaría duplicado con el de arriba); ver la
   nota en CLAUDE.md/el informe de rediseño sobre si esto debería separarse
   en su propia pestaña ahora que CRM ya tiene la suya.

   No sustituye a la parrilla de atletas ni al alta de nuevo cliente que ya
   vivían en ClientsScreen — esos siguen debajo, sin tocar: CRM→Clientes es
   un directorio de facturación (con contactos que ni siquiera tienen cuenta
   en la app, ver `Cliente.fuente`), no el lanzador del Hub de coaching por
   atleta. La tarjeta "Revisiones Pendientes" que vivía arriba de la
   parrilla SÍ se retira de ClientsScreen: esta pantalla la sustituye 1:1.
   ═══════════════════════════════════════════════════════════════════════════ */

type Categoria = 'revision' | 'pago' | 'plan';

interface ActionRow {
  key: string;
  categoria: Categoria;
  label: string;
  detail: string;
  onClick: () => void;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '·';
}

const DIA_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

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
  const [filtro, setFiltro] = useState<'todas' | Categoria>('todas');
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
      categoria: 'revision',
      label: nameByEmail.get(c.email) ?? c.email,
      detail: `${pendingForAthlete} revisión${pendingForAthlete === 1 ? '' : 'es'} pendiente${pendingForAthlete === 1 ? '' : 's'}`,
      onClick: () => navigate(`/clients/${encodeURIComponent(c.email)}/revisiones`),
    });
  }

  const today = todayIso();
  const overdueSubs = suscripciones.filter(s => s.estado === 'activa' && s.proximoCobro <= today);
  const pagoRows: ActionRow[] = overdueSubs.map(s => ({
    key: `pago-${s.id}`,
    categoria: 'pago',
    label: s.clientNombre,
    detail: `Pago vencido · ${s.concepto}`,
    onClick: () => navigate(`/crm/clientes/${s.clientId}`),
  }));

  const planRows: ActionRow[] = loadingAssignments ? [] : athletes
    .filter(a => (assignmentsByEmail.get(a.email) ?? []).length === 0)
    .map(a => ({
      key: `plan-${a.email}`,
      categoria: 'plan',
      label: a.displayName,
      detail: 'Plan sin publicar',
      onClick: () => navigate(`/clients/${encodeURIComponent(a.email)}/entrenamientos`),
    }));

  const requiereAccion = [...revisionRows, ...pagoRows, ...planRows];
  const visibles = filtro === 'todas' ? requiereAccion : requiereAccion.filter(r => r.categoria === filtro);

  const chips = useMemo(() => ([
    { id: 'todas' as const, label: 'Todas', count: requiereAccion.length },
    { id: 'revision' as const, label: 'Revisiones', count: revisionRows.length },
    { id: 'pago' as const, label: 'Pagos', count: pagoRows.length },
    { id: 'plan' as const, label: 'Planes', count: planRows.length },
  ].filter(c => c.id === 'todas' || c.count > 0)), [requiereAccion.length, revisionRows.length, pagoRows.length, planRows.length]);

  const hoy = new Date();

  if (requiereAccion.length === 0) {
    return (
      <section>
        <EmptyState
          icon="check"
          iconTone="accent"
          title="Todo al día"
          description="Ningún atleta necesita algo tuyo ahora mismo."
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <p className="font-mono text-label uppercase tracking-wider text-ink-3">
        {DIA_SEMANA[hoy.getDay()]} · {athletes.length} atleta{athletes.length === 1 ? '' : 's'} activo{athletes.length === 1 ? '' : 's'}
      </p>

      {chips.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto hide-scrollbar px-1 pb-1">
          {chips.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFiltro(c.id)}
              className={
                'flex-none rounded-chip px-3 py-2 font-mono text-caption font-bold uppercase transition-colors duration-(--duration-state) '
                + (filtro === c.id ? 'bg-accent text-on-accent' : 'bg-white/5 text-ink-2 hover:bg-white/8')
              }
            >
              {c.label} · {c.count}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        <span className="font-mono text-caption uppercase tracking-widest text-ink-3">Requiere acción</span>
      </div>
      <div className="divide-y divide-hairline overflow-hidden rounded-field border border-hairline bg-surface">
        {visibles.map(row => (
          <ActionRowPrimitive
            key={row.key}
            initials={iniciales(row.label)}
            title={row.label}
            meta={row.detail}
            urgent
            onClick={row.onClick}
          />
        ))}
      </div>
    </section>
  );
}

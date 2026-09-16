import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UserProfile, WeightCheckIn, WorkoutAssignment } from '../types';
import { getCrmSuscripciones, getPendingAiProposals, getMesocyclesForAthletes } from '../dbService';
import {
  construirBandejaDelDia, contarPorUrgencia, SenalDelDia, UrgenciaSenal, CategoriaSenal,
} from '../utils/bandejaDelDia';
import { hoyIsoLocal } from '../utils/trainingWeek';
import { ActionRow as ActionRowPrimitive, EmptyState, Icon } from './ui';

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

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '·';
}

const DIA_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

/* Los tres niveles de prisa, con su nombre y su color. No es decorado: es lo
   que separa «este atleta no puede entrenar» de «avísale de que su bloque se
   acaba el viernes». Mezclarlos en una sola lista roja es lo que hace que se
   dejen de mirar. */
const META_URGENCIA: Record<UrgenciaSenal, { titulo: string; nota: string; punto: string }> = {
  bloqueado: {
    titulo: 'Está parado',
    nota: 'No puede entrenar hasta que lo toques',
    punto: 'bg-danger',
  },
  hoy: {
    titulo: 'Para hoy',
    nota: 'Está esperando algo tuyo',
    punto: 'bg-accent',
  },
  pronto: {
    titulo: 'Antes de que se te pase',
    nota: 'Nada urgente, pero nadie más te va a avisar',
    punto: 'bg-ink-3',
  },
};

const ORDEN_URGENCIA: UrgenciaSenal[] = ['bloqueado', 'hoy', 'pronto'];

const LABEL_CATEGORIA: Record<CategoriaSenal, string> = {
  plan: 'Planes', revision: 'Revisiones', pago: 'Pagos', propuesta: 'Asistente',
  ausencia: 'Ausencias', renovacion: 'Renovaciones', setup: 'Montaje',
};

interface Props {
  athletes: UserProfile[];
  checkins: WeightCheckIn[];
  assignmentsByEmail: Map<string, WorkoutAssignment[]>;
  loadingAssignments: boolean;
}

export default function HomeCoachScreen({ athletes, checkins, assignmentsByEmail, loadingAssignments }: Props) {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<'todas' | CategoriaSenal>('todas');
  const { data: suscripciones = [] } = useQuery({
    queryKey: ['crmSuscripciones'],
    queryFn: getCrmSuscripciones,
  });
  // Misma clave que la bandeja del asistente y la pantalla de Propuestas:
  // comparten caché y se refrescan juntas al aprobar o rechazar.
  const { data: propuestasPendientes = [] } = useQuery({
    queryKey: ['aiProposalsPendientes'],
    queryFn: getPendingAiProposals,
  });

  // Los bloques de TODOS los atletas en una sola consulta por lotes (de 30 en
  // 30, ver getMesocyclesForAthletes): es lo que permite avisar de las
  // renovaciones sin pagar una lectura por cliente cada vez que se abre la app.
  const emails = useMemo(() => athletes.map(a => a.email), [athletes]);
  const { data: mesociclos = [] } = useQuery({
    queryKey: ['mesocyclesForAthletes', emails],
    queryFn: () => getMesocyclesForAthletes(emails),
    enabled: emails.length > 0,
  });

  const hoyIso = hoyIsoLocal();

  /* Quién necesita algo tuyo, y con cuánta prisa. La decisión vive en
     `utils/bandejaDelDia.ts`, con sus tests: aquí solo se pinta. Antes estaba
     escrita a mano en este componente y solo miraba tres cosas — lo que de
     verdad se escapa (el que lleva nueve días sin entrar, el bloque que se
     acaba, el montaje que se quedó al 55 %) no avisaba por su cuenta. */
  const senales = useMemo(() => {
    if (loadingAssignments) return [];
    const pagosVencidos = suscripciones
      .filter(s => s.estado === 'activa' && s.proximoCobro <= hoyIso)
      .map(s => ({
        nombre: s.clientNombre,
        texto: `Pago vencido · ${s.concepto}`,
        destino: `/crm/clientes/${s.clientId}`,
      }));
    const propuestasPorEmail = new Map<string, number>();
    for (const p of propuestasPendientes) {
      propuestasPorEmail.set(p.athleteId, (propuestasPorEmail.get(p.athleteId) ?? 0) + 1);
    }
    return construirBandejaDelDia({
      atletas: athletes,
      checkins,
      asignacionesPorEmail: assignmentsByEmail,
      mesociclos,
      pagosVencidos,
      propuestasPorEmail,
      hoy: hoyIso,
    });
  }, [loadingAssignments, athletes, checkins, assignmentsByEmail, mesociclos, suscripciones, propuestasPendientes, hoyIso]);

  const visibles = filtro === 'todas' ? senales : senales.filter(s => s.categoria === filtro);
  const porUrgencia = useMemo(() => contarPorUrgencia(senales), [senales]);

  const chips = useMemo(() => {
    const cuenta = new Map<CategoriaSenal, number>();
    for (const s of senales) cuenta.set(s.categoria, (cuenta.get(s.categoria) ?? 0) + 1);
    return [
      { id: 'todas' as const, label: 'Todas', count: senales.length },
      ...[...cuenta.entries()].map(([id, count]) => ({ id, label: LABEL_CATEGORIA[id], count })),
    ];
  }, [senales]);

  const irA = (s: SenalDelDia) => navigate(s.destino);

  const hoy = new Date();

  if (senales.length === 0) {
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
      {/* Las propuestas del asistente, en la pantalla por la que se entra.
          Su pantalla vive en /propuestas y en la barra lateral de PC, pero en
          el móvil la barra de abajo está llena (cuatro destinos al límite de
          ancho) y el botón del asistente con su contador es `md:` — o sea que
          desde el móvil no había NADA que dijera que hay algo esperando.
          Aquí sí, y en los dos sitios. */}
      {propuestasPendientes.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/propuestas')}
          className="w-full flex items-center gap-3 rounded-field border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left transition-colors hover:bg-amber-500/15"
        >
          <Icon name="smart_toy" size="m" filled className="text-amber-300 flex-shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-sans font-bold text-body-s text-white">
              {propuestasPendientes.length === 1
                ? '1 propuesta por revisar'
                : `${propuestasPendientes.length} propuestas por revisar`}
            </span>
            <span className="block font-mono text-caption text-ink-2 truncate">
              {[...new Set(propuestasPendientes.map(p => p.athleteId))].join(' · ')}
            </span>
          </span>
          <Icon name="arrow_forward" size="s" className="text-ink-3 flex-shrink-0" />
        </button>
      )}

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

      {/* Un grupo por nivel de prisa. Una sola lista roja con todo mezclado es
          lo que hace que se deje de mirar: si «no puede entrenar» y «avísale de
          que su bloque acaba el viernes» pesan igual, deja de pesar ninguno. */}
      {ORDEN_URGENCIA.filter(u => visibles.some(s => s.urgencia === u)).map(u => (
        <div key={u} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${META_URGENCIA[u].punto} ${u === 'bloqueado' ? 'animate-pulse' : ''}`} />
            <span className="font-mono text-caption uppercase tracking-widest text-ink-3">
              {META_URGENCIA[u].titulo} · {porUrgencia[u]}
            </span>
            <span className="font-mono text-caption text-ink-3 truncate">{META_URGENCIA[u].nota}</span>
          </div>
          <div className="divide-y divide-hairline overflow-hidden rounded-field border border-hairline bg-surface">
            {visibles.filter(s => s.urgencia === u).map(s => (
              <ActionRowPrimitive
                key={s.id}
                initials={iniciales(s.athleteName)}
                title={s.athleteName}
                meta={s.texto}
                urgent={u !== 'pronto'}
                onClick={() => irA(s)}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

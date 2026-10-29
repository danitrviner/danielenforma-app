import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile } from '../types';
import { getProgressPhotos, getPesoExtremo } from '../dbService';
import { pesoUltimoKey } from '../hooks/useAthleteWeight';
import { Icon, ListRow } from './ui';
import { addDays, hoyIsoLocal } from '../utils/trainingWeek';
import { getMensajesAprobados } from '../db/mensajesCoach';
import { claveMensajesAtleta } from './home/LoUltimoDeDani';
import { COACH_NOMBRE } from '../utils/coach';
import { VARIANTES } from '../data/variantes';

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

/* ═══════════════════════════════════════════════════════════════════════════
   Fase 3 (F3.5): "sala de espera" — re-skin sobre
   docs/design/fase3/Login y Espera - Experiencia.dc.html panel 02. Copy
   exacto del handoff: título "Dani está montando tu plan", cuerpo mismo
   texto, insignia "EN REVISIÓN DESDE …" con punto que late, salida
   secundaria a la anamnesis ("Ver mi anamnesis"). El cuadro discontinuo
   dorado es el mismo lenguaje de vacío que Nutrición reutiliza —no un
   patrón nuevo de esta tarjeta.

   Se conserva el checklist "mientras tanto" (foto, peso, Road map): no está
   en el panel del handoff, pero resuelve algo real que el handoff no
   contradice —el "valle de la muerte" post-onboarding— así que se mantiene
   junto al añadido nuevo, no en su lugar.
   ═══════════════════════════════════════════════════════════════════════════ */

// Marca de "ya visitó el Road map" — mismo patrón que enforma_tour_pending_
// (App.tsx/AppTour.tsx): una bandera en localStorage, sin colección nueva ni
// lectura extra. AthleteRoadmapScreen la marca sola al montar; el propio
// checklist también la marca de forma optimista al pulsar el ítem.
const roadmapVisitedKey = (email: string) => `enforma_roadmap_visited_${email}`;
export function markRoadmapVisited(email: string): void {
  try { localStorage.setItem(roadmapVisitedKey(email), '1'); } catch { /* noop */ }
}
function isRoadmapVisited(email: string): boolean {
  try { return localStorage.getItem(roadmapVisitedKey(email)) === '1'; } catch { return false; }
}

/** La insignia (29-10): si el coach se ha comprometido a una fecha, cuenta
 * HACIA ella («LO TENDRÁS EL JUEVES 30»); si no, lo de antes: desde cuándo
 * está en revisión. Contar los días que lleva esperando jugaba en contra. */
export function fraseDesde(createdAt: string | undefined, planPrometidoPara?: string, hoy = hoyIsoLocal()): string {
  if (planPrometidoPara) {
    const dias = Math.round((Date.parse(`${planPrometidoPara}T12:00:00`) - Date.parse(`${hoy}T12:00:00`)) / 86_400_000);
    const fecha = new Date(`${planPrometidoPara}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }).toUpperCase();
    if (dias <= 0) return 'TU PLAN LLEGA HOY';
    if (dias === 1) return 'TU PLAN LLEGA MAÑANA';
    return `LO TENDRÁS EL ${fecha}`;
  }
  if (!createdAt) return 'EN REVISIÓN';
  const dias = Math.floor((Date.parse(hoy) - Date.parse(createdAt.slice(0, 10))) / 86_400_000);
  if (dias <= 0) return 'EN REVISIÓN DESDE HOY';
  if (dias === 1) return 'EN REVISIÓN DESDE AYER';
  return `EN REVISIÓN DESDE HACE ${dias} DÍAS`;
}

interface Props {
  profile: UserProfile;
  onNavigate: (tab: 'checkin' | 'roadmap' | 'profile') => void;
  /** 'insignia' («LO TENDRÁS EL JUEVES 30») · 'cuenta' (los días que faltan, en grande). */
  variante?: typeof VARIANTES.salaEspera;
}

/** Días hasta la fecha comprometida (negativo = ya pasó). */
export function diasHastaPlan(planPrometidoPara: string, hoy = hoyIsoLocal()): number {
  return Math.round((Date.parse(`${planPrometidoPara}T12:00:00`) - Date.parse(`${hoy}T12:00:00`)) / 86_400_000);
}

// El "valle de la muerte" post-onboarding: el atleta termina el wizard en su
// pico de motivación y, hasta que el coach le monta el primer plan, la app no
// tenía nada que ofrecerle salvo "sin entrenamientos pendientes". Este panel
// solo se monta cuando el atleta todavía no tiene NINGÚN entrenamiento
// asignado (HomeScreen ya filtra por eso) — así el coste de las dos lecturas
// nuevas (fotos, peso) solo lo paga quien de verdad está en ese hueco.
export default function PlanInPreparationCard({ profile, onNavigate, variante = VARIANTES.salaEspera }: Props) {
  const [roadmapVisited, setRoadmapVisited] = useState(() => isRoadmapVisited(profile.email));

  const { data: photos = [], isPending: loadingPhotos } = useQuery({
    queryKey: ['progressPhotos', profile.email],
    queryFn: () => getProgressPhotos(profile.email),
  });
  // Esta tarjeta solo pregunta «¿se ha pesado alguna vez?». Leer el historial
  // entero para mirar `.length > 0` costaba cientos de documentos; basta con
  // pedir uno. Comparte clave con Check-in, así que entre las dos es 1 lectura.
  const { data: algunPeso = null, isPending: loadingWeights } = useQuery({
    queryKey: pesoUltimoKey(profile.email),
    queryFn: () => getPesoExtremo(profile.email, 'ultimo'),
  });
  const desdeMensajes = addDays(hoyIsoLocal(), -29);
  const { data: todosLosMensajes = [] } = useQuery({
    queryKey: claveMensajesAtleta(profile.email, desdeMensajes),
    queryFn: () => getMensajesAprobados(profile.email, desdeMensajes),
  });
  const mensajes = todosLosMensajes.filter(m => m.tipo === 'implantacion' || m.tipo === 'libre').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const hasPhoto = photos.length > 0;
  const hasWeight = algunPeso !== null;
  const loaded = !loadingPhotos && !loadingWeights;

  const items = [
    {
      key: 'photo',
      icon: 'photo_camera',
      label: 'Sube tu foto inicial',
      done: hasPhoto,
      onClick: () => onNavigate('checkin'),
    },
    {
      key: 'weight',
      icon: 'monitor_weight',
      label: 'Registra tu peso de hoy',
      done: hasWeight,
      onClick: () => onNavigate('checkin'),
    },
    {
      key: 'roadmap',
      icon: 'map',
      label: 'Explora tu Road map',
      done: roadmapVisited,
      onClick: () => { markRoadmapVisited(profile.email); setRoadmapVisited(true); onNavigate('roadmap'); },
    },
  ];
  const doneCount = items.filter(i => i.done).length;

  return (
    <section className="rounded-canvas border border-dashed border-accent/45 bg-surface p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-surface border border-accent/30 bg-accent/13">
          <Icon name="schedule" size="l" filled className="text-accent-ink" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="font-display text-title-l font-black uppercase tracking-tight text-ink">
            Dani está montando tu plan
          </h2>
          <p className="font-sans text-body-s leading-relaxed text-ink-2">
            Revisó tu anamnesis y está construyendo tu primer bloque de fuerza y tu dieta. Te
            avisamos en cuanto esté listo.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {variante === 'cuenta' && profile.planPrometidoPara ? (
              <span className="inline-flex items-baseline gap-2">
                <span className="font-display text-title-l font-black leading-none text-accent-ink">
                  {Math.max(0, diasHastaPlan(profile.planPrometidoPara))}
                </span>
                <span className="font-mono text-caption font-bold uppercase tracking-widest text-ink-2">
                  {diasHastaPlan(profile.planPrometidoPara) <= 0 ? 'llega hoy' : diasHastaPlan(profile.planPrometidoPara) === 1 ? 'día · mañana' : `días · ${new Date(`${profile.planPrometidoPara}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}`}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent/13 px-3 py-1 font-mono text-caption font-bold uppercase tracking-widest text-accent-ink">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" aria-hidden />
                {fraseDesde(profile.createdAt, profile.planPrometidoPara)}
              </span>
            )}
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="font-sans text-body-s font-bold text-accent-ink hover:underline"
            >
              Ver mi anamnesis
            </button>
          </div>
        </div>
      </div>

      {/* Lo que Dani le ha dicho ya (29-10): «he leído tu alta…». Mensajes
          de tipo implantación firmados; si no hay ninguno, nada. */}
      {mensajes.length > 0 && (
        <div className="border-t border-hairline pt-4 space-y-2">
          {mensajes.map(m => (
            <div key={m.id} className="rounded-control border border-accent-line bg-accent-bg/50 p-3">
              <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">{COACH_NOMBRE} te ha escrito · {fechaCorta(m.fecha)}</p>
              <p className="mt-1 font-sans text-body-s text-ink whitespace-pre-wrap text-pretty">{m.texto}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-hairline pt-4 space-y-2">
        <p className="font-sans text-caption uppercase tracking-widest text-ink-2">
          Mientras tanto ({doneCount}/{items.length})
        </p>
        {items.map(item => (
          <ListRow
            key={item.key}
            onClick={item.onClick}
            disabled={!loaded}
            className={`rounded-control border ${item.done ? 'bg-success/6 border-success/20' : 'bg-raised border-hairline'}`}
            leading={
              <Icon name={item.done ? 'check_circle' : item.icon} size="l" className={item.done ? 'text-success' : 'text-ink-2'} />
            }
            title={item.label}
          />
        ))}
        <ListRow
          className="rounded-surface border border-hairline bg-raised/50 opacity-60"
          leading={<Icon name="lock" size="l" className="text-ink-2" />}
          title="Tu primer entrenamiento"
          trailing={<span className="font-sans text-caption uppercase text-ink-2">Esperando a tu coach</span>}
        />
      </div>
    </section>
  );
}

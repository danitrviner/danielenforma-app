import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile } from '../types';
import { getProgressPhotos, getBodyweightForAthlete } from '../dbService';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import { Icon, ListRow } from './ui';

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

interface Props {
  profile: UserProfile;
  onNavigate: (tab: 'checkin' | 'roadmap') => void;
}

// El "valle de la muerte" post-onboarding: el atleta termina el wizard en su
// pico de motivación y, hasta que el coach le monta el primer plan, la app no
// tenía nada que ofrecerle salvo "sin entrenamientos pendientes". Este panel
// solo se monta cuando el atleta todavía no tiene NINGÚN entrenamiento
// asignado (HomeScreen ya filtra por eso) — así el coste de las dos lecturas
// nuevas (fotos, peso) solo lo paga quien de verdad está en ese hueco.
export default function PlanInPreparationCard({ profile, onNavigate }: Props) {
  const [roadmapVisited, setRoadmapVisited] = useState(() => isRoadmapVisited(profile.email));

  const { data: photos = [], isPending: loadingPhotos } = useQuery({
    queryKey: ['progressPhotos', profile.email],
    queryFn: () => getProgressPhotos(profile.email),
  });
  const { data: weights = [], isPending: loadingWeights } = useQuery({
    queryKey: bodyweightForAthleteKey(profile.email),
    queryFn: () => getBodyweightForAthlete(profile.email),
  });
  const hasPhoto = photos.length > 0;
  const hasWeight = weights.length > 0;
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
    <section className="bg-surface border border-accent/25 rounded-canvas p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-surface bg-accent/10 border border-accent/30 flex items-center justify-center flex-shrink-0">
          <Icon name="schedule" size="l" filled className="text-accent" />
        </div>
        <div>
          <h2 className="font-sans font-bold uppercase tracking-tight text-title-s text-white">Tu coach está preparando tu plan</h2>
          <p className="text-label text-ink-2 mt-1 leading-relaxed">
            Está revisando tu ficha para montarte un plan a medida. Normalmente lo tienes en menos de 48h — te avisamos en cuanto esté.
          </p>
        </div>
      </div>

      <div className="border-t border-hairline pt-4 space-y-2">
        <p className="font-sans text-caption uppercase tracking-widest text-ink-2">
          Mientras tanto ({doneCount}/{items.length})
        </p>
        {items.map(item => (
          <ListRow
            key={item.key}
            onClick={item.onClick}
            disabled={!loaded}
            className={`rounded-control border ${item.done ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-raised border-hairline'}`}
            leading={
              <Icon name={item.done ? 'check_circle' : item.icon} size="l" className={item.done ? 'text-emerald-400' : 'text-ink-2'} />
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

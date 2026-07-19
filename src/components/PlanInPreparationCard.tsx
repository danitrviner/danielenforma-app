import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile } from '../types';
import { getProgressPhotos, getBodyweightForAthlete } from '../dbService';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';

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
    <section className="bg-[#181816] border border-[#fbcb1a]/25 rounded-3xl p-5 shadow-[0_0_40px_-8px_rgba(251,203,26,0.25)] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-2xl text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
        </div>
        <div>
          <h2 className="font-sans font-black uppercase tracking-tight text-base text-white">Tu coach está preparando tu plan</h2>
          <p className="text-xs text-[#c6c9ab] mt-1 leading-relaxed">
            Está revisando tu ficha para montarte un plan a medida. Normalmente lo tienes en menos de 48h — te avisamos en cuanto esté.
          </p>
        </div>
      </div>

      <div className="border-t border-white/7 pt-4 space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#c6c9ab]">
          Mientras tanto ({doneCount}/{items.length})
        </p>
        {items.map(item => (
          <button
            key={item.key}
            onClick={item.onClick}
            disabled={!loaded}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all border ${
              item.done
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-[#1e1e1e] border-white/7 hover:border-[#fbcb1a]/40'
            } disabled:opacity-60`}
          >
            <span className={`material-symbols-outlined text-lg ${item.done ? 'text-emerald-400' : 'text-[#c6c9ab]'}`}>
              {item.done ? 'check_circle' : item.icon}
            </span>
            <span className={`font-sans text-sm flex-1 ${item.done ? 'text-emerald-200 line-through decoration-emerald-500/50' : 'text-white'}`}>
              {item.label}
            </span>
          </button>
        ))}
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-white/7 bg-[#1e1e1e]/50 opacity-60">
          <span className="material-symbols-outlined text-lg text-[#c6c9ab]">lock</span>
          <span className="font-sans text-sm flex-1 text-[#c6c9ab]">Tu primer entrenamiento</span>
          <span className="font-mono text-[9px] uppercase text-[#c6c9ab]">Esperando a tu coach</span>
        </div>
      </div>
    </section>
  );
}

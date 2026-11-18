import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Exercise, WorkoutExercise } from '../../types';
import { Icon } from '../ui';
import AvisoDeAlternas from '../mesociclo/AvisoDeAlternas';
import { parejasPautadas, ahorroPautado } from '../../utils/seriesAlternas';
import { duracionEstimadaMin } from '../../utils/programacion';

/* Banco de pruebas de las SERIES ALTERNAS en el editor del coach
   (`/dev/alternas`, solo en desarrollo). Pinta el aviso real
   (mesociclo/AvisoDeAlternas.tsx) sobre un día inventado que no cabe en el
   tiempo del atleta, para probar «Alternar» y «Quitar» sin tocar Firestore.

   Lo que ve el atleta está en `/dev/entreno` (la última página es una pareja).
   Las tres versiones del atleta y la otra del coach que hubo aquí se borraron
   cuando Dani eligió (11-11-2026): tabla por turnos + aviso arriba. */

const ATLETA = 'dev@example.com';
/** Otro atleta de prueba, sin tiempo por sesión en el alta: solo se empareja a mano. */
const SIN_TIEMPO = 'sin-tiempo@example.com';
const TIEMPO = 50;

const EJERCICIOS = [
  { id: 'press', name: 'Press inclinado en multipower', muscleGroup: 'pecho', secondaryMuscleGroups: ['triceps', 'deltoide_ant'], guiado: true },
  { id: 'remo', name: 'Remo en T con apoyo', muscleGroup: 'trapecio', secondaryMuscleGroups: ['dorsal', 'biceps'], guiado: true },
  { id: 'curl', name: 'Curl en polea', muscleGroup: 'biceps', secondaryMuscleGroups: [], guiado: true },
  { id: 'tri', name: 'Extensión de tríceps', muscleGroup: 'triceps', secondaryMuscleGroups: [], guiado: true },
  { id: 'lat', name: 'Elevaciones laterales', muscleGroup: 'deltoide_lat', secondaryMuscleGroups: [], guiado: false },
  { id: 'gemelo', name: 'Gemelo en prensa', muscleGroup: 'gemelo', secondaryMuscleGroups: [], guiado: true },
] as unknown as Exercise[];

const DIA: WorkoutExercise[] = [
  { exerciseId: 'press', order: 0, sets: 4, reps: '8-12', rir: 2, restSeconds: 180 },
  { exerciseId: 'remo', order: 1, sets: 4, reps: '8-12', rir: 2, restSeconds: 180 },
  { exerciseId: 'curl', order: 2, sets: 3, reps: '10-12', rir: 1, restSeconds: 120 },
  { exerciseId: 'tri', order: 3, sets: 3, reps: '10-15', rir: 1, restSeconds: 120 },
  { exerciseId: 'lat', order: 4, sets: 4, reps: '12-15', rir: 1, restSeconds: 90 },
  { exerciseId: 'gemelo', order: 5, sets: 4, reps: '10-15', rir: 1, restSeconds: 90 },
];

export default function AlternasDevHarness() {
  const [dia, setDia] = useState(DIA);
  // El aviso lee el tiempo por sesión del alta: aquí se deja ya en la caché.
  const queryClient = useQueryClient();
  useState(() => {
    queryClient.setQueryData(['onboarding', ATLETA], { sessionMaxMinutes: TIEMPO });
    queryClient.setQueryData(['onboarding', SIN_TIEMPO], {});
  });
  const [conTiempo, setConTiempo] = useState(true);
  const parejas = parejasPautadas(dia);
  const nombre = (id: string) => EJERCICIOS.find(e => e.id === id)?.name ?? id;

  return (
    <div className="min-h-screen bg-bg px-4 py-6">
      <h1 className="mb-1 font-display text-title-l uppercase text-ink">Series alternas · coach</h1>
      <p className="mb-2 font-sans text-label text-ink-2">
        {conTiempo ? `El atleta de prueba tiene ${TIEMPO} min por sesión.` : 'El alta de este atleta no dice cuánto tiempo tiene.'}
      </p>
      <button
        type="button"
        onClick={() => { setConTiempo(v => !v); setDia(DIA); }}
        className="mb-4 rounded-control border border-hairline px-3 py-1.5 font-sans text-label text-ink-2"
      >
        {conTiempo ? 'Probar sin tiempo en el alta' : 'Probar con 50 min'}
      </button>

      <div className="mx-auto max-w-[560px] rounded-surface border border-hairline bg-surface overflow-hidden">
        <div className="px-3 py-2 bg-bg border-b border-hairline space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-title-s uppercase text-ink">Día 1 · Torso A</p>
            <span className="font-mono text-caption text-ink-2 tabular-nums">
              {dia.reduce((s, e) => s + e.sets, 0)} series · {dia.length} ejercicios · ~{duracionEstimadaMin(dia, ahorroPautado(dia))} min
            </span>
          </div>
          <AvisoDeAlternas ejercicios={dia} allExercises={EJERCICIOS} athleteEmail={conTiempo ? ATLETA : SIN_TIEMPO} onEscribir={setDia} />
        </div>
        <ul className="divide-y divide-hairline px-3">
          {dia.map((we, i) => {
            const pareja = parejas.find(p => p.includes(i));
            const otro = pareja ? dia[pareja[0] === i ? pareja[1] : pareja[0]] : undefined;
            return (
              <li key={we.exerciseId} className="py-2.5">
                <p className="font-sans text-label font-bold text-ink">{i + 1}. {nombre(we.exerciseId)}</p>
                <p className="font-mono text-caption text-ink-2">{we.sets} × {we.reps} · {we.restSeconds} s</p>
                {otro && (
                  <span className="flex items-center gap-1 mt-0.5 font-sans text-caption text-accent-ink">
                    <Icon name="swap_vert" size="s" />
                    Alterna con {nombre(otro.exerciseId).toLowerCase()}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

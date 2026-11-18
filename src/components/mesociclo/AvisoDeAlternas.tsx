import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOnboarding } from '../../dbService';
import type { Exercise, WorkoutExercise } from '../../types';
import { Button } from '../ui';
import { llevaSegmentos } from '../../utils/tecnicaDeSerie';
import {
  proponerAlternas, parejasPosibles, duracionEstimada, parejasPautadas, ahorroPautado, ahorroPorVuelta, alternar, quitarAlternas, compiten,
  type EjercicioDeSesion,
} from '../../utils/seriesAlternas';

/* Series alternas en el editor del coach (P4, versión «aviso arriba» elegida
   por Dani el 11-11-2026).

   Cuando el día no cabe en el tiempo que el atleta dijo tener en el alta, se
   proponen las parejas justas para que quepa, sin recortar el descanso de
   nadie. Si el día ya lleva parejas, se enseñan aquí con lo que ahorran y el
   botón para quitarlas.

   Si el día cabe, o el alta no dice cuánto tiempo tiene, no se propone nada
   (alternar tiene un coste y no se sugiere por sistema), pero queda un botón
   discreto, «Alternar ejercicios», para emparejar a mano entre las parejas
   que no compiten. */

interface Props {
  ejercicios: WorkoutExercise[];
  allExercises: Exercise[];
  athleteEmail?: string;
  /** Guarda el día entero. Ausente = solo lectura (semanas que no son la base). */
  onEscribir?: (nuevos: WorkoutExercise[]) => void;
}

const min = (seg: number) => Math.max(1, Math.round(seg / 60));
const renumerar = (lista: WorkoutExercise[]) => lista.map((e, i) => ({ ...e, order: i }));

export default function AvisoDeAlternas({ ejercicios, allExercises, athleteEmail, onEscribir }: Props) {
  // Misma clave de caché que el resto de pantallas que leen el alta.
  const { data: alta } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail!),
    enabled: !!athleteEmail,
  });
  const minutos = alta?.sessionMaxMinutes && alta.sessionMaxMinutes > 0 ? alta.sessionMaxMinutes : undefined;

  const porId = useMemo(() => new Map(allExercises.map(e => [e.id, e])), [allExercises]);
  const nombre = (i: number) => porId.get(ejercicios[i]?.exerciseId)?.name ?? 'Ejercicio';

  const sesion: EjercicioDeSesion[] = useMemo(() => ejercicios.map(we => {
    const ex = porId.get(we.exerciseId);
    return {
      muscleGroup: ex?.muscleGroup ?? we.muscleGroup,
      secondaryMuscleGroups: ex?.secondaryMuscleGroups ?? [],
      guiado: ex?.guiado,
      equipment: ex?.equipment,
      sets: we.sets,
      restSeconds: we.restSeconds ?? 0,
      // Ni lo que lleva bajadas o miniseries ni lo que ya tiene pareja.
      fijo: llevaSegmentos(we.technique) || !!we.alterna,
    };
  }), [ejercicios, porId]);

  const pautadas = parejasPautadas(ejercicios);
  const ahorrado = ahorroPautado(ejercicios);
  const total = duracionEstimada(sesion);
  const propuesta = minutos == null ? null : proponerAlternas(sesion, minutos, ahorrado);
  const hayPropuesta = !!propuesta && propuesta.parejas.length > 0;
  // A mano: todo lo que se podría alternar, cuando no hay propuesta que hacer.
  const [aMano, setAMano] = useState(false);
  const posibles = !hayPropuesta && onEscribir ? parejasPosibles(sesion) : [];

  if (pautadas.length === 0 && !hayPropuesta && posibles.length === 0) return null;

  return (
    <div className="space-y-2">
      {pautadas.length > 0 && (
        <div className="rounded-control border border-accent-line bg-accent/6 p-3">
          <p className="font-sans text-label font-bold text-accent-ink">
            Series alternas · ahorran {min(ahorrado)} min
          </p>
          <ul className="mt-1.5 space-y-1">
            {pautadas.map(([a, b]) => {
              const chocan = compiten(sesion[a], sesion[b]);
              const ahorro = Math.min(sesion[a].sets, sesion[b].sets) * ahorroPorVuelta(sesion[a].restSeconds, sesion[b].restSeconds);
              return (
                <li key={`${a}-${b}`} className="font-sans text-caption text-ink-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0">{nombre(a)} + {nombre(b)} · {min(ahorro)} min</span>
                    {onEscribir && pautadas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onEscribir(quitarAlternas(ejercicios, ejercicios[a].alterna))}
                        className="shrink-0 font-sans text-caption font-bold text-ink-2 hover:text-ink"
                      >
                        Quitar
                      </button>
                    )}
                  </span>
                  {chocan && <span className="block text-warning">Estos dos compiten: uno llega cansado por el otro.</span>}
                </li>
              );
            })}
          </ul>
          {onEscribir && (
            <Button variant="ghost" size="s" icon="close" className="mt-2" onClick={() => onEscribir(quitarAlternas(ejercicios))}>
              {pautadas.length > 1 ? 'Quitar todas' : 'Quitar la alterna'}
            </Button>
          )}
        </div>
      )}

      {hayPropuesta && propuesta && minutos != null && (
        <div className="rounded-control border border-warning/40 bg-warning/10 p-3">
          <p className="font-sans text-label text-ink">
            Dura unos {min(total - ahorrado)} min y tiene {minutos}.{' '}
            {propuesta.cabe
              ? `Alternando ${propuesta.parejas.length === 1 ? 'una pareja' : `${propuesta.parejas.length} parejas`} que no ${propuesta.parejas.length === 1 ? 'compite' : 'compiten'}, cabe sin recortar el descanso de nadie.`
              : `Alternando lo que no compite se acerca, pero aún se pasa unos ${min(propuesta.sobranSeg)} min.`}
          </p>
          <ul className="mt-2 space-y-1">
            {propuesta.parejas.map(p => (
              <li key={`${p.a}-${p.b}`} className="font-sans text-caption text-ink-2">
                {nombre(p.a)} + {nombre(p.b)} · ahorra {min(p.ahorroSeg)} min
              </li>
            ))}
          </ul>
          {onEscribir && (
            <Button
              variant="secondary" size="s" icon="swap_vert" className="mt-3"
              onClick={() => onEscribir(renumerar(alternar(ejercicios, propuesta.parejas)))}
            >
              {propuesta.parejas.length === 1 ? 'Alternar esta pareja' : 'Alternar estas parejas'}
            </Button>
          )}
        </div>
      )}

      {posibles.length > 0 && onEscribir && (aMano ? (
        <div className="rounded-control border border-hairline bg-raised p-3">
          <p className="font-sans text-label text-ink">
            {minutos == null
              ? 'El alta no dice cuánto tiempo tiene por sesión. Si quieres acortarla, estas parejas no compiten:'
              : `Cabe en sus ${minutos} min. Si aun así quieres acortarla, estas parejas no compiten:`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {posibles.map(p => (
              <li key={`${p.a}-${p.b}`} className="flex items-center justify-between gap-2">
                <span className="min-w-0 font-sans text-caption text-ink-2">{nombre(p.a)} + {nombre(p.b)}</span>
                <Button
                  variant="secondary" size="s" icon="swap_vert" className="shrink-0"
                  onClick={() => onEscribir(renumerar(alternar(ejercicios, [p])))}
                >
                  Alternar · −{min(p.ahorroSeg)} min
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="s" className="mt-2" onClick={() => setAMano(false)}>Cerrar</Button>
        </div>
      ) : (
        <Button variant="ghost" size="s" icon="swap_vert" onClick={() => setAMano(true)}>
          Alternar ejercicios
        </Button>
      ))}
    </div>
  );
}

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPesoExtremo, getWorkoutLogs, getRoadmap, getExercises } from '../dbService';
import { pesoPrimeroKey, pesoUltimoKey } from '../hooks/useAthleteWeight';
import { Icon, Skeleton } from './ui';
import StatTile from './StatTile';

interface Props {
  athleteEmail: string;
}

interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  date: string;
}

interface VolumeGain {
  exerciseName: string;
  recentTonnage: number;
  previousTonnage: number;
  gainPct: number;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const uniqueDesc = Array.from(new Set(dates)).sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = addDaysStr(today, -1);
  // La racha solo cuenta si el atleta entrenó hoy o ayer — si no, está rota.
  if (uniqueDesc[0] !== today && uniqueDesc[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < uniqueDesc.length; i++) {
    if (addDaysStr(uniqueDesc[i - 1], -1) === uniqueDesc[i]) streak++;
    else break;
  }
  return streak;
}

export default function AthleteHighlightsPanel({ athleteEmail }: Props) {
  // Este panel solo enseña cuánto ha variado el peso de punta a punta, así que
  // pide los dos extremos y no el historial: dos lecturas en vez de una por
  // cada día que el atleta lleve registrando.
  const { data: primerPeso = null, isPending: loadingPrimero } = useQuery({
    queryKey: pesoPrimeroKey(athleteEmail),
    queryFn: () => getPesoExtremo(athleteEmail, 'primero'),
  });
  const { data: ultimoPeso = null, isPending: loadingUltimo } = useQuery({
    queryKey: pesoUltimoKey(athleteEmail),
    queryFn: () => getPesoExtremo(athleteEmail, 'ultimo'),
  });
  const loadingWeight = loadingPrimero || loadingUltimo;
  const { data: workoutLogs = [], isPending: loadingLogs } = useQuery({
    queryKey: ['workoutLogs', athleteEmail],
    queryFn: () => getWorkoutLogs(athleteEmail),
  });
  const { data: roadmap, isPending: loadingRoadmap } = useQuery({
    queryKey: ['roadmap', athleteEmail],
    queryFn: () => getRoadmap(athleteEmail),
  });
  const { data: exercises = [], isPending: loadingExercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
  });

  const loading = loadingWeight || loadingLogs || loadingRoadmap || loadingExercises;

  const exerciseNameById = useMemo(() => {
    const map = new Map<string, string>();
    exercises.forEach(e => map.set(e.id, e.name));
    return map;
  }, [exercises]);

  const weightChange = useMemo(() => {
    // `id` distinto = hay al menos dos registros. Con uno solo, primero y
    // último son el mismo documento y no hay variación que enseñar — es lo
    // mismo que comprobaba el `length < 2` de antes.
    if (!primerPeso || !ultimoPeso || primerPeso.id === ultimoPeso.id) return null;
    return { delta: ultimoPeso.weight - primerPeso.weight, first: primerPeso, last: ultimoPeso };
  }, [primerPeso, ultimoPeso]);

  const personalRecords = useMemo<PersonalRecord[]>(() => {
    const best = new Map<string, PersonalRecord>();
    for (const log of workoutLogs) {
      for (const entry of log.entries) {
        for (const set of entry.sets) {
          if (!set.weight || !set.repsDone) continue;
          const current = best.get(entry.exerciseId);
          if (!current || set.weight > current.weight) {
            best.set(entry.exerciseId, {
              exerciseId: entry.exerciseId,
              exerciseName: exerciseNameById.get(entry.exerciseId) ?? 'Ejercicio',
              weight: set.weight,
              reps: set.repsDone,
              date: log.date,
            });
          }
        }
      }
    }
    return Array.from(best.values()).sort((a, b) => b.weight - a.weight).slice(0, 5);
  }, [workoutLogs, exerciseNameById]);

  const biggestVolumeGain = useMemo<VolumeGain | null>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const recentStart = addDaysStr(today, -14);
    const previousStart = addDaysStr(today, -28);

    const recentTonnage = new Map<string, number>();
    const previousTonnage = new Map<string, number>();

    for (const log of workoutLogs) {
      const bucket = log.date >= recentStart ? recentTonnage : (log.date >= previousStart ? previousTonnage : null);
      if (!bucket) continue;
      for (const entry of log.entries) {
        const tonnage = entry.sets.reduce((s, set) => s + (set.weight || 0) * (set.repsDone || 0), 0);
        bucket.set(entry.exerciseId, (bucket.get(entry.exerciseId) ?? 0) + tonnage);
      }
    }

    let best: VolumeGain | null = null;
    for (const [exerciseId, recent] of recentTonnage) {
      const previous = previousTonnage.get(exerciseId) ?? 0;
      if (previous <= 0 || recent <= previous) continue; // sin base para comparar, o no hay progreso
      const gainPct = ((recent - previous) / previous) * 100;
      if (!best || gainPct > best.gainPct) {
        best = { exerciseName: exerciseNameById.get(exerciseId) ?? 'Ejercicio', recentTonnage: recent, previousTonnage: previous, gainPct };
      }
    }
    return best;
  }, [workoutLogs, exerciseNameById]);

  const streak = useMemo(() => computeStreak(workoutLogs.map(l => l.date)), [workoutLogs]);

  const goalsAchieved = useMemo(() =>
    (roadmap?.items ?? []).filter(i => i.status === 'logrado').length,
  [roadmap]);

  const hasAnything = weightChange || personalRecords.length > 0 || biggestVolumeGain || streak > 0 || goalsAchieved > 0;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-surface" />
        <Skeleton className="h-24 w-full rounded-surface" />
      </div>
    );
  }

  if (!hasAnything) {
    return (
      <div className="bg-surface border border-hairline rounded-surface p-5 text-center">
        <Icon name="emoji_events" size="l" className="text-ink-3 mx-auto mb-2" />
        <p className="font-sans text-body-s text-ink-2">
          Aquí aparecerán tus logros — peso, récords y rachas — en cuanto empieces a registrar entrenos y pesajes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {weightChange && (
          <StatTile
            icon={weightChange.delta <= 0 ? 'trending_down' : 'trending_up'}
            label={weightChange.delta <= 0 ? 'Peso perdido' : 'Peso ganado'}
            value={`${Math.abs(weightChange.delta).toFixed(1)} kg`}
            accent={weightChange.delta <= 0 ? 'var(--color-success)' : 'var(--color-accent)'}
          />
        )}
        {streak > 0 && (
          <StatTile icon="local_fire_department" label="Racha actual" value={`${streak} día${streak !== 1 ? 's' : ''}`} accent="var(--color-warning)" />
        )}
        {goalsAchieved > 0 && (
          <StatTile icon="flag" label="Objetivos cumplidos" value={goalsAchieved} accent="var(--color-success)" />
        )}
        {biggestVolumeGain && (
          <StatTile icon="trending_up" label="Mayor progreso" value={`+${Math.round(biggestVolumeGain.gainPct)}%`} accent="var(--color-accent)" />
        )}
      </div>

      {biggestVolumeGain && (
        <div className="bg-surface border border-hairline rounded-surface p-4">
          <p className="font-sans text-caption uppercase text-ink-2 mb-1">Mayor progreso de volumen (últimas 2 semanas)</p>
          <p className="font-sans font-bold text-body-s text-white">{biggestVolumeGain.exerciseName}</p>
          <p className="font-mono text-caption text-ink-2">
            {Math.round(biggestVolumeGain.previousTonnage)} kg → {Math.round(biggestVolumeGain.recentTonnage)} kg de tonelaje
          </p>
        </div>
      )}

      {personalRecords.length > 0 && (
        <div className="bg-surface border border-hairline rounded-surface p-4">
          <p className="font-sans text-caption uppercase text-ink-2 mb-3 flex items-center gap-2">
            <Icon name="emoji_events" size="s" className="text-accent" />
            Récords personales
          </p>
          <div className="space-y-2">
            {personalRecords.map((pr, i) => (
              <div key={pr.exerciseId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-caption text-ink-3 w-4 shrink-0">{i + 1}</span>
                  <span className="font-sans text-body-s text-white truncate">{pr.exerciseName}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-bold text-body-s text-accent">{pr.weight} kg × {pr.reps}</span>
                  <span className="block font-mono text-caption text-ink-3">{fmtDate(pr.date)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

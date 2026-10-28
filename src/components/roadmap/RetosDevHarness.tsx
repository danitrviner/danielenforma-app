import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Exercise, Mesocycle, UserProfile, Workout, WorkoutAssignment, WorkoutLog, WorkoutSetLog,
} from '../../types';
import { hoyIsoLocal, addDays, getWeekStart } from '../../utils/trainingWeek';
import {
  generateChallengeOptions, buildChallengeFromOption, evaluateChallengeProgress, isoWeekKey, ChallengeData,
} from '../../utils/weeklyChallenge';
import { nuevaSerieVacia, type SetInput } from '../training/setInput';
import WorkoutSessionPlayer from '../training/WorkoutSessionPlayer';
import WeeklyChallengeCard from './WeeklyChallengeCard';

/* Banco de pruebas del reto de la semana (`/dev/retos`, solo en desarrollo).
   Un atleta avanzado calcado del caso de Dani (28-10-2026): nueve semanas
   entrenando, ningún registro de pasos, bloque en su semana 2 y una sesión de
   pierna pendiente hoy. Enseña las opciones que genera el motor tal y como las
   vería el atleta en Inicio y, al elegir una, el aviso dentro del entreno. No
   lee ni escribe nada de Firestore. */

const EMAIL = 'dev@example.com';
const HOY = hoyIsoLocal();
const LUNES = getWeekStart(HOY);

const ej = (id: string, name: string, muscleGroup: Exercise['muscleGroup']) =>
  ({ id, ownerId: '', name, primaryFocus: '', type: 'fuerza', isCustom: false, muscleGroup }) as Exercise;
const EJERCICIOS: Exercise[] = [
  ej('prensa', 'Prensa pendular', 'cuadriceps'),
  ej('ext', 'Extensiones de cuádriceps en máquina', 'cuadriceps'),
  ej('femoral', 'Curl femoral tumbado', 'isquios'),
  ej('femoral2', 'Curl femoral sentado', 'isquios'),
];
const MESO = {
  id: 'm1', athleteId: EMAIL, number: 2, name: 'Hipertrofia 1', weeks: 9,
  startDate: addDays(LUNES, -7), objective: '', daysPerWeek: 5,
} as unknown as Mesocycle;
const WORKOUT: Workout = {
  id: 'w-pierna', ownerId: '', name: 'Pierna · Dev · Meso #2', mesocycleId: 'm1',
  exercises: EJERCICIOS.map((e, order) => ({ exerciseId: e.id, order, sets: 2, reps: '8-12', rir: 1, restSeconds: 0 })),
};
const ASIGNACION: WorkoutAssignment = { id: 'a-hoy', workoutId: 'w-pierna', athleteId: EMAIL, date: HOY, status: 'pending', mesocycleId: 'm1' };

const s = (weight: number, repsDone: number, rir = 1, alFallo = false): WorkoutSetLog => ({ weight, repsDone, rir, ...(alFallo ? { alFallo } : {}) });
const log = (date: string, entries: Record<string, WorkoutSetLog[]>): WorkoutLog => ({
  id: `l-${date}`, athleteId: EMAIL, workoutId: 'w-pierna', assignmentId: `as-${date}`, date, completedAt: date,
  entries: Object.entries(entries).map(([exerciseId, sets]) => ({ exerciseId, sets })),
});
const LOGS: WorkoutLog[] = [
  ...Array.from({ length: 7 }, (_, i) => log(addDays(LUNES, -63 + i * 7), { prensa: [s(100, 10)] })),
  log(addDays(LUNES, -12), { prensa: [s(110, 12)], ext: [s(60, 12)], femoral: [s(40, 8)], femoral2: [s(35, 10)] }),
  log(addDays(LUNES, -5), { prensa: [s(120, 12), s(120, 10)], ext: [s(65, 10, 0, true)], femoral: [s(40, 8)], femoral2: [s(35, 10)] }),
];
const DATOS: ChallengeData = {
  stepLogs: [], bodyweightLogs: [], workoutLogs: LOGS, exercises: EJERCICIOS,
  completionLogs: [], coachDiets: [], assignments: [ASIGNACION], projection: null,
  workouts: [WORKOUT], mesocycles: [MESO], experienceLevel: 'avanzado', history: [],
};

function setsIniciales(): SetInput[][] {
  return WORKOUT.exercises.map(we => Array.from({ length: we.sets }, () => nuevaSerieVacia()));
}

export default function RetosDevHarness() {
  const qc = useQueryClient();
  const opciones = useMemo(() => generateChallengeOptions({ ...DATOS, athleteId: EMAIL, today: HOY }), []);
  const retos = useMemo(() => opciones.map(o => buildChallengeFromOption(o, { athleteId: EMAIL, today: HOY, origin: 'auto' })), [opciones]);
  const [elegido, setElegido] = useState<number | null>(null);
  const [sets, setSets] = useState(setsIniciales);
  const [notas, setNotas] = useState<string[]>(WORKOUT.exercises.map(() => ''));

  function elegir(i: number) {
    // El aviso del entreno lee el reto de la caché con la misma clave que Inicio.
    qc.setQueryData(['weeklyChallenge', EMAIL, isoWeekKey(HOY)], retos[i]);
    setElegido(i);
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-6 space-y-6 max-w-xl mx-auto">
      <h1 className="font-display font-black text-headline uppercase text-ink">Retos de la semana</h1>
      <p className="font-sans text-label text-ink-2">
        Atleta avanzado, 9 semanas entrenando, sin pasos registrados. Pulsa un reto para verlo dentro del entreno.
      </p>
      {retos.map((r, i) => (
        <button key={`${r.kind}-${i}`} type="button" className="block w-full text-left" onClick={() => elegir(i)}>
          <p className="font-mono text-caption text-ink-3 mb-1">{opciones[i].score} · {r.kind}{elegido === i ? ' · en el entreno ↓' : ''}</p>
          <WeeklyChallengeCard challenge={r} progress={evaluateChallengeProgress(r, DATOS, HOY)} destacado={i === 0} />
        </button>
      ))}
      {elegido != null && (
        <div key={elegido}>
        <WorkoutSessionPlayer
          profile={{ userId: 'dev', email: EMAIL, displayName: 'Dev' } as UserProfile}
          activeAssignment={ASIGNACION}
          activeWorkout={WORKOUT}
          playerSets={sets}
          updateSet={(exIdx, sIdx, field, value) => setSets(prev => prev.map((ex, i) => (i !== exIdx ? ex
            : ex.map((x, j) => (j === sIdx ? { ...x, [field]: value } : x)))))}
          addSetRow={(exIdx, segmentoDe) => setSets(prev => prev.map((ex, i) => (i === exIdx ? [...ex, nuevaSerieVacia(true, segmentoDe)] : ex)))}
          prevEntries={LOGS[LOGS.length - 1].entries}
          exerciseNoteInputs={notas}
          updateExerciseNote={(exIdx, v) => setNotas(prev => prev.map((n, i) => (i === exIdx ? v : n)))}
          getExercise={id => EJERCICIOS.find(e => e.id === id)}
          getPersonalNote={() => undefined}
          logs={LOGS}
          exerciseProgressById={new Map()}
          handleFinish={() => {}}
          isFinishing={false}
          canFinish={false}
          sessionStartedAt={null}
          celebration={null}
          dismissCelebration={() => {}}
          cerrarPlayer={() => setElegido(null)}
          sameDayCardio={null}
          onMarkActionDone={() => {}}
        />
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { Exercise, UserProfile, Workout, WorkoutAssignment, WorkoutEntryLog, WorkoutLog } from '../../types';
import { hoyIsoLocal, addDays } from '../../utils/trainingWeek';
import { segmentosProgramados } from '../../utils/tecnicaDeSerie';
import { nuevaSerieVacia, type SetInput } from './setInput';
import WorkoutSessionPlayer from './WorkoutSessionPlayer';

/* Banco de pruebas del reproductor de entreno (`/dev/entreno`, solo en
   desarrollo). Un entreno inventado con un ejercicio normal, uno con drop set
   en la última serie y uno con myo-reps, con una sesión anterior para que haya
   récords y consejos que enseñar. No lee ni escribe nada de Firestore. */

const HOY = hoyIsoLocal();
const EJERCICIOS = [
  { id: 'press', name: 'Press banca' },
  { id: 'remo', name: 'Remo en polea' },
  { id: 'elev', name: 'Elevaciones laterales' },
] as unknown as Exercise[];
const WORKOUT: Workout = {
  id: 'w', ownerId: '', name: 'Torso de prueba',
  exercises: [
    { exerciseId: 'press', order: 0, sets: 3, reps: '8-10', rir: 2, restSeconds: 0 },
    { exerciseId: 'remo', order: 1, sets: 2, reps: '10-12', rir: 1, restSeconds: 0, technique: 'dropset' },
    { exerciseId: 'elev', order: 2, sets: 2, reps: '12-15', rir: 1, restSeconds: 0, technique: 'myoreps' },
  ],
};
const ANTERIOR: WorkoutEntryLog[] = [
  { exerciseId: 'press', sets: [80, 80, 80].map(w => ({ weight: w, repsDone: 8, rir: 2 })) },
  { exerciseId: 'remo', sets: [60, 60].map(w => ({ weight: w, repsDone: 10, rir: 1 })) },
  { exerciseId: 'elev', sets: [10, 10].map(w => ({ weight: w, repsDone: 12, rir: 1 })) },
];
const LOGS = [{
  id: 'l1', athleteId: 'dev@example.com', workoutId: 'w', assignmentId: 'a0',
  date: addDays(HOY, -7), completedAt: '', entries: ANTERIOR,
}] as unknown as WorkoutLog[];

function setsIniciales(): SetInput[][] {
  return WORKOUT.exercises.map(we => {
    const principales = Array.from({ length: we.sets }, () => nuevaSerieVacia());
    return [...principales, ...segmentosProgramados(we, we.sets).map(k => nuevaSerieVacia(true, k))];
  });
}

export default function EntrenoDevHarness() {
  const [sets, setSets] = useState(setsIniciales);
  const [notas, setNotas] = useState<string[]>(WORKOUT.exercises.map(() => ''));
  const [terminado, setTerminado] = useState(false);
  const assignment: WorkoutAssignment = { id: 'dev', workoutId: 'w', athleteId: 'dev@example.com', date: HOY, status: 'pending' };

  return (
    <div className="min-h-screen bg-bg px-4 py-6">
      {terminado && <p className="mb-4 rounded-control bg-success/10 p-3 font-sans text-body-s text-success">Terminar sesión pulsado.</p>}
      <WorkoutSessionPlayer
        profile={{ userId: 'dev', email: 'dev@example.com', displayName: 'Dev' } as UserProfile}
        activeAssignment={assignment}
        activeWorkout={WORKOUT}
        playerSets={sets}
        updateSet={(exIdx, sIdx, field, value) => setSets(prev => prev.map((ex, i) => (i !== exIdx ? ex
          : ex.map((s, j) => (j === sIdx ? { ...s, [field]: value } : s)))))}
        addSetRow={(exIdx, segmentoDe) => setSets(prev => prev.map((ex, i) => (i === exIdx ? [...ex, nuevaSerieVacia(true, segmentoDe)] : ex)))}
        prevEntries={ANTERIOR}
        exerciseNoteInputs={notas}
        updateExerciseNote={(exIdx, v) => setNotas(prev => prev.map((n, i) => (i === exIdx ? v : n)))}
        getExercise={id => EJERCICIOS.find(e => e.id === id)}
        getPersonalNote={() => undefined}
        logs={LOGS}
        exerciseProgressById={new Map()}
        handleFinish={() => setTerminado(true)}
        isFinishing={false}
        canFinish={sets.some(ex => ex.some(s => s.done))}
        sessionStartedAt={null}
        celebration={null}
        dismissCelebration={() => {}}
        cerrarPlayer={() => {}}
        sameDayCardio={null}
        onMarkActionDone={() => {}}
      />
    </div>
  );
}

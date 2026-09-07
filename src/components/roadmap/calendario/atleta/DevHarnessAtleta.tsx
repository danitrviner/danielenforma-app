import React, { useMemo } from 'react';
import { construirFixture } from '../DevHarness';
import CalendarioAtleta from './CalendarioAtleta';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Banco de pruebas del calendario del ATLETA (ruta `/dev/calendario-atleta`).
 * Mismo motivo que `/dev/calendario` del coach —no hay login sandbox en este
 * repo— y encima el mismo fixture, para poder abrir las dos rutas en paralelo
 * y comparar. Sin Firestore: ni una lectura, ni una escritura.
 */
export default function DevCalendarioAtletaHarness() {
  const hoyBase = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);
  const fixture = useMemo(() => construirFixture(hoyBase), [hoyBase]);

  return (
    <div className="min-h-screen bg-bg p-3 sm:p-6">
      <div className="max-w-[1100px] mx-auto space-y-4">
        <div className="flex items-center gap-2 text-caption font-mono text-ink-4 uppercase tracking-wider">
          <span>/dev/calendario-atleta</span>·<span>datos de ejemplo en memoria, sin Firestore</span>
        </div>
        <CalendarioAtleta
          mesocycles={fixture.mesocycles}
          nutritionProgram={fixture.nutritionProgram}
          roadmap={fixture.roadmap}
          workoutAssignments={fixture.workoutAssignments}
          workoutLogs={fixture.workoutLogs}
          workouts={fixture.workouts}
          exercises={fixture.exercises}
          diets={fixture.diets}
          dietCompletionLogs={fixture.dietCompletionLogs}
          cardioSessions={fixture.cardioSessions}
          bodyweightLogs={fixture.bodyweightLogs}
          tasks={fixture.tasks}
          progressPhotos={fixture.progressPhotos}
          coachDayNotes={fixture.coachDayNotes}
        />
      </div>
    </div>
  );
}

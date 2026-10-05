import React, { useMemo, useState } from 'react';
import { Mesocycle, WorkoutExercise, WorkoutLog, MuscleGroup } from '../../types';
import { Dialog, Button, SegmentedControl } from '../ui';
import PlanificadorProgresion, { type DiaPlanificable } from './PlanificadorProgresion';
import ExerciseCard from '../training/ExerciseCard';
import { ListaDeNovedades } from '../training/NovedadesDeSemana';
import { nuevaSerieVacia } from '../training/setInput';
import { programarCambio } from '../../utils/semanasDelBloque';
import { novedadesDeLaSesion } from '../../utils/planificadorProgresion';
import { expandSetGroups } from '../../utils/setGroups';
import { resolveExerciseForWeek } from '../../utils/progression';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de «Planificar progresión» (Mesociclo › Ejercicios, coach)
   y del aviso de cambios al empezar la sesión (atleta) — ruta
   `/dev/progresion`, solo en desarrollo (podada en producción, ver App.tsx).
   Mismo motivo que los demás `/dev/*`: no hay sesión de coach ni de atleta en
   este repo. Todo en memoria; «Aceptar» solo enseña lo que se escribiría.
   ═══════════════════════════════════════════════════════════════════════════ */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const NOMBRES: Record<string, { name: string; grupo: MuscleGroup }> = {
  banca: { name: 'Press banca', grupo: 'pecho' },
  inclinado: { name: 'Press inclinado con mancuernas', grupo: 'pecho' },
  militar: { name: 'Press militar', grupo: 'deltoide_ant' },
  fondos: { name: 'Fondos en paralelas', grupo: 'pecho' },
  laterales: { name: 'Elevaciones laterales', grupo: 'deltoide_lat' },
  triceps: { name: 'Extensión de tríceps en polea', grupo: 'triceps' },
};
const ej = (exerciseId: string, order: number, sets: number, reps: string, rir: number, extra: Partial<WorkoutExercise> = {}): WorkoutExercise =>
  ({ exerciseId, order, sets, reps, rir, restSeconds: 120, muscleGroup: NOMBRES[exerciseId].grupo, ...extra });

const banca = ej('banca', 0, 3, '6-8', 2);
const bancaConS3: WorkoutExercise = { ...banca, weeklyProgression: programarCambio(banca, 3, false, { ...banca, sets: 4, rir: 1 }) };

const DIAS: DiaPlanificable[] = [
  { clave: 'wA', name: 'Empuje A', dayIndex: 0, workoutIds: ['wA'], exercises: [bancaConS3, ej('laterales', 1, 3, '12-15', 2), ej('triceps', 2, 3, '10-12', 1)] },
  { clave: 'wB', name: 'Empuje B', dayIndex: 1, workoutIds: ['wB'], exercises: [ej('militar', 0, 3, '6-8', 2), ej('inclinado', 1, 3, '8-10', 2, {
    setGroups: [{ label: 'Top set', sets: 1, reps: '6-8', rir: 1 }, { label: 'Back-off', sets: 2, reps: '10-12', rir: 2 }], sets: 3, reps: '6-8 / 10-12', rir: 1,
  })] },
  { clave: 'wC', name: 'Empuje C', dayIndex: 2, workoutIds: ['wC'], exercises: [ej('fondos', 0, 3, '8-12', 2), ej('laterales', 1, 4, '15-20', 1)] },
];

const MESO = {
  id: 'meso_dev', athleteId: 'dev@example.com', startDate: haceDias(16), weeks: 6,
  semanasDescarga: [6], semanasTest: [5], ejerciciosClave: ['d0::banca', 'd1::militar', 'd1::inclinado', 'd2::fondos'],
} as unknown as Mesocycle;

const log = (workoutId: string, dias: number, entries: WorkoutLog['entries'], extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: `${workoutId}-${dias}`, athleteId: 'dev@example.com', workoutId, assignmentId: `a-${workoutId}-${dias}`, mesocycleId: 'meso_dev',
  date: haceDias(dias), completedAt: haceDias(dias), entries, ...extra,
});
const s = (weight: number, repsDone: number, rir = 2) => ({ weight, repsDone, rir });
const LOGS: WorkoutLog[] = [
  log('wA', 16, [{ exerciseId: 'banca', sets: [s(80, 8), s(80, 7), s(80, 7)] }]),
  log('wA', 9, [{ exerciseId: 'banca', sets: [s(82.5, 8), s(82.5, 6), s(82.5, 5)] }]),
  log('wA', 2, [{ exerciseId: 'banca', sets: [s(82.5, 8), s(82.5, 7), s(82.5, 7), s(82.5, 6)] }], { novedadesVistas: true }),
  log('wB', 15, [{ exerciseId: 'militar', sets: [s(50, 8), s(50, 7), s(50, 6)] }, { exerciseId: 'inclinado', sets: [s(30, 7), s(24, 12), s(24, 11)] }]),
  log('wC', 14, [{ exerciseId: 'fondos', sets: [s(10, 12), s(10, 10)] }]),
];

export default function ProgresionDevHarness() {
  const [vista, setVista] = useState<'coach' | 'atleta'>('coach');
  const [resultado, setResultado] = useState<string | null>(null);
  const [aviso, setAviso] = useState(true);
  const nombreDe = (id: string) => NOMBRES[id]?.name ?? id;

  const sesion = useMemo(() => novedadesDeLaSesion(DIAS[0].exercises, MESO, 3, 'Empuje A', nombreDe), []);
  const resueltos = DIAS[0].exercises.map(we => resolveExerciseForWeek(we, 3));

  return (
    <div className="min-h-screen bg-bg text-ink px-4 py-6 max-w-6xl mx-auto space-y-4">
      <SegmentedControl label="Vista" value={vista} onChange={v => setVista(v as 'coach' | 'atleta')}
        options={[{ value: 'coach', label: 'Coach' }, { value: 'atleta', label: 'Atleta (sesión S3)' }]} />

      {vista === 'coach' ? (
        <>
          <PlanificadorProgresion
            dias={DIAS}
            vueltas={6}
            meso={MESO}
            cicloDias={7}
            logs={LOGS}
            semanaActual={3}
            nombreDe={nombreDe}
            grupoDe={we => we.muscleGroup}
            avisosDe={() => ({ 4: [{ tono: 'aviso', texto: 'Deltoides lateral: 6 series, por debajo del mínimo efectivo (8)' }] })}
            onCancelar={() => setResultado('Cancelado: no se escribe nada')}
            onAceptar={(dias, seleccion) => setResultado(JSON.stringify({ dias: dias.map(d => d.clave), seleccion }, null, 2))}
          />
          {resultado && <pre className="bg-surface border border-hairline rounded-surface p-3 font-mono text-caption text-ink-2 whitespace-pre-wrap">{resultado}</pre>}
        </>
      ) : (
        <div className="max-w-md space-y-4">
          <Button size="s" variant="ghost" onClick={() => setAviso(true)}>Volver a enseñar el aviso</Button>
          <Dialog open={aviso} onClose={() => setAviso(false)} size="s" title="Cambios en esta sesión"
            footer={<Button icon="done_all" fullWidth onClick={() => setAviso(false)}>Entendido</Button>}>
            <div className="space-y-3">
              <p className="font-sans text-label text-ink-2">Semana 3. Tu entrenador ha cambiado esto respecto a la semana pasada:</p>
              <ListaDeNovedades novedades={sesion.novedades} sinDia />
              <p className="font-sans text-caption text-ink-3">Los ejercicios que cambian llevan la marca «Nuevo».</p>
            </div>
          </Dialog>
          {resueltos.slice(0, 2).map((we, i) => (
            <ExerciseCard
              key={i}
              we={we}
              exIdx={i}
              ex={{ id: we.exerciseId, ownerId: 'dev', name: nombreDe(we.exerciseId), primaryFocus: '' } as never}
              exSets={expandSetGroups(we).map(() => nuevaSerieVacia())}
              prevEntry={undefined}
              personalNote={undefined}
              isVideoOpen={false}
              onToggleVideo={() => {}}
              onOpenHistory={() => {}}
              onUpdateSet={() => {}}
              onMarkDone={() => {}}
              onAddRow={() => {}}
              noteValue=""
              onNoteChange={() => {}}
              restTimer={null}
              onSkipRest={() => {}}
              onAddRestSeconds={() => {}}
              cambios={sesion.porEjercicio[i]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getExercises } from '../../dbService';
import type { DayPlan, MuscleGroup, MuscleGroupConfig, WeekDistribution } from '../../types';
import { MUSCLE_ORDER } from '../../types';
import RoutinePreview, { type PreviewDay, type PreviewExercise } from './RoutinePreview';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de la vista previa de rutinas agrupada (ruta
   `/dev/vista-previa`, solo en desarrollo). Todo en memoria: es el meso de
   Malena del 29-10, con un jalón quitado en el día 1 para ver el «faltan».
   ═══════════════════════════════════════════════════════════════════════════ */

const mediana = 'Series, reps, RIR y descanso salen de la mediana de tus rutinas con este ejercicio';
const ej = (name: string, muscleGroup: MuscleGroup, reps: string, rir: number, rest: number, sets: number, veces: number, order: number): PreviewExercise => ({
  exerciseId: `dev-${order}-${name}`, name, muscleGroup, reps, rir, restSeconds: rest, sets, order,
  razones: veces ? [`Lo programas en ${veces} rutinas tuyas`, mediana] : ['No lo tienes en ninguna rutina: va con el esquema por defecto'],
});

const DIAS: PreviewDay[] = [
  { dayIndex: 0, warnings: [], exercises: [
    ej('Jalón estable en polea alta agarre medio neutro', 'dorsal', '8-12', 1, 90, 3, 15, 0),
    ej('Curl de bíceps behind con mancuernas sentado en banco', 'biceps', '8-12', 1, 90, 3, 14, 1),
    ej('Remo Gironda agarre medio neutro (sin retracción)', 'dorsal', '8-12', 1, 90, 3, 10, 2),
    ej('Curl de bíceps en polea', 'biceps', '8-12', 1, 90, 3, 13, 3),
    ej('Remo en máquina ascendente agarre prono', 'trapecio', '8-10', 2, 120, 4, 10, 4),
    ej('Extensiones de cadera en banco romano dominante lumbares', 'lumbares', '8-12', 1, 90, 3, 5, 5),
  ] },
  { dayIndex: 1, warnings: [], exercises: [
    ej('Extensiones de cuádriceps en máquina ajustada straps', 'cuadriceps', '8-12', 1, 105, 4, 27, 0),
    ej('Prensa pendular pies abajo', 'cuadriceps', '10-12', 1, 120, 4, 17, 1),
    ej('Abducciones de cadera en máquina sentado', 'gluteo', '8-12', 0, 90, 4, 12, 2),
    ej('Hip thrust tempo controlado', 'gluteo', '8-10', 2, 150, 4, 9, 3),
    ej('Elevaciones de talones en prensa', 'gemelo', '12-15', 1, 60, 3, 6, 4),
    ej('Elevaciones de talones con disco o mancuerna rodillas extendidas', 'gemelo', '8-12', 2, 90, 3, 0, 5),
  ] },
];

const dia = (dayType: string, a: Array<[MuscleGroup, number]>): DayPlan => ({
  dayType, assignments: a.map(([group, series]) => ({ group, series })), totalSeries: a.reduce((s, [, n]) => s + n, 0),
});
const DISTRIBUCION = {
  days: [
    dia('Torso', [['dorsal', 9], ['biceps', 6], ['trapecio', 4], ['lumbares', 3]]),
    dia('Pierna', [['cuadriceps', 8], ['gluteo', 8], ['gemelo', 6]]),
  ],
  overloadAlert: false,
} as unknown as WeekDistribution;
const GRUPOS = Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: 0, priority: 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;

export default function VistaPreviaDevHarness() {
  const [dias, setDias] = useState(DIAS);
  const { data: catalogo = [] } = useQuery({ queryKey: ['exercises'], queryFn: getExercises });
  const cambiar = (d: number, f: (xs: PreviewExercise[]) => PreviewExercise[]) =>
    setDias(prev => prev.map((x, i) => (i === d ? { ...x, exercises: f(x.exercises).map((e, o) => ({ ...e, order: o })) } : x)));

  return (
    <div className="min-h-screen bg-bg p-6 max-w-[1100px] mx-auto">
      <RoutinePreview
        days={dias}
        distribution={DISTRIBUCION}
        mesoGroups={GRUPOS}
        mesoNumber={1}
        weeks={4}
        daysPerWeek={2}
        semanasDelCiclo={1}
        vueltas={4}
        offsets={[0, 1]}
        catalogo={catalogo}
        onSets={(d, i, sets) => cambiar(d, xs => xs.map((e, j) => (j === i ? { ...e, sets } : e)))}
        onReordenar={(d, orden) => cambiar(d, xs => orden.map(o => xs[o]))}
        onRemove={(d, i) => cambiar(d, xs => xs.filter((_, j) => j !== i))}
        onReplace={() => {}}
        onAdd={() => {}}
        onBack={() => {}}
        onAssign={() => {}}
      />
    </div>
  );
}

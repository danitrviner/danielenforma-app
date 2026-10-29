import React, { useMemo, useState } from 'react';
import type { Mesocycle, NutritionProgram, WeeklyChallenge, WorkoutAssignment } from '../types';
import { addDays, getWeekStart, hoyIsoLocal } from '../utils/trainingWeek';
import { semanasDelPlan, evaluarPlan, calcularGastoReal } from '../utils/seguimientoPlan';
import { construirRoadmap } from '../utils/roadmapDelAtleta';
import RoadmapDelAtletaVista, { type VarianteRoadmap } from './roadmap/RoadmapDelAtletaVista';
import WeeklyChallengeCard from './roadmap/WeeklyChallengeCard';

/* Banco de pruebas del Road map del atleta (29-10) — `/dev/roadmap`.
   Las tres variantes sobre los mismos datos, para elegir una. Sin Firestore:
   el programa, los pesos y el bloque están en memoria; `?v=camino|mapa|compacta`
   enseña una sola. */

const HOY = hoyIsoLocal();
const EMAIL = 'dev.atleta@example.com';
const INICIO = addDays(getWeekStart(HOY), -5 * 7); // semana 6 del plan

const PROGRAMA = {
  athleteId: EMAIL, startDate: INICIO,
  phases: [
    { id: 'f1', name: 'Déficit', weeks: 4, dietId: 'd1', objetivo: 'deficit', targetWeight: 82.5, targetKcal: 2100, stepGoal: 9000 },
    { id: 'f2', name: 'Déficit 2', weeks: 6, dietId: 'd2', objetivo: 'deficit', targetWeight: 79, targetKcal: 2000, stepGoal: 9000 },
    { id: 'f3', name: 'Mantenimiento', weeks: 2, dietId: 'd3', objetivo: 'mantenimiento', targetKcal: 2500, stepGoal: 9000 },
    { id: 'f4', name: 'Volumen', weeks: 8, dietId: 'd4', objetivo: 'volumen', targetWeight: 82, targetKcal: 2900, stepGoal: 8000 },
  ],
} as unknown as NutritionProgram;
const DIETAS = [{ id: 'd1', athleteId: EMAIL, name: 'Déficit', meals: [] }, { id: 'd2', athleteId: EMAIL, name: 'Déficit 2', meals: [] }] as never[];
const PESOS = Array.from({ length: 40 }, (_, i) => {
  const d = addDays(INICIO, i);
  return { id: `p_${d}`, athleteId: EMAIL, date: d, weight: Math.round((84.2 - i * 0.07 + ((i * 7) % 3) * 0.1) * 10) / 10, createdAt: '' };
}).filter(p => p.date <= HOY);
const PASOS = PESOS.map(p => ({ id: `s_${p.date}`, athleteId: EMAIL, date: p.date, steps: 8600 + (p.date.charCodeAt(9) % 5) * 300, source: 'manual' as const, createdAt: '' }));
const MESOS: Mesocycle[] = [
  { id: 'm0', athleteId: EMAIL, name: 'Adaptación', startDate: addDays(INICIO, -6 * 7), weeks: 6 } as Mesocycle,
  { id: 'm1', athleteId: EMAIL, name: 'Hipertrofia 1', startDate: addDays(INICIO, 7), weeks: 9 } as Mesocycle,
];
const ASIGNACIONES: WorkoutAssignment[] = Array.from({ length: 6 }, (_, w) => [0, 2, 4].map(d => {
  const date = addDays(getWeekStart(HOY), -7 * (6 - w) + d);
  return { id: `a_${date}`, athleteId: EMAIL, workoutId: 'w', date, status: 'completed' as const };
})).flat();
const RESPUESTAS = Array.from({ length: 5 }, (_, w) => ({ id: `r_${w}`, questionnaireId: 'q', assignmentId: 'a', athleteId: EMAIL, submittedAt: `${addDays(getWeekStart(HOY), -7 * (5 - w) + 4)}T18:00:00.000Z`, answers: [] }));
const RETO: WeeklyChallenge = {
  id: 'reto', athleteId: EMAIL, isoWeek: '2026-W44', weekStart: getWeekStart(HOY), weekEnd: addDays(getWeekStart(HOY), 6),
  kind: 'pasos_media' as WeeklyChallenge['kind'], title: 'Pasos: 9.000 de media', description: 'Esta semana, una media de 9.000 pasos.', origin: 'auto',
  metric: { unit: 'pasos', target: 9000, baseline: 8600 }, status: 'activo', progressValue: 8800, createdAt: '',
};

export default function RoadmapDevHarness() {
  const [variante, setVariante] = useState<VarianteRoadmap | 'todas'>(() => {
    const v = new URLSearchParams(window.location.search).get('v');
    return v === 'camino' || v === 'mapa' || v === 'compacta' ? v : 'todas';
  });
  const roadmap = useMemo(() => {
    const semanas = semanasDelPlan({ program: PROGRAMA, diets: DIETAS, pesos: PESOS, registros: [], pasos: PASOS, pasosBase: 9000, hoy: HOY });
    const evaluacion = evaluarPlan(PROGRAMA, semanas, calcularGastoReal({ pesos: PESOS, registros: [], diets: DIETAS, hasta: HOY }));
    return construirRoadmap({ program: PROGRAMA, semanas, evaluacion, mesociclos: MESOS, assignments: ASIGNACIONES, workoutLogs: [], respuestas: RESPUESTAS, stepLogs: PASOS, stepGoal: 9000, hoy: HOY });
  }, []);
  const reto = <WeeklyChallengeCard challenge={RETO} progress={{ progressValue: 8800, pct: 98, achieved: false }} />;
  const variantes: VarianteRoadmap[] = variante === 'todas' ? ['camino', 'mapa', 'compacta'] : [variante];

  return (
    <div className="min-h-screen bg-bg text-ink p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest flex-1">/dev/roadmap — datos de mentira · semana 6 de 20</p>
          {(['todas', 'camino', 'mapa', 'compacta'] as const).map(v => (
            <button key={v} type="button" onClick={() => setVariante(v)} className={`font-mono text-caption uppercase ${variante === v ? 'text-accent-ink' : 'text-ink-3'}`}>{v}</button>
          ))}
        </div>
        <div className={`grid gap-6 ${variantes.length > 1 ? 'md:grid-cols-3' : 'max-w-sm'}`}>
          {variantes.map(v => (
            <div key={v} className="space-y-2">
              <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">{v === 'camino' ? 'A · Camino' : v === 'mapa' ? 'B · Mapa' : 'C · Compacta'}</p>
              <div className="max-w-sm">
                <RoadmapDelAtletaVista roadmap={roadmap} variante={v} reto={reto} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

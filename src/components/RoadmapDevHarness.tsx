import React, { useMemo, useState } from 'react';
import type { Exercise, Mesocycle, NutritionProgram, WeeklyChallenge, Workout, WorkoutAssignment, WorkoutLog } from '../types';
import { addDays, getWeekStart, hoyIsoLocal } from '../utils/trainingWeek';
import { semanasDelPlan, evaluarPlan, calcularGastoReal } from '../utils/seguimientoPlan';
import { construirRoadmap } from '../utils/roadmapDelAtleta';
import RoadmapDelAtletaVista from './roadmap/RoadmapDelAtletaVista';
import WeeklyChallengeCard from './roadmap/WeeklyChallengeCard';
import ObjetivoDelBloque, { type VarianteObjetivoDelBloque } from './training/ObjetivoDelBloque';
import BloqueTerminado, { type VarianteBloqueTerminado } from './training/BloqueTerminado';
import { progresoDelObjetivo } from '../utils/progresoDelObjetivo';
import { bloqueTerminadoParaElAtleta } from '../utils/bloqueTerminado';

/* Banco de pruebas del Road map del atleta (29-10) — `/dev/roadmap`.
   Sin Firestore: el programa, los pesos y el bloque están en memoria. Enseña
   el camino con fases y el arranque sin ellas; `?v=plan|arranque` una sola.

   17-11-2026: el bloque en curso lleva hipótesis (pecho), así que el paso de
   entreno enseña el objetivo del bloque. `?v=objetivo` enseña sus tres
   variantes en varios momentos del bloque y `?v=cierre` las dos de «Bloque
   terminado» (con marcas y sin ellas). */

const HOY = hoyIsoLocal();
const EMAIL = 'dev.atleta@example.com';
const INICIO = addDays(getWeekStart(HOY), -5 * 7); // semana 6 del plan

const PROGRAMA = {
  athleteId: EMAIL, startDate: INICIO,
  phases: [
    { id: 'f1', name: 'Déficit', weeks: 4, dietId: 'd1', objetivo: 'deficit', targetWeight: 82.5, targetKcal: 2100, stepGoal: 9000, paraQue: 'Arrancar la pérdida sin pasar hambre' },
    { id: 'f2', name: 'Déficit 2', weeks: 6, dietId: 'd2', objetivo: 'deficit', targetWeight: 79, targetKcal: 2000, stepGoal: 9000, paraQue: 'Quitar grasa guardando el músculo', cardio: { sesiones: 2, zona: 'zona 2', minutos: 30 } },
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
  { id: 'm1', athleteId: EMAIL, name: 'Hipertrofia 1', startDate: addDays(INICIO, 7), weeks: 9, daysPerWeek: 3, tipoBloque: 'desarrollo', hipotesis: { pectoral: { palanca: 'volumen', rmObjetivoPct: 8 } } } as unknown as Mesocycle,
  { id: 'm2', athleteId: EMAIL, name: 'Hipertrofia 2', startDate: addDays(INICIO, 7 + 9 * 7), weeks: 8 } as Mesocycle,
];
// Seis semanas cerradas y la actual hasta hoy, todas hechas.
const ASIGNACIONES: WorkoutAssignment[] = Array.from({ length: 7 }, (_, w) => [0, 2, 4].map(d => {
  const date = addDays(getWeekStart(HOY), -7 * (6 - w) + d);
  return { id: `a_${date}`, athleteId: EMAIL, workoutId: 'w', date, status: 'completed' as const };
})).flat().filter(a => a.date <= HOY);
const RESPUESTAS = Array.from({ length: 5 }, (_, w) => ({ id: `r_${w}`, questionnaireId: 'q', assignmentId: 'a', athleteId: EMAIL, submittedAt: `${addDays(getWeekStart(HOY), -7 * (5 - w) + 4)}T18:00:00.000Z`, answers: [] }));
const RETO: WeeklyChallenge = {
  id: 'reto', athleteId: EMAIL, isoWeek: '2026-W44', weekStart: getWeekStart(HOY), weekEnd: addDays(getWeekStart(HOY), 6),
  kind: 'pasos_media' as WeeklyChallenge['kind'], title: 'Pasos: 9.000 de media', description: 'Esta semana, una media de 9.000 pasos.', origin: 'auto',
  metric: { unit: 'pasos', target: 9000, baseline: 8600 }, status: 'activo', progressValue: 8800, createdAt: '',
};

const FRASE = 'Llegar a los 40 sin barriga y con energía para mis hijos';
/** Sesiones registradas: press subiendo 2 kg por semana, para la cifra de fuerza y los primeros hitos. */
const LOGS: WorkoutLog[] = ASIGNACIONES.map((a, i) => ({
  id: `l_${a.date}`, athleteId: EMAIL, workoutId: 'w', assignmentId: a.id, date: a.date, completedAt: `${a.date}T19:00:00.000Z`,
  entries: [{ exerciseId: 'press', sets: [0, 1, 2].map(() => ({ weight: 60 + Math.floor(i / 3) * 2, repsDone: 8, rir: 2 })) }],
}));

/* ── Objetivo del bloque y bloque terminado (17-11) ─────────────────────── */

const EJERCICIOS = [
  { id: 'press', name: 'Press inclinado', muscleGroup: 'pecho' },
  { id: 'aperturas', name: 'Aperturas en polea', muscleGroup: 'pecho' },
  { id: 'laterales', name: 'Elevaciones laterales', muscleGroup: 'deltoide_lat' },
  { id: 'remo', name: 'Remo con barra', muscleGroup: 'dorsal' },
  { id: 'prensa', name: 'Prensa', muscleGroup: 'cuadriceps' },
] as unknown as Exercise[];
/** La rutina del bloque en curso, para el empujón. */
const RUTINAS = [{ id: 'w', mesocycleId: 'm1', name: 'Torso', dayIndex: 0, exercises: [{ exerciseId: 'press', order: 0, sets: 3, reps: '8-10', restSeconds: 120, rir: 2 }] }] as unknown as Workout[];

/** Un bloque de mentira que empezó hace `semanasHechas` semanas (o que acabó hace 3 días, con `terminado`). */
function bloqueDeMuestra(o: {
  semanasHechas: number; semanas?: number; terminado?: boolean; hipotesis: Mesocycle['hipotesis'];
  /** kg × repeticiones de cada ejercicio en la semana `s` (1 = la primera). */
  marcas: (s: number) => Record<string, [number, number]>;
  sesionesHechas?: number;
}) {
  const semanas = o.semanas ?? 12;
  const inicio = o.terminado ? addDays(HOY, -(semanas * 7 + 2)) : addDays(getWeekStart(HOY), -7 * o.semanasHechas);
  const meso = { id: 'demo', athleteId: EMAIL, number: 2, name: 'Hipertrofia 2', startDate: inicio, weeks: semanas, daysPerWeek: 2, tipoBloque: 'desarrollo', hipotesis: o.hipotesis } as unknown as Mesocycle;
  const n = o.terminado ? semanas : o.semanasHechas;
  const logs: WorkoutLog[] = Array.from({ length: n }, (_, i) => {
    const date = addDays(inicio, i * 7);
    return {
      id: `d_${date}`, athleteId: EMAIL, workoutId: 'wd', mesocycleId: 'demo', date, completedAt: `${date}T19:00:00.000Z`,
      entries: Object.entries(o.marcas(i + 1)).map(([exerciseId, [weight, repsDone]]) => ({ exerciseId, sets: [0, 1].map(() => ({ weight, repsDone, rir: 1, rirApuntado: true })) })),
    } as unknown as WorkoutLog;
  });
  const total = semanas * 2;
  const asignaciones: WorkoutAssignment[] = Array.from({ length: total }, (_, i) => {
    const date = addDays(inicio, Math.floor(i / 2) * 7 + (i % 2) * 3);
    return { id: `da_${i}`, athleteId: EMAIL, workoutId: 'wd', mesocycleId: 'demo', date, status: i < (o.sesionesHechas ?? total) ? 'completed' : 'perdido' } as unknown as WorkoutAssignment;
  });
  const rutinas = [{ id: 'wd', mesocycleId: 'demo', name: 'Torso', dayIndex: 0, exercises: Object.keys(o.marcas(1)).map((exerciseId, i) => ({ exerciseId, order: i, sets: 2, reps: exerciseId === 'laterales' ? '12-15' : '8-10', restSeconds: 120, rir: 1 })) }] as unknown as Workout[];
  return { meso, logs, asignaciones, rutinas };
}

const PECHO_Y_HOMBRO = { pectoral: { palanca: 'volumen' }, deltoides: { palanca: 'intensidad' } } as Mesocycle['hipotesis'];
const SOLO_PECHO = { pectoral: { palanca: 'volumen' } } as Mesocycle['hipotesis'];

/** Los momentos del bloque que se enseñan, cada uno con sus datos de mentira. */
const MOMENTOS: { titulo: string; nota: string; datos: ReturnType<typeof bloqueDeMuestra> }[] = [
  {
    titulo: 'Semana 5 · dos grupos, uno ya mejora', nota: 'Pecho sube un 4,3 %; el hombro sigue igual. El empujón sale de la última sesión.',
    datos: bloqueDeMuestra({ semanasHechas: 4, hipotesis: PECHO_Y_HOMBRO, marcas: s => ({ press: [s <= 2 ? 60 : 62.5, 9], laterales: [10, 12] }) }),
  },
  {
    titulo: 'Semana 2 · todavía es pronto', nota: 'Con una sola semana cerrada no se dice nada de fuerza.',
    datos: bloqueDeMuestra({ semanasHechas: 1, hipotesis: SOLO_PECHO, marcas: () => ({ press: [60, 8] }) }),
  },
  {
    titulo: 'Semana 9 · objetivo cubierto', nota: 'Ya mueve más de lo que se buscaba: toca sostenerlo. Y le toca subir de peso.',
    datos: bloqueDeMuestra({ semanasHechas: 8, hipotesis: SOLO_PECHO, marcas: s => ({ press: [s <= 2 ? 60 : s <= 6 ? 62.5 : 65, s === 8 ? 10 : 8] }) }),
  },
  {
    titulo: 'Semana 5 · igual que al empezar', nota: 'Un +1,7 % es ruido de medida: la barra no se mueve y no se dice «has mejorado».',
    datos: bloqueDeMuestra({ semanasHechas: 4, hipotesis: SOLO_PECHO, marcas: s => ({ press: [s <= 2 ? 60 : 61, 8] }) }),
  },
];

const CIERRES: { titulo: string; nota: string; datos: ReturnType<typeof bloqueDeMuestra> }[] = [
  {
    titulo: 'Con marcas', nota: 'Los tres ejercicios que más han subido; la prensa (+1,3 %) no sale: es ruido.',
    datos: bloqueDeMuestra({
      semanasHechas: 0, semanas: 8, terminado: true, hipotesis: SOLO_PECHO, sesionesHechas: 14,
      marcas: s => ({ press: [s <= 3 ? 60 : s <= 6 ? 65 : 67.5, 8], remo: [70, s <= 4 ? 8 : 10], laterales: [s <= 4 ? 8 : 9, 12], prensa: [s <= 4 ? 150 : 152, 10] }),
    }),
  },
  {
    titulo: 'Sin marcas', nota: 'Series a 15 repeticiones: no valen para medir, así que no se opina de fuerza.',
    datos: bloqueDeMuestra({ semanasHechas: 0, semanas: 8, terminado: true, hipotesis: SOLO_PECHO, sesionesHechas: 16, marcas: s => ({ press: [40 + s, 15] }) }),
  },
];

const VARIANTES_OBJETIVO: VarianteObjetivoDelBloque[] = ['franja', 'tarjeta', 'anillo'];
const VARIANTES_CIERRE: VarianteBloqueTerminado[] = ['tarjeta', 'celebracion'];
const VISTAS = ['todas', 'plan', 'arranque', 'objetivo', 'cierre'] as const;
type Vista = typeof VISTAS[number];

function Variantes() {
  return (
    <section className="space-y-6">
      <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Objetivo del bloque · tres variantes (franja = la de Rutinas y el Road map)</p>
      {MOMENTOS.map(m => {
        const progreso = progresoDelObjetivo({ meso: m.datos.meso, logs: m.datos.logs, exercises: EJERCICIOS, workouts: m.datos.rutinas, assignments: m.datos.asignaciones, hoy: HOY });
        return (
          <div key={m.titulo} className="space-y-2">
            <p className="font-sans text-body-s font-bold text-ink">{m.titulo} <span className="font-normal text-ink-3">· {m.nota}</span></p>
            <div className="grid gap-4 md:grid-cols-3">
              {VARIANTES_OBJETIVO.map(v => (
                <div key={v} className="max-w-sm space-y-1">
                  <p className="font-mono text-caption uppercase text-ink-3">{v}</p>
                  <ObjetivoDelBloque progreso={progreso} variante={v} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Cierres() {
  return (
    <section className="space-y-6">
      <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Bloque terminado · dos variantes</p>
      {CIERRES.map(c => {
        const cierre = bloqueTerminadoParaElAtleta({ mesociclos: [c.datos.meso], assignments: c.datos.asignaciones, logs: c.datos.logs, exercises: EJERCICIOS, hoy: HOY });
        return (
          <div key={c.titulo} className="space-y-2">
            <p className="font-sans text-body-s font-bold text-ink">{c.titulo} <span className="font-normal text-ink-3">· {c.nota}</span></p>
            <div className="grid gap-4 md:grid-cols-2">
              {VARIANTES_CIERRE.map(v => (
                <div key={v} className="max-w-sm space-y-1">
                  <p className="font-mono text-caption uppercase text-ink-3">{v}</p>
                  <BloqueTerminado cierre={cierre} variante={v} sinRecordar />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default function RoadmapDevHarness() {
  const [vista, setVista] = useState<Vista>(() => {
    const v = new URLSearchParams(window.location.search).get('v');
    return (VISTAS as readonly string[]).includes(v ?? '') ? v as Vista : 'todas';
  });
  const roadmap = useMemo(() => {
    const semanas = semanasDelPlan({ program: PROGRAMA, diets: DIETAS, pesos: PESOS, registros: [], pasos: PASOS, pasosBase: 9000, hoy: HOY });
    const evaluacion = evaluarPlan(PROGRAMA, semanas, calcularGastoReal({ pesos: PESOS, registros: [], diets: DIETAS, hasta: HOY }));
    return construirRoadmap({ program: PROGRAMA, semanas, evaluacion, mesociclos: MESOS, assignments: ASIGNACIONES, workoutLogs: LOGS, respuestas: RESPUESTAS, stepLogs: PASOS, stepGoal: 9000, hoy: HOY, planPublishedAt: `${INICIO}T10:00:00.000Z`, pesos: PESOS, exercises: EJERCICIOS, workouts: RUTINAS });
  }, []);
  // Sin fases del programa: el arranque, montado con el bloque, la dieta y lo registrado.
  const arranque = useMemo(() => construirRoadmap({
    program: null, semanas: [], mesociclos: [MESOS[1]], assignments: ASIGNACIONES, workoutLogs: LOGS, respuestas: RESPUESTAS.slice(0, 1), stepLogs: PASOS, stepGoal: 9000, hoy: HOY,
    planPublishedAt: `${addDays(HOY, -16)}T10:00:00.000Z`, pesos: PESOS, kcalDieta: 2100, exercises: EJERCICIOS, workouts: RUTINAS,
  }), []);
  const reto = <WeeklyChallengeCard challenge={RETO} progress={{ progressValue: 8800, pct: 98, achieved: false }} />;
  const ver = (v: 'plan' | 'arranque') => vista === 'todas' || vista === v;
  const columnas = (['plan', 'arranque'] as const).filter(ver).length;

  return (
    <div className="min-h-screen bg-bg text-ink p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest flex-1">/dev/roadmap — datos de mentira · semana 6 de 20</p>
          {VISTAS.map(v => (
            <button key={v} type="button" onClick={() => setVista(v)} className={`font-mono text-caption uppercase ${vista === v ? 'text-accent-ink' : 'text-ink-3'}`}>{v}</button>
          ))}
        </div>
        {columnas > 0 && <div className={`grid gap-6 ${columnas > 1 ? 'md:grid-cols-2' : 'max-w-sm'}`}>
          {ver('plan') && (
            <div className="space-y-2">
              <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Con fases</p>
              <div className="max-w-sm"><RoadmapDelAtletaVista roadmap={roadmap} frase={FRASE} reto={reto} /></div>
            </div>
          )}
          {ver('arranque') && (
            <div className="space-y-2">
              <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Sin fases · arranque</p>
              <div className="max-w-sm"><RoadmapDelAtletaVista roadmap={arranque} frase={FRASE} reto={reto} /></div>
            </div>
          )}
        </div>}
        {(vista === 'todas' || vista === 'objetivo') && <Variantes />}
        {(vista === 'todas' || vista === 'cierre') && <Cierres />}
      </div>
    </div>
  );
}

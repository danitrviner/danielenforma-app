import { useState } from 'react';
import type { Exercise, UserProfile, Workout, WorkoutAssignment, WorkoutEntryLog, WorkoutLog } from '../../types';
import { hoyIsoLocal, addDays } from '../../utils/trainingWeek';
import { prefillWorkoutSets } from '../../utils/setPrefill';
import { formatearDuracion } from '../../utils/duracionSesion';
import { SegmentedControl } from '../ui';
import { nuevaSerieVacia, seriesHechas, filaASerie, type SetInput } from './setInput';
import WorkoutSessionPlayer, { type SessionCelebration } from './WorkoutSessionPlayer';
import { VARIANTES_COMO_LLEGA, VARIANTE_COMO_LLEGA_POR_DEFECTO, type VarianteComoLlega } from './PreguntaComoLlega';
import { alternarSesionFuera, fueraAlAbrir, serieConFuera } from '../../utils/sesionFuera';
import SesionesFueraDeLaSemana from './SesionesFueraDeLaSemana';

/* Banco de pruebas del reproductor de entreno (`/dev/entreno`, solo en
   desarrollo). Un entreno inventado con un ejercicio normal, uno con drop set
   en la última serie y uno con myo-reps, con una sesión anterior para que haya
   récords y consejos que enseñar. No lee ni escribe nada de Firestore.

   17-11-2026: la tabla llega prerrellenada como en la sesión real
   (`prefillWorkoutSets`), con el RIR pautado; hay un ejercicio con la última
   serie a AMRAP (D5) y «Terminar sesión» abre el diálogo de fin de sesión con
   la pregunta del cansancio (D6). Abajo se ve lo que se guardaría de cada
   serie, con el RIR «apuntado» solo si se ha cambiado.

   17-11-2026 (tarde): «Hoy entreno fuera de mi gimnasio». Arriba, el
   conmutador de sus dos variantes (chip / fila). Encendido, la tabla pasa a peso vacío
   con la pista, sin subidas ni récords, y cada serie se guarda con la marca
   `fuera`.

   17-11-2026 (noche): ya no se enciende porque el coach marque la semana
   como viaje (se quitó esa casilla). En su lugar, el panel «¿Entrenas fuera
   esta semana?» de Rutinas, con tres sesiones de mentira: marcar o desmarcar
   la de hoy vuelve a abrir la sesión de abajo como si se empezara desde
   Rutinas, y tocar el interruptor dentro de la sesión se refleja en el panel,
   como en la pantalla real. */

const HOY = hoyIsoLocal();
const EJERCICIOS = [
  { id: 'press', name: 'Press banca' },
  { id: 'remo', name: 'Remo en polea' },
  { id: 'elev', name: 'Elevaciones laterales' },
  { id: 'curl', name: 'Curl en polea baja con barra' },
  { id: 'tri', name: 'Extensión de tríceps en polea alta' },
  { id: 'jalon', name: 'Jalón al pecho' },
] as unknown as Exercise[];
const WORKOUT: Workout = {
  id: 'w', ownerId: '', name: 'Torso de prueba',
  exercises: [
    { exerciseId: 'press', order: 0, sets: 3, reps: '8-10', rir: 2, restSeconds: 0 },
    { exerciseId: 'remo', order: 1, sets: 2, reps: '10-12', rir: 1, restSeconds: 0, technique: 'dropset' },
    { exerciseId: 'elev', order: 2, sets: 2, reps: '12-15', rir: 1, restSeconds: 0, technique: 'myoreps' },
    // Series alternas (P4): comparten página y se hacen por turnos.
    { exerciseId: 'curl', order: 3, sets: 3, reps: '10-12', rir: 1, restSeconds: 120, alterna: 'p1' },
    { exerciseId: 'tri', order: 4, sets: 3, reps: '10-15', rir: 1, restSeconds: 120, alterna: 'p1' },
    // Test (D5): la última serie va a AMRAP y llega con «fallo» y sin repeticiones.
    { exerciseId: 'jalon', order: 5, sets: 2, reps: '8-10', rir: 2, restSeconds: 0, technique: 'amrap' },
  ],
};
const ANTERIOR: WorkoutEntryLog[] = [
  {
    exerciseId: 'press', sets: [80, 80, 80].map(w => ({ weight: w, repsDone: 8, rir: 2 })),
    note: 'Me molestó un poco el hombro en la última serie',
    noteReply: { text: 'Baja un poco el agarre y frena 2 s abajo. Si sigue molestando, me escribes.', at: addDays(HOY, -6) + 'T10:00:00.000Z' },
  },
  { exerciseId: 'remo', sets: [60, 60].map(w => ({ weight: w, repsDone: 10, rir: 1 })) },
  { exerciseId: 'elev', sets: [10, 10].map(w => ({ weight: w, repsDone: 12, rir: 1 })) },
  // D1a: la primera serie se apuntó a RIR 0 con RIR 1 pautado → hoy llega con 10, no con 11.
  { exerciseId: 'curl', sets: [25, 25, 25].map((w, i) => ({ weight: w, repsDone: 11, rir: i === 0 ? 0 : 1, ...(i === 0 ? { rirApuntado: true } : {}) })) },
  { exerciseId: 'tri', sets: [30, 30, 30].map(w => ({ weight: w, repsDone: 13, rir: 1 })) },
  { exerciseId: 'jalon', sets: [55, 55].map(w => ({ weight: w, repsDone: 9, rir: 2 })) },
];
/** Las sesiones de la semana del panel; la primera es la que se abre abajo. */
const SESIONES_DEL_PANEL = [
  { id: 'dev', nombre: 'Torso de prueba', fecha: HOY },
  { id: 'dev-pierna', nombre: 'Pierna', fecha: addDays(HOY, 2) },
  { id: 'dev-torso-b', nombre: 'Torso B', fecha: addDays(HOY, 4) },
];
const LOGS = [{
  id: 'l1', athleteId: 'dev@example.com', workoutId: 'w', assignmentId: 'a0',
  date: addDays(HOY, -7), completedAt: '', entries: ANTERIOR,
}] as unknown as WorkoutLog[];

/** La tabla como llega en la sesión real: prerrellenada con la última vez y el RIR pautado. */
function setsIniciales(fuera = false): SetInput[][] {
  return prefillWorkoutSets(WORKOUT, ANTERIOR, undefined, null, fuera);
}

export default function EntrenoDevHarness() {
  const [sets, setSets] = useState(() => setsIniciales());
  // «¿Cómo llegas hoy?»: la variante, para que Dani elija viéndolas.
  const [varianteComoLlega, setVarianteComoLlega] = useState<VarianteComoLlega>(VARIANTE_COMO_LLEGA_POR_DEFECTO);
  // Sesión fuera de su gimnasio: se decide en el panel de la semana (abajo);
  // en el banco el ajuste de Mi gimnasio se da por activado.
  const [fuera, setFuera] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [notas, setNotas] = useState<string[]>(WORKOUT.exercises.map(() => ''));
  // D3: «otra máquina o recorrido» por ejercicio.
  const [referencias, setReferencias] = useState<boolean[]>([]);
  // D2: «¿qué te ha parado?» — aquí se pregunta en los dos primeros ejercicios.
  const [quePararon, setQuePararon] = useState<(string | undefined)[]>([]);
  // D5 y D4: molestia por ejercicio y cómo llega hoy.
  const [molestias, setMolestias] = useState<(number | undefined)[]>([]);
  const [comoLlega, setComoLlega] = useState<WorkoutLog['comoLlega']>(undefined);
  // D6: el diálogo de fin de sesión y el cansancio contestado en él.
  const [celebracion, setCelebracion] = useState<SessionCelebration | null>(null);
  const [cansancio, setCansancio] = useState<number | undefined>(undefined);
  const guardadas = WORKOUT.exercises.map((we, i) => ({
    nombre: EJERCICIOS.find(e => e.id === we.exerciseId)?.name ?? we.exerciseId,
    series: seriesHechas<SetInput>(sets[i] || []).map(s => serieConFuera(filaASerie(s), fuera)),
  })).filter(e => e.series.length > 0);
  const terminar = () => {
    const todas = guardadas.flatMap(e => e.series);
    setCansancio(undefined);
    setCelebracion({
      isFirstEver: false, totalSets: todas.length, prs: [], durationSeg: 52 * 60,
      tonnage: todas.reduce((t, s) => t + s.weight * s.repsDone, 0),
    });
  };
  /** Vuelve a abrir la sesión de cero, como al pulsar «Empezar» en Rutinas. */
  const reiniciar = (marcadaEnElPanel = marcadas.includes('dev')) => {
    const arranca = fueraAlAbrir(true, marcadaEnElPanel);
    setSets(setsIniciales(arranca));
    setFuera(arranca);
    setNotas(WORKOUT.exercises.map(() => ''));
    setReferencias([]); setQuePararon([]); setMolestias([]); setComoLlega(undefined);
    setCelebracion(null); setCansancio(undefined);
  };
  const assignment: WorkoutAssignment = { id: 'dev', workoutId: 'w', athleteId: 'dev@example.com', date: HOY, status: 'pending' };

  return (
    <div className="min-h-screen bg-bg px-4 py-6">
      <div className="mb-4 rounded-surface border border-dashed border-accent-line bg-surface p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-caption font-bold uppercase tracking-wide text-accent-ink">Banco de pruebas · sesión</p>
          <button type="button" onClick={() => reiniciar()} className="font-mono text-caption font-bold uppercase tracking-wide text-ink-2 hover:text-accent-ink">Reiniciar</button>
        </div>
        <SegmentedControl
          label="Cómo se pregunta «¿cómo llegas hoy?»"
          value={varianteComoLlega}
          onChange={v => { setVarianteComoLlega(v as VarianteComoLlega); setComoLlega(undefined); }}
          options={VARIANTES_COMO_LLEGA.map(v => ({ value: v.clave, label: v.etiqueta }))}
          className="w-full"
        />
        <p className="font-sans text-caption text-ink-2">{VARIANTES_COMO_LLEGA.find(v => v.clave === varianteComoLlega)?.explicacion}</p>
        <p className="font-sans text-caption text-ink-2">
          Abajo, el panel de Rutinas: marcar o desmarcar «Torso de prueba» vuelve a abrir la sesión como si la empezaras desde allí.
        </p>
      </div>
      <div className="mb-4">
        <SesionesFueraDeLaSemana
          sesiones={SESIONES_DEL_PANEL}
          marcadas={marcadas}
          onAlternar={id => {
            const nuevas = alternarSesionFuera(marcadas, id);
            setMarcadas(nuevas);
            if (id === 'dev') reiniciar(nuevas.includes('dev'));
          }}
        />
      </div>
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
        referenciasNuevas={referencias}
        marcarReferenciaNueva={(exIdx, marcada) => setReferencias(prev => { const n = [...prev]; n[exIdx] = marcada; return n; })}
        quePararon={quePararon}
        marcarQueParo={(exIdx, motivo) => setQuePararon(prev => { const n = [...prev]; n[exIdx] = motivo; return n; })}
        preguntarQueParo={[true, true, false]}
        molestias={molestias}
        marcarMolestia={(exIdx, v) => setMolestias(prev => { const n = [...prev]; n[exIdx] = v; return n; })}
        comoLlega={comoLlega}
        onComoLlega={valor => setComoLlega(valor)}
        varianteComoLlega={varianteComoLlega}
        getExercise={id => EJERCICIOS.find(e => e.id === id)}
        getPersonalNote={() => undefined}
        logs={LOGS}
        exerciseProgressById={new Map()}
        handleFinish={terminar}
        isFinishing={false}
        canFinish={sets.some(ex => ex.some(s => s.done))}
        sessionStartedAt={null}
        celebration={celebracion}
        dismissCelebration={() => setCelebracion(null)}
        cerrarPlayer={() => {}}
        sameDayCardio={null}
        onMarkActionDone={() => {}}
        cansancioAlSalir={cansancio}
        onCansancioAlSalir={setCansancio}
        fuera={fuera}
      />

      {/* Lo que se guardaría: para comprobar `rirApuntado` (D1b) y el cansancio (D6). */}
      <div className="mt-6 rounded-surface border border-dashed border-hairline bg-surface p-3 space-y-1.5">
        <p className="font-mono text-caption font-bold uppercase tracking-wide text-ink-2">Lo que se guardaría</p>
        {guardadas.length === 0 && <p className="font-sans text-caption text-ink-3">Marca alguna serie para verlo.</p>}
        {guardadas.map(e => (
          <p key={e.nombre} className="font-sans text-caption text-ink-2">
            <span className="font-bold text-ink">{e.nombre}: </span>
            {e.series.map((s, i) => (
              <span key={i} className="whitespace-nowrap">
                {i > 0 && ' · '}
                {s.weight}×{s.repsDone} {s.alFallo ? 'FALLO' : `RIR ${s.rir}`}{' '}
                <span className={s.rirApuntado ? 'text-success' : 'text-ink-3'}>({s.segmento ? 'bajada' : s.rirApuntado ? 'apuntado' : 'sin apuntar'}{s.fuera ? ', fuera' : ''})</span>
              </span>
            ))}
          </p>
        ))}
        <p className="font-sans text-caption text-ink-2">
          <span className="font-bold text-ink">Cansancio al salir: </span>
          {cansancio != null ? `${cansancio} de 10` : 'sin contestar'}
          {celebracion?.durationSeg != null && ` · duración de ejemplo ${formatearDuracion(celebracion.durationSeg)}`}
        </p>
      </div>
    </div>
  );
}

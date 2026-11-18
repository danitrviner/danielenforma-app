import React, { useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  BodyMeasurement, BodyMetricKey, Exercise, Mesocycle, Questionnaire, QuestionnaireAssignment, UserProfile,
  Workout, WorkoutAssignment, WorkoutLog,
} from '../types';
import { presetPorTitulo, buildQuestionnaireFromPreset } from '../data/questionnairePresets';
import { bodyMeasurementsForAthleteKey } from '../hooks/useBodyMeasurements';
import { esPreguntaPorEjercicio } from '../utils/cierrePorEjercicio';
import { pasosDeCuestionario } from '../utils/pasosDeCuestionario';
import { ESPERA_PARA_DESHACER_MS, type MotivoDeSalto } from '../utils/saltarSesion';
import QuestionnaireWizard, { idComentario, type BorradorDeCuestionario } from './QuestionnaireWizard';
import SaltarSesion, { SesionSaltada } from './SaltarSesion';
import TrainingScreen from './TrainingScreen';
import { Badge, Button, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de la tanda del atleta del 17-11 — ruta `/dev/cierre-atleta`,
   solo en desarrollo (podado en producción, ver App.tsx).

     1. Cierre de bloque por ejercicio: el asistente REAL con la plantilla
        «Cierre de bloque», abierto en la pregunta nueva, en sus dos versiones
        (filas y tarjetas). Debajo, lo que se guardaría.
     2. «Mídete igual»: el asistente real con «Mediciones del bloque» y unas
        medidas de hace un mes para que haya con qué comparar.
     3. «No voy a poder hacerla»: una tarjeta calcada de Rutinas, en sus dos
        versiones (hoja y en línea), con la espera para deshacer.
     4. La pantalla REAL de Rutinas con tres sesiones sembradas. Aquí el
        guardado sí se intenta y, sin sesión, falla: sirve para ver el camino
        de error (la sesión vuelve a pendiente y sale el aviso).

   Todo vive en una caché de react-query sembrada a mano (`staleTime:
   Infinity`): nada sale hacia Firestore y nada de lo que se toque se guarda.
   No pulses «Enviar respuesta»: sin sesión, el envío falla.
   ═══════════════════════════════════════════════════════════════════════════ */

const EMAIL = 'dev.atleta@example.com';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

// ── Datos inventados ─────────────────────────────────────────────────────────
const EJERCICIOS = [
  { id: 'ex_sent', name: 'Sentadilla trasera', muscleGroup: 'cuadriceps' },
  { id: 'ex_press', name: 'Press banca', muscleGroup: 'pecho' },
  { id: 'ex_remo', name: 'Remo en polea baja', muscleGroup: 'dorsal' },
  { id: 'ex_militar', name: 'Press militar con mancuernas', muscleGroup: 'deltoide_ant' },
  { id: 'ex_curl', name: 'Curl en polea', muscleGroup: 'biceps' },
  { id: 'ex_ext', name: 'Extensión de tríceps en polea alta con cuerda', muscleGroup: 'triceps' },
  { id: 'ex_fem', name: 'Curl femoral tumbado', muscleGroup: 'isquios' },
  { id: 'ex_elev', name: 'Elevaciones laterales', muscleGroup: 'deltoide_lat' },
] as unknown as Exercise[];

const MESO = { id: 'meso_dev', athleteId: EMAIL, number: 3, weeks: 4, startDate: haceDias(24) } as unknown as Mesocycle;

const serie = { weight: 60, repsDone: 8, rir: 2 };
const sesion = (dias: number, ids: string[]): WorkoutLog => ({
  id: `log_${dias}`, athleteId: EMAIL, workoutId: 'w', assignmentId: `a_${dias}`, mesocycleId: MESO.id,
  date: haceDias(dias), completedAt: '', entries: ids.map(exerciseId => ({ exerciseId, sets: [serie, serie] })),
}) as unknown as WorkoutLog;
const LOGS: WorkoutLog[] = [
  sesion(23, ['ex_sent', 'ex_fem', 'ex_press', 'ex_remo']),
  sesion(21, ['ex_militar', 'ex_curl', 'ex_ext', 'ex_elev']),
  sesion(16, ['ex_sent', 'ex_fem', 'ex_press', 'ex_remo']),
  sesion(14, ['ex_militar', 'ex_curl', 'ex_ext']),
  sesion(9, ['ex_sent', 'ex_press', 'ex_remo']),
  sesion(2, ['ex_sent', 'ex_fem', 'ex_press', 'ex_remo']),
];

const medida = (metricKey: BodyMetricKey, value: number): BodyMeasurement => ({
  id: `m_${metricKey}`, athleteId: EMAIL, date: haceDias(28), metricKey, value, unit: 'cm',
  source: 'questionnaire', createdAt: '',
}) as BodyMeasurement;
const MEDIDAS: BodyMeasurement[] = [
  medida('pecho', 101), medida('cintura', 82), medida('abdomen', 85.5), medida('cadera', 97),
  medida('biceps_der_relajado', 34.5), medida('biceps_der_contraido', 38), medida('muslo_der_relajado', 58),
];

// Rutinas: una sesión atrasada, la de hoy y una futura, sin mesociclo.
const PERFIL = { userId: 'dev', email: EMAIL, displayName: 'Marcos Dev', role: 'client' } as unknown as UserProfile;
const rutina = (id: string, name: string, ids: string[]): Workout => ({
  id, ownerId: 'coach', name,
  exercises: ids.map((exerciseId, order) => ({ exerciseId, order, sets: 3, reps: '8-10', rir: 2, rest: 120 })),
}) as unknown as Workout;
const RUTINAS = [
  rutina('w_torso', 'Torso A', ['ex_press', 'ex_remo', 'ex_militar', 'ex_curl']),
  rutina('w_pierna', 'Pierna A', ['ex_sent', 'ex_fem']),
];
const SESIONES: WorkoutAssignment[] = [
  { id: 'wa_ayer', workoutId: 'w_pierna', athleteId: EMAIL, date: haceDias(1), status: 'pending' },
  { id: 'wa_hoy', workoutId: 'w_torso', athleteId: EMAIL, date: haceDias(0), status: 'pending', note: 'Hoy la última serie de press va al fallo: apunta las reps.' },
  { id: 'wa_futura', workoutId: 'w_pierna', athleteId: EMAIL, date: haceDias(-2), status: 'pending' },
];

const deOficial = (titulo: string, id: string): Questionnaire => ({ ...buildQuestionnaireFromPreset(presetPorTitulo(titulo)!, 'coach'), id });
// Fuera de los componentes: cada instancia saca ids de pregunta nuevos, y un
// refresco en caliente dentro de un `useMemo` dejaría el borrador apuntando a
// los ids viejos.
const Q_CIERRE = deOficial('Cierre de bloque', 'q_cierre');
const Q_MEDIDAS = deOficial('Mediciones del bloque', 'q_medidas');
const asignacion = (q: Questionnaire): QuestionnaireAssignment => ({
  id: `as_${q.id}`, questionnaireId: q.id, athleteId: EMAIL, schedule: { type: 'once' }, startDate: haceDias(0), active: true, createdAt: haceDias(1),
});

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-title-m font-black uppercase tracking-tight text-ink">{titulo}</h2>
        {nota && <p className="font-sans text-caption text-ink-3 text-pretty">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

// ── 1. Cierre por ejercicio ──────────────────────────────────────────────────
function CierrePorEjercicio() {
  const cierre = Q_CIERRE;
  const [borrador, setBorrador] = useState<BorradorDeCuestionario | null>(null);
  const pregunta = cierre.questions.find(esPreguntaPorEjercicio)!;
  // Se abre directamente en la pantalla de la pregunta nueva.
  const paso = pasosDeCuestionario(cierre.questions).findIndex(p => p.some(i => cierre.questions[i].id === pregunta.id));
  const inicial = useRef<BorradorDeCuestionario>({ answers: {}, stepIdx: paso });
  return (
    <Seccion titulo="Cierre por ejercicio" nota="El asistente real, abierto en la pregunta nueva. Los ejercicios salen de los registros sembrados del bloque. La siguiente pantalla es «¿Echas de menos algún ejercicio?».">
      <QuestionnaireWizard
          questionnaire={cierre}
          assignment={asignacion(cierre)}
          athleteEmail={EMAIL}
          borrador={borrador ?? inicial.current}
          onBorrador={setBorrador}
          onSubmitted={() => undefined}
          onCancel={() => undefined}
        />
      <div className="bg-raised border border-dashed border-hairline rounded-control p-3 space-y-1">
        <p className="font-mono text-caption uppercase tracking-[.14em] text-ink-4">Lo que se guardaría</p>
        <p className="font-mono text-caption text-ink-2 break-all">valor: {String(borrador?.answers[pregunta.id] ?? '—')}</p>
        <p className="font-sans text-caption text-ink-2">para el coach: {String(borrador?.answers[idComentario(pregunta.id)] ?? '—')}</p>
      </div>
    </Seccion>
  );
}

// ── 2. Mídete igual ──────────────────────────────────────────────────────────
function Mediciones() {
  const mediciones = Q_MEDIDAS;
  // Cintura +0,6 (no medible), abdomen −1,5 (baja); el pecho se deja sin escribir.
  const id = (clave: BodyMetricKey) => mediciones.questions.find(q => q.metricKey === clave)!.id;
  const inicial = useRef<BorradorDeCuestionario>({ answers: { [id('cintura')]: 82.6, [id('abdomen')]: 84 }, stepIdx: 0 });
  return (
    <Seccion titulo="Mídete igual" nota="Medidas de hace un mes sembradas (cintura 82, abdomen 85,5, bíceps contraído 38). Prueba 38,4 y 38,5 en el bíceps: el brazo cambia a partir de 0,5 cm; el resto, de 1 cm.">
      <QuestionnaireWizard
        questionnaire={mediciones}
        assignment={asignacion(mediciones)}
        athleteEmail={EMAIL}
        borrador={inicial.current}
        onSubmitted={() => undefined}
        onCancel={() => undefined}
      />
    </Seccion>
  );
}

// ── 3. Saltar sesión ─────────────────────────────────────────────────────────
/** La tarjeta de «hoy» de Rutinas, calcada de TrainingScreen, con la acción nueva. */
function TarjetaDeSesion() {
  const [saltada, setSaltada] = useState<MotivoDeSalto | null>(null);
  const [enEspera, setEnEspera] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);
  const saltar = (m: MotivoDeSalto) => {
    setSaltada(m);
    setEnEspera(true);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setEnEspera(false), ESPERA_PARA_DESHACER_MS);
  };
  const deshacer = () => { window.clearTimeout(temporizador.current); setSaltada(null); setEnEspera(false); };
  return (
    <div className={`border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${saltada ? 'rounded-surface bg-surface border-hairline' : 'protagonista rounded-canvas bg-accent-bg border-accent/50 shadow-glow'}`}>
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-surface flex items-center justify-center flex-shrink-0 ${saltada ? 'bg-raised text-ink-2' : 'bg-accent/15 text-accent-ink'}`}>
          <Icon name={saltada ? 'skip_next' : 'bolt'} size="m" filled />
        </div>
        <div>
          <p className="font-sans font-bold text-ink text-title-s">Torso A</p>
          <p className="font-mono text-label text-ink-2">Hoy · 6 ejercicios</p>
          {!saltada && <div className="mt-1.5"><SaltarSesion sesion="Torso A" onSaltar={saltar} /></div>}
          {saltada && enEspera && <div className="mt-1.5"><SesionSaltada motivo={saltada} onDeshacer={deshacer} /></div>}
          {saltada && !enEspera && (
            <button type="button" onClick={deshacer} className="mt-1.5 inline-flex items-center gap-1 font-sans text-caption text-ink-4 underline underline-offset-2 hover:text-ink-2">
              Al final sí la hago
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 self-end md:self-auto">
        <Badge tone={saltada ? 'neutral' : 'accent'}>{saltada ? 'Saltado' : 'Hoy'}</Badge>
        {!saltada && <Button variant="primary" size="s" icon="play_circle">Empezar</Button>}
      </div>
    </div>
  );
}

function SaltarLaSesion() {
  return (
    <Seccion titulo="No voy a poder hacerla" nota={`Tras elegir motivo hay ${ESPERA_PARA_DESHACER_MS / 1000} s para deshacer; después solo queda «Al final sí la hago» (aquí, en el banco, te devuelve al principio).`}>
      <TarjetaDeSesion />
    </Seccion>
  );
}

// ── 4. La pantalla real ──────────────────────────────────────────────────────
function RutinasReal() {
  return (
    <Seccion titulo="Rutinas (pantalla real)" nota="Sin sesión iniciada, el guardado falla a los 6 s: la tarjeta vuelve a pendiente y sale el aviso. Con sesión, se queda como saltada.">
      <TrainingScreen profile={PERFIL} />
    </Seccion>
  );
}

export default function CierreAtletaDevHarness() {
  const queryClient = useMemo(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnMount: false, refetchOnWindowFocus: false } } });
    qc.setQueryData(bodyMeasurementsForAthleteKey(EMAIL), MEDIDAS);
    qc.setQueryData(['workoutLogs', EMAIL], LOGS);
    qc.setQueryData(['exercises'], EJERCICIOS);
    qc.setQueryData(['mesocycles', EMAIL], [MESO]);
    qc.setQueryData(['workoutAssignmentsForAthlete', PERFIL.userId], SESIONES);
    qc.setQueryData(['workoutsByIds', ['w_pierna', 'w_torso']], RUTINAS);
    qc.setQueryData(['exerciseNotesForAthlete', EMAIL], []);
    qc.setQueryData(['cardioAssignments', EMAIL], []);
    return qc;
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-bg text-ink">
        <div className="mx-auto max-w-xl px-4 py-6 space-y-10">
          <header>
            <p className="font-mono text-caption uppercase tracking-[.14em] text-accent-ink">Banco de pruebas</p>
            <h1 className="font-display text-hero font-black tracking-tight text-ink uppercase">Cierre, medidas y saltar</h1>
          </header>
          <CierrePorEjercicio />
          <Mediciones />
          <SaltarLaSesion />
          <RutinasReal />
        </div>
      </div>
    </QueryClientProvider>
  );
}

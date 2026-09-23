import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  UserProfile, Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, WorkoutLog,
  ProgressPhoto, BodyweightLog, NutritionProgram, Diet, OnboardingData,
  WeightCheckIn, Questionnaire, QuestionnaireResponse, StepLog, WeeklyChallenge,
  BodyMeasurement, BodyMetricKey, CardioSession, Workout, MUSCLE_ORDER,
} from '../types';
import { bodyweightForAthleteKey, pesoPrimeroKey, pesoUltimoKey } from '../hooks/useAthleteWeight';
import { VOLUME_LANDMARKS_DEFAULT } from '../data/volumeLandmarks';
import { isoWeekKey, isoWeekBounds } from '../utils/challengeOptions';
import ClientRevisionPanel from './revision/ClientRevisionPanel';
import ConfirmarObjetivosSheet from './ConfirmarObjetivosSheet';
import ClientImplantacionPanel from './implantacion/ClientImplantacionPanel';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de Cliente › Revisión — ruta `/dev/revision-coach`, solo en
   desarrollo (podado en producción, ver App.tsx).

   Ojo con el nombre: `/dev/revision` (sin sufijo) es el del ATLETA
   (RevisionDevHarness → CheckInScreen, «Perfil › Revisión»). Son dos pantallas
   distintas con el mismo nombre en castellano, y por eso este lleva `-coach`.

   Este repo no tiene sesión de coach —`isCoach()` está clavado al correo real
   de Dani en firestore.rules—, así que esta es la única forma de ver la
   pantalla en el navegador. Todo se sirve por props o desde la caché de
   react-query con `staleTime: Infinity`: ninguna consulta sale hacia Firestore.

   El fixture no es decorativo, ejercita los casos que el motor tiene que
   resolver bien: un bloque EN CURSO (para que la normalización por semanas
   transcurridas se vea), un grupo prioritario al que no se le está dando
   volumen, un ejercicio que se estrena (no debe salir como «el que más sube»)
   y otro que baja.
   ═══════════════════════════════════════════════════════════════════════════ */

const EMAIL = 'dev.coach@example.com';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function haceDias(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); }

const PERFIL: UserProfile = {
  userId: 'dev-coach-athlete', email: EMAIL, displayName: 'Gonzalo Dev', role: 'client',
  avatarUrl: '', initialWeight: 84.2, targetWeight: 78, actualWeight: 80.4,
} as UserProfile;

// ── Ejercicios ──────────────────────────────────────────────────────────────
function ej(id: string, name: string, muscleGroup: MuscleGroup, secundarios?: MuscleGroup[]): Exercise {
  return { id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, secondaryMuscleGroups: secundarios, type: 'fuerza' } as Exercise;
}

const EJERCICIOS: Exercise[] = [
  ej('press_banca', 'Press banca', 'pecho', ['triceps', 'deltoide_ant']),
  ej('press_inclinado', 'Press inclinado mancuernas', 'pecho', ['deltoide_ant']),
  ej('remo_barra', 'Remo con barra', 'dorsal', ['biceps']),
  ej('jalon', 'Jalón al pecho', 'dorsal', ['biceps']),
  ej('elevaciones', 'Elevaciones laterales', 'deltoide_lat'),
  ej('curl_polea', 'Curl en polea', 'biceps'),
  ej('frances', 'Press francés', 'triceps'),
  ej('sentadilla', 'Sentadilla', 'cuadriceps', ['gluteo']),
  ej('peso_muerto_rumano', 'Peso muerto rumano', 'isquios', ['gluteo', 'lumbares']),
  ej('plancha', 'Plancha', 'core'),
];

// ── Mesociclos ──────────────────────────────────────────────────────────────
function groups(parcial: Partial<Record<MuscleGroup, MuscleGroupConfig>>): Record<MuscleGroup, MuscleGroupConfig> {
  const base = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const g of MUSCLE_ORDER) base[g] = { series: 0, priority: 'baja' };
  return { ...base, ...parcial } as Record<MuscleGroup, MuscleGroupConfig>;
}

const MESO_ACTUAL: Mesocycle = {
  id: 'meso_2', athleteId: EMAIL, number: 2, name: 'Hipertrofia otoño',
  weeks: 5, startDate: haceDias(16), objective: 'Hipertrofia', daysPerWeek: 4,
  groups: groups({
    pecho:         { series: 12, priority: 'alta' },
    dorsal:        { series: 16, priority: 'alta' },
    deltoide_lat:  { series: 12, priority: 'alta' },
    // Programado y con prioridad alta, pero SIN NI UNA serie registrada: es el
    // caso que el mapa de calor tiene que cazar y subir a lo más visible.
    deltoide_post: { series: 10, priority: 'alta' },
    biceps:        { series: 8,  priority: 'media' },
    triceps:       { series: 8,  priority: 'media' },
    cuadriceps:    { series: 10, priority: 'media' },
    isquios:       { series: 8,  priority: 'media' },
    core:          { series: 6,  priority: 'baja' },
  }),
} as Mesocycle;

const MESO_ANTERIOR: Mesocycle = {
  id: 'meso_1', athleteId: EMAIL, number: 1, name: 'Adaptación',
  weeks: 5, startDate: haceDias(51), objective: 'Adaptación anatómica', daysPerWeek: 4,
  groups: groups({
    pecho: { series: 10, priority: 'media' }, dorsal: { series: 12, priority: 'alta' },
    deltoide_lat: { series: 9, priority: 'media' }, biceps: { series: 6, priority: 'baja' },
    triceps: { series: 6, priority: 'baja' }, cuadriceps: { series: 9, priority: 'media' },
    isquios: { series: 6, priority: 'media' }, core: { series: 6, priority: 'baja' },
  }),
} as Mesocycle;

// ── Logs ────────────────────────────────────────────────────────────────────
let contador = 0;
function log(dias: number, entries: { id: string; series: [number, number][]; rir?: number }[]): WorkoutLog {
  const date = haceDias(dias);
  return {
    id: `log_${contador++}`, athleteId: EMAIL, workoutId: 'w', assignmentId: 'as',
    mesocycleId: dias <= 16 ? 'meso_2' : 'meso_1',
    date, completedAt: `${date}T18:30:00.000Z`,
    entries: entries.map(e => ({
      exerciseId: e.id,
      sets: e.series.map(([weight, repsDone]) => ({ weight, repsDone, rir: e.rir ?? 2 })),
    })),
  };
}

/** Una sesión de torso y otra de pierna por «semana», con la carga que se le pase. */
function semana(diaBase: number, carga: number, extra: number): WorkoutLog[] {
  return [
    log(diaBase, [
      { id: 'press_banca', series: [[carga, 8], [carga, 8], [carga, 7]] },
      { id: 'remo_barra', series: [[carga + 10, 9], [carga + 10, 9], [carga + 10, 8]] },
      { id: 'elevaciones', series: [[12 + extra, 14], [12 + extra, 13], [12 + extra, 12]] },
    ]),
    log(diaBase - 2, [
      { id: 'jalon', series: [[55 + extra, 10], [55 + extra, 10], [55 + extra, 9]] },
      { id: 'curl_polea', series: [[26 + extra, 12], [26 + extra, 11]] },
      { id: 'frances', series: [[30 + extra, 12], [30 + extra, 11]] },
    ]),
    log(diaBase - 4, [
      { id: 'sentadilla', series: [[80 + extra * 2, 8], [80 + extra * 2, 8], [80 + extra * 2, 7]] },
      // El rumano BAJA de carga a lo largo del bloque: tiene que aparecer en
      // «va a menos», no perderse entre los que suben.
      { id: 'peso_muerto_rumano', series: [[95 - extra, 10], [95 - extra, 10]] },
      { id: 'plancha', series: [[0, 60], [0, 55]] },
    ]),
  ];
}

const LOGS: WorkoutLog[] = [
  // Bloque anterior (terminado): cargas más bajas, para que haya con qué comparar.
  ...semana(48, 60, 0), ...semana(41, 60, 1), ...semana(34, 62, 1),
  ...semana(27, 62, 2), ...semana(20, 64, 2),
  // Bloque actual, en curso: dos semanas y pico.
  ...semana(14, 66, 3), ...semana(7, 70, 4),
  // Un ejercicio que se ESTRENA hoy: no debe salir como «el que más sube».
  log(1, [{ id: 'press_inclinado', series: [[28, 10], [28, 10], [28, 9]] }]),
];

/**
 * Un ejercicio y un log por grupo muscular, con un número de series creciente
 * para que el mapa recorra las cinco zonas de volumen a la vez. Solo lo usa
 * `?anatomia=1`: no es una vista de datos, es para juzgar el dibujo.
 */
const EJERCICIOS_ANATOMIA: Exercise[] = MUSCLE_ORDER.map(g => ej(`anat_${g}`, `Anat ${g}`, g));

const LOGS_ANATOMIA: WorkoutLog[] = MUSCLE_ORDER.map((g, i) => {
  // 2, 5, 9, 14 y 22 series: MEV → productivo → MAV → MRV.
  const series = [2, 5, 9, 14, 22][i % 5];
  return log(3, [{ id: `anat_${g}`, series: Array.from({ length: series }, () => [40, 10] as [number, number]) }]);
});

// ── Cuerpo ──────────────────────────────────────────────────────────────────
// Peso bajando de 84,2 a 80,4 en 16 semanas, que es lo que la periodización
// dice que debería pasar. Sin esto el dashboard de peso no tiene qué pintar.
const PESOS: BodyweightLog[] = Array.from({ length: 17 }, (_, i) => {
  const date = haceDias((16 - i) * 7);
  return {
    id: `bw_${i}`, athleteId: EMAIL, date,
    weight: Math.round((84.2 - i * 0.24) * 10) / 10,
    createdAt: `${date}T07:00:00.000Z`,
  };
});

const FOTOS: ProgressPhoto[] = [0, 28, 56, 84].flatMap(d =>
  (['front', 'side', 'back'] as const).map(view => {
    const date = haceDias(d);
    return {
      id: `${EMAIL}_${date}_${view}`, athleteId: EMAIL, date, view,
      // Placeholder gris: el harness no sube nada a Storage.
      url: `https://placehold.co/400x560/1a1a1a/555?text=${view}+${date}`,
      uploadedAt: `${date}T09:00:00.000Z`,
    };
  }),
);

/* Los cupos cuadran con las kcal de sus fases (2.050 y 2.500 más abajo): 21
   intercambios ≈ 2.100 kcal y 25 ≈ 2.500. Antes eran 40 y 45 —unas 4.000
   kcal— contra unas fases de 2.050: la dieta y su propia fase decían cosas
   distintas, y en cuanto la pantalla enseñó lo comido frente al cupo, todos
   los días salían sin excepción «por debajo». Un fixture incoherente hace que
   la pantalla parezca rota cuando la que está mal es la fixture. */
const DIETAS: Diet[] = [
  { id: 'd_deficit', athleteId: EMAIL, name: 'Déficit', budget: { HC: 10, PROT: 7, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 }, meals: [] },
  { id: 'd_mant', athleteId: EMAIL, name: 'Mantenimiento', budget: { HC: 12, PROT: 8, GRASA: 5, MIX_HC: 0, MIX_GRASA: 0 }, meals: [] },
];

/* ── Lo que ha comido ───────────────────────────────────────────────────────
   Diecisiete días de registro con los casos que el bloque tiene que resolver:
   días clavados, un día pasado de hidratos, otro corto, dos sin registrar, y
   alimentos que vienen de una receta y del menú semanal además de a mano.
   El cupo es el de la dieta de déficit (14/18/8), congelado en cada día como
   hace el registro de verdad desde 09-2026. */
const CUPO_DEFICIT = { HC: 10, PROT: 7, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 };

function comidaDelDia(
  id: string, nombre: string, slot: number,
  items: { cat: 'HC' | 'PROT' | 'GRASA' | 'MIX_HC'; label: string; q: number; receta?: boolean; menu?: boolean }[],
) {
  return {
    id, name: nombre, slot,
    items: items.map(i => ({
      category: i.cat, foodLabel: i.label, quantity: i.q,
      ...(i.receta ? { originRecipeId: 'r_dev' } : {}),
      ...(i.menu ? { origenMenu: `dia_${id}` } : {}),
    })),
  };
}

/**
 * Un día completo. El día base clava el cupo (10 HC / 7 PROT / 4 GRASA) y las
 * variantes lo mueven a propósito para que se vean los tres estados: un día
 * pasado de hidratos, uno corto de grasa y uno que se salta la merienda.
 */
function diaDeComida(hace: number, variante: number) {
  const arroz = variante % 5 === 0 ? 5 : 3;      // un día se pasa de hidratos
  const aceite = variante % 4 === 0 ? 1 : 2;     // y otro se queda corto de grasa
  const saltaMerienda = variante % 7 === 2;
  // Rota las tres piezas que en la vida real cambian de un día a otro: sin esto
  // los quince días son idénticos y «lo que más come» sale entero a quince días,
  // que no distingue nada. Con la rotación el pollo sale más que la ternera y el
  // arroz más que la patata, que es justo lo que ese listado tiene que contar.
  const proteinaComida = ['100g pechuga de pollo', '100g pechuga de pollo', '100g ternera magra', '120g salmón'][variante % 4];
  const hidratoCena = ['150g patata (cruda o cocida)', '150g patata (cruda o cocida)', '120g boniato'][variante % 3];
  const proteinaCena = ['120g merluza', '120g merluza', '120g gambas', '2 huevos'][variante % 4];
  const fruta = ['230g paraguayo o melocotón', '150g plátano', '230g paraguayo o melocotón', '200g fresas'][variante % 4];
  const meals = [
    comidaDelDia('m1', 'Desayuno', 1, [
      { cat: 'HC', label: '40g pan (de molde, tostado, con o sin semillas...)', q: 2 },
      { cat: 'PROT', label: '2 claras y 1 huevo entero', q: 2 },
      { cat: 'MIX_HC', label: '200g yogur natural', q: 1 },
    ]),
    comidaDelDia('m2', 'Comida', 3, [
      { cat: 'HC', label: '30g arroz, pasta, couscous o quinoa', q: arroz },
      { cat: 'PROT', label: proteinaComida, q: 2, receta: true },
      { cat: 'GRASA', label: '11g aceite de oliva', q: aceite },
    ]),
    ...(saltaMerienda ? [] : [comidaDelDia('m3', 'Merienda', 4, [
      { cat: 'HC', label: fruta, q: 1.5 },
      { cat: 'PROT', label: '30g proteína en polvo', q: 1 },
    ])]),
    comidaDelDia('m4', 'Cena', 5, [
      { cat: 'PROT', label: proteinaCena, q: 1.5, menu: true },
      { cat: 'GRASA', label: '25g aguacate', q: 2, menu: true },
      { cat: 'HC', label: hidratoCena, q: 3 },
    ]),
  ];
  // Casi todo marcado, como en la vida real; un día deja la cena sin marcar
  // para que se vea la diferencia entre lo puesto y lo comido.
  const marcados: string[] = [];
  for (const m of meals) {
    if (variante % 6 === 3 && m.id === 'm4') continue;
    m.items.forEach((_, i) => marcados.push(`${m.id}_${i}`));
  }
  return {
    id: `log_${hace}`, athleteId: EMAIL, date: haceDias(hace), dietId: 'd_deficit',
    doneItemIds: marcados, budget: CUPO_DEFICIT, meals,
    updatedAt: `${haceDias(hace)}T21:30:00.000Z`,
  };
}

// Dos huecos a propósito (hace 4 y hace 9 días): un hueco es información.
const REGISTROS_DE_COMIDA = Array.from({ length: 17 }, (_, i) => i)
  .filter(hace => hace !== 4 && hace !== 9)
  .map((hace, idx) => diaDeComida(hace, idx));

const PROGRAMA: NutritionProgram = {
  athleteId: EMAIL,
  startDate: haceDias(112),
  phases: [
    { id: 'f1', name: 'Déficit inicial', weeks: 8, dietId: 'd_deficit', targetKcal: 2100 },
    { id: 'f2', name: 'Mantenimiento', weeks: 4, dietId: 'd_mant', targetKcal: 2500 },
    { id: 'f3', name: 'Segundo déficit', weeks: 8, dietId: 'd_deficit', targetKcal: 2050, targetWeight: 78 },
  ],
};

const ALTA: Partial<OnboardingData> = {
  athleteId: EMAIL, sex: 'male', birthDate: '1994-05-02',
  weightKg: 84.2, heightCm: 178, activityLevel: 'activo', goalBody: 'reducir_grasa',
  // El objetivo contra el que «Adherencia y hábitos» compara la dieta puesta.
  // Está a propósito por encima del cupo de déficit (10/7/4 = 250/175/44 g):
  // así la fila de macros sale con desviación y se ve el color, que es lo que
  // hay que poder juzgar aquí.
  targetCalories: 2450,
  macroSplit: { hc: 45, prot: 30, grasa: 25 },
  macroGrams: { hc: 276, prot: 184, grasa: 68 },
};

// Pasos de los últimos 17 días contra un objetivo de 9.000: unos días lo pasa y
// otros se queda corto, para que el porcentaje medio no salga ni 0 ni 100.
const PASOS: StepLog[] = Array.from({ length: 17 }, (_, i) => {
  const date = haceDias(i + 1);
  return {
    id: `pasos_${i}`, athleteId: EMAIL, date,
    steps: [11200, 8400, 9600, 6100, 10300, 9000, 4800][i % 7],
    source: 'manual' as const, createdAt: `${date}T22:00:00.000Z`,
  };
});

// Seis semanas de retos: cuatro cerrados (tres ganados y uno fallado, para que
// la tasa de acierto no salga ni 0 % ni 100 %) y el de la semana en curso a
// medias. Las claves ISO se calculan con la misma función que usa la app para
// que el bloque encuentre «el de esta semana» por la vía normal.
const RETOS: WeeklyChallenge[] = [5, 4, 3, 2, 1, 0].map((atras, i) => {
  const dia = haceDias(atras * 7);
  const { weekStart, weekEnd } = isoWeekBounds(dia);
  const enCurso = atras === 0;
  const fallado = atras === 3;
  return {
    id: `reto_${i}`, athleteId: EMAIL, isoWeek: isoWeekKey(dia), weekStart, weekEnd,
    kind: 'pasos_media' as const,
    title: `Media de ${8500 + atras * 100} pasos al día`,
    description: 'Sin contar el día de descanso.',
    origin: (atras === 0 ? 'coach' : 'auto') as 'coach' | 'auto',
    metric: { unit: 'pasos', target: 8500 + atras * 100 },
    status: (enCurso ? 'activo' : fallado ? 'fallido' : 'conseguido') as WeeklyChallenge['status'],
    createdAt: `${weekStart}T08:00:00.000Z`,
    ...(enCurso ? {} : { resolvedAt: `${weekEnd}T23:00:00.000Z` }),
  };
});

// Cuatro tomas de perímetros, una al mes. Incluye cuello, cintura y altura —los
// tres que pide el %grasa US Navy— para que la ficha enseñe también la
// composición corporal y no solo la lista de centímetros. La cintura baja de
// verdad (94 → 88) y el brazo sube poco: uno cruza el margen de error de
// medición y el otro no, que son los dos casos que la ficha tiene que saber
// distinguir.
const MEDICIONES: BodyMeasurement[] = (() => {
  const tomas: [number, Partial<Record<BodyMetricKey, number>>][] = [
    [84, { cuello: 39.5, cintura: 94, altura: 178, biceps_der_relajado: 35.4, muslo_der_relajado: 58.5 }],
    [56, { cuello: 39.2, cintura: 92, altura: 178, biceps_der_relajado: 35.6, muslo_der_relajado: 58.8 }],
    [28, { cuello: 39.0, cintura: 90, altura: 178, biceps_der_relajado: 35.7, muslo_der_relajado: 59.0 }],
    [3,  { cuello: 38.8, cintura: 88, altura: 178, biceps_der_relajado: 35.9, muslo_der_relajado: 59.2 }],
  ];
  const out: BodyMeasurement[] = [];
  for (const [hace, valores] of tomas) {
    const date = haceDias(hace);
    for (const [metricKey, value] of Object.entries(valores)) {
      out.push({
        id: `med_${metricKey}_${hace}`, athleteId: EMAIL, date,
        metricKey: metricKey as BodyMetricKey, value: value!, unit: 'cm',
        source: 'questionnaire', createdAt: `${date}T19:00:00.000Z`,
      });
    }
  }
  return out;
})();

// Ocho semanas de cardio: dos sesiones por semana de zona 2 y una de
// intervalos, para que haya base crónica de verdad (el cociente de carga
// necesita seis semanas para significar algo) y para que el reparto por
// intensidad no salga todo en una sola zona.
const CARDIO: CardioSession[] = (() => {
  const out: CardioSession[] = [];
  for (let semana = 0; semana < 8; semana++) {
    for (const [dia, tipo] of [[1, 'zona2'], [4, 'zona2'], [6, 'intervalos']] as const) {
      const hace = semana * 7 + dia;
      const date = haceDias(hace);
      const duros = tipo === 'intervalos';
      out.push({
        id: `cardio_${semana}_${dia}`, athleteId: EMAIL, type: tipo, date,
        startedAt: `${date}T07:30:00.000Z`,
        durationSec: duros ? 1500 : 2700,
        avgHR: duros ? 158 : 132,
        maxHR: duros ? 179 : 148,
        timeInZoneSec: duros
          ? { z1: 180, z2: 300, z3: 420, z4: 480, z5: 120 }
          : { z1: 300, z2: 1800, z3: 600, z4: 0, z5: 0 },
        samples: [], sampleIntervalSec: 5,
        caloriesKcal: duros ? 320 : 430,
        trimp: duros ? 62 : 45,
        // El HRR solo se mide cuando el atleta graba la vuelta a la calma, así
        // que va únicamente en la última: es el caso real.
        ...(hace === 1 ? { hrr1Min: 27 } : {}),
      } as CardioSession);
    }
  }
  return out;
})();

// Las cuatro sesiones del bloque en curso, una de ellas SIN ejercicios: es el
// caso que el repaso de «Antes de publicar» tiene que cazar, porque está hecho
// —la sesión existe y la checklist la da por buena— y el atleta se la encuentra
// en blanco.
const RUTINAS: Workout[] = [
  { id: 'w_1', ownerId: 'coach', name: 'Día 1 · Torso', mesocycleId: 'meso_2', dayIndex: 0,
    exercises: [{ exerciseId: 'press_banca', sets: 3 }, { exerciseId: 'remo_barra', sets: 3 }] },
  { id: 'w_2', ownerId: 'coach', name: 'Día 2 · Pierna', mesocycleId: 'meso_2', dayIndex: 1,
    exercises: [{ exerciseId: 'sentadilla', sets: 3 }, { exerciseId: 'peso_muerto_rumano', sets: 3 }] },
  { id: 'w_3', ownerId: 'coach', name: 'Día 3 · Empuje', mesocycleId: 'meso_2', dayIndex: 2,
    exercises: [{ exerciseId: 'press_inclinado', sets: 3 }] },
  { id: 'w_4', ownerId: 'coach', name: 'Día 4 · Tirón', mesocycleId: 'meso_2', dayIndex: 3,
    exercises: [] },
] as unknown as Workout[];

// ── Lo que el atleta manda ──────────────────────────────────────────────────
// Tres check-ins: uno contestado y aprobado, otro contestado sin aprobar y el
// último sin tocar. Así se ve la lista de pendientes con sus dos estados.
const CHECKINS: WeightCheckIn[] = [21, 14, 7].map((d, i) => ({
  id: `chk_${i}`, userId: 'dev-coach-athlete', email: EMAIL,
  timestamp: new Date(`${haceDias(d)}T18:00:00.000Z`), dateStr: haceDias(d),
  weight: [81.6, 81.0, 80.4][i], mood: ['😊', '😐', '🔥'][i],
  adherence: (['Sí', 'Parcial', 'Sí'] as const)[i],
  notes: [
    'Semana redonda, cero saltos de dieta.',
    'Comí fuera dos veces y el jueves no entrené, se me juntó todo.',
    'Muy bien, con energía de sobra. El press me subió solo.',
  ][i],
  coachFeedback: i === 0 ? 'Perfecto, seguimos igual.' : undefined,
  approved: i === 0,
}));

// Las `signalKey` no son decorado: son lo único que conecta una pregunta con
// los motores. Sin ellas, sueño/estrés/agujetas son texto suelto y el bloque
// «Cómo ha llegado» sale vacío por mucho que el atleta conteste.
const Q_SEMANAL: Questionnaire = {
  id: 'q_semanal', ownerId: 'coach', title: 'Revisión semanal',
  questions: [
    { id: 'q1', label: 'Horas de sueño al día', type: 'numeric', required: true, signalKey: 'wellness.sleep_hours_weekly' },
    { id: 'q2', label: 'Energía en los entrenos', type: 'scale', required: true, scaleMin: 1, scaleMax: 10 },
    { id: 'q3', label: 'Estrés fuera del gimnasio', type: 'scale', required: false, scaleMin: 1, scaleMax: 10, signalKey: 'wellness.stress_weekly' },
    { id: 'q4', label: 'Agujetas · Pecho', type: 'scale', required: false, scaleMin: 0, scaleMax: 10, signalKey: 'doms.pecho' },
    { id: 'q5', label: 'Agujetas · Dorsal', type: 'scale', required: false, scaleMin: 0, scaleMax: 10, signalKey: 'doms.dorsal' },
    { id: 'q6', label: 'Agujetas · Cuádriceps', type: 'scale', required: false, scaleMin: 0, scaleMax: 10, signalKey: 'doms.cuadriceps' },
  ],
};

// Cinco semanas de respuestas. El cuádriceps se queda clavado por encima del
// umbral de crónico (7-8/10) mientras pecho y dorsal bajan: es el caso que el
// bloque tiene que cazar —un grupo al que se le está dando más de lo que
// recupera— y el que explica por qué la sentadilla no sube.
const RESPUESTAS: QuestionnaireResponse[] = [35, 28, 21, 14, 7].map((d, i) => ({
  id: `r_${i}`, questionnaireId: 'q_semanal', assignmentId: 'as_semanal', athleteId: EMAIL,
  submittedAt: `${haceDias(d)}T19:12:00.000Z`,
  answers: [
    { questionId: 'q1', value: [6, 7, 7, 8, 8][i] },
    { questionId: 'q2', value: [5, 6, 7, 7, 9][i] },
    { questionId: 'q3', value: [8, 7, 6, 5, 4][i] },
    { questionId: 'q4', value: [7, 6, 5, 4, 3][i] },
    { questionId: 'q5', value: [5, 4, 4, 3, 3][i] },
    { questionId: 'q6', value: [7, 8, 8, 7, 8][i] },
  ],
}));

export default function RevisionCoachDevHarness() {
  // `?anatomia=1` enciende TODOS los grupos a la vez, en las cinco zonas de
  // volumen. No es una vista de datos: es para poder juzgar el DIBUJO —con el
  // fixture normal la mitad de los músculos están a cero y salen apagados, así
  // que no se ve si la lámina está bien hecha.
  const anatomia = new URLSearchParams(window.location.search).has('anatomia');
  // `?pantalla=implantacion` monta la otra pestaña con el mismo fixture.
  const pantalla = new URLSearchParams(window.location.search).get('pantalla');
  // `?renovar=1` adelanta el bloque para que termine dentro de tres días: es la
  // única forma de ver el modo renovación de Implantación sin esperar tres
  // semanas o falsear el reloj del sistema.
  const renovar = new URLSearchParams(window.location.search).has('renovar');
  // `?objetivo=volumen|deficit|…` marca el objetivo de la fase en curso; sin
  // él se ve el objetivo DEDUCIDO de las kcal; `ninguno` quita la periodización
  // entera para ver el selector desde cero.
  const objetivoParam = new URLSearchParams(window.location.search).get('objetivo');
  const mesoDeLaPantalla: Mesocycle = renovar
    ? { ...MESO_ACTUAL, startDate: haceDias(MESO_ACTUAL.weeks * 7 - 4) }
    : MESO_ACTUAL;

  const client = useMemo(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity, gcTime: Infinity, retry: false,
          refetchOnMount: false, refetchOnWindowFocus: false,
        },
      },
    });
    qc.setQueryData(['coachVolumeLandmarks'], VOLUME_LANDMARKS_DEFAULT);
    // Cuerpo. Todo sembrado a mano: ninguna consulta sale hacia Firestore.
    qc.setQueryData(bodyweightForAthleteKey(EMAIL), PESOS);
    qc.setQueryData(pesoPrimeroKey(EMAIL), PESOS[0]);
    qc.setQueryData(pesoUltimoKey(EMAIL), PESOS[PESOS.length - 1]);
    qc.setQueryData(['progressPhotos', EMAIL], FOTOS);
    qc.setQueryData(['bodyMeasurementsForAthlete', EMAIL], MEDICIONES);
    // El dashboard de peso vive de estas seis; `anatomia` las deja vacías para
    // ver también el estado sin periodización.
    // «Objetivos de los clientes» (?pantalla=objetivos): el simulacro sobre este programa.
    qc.setQueryData(['nutritionProgramsForAthletes', [EMAIL]], [PROGRAMA]);
    qc.setQueryData(['nutritionProgram', EMAIL], anatomia || objetivoParam === 'ninguno' ? null
      : objetivoParam ? { ...PROGRAMA, phases: PROGRAMA.phases.map((f, i) =>
          i === PROGRAMA.phases.length - 1 ? { ...f, objetivo: objetivoParam as NonNullable<typeof f.objetivo> } : f) }
      : PROGRAMA);
    qc.setQueryData(['dietsForAthlete', EMAIL], DIETAS);
    qc.setQueryData(['onboarding', EMAIL], ALTA);
    // El bloque «Qué ha comido» pide los registros ACOTADOS a la ventana, así
    // que la clave lleva el `desde`. Se siembran TODOS los `desde` de los
    // últimos noventa días con los mismos datos (el motor ya recorta por
    // fecha) en vez de las cuatro ventanas concretas del selector: en cuanto se
    // añadió «desde la última revisión», cuyo corte depende de los check-ins,
    // la lista fija se quedó corta y el bloque salía vacío con una consulta
    // real a Firestore por debajo. Noventa claves de caché no cuestan nada;
    // que el banco de pruebas mienta, sí.
    qc.setQueryData(['dietCompletionLogsForAthlete', EMAIL], REGISTROS_DE_COMIDA);
    for (let d = 0; d <= 90; d++) {
      qc.setQueryData(['dietCompletionLogsForAthlete', EMAIL, haceDias(d)], REGISTROS_DE_COMIDA);
    }
    // Gasto real: lee 16 semanas hasta ayer. Aquí sí hace falta historia larga
    // (6 de cada 7 días registrados) para que salga un gasto REAL y su evolución.
    qc.setQueryData(['dietCompletionLogsForAthlete', EMAIL, haceDias(1 + 11 * 7 + 28)],
      Array.from({ length: 112 }, (_, i) => i + 1).filter(h => h % 7 !== 3).map((h, idx) => diaDeComida(h, idx)));
    qc.setQueryData(['athleteNutritionConfig', EMAIL], { athleteId: EMAIL, enabledModes: ['OMNIVORO'], stepGoal: 9000 });
    qc.setQueryData(['athleteDietConfig', EMAIL], { athleteId: EMAIL, activeDietIds: ['d_deficit'] });
    qc.setQueryData(['stepsForAthlete', EMAIL], PASOS);
    // Retos y nivel. El roadmap va a null a propósito: así el bloque cae a la
    // escalera por defecto, que es lo que tiene la mayoría de los atletas.
    qc.setQueryData(['weeklyChallengesForAthlete', EMAIL], RETOS);
    qc.setQueryData(['cardioSessions', EMAIL], CARDIO);
    qc.setQueryData(['workouts'], RUTINAS);
    // Implantación.
    qc.setQueryData(['roadmap', EMAIL], null);
    // Dos recordatorios: uno vencido sobre un paso del montaje y una tarea
    // suelta para mañana, para ver los dos estados del aviso.
    qc.setQueryData(['coachClientTasks', EMAIL], [
      {
        id: `${EMAIL}_paso_2`, athleteId: EMAIL, itemId: 'paso_2',
        title: 'Sesiones', phase: 'entrenamiento', done: false,
        dueDate: haceDias(3), createdBy: 'seed', createdAt: haceDias(10),
      },
      {
        id: 'extra_1', athleteId: EMAIL, title: 'Llamarle para repasar la dieta',
        done: false, dueDate: haceDias(-1), createdBy: 'coach', createdAt: haceDias(2),
      },
    ]);
    return qc;
  }, [anatomia]);

  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="max-w-5xl mx-auto">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest mb-3">
            /dev/revision-coach — datos de mentira{anatomia ? ' · modo anatomía' : ''}
          </p>
          {pantalla === 'objetivos' ? (
            <ConfirmarObjetivosSheet open onClose={() => {}} athletes={[PERFIL]} />
          ) : pantalla === 'implantacion' ? (
            <ClientImplantacionPanel
              athlete={PERFIL}
              checkins={CHECKINS}
              onboarding={ALTA as never}
              mesocycles={[MESO_ANTERIOR, mesoDeLaPantalla]}
              workoutAssignments={[]}
              diets={DIETAS}
              dietConfig={null}
              nutritionConfig={null}
              qAssignments={[]}
              photoAssignments={[]}
              photos={FOTOS}
              workoutLogs={LOGS}
              onGoToTab={t => console.info('[harness] onGoToTab', t)}
              onAbrirEditor={t => console.info('[harness] onAbrirEditor', t)}
            />
          ) : (
          <ClientRevisionPanel
            athlete={PERFIL}
            logs={anatomia ? LOGS_ANATOMIA : LOGS}
            exercises={anatomia ? EJERCICIOS_ANATOMIA : EJERCICIOS}
            mesocycles={anatomia ? [] : [MESO_ANTERIOR, MESO_ACTUAL]}
            photos={FOTOS}
            bodyweightLogs={PESOS}
            sexo="hombre"
            checkins={CHECKINS}
            questionnaires={[Q_SEMANAL]}
            responses={RESPUESTAS}
            assignments={[]}
            onGoToTab={t => console.info('[harness] onGoToTab', t)}
          />
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}

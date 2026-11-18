import { describe, expect, it } from 'vitest';
import type {
  LecturaDeHipotesis, Mesocycle, MuscleGroup, MuscleGroupConfig, NutritionProgram, PalancaDeHipotesis, Workout, WorkoutExercise,
} from '../../types';
import { MUSCLE_ORDER } from '../../types';
import type { EstadoDeEjercicio, EstadoDelBloque } from './estadoDelBloqueAnterior';
import {
  diasDesdeRutinas, inicioDelSiguiente, lunesSiguiente, resumenDeTipo, siguienteBloque, ultimaSemanaNormal, zonasQuePide,
  type EntradaDeSiguienteBloque, type VeredictoParaClonar,
} from './siguienteBloque';

const grupos = (): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: 10, priority: 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;

/** El bloque que se cierra: 12 semanas desde el lunes 24-08 (acaba el domingo 15-11), pectoral y deltoides con estrella. */
const MESO: Mesocycle = {
  id: 'm2', athleteId: 'ana@x.com', number: 2, name: 'Hipertrofia 2', weeks: 12, startDate: '2026-08-24',
  objective: 'Desarrollo: pectoral y deltoides', daysPerWeek: 2, splitId: 'torso_pierna', cycleDays: 7,
  groups: grupos(), tipoBloque: 'desarrollo', cdgVelocidad: 'suave', phaseType: 'hipertrofia',
  semanasDescarga: [12], deloadWeek: 12, semanasPivot: [6], semanasTest: [11],
  notasSemana: { 3: 'subo a top set' }, eventosSemana: { 5: { tipo: 'viaje' } },
  nombresSesion: ['Torso', ''], ejerciciosClave: ['d0::press', 'd1::sentadilla'],
  draft: { pecho: ['press'] }, draftMaquinas: { press: 'maq_1' },
  hipotesis: {
    pectoral: { palanca: 'volumen', iemMedioObjetivo: 58, iemTecho: 64, limite: 'hombro sin molestias' },
    deltoides: { palanca: 'intensidad', iemMedioObjetivo: 41, iemTecho: 44 },
  },
  cdgObjetivosIem: { pectoral: 64, deltoides: 44 },
  cdgModoPorZona: { pectoral: 'dinamico', deltoides: 'dinamico' },
  cierreDeHipotesis: undefined,
};
const FIN = '2026-11-15';
const HOY = '2026-11-13';

const we = (exerciseId: string, extra: Partial<WorkoutExercise> = {}): WorkoutExercise =>
  ({ exerciseId, order: 0, sets: 3, reps: '8-10', restSeconds: 120, rir: 2, ...extra });

const RUTINAS: Workout[] = [
  { id: 'w2', ownerId: 'c', name: 'Pierna · Ana · Hipertrofia 2', mesocycleId: 'm2', dayIndex: 1, exercises: [we('sentadilla')] },
  {
    id: 'w1', ownerId: 'c', name: 'Torso · Ana · Hipertrofia 2', mesocycleId: 'm2', dayIndex: 0,
    exercises: [
      // Subió una serie en la S4 y bajó el RIR en la S8: así acaba el bloque.
      we('press', { weeklyProgression: [{ atWeek: 4, addSets: 1 }, { atWeek: 8, addSets: 1, setRir: 1 }] }),
      we('elevaciones', { reps: '12-15', notes: 'codo alto' }),
    ],
  },
];

const v = (zona: string, palanca: PalancaDeHipotesis, lectura: LecturaDeHipotesis, extra: Partial<VeredictoParaClonar> = {}): VeredictoParaClonar => ({
  zona, palanca, iemMedio: 50, procesoCumplido: lectura !== 'sin_probar' && lectura !== 'responde_con_menos',
  rmPct: lectura === 'confirmada' ? 6 : 1, rmObjetivoPct: 5, resultadoCumplido: lectura === 'confirmada', lectura, ...extra,
});
const VEREDICTOS = [v('pectoral', 'volumen', 'confirmada'), v('deltoides', 'intensidad', 'no_responde')];

const ESTADO: Pick<EstadoDelBloque, 'porZona'> = {
  porZona: {
    pectoral: { zona: 'pectoral', iemMedio: 61, iemFinal: 64, porSemana: [] },
    deltoides: { zona: 'deltoides', iemMedio: 42, iemFinal: 44, porSemana: [] },
    dorsal: { zona: 'dorsal', iemMedio: 47, iemFinal: 48, porSemana: [] },
  },
};
const EJERCICIOS: EstadoDeEjercicio[] = [
  { exerciseId: 'press', sesiones: 12, estancamiento: null, molestia: null },
  { exerciseId: 'elevaciones', sesiones: 12, estancamiento: { exerciseId: 'elevaciones', sesiones: 7, accion: 'Cambia el ejercicio' } as EstadoDeEjercicio['estancamiento'], molestia: null },
  { exerciseId: 'sentadilla', sesiones: 12, estancamiento: null, molestia: { veces: 2, maxima: 5, ultima: '2026-11-10' } },
];
const ANTERIOR: Mesocycle = {
  ...MESO, id: 'm1', number: 1, name: 'Adaptación', startDate: '2026-06-01', weeks: 8, tipoBloque: 'primer',
  hipotesis: undefined, cierreDeHipotesis: undefined,
};

const base: EntradaDeSiguienteBloque = {
  meso: MESO, rutinas: RUTINAS, mesocycles: [ANTERIOR, MESO], veredictos: VEREDICTOS, estado: ESTADO, ejercicios: EJERCICIOS,
  quitaria: ['press'], fin: FIN, hoy: HOY, ultimaSesion: '2026-11-12', ownerId: 'coach', athleteName: 'Ana',
  nombreDe: id => ({ press: 'Press banca', elevaciones: 'Elevaciones laterales', sentadilla: 'Sentadilla' } as Record<string, string>)[id],
};

describe('fechas', () => {
  it('el lunes siguiente es estrictamente posterior', () => {
    expect(lunesSiguiente('2026-11-15')).toBe('2026-11-16'); // domingo
    expect(lunesSiguiente('2026-11-16')).toBe('2026-11-23'); // lunes
    expect(lunesSiguiente('2026-11-18')).toBe('2026-11-23'); // miércoles
  });
  it('empieza el lunes siguiente al final real; si ese lunes ya pasó, el próximo desde hoy', () => {
    expect(inicioDelSiguiente('2026-11-15', '2026-11-13')).toBe('2026-11-16');
    expect(inicioDelSiguiente('2026-11-15', '2026-11-16')).toBe('2026-11-16');
    expect(inicioDelSiguiente('2026-09-06', '2026-11-18')).toBe('2026-11-23');
    expect(inicioDelSiguiente('2026-09-06', '2026-11-23')).toBe('2026-11-23');
  });
  it('la última semana normal salta descargas, puentes y test', () => {
    expect(ultimaSemanaNormal(MESO)).toBe(10);
    expect(ultimaSemanaNormal({ ...MESO, semanasDescarga: [], semanasTest: [] })).toBe(12);
    // Ciclo de 5 días: 8 semanas son 11 vueltas.
    expect(ultimaSemanaNormal({ weeks: 8, daysPerWeek: 3, cycleDays: 5, semanasDescarga: [11] })).toBe(10);
  });
});

describe('zonasQuePide', () => {
  it('reconoce claves de grupo y nombres, con o sin tildes; lo demás se ignora', () => {
    expect(zonasQuePide(['pecho', 'Dorsal', ' BÍCEPS ', 'no sé'])).toEqual(['pectoral', 'dorsal', 'biceps']);
    expect(zonasQuePide(undefined)).toEqual([]);
  });
});

describe('diasDesdeRutinas', () => {
  it('una sesión por día del ciclo, en orden, con el nombre corto y la prescripción del final', () => {
    const { dias, cambiosDeId } = diasDesdeRutinas(RUTINAS, 2, 10);
    expect(dias.map(d => d.name)).toEqual(['Torso', 'Pierna']);
    expect(dias[0].exercises[0]).toMatchObject({ exerciseId: 'press', sets: 4, rir: 1, reps: '8-10' });
    expect(dias[0].exercises[0].weeklyProgression).toBeUndefined();
    expect(dias[0].exercises[1]).toMatchObject({ exerciseId: 'elevaciones', sets: 3, reps: '12-15', notes: 'codo alto' });
    expect(cambiosDeId).toEqual([]);
    // Copia, no referencia: tocar el bloque nuevo no toca el viejo.
    expect(dias[0].exercises[1]).not.toBe(RUTINAS[1].exercises[1]);
    expect(RUTINAS[1].exercises[0].weeklyProgression).toHaveLength(2);
  });
  it('de dos rutinas con el mismo día (bloques antiguos) se queda con la primera', () => {
    const { dias } = diasDesdeRutinas([...RUTINAS, { name: 'Torso (S2)', dayIndex: 0, exercises: [we('otro')] }], 2, 1);
    expect(dias).toHaveLength(2);
    expect(dias[0].exercises.map(e => e.exerciseId)).toEqual(['press', 'elevaciones']);
  });
  it('un ejercicio cambiado a mitad de bloque se clona con el que acabó', () => {
    const rutinas = [{ name: 'Torso', dayIndex: 0, exercises: [we('press', { weeklyProgression: [{ atWeek: 5, cambios: { exerciseId: 'press_maquina' } }] })] }];
    const { dias, cambiosDeId } = diasDesdeRutinas(rutinas, 1, 10);
    expect(dias[0].exercises[0].exerciseId).toBe('press_maquina');
    expect(cambiosDeId).toEqual([{ dia: 0, de: 'press', a: 'press_maquina' }]);
  });
});

describe('siguienteBloque', () => {
  const s = siguienteBloque(base);

  it('mismo plan: atleta, reparto, ciclo, días, nombres, ejercicios clave, borrador, máquinas y velocidad', () => {
    expect(s.meso).toMatchObject({
      athleteId: 'ana@x.com', daysPerWeek: 2, splitId: 'torso_pierna', cycleDays: 7, nombresSesion: ['Torso', ''],
      ejerciciosClave: ['d0::press', 'd1::sentadilla'], draft: { pecho: ['press'] }, draftMaquinas: { press: 'maq_1' },
      cdgVelocidad: 'suave', tipoBloque: 'desarrollo', phaseType: 'hipertrofia',
    });
    expect(s.meso.groups).toEqual(MESO.groups);
    expect(s.meso.groups).not.toBe(MESO.groups);
    expect('id' in s.meso).toBe(false);
  });

  it('número = el más alto + 1, empieza el lunes siguiente al final y dura lo del tipo', () => {
    expect(s.meso).toMatchObject({ number: 3, startDate: '2026-11-16', weeks: 12 });
    expect(s.resumen).toMatchObject({ numero: 3, inicio: '2026-11-16', semanas: 12, tipo: 'desarrollo', hayPosterior: false });
    expect(siguienteBloque({ ...base, mesocycles: [{ ...ANTERIOR, number: 7 }, MESO] }).meso.number).toBe(8);
  });

  it('no hereda descargas, puentes, test, notas de semana, eventos ni el cierre', () => {
    for (const k of ['deloadWeek', 'semanasDescarga', 'semanasPivot', 'semanasTest', 'notasSemana', 'eventosSemana', 'cierreDeHipotesis', 'name'] as const) {
      expect(s.meso[k], k).toBeUndefined();
    }
  });

  it('las rutinas nacen con las prescripciones del final, su nombre nuevo y sin mesociclo ni calendario', () => {
    expect(s.rutinas.map(r => r.name)).toEqual(['Torso · Ana · Meso #3', 'Pierna · Ana · Meso #3']);
    expect(s.rutinas.map(r => r.dayIndex)).toEqual([0, 1]);
    expect(s.rutinas[0].exercises[0]).toMatchObject({ exerciseId: 'press', sets: 4, rir: 1 });
    expect(s.rutinas.every(r => r.ownerId === 'coach' && !('mesocycleId' in r))).toBe(true);
    expect(s.meso.days?.map(d => d.exercises.length)).toEqual([2, 1]);
  });

  it('hipótesis del motor con el estado final: confirmada = misma palanca y un escalón; no responde = otra palanca', () => {
    expect(s.resumen.estrellas).toEqual(['pectoral', 'deltoides']);
    expect(s.meso.hipotesis?.pectoral).toMatchObject({ palanca: 'volumen', iemArranque: 64, iemTecho: 70.4, iemMedioAnterior: 61, limite: 'hombro sin molestias' });
    expect(s.meso.hipotesis?.deltoides).toMatchObject({ palanca: 'volumen', iemArranque: 44 });
    expect(s.meso.cdgObjetivosIem).toEqual({ pectoral: 70.4, deltoides: 48.4 });
    expect(s.meso.cdgModoPorZona).toMatchObject({ pectoral: 'dinamico', deltoides: 'dinamico', dorsal: 'estatico' });
    expect(s.meso.objective).toBe('Desarrollo: pectoral y deltoides');
    expect(resumenDeTipo(s.resumen)).toBe('Desarrollo · 2 estrellas (pectoral y deltoides)');
  });

  it('confirmada con un límite pasado: misma línea pero sin subir el techo', () => {
    const r = siguienteBloque({ ...base, veredictos: [v('pectoral', 'volumen', 'confirmada', { propuesta: { subirTecho: false } }), VEREDICTOS[1]] });
    // Sin subir, el proceso es sostener: el 95 % de donde acabó (64).
    expect(r.meso.hipotesis?.pectoral).toMatchObject({ palanca: 'volumen', iemTecho: 64, iemMedioObjetivo: 60.8 });
    expect(r.meso.cdgObjetivosIem?.pectoral).toBe(64);
  });

  // Dani, 18-11-2026: confirmó el límite por molestias y pidió vigilar el índice articular de la zona.
  describe('molestias en una zona con estrella', () => {
    const conMolestia = v('pectoral', 'volumen', 'confirmada', {
      propuesta: { subirTecho: false }, limites: { molestia: { veces: 2, maxima: 6, pasado: true } },
    });
    const ESTRES = { 'Hombro Articular': 6.27, 'Hombro Tendinoso Compresivo': 2.04, 'Hombro Tendinoso Tensil': 3.19 };

    it('sin molestias no hay nada que vigilar y el bloque nace sin notas', () => {
      expect(s.resumen.articular).toEqual({ vigilar: [], limites: [] });
      expect(s.meso.notasSemana).toBeUndefined();
    });

    it('la propuesta dice qué articulaciones vigilar, sugiere su media semanal como límite y deja la línea escrita en el bloque nuevo', () => {
      const r = siguienteBloque({ ...base, veredictos: [conMolestia, VEREDICTOS[1]], estresArticular: ESTRES });
      expect(r.resumen.articular.vigilar.map(x => x.texto)).toEqual([
        'Vigilar el estrés articular de hombro (articular, tendinoso compresivo y tendinoso tensil): molestia apuntada en pectoral (2 sesiones, hasta 6/10).',
      ]);
      expect(r.resumen.articular.limites).toEqual([
        { articulacion: 'Hombro Articular', limite: 6.2 },
        { articulacion: 'Hombro Tendinoso Compresivo', limite: 2 },
        { articulacion: 'Hombro Tendinoso Tensil', limite: 3.1 },
      ]);
      // Nota privada del coach en la semana 1: lo único que no viene de aquel calendario.
      expect(r.meso.notasSemana).toEqual({ 1: r.resumen.articular.vigilar[0].texto });
      // Y el techo sigue sin subir, como antes.
      expect(r.meso.hipotesis?.pectoral?.iemTecho).toBe(64);
    });

    it('sin el estrés calculado (sin motor CDG) queda solo la línea; y no se propone subir un límite que ya tiene', () => {
      const soloLinea = siguienteBloque({ ...base, veredictos: [conMolestia, VEREDICTOS[1]] });
      expect(soloLinea.resumen.articular.vigilar).toHaveLength(1);
      expect(soloLinea.resumen.articular.limites).toEqual([]);
      const yaLosTiene = siguienteBloque({
        ...base, veredictos: [conMolestia, VEREDICTOS[1]], estresArticular: ESTRES,
        limitesArticulares: { 'Hombro Articular': 3, 'Hombro Tendinoso Compresivo': 2, 'Hombro Tendinoso Tensil': 5 },
      });
      expect(yaLosTiene.resumen.articular.limites).toEqual([{ articulacion: 'Hombro Tendinoso Tensil', limite: 3.1, actual: 5 }]);
    });

    it('un veredicto ya FIRMADO (sin propuesta ni límites) relee las molestias de sus ejercicios: tampoco sube el techo', () => {
      const firmados = [v('pectoral', 'volumen', 'confirmada'), VEREDICTOS[1]];
      const ejercicios: EstadoDeEjercicio[] = [
        { exerciseId: 'press', sesiones: 12, estancamiento: null, molestia: { veces: 3, maxima: null, ultima: '2026-11-10' } },
        ...EJERCICIOS.slice(1),
      ];
      const zonaDe = { press: 'pectoral', elevaciones: 'deltoides', sentadilla: 'cuadriceps' } as const;
      const r = siguienteBloque({ ...base, veredictos: firmados, ejercicios, zonaDe });
      expect(r.meso.hipotesis?.pectoral).toMatchObject({ palanca: 'volumen', iemTecho: 64 });
      expect(r.resumen.articular.vigilar.map(x => x.zona)).toEqual(['pectoral']);
      expect(r.resumen.articular.vigilar[0].texto).toContain('molestia apuntada en pectoral (3 sesiones).');
      // La molestia de la sentadilla es de una zona sin estrella: no entra aquí (va a candidatos a cambio).
      // Sin molestia en la zona, el firmado sube como siempre…
      expect(siguienteBloque({ ...base, veredictos: firmados, zonaDe }).meso.hipotesis?.pectoral?.iemTecho).toBe(70.4);
      // …salvo que el cansancio medio del bloque pasara del límite.
      expect(siguienteBloque({ ...base, veredictos: firmados, zonaDe, cansancioMedio: 8.2 }).meso.hipotesis?.pectoral?.iemTecho).toBe(64);
      expect(siguienteBloque({ ...base, veredictos: firmados, zonaDe, cansancioMedio: 7.9 }).meso.hipotesis?.pectoral?.iemTecho).toBe(70.4);
    });
  });

  it('copia la última semana normal del bloque y lo dice (ni la semana 1 ni una descarga)', () => {
    // MESO: descarga en la 12, test en la 11 y puente en la 6 → la última normal es la 10.
    expect(s.resumen.semanaDeReferencia).toBe(10);
    expect(s.rutinas[0].exercises[0]).toMatchObject({ exerciseId: 'press', sets: 4, rir: 1 });
  });

  // Dani, 18-11-2026: «con 4 que avise, pero que me permita hacer lo que quiera».
  it('cuatro estrellas: el bloque siguiente las hereda todas, con un aviso y sin recortar ninguna', () => {
    const cuatro: Mesocycle = {
      ...MESO,
      hipotesis: { ...MESO.hipotesis, dorsal: { palanca: 'volumen' }, gluteo: { palanca: 'volumen' } },
    };
    const veredictos = [...VEREDICTOS, v('dorsal', 'volumen', 'confirmada'), v('gluteo', 'volumen', 'sin_probar')];
    const r = siguienteBloque({ ...base, meso: cuatro, mesocycles: [ANTERIOR, cuatro], veredictos });
    expect(r.resumen.estrellas).toEqual(['pectoral', 'dorsal', 'deltoides', 'gluteo']);
    expect(Object.keys(r.meso.hipotesis ?? {}).sort()).toEqual(['deltoides', 'dorsal', 'gluteo', 'pectoral']);
    expect(r.meso.objective).toBe('Desarrollo: pectoral, dorsal, deltoides y glúteo');
    expect(r.resumen.avisos.join(' ')).toContain('Con 4 estrellas');
    expect(r.resumen.avisos.join(' ')).toContain('puedes dejarlo así');
    expect(resumenDeTipo(r.resumen)).toBe('Desarrollo · 4 estrellas (pectoral, dorsal, deltoides y glúteo)');
  });

  it('con cuatro estrellas, la que se suelta la recoge igualmente lo que pide el atleta', () => {
    const hipotesis = { ...MESO.hipotesis, dorsal: { palanca: 'volumen' as const }, gluteo: { palanca: 'volumen' as const } };
    const cuatro: Mesocycle = { ...MESO, hipotesis };
    const previo: Mesocycle = {
      ...cuatro, id: 'm1b', number: 1, startDate: '2026-06-01',
      cierreDeHipotesis: { firmadoEn: '2026-08-23T10:00:00.000Z', veredictos: [v('deltoides', 'volumen', 'no_responde')] },
    };
    const veredictos = [...VEREDICTOS, v('dorsal', 'volumen', 'confirmada'), v('gluteo', 'volumen', 'confirmada')];
    const r = siguienteBloque({ ...base, meso: cuatro, mesocycles: [previo, cuatro], veredictos, pideElAtleta: ['cuadriceps'] });
    expect(r.resumen.estrellas).toEqual(['pectoral', 'dorsal', 'gluteo', 'cuadriceps']);
    expect(r.resumen.rotacion[0]).toContain('la recoge cuádriceps');
  });

  it('el proceso del bloque nuevo se pide sobre donde acabó este (64 + 5 %), no sobre su media (61)', () => {
    expect(s.meso.hipotesis?.pectoral).toMatchObject({ iemMedioAnterior: 61, iemFinalAnterior: 64, iemMedioObjetivo: 67.2, iemTecho: 70.4 });
  });

  it('mejora parcial: misma línea SIN subir el techo, y no cuenta para soltar la estrella', () => {
    const parcial = v('deltoides', 'intensidad', 'mejora_parcial', { rmPct: 4 });
    const r = siguienteBloque({ ...base, veredictos: [VEREDICTOS[0], parcial] });
    expect(r.meso.hipotesis?.deltoides).toMatchObject({ palanca: 'intensidad', iemArranque: 44, iemTecho: 44, iemMedioObjetivo: 41.8 });
    expect(r.meso.cdgObjetivosIem?.deltoides).toBe(44);
    // Dos seguidas: sigue con su estrella. Con dos «no responde» la soltaría (prueba de más abajo).
    const previo: Mesocycle = {
      ...MESO, id: 'm1b', number: 1, startDate: '2026-06-01',
      cierreDeHipotesis: { firmadoEn: '2026-08-23T10:00:00.000Z', veredictos: [v('pectoral', 'volumen', 'confirmada'), v('deltoides', 'intensidad', 'mejora_parcial', { rmPct: 3.5 })] },
    };
    const dos = siguienteBloque({ ...base, mesocycles: [previo, MESO], veredictos: [VEREDICTOS[0], parcial], pideElAtleta: ['dorsal'] });
    expect(dos.resumen.estrellas).toEqual(['pectoral', 'deltoides']);
    expect(dos.resumen.rotacion).toEqual([]);
    expect(dos.meso.hipotesis?.deltoides?.palanca).toBe('intensidad');
  });

  it('principiante: se le pide un 8 % de RM', () => {
    const r = siguienteBloque({ ...base, nivel: 'principiante' });
    expect(r.meso.hipotesis?.pectoral?.rmObjetivoPct).toBe(8);
    expect(s.meso.hipotesis?.pectoral?.rmObjetivoPct).toBe(5);
  });

  it('si el bloque NUEVO cae en déficit: no perder (0 %), techo sin subir y se dice', () => {
    // El bloque nuevo va del 16-11 al 07-02 (12 semanas). Déficit desde el 02-11, 16 semanas.
    const programa: NutritionProgram = {
      athleteId: 'ana@x.com', startDate: '2026-06-01',
      phases: [
        { id: 'f1', name: 'Volumen', weeks: 22, dietId: 'd', objetivo: 'volumen' },
        { id: 'f2', name: 'Definición', weeks: 16, dietId: 'd', objetivo: 'deficit' },
      ],
    };
    const r = siguienteBloque({ ...base, programaNutricion: programa });
    expect(r.resumen.enDeficit).toBe(true);
    expect(r.meso.hipotesis?.pectoral).toMatchObject({ palanca: 'volumen', rmObjetivoPct: 0, iemTecho: 64, iemMedioObjetivo: 60.8 });
    expect(r.meso.cdgObjetivosIem).toEqual({ pectoral: 64, deltoides: 44 });
    expect(r.resumen.notas).toEqual(['Bloque en déficit: se pide no perder fuerza y no se sube el estímulo.']);
    // El bloque que se CIERRA estaba en volumen: no es eso lo que se mira. Y sin programa, lo de siempre.
    expect(s.resumen).toMatchObject({ enDeficit: false, notas: [] });
    // La confirmada con un límite pasado conserva el «no perder».
    const conLimite = siguienteBloque({ ...base, programaNutricion: programa, veredictos: [v('pectoral', 'volumen', 'confirmada', { propuesta: { subirTecho: false } }), VEREDICTOS[1]] });
    expect(conLimite.meso.hipotesis?.pectoral).toMatchObject({ rmObjetivoPct: 0, iemTecho: 64 });
  });

  it('zona que acaba el bloque ya alta (82): el techo no sube, la apuesta deja el volumen y se dice con el nombre de la zona', () => {
    const alto = { porZona: { ...ESTADO.porZona, pectoral: { zona: 'pectoral' as const, iemMedio: 78, iemFinal: 82, porSemana: [] } } };
    const r = siguienteBloque({ ...base, estado: alto });
    expect(r.meso.hipotesis?.pectoral).toMatchObject({ palanca: 'intensidad', iemTecho: 82 });
    expect(r.meso.cdgObjetivosIem?.pectoral).toBe(82);
    expect(r.resumen.notas).toEqual(['Pectoral: zona ya alta: acabó en 82 de IEM y de 80 en adelante se va con cuidado. El techo no sube y la apuesta deja de ser volumen (pasa a intensidad).']);
  });

  it('candidatos a cambio con su motivo; el resto se queda', () => {
    expect(s.resumen.seQuedan).toBe(0);
    expect(s.resumen.candidatos.map(c => [c.exerciseId, c.motivos])).toEqual([
      ['press', ['lo_quitaria']], ['elevaciones', ['parado']], ['sentadilla', ['molestia']],
    ]);
    expect(s.resumen.candidatos[1]).toMatchObject({ nombre: 'Elevaciones laterales', detalle: 'Parado 7 sesiones comparables.' });
    const limpio = siguienteBloque({ ...base, ejercicios: [], quitaria: [] });
    expect(limpio.resumen).toMatchObject({ seQuedan: 3, candidatos: [] });
  });

  it('arranca donde acabó; tras un parón de más de 3 semanas, semana 1 reducida y lejos del fallo', () => {
    expect(s.meso.semana1Reducida).toBe(false);
    expect(s.meso.vuelveDeParon).toBeUndefined();
    expect(s.resumen.motivoDeArranque).toBeNull();
    const paron = siguienteBloque({ ...base, hoy: '2026-12-20', ultimaSesion: '2026-11-12' });
    expect(paron.meso).toMatchObject({ startDate: '2026-12-21', semana1Reducida: true, vuelveDeParon: true });
    expect(paron.resumen.motivoDeArranque).toMatch(/parón de 5 semanas/);
    // Con la semana 1 reducida el arranque baja un 7 %; el techo no.
    expect(paron.meso.hipotesis?.pectoral).toMatchObject({ iemArranque: 59.5, iemTecho: 70.4 });
  });

  it('dos «no responde» seguidos: suelta la estrella y la recoge lo que pide el atleta', () => {
    const previo: Mesocycle = {
      ...MESO, id: 'm1b', number: 1, startDate: '2026-06-01',
      cierreDeHipotesis: { firmadoEn: '2026-08-23T10:00:00.000Z', veredictos: [v('pectoral', 'volumen', 'confirmada'), v('deltoides', 'volumen', 'no_responde')] },
    };
    const r = siguienteBloque({ ...base, mesocycles: [previo, MESO], pideElAtleta: ['dorsal'] });
    expect(r.resumen.estrellas).toEqual(['pectoral', 'dorsal']);
    expect(Object.keys(r.meso.hipotesis ?? {}).sort()).toEqual(['dorsal', 'pectoral']);
    expect(r.meso.hipotesis?.dorsal).toMatchObject({ palanca: 'volumen', iemArranque: 48 });
    expect(r.meso.cdgModoPorZona).toMatchObject({ deltoides: 'estatico', dorsal: 'dinamico' });
    expect(r.meso.objective).toBe('Desarrollo: pectoral y dorsal');
    expect(r.resumen.rotacion).toEqual(['Deltoides suelta la estrella (2 bloques sin responder) y la recoge dorsal, que la pide el atleta.']);
    // Sin candidata, se dice y decide el coach.
    const sinNadie = siguienteBloque({ ...base, mesocycles: [previo, MESO] });
    expect(sinNadie.resumen.estrellas).toEqual(['pectoral']);
    expect(sinNadie.resumen.rotacion[0]).toMatch(/nadie la recoge: decide tú a quién va \(llevan dos bloques o más en mantener: dorsal, /);
  });

  it('después del primer bloque viene uno de desarrollo, sin estrellas todavía', () => {
    const primero: Mesocycle = { ...MESO, tipoBloque: 'primer', weeks: 8, hipotesis: undefined, cdgObjetivosIem: undefined };
    const r = siguienteBloque({ ...base, meso: primero, mesocycles: [primero], veredictos: [] });
    expect(r.meso).toMatchObject({ tipoBloque: 'desarrollo', weeks: 12, objective: 'Desarrollo', hipotesis: {}, cdgObjetivosIem: {} });
    expect(resumenDeTipo(r.resumen)).toBe('Desarrollo · sin estrellas');
  });

  it('sin estado (sin motor CDG) las hipótesis salen sin cifras de IEM', () => {
    const r = siguienteBloque({ ...base, estado: null });
    expect(r.meso.hipotesis?.pectoral).toEqual({ palanca: 'volumen', rmObjetivoPct: 5, limite: 'hombro sin molestias' });
    expect(r.meso.cdgObjetivosIem).toEqual({});
  });

  it('avisa si ya existe un bloque posterior', () => {
    const posterior: Mesocycle = { ...MESO, id: 'm3', number: 3, startDate: '2026-11-16', hipotesis: undefined };
    expect(siguienteBloque({ ...base, mesocycles: [ANTERIOR, MESO, posterior] }).resumen).toMatchObject({ hayPosterior: true, numero: 4 });
  });

  it('sin rutinas clona el plan igualmente, sin sesiones', () => {
    const r = siguienteBloque({ ...base, rutinas: [] });
    expect(r.rutinas).toEqual([]);
    expect(r.meso.days).toBeUndefined();
    expect(r.meso.hipotesis?.pectoral?.palanca).toBe('volumen');
  });
});

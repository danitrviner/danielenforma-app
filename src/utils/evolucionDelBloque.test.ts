import { describe, expect, it } from 'vitest';
import type {
  BodyMeasurement, BodyweightLog, Diet, DietCompletionLog, Questionnaire, QuestionnaireResponse,
} from '../types';
import { buildEvolucionDelBloque, direccionDePregunta } from './evolucionDelBloque';

const base = { inicio: '2026-09-07', fin: '2026-10-04', semanas: 4, hoy: '2026-11-01' };

const peso = (date: string, weight: number): BodyweightLog => ({ id: date, athleteId: 'a', date, weight } as BodyweightLog);

const Q: Questionnaire = {
  id: 'q1', ownerId: 'c', title: 'Semanal',
  questions: [
    { id: 'sueno', label: 'Puntúa tu sueño', type: 'scale', required: true, scaleMin: 1, scaleMax: 10 },
    { id: 'estres', label: '¿Qué nivel de estrés has tenido?', type: 'scale', required: true, signalKey: 'wellness.stress_weekly' },
    { id: 'pasos', label: 'Pasos de media', type: 'numeric', required: true },
    { id: 'peso', label: 'Diferencia de peso corporal', type: 'numeric', required: false },
    { id: 'd1', label: 'CUÁDRICEPS', type: 'scale', required: false, signalKey: 'doms.cuadriceps', scaleMin: 1, scaleMax: 10 },
    { id: 'd2', label: 'DORSAL', type: 'scale', required: false, signalKey: 'doms.dorsal', scaleMin: 1, scaleMax: 10 },
    { id: 'rating', label: 'Valora el bloque', type: 'scale', required: false, signalKey: 'meso_end.rating' },
  ],
};
const resp = (date: string, answers: Record<string, number | string>): QuestionnaireResponse => ({
  id: date, questionnaireId: 'q1', assignmentId: 'x', athleteId: 'a', submittedAt: `${date}T09:00:00.000Z`,
  answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
});

describe('direccionDePregunta', () => {
  it('lee la señal y, si no hay, la redacción', () => {
    expect(direccionDePregunta({ label: 'x', signalKey: 'wellness.stress_weekly' })).toBe('baja_bien');
    expect(direccionDePregunta({ label: '¿Cómo de cansado te sientes?' })).toBe('baja_bien');
    expect(direccionDePregunta({ label: 'Puntúa tu sueño esta semana' })).toBe('sube_bien');
    expect(direccionDePregunta({ label: 'Diferencia de peso corporal en la báscula' })).toBe('neutra');
    expect(direccionDePregunta({ label: 'Color favorito' })).toBe('neutra');
  });
});

describe('buildEvolucionDelBloque', () => {
  it('peso: mediana de la primera y la última semana, ritmo y si cae en el rango del objetivo', () => {
    const ev = buildEvolucionDelBloque({
      ...base, objetivo: 'deficit',
      bodyweightLogs: [
        peso('2026-09-07', 90), peso('2026-09-08', 90.4), peso('2026-09-09', 89.8),
        peso('2026-09-28', 88.4), peso('2026-09-30', 88.6), peso('2026-10-02', 99), // 99: un mal dato, la mediana lo absorbe
      ],
    });
    expect(ev.peso).toMatchObject({ inicio: 90, final: 88.6, deltaKg: -1.4, objetivo: 'deficit' });
    expect(ev.peso!.ritmoPctSemana).toBeCloseTo(-0.52, 1);
    expect(ev.peso!.enRango).toBe(true);
    expect(ev.peso!.semanal).toEqual([90, null, null, 88.6]);
  });

  it('cuestionarios: primer tercio vs último, con dirección, y descarta errores de tecleo', () => {
    const ev = buildEvolucionDelBloque({
      ...base, questionnaires: [Q],
      responses: [
        resp('2026-09-08', { sueno: 4, estres: 8, pasos: 10, peso: 1, d1: 9, d2: 7 }),
        resp('2026-09-15', { sueno: 5, estres: 7, pasos: 9000, peso: 0.5 }),
        resp('2026-09-22', { sueno: 6, estres: 6, pasos: 9500, d1: 5, d2: 5 }),
        resp('2026-10-01', { sueno: 7, estres: 4, pasos: 10000, peso: -0.3, d1: 2, d2: 2 }),
      ],
    });
    const de = (clave: string) => ev.preguntas.find(p => p.clave.includes(clave))!;
    expect(de('sueno')).toMatchObject({ inicio: 4, final: 7, lectura: 'mejora', direccion: 'sube_bien' });
    expect(de('estres')).toMatchObject({ inicio: 8, final: 4, lectura: 'mejora', direccion: 'baja_bien' });
    // El «10» de pasos es un error de tecleo (quería decir 10.000): fuera.
    expect(de('pasos')).toMatchObject({ inicio: 9000, final: 10000 });
    expect(de('peso')).toMatchObject({ lectura: 'igual', direccion: 'neutra' });
    const agujetas = de('agujetas');
    expect(agujetas).toMatchObject({ inicio: 8, final: 2, lectura: 'mejora' });
    expect(agujetas.detalle![0].label).toBe('CUÁDRICEPS');
  });

  it('recoge lo que el atleta dice del bloque (señales meso_end) aunque conteste después del fin', () => {
    const ev = buildEvolucionDelBloque({
      ...base, questionnaires: [Q], responses: [resp('2026-10-08', { rating: 8 })],
    });
    expect(ev.voz).toMatchObject({ valoracion: 8, fecha: '2026-10-08' });
  });

  const m = (date: string, metricKey: string, value: number): BodyMeasurement =>
    ({ id: date + metricKey, athleteId: 'a', date, metricKey, value, unit: 'cm', source: 'manual', createdAt: date } as BodyMeasurement);

  it('medidas: primera y última del bloque con dos semanas de margen', () => {
    const ev = buildEvolucionDelBloque({
      ...base,
      medidas: [m('2026-08-30', 'cintura', 92), m('2026-10-03', 'cintura', 89.5), m('2026-07-01', 'cintura', 99)],
    });
    expect(ev.medidas).toEqual([expect.objectContaining({ clave: 'cintura', inicio: 92, final: 89.5, delta: -2.5, sinCambioMedible: false })]);
  });

  it('brazo y muslo entran, promediando izquierda y derecha cuando están las dos (F9)', () => {
    const ev = buildEvolucionDelBloque({
      ...base,
      medidas: [
        m('2026-09-08', 'biceps_izq_contraido', 38), m('2026-09-08', 'biceps_der_contraido', 39),
        m('2026-10-02', 'biceps_izq_contraido', 39), m('2026-10-02', 'biceps_der_contraido', 40),
        // Muslo: solo el derecho se ha medido dos veces → va él solo, sin promediar.
        m('2026-09-08', 'muslo_der_relajado', 58), m('2026-09-08', 'muslo_izq_relajado', 57),
        m('2026-10-02', 'muslo_der_relajado', 60),
      ],
    });
    const de = (clave: string) => ev.medidas.find(x => x.clave === clave);
    expect(de('biceps_contraido')).toMatchObject({ inicio: 38.5, final: 39.5, delta: 1, sinCambioMedible: false, label: 'Bíceps contraído (media izq. y der.)' });
    expect(de('biceps_izq_contraido')).toBeUndefined(); // ya va en la media
    expect(de('muslo_der_relajado')).toMatchObject({ inicio: 58, final: 60, delta: 2 });
    expect(de('muslo_relajado')).toBeUndefined();
    expect(de('muslo_izq_relajado')).toBeUndefined(); // un solo día: no hay con qué comparar
  });

  it('un cambio menor que el error de la cinta es «sin cambio medible»: 0,5 cm en brazo, 1 cm en el resto (F9)', () => {
    const ev = buildEvolucionDelBloque({
      ...base,
      medidas: [
        m('2026-09-08', 'biceps_der_relajado', 35), m('2026-10-02', 'biceps_der_relajado', 35.4), // 0,4 < 0,5
        m('2026-09-08', 'biceps_der_contraido', 38), m('2026-10-02', 'biceps_der_contraido', 38.5), // 0,5: ya se mide
        m('2026-09-08', 'cintura', 90), m('2026-10-02', 'cintura', 89.2),                          // 0,8 < 1
        m('2026-09-08', 'cadera', 100), m('2026-10-02', 'cadera', 99),                             // 1: ya se mide
      ],
    });
    const de = (clave: string) => ev.medidas.find(x => x.clave === clave)!;
    expect(de('biceps_der_relajado').sinCambioMedible).toBe(true);
    expect(de('biceps_der_contraido').sinCambioMedible).toBe(false);
    expect(de('cintura').sinCambioMedible).toBe(true);
    expect(de('cadera').sinCambioMedible).toBe(false);
  });

  it('índices perímetro / cintura al empezar y al acabar; sin los dos perímetros no hay índice (F9)', () => {
    const ev = buildEvolucionDelBloque({
      ...base,
      medidas: [
        m('2026-09-08', 'pecho', 100), m('2026-10-02', 'pecho', 104),
        m('2026-09-08', 'cintura', 80), m('2026-10-02', 'cintura', 80),
        m('2026-09-08', 'cadera', 96), // la cadera solo se midió una vez…
      ],
    });
    expect(ev.indices.find(i => i.clave === 'ipc')).toMatchObject({ label: 'Pecho / Cintura', inicio: 1.25, final: 1.3, delta: 0.05, sinCambioMedible: false });
    // …así que cadera/cintura no se enseña: hacen falta los dos perímetros medidos dos veces.
    expect(ev.indices.find(i => i.clave === 'icac')).toBeUndefined();
    expect(ev.indices.find(i => i.clave === 'ibc')).toBeUndefined(); // no hay bíceps
  });

  it('la voz del atleta trae también lo que contesta con sus palabras en el cuestionario de cierre (F18)', () => {
    const cierre: Questionnaire = {
      id: 'qc', ownerId: 'c', title: 'Cierre de bloque',
      questions: [
        { id: 'rating', label: 'Valora el bloque', type: 'scale', required: true, signalKey: 'meso_end.rating' },
        { id: 'dur', label: '¿Cómo te ha resultado la duración de las sesiones?', type: 'choice', required: false, options: ['Corta', 'Bien', 'Demasiado larga'], tituloCorto: 'Duración de la sesión' },
        { id: 'mant', label: '¿Qué ejercicios quieres mantener sí o sí, y qué te apetece probar o cambiar?', type: 'text', required: false, tituloCorto: 'Mantener y probar' },
        { id: 'obj', label: '¿Tienes algún objetivo concreto para el próximo bloque?', type: 'text', required: false, tituloCorto: 'Objetivo' },
        { id: 'mol', label: '¿Hay alguna molestia articular o muscular que tengamos que tener en cuenta?', type: 'text', required: false, tituloCorto: 'Molestias' },
      ],
    };
    const r: QuestionnaireResponse = {
      id: 'r', questionnaireId: 'qc', assignmentId: 'x', athleteId: 'a', submittedAt: '2026-10-05T09:00:00.000Z',
      answers: [
        { questionId: 'rating', value: 8 }, { questionId: 'dur', value: 'Demasiado larga' },
        { questionId: 'mant', value: 'Mantener la sentadilla; cambiar el press militar' },
        { questionId: 'obj', value: '   ' }, // en blanco: no se enseña
        { questionId: 'mol', value: 'El hombro derecho al empujar' },
      ],
    };
    // Un texto libre de OTRO cuestionario (el semanal) no es la voz del cierre.
    const semanal: Questionnaire = { id: 'qs', ownerId: 'c', title: 'Semanal', questions: [{ id: 't', label: '¿Algo que contarme?', type: 'text', required: false }] };
    const otra: QuestionnaireResponse = { id: 'o', questionnaireId: 'qs', assignmentId: 'x', athleteId: 'a', submittedAt: '2026-09-20T09:00:00.000Z', answers: [{ questionId: 't', value: 'Semana de mucho trabajo' }] };
    const ev = buildEvolucionDelBloque({ ...base, questionnaires: [cierre, semanal], responses: [r, otra] });
    expect(ev.voz).toMatchObject({ valoracion: 8, fecha: '2026-10-05' });
    expect(ev.voz!.respuestas).toEqual([
      { pregunta: 'Duración de la sesión', respuesta: 'Demasiado larga' },
      { pregunta: 'Mantener y probar', respuesta: 'Mantener la sentadilla; cambiar el press militar' },
      { pregunta: 'Molestias', respuesta: 'El hombro derecho al empujar' },
    ]);
  });

  it('dieta: % de kcal frente al objetivo por semana y días dentro del ±10 %', () => {
    const dieta = { id: 'd', athleteId: 'a', name: 'D', meals: [] } as unknown as Diet;
    const dia = (date: string, kcal: number, objetivo: number): DietCompletionLog => ({
      id: date, athleteId: 'a', date, dietId: 'd', doneItemIds: ['m_0'],
      objetivo: { kcal: objetivo, p: 0, hc: 0, g: 0 },
      meals: [{ id: 'm', name: 'Comida', items: [{ label: 'Algo', category: 'HC', quantity: 1, nutrientes: { kcal, p: 0, hc: 0, g: 0 } }] }],
    } as unknown as DietCompletionLog);
    const ev = buildEvolucionDelBloque({
      ...base, diets: [dieta],
      dietLogs: [dia('2026-09-07', 1600, 2000), dia('2026-09-30', 2000, 2000), dia('2026-10-01', 2050, 2000)],
    });
    expect(ev.dieta).toMatchObject({ diasRegistrados: 3, inicio: 80, final: 101, diasEnObjetivoPct: 67 });
  });

  it('cuenta lo que ha registrado el atleta dentro del bloque', () => {
    const ev = buildEvolucionDelBloque({
      ...base,
      bodyweightLogs: [peso('2026-09-07', 90), peso('2026-09-07', 90.2), peso('2026-11-20', 80)],
      logs: [
        { id: '1', athleteId: 'a', workoutId: 'w', assignmentId: 'x', date: '2026-09-08', completedAt: '', note: 'bien', entries: [{ exerciseId: 'e', sets: [], note: 'molesta' }] },
      ],
    });
    expect(ev.registro).toMatchObject({ sesiones: 1, notasDelAtleta: 2, pesajes: 2, diasConPesaje: 1, diasDelBloque: 28 });
  });
});

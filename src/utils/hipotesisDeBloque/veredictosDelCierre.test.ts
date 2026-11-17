import { describe, expect, it } from 'vitest';
import type { Mesocycle, Questionnaire, QuestionnaireResponse, WorkoutLog } from '../../types';
import catalogoPrueba from '../cdg/__fixtures__/catalogoPrueba.json';
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from '../cdg';
import { addDays } from '../trainingWeek';
import {
  contextoMedioDelBloque, fichaDeCierre, fichaEnLinea, lecturaDeVeredicto, logsDelBloque, molestiasEnFrase,
  semanasFrenadasPorAgujetas, veredictosDelCierre, selloDeLectura,
} from './veredictosDelCierre';
import { veredictoDeHipotesis } from './veredicto';

const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto));
const PRESS = 'Press banca plano con mancuernas (caja torácica amplia) - Pectoral, deltoides anterior, tríceps';
const CURL = 'Curl de bíceps en polea - Bíceps';
const nombreCdgDe = (id: string) => ({ press: PRESS, curl: CURL } as Record<string, string>)[id];

const INICIO = '2026-08-24'; // lunes
const FIN = addDays(INICIO, 8 * 7 - 1);
const meso = (extra: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm2', athleteId: 'ana@x.com', number: 2, weeks: 8, startDate: INICIO, objective: 'Desarrollo', daysPerWeek: 2,
  groups: {} as Mesocycle['groups'], tipoBloque: 'desarrollo',
  hipotesis: { pectoral: { palanca: 'volumen', iemMedioObjetivo: 1, iemTecho: 100 } },
  ...extra,
});

const log = (date: string, exerciseId: string, series: number, o: Partial<WorkoutLog> & { molestia?: number } = {}): WorkoutLog => {
  const { molestia, ...resto } = o;
  return {
    id: `${date}_${exerciseId}`, athleteId: 'ana@x.com', workoutId: 'w', assignmentId: 'x', mesocycleId: 'm2', date,
    completedAt: `${date}T18:00:00.000Z`,
    entries: [{ exerciseId, sets: Array.from({ length: series }, () => ({ weight: 30, repsDone: 10, rir: 1 })), ...(molestia ? { molestia } : {}) }],
    ...resto,
  } as WorkoutLog;
};
/** Una sesión de press por semana, con el cansancio que se pase. */
const semanas = (n: number, cansancio?: number) => Array.from({ length: n }, (_, i) =>
  log(addDays(INICIO, i * 7 + 1), 'press', 4, cansancio == null ? {} : { cansancioAlSalir: cansancio }));

const progresion = (deltaPct: number | null) => [{ exerciseId: 'press', nombre: 'Press banca', deltaPct, metrica: 'e1rm' as const }];

describe('veredictosDelCierre', () => {
  it('con motor: un veredicto por hipótesis, con el IEM realizado, el RM de la zona y el cansancio medio', () => {
    const r = veredictosDelCierre({
      meso: meso(), mesocycles: [meso()], logs: semanas(8, 6), fin: FIN, hoy: addDays(FIN, 3),
      progresion: progresion(6.2), adherenciaPct: 92, motor, nombreCdgDe,
    });
    expect(r.sinMotor).toBe(false);
    expect(r.estrellas).toEqual(['pectoral']);
    expect(r.zonaDe.press).toBe('pectoral');
    expect(r.estado?.semanasQueCuentan).toBe(8);
    expect(r.cansancioMedio).toBe(6);
    expect(r.ultimaSesion).toBe(addDays(INICIO, 7 * 7 + 1));
    expect(r.veredictos).toHaveLength(1);
    const v = r.veredictos[0];
    expect(v.zona).toBe('pectoral');
    expect(v.iemMedio).toBeGreaterThan(1);
    expect(v).toMatchObject({ procesoCumplido: true, rmPct: 6.2, resultadoCumplido: true, lectura: 'confirmada', ejerciciosQueCuentan: 1 });
  });

  it('sin motor no inventa veredictos, pero sigue dando cansancio, molestias y el historial', () => {
    const anterior = meso({ id: 'm1', number: 1, startDate: '2026-05-25', hipotesis: undefined });
    const r = veredictosDelCierre({
      meso: meso(), mesocycles: [meso(), anterior], logs: [...semanas(8, 7), log(addDays(INICIO, 3), 'curl', 2, { molestia: 5 })],
      fin: FIN, hoy: addDays(FIN, 3), progresion: progresion(6.2),
    });
    expect(r).toMatchObject({ sinMotor: true, veredictos: [], estado: null, zonaDe: {}, cansancioMedio: 7 });
    expect(r.anteriores.map(m => m.id)).toEqual(['m1']);
    expect(r.ejercicios.find(e => e.exerciseId === 'curl')?.molestia).toMatchObject({ veces: 1, maxima: 5 });
  });

  it('un bloque sin estrellas (primer bloque) no pide motor: no hay nada que juzgar', () => {
    const r = veredictosDelCierre({
      meso: meso({ tipoBloque: 'primer', hipotesis: undefined }), mesocycles: [], logs: semanas(8), fin: FIN, hoy: FIN, progresion: [],
    });
    expect(r).toMatchObject({ sinMotor: false, veredictos: [], estrellas: [] });
  });

  it('el cansancio medio pasado del límite va como dato: no cambia la lectura pero no sube el techo', () => {
    const r = veredictosDelCierre({
      meso: meso(), mesocycles: [meso()], logs: semanas(8, 8.5), fin: FIN, hoy: addDays(FIN, 3),
      progresion: progresion(6), motor, nombreCdgDe,
    });
    expect(r.veredictos[0].lectura).toBe('confirmada');
    expect(r.veredictos[0].limites.cansancio.pasado).toBe(true);
    expect(r.veredictos[0].propuesta.subirTecho).toBe(false);
  });

  it('con el bloque a medias no cuentan la semana en curso ni las que faltan', () => {
    const hoy = addDays(INICIO, 3 * 7 + 2);
    const r = veredictosDelCierre({
      meso: meso(), mesocycles: [meso()], logs: semanas(4), fin: FIN, hoy, progresion: progresion(null), motor, nombreCdgDe,
    });
    expect(r.estado?.semanas.find(s => s.semana === 4)?.motivo).toBe('en_curso');
    // Ni las semanas que aún no han llegado: no son estímulo sin dar.
    expect(r.estado?.semanas).toHaveLength(4);
    expect(r.estado?.semanasQueCuentan).toBe(3);
  });

  it('con adherencia baja, un proceso sin cumplir se explica por la adherencia', () => {
    const r = veredictosDelCierre({
      meso: meso({ hipotesis: { pectoral: { palanca: 'volumen', iemMedioObjetivo: 9999, iemTecho: 9999 } } }), mesocycles: [],
      logs: semanas(3), fin: FIN, hoy: addDays(FIN, 3), progresion: progresion(1), adherenciaPct: 60, motor, nombreCdgDe,
    });
    expect(r.veredictos[0]).toMatchObject({ procesoCumplido: false, lectura: 'sin_probar', causa: 'adherencia' });
  });
});

describe('logsDelBloque', () => {
  it('los del id del bloque y, sin id, los de sus fechas; nunca los posteriores al final', () => {
    const logs = [
      log('2026-08-25', 'press', 1), log('2026-08-26', 'press', 1, { mesocycleId: 'otro' }),
      log('2026-08-27', 'press', 1, { mesocycleId: undefined }), log('2026-08-01', 'press', 1, { mesocycleId: undefined }),
      log(addDays(FIN, 2), 'press', 1),
    ];
    expect(logsDelBloque(logs, { id: 'm2', startDate: INICIO }, FIN).map(l => l.date)).toEqual(['2026-08-25', '2026-08-27']);
  });
});

const Q: Questionnaire = {
  id: 'q', ownerId: 'c', title: 'Semanal', questions: [
    { id: 'estres', label: 'Estrés', type: 'scale', required: false, signalKey: 'wellness.stress_weekly' },
    { id: 'sueno', label: 'Sueño', type: 'numeric', required: false, signalKey: 'wellness.sleep_hours_weekly' },
    { id: 'pecho', label: 'Agujetas pecho', type: 'scale', required: false, signalKey: 'agujetas.pectoral' },
  ],
} as Questionnaire;
const resp = (date: string, valores: Record<string, number>): QuestionnaireResponse => ({
  id: date, questionnaireId: 'q', assignmentId: 'a', athleteId: 'ana@x.com', submittedAt: `${date}T19:00:00.000Z`,
  answers: Object.entries(valores).map(([questionId, value]) => ({ questionId, value })),
} as QuestionnaireResponse);

describe('contextoMedioDelBloque', () => {
  it('sin cuestionarios no hay contexto', () => {
    expect(contextoMedioDelBloque({ inicio: INICIO, fin: FIN })).toBeNull();
    expect(contextoMedioDelBloque({ inicio: INICIO, fin: FIN, responses: [resp('2026-01-01', { estres: 9 })], questionnaires: [Q] })).toBeNull();
  });
  it('lee la media del bloque con los umbrales del protocolo', () => {
    const malo = [resp(addDays(INICIO, 6), { estres: 9, sueno: 5 }), resp(addDays(INICIO, 13), { estres: 8, sueno: 5.5 })];
    expect(contextoMedioDelBloque({ inicio: INICIO, fin: FIN, responses: malo, questionnaires: [Q] })).toBe('desfavorable');
    const bueno = [resp(addDays(INICIO, 6), { estres: 2, sueno: 8 }), resp(addDays(INICIO, 13), { estres: 3, sueno: 8 })];
    expect(contextoMedioDelBloque({ inicio: INICIO, fin: FIN, responses: bueno, questionnaires: [Q] })).toBe('favorable');
  });
});

describe('semanasFrenadasPorAgujetas', () => {
  const semanasDelBloque = Array.from({ length: 4 }, (_, i) => ({ semana: i + 1, inicio: addDays(INICIO, i * 7), cuenta: i !== 3, motivo: null, entrenada: true }));
  it('cuenta las semanas en las que la lectura de esa semana frena la zona', () => {
    const responses = [
      resp(addDays(INICIO, 6), { pecho: 4 }),   // S1: un 4 en zona no propensa → freno
      resp(addDays(INICIO, 13), { pecho: 2 }),  // S2: margen
      // S3 sin respuesta: la de la S2 no vale para la S3
      resp(addDays(INICIO, 27), { pecho: 5 }),  // S4 no cuenta (descarga)
    ];
    const r = semanasFrenadasPorAgujetas({ meso: meso(), zonas: ['pectoral'], semanas: semanasDelBloque, logs: [], responses, questionnaires: [Q] });
    expect(r).toEqual({ pectoral: 1 });
  });
  it('también con las agujetas contestadas a las 48 h de la sesión', () => {
    const logs = [log(addDays(INICIO, 8), 'press', 3, { agujetas48h: { pectoral: 5 }, agujetas48hAt: `${addDays(INICIO, 10)}T10:00:00.000Z` })];
    const r = semanasFrenadasPorAgujetas({ meso: meso(), zonas: ['pectoral', 'dorsal'], semanas: semanasDelBloque, logs });
    expect(r).toEqual({ pectoral: 1 });
  });
});

describe('ficha de cierre', () => {
  const ejercicios = [
    { exerciseId: 'press', molestia: { veces: 2, maxima: 6, ultima: '2026-10-01' } },
    { exerciseId: 'curl', molestia: null },
  ];
  it('las molestias en una frase, con el nombre del ejercicio', () => {
    expect(molestiasEnFrase(ejercicios, id => (id === 'press' ? 'Press militar' : undefined))).toBe('Press militar (2 sesiones, hasta 6/10)');
    expect(molestiasEnFrase([{ exerciseId: 'curl', molestia: null }])).toBe('');
  });
  it('solo guarda lo que hay y lo cuenta en una línea', () => {
    const f = fichaDeCierre({ contexto: 'neutro', cansancioMedio: 6.4, ejercicios, nombreDe: () => 'Press militar', faseNutricional: ' Volumen ', pesoDeltaKg: 1.24 });
    expect(f).toEqual({ contexto: 'neutro', cansancioMedio: 6.4, molestias: 'Press militar (2 sesiones, hasta 6/10)', faseNutricional: 'Volumen', pesoDeltaKg: 1.2 });
    expect(fichaEnLinea(f)).toBe('Contexto neutro · cansancio medio al salir 6,4/10 · molestias: Press militar (2 sesiones, hasta 6/10) · nutrición: Volumen · peso +1,2 kg');
    expect(fichaDeCierre({ contexto: null, cansancioMedio: null, ejercicios: [] })).toEqual({});
    expect(fichaEnLinea({})).toBe('sin molestias apuntadas');
    expect(fichaEnLinea(undefined)).toBe('');
  });
});

describe('lecturaDeVeredicto · las filas de la ficha', () => {
  const calc = (o: Partial<Parameters<typeof veredictoDeHipotesis>[0]> = {}) => veredictoDeHipotesis({
    zona: 'pectoral', hipotesis: { palanca: 'volumen', iemMedioObjetivo: 58, iemTecho: 64 }, iemMedio: 61,
    rm: { rmPct: 6.2, ejercicios: [{ exerciseId: 'a', nombre: 'A', deltaPct: 6.2 }, { exerciseId: 'b', nombre: 'B', deltaPct: 6.2 }] },
    limites: { cansancioMedio: 6.4 }, ...o,
  });

  it('confirmada: proceso cumplido, resultado sí, límites sin pasar y la propuesta del motor', () => {
    const l = lecturaDeVeredicto(calc(), { techo: 64, iemFinal: 63, duracionMediaMin: 71.2 });
    expect(l.nombre).toBe('Pectoral');
    expect(l.sello).toEqual({ texto: 'Apuesta confirmada', tono: 'bien' });
    expect(l.proceso).toEqual({ estado: 'Cumplido.', tono: 'bien', texto: 'IEM medio 61 (pedía 58 o más). Acabó en 63 con techo de 64.' });
    expect(l.resultado).toEqual({ estado: 'Sí.', tono: 'bien', texto: 'RM estimado medio +6,2 % en 2 ejercicios (objetivo +5 %).' });
    expect(l.limites).toEqual({ texto: 'Cansancio medio 6,4/10 · sin molestias en la zona · 71 min de media.', pasado: false });
    expect(l.siguiente).toMatch(/^Misma línea/);
  });

  it('no responde: el resultado por debajo del ruido se dice sin adornos y las molestias se marcan', () => {
    const v = calc({ rm: { rmPct: 1.1, ejercicios: [{ exerciseId: 'a', nombre: 'A', deltaPct: 1.1 }] }, limites: { cansancioMedio: 6.4, molestiasEnLaZona: 1, molestiaMaxima: 4 } });
    const l = lecturaDeVeredicto(v, { semanasFrenadas: 2 });
    expect(l.sello).toEqual({ texto: 'No responde a esto', tono: 'atencion' });
    expect(l.proceso.texto).toBe('IEM medio 61 (pedía 58 o más). Las agujetas la frenaron 2 semanas.');
    expect(l.resultado).toMatchObject({ estado: 'No.', tono: 'atencion', texto: 'RM estimado medio +1,1 % en 1 ejercicio (objetivo +5 %).' });
    expect(l.limites).toEqual({ texto: 'Cansancio medio 6,4/10 · molestia en 1 sesión (hasta 4/10).', pasado: true });
  });

  it('mejora parcial: sello propio en gris, el resultado «mejora, sin llegar» y la misma línea sin subir el techo', () => {
    const v = calc({ rm: { rmPct: 4, ejercicios: [{ exerciseId: 'a', nombre: 'A', deltaPct: 4 }] } });
    const l = lecturaDeVeredicto(v);
    expect(v.lectura).toBe('mejora_parcial');
    expect(l.sello).toEqual({ texto: 'Mejora, menos de lo buscado', tono: 'neutro' });
    expect(selloDeLectura('mejora_parcial').texto).toBe('Mejora, menos de lo buscado');
    expect(l.proceso.estado).toBe('Cumplido.');
    expect(l.resultado).toEqual({ estado: 'Mejora, sin llegar.', tono: 'neutro', texto: 'RM estimado medio +4 % en 1 ejercicio (objetivo +5 %). Supera el ruido de medida (3 %) sin llegar al objetivo.' });
    expect(l.siguiente).toMatch(/^Misma línea \(volumen\), sin subir el techo/);
  });

  it('en déficit (objetivo: no perder) el resultado es sí mientras el RM aguante', () => {
    const l = lecturaDeVeredicto(calc({ hipotesis: { palanca: 'volumen', iemMedioObjetivo: 58, iemTecho: 61, rmObjetivoPct: 0 }, rm: { rmPct: -1.5 } }));
    expect(l.sello.texto).toBe('Apuesta confirmada');
    expect(l.resultado).toMatchObject({ estado: 'Sí.', texto: 'RM estimado medio −1,5 % (objetivo: no perder).' });
  });

  it('sin marcas, sin estímulo o sin objetivo de proceso lo dice en vez de dar una cifra', () => {
    expect(lecturaDeVeredicto(calc({ rm: { rmPct: null } })).resultado.estado).toBe('Sin medida.');
    expect(lecturaDeVeredicto(calc({ iemMedio: null })).proceso.estado).toBe('Sin dato.');
    expect(lecturaDeVeredicto(calc({ hipotesis: { palanca: 'volumen' } })).proceso.estado).toBe('Sin objetivo.');
  });

  it('un veredicto guardado (sin límites ni propuesta) se lee igual, con lo que falta dicho', () => {
    const l = lecturaDeVeredicto({
      zona: 'deltoides', palanca: 'intensidad', iemMedio: 42, iemMedioObjetivo: 41, procesoCumplido: true,
      rmPct: 3.4, rmObjetivoPct: 5, resultadoCumplido: false, lectura: 'mejora_parcial',
    });
    expect(l.sello).toEqual({ texto: 'Mejora, menos de lo buscado', tono: 'neutro' });
    expect(l.proceso.texto).toBe('IEM medio 42 (pedía 41 o más).');
    // La franja no se guarda: se deduce de las cifras (+3,4 % está entre el ruido y el objetivo).
    expect(l.resultado).toEqual({ estado: 'Mejora, sin llegar.', tono: 'neutro', texto: 'RM estimado medio +3,4 % (objetivo +5 %). Supera el ruido de medida (3 %) sin llegar al objetivo.' });
    expect(l.limites.texto).toBe('Sin dato de límites en lo guardado.');
    expect(l.siguiente).toBeNull();
  });

  it('recuperar: el proceso es bajar y se compara con el tope', () => {
    const v = calc({ hipotesis: { palanca: 'recuperar', iemTecho: 30, rmObjetivoPct: 0 }, iemMedio: 29, rm: { rmPct: -1 } });
    const l = lecturaDeVeredicto(v, { techo: 30 });
    expect(l.proceso).toMatchObject({ estado: 'Cumplido.', texto: 'IEM medio 29 (tope de 30).' });
    expect(l.resultado.texto).toBe('RM estimado medio −1 % (objetivo: no perder).');
  });
});

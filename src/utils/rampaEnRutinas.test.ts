import { describe, it, expect } from 'vitest';
import type { WorkoutExercise, WorkoutLog } from '../types';
import {
  ETIQUETA_RAMPA_PENDIENTE, conRampaPendiente, conRampaSiEsNuevo, entradaYaPasada, entradasPrevistas, etiquetaDeRampa, parcheConRampaAlDia,
  quitarRampaDeEntrada, rangoDeLaRampa, registrosPrevistos, rutinaConRampa, sinRampaPendiente, tieneRampaPendiente,
} from './rampaEnRutinas';
import { conRampaDeEntrada, esEjercicioNuevo, tieneRampaDeEntrada } from './rampaDeEjercicioNuevo';
import { resolveExerciseForWeek } from './progression';

const INICIO = '2026-11-23';
const NOMBRES: Record<string, string> = {
  press: 'Press banca', curl: 'Curl de bíceps en polea', remo: 'Remo con barra', sentadilla: 'Sentadilla hack',
};
const ejercicio = (id: string) => (NOMBRES[id] ? { name: NOMBRES[id] } : undefined);
const we = (exerciseId: string, reps = '8-10', extra: Partial<WorkoutExercise> = {}): WorkoutExercise =>
  ({ exerciseId, order: 0, sets: 3, reps, rir: 1, restSeconds: 120, ...extra });
const log = (date: string, exerciseId: string): Pick<WorkoutLog, 'date' | 'entries'> =>
  ({ date, entries: [{ exerciseId, sets: [{ weight: 60, repsDone: 8, rir: 2 }] }] });
// El remo lo hizo hace dos semanas; el press, hace tres meses; el resto, nunca.
const REGISTROS = [log('2026-11-09', 'remo'), log('2026-08-20', 'press')];
const datos = { registros: REGISTROS, inicio: INICIO, ejercicio };
const reps = (w: WorkoutExercise, semana: number) => resolveExerciseForWeek(w, semana).reps;

describe('poner la entrada a una rutina', () => {
  it('nuevo → semanas 1-3 con el rango de entrada y desde la 4 el pautado; conocido → tal cual', () => {
    const [press, curl, remo] = rutinaConRampa([we('press'), we('curl', '10-12'), we('remo')], datos);
    expect([1, 3, 4, 8].map(s => reps(press, s))).toEqual(['10-12', '10-12', '8-10', '8-10']);
    expect([1, 3, 4].map(s => reps(curl, s))).toEqual(['12-14', '12-14', '10-12']);   // aislamiento
    expect(remo.weeklyProgression).toBeUndefined();
  });

  it('sin registros (no se han podido leer) no se decide nada', () => {
    const original = we('press');
    expect(conRampaSiEsNuevo(original, { ...datos, registros: null })).toBe(original);
    expect(conRampaSiEsNuevo(original, { ...datos, registros: undefined })).toBe(original);
  });

  it('con registros vacíos (atleta que empieza) todo es nuevo', () => {
    const [press, remo] = rutinaConRampa([we('press'), we('remo')], { ...datos, registros: [] });
    expect(tieneRampaDeEntrada(press) && tieneRampaDeEntrada(remo)).toBe(true);
  });

  it('sin fecha de inicio válida no se toca', () => {
    const original = we('sentadilla');
    expect(conRampaSiEsNuevo(original, { ...datos, inicio: '' })).toBe(original);
  });

  it('es idempotente y respeta lo que ya programó el coach', () => {
    const una = conRampaSiEsNuevo(we('press'), datos);
    expect(conRampaSiEsNuevo(una, datos)).toBe(una);
    const suyo = we('press', '8-10', { weeklyProgression: [{ atWeek: 2, cambios: { reps: '6-8' } }] });
    expect(conRampaSiEsNuevo(suyo, datos)).toBe(suyo);
  });

  it('un ejercicio que no está en el catálogo entra como multiarticular (10-12)', () => {
    expect(rangoDeLaRampa(conRampaSiEsNuevo(we('desconocido'), datos))).toBe('10-12');
  });
});

describe('entradas previstas (lo que se le cuenta al coach antes de guardar)', () => {
  it('solo los nuevos a los que les toca, una vez cada uno, con su rango de entrada y el pautado', () => {
    const lista = [we('press'), we('remo'), we('curl', '10-12'), we('press'), we('sentadilla', '12-15')];
    expect(entradasPrevistas(lista, datos)).toEqual([
      { exerciseId: 'press', entrada: '10-12', pautado: '8-10' },
      { exerciseId: 'curl', entrada: '12-14', pautado: '10-12' },
    ]);   // el remo no es nuevo; la sentadilla a 12-15 ya va alta
  });
  it('sin registros, ninguna', () => {
    expect(entradasPrevistas([we('press')], { ...datos, registros: null })).toEqual([]);
  });
});

describe('¿han pasado ya las semanas de entrada?', () => {
  it('con ciclo semanal, desde el primer día de la semana 4', () => {
    expect(entradaYaPasada(INICIO, 7, '2026-12-13')).toBe(false);   // último día de la semana 3
    expect(entradaYaPasada(INICIO, 7, '2026-12-14')).toBe(true);
  });
  it('las semanas son vueltas del ciclo: con uno de 9 días, tres vueltas son 27 días', () => {
    expect(entradaYaPasada(INICIO, 9, '2026-12-19')).toBe(false);
    expect(entradaYaPasada(INICIO, 9, '2026-12-20')).toBe(true);
  });
  it('un bloque que no ha empezado, o sin fecha, no', () => {
    expect(entradaYaPasada(INICIO, 7, '2026-11-01')).toBe(false);
    expect(entradaYaPasada('', 7, '2026-12-30')).toBe(false);
  });
});

describe('registros previstos (plantilla de varias etapas)', () => {
  it('lo que repite de la etapa anterior no es nuevo en la siguiente', () => {
    // Etapa 2 empieza el 18-01; la etapa 1 (8 semanas) lleva la sentadilla hasta el 17-01.
    const previstos = registrosPrevistos(['sentadilla', 'sentadilla'], '2027-01-17');
    expect(previstos).toHaveLength(1);
    expect(esEjercicioNuevo('sentadilla', [...REGISTROS, ...previstos], '2027-01-18')).toBe(false);
    expect(esEjercicioNuevo('curl', [...REGISTROS, ...previstos], '2027-01-18')).toBe(true);
  });

  it('pero si entre medias pasan más de 8 semanas, vuelve a serlo', () => {
    const previstos = registrosPrevistos(['sentadilla'], '2027-01-17');
    expect(esEjercicioNuevo('sentadilla', previstos, '2027-04-12')).toBe(true);
  });

  it('sin ejercicios no inventa un registro', () => {
    expect(registrosPrevistos([], '2027-01-17')).toEqual([]);
  });
});

describe('la marca de la fila', () => {
  it('«Nuevo · 10-12 hasta la semana 3» o «12-14», según el ejercicio', () => {
    expect(etiquetaDeRampa(conRampaSiEsNuevo(we('press'), datos))).toBe('Nuevo · 10-12 hasta la semana 3');
    expect(etiquetaDeRampa(conRampaSiEsNuevo(we('curl', '10-12'), datos))).toBe('Nuevo · 12-14 hasta la semana 3');
  });

  it('sin entrada no hay marca', () => {
    expect(etiquetaDeRampa(we('remo'))).toBeNull();
    expect(etiquetaDeRampa(we('remo', '8-10', { weeklyProgression: [{ atWeek: 1, cambios: { reps: '6-8' } }] }))).toBeNull();
  });
});

describe('quitar la entrada', () => {
  const conEntrada = () => conRampaDeEntrada(we('press'), ejercicio('press'), true);

  it('borra las dos reglas y el ejercicio va con su rango desde la semana 1', () => {
    const sin = quitarRampaDeEntrada(conEntrada());
    expect('weeklyProgression' in sin).toBe(false);
    expect([1, 4].map(s => reps(sin, s))).toEqual(['8-10', '8-10']);
    expect(tieneRampaDeEntrada(sin)).toBe(false);
  });

  it('sin entrada devuelve el mismo ejercicio', () => {
    const original = we('remo', '8-10', { weeklyProgression: [{ atWeek: 5, cambios: { sets: 4 } }] });
    expect(quitarRampaDeEntrada(original)).toBe(original);
  });

  it('conserva lo demás que el coach programó, también en esas mismas semanas', () => {
    const base = conEntrada();
    const tocado: WorkoutExercise = {
      ...base,
      weeklyProgression: [
        { atWeek: 1, cambios: { reps: '10-12', rir: 3 } },
        { atWeek: 4, cambios: { reps: '8-10', sets: 4 } },
        { atWeek: 6, cambios: { rir: 0 } },
      ],
    };
    expect(quitarRampaDeEntrada(tocado).weeklyProgression).toEqual([
      { atWeek: 1, cambios: { rir: 3 } },
      { atWeek: 4, cambios: { sets: 4 } },
      { atWeek: 6, cambios: { rir: 0 } },
    ]);
  });

  it('si en la semana 4 el coach puso otro rango, ese se queda', () => {
    const base = conEntrada();
    const tocado: WorkoutExercise = {
      ...base,
      weeklyProgression: [{ atWeek: 1, cambios: { reps: '10-12' } }, { atWeek: 4, cambios: { reps: '6-8' } }],
    };
    const sin = quitarRampaDeEntrada(tocado);
    expect(sin.weeklyProgression).toEqual([{ atWeek: 4, cambios: { reps: '6-8' } }]);
    expect([1, 4].map(s => reps(sin, s))).toEqual(['8-10', '6-8']);
  });

  it('una regla que además era un escalón clásico conserva el escalón', () => {
    const tocado: WorkoutExercise = {
      ...we('press'),
      weeklyProgression: [{ atWeek: 1, cambios: { reps: '10-12' } }, { atWeek: 4, addSets: 1, cambios: { reps: '8-10' } }],
    };
    expect(quitarRampaDeEntrada(tocado).weeklyProgression).toEqual([{ atWeek: 4, addSets: 1 }]);
  });

  it('se puede volver a poner después de quitarla', () => {
    const otraVez = conRampaSiEsNuevo(quitarRampaDeEntrada(conEntrada()), datos);
    expect(etiquetaDeRampa(otraVez)).toBe('Nuevo · 10-12 hasta la semana 3');
  });
});

describe('editar la base de un ejercicio con entrada', () => {
  const conEntrada = () => conRampaDeEntrada(we('press'), ejercicio('press'), true);
  const aplicar = (w: WorkoutExercise, patch: Partial<WorkoutExercise>): WorkoutExercise => {
    const r = { ...w, ...parcheConRampaAlDia(w, patch) };
    if (r.weeklyProgression === undefined) delete r.weeklyProgression;
    return r;
  };

  it('cambiar el rango de la base mueve la vuelta de la semana 4', () => {
    const despues = aplicar(conEntrada(), { reps: '6-8' });
    expect([1, 3, 4, 9].map(s => reps(despues, s))).toEqual(['10-12', '10-12', '6-8', '6-8']);
    expect(etiquetaDeRampa(despues)).toBe('Nuevo · 10-12 hasta la semana 3');
  });

  it('si el rango nuevo ya es tan alto como el de entrada, la entrada se quita', () => {
    const despues = aplicar(conEntrada(), { reps: '12-15' });
    expect(despues.weeklyProgression).toBeUndefined();
    expect(reps(despues, 1)).toBe('12-15');
  });

  it('sin rango («AMRAP») o con varios bloques de series, también se quita', () => {
    expect(aplicar(conEntrada(), { reps: 'AMRAP' }).weeklyProgression).toBeUndefined();
    const bloques = [{ sets: 1, reps: '6-8', rir: 1 }, { sets: 2, reps: '10-12', rir: 1 }] as WorkoutExercise['setGroups'];
    expect(aplicar(conEntrada(), { setGroups: bloques }).weeklyProgression).toBeUndefined();
  });

  it('lo que no toca el rango no cambia nada (mismo parche)', () => {
    const w = conEntrada();
    const patch = { sets: 4, rir: 0 };
    expect(parcheConRampaAlDia(w, patch)).toBe(patch);
    const mismas = { reps: '8-10' };
    expect(parcheConRampaAlDia(w, mismas)).toBe(mismas);
  });

  it('si el parche ya trae las reglas (chip de progresión), manda el parche', () => {
    const patch = { reps: '6-8', weeklyProgression: undefined };
    expect(parcheConRampaAlDia(conEntrada(), patch)).toBe(patch);
  });

  it('un ejercicio sin entrada no se toca', () => {
    const patch = { reps: '6-8' };
    expect(parcheConRampaAlDia(we('remo'), patch)).toBe(patch);
  });

  it('si el coach ya había cambiado la semana 4, su rango no se pisa', () => {
    const tocado: WorkoutExercise = {
      ...we('press'),
      weeklyProgression: [{ atWeek: 1, cambios: { reps: '10-12' } }, { atWeek: 4, cambios: { reps: '5-7' } }],
    };
    expect(reps(aplicar(tocado, { reps: '6-8' }), 4)).toBe('5-7');
  });
});

describe('rutinas con la entrada pendiente', () => {
  it('marca, detecta y limpia sin tocar otras etiquetas', () => {
    expect(tieneRampaPendiente({})).toBe(false);
    const marcadas = conRampaPendiente(['otra']);
    expect(marcadas).toEqual(['otra', ETIQUETA_RAMPA_PENDIENTE]);
    expect(conRampaPendiente(marcadas)).toEqual(marcadas);
    expect(tieneRampaPendiente({ tags: marcadas })).toBe(true);
    expect(sinRampaPendiente(marcadas)).toEqual(['otra']);
    expect(sinRampaPendiente(undefined)).toEqual([]);
  });
});

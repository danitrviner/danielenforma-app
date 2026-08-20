import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  guardarSesion, cargarSesion, borrarSesion, formaDeSesion, tieneSeriesHechas,
  limpiarSesionesCaducadas, SerieBorrador, SesionEnCurso,
} from './sesionEnCurso';

/* Las pruebas corren en Node, sin DOM, así que localStorage no existe: se
   monta uno en memoria con la misma superficie que usa el módulo (incluidos
   `length` y `key`, que necesita el barrido de caducados). */
function montarLocalStorage() {
  const datos = new Map<string, string>();
  const stub = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size; },
  };
  vi.stubGlobal('localStorage', stub);
  return datos;
}

const ATLETA = 'ana@ejemplo.com';

function serie(done = false): SerieBorrador {
  return { weight: '60', repsDone: '10', rir: '2', done };
}

function sesion(over: Partial<SesionEnCurso> = {}): SesionEnCurso {
  return {
    assignmentId: 'a1',
    workoutId: 'w1',
    playerSets: [[serie(true), serie()], [serie()]],
    exerciseNoteInputs: ['buena', ''],
    workoutNoteInput: 'con calor',
    guardadoEn: new Date().toISOString(),
    ...over,
  };
}

let datos: Map<string, string>;
beforeEach(() => { datos = montarLocalStorage(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('sesionEnCurso — ida y vuelta', () => {
  it('devuelve la sesión tal cual si la rutina no ha cambiado', () => {
    const s = sesion();
    guardarSesion(ATLETA, s);
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).toEqual(s);
  });

  it('no devuelve nada si nunca se guardó', () => {
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).toBeNull();
  });

  it('borrarSesion deja la clave limpia', () => {
    guardarSesion(ATLETA, sesion());
    borrarSesion(ATLETA, 'a1');
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).toBeNull();
  });
});

describe('sesionEnCurso — lo que NO debe restaurar', () => {
  it('descarta el borrador si el coach cambió el nº de series', () => {
    guardarSesion(ATLETA, sesion());
    // La rutina de hoy trae 3 series en el primer ejercicio, no 2.
    expect(cargarSesion(ATLETA, 'a1', 'w1', [3, 1])).toBeNull();
    // Y además lo borra, para no reevaluarlo en cada apertura.
    expect(datos.size).toBe(0);
  });

  it('conserva una bajada/miniserie que el atleta añadió a mano, aunque tenga más filas que la prescripción', () => {
    // El atleta añadió una bajada de dropset: 3 filas en vez de las 2 prescritas.
    guardarSesion(ATLETA, sesion({
      playerSets: [[serie(true), serie(true), serie()], [serie()]],
      formaPrescrita: [2, 1],
    }));
    const borrador = cargarSesion(ATLETA, 'a1', 'w1', [2, 1]);
    expect(borrador).not.toBeNull();
    expect(borrador!.playerSets[0]).toHaveLength(3);
  });

  it('descarta el borrador si el coach reduce el nº de series, aunque el atleta hubiera añadido una fila de más', () => {
    // formaPrescrita sigue siendo [2, 1] (lo que había cuando se guardó), pero
    // la rutina de hoy trae 1 sola serie en el primer ejercicio: el coach la
    // cambió de verdad, y eso debe ganarle a las filas añadidas por el atleta.
    guardarSesion(ATLETA, sesion({
      playerSets: [[serie(true), serie(true), serie()], [serie()]],
      formaPrescrita: [2, 1],
    }));
    expect(cargarSesion(ATLETA, 'a1', 'w1', [1, 1])).toBeNull();
  });

  it('sin formaPrescrita (borrador de antes de dropset/myoreps), compara por playerSets.length como siempre', () => {
    const { formaPrescrita: _sinUsar, ...sinCampo } = sesion();
    guardarSesion(ATLETA, sinCampo as SesionEnCurso);
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).not.toBeNull();
    expect(cargarSesion(ATLETA, 'a1', 'w1', [3, 1])).toBeNull();
  });

  it('descarta el borrador si cambió el nº de ejercicios', () => {
    guardarSesion(ATLETA, sesion());
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1, 4])).toBeNull();
  });

  it('descarta el borrador si el assignment apunta ahora a otra rutina', () => {
    guardarSesion(ATLETA, sesion());
    expect(cargarSesion(ATLETA, 'a1', 'w2', [2, 1])).toBeNull();
  });

  it('descarta el borrador de anteayer', () => {
    const hace30h = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    guardarSesion(ATLETA, sesion({ guardadoEn: hace30h }));
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).toBeNull();
  });

  it('conserva el borrador de hace 6 horas (sesión de noche terminada por la mañana)', () => {
    const hace6h = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    guardarSesion(ATLETA, sesion({ guardadoEn: hace6h }));
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).not.toBeNull();
  });

  it('no devuelve el borrador de OTRO atleta en el mismo móvil', () => {
    guardarSesion(ATLETA, sesion());
    expect(cargarSesion('luis@ejemplo.com', 'a1', 'w1', [2, 1])).toBeNull();
  });

  it('sobrevive a un JSON corrupto sin lanzar', () => {
    datos.set(`enforma_sesion_en_curso_v1_${ATLETA}_a1`, '{roto');
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).toBeNull();
  });
});

describe('sesionEnCurso — utilidades', () => {
  it('formaDeSesion cuenta series por ejercicio en orden', () => {
    expect(formaDeSesion([[serie(), serie(), serie()], [serie()]])).toEqual([3, 1]);
  });

  it('tieneSeriesHechas distingue el borrador vacío del que ya tiene trabajo', () => {
    expect(tieneSeriesHechas(sesion())).toBe(true);
    expect(tieneSeriesHechas(sesion({ playerSets: [[serie(), serie()]] }))).toBe(false);
  });

  it('limpiarSesionesCaducadas barre lo viejo y respeta lo de hoy y lo de otros atletas', () => {
    const viejo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    guardarSesion(ATLETA, sesion({ assignmentId: 'vieja', guardadoEn: viejo }));
    guardarSesion(ATLETA, sesion({ assignmentId: 'hoy' }));
    guardarSesion('luis@ejemplo.com', sesion({ assignmentId: 'vieja-de-luis', guardadoEn: viejo }));

    limpiarSesionesCaducadas(ATLETA);

    expect(cargarSesion(ATLETA, 'vieja', 'w1', [2, 1])).toBeNull();
    expect(cargarSesion(ATLETA, 'hoy', 'w1', [2, 1])).not.toBeNull();
    // El barrido es por atleta: no toca lo de nadie más, ni siquiera caducado.
    expect(datos.has(`enforma_sesion_en_curso_v1_luis@ejemplo.com_vieja-de-luis`)).toBe(true);
  });
});

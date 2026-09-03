import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  guardarSesion, cargarSesion, borrarSesion, formaDeSesion, tieneSeriesHechas,
  limpiarSesionesCaducadas, seriesHechasEnBorrador, SerieBorrador, SesionEnCurso,
  guardarDescanso, cargarDescanso, borrarDescanso,
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
    const hace40h = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
    guardarSesion(ATLETA, sesion({ guardadoEn: hace40h }));
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).toBeNull();
  });

  it('conserva el borrador de ayer por la tarde (se termina de apuntar hoy)', () => {
    const hace30h = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    guardarSesion(ATLETA, sesion({ guardadoEn: hace30h }));
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).not.toBeNull();
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

describe('seriesHechasEnBorrador — el aviso «Sin terminar» de la lista', () => {
  beforeEach(() => { datos = montarLocalStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('cuenta solo las series marcadas', () => {
    guardarSesion(ATLETA, sesion());
    expect(seriesHechasEnBorrador(ATLETA, 'a1')).toBe(1);
  });

  it('devuelve 0 sin borrador, con borrador caducado o con nada hecho', () => {
    expect(seriesHechasEnBorrador(ATLETA, 'a1')).toBe(0);

    const hace40h = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
    guardarSesion(ATLETA, sesion({ assignmentId: 'vieja', guardadoEn: hace40h }));
    expect(seriesHechasEnBorrador(ATLETA, 'vieja')).toBe(0);

    guardarSesion(ATLETA, sesion({ assignmentId: 'vacia', playerSets: [[serie(), serie()]] }));
    expect(seriesHechasEnBorrador(ATLETA, 'vacia')).toBe(0);
  });

  it('mirar la lista NO borra el borrador aunque la rutina haya cambiado de forma', () => {
    guardarSesion(ATLETA, sesion());
    seriesHechasEnBorrador(ATLETA, 'a1');
    expect(datos.has(`enforma_sesion_en_curso_v1_${ATLETA}_a1`)).toBe(true);
  });

  it('no mezcla atletas en un móvil compartido', () => {
    guardarSesion(ATLETA, sesion());
    expect(seriesHechasEnBorrador('luis@ejemplo.com', 'a1')).toBe(0);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
   Descanso en curso (handoff de notificaciones, 03-09)

   Es lo que hace que el cronómetro sobreviva a que el sistema mate la app
   entre series — en un gimnasio, con la pantalla apagada y 40 min de sesión,
   ese es el caso normal, no el raro. Lo que se prueba es justo lo que estaba
   roto: que el descanso se guarde como INSTANTE de fin y no como segundos
   restantes.
   ─────────────────────────────────────────────────────────────────────────── */
describe('descanso en curso', () => {
  beforeEach(() => { datos = montarLocalStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const descanso = (restEndsAt: number) => ({
    restEndsAt, restTotalSeconds: 120, exerciseName: 'Press banca', exIdx: 0, setIdx: 2,
  });

  it('devuelve el instante de fin tal cual', () => {
    const fin = Date.now() + 90_000;
    guardarDescanso(ATLETA, 'a1', descanso(fin));
    expect(cargarDescanso(ATLETA, 'a1')?.restEndsAt).toBe(fin);
  });

  it('el tiempo que pasa con la app muerta NO se recupera al volver', () => {
    // El bug original: el descanso se reanudaba donde se apagó la pantalla.
    // Con un instante de fin, 90 s fuera son 90 s consumidos.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T10:00:00Z'));
    guardarDescanso(ATLETA, 'a1', descanso(Date.now() + 120_000));
    vi.setSystemTime(new Date('2026-09-03T10:01:30Z'));
    expect(cargarDescanso(ATLETA, 'a1')!.restEndsAt - Date.now()).toBe(30_000);
  });

  it('un descanso ya terminado sigue existiendo — es "a por la serie N"', () => {
    // La actividad en vivo no desaparece sola al llegar a 0 (§3.2): si esto
    // devolviera null, la tarjeta moriría justo cuando se va a apuntar.
    guardarDescanso(ATLETA, 'a1', descanso(Date.now() - 5_000));
    expect(cargarDescanso(ATLETA, 'a1')).not.toBeNull();
  });

  it('caduca a los 20 min de haber terminado (sesión abandonada)', () => {
    guardarDescanso(ATLETA, 'a1', descanso(Date.now() - 21 * 60 * 1000));
    expect(cargarDescanso(ATLETA, 'a1')).toBeNull();
  });

  it('no mezcla el descanso de dos atletas en el mismo móvil', () => {
    guardarDescanso(ATLETA, 'a1', descanso(Date.now() + 60_000));
    expect(cargarDescanso('luis@ejemplo.com', 'a1')).toBeNull();
  });

  it('borrarDescanso lo quita', () => {
    guardarDescanso(ATLETA, 'a1', descanso(Date.now() + 60_000));
    borrarDescanso(ATLETA, 'a1');
    expect(cargarDescanso(ATLETA, 'a1')).toBeNull();
  });

  it('un JSON corrupto se trata como que no hay descanso', () => {
    datos.set(`enforma_descanso_en_curso_v1_${ATLETA}_a1`, '{no es json');
    expect(cargarDescanso(ATLETA, 'a1')).toBeNull();
  });

  it('el barrido se lleva los caducados y respeta los vivos', () => {
    guardarDescanso(ATLETA, 'viejo', descanso(Date.now() - 60 * 60 * 1000));
    guardarDescanso(ATLETA, 'vivo', descanso(Date.now() + 60_000));
    limpiarSesionesCaducadas(ATLETA);
    expect(cargarDescanso(ATLETA, 'viejo')).toBeNull();
    expect(cargarDescanso(ATLETA, 'vivo')).not.toBeNull();
  });

  it('el barrido NO se lleva por delante el borrador de series', () => {
    // Las dos claves comparten atleta y viven en el mismo almacén: si el
    // barrido las confundiera, arreglar el descanso costaría el entreno.
    guardarSesion(ATLETA, sesion());
    guardarDescanso(ATLETA, 'a1', descanso(Date.now() - 60 * 60 * 1000));
    limpiarSesionesCaducadas(ATLETA);
    expect(cargarSesion(ATLETA, 'a1', 'w1', [2, 1])).not.toBeNull();
  });
});

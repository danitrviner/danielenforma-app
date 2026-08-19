import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { guardarBorradorAlta, cargarBorradorAlta, borrarBorradorAlta } from './borradorAlta';

function montarLocalStorage() {
  const datos = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size; },
  });
  return datos;
}

const ATLETA = 'ana@ejemplo.com';

interface Campos {
  step: number;
  sex: string;
  weightKg: string;
  equipment: string[];
}

const campos: Campos = { step: 4, sex: 'female', weightKg: '55', equipment: ['mancuernas'] };

let datos: Map<string, string>;
beforeEach(() => { datos = montarLocalStorage(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('borradorAlta', () => {
  it('devuelve los campos tal cual, con el paso en el que se quedó', () => {
    guardarBorradorAlta(ATLETA, campos);
    const leído = cargarBorradorAlta<Campos>(ATLETA);
    expect(leído).toMatchObject(campos);
    expect(leído?.step).toBe(4);
  });

  it('no devuelve nada si nunca se guardó', () => {
    expect(cargarBorradorAlta<Campos>(ATLETA)).toBeNull();
  });

  it('sella la hora de guardado sin que el wizard tenga que pasarla', () => {
    guardarBorradorAlta(ATLETA, campos);
    expect(Date.parse(cargarBorradorAlta<Campos>(ATLETA)!.guardadoEn)).not.toBeNaN();
  });

  it('conserva un alta abandonada hace dos semanas', () => {
    guardarBorradorAlta(ATLETA, campos);
    const k = `enforma_borrador_alta_v1_${ATLETA}`;
    const hace14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    datos.set(k, JSON.stringify({ ...campos, guardadoEn: hace14d }));

    expect(cargarBorradorAlta<Campos>(ATLETA)).toMatchObject(campos);
  });

  it('descarta —y borra— un alta de hace tres meses', () => {
    const hace90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    datos.set(`enforma_borrador_alta_v1_${ATLETA}`, JSON.stringify({ ...campos, guardadoEn: hace90d }));

    expect(cargarBorradorAlta<Campos>(ATLETA)).toBeNull();
    expect(datos.size).toBe(0);
  });

  it('no devuelve el borrador de otro atleta en el mismo móvil', () => {
    guardarBorradorAlta(ATLETA, campos);
    expect(cargarBorradorAlta<Campos>('luis@ejemplo.com')).toBeNull();
  });

  it('sobrevive a un JSON corrupto sin lanzar, y lo limpia', () => {
    datos.set(`enforma_borrador_alta_v1_${ATLETA}`, '{roto');
    expect(cargarBorradorAlta<Campos>(ATLETA)).toBeNull();
    expect(datos.size).toBe(0);
  });

  it('borrarBorradorAlta deja la clave limpia', () => {
    guardarBorradorAlta(ATLETA, campos);
    borrarBorradorAlta(ATLETA);
    expect(cargarBorradorAlta<Campos>(ATLETA)).toBeNull();
  });
});

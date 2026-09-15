// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';
// Módulo .mjs sin tipos, compartido con los scripts de copia.
import { aJson, deJson } from './codecFirestore.mjs';

/* Por qué este test existe: el primer volcado de la base falló al encontrar un
 * `Timestamp` real en `checkins`. Sin este codec, `JSON.stringify` lo habría
 * dejado como `{"_seconds":…}` y la restauración habría escrito ese objeto
 * anónimo donde iba una fecha — una copia que parece correcta y devuelve los
 * datos rotos. Lo que se prueba aquí es la ida y vuelta EXACTA, tipos incluidos. */

// `deJson` solo usa `db` para reconstruir referencias; basta con un doble.
const dbFalso = { doc: (path: string) => ({ path, firestore: {} }) };

const ida = (v: unknown) => deJson(JSON.parse(JSON.stringify(aJson(v))), dbFalso);

describe('codec de copias de Firestore', () => {
  it('devuelve un Timestamp como Timestamp, no como objeto suelto', () => {
    const t = Timestamp.fromDate(new Date('2026-09-15T20:47:53.831Z'));
    const vuelta = ida({ timestamp: t }).timestamp;
    expect(vuelta).toBeInstanceOf(Timestamp);
    expect(vuelta.isEqual(t)).toBe(true);
  });

  it('conserva los nanosegundos, no solo los segundos', () => {
    const t = new Timestamp(1_757_000_000, 123_456_789);
    const vuelta = ida({ t }).t;
    expect(vuelta.seconds).toBe(1_757_000_000);
    expect(vuelta.nanoseconds).toBe(123_456_789);
  });

  it('atraviesa objetos anidados y arrays', () => {
    const t = Timestamp.fromDate(new Date('2026-01-02T03:04:05.000Z'));
    const vuelta = ida({ a: { b: [{ c: t }] } });
    expect(vuelta.a.b[0].c).toBeInstanceOf(Timestamp);
    expect(vuelta.a.b[0].c.isEqual(t)).toBe(true);
  });

  it('deja intacto lo que JSON ya sabe guardar', () => {
    // La inmensa mayoría de la app guarda las fechas como texto ISO: si el codec
    // tocara esos valores, cada copia introduciría una diferencia.
    const datos = {
      nombre: 'Pan integral', quantity: 1.25, done: true, note: null,
      createdAt: '2026-09-15T20:47:53.831Z', items: [1, 'dos', { tres: 3 }],
    };
    expect(ida(datos)).toEqual(datos);
  });

  it('guarda GeoPoint y bytes sin perderlos', () => {
    const vuelta = ida({ p: new GeoPoint(41.38, 2.17), b: Buffer.from('hola') });
    expect(vuelta.p).toBeInstanceOf(GeoPoint);
    expect(vuelta.p.latitude).toBeCloseTo(41.38);
    expect(vuelta.b.toString()).toBe('hola');
  });

  it('reconstruye una referencia a otro documento por su ruta', () => {
    expect(ida({ r: { path: 'diets/abc', firestore: {} } }).r.path).toBe('diets/abc');
  });

  it('FALLA en voz alta ante un tipo que no conoce, en vez de copiarlo mal', () => {
    // Es la garantía de fondo: el día que se guarde un tipo nuevo, la copia se
    // niega a hacerse. Una copia silenciosamente incompleta es peor que ninguna.
    class Rara { constructor(public x = 1) {} }
    expect(() => aJson({ campo: new Rara() })).toThrow(/campo/);
  });

  it('no confunde un objeto plano con un tipo marcado', () => {
    // `__tipo__` es la marca del codec; un dato de la app nunca la lleva.
    const datos = { tipo: 'alta', nombre: 'Plan 12 semanas' };
    expect(ida(datos)).toEqual(datos);
  });
});

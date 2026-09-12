import { describe, it, expect, beforeEach, vi } from 'vitest';
import { escribirLocal, _reiniciarAvisoDeCuota } from './almacenLocal';

/* El fallo que esto previene no es «no se guardó una preferencia»: es que un
   localStorage lleno rompía el SDK de Firestore y dejaba la app sin base de
   datos hasta recargar. Por eso se prueba sobre todo que NUNCA lanza y que hace
   sitio de verdad, y que al hacerlo no se lleva por delante lo que solo vive
   aquí (una sesión de entrenamiento a medias, un alta sin terminar). */

/** localStorage falso con cuota: el de Node no tiene, y sin cuota no hay test. */
function almacenFalso(limite: number) {
  const datos = new Map<string, string>();
  const pesoTotal = () => [...datos].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() { return datos.size; },
    key: (i: number) => [...datos.keys()][i] ?? null,
    getItem: (k: string) => datos.get(k) ?? null,
    removeItem: (k: string) => { datos.delete(k); },
    setItem: (k: string, v: string) => {
      const anterior = datos.get(k);
      datos.set(k, v);
      if (pesoTotal() > limite) {
        if (anterior === undefined) datos.delete(k); else datos.set(k, anterior);
        const err = new Error('cuota'); err.name = 'QuotaExceededError'; throw err;
      }
    },
    clear: () => datos.clear(),
    _datos: datos,
  };
}

let almacen: ReturnType<typeof almacenFalso>;

function montar(limite: number, contenido: Record<string, string> = {}) {
  almacen = almacenFalso(limite);
  for (const [k, v] of Object.entries(contenido)) almacen._datos.set(k, v);
  vi.stubGlobal('localStorage', almacen);
  _reiniciarAvisoDeCuota();
}

beforeEach(() => { vi.unstubAllGlobals(); });

describe('escribirLocal', () => {
  it('guarda tal cual cuando hay sitio', () => {
    montar(1000);
    expect(escribirLocal('enforma_algo', 'hola')).toBe(true);
    expect(almacen.getItem('enforma_algo')).toBe('hola');
  });

  it('hace sitio purgando el espejo más gordo y consigue guardar', () => {
    montar(120, {
      'enforma_ai_chats_v1': 'x'.repeat(80),   // el gordo
      'enforma_tasks_v1': 'y'.repeat(10),
    });
    expect(escribirLocal('enforma_nuevo', 'z'.repeat(40))).toBe(true);
    expect(almacen.getItem('enforma_nuevo')).toBe('z'.repeat(40));
    expect(almacen.getItem('enforma_ai_chats_v1')).toBeNull();
    // El pequeño no hacía falta sacrificarlo.
    expect(almacen.getItem('enforma_tasks_v1')).toBe('y'.repeat(10));
  });

  it('no sacrifica lo que solo vive en local aunque sea lo más gordo', () => {
    const intocables = {
      'enforma_sesion_en_curso_v1_ana@x.com_a1': 'S'.repeat(90),
      'enforma_borrador_alta_v1_ana@x.com': 'B'.repeat(90),
      'questionnaireDraft_a1_2026-09-12': 'Q'.repeat(90),
      'enforma_query_cache_owner': 'uid123',
    };
    // 480 da justo para todo lo intocable + lo nuevo, pero solo si se sacrifica
    // el espejo de dietas.
    montar(480, { ...intocables, 'enforma_diets_v1': 'D'.repeat(60) });

    expect(escribirLocal('enforma_nuevo', 'z'.repeat(50))).toBe(true);
    for (const k of Object.keys(intocables)) {
      expect(almacen.getItem(k), `${k} no debía purgarse`).not.toBeNull();
    }
    // El espejo de dietas sí: se recupera solo en la siguiente lectura.
    expect(almacen.getItem('enforma_diets_v1')).toBeNull();
  });

  it('no toca las claves del SDK de Firestore', () => {
    montar(150, { 'firestore_targets_firestore/[DEFAULT]/x/_1': 'F'.repeat(100) });
    // No cabe ni purgando, porque lo único gordo es del SDK y no se toca.
    expect(escribirLocal('enforma_nuevo', 'z'.repeat(100))).toBe(false);
    expect(almacen.getItem('firestore_targets_firestore/[DEFAULT]/x/_1')).not.toBeNull();
  });

  it('devuelve false sin lanzar cuando no cabe ni vaciando lo purgable', () => {
    montar(50, { 'enforma_diets_v1': 'D'.repeat(30) });
    expect(() => escribirLocal('enforma_enorme', 'z'.repeat(500))).not.toThrow();
    expect(escribirLocal('enforma_enorme', 'z'.repeat(500))).toBe(false);
  });

  it('devuelve false sin purgar nada si localStorage está deshabilitado', () => {
    // Modo privado / cookies bloqueadas: el error no es de cuota, así que no
    // tiene sentido ponerse a borrar datos del usuario.
    montar(1000, { 'enforma_diets_v1': 'D'.repeat(30) });
    almacen.setItem = () => { throw new Error('SecurityError'); };
    expect(escribirLocal('enforma_algo', 'hola')).toBe(false);
    expect(almacen.getItem('enforma_diets_v1')).not.toBeNull();
  });
});

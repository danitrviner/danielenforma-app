import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OnboardingData } from '../types';
import {
  estadoConsentimiento, puedeAnalizarseConIA, debePedirseConsentimiento,
  registrarConsentimiento, motivoParaElCoach, aliasDeAtleta,
  haSidoAplazado, marcarAplazado,
  VERSION_CONSENTIMIENTO_IA,
} from './consentimientoIA';

function onboarding(consentimientoIA?: OnboardingData['consentimientoIA']): OnboardingData {
  return { athleteId: 'ana@ejemplo.com', consentimientoIA } as OnboardingData;
}

describe('consentimientoIA — se falla cerrado', () => {
  it('sin onboarding no se puede analizar', () => {
    expect(puedeAnalizarseConIA(null)).toBe(false);
    expect(puedeAnalizarseConIA(undefined)).toBe(false);
  });

  it('con onboarding pero sin decisión tampoco', () => {
    expect(estadoConsentimiento(onboarding())).toBe('sin_responder');
    expect(puedeAnalizarseConIA(onboarding())).toBe(false);
  });

  it('un objeto malformado cuenta como sin responder, no como aceptado', () => {
    const roto = { fecha: '2026-08-13', version: 1 } as unknown as OnboardingData['consentimientoIA'];
    expect(estadoConsentimiento(onboarding(roto))).toBe('sin_responder');
    expect(puedeAnalizarseConIA(onboarding(roto))).toBe(false);
  });

  it('solo un sí explícito de la versión actual abre la puerta', () => {
    const sí = registrarConsentimiento(true, '2026-08-13T10:00:00.000Z');
    expect(puedeAnalizarseConIA(onboarding(sí))).toBe(true);
  });
});

describe('consentimientoIA — un «no» es una respuesta, no un hueco', () => {
  it('distingue rechazado de sin responder', () => {
    const no = registrarConsentimiento(false, '2026-08-13T10:00:00.000Z');
    expect(estadoConsentimiento(onboarding(no))).toBe('rechazado');
    expect(estadoConsentimiento(onboarding())).toBe('sin_responder');
  });

  it('a quien dijo que no NO se le vuelve a preguntar', () => {
    const no = registrarConsentimiento(false, '2026-08-13T10:00:00.000Z');
    expect(debePedirseConsentimiento(onboarding(no))).toBe(false);
  });

  it('a quien no ha contestado sí', () => {
    expect(debePedirseConsentimiento(onboarding())).toBe(true);
  });

  it('a quien aceptó ya no se le molesta', () => {
    const sí = registrarConsentimiento(true, '2026-08-13T10:00:00.000Z');
    expect(debePedirseConsentimiento(onboarding(sí))).toBe(false);
  });
});

describe('consentimientoIA — versión del aviso', () => {
  it('un sí a una versión anterior queda caducado y no vale', () => {
    const viejo = { aceptado: true, fecha: '2026-01-01T00:00:00.000Z', version: VERSION_CONSENTIMIENTO_IA - 1 };
    expect(estadoConsentimiento(onboarding(viejo))).toBe('caducado');
    expect(puedeAnalizarseConIA(onboarding(viejo))).toBe(false);
  });

  it('y se le vuelve a preguntar', () => {
    const viejo = { aceptado: true, fecha: '2026-01-01T00:00:00.000Z', version: VERSION_CONSENTIMIENTO_IA - 1 };
    expect(debePedirseConsentimiento(onboarding(viejo))).toBe(true);
  });

  it('registrarConsentimiento sella la versión actual y la fecha que se le da', () => {
    const c = registrarConsentimiento(true, '2026-08-13T10:00:00.000Z');
    expect(c).toEqual({ aceptado: true, fecha: '2026-08-13T10:00:00.000Z', version: VERSION_CONSENTIMIENTO_IA });
  });
});

describe('consentimientoIA — lo que se le dice al coach', () => {
  it('un rechazo se explica como decisión, y dice que no hay nada que reintentar', () => {
    const m = motivoParaElCoach('rechazado', 'Ana G.');
    expect(m).toContain('Ana G.');
    expect(m).toMatch(/rechazado/);
    expect(m).toMatch(/nada que reintentar/);
  });

  it('un pendiente deja claro que no es un error, para que el asistente no insista', () => {
    const m = motivoParaElCoach('sin_responder', 'Ana G.');
    expect(m).toMatch(/no es un error/i);
    expect(m).toMatch(/no reintentes/i);
  });
});

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

describe('haSidoAplazado / marcarAplazado — T6, no interrumpir a pantalla completa dos veces', () => {
  beforeEach(() => { montarLocalStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('nadie ha aplazado nada al principio', () => {
    expect(haSidoAplazado('ana@ejemplo.com')).toBe(false);
  });

  it('marcarAplazado hace que haSidoAplazado devuelva true después', () => {
    marcarAplazado('ana@ejemplo.com');
    expect(haSidoAplazado('ana@ejemplo.com')).toBe(true);
  });

  it('es por atleta, no global', () => {
    marcarAplazado('ana@ejemplo.com');
    expect(haSidoAplazado('otro@ejemplo.com')).toBe(false);
  });

  it('no distingue mayúsculas en el email', () => {
    marcarAplazado('Ana@Ejemplo.com');
    expect(haSidoAplazado('ana@ejemplo.com')).toBe(true);
  });
});

describe('aliasDeAtleta — identidad fuera', () => {
  it('deja nombre de pila e inicial del apellido', () => {
    expect(aliasDeAtleta('Ana García Ruiz', 'ana@ejemplo.com')).toBe('Ana G.');
  });

  it('con un solo nombre lo deja tal cual', () => {
    expect(aliasDeAtleta('Ana', 'ana@ejemplo.com')).toBe('Ana');
  });

  it('sin nombre no cae al email, que es justo lo que no queremos mandar', () => {
    expect(aliasDeAtleta(undefined, 'ana@ejemplo.com')).toBe('Atleta');
    expect(aliasDeAtleta('   ', 'ana@ejemplo.com')).toBe('Atleta');
  });

  it('nunca devuelve el email', () => {
    for (const nombre of ['Ana García', 'Ana', undefined, '']) {
      expect(aliasDeAtleta(nombre, 'ana@ejemplo.com')).not.toContain('@');
    }
  });
});

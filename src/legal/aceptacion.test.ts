import { describe, it, expect } from 'vitest';
import {
  documentosPendientes, debeAceptarLegal, faltaAlgoObligatorio, registrarAceptacion,
  decisionIA, consentimientoIADesdeLegal,
  DOCUMENTOS_LEGALES, OPCION_IA,
  type AceptacionesLegales,
} from './aceptacion';
import { VERSION_CONSENTIMIENTO_IA } from '../ai/consentimientoIA';
import type { UserProfile } from '../types';

const AHORA = '2026-08-27T10:00:00.000Z';
const meta = (id: string) => DOCUMENTOS_LEGALES.find(d => d.id === id)!;

const perfil = (legal?: AceptacionesLegales, role: 'client' | 'coach' = 'client') =>
  ({ role, legal } as Pick<UserProfile, 'role' | 'legal'>);

const todoAceptado = (): AceptacionesLegales => ({
  terminos:   registrarAceptacion(meta('terminos'), AHORA, { [OPCION_IA]: false }),
  privacidad: registrarAceptacion(meta('privacidad'), AHORA),
});

describe('documentos pendientes', () => {
  it('sin nada aceptado, los pide todos y en orden', () => {
    expect(documentosPendientes(undefined).map(d => d.id)).toEqual(['terminos', 'privacidad']);
  });

  it('con todo aceptado en versión actual, no pide nada', () => {
    expect(documentosPendientes(todoAceptado())).toEqual([]);
  });

  it('un documento aceptado en una versión anterior vuelve a pedirse', () => {
    const legal = todoAceptado();
    legal.privacidad = { version: 0, fecha: AHORA };
    expect(documentosPendientes(legal).map(d => d.id)).toEqual(['privacidad']);
  });

  it('a medias, solo pide lo que falta', () => {
    const legal: AceptacionesLegales = { terminos: registrarAceptacion(meta('terminos'), AHORA) };
    expect(documentosPendientes(legal).map(d => d.id)).toEqual(['privacidad']);
  });
});

describe('a quién se le enseña el muro', () => {
  it('al atleta que no ha aceptado', () => {
    expect(debeAceptarLegal(perfil(undefined))).toBe(true);
  });

  it('al coach nunca: es el responsable, no el interesado', () => {
    expect(debeAceptarLegal(perfil(undefined, 'coach'))).toBe(false);
  });

  it('al atleta que ya lo aceptó todo, no', () => {
    expect(debeAceptarLegal(perfil(todoAceptado()))).toBe(false);
  });

  it('sin perfil todavía, no', () => {
    expect(debeAceptarLegal(null)).toBe(false);
  });
});

describe('obligatorio vs opcional', () => {
  it('los dos documentos del muro son obligatorios', () => {
    expect(DOCUMENTOS_LEGALES.every(d => d.obligatorio)).toBe(true);
    expect(faltaAlgoObligatorio(undefined)).toBe(true);
    expect(faltaAlgoObligatorio(todoAceptado())).toBe(false);
  });

  it('faltando privacidad, sí', () => {
    const legal = todoAceptado();
    delete legal.privacidad;
    expect(faltaAlgoObligatorio(legal)).toBe(true);
  });
});

describe('decisión sobre el análisis con IA', () => {
  it('sin registro es «no ha contestado», que no es «no»', () => {
    expect(decisionIA(undefined)).toBeUndefined();
    expect(consentimientoIADesdeLegal(undefined)).toBeUndefined();
  });

  it('un «no» se guarda como no, con su fecha', () => {
    const legal = todoAceptado();
    expect(decisionIA(legal)).toBe(false);
    expect(consentimientoIADesdeLegal(legal)).toEqual({
      aceptado: false, fecha: AHORA, version: VERSION_CONSENTIMIENTO_IA,
    });
  });

  it('un «sí» viaja al onboarding con la versión del consentimiento', () => {
    const legal = todoAceptado();
    legal.terminos = registrarAceptacion(meta('terminos'), AHORA, { [OPCION_IA]: true });
    expect(consentimientoIADesdeLegal(legal)).toEqual({
      aceptado: true, fecha: AHORA, version: VERSION_CONSENTIMIENTO_IA,
    });
  });

  it('aceptar los términos sin tocar la casilla opcional NO consiente el análisis', () => {
    const legal: AceptacionesLegales = { terminos: registrarAceptacion(meta('terminos'), AHORA) };
    expect(decisionIA(legal)).toBeUndefined();
    expect(consentimientoIADesdeLegal(legal)).toBeUndefined();
  });
});

describe('el registro que se guarda', () => {
  it('lleva versión y fecha, y omite `opciones` si no las hay', () => {
    expect(registrarAceptacion(meta('terminos'), AHORA)).toEqual({ version: 1, fecha: AHORA });
  });
});

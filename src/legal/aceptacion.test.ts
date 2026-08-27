import { describe, it, expect } from 'vitest';
import {
  documentosPendientes, debeAceptarLegal, faltaAlgoObligatorio, registrarAceptacion,
  decisionIA, consentimientoIADesdeLegal, permiteUsoDeImagenes,
  DOCUMENTOS_LEGALES, OPCION_IA, OPCION_IMAGENES,
  type AceptacionesLegales,
} from './aceptacion';
import { VERSION_CONSENTIMIENTO_IA } from '../ai/consentimientoIA';
import type { UserProfile } from '../types';

const AHORA = '2026-08-27T10:00:00.000Z';
const meta = (id: string) => DOCUMENTOS_LEGALES.find(d => d.id === id)!;

const perfil = (legal?: AceptacionesLegales, role: 'client' | 'coach' = 'client') =>
  ({ role, legal } as Pick<UserProfile, 'role' | 'legal'>);

const todoAceptado = (): AceptacionesLegales => ({
  terminos:   registrarAceptacion(meta('terminos'), AHORA),
  privacidad: registrarAceptacion(meta('privacidad'), AHORA),
  ajustes:    registrarAceptacion(meta('ajustes'), AHORA, { [OPCION_IA]: false, [OPCION_IMAGENES]: false }),
});

describe('documentos pendientes', () => {
  it('sin nada aceptado, los pide todos y en orden', () => {
    expect(documentosPendientes(undefined).map(d => d.id)).toEqual(['terminos', 'privacidad', 'ajustes']);
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
    expect(documentosPendientes(legal).map(d => d.id)).toEqual(['privacidad', 'ajustes']);
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
  it('faltando solo el paso opcional, no queda nada obligatorio', () => {
    const legal = todoAceptado();
    delete legal.ajustes;
    expect(faltaAlgoObligatorio(legal)).toBe(false);
    // …pero sigue siendo un paso pendiente: se pregunta una vez.
    expect(documentosPendientes(legal).map(d => d.id)).toEqual(['ajustes']);
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
    legal.ajustes = registrarAceptacion(meta('ajustes'), AHORA, { [OPCION_IA]: true });
    expect(consentimientoIADesdeLegal(legal)).toEqual({
      aceptado: true, fecha: AHORA, version: VERSION_CONSENTIMIENTO_IA,
    });
  });

  it('aceptar el documento sin tocar las casillas NO consiente nada', () => {
    const legal: AceptacionesLegales = { ajustes: registrarAceptacion(meta('ajustes'), AHORA) };
    expect(decisionIA(legal)).toBeUndefined();
    expect(permiteUsoDeImagenes(legal)).toBe(false);
  });
});

describe('uso promocional de imágenes', () => {
  it('por defecto, no', () => {
    expect(permiteUsoDeImagenes(undefined)).toBe(false);
    expect(permiteUsoDeImagenes(todoAceptado())).toBe(false);
  });

  it('solo si se marcó', () => {
    const legal: AceptacionesLegales = {
      ajustes: registrarAceptacion(meta('ajustes'), AHORA, { [OPCION_IMAGENES]: true }),
    };
    expect(permiteUsoDeImagenes(legal)).toBe(true);
  });
});

describe('el registro que se guarda', () => {
  it('lleva versión y fecha, y omite `opciones` si no las hay', () => {
    expect(registrarAceptacion(meta('terminos'), AHORA)).toEqual({ version: 1, fecha: AHORA });
  });
});

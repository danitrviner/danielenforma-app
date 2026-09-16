import { describe, it, expect } from 'vitest';
import { COACH_EMAIL, esElCoachPermanente, esCoach } from './coach';

describe('esElCoachPermanente', () => {
  it('no distingue mayúsculas: Firebase guarda el correo como se tecleó', () => {
    expect(esElCoachPermanente('DaniTrViner@Gmail.com')).toBe(true);
    expect(esElCoachPermanente(COACH_EMAIL)).toBe(true);
  });

  it('cualquier otro correo, y la ausencia de correo, es que no', () => {
    expect(esElCoachPermanente('ana@x.com')).toBe(false);
    expect(esElCoachPermanente(undefined)).toBe(false);
    expect(esElCoachPermanente('')).toBe(false);
  });
});

describe('esCoach', () => {
  it('vale el rol', () => {
    expect(esCoach({ role: 'coach', email: 'otro@x.com' })).toBe(true);
  });

  it('y vale ser el dueño aunque el perfil no tenga el rol puesto', () => {
    expect(esCoach({ role: 'client', email: COACH_EMAIL })).toBe(true);
  });

  it('un atleta no es coach, y sin perfil tampoco', () => {
    expect(esCoach({ role: 'client', email: 'ana@x.com' })).toBe(false);
    expect(esCoach(null)).toBe(false);
  });
});

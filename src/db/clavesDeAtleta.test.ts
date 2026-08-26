import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { exigeUid, exigeEmail, pareceEmail } from './clavesDeAtleta';

describe('claves de atleta (UID vs email)', () => {
  it('distingue email de UID', () => {
    expect(pareceEmail('dani@x.com')).toBe(true);
    expect(pareceEmail('THa4aRnQQVT2tPXBEqq5yytJxIm1')).toBe(false);
  });

  // El fallo real que esto previene: la regla de `workoutAssignments` exige
  // `athleteId == request.auth.uid`, así que consultar con email NO da error de
  // permisos — devuelve 0 documentos, y al coach le aparece "sin entrenamientos
  // asignados". Un fallo que se lee como un dato.
  it('rompe al pasar un email donde se espera un UID', () => {
    expect(() => exigeUid('dani@x.com', 'getWorkoutAssignments')).toThrow(/UID/);
  });

  it('rompe al pasar un UID donde se espera un email', () => {
    expect(() => exigeEmail('THa4aRnQQVT2tPXBEqq5yytJxIm1', 'getWorkoutLogs')).toThrow(/email/);
  });

  it('deja pasar la clave correcta y la devuelve tal cual', () => {
    expect(exigeUid('abc123', 'x')).toBe('abc123');
    expect(exigeEmail('dani@x.com', 'x')).toBe('dani@x.com');
  });
});

// La app usa una base de Firestore NOMBRADA, no la `(default)`. Un script que
// llame a `getFirestore()` a secas no falla: escribe en `(default)` sin avisar.
describe('los scripts apuntan a la base nombrada', () => {
  const DIR = resolve(__dirname, '../../scripts');

  it('ningún script llama a getFirestore() sin databaseId', () => {
    const infractores: string[] = [];
    for (const nombre of readdirSync(DIR)) {
      if (!nombre.endsWith('.mjs') && !nombre.endsWith('.ts')) continue;
      const src = readFileSync(resolve(DIR, nombre), 'utf8');
      // `getFirestore()` sin argumentos = base (default).
      if (/getFirestore\(\s*\)/.test(src)) infractores.push(nombre);
    }
    expect(infractores).toEqual([]);
  });

  it('la config trae el databaseId del que dependen los scripts', () => {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../firebase-applet-config.json'), 'utf8'));
    expect(typeof cfg.firestoreDatabaseId).toBe('string');
    expect(cfg.firestoreDatabaseId.length).toBeGreaterThan(0);
  });
});

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

  // Recorre subcarpetas: `scripts/_lib/` y compañía quedaban fuera del barrido
  // original, que solo miraba el primer nivel.
  function scriptsDe(dir: string, prefijo = ''): Array<{ nombre: string; src: string }> {
    const out: Array<{ nombre: string; src: string }> = [];
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = resolve(dir, entrada.name);
      if (entrada.isDirectory()) {
        out.push(...scriptsDe(ruta, `${prefijo}${entrada.name}/`));
      } else if (entrada.name.endsWith('.mjs') || entrada.name.endsWith('.ts')) {
        out.push({ nombre: prefijo + entrada.name, src: readFileSync(ruta, 'utf8') });
      }
    }
    return out;
  }

  // Sin esto el barrido cazaba `_lib/firestoreDb.mjs`, que es justo el helper
  // que lo hace BIEN: el texto `getFirestore()` aparece en sus comentarios y en
  // el mensaje de error que lanza. Un guardián que señala al único fichero
  // correcto del repo acaba desactivado por pesado, así que mira solo el código.
  const soloCodigo = (src: string) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');

  it('ningún script llama a getFirestore() sin databaseId', () => {
    const infractores: string[] = [];
    for (const { nombre, src } of scriptsDe(DIR)) {
      // `getFirestore()` sin argumentos = base (default).
      if (!/getFirestore\(\s*\)/.test(soloCodigo(src))) continue;
      // Única excepción: un script que se niega a arrancar fuera del emulador.
      // No basta con que lo diga un comentario — tiene que comprobar la
      // variable Y cortar la ejecución si no está.
      const soloEmulador = /FIRESTORE_EMULATOR_HOST/.test(src)
        && /process\.exit\(|throw /.test(src);
      if (!soloEmulador) infractores.push(nombre);
    }
    expect(infractores).toEqual([]);
  });

  it('no confunde una mención en un comentario con una llamada real', () => {
    const inocente = "// ojo: getFirestore() apunta a (default)\nconst db = getFirestore(ID);";
    const culpable = "const db = getFirestore();";
    expect(/getFirestore\(\s*\)/.test(soloCodigo(inocente))).toBe(false);
    expect(/getFirestore\(\s*\)/.test(soloCodigo(culpable))).toBe(true);
  });

  it('un script que dice ser de emulador pero no corta la ejecución NO se libra', () => {
    const falso = "import { getFirestore } from 'x';\nprocess.env.FIRESTORE_EMULATOR_HOST;\nconst db = getFirestore();";
    const soloEmulador = /FIRESTORE_EMULATOR_HOST/.test(falso) && /process\.exit\(|throw /.test(falso);
    expect(soloEmulador).toBe(false);
  });

  it('la config trae el databaseId del que dependen los scripts', () => {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../firebase-applet-config.json'), 'utf8'));
    expect(typeof cfg.firestoreDatabaseId).toBe('string');
    expect(cfg.firestoreDatabaseId.length).toBeGreaterThan(0);
  });
});

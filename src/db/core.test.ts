import { describe, it, expect, beforeEach } from 'vitest';
import { setLocalBypassMode, isLocalBypassActive, esFalloDePermisos, hayFalloDePermisos, descartarAvisoDePermisos } from './core';
import { mensajeDeErrorFirestore, reintentarNoSirve } from '../utils/erroresFirestore';

/* Cubre P0-2 y P1-6 de docs/auditoria-visual/hallazgos.md.
 *
 * El bug: una lectura denegada de `user_profiles` activaba el modo local a nivel
 * de módulo y bloqueaba TODAS las escrituras posteriores de la sesión —incluida
 * la del onboarding— con un «revisa tu conexión» que era falso. El atleta no
 * podía darse de alta y no había forma de saber por qué. */

const errorDe = (code: string, message = 'boom') => Object.assign(new Error(message), { code });

describe('setLocalBypassMode', () => {
  beforeEach(() => setLocalBypassMode(false));

  it('activa el modo local ante un fallo de red', () => {
    setLocalBypassMode(true, errorDe('unavailable'));
    expect(isLocalBypassActive()).toBe(true);
  });

  it('NO lo activa ante permisos denegados — es el arreglo de P0-2', () => {
    setLocalBypassMode(true, errorDe('permission-denied'));
    expect(isLocalBypassActive()).toBe(false);
  });

  it('NO lo activa ante una sesión caducada', () => {
    setLocalBypassMode(true, errorDe('unauthenticated'));
    expect(isLocalBypassActive()).toBe(false);
  });

  it('una lectura denegada no deja bloqueadas las escrituras que vengan después', () => {
    // Esta es literalmente la cadena que rompía el alta del atleta.
    setLocalBypassMode(true, errorDe('permission-denied')); // lectura de user_profiles
    expect(isLocalBypassActive()).toBe(false);              // saveOnboarding puede intentarlo
  });

  it('sigue activándose cuando no se pasa el error, por compatibilidad', () => {
    setLocalBypassMode(true);
    expect(isLocalBypassActive()).toBe(true);
  });

  it('se puede desactivar', () => {
    setLocalBypassMode(true, errorDe('unavailable'));
    setLocalBypassMode(false);
    expect(isLocalBypassActive()).toBe(false);
  });
});

describe('hayFalloDePermisos', () => {
  beforeEach(() => setLocalBypassMode(false));

  it('sin incidencias, no avisa de nada', () => {
    expect(hayFalloDePermisos()).toBe(false);
  });

  it('avisa tras un fallo de permisos, aunque el modo local no se active', () => {
    setLocalBypassMode(true, errorDe('permission-denied'));
    expect(isLocalBypassActive()).toBe(false);
    expect(hayFalloDePermisos()).toBe(true);
  });

  it('no avisa por un fallo de red — de eso ya avisa el modo local', () => {
    setLocalBypassMode(true, errorDe('unavailable'));
    expect(hayFalloDePermisos()).toBe(false);
  });

  it('se limpia al desactivar el modo local', () => {
    setLocalBypassMode(true, errorDe('permission-denied'));
    setLocalBypassMode(false);
    expect(hayFalloDePermisos()).toBe(false);
  });
});

describe('descartarAvisoDePermisos', () => {
  beforeEach(() => setLocalBypassMode(false));

  it('quita el aviso — sin esto se queda fijo toda la sesión, porque no ofrece "Reintentar"', () => {
    setLocalBypassMode(true, errorDe('permission-denied'));
    expect(hayFalloDePermisos()).toBe(true);
    descartarAvisoDePermisos();
    expect(hayFalloDePermisos()).toBe(false);
  });

  it('el aviso vuelve si el problema sigue vivo', () => {
    setLocalBypassMode(true, errorDe('permission-denied'));
    descartarAvisoDePermisos();
    setLocalBypassMode(true, errorDe('permission-denied')); // la siguiente operación denegada
    expect(hayFalloDePermisos()).toBe(true);
  });

  it('no toca el modo local por red — ese aviso sí tiene "Reintentar" y no se descarta', () => {
    setLocalBypassMode(true, errorDe('unavailable'));
    descartarAvisoDePermisos();
    expect(isLocalBypassActive()).toBe(true);
  });
});

describe('esFalloDePermisos', () => {
  it('distingue permisos de red', () => {
    expect(esFalloDePermisos(errorDe('permission-denied'))).toBe(true);
    expect(esFalloDePermisos(errorDe('unauthenticated'))).toBe(true);
    expect(esFalloDePermisos(errorDe('unavailable'))).toBe(false);
    expect(esFalloDePermisos(null)).toBe(false);
    expect(esFalloDePermisos(new Error('sin code'))).toBe(false);
  });
});

describe('mensajeDeErrorFirestore', () => {
  beforeEach(() => setLocalBypassMode(false));

  it('ante permisos denegados no culpa a la conexión', () => {
    const msg = mensajeDeErrorFirestore(errorDe('permission-denied'), 'guardar tu ficha');
    expect(msg).toMatch(/permiso/i);
    expect(msg).not.toMatch(/conexi[óo]n/i);
  });

  it('ante un fallo de red sí habla de conexión', () => {
    expect(mensajeDeErrorFirestore(errorDe('unavailable'))).toMatch(/conexi[óo]n/i);
  });

  it('explica qué activar cuando el enlace de correo está desactivado', () => {
    const msg = mensajeDeErrorFirestore(errorDe('auth/operation-not-allowed'));
    expect(msg).toMatch(/Vínculo del correo electrónico/);
  });

  it('con un error desconocido y sin modo local, no inventa un problema de red', () => {
    const msg = mensajeDeErrorFirestore(new Error('algo raro'), 'guardar');
    expect(msg).not.toMatch(/Revisa tu conexi[óo]n/i);
    expect(msg).toContain('algo raro');
  });

  it('con un error desconocido y modo local activo, sí es de conexión', () => {
    setLocalBypassMode(true, errorDe('unavailable'));
    expect(mensajeDeErrorFirestore(new Error('algo raro'))).toMatch(/Revisa tu conexi[óo]n/i);
  });

  it('usa la acción en el texto para que el mensaje diga qué falló', () => {
    expect(mensajeDeErrorFirestore(new Error(''), 'enviar la invitación')).toContain('enviar la invitación');
  });
});

describe('invitación con el registro denegado', () => {
  it('no dice que el correo no se envió, porque sí se envió', () => {
    const msg = mensajeDeErrorFirestore(errorDe('invite/registro-denegado'), 'enviar la invitación');
    expect(msg).toMatch(/se ha enviado/i);
    expect(msg).not.toMatch(/no se pudo enviar/i);
  });

  it('avisa de que el atleta no podrá completar el alta', () => {
    // firestore.rules exige exists(/invites/{email}) para que el atleta cree su
    // perfil: sin ese documento el enlace llega y no sirve.
    expect(mensajeDeErrorFirestore(errorDe('invite/registro-denegado')))
      .toMatch(/no podrá completar el alta/i);
  });
});

describe('reintentarNoSirve', () => {
  it('avisa de que reintentar un fallo de permisos es perder el tiempo', () => {
    expect(reintentarNoSirve(errorDe('permission-denied'))).toBe(true);
    expect(reintentarNoSirve(errorDe('unavailable'))).toBe(false);
  });
});

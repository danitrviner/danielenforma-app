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

  it('explica qué activar cuando el método de acceso está desactivado', () => {
    const msg = mensajeDeErrorFirestore(errorDe('auth/operation-not-allowed'));
    expect(msg).toMatch(/Authentication/);
    expect(msg).toMatch(/Método de acceso/);
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

// El alta la hace api/create-athlete.ts, que crea la cuenta de Auth y escribe el
// documento de `invites` en la misma operación con el Admin SDK. Eso parte los
// fallos en dos mundos con consecuencias opuestas, y el mensaje tiene que
// distinguirlos: si se confunden, el coach o reintenta cuando no debe o no
// reintenta cuando sí.
describe('mensajes del alta de un atleta', () => {
  it('cuando falla el alta, deja claro que no ha quedado nada a medias', () => {
    const msg = mensajeDeErrorFirestore(errorDe('invite/alta-fallida'), 'dar de alta');
    expect(msg).toMatch(/no ha quedado nada a medias/i);
    expect(msg).toMatch(/vuelve a intentarlo/i);
  });

  it('cuando solo falla el correo, NO dice que la cuenta no se creó', () => {
    // La cuenta existe y la invitación está registrada: lo único que faltó fue
    // el correo. Decir «no se pudo dar de alta» llevaría al coach a intentarlo
    // otra vez creyendo que el atleta no existe.
    const msg = mensajeDeErrorFirestore(errorDe('invite/correo-fallido'), 'dar de alta');
    expect(msg).toMatch(/se creó correctamente/i);
    expect(msg).not.toMatch(/no se pudo (crear|dar de alta)/i);
    expect(msg).toMatch(/reenviar/i);
  });

  it('los dos casos del alta tienen mensajes distintos', () => {
    // Blindaje contra el atajo de mapearlos al mismo texto: son estados del
    // mundo opuestos (no existe nada / existe todo menos el correo).
    expect(mensajeDeErrorFirestore(errorDe('invite/alta-fallida')))
      .not.toBe(mensajeDeErrorFirestore(errorDe('invite/correo-fallido')));
  });
});

describe('reintentarNoSirve', () => {
  it('avisa de que reintentar un fallo de permisos es perder el tiempo', () => {
    expect(reintentarNoSirve(errorDe('permission-denied'))).toBe(true);
    expect(reintentarNoSirve(errorDe('unavailable'))).toBe(false);
  });
});

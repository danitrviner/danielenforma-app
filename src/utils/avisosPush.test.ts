import { describe, it, expect } from 'vitest';
import type { AppNotification } from '../types';
import {
  DIAS_DE_APLAZO, aplazarHasta, enlaceDelAviso, esIOSPorAgente, estadoDeLaTarjeta, idDelTokenPush,
  mensajeDelAviso, mensajeDelDia, sinDuplicados, tokensMuertos, type EntornoDeAvisos,
} from './avisosPush';

const AHORA = Date.parse('2026-11-18T10:00:00Z');

const entorno = (cambios: Partial<EntornoDeAvisos> = {}): EntornoDeAvisos => ({
  nativa: false, hayClave: true, soportado: true, permiso: 'default', esIOS: false, instalada: false,
  activo: false, desactivadoAMano: false, aplazadoHasta: null, ahora: AHORA, ...cambios,
});

const aviso = (id: string, cambios: Partial<AppNotification> = {}): AppNotification => ({
  id, recipientEmail: 'ana@x.com', type: 'coach_mensaje', title: `Título ${id}`, body: `Texto ${id}`,
  link: 'home', createdAt: '2026-11-18T09:00:00.000Z', read: false, ...cambios,
});

describe('la tarjeta «Activa los avisos»', () => {
  it('sale para ofrecer activar en un navegador que lo admite', () => {
    expect(estadoDeLaTarjeta(entorno())).toBe('activar');
  });

  it('no sale sin clave VAPID, en la app nativa ni si ya está activa', () => {
    expect(estadoDeLaTarjeta(entorno({ hayClave: false }))).toBe('oculta');
    expect(estadoDeLaTarjeta(entorno({ nativa: true }))).toBe('oculta');
    expect(estadoDeLaTarjeta(entorno({ permiso: 'granted', activo: true }))).toBe('oculta');
  });

  it('sin soporte (y no es un iPhone) no sale', () => {
    expect(estadoDeLaTarjeta(entorno({ soportado: false }))).toBe('oculta');
    expect(estadoDeLaTarjeta(entorno({ permiso: 'no_disponible' }))).toBe('oculta');
  });

  it('en el Safari del iPhone sin instalar explica cómo añadirla, aunque no haya soporte', () => {
    expect(estadoDeLaTarjeta(entorno({ esIOS: true, instalada: false, soportado: false }))).toBe('instalar_ios');
  });

  it('en el iPhone ya instalado se comporta como cualquier otro', () => {
    expect(estadoDeLaTarjeta(entorno({ esIOS: true, instalada: true }))).toBe('activar');
  });

  it('con el permiso bloqueado lo dice (y no ofrece activar)', () => {
    expect(estadoDeLaTarjeta(entorno({ permiso: 'denied' }))).toBe('denegado');
  });

  it('permiso concedido pero sin token guardado: ofrece activar (no vuelve a preguntar)', () => {
    expect(estadoDeLaTarjeta(entorno({ permiso: 'granted', activo: false }))).toBe('activar');
  });

  it('«Ahora no» reciente la esconde y vuelve pasado el aplazo', () => {
    const hasta = aplazarHasta('activar', AHORA);
    expect(hasta - AHORA).toBe(DIAS_DE_APLAZO * 86_400_000);
    expect(estadoDeLaTarjeta(entorno({ aplazadoHasta: hasta, ahora: AHORA + 86_400_000 }))).toBe('oculta');
    expect(estadoDeLaTarjeta(entorno({ aplazadoHasta: hasta, ahora: hasta + 1 }))).toBe('activar');
  });

  it('tras «Entendido» con el permiso bloqueado no insiste en mucho tiempo', () => {
    const hasta = aplazarHasta('denegado', AHORA);
    expect(hasta - AHORA).toBeGreaterThan(300 * 86_400_000);
  });

  it('apagado a mano en Ajustes no se le vuelve a ofrecer', () => {
    expect(estadoDeLaTarjeta(entorno({ desactivadoAMano: true }))).toBe('oculta');
    expect(estadoDeLaTarjeta(entorno({ desactivadoAMano: true, esIOS: true }))).toBe('oculta');
  });
});

describe('detectar iPhone', () => {
  it('reconoce el iPhone y el iPad que se presenta como Mac', () => {
    expect(esIOSPorAgente('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari')).toBe(true);
    expect(esIOSPorAgente('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe(true);
    expect(esIOSPorAgente('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)).toBe(false);
    expect(esIOSPorAgente('Mozilla/5.0 (Linux; Android 15) Chrome/140')).toBe(false);
  });
});

describe('el mensaje de un aviso', () => {
  it('lleva título, texto y la ruta de su pestaña', () => {
    const m = mensajeDelAviso(aviso('a', {
      type: 'cuestionario_nuevo', title: 'Tienes un cuestionario nuevo',
      body: '«Cierre de bloque» ya está en Revisión. Unos minutos y listo.', link: 'checkin',
    }));
    expect(m).toEqual({
      titulo: 'Tienes un cuestionario nuevo',
      cuerpo: '«Cierre de bloque» ya está en Revisión. Unos minutos y listo.',
      enlace: '/checkin',
      etiqueta: 'cuestionario_nuevo',
      avisoIds: ['a'],
    });
  });

  it('recorta los textos largos', () => {
    const m = mensajeDelAviso(aviso('a', { title: 'x'.repeat(200), body: 'y'.repeat(400) }));
    expect(m.titulo.length).toBeLessThanOrEqual(65);
    expect(m.cuerpo.length).toBeLessThanOrEqual(160);
    expect(m.cuerpo.endsWith('…')).toBe(true);
  });

  it('un enlace raro (externo, con correo o vacío) abre Inicio', () => {
    expect(enlaceDelAviso(undefined)).toBe('/home');
    expect(enlaceDelAviso('https://malo.com')).toBe('/home');
    expect(enlaceDelAviso('clients/ana@x.com')).toBe('/home');
    expect(enlaceDelAviso('profile?tab=revision')).toBe('/profile?tab=revision');
  });
});

describe('los avisos del día en una sola notificación', () => {
  it('sin avisos no hay mensaje', () => {
    expect(mensajeDelDia([])).toBeNull();
  });

  it('quita duplicados por id y por texto', () => {
    const lista = [aviso('a'), aviso('a'), aviso('b', { title: 'Título a', body: 'Texto a' }), aviso('c')];
    expect(sinDuplicados(lista).map(a => a.id)).toEqual(['a', 'c']);
  });

  it('con uno solo, es ese aviso tal cual', () => {
    expect(mensajeDelDia([aviso('a')])?.titulo).toBe('Título a');
  });

  it('con varios, manda el más importante y cuenta el resto', () => {
    const m = mensajeDelDia([
      aviso('reto', { type: 'weekly_challenge_new', title: 'Reto nuevo' }),
      aviso('rev', { type: 'revision_recordatorio', title: 'Tu revisión ya está abierta', link: 'checkin' }),
      aviso('cues', { type: 'cuestionario_nuevo', title: 'Tienes un cuestionario nuevo', link: 'checkin' }),
    ])!;
    expect(m.titulo).toBe('Tienes un cuestionario nuevo');
    expect(m.enlace).toBe('/checkin');
    expect(m.cuerpo).toMatch(/Y 2 avisos más\.$/);
    expect(m.avisoIds).toEqual(['cues', 'rev', 'reto']);
  });

  it('dos avisos idénticos del mismo día suenan como uno', () => {
    const m = mensajeDelDia([aviso('x', { title: 'Igual', body: 'Igual' }), aviso('y', { title: 'Igual', body: 'Igual' })])!;
    expect(m.cuerpo).toBe('Igual');
    expect(m.avisoIds).toEqual(['x']);
  });
});

describe('tokens muertos', () => {
  it('solo los que FCM da por no registrados o inválidos', () => {
    const tokens = ['t1', 't2', 't3', 't4'];
    expect(tokensMuertos(tokens, [
      { success: true },
      { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      { success: false, error: { code: 'messaging/invalid-argument' } },
      { success: false, error: { code: 'messaging/invalid-registration-token' } },
    ])).toEqual(['t2', 't4']);
  });
});

describe('id del documento del token', () => {
  it('empieza por el UID, es estable y cumple el patrón de las reglas', () => {
    const id = idDelTokenPush('AbC123', 'token-largo:APA91b…');
    expect(id).toBe(idDelTokenPush('AbC123', 'token-largo:APA91b…'));
    expect(id).toMatch(/^AbC123_[a-z0-9]+$/);
    expect(idDelTokenPush('AbC123', 'otro')).not.toBe(id);
  });
});

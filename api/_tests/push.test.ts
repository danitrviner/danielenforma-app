import { describe, it, expect, vi } from 'vitest';
import type { AppNotification } from '../../src/types';
import { avisarPorPush, idDeEnvio, type Mensajeria } from '../_lib/push';

/* El envío de push del servidor contra un Firestore y un FCM de mentira:
   que lea los tokens del atleta, que cada aviso suene una sola vez, que junte
   los de la misma pasada en una notificación y que borre los tokens que FCM da
   por muertos (y solo esos). */

type Doc = Record<string, unknown>;

function firestoreFalso(inicial: Record<string, Record<string, Doc>>) {
  const datos: Record<string, Record<string, Doc>> = JSON.parse(JSON.stringify(inicial));
  const borrados: string[] = [];
  return {
    datos,
    borrados,
    collection(coleccion: string) {
      return {
        where(campo: string, _op: string, valor: unknown) {
          return {
            async get() {
              const docs = Object.entries(datos[coleccion] ?? {})
                .filter(([, d]) => d[campo] === valor)
                .map(([id, d]) => ({
                  id,
                  data: () => d,
                  ref: { delete: async () => { delete datos[coleccion][id]; borrados.push(`${coleccion}/${id}`); } },
                }));
              return { docs };
            },
          };
        },
        doc(id: string) {
          return {
            async create(v: Doc) {
              datos[coleccion] ??= {};
              if (datos[coleccion][id]) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
              datos[coleccion][id] = v;
            },
          };
        },
      };
    },
  };
}

const aviso = (id: string, cambios: Partial<AppNotification> = {}): AppNotification => ({
  id, recipientEmail: 'ana@x.com', type: 'cuestionario_nuevo', title: 'Tienes un cuestionario nuevo',
  body: `Texto ${id}`, link: 'checkin', createdAt: '2026-11-18T09:00:00.000Z', read: false, ...cambios,
});

function fcm(respuestas: Array<{ success: boolean; error?: { code?: string } }> | ((tokens: string[]) => Array<{ success: boolean; error?: { code?: string } }>)) {
  const enviar = vi.fn(async (m: { tokens: string[] }) => {
    const r = typeof respuestas === 'function' ? respuestas(m.tokens) : respuestas;
    return { successCount: r.filter(x => x.success).length, failureCount: r.filter(x => !x.success).length, responses: r };
  });
  return { mensajeria: { sendEachForMulticast: enviar } as unknown as Mensajeria, enviar };
}

const CON_TOKENS = {
  pushTokens: {
    u1_a: { userId: 'u1', email: 'ana@x.com', token: 'tok-movil' },
    u1_b: { userId: 'u1', email: 'ana@x.com', token: 'tok-viejo' },
    u2_a: { userId: 'u2', email: 'otro@x.com', token: 'tok-otro' },
  },
};

describe('avisarPorPush', () => {
  it('manda a todos los dispositivos del atleta, solo datos y con su enlace', async () => {
    const db = firestoreFalso(CON_TOKENS);
    const { mensajeria, enviar } = fcm(ts => ts.map(() => ({ success: true })));
    const r = await avisarPorPush(db as never, mensajeria, 'ana@x.com', [aviso('a')]);
    expect(r).toEqual({ enviados: 2, borrados: 0 });
    const mensaje = enviar.mock.calls[0][0] as unknown as { tokens: string[]; data: Record<string, string> };
    expect(mensaje.tokens.sort()).toEqual(['tok-movil', 'tok-viejo']);
    expect(mensaje.data).toEqual({
      titulo: 'Tienes un cuestionario nuevo', cuerpo: 'Texto a', enlace: '/checkin', etiqueta: 'cuestionario_nuevo',
    });
    // Ni el correo ni el id del aviso viajan en el push.
    expect(JSON.stringify(mensaje)).not.toContain('ana@x.com');
  });

  it('borra los tokens que FCM da por muertos, y solo esos', async () => {
    const db = firestoreFalso(CON_TOKENS);
    const { mensajeria } = fcm(ts => ts.map(t => t === 'tok-viejo'
      ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
      : { success: true }));
    const r = await avisarPorPush(db as never, mensajeria, 'ana@x.com', [aviso('a')]);
    expect(r).toEqual({ enviados: 1, borrados: 1 });
    expect(db.borrados).toEqual(['pushTokens/u1_b']);
    expect(Object.keys(db.datos.pushTokens)).toEqual(['u1_a', 'u2_a']);
  });

  it('un error que no es del token (p. ej. del mensaje) no borra nada', async () => {
    const db = firestoreFalso(CON_TOKENS);
    const { mensajeria } = fcm(ts => ts.map(() => ({ success: false, error: { code: 'messaging/invalid-argument' } })));
    const r = await avisarPorPush(db as never, mensajeria, 'ana@x.com', [aviso('a')]);
    expect(r.borrados).toBe(0);
    expect(db.borrados).toEqual([]);
  });

  it('el mismo aviso no suena dos veces (coach por la tarde, latido por la noche)', async () => {
    const db = firestoreFalso(CON_TOKENS);
    const { mensajeria, enviar } = fcm(ts => ts.map(() => ({ success: true })));
    await avisarPorPush(db as never, mensajeria, 'ana@x.com', [aviso('a')]);
    const segunda = await avisarPorPush(db as never, mensajeria, 'ana@x.com', [aviso('a')]);
    expect(segunda).toEqual({ enviados: 0, borrados: 0, motivo: 'ya_enviado' });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(db.datos.pushEnviados[idDeEnvio('a')]).toMatchObject({ email: 'ana@x.com', tipo: 'cuestionario_nuevo' });
    // El id del documento no lleva el correo a la vista.
    expect(idDeEnvio('cuestionario_nuevo_ana@x.com_q1_2026-11-18')).not.toContain('@');
  });

  it('varios avisos nuevos de la misma pasada salen en UNA notificación', async () => {
    const db = firestoreFalso(CON_TOKENS);
    const { mensajeria, enviar } = fcm(ts => ts.map(() => ({ success: true })));
    await avisarPorPush(db as never, mensajeria, 'ana@x.com', [
      aviso('rev', { type: 'revision_recordatorio', title: 'Tu revisión ya está abierta', body: 'Rev' }),
      aviso('cues'),
    ]);
    expect(enviar).toHaveBeenCalledTimes(1);
    const data = (enviar.mock.calls[0][0] as unknown as { data: Record<string, string> }).data;
    expect(data.titulo).toBe('Tienes un cuestionario nuevo');
    expect(data.cuerpo).toMatch(/Y 1 aviso más\.$/);
  });

  it('sin dispositivos no reclama nada ni llama a FCM', async () => {
    const db = firestoreFalso({ pushTokens: {} });
    const { mensajeria, enviar } = fcm([]);
    const r = await avisarPorPush(db as never, mensajeria, 'ana@x.com', [aviso('a')]);
    expect(r.motivo).toBe('sin_tokens');
    expect(enviar).not.toHaveBeenCalled();
    expect(db.datos.pushEnviados).toBeUndefined();
  });

  it('sin FCM configurado (local, pruebas) no hace nada', async () => {
    const db = firestoreFalso(CON_TOKENS);
    expect((await avisarPorPush(db as never, null, 'ana@x.com', [aviso('a')])).motivo).toBe('sin_mensajeria');
  });

  it('ignora los avisos que no son de ese destinatario', async () => {
    const db = firestoreFalso(CON_TOKENS);
    const { mensajeria, enviar } = fcm([]);
    const r = await avisarPorPush(db as never, mensajeria, 'ana@x.com', [aviso('a', { recipientEmail: 'danitrviner@gmail.com' })]);
    expect(r.motivo).toBe('sin_avisos');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('si FCM revienta, no lanza: el aviso de la campana ya existe', async () => {
    const db = firestoreFalso(CON_TOKENS);
    const mensajeria = { sendEachForMulticast: vi.fn(async () => { throw new Error('sin red'); }) } as unknown as Mensajeria;
    await expect(avisarPorPush(db as never, mensajeria, 'ana@x.com', [aviso('a')])).resolves.toEqual({ enviados: 0, borrados: 0 });
  });
});

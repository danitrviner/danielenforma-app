import { describe, it, expect } from 'vitest';
import { registroQueGana } from './registroDelDia';

const dia = (updatedAt?: string, marca = 'x') => ({ id: 'ana_2026-09-07', marca, updatedAt });

describe('registroQueGana — el día que se le enseña al atleta', () => {
  // El caso de la queja: registra el desayuno sin cobertura (o con la escritura
  // denegada), cierra la app y vuelve. El servidor no tiene nada; el móvil sí.
  it('enseña el local cuando el servidor no tiene el día, y lo reintenta subir', () => {
    const { log, hayQueSubir } = registroQueGana(null, dia('2026-09-07T09:00:00Z', 'desayuno'));
    expect(log?.marca).toBe('desayuno');
    expect(hayQueSubir).toBe(true);
  });

  it('gana el más reciente cuando los dos tienen el día', () => {
    const remoto = dia('2026-09-07T08:00:00Z', 'servidor');
    const local  = dia('2026-09-07T09:00:00Z', 'movil');
    expect(registroQueGana(remoto, local).log?.marca).toBe('movil');
    expect(registroQueGana(remoto, local).hayQueSubir).toBe(true);
    expect(registroQueGana(local, remoto).log?.marca).toBe('movil');
    expect(registroQueGana(local, remoto).hayQueSubir).toBe(false);
  });

  it('ante la duda manda el servidor', () => {
    // Espejo local sin marca de tiempo (registro anterior a este arreglo).
    expect(registroQueGana(dia('2026-09-07T08:00:00Z', 'servidor'), dia(undefined, 'movil')).log?.marca)
      .toBe('servidor');
    // Servidor sin marca y local con ella: el local es posterior por definición.
    expect(registroQueGana(dia(undefined, 'servidor'), dia('2026-09-07T08:00:00Z', 'movil')).log?.marca)
      .toBe('movil');
  });

  it('sin local, el servidor tal cual', () => {
    const { log, hayQueSubir } = registroQueGana(dia('2026-09-07T08:00:00Z', 'servidor'), null);
    expect(log?.marca).toBe('servidor');
    expect(hayQueSubir).toBe(false);
  });

  it('un día que no existe en ningún sitio sigue sin existir', () => {
    expect(registroQueGana(null, null)).toEqual({ log: null, hayQueSubir: false });
  });
});

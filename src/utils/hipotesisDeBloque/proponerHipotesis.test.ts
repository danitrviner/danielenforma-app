import { describe, expect, it } from 'vitest';
import type { LecturaDeHipotesis, PalancaDeHipotesis } from '../../types';
import { propuestaZona } from '../cdg/agujetas';
import type { EstadoDelBloque } from './estadoDelBloqueAnterior';
import type { BloqueConCierre } from './historial';
import { otraPalanca } from './palancas';
import { IEM_ZONA_ALTA, SUBIDA_DE_PROCESO_PCT } from './cifras';
import { NOTA_DE_DEFICIT, cifrasDeHipotesis, proponerHipotesis, rmObjetivoPorDefecto } from './proponerHipotesis';
import { veredictoDeHipotesis } from './veredicto';

const anterior = (porZona: Record<string, { iemMedio: number; iemFinal: number }>): Pick<EstadoDelBloque, 'porZona'> => ({
  porZona: Object.fromEntries(Object.entries(porZona).map(([zona, v]) => [zona, { zona, ...v, porSemana: [] }])) as EstadoDelBloque['porZona'],
});

/** Un bloque cerrado con el veredicto de una zona. */
const cerrado = (n: number, zona: string, palanca: PalancaDeHipotesis, lectura: LecturaDeHipotesis): BloqueConCierre => ({
  id: `m${n}`, number: n, startDate: `2026-0${n}-01`, tipoBloque: 'desarrollo', hipotesis: { [zona]: { palanca } },
  cierreDeHipotesis: {
    firmadoEn: `2026-0${n}-28T10:00:00.000Z`,
    veredictos: [{ zona, palanca, iemMedio: 15, procesoCumplido: true, rmPct: 1, rmObjetivoPct: 5, resultadoCumplido: lectura === 'confirmada', lectura }],
  },
});

describe('el ejemplo de Dani: la zona acaba el bloque anterior en 16', () => {
  const estado = anterior({ pectoral: { iemMedio: 14, iemFinal: 16 } });

  it('con la semana 1 reducida arranca en ~15, vuelve a 16 y su techo es ~17-18, nunca 20', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], semana1Reducida: true, anterior: estado });
    const h = r.hipotesis.pectoral!;
    expect(h).toEqual({
      palanca: 'volumen',
      iemMedioAnterior: 14, iemFinalAnterior: 16,
      iemMedioObjetivo: 16.8, // donde ACABÓ el anterior + medio escalón (5 %), no su media + 10 %
      iemArranque: 14.9,      // 16 − 7 %
      iemTecho: 17.6,         // 16 + un escalón suave (10 %)
      rmObjetivoPct: 5,
    });
    expect(h.iemArranque!).toBeGreaterThanOrEqual(16 * 0.90); // dentro del 5-10 % acordado
    expect(h.iemArranque!).toBeLessThanOrEqual(16 * 0.95);
    expect(h.iemTecho!).toBeGreaterThanOrEqual(17);
    expect(h.iemTecho!).toBeLessThanOrEqual(18);
    expect(h.iemTecho!).toBeLessThan(20);
  });

  it('sin la semana 1 reducida arranca donde acabó', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado });
    expect(r.hipotesis.pectoral).toMatchObject({ iemArranque: 16, iemTecho: 17.6 });
  });

  it('el techo es el objetivo que lee el protocolo semanal, y la estrella va en dinámico', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado });
    expect(r.cdgObjetivosIem).toEqual({ pectoral: 17.6 });
    expect(r.cdgModoPorZona.pectoral).toBe('dinamico');
    expect(r.cdgModoPorZona.dorsal).toBe('estatico');
    // Encima del protocolo, sin sustituirlo: desde 16 propone subir; al llegar al techo ya no.
    const args = { agujetas: 1, sensible: false, tipo: { sensibilidad: r.cdgModoPorZona.pectoral, velocidad: 'suave' as const }, esObjetivo: true, contexto: 'favorable' as const, objetivo: r.cdgObjetivosIem.pectoral };
    const desde16 = propuestaZona({ ...args, iem: 16 });
    expect(desde16.tono).toBe('acelerar');
    expect(desde16.iemPropuesto).toBeLessThanOrEqual(17.6);
    expect(propuestaZona({ ...args, iem: 17.6 }).tono).toBe('objetivo');
  });

  it('con otra velocidad el escalón es el suyo (medio: +20 %)', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], velocidad: 'medio', anterior: estado });
    expect(r.hipotesis.pectoral?.iemTecho).toBe(19.2);
  });

  it('el objetivo de proceso sale de donde acabó, no de la media: da igual que el bloque anterior fuera plano, en rampa o bajando', () => {
    for (const iemMedio of [16, 14, 18]) {
      const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: anterior({ pectoral: { iemMedio, iemFinal: 16 } }) });
      expect(r.hipotesis.pectoral?.iemMedioObjetivo).toBe(16.8);
      expect(r.hipotesis.pectoral!.iemMedioObjetivo!).toBeLessThanOrEqual(r.hipotesis.pectoral!.iemTecho!);
    }
  });

  it('medio escalón de la velocidad del bloque: +5 % en suave, +10 % en medio', () => {
    expect(SUBIDA_DE_PROCESO_PCT).toBe(5);
    const medio = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], velocidad: 'medio', anterior: estado });
    expect(medio.hipotesis.pectoral).toMatchObject({ iemMedioObjetivo: 17.6, iemTecho: 19.2 });
  });
});

/* Lo medido en la auditoría de cifras (17-11-2026): con el bloque anterior en
   rampa, el objetivo viejo (media 52 + 10 % = 57,2, cumplido al 95 % con 54,3)
   ya estaba cumplido al arrancar en 58 sin subir nada. */
describe('corrección 3 · bloque anterior con rampa (media 52, final 58), velocidad suave', () => {
  const rampa = anterior({ pectoral: { iemMedio: 52, iemFinal: 58 } });
  const h = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], velocidad: 'suave', anterior: rampa }).hipotesis.pectoral!;
  const proceso = (iemMedio: number) => veredictoDeHipotesis({ zona: 'pectoral', hipotesis: h, iemMedio, rm: { rmPct: 6 } }).procesoCumplido;

  it('el objetivo de proceso es 60,9: donde acabó (58) + 5 %, con techo 63,8', () => {
    expect(h).toMatchObject({ iemMedioAnterior: 52, iemFinalAnterior: 58, iemArranque: 58, iemMedioObjetivo: 60.9, iemTecho: 63.8 });
  });

  it('NO está cumplido en el arranque: quedarse en 58 todo el bloque no cumple', () => {
    expect(proceso(58)).toBe(false);
    // Ni con lo que antes bastaba (el 95 % de 57,2) ni con el propio 57,2.
    expect(proceso(54.3)).toBe(false);
    expect(proceso(57.2)).toBe(false);
  });

  it('cumplido si la media es 60,9 o más, sin tolerancia', () => {
    expect(proceso(60.8)).toBe(false);
    expect(proceso(60.9)).toBe(true);
    expect(proceso(62)).toBe(true);
  });

  it('60,9 es justo la media de dar el escalón en la semana 7 de 12 (6 semanas en 58 y 6 en 63,8)', () => {
    const media = (semanasAbajo: number) => (58 * semanasAbajo + 63.8 * (12 - semanasAbajo)) / 12;
    expect(proceso(media(6))).toBe(true);   // sube en la semana 7
    expect(proceso(media(7))).toBe(false);  // sube en la semana 8: ya no llega
  });
});

describe('corrección 3 · si la zona no sube, el objetivo de proceso es sostener (el 95 % de donde acabó)', () => {
  const estado58 = { iemMedio: 52, iemFinal: 58 };
  it('palanca «ejercicios»: techo donde acabó y media de 55,1 o más', () => {
    expect(cifrasDeHipotesis({ palanca: 'ejercicios', estado: estado58 })).toMatchObject({ iemTecho: 58, iemMedioObjetivo: 55.1, iemArranque: 58 });
  });
  it('techo sin subir (`subir: false`): lo mismo, aunque la palanca sea de las que suben', () => {
    expect(cifrasDeHipotesis({ palanca: 'volumen', estado: estado58, subir: false })).toMatchObject({ iemTecho: 58, iemMedioObjetivo: 55.1 });
  });
  it('recuperar no lleva objetivo de media: su proceso es bajar', () => {
    expect(cifrasDeHipotesis({ palanca: 'recuperar', estado: estado58 }).iemMedioObjetivo).toBeUndefined();
  });
  it('el veredicto lo da por hecho con 55,1 y no con 55', () => {
    const h = cifrasDeHipotesis({ palanca: 'ejercicios', estado: estado58 });
    const proceso = (iemMedio: number) => veredictoDeHipotesis({ zona: 'pectoral', hipotesis: h, iemMedio, rm: { rmPct: 6 } }).procesoCumplido;
    expect(proceso(55.1)).toBe(true);
    expect(proceso(55)).toBe(false);
  });
});

describe('corrección 5 · el objetivo de resultado según el caso', () => {
  const estado = anterior({ pectoral: { iemMedio: 52, iemFinal: 58 }, deltoides: { iemMedio: 38, iemFinal: 40 } });
  const base = { tipo: 'desarrollo' as const, estrellas: ['pectoral', 'deltoides'] as const, anterior: estado };

  it('por defecto: 5 % en intermedio y avanzado, 8 % en principiante, 0 % (no perder) en déficit o recuperando', () => {
    expect(rmObjetivoPorDefecto()).toBe(5);
    expect(rmObjetivoPorDefecto({ nivel: 'intermedio' })).toBe(5);
    expect(rmObjetivoPorDefecto({ nivel: 'avanzado' })).toBe(5);
    expect(rmObjetivoPorDefecto({ nivel: 'principiante' })).toBe(8);
    expect(rmObjetivoPorDefecto({ nivel: 'principiante', enDeficit: true })).toBe(0);
    expect(rmObjetivoPorDefecto({ palanca: 'recuperar', nivel: 'principiante' })).toBe(0);
  });

  it('principiante: se le pide un 8 % y el estímulo sube como a cualquiera', () => {
    const r = proponerHipotesis({ ...base, nivel: 'principiante' });
    expect(r.hipotesis.pectoral).toMatchObject({ rmObjetivoPct: 8, iemTecho: 63.8, iemMedioObjetivo: 60.9 });
    expect(r.hipotesis.deltoides?.rmObjetivoPct).toBe(8);
    expect(r.nivel).toBe('principiante');
    expect(r.notas).toEqual({});
  });

  it('en déficit: 0 % (no perder), el techo no sube y el proceso es sostener; la ficha lo dice', () => {
    const r = proponerHipotesis({ ...base, enDeficit: true, nivel: 'principiante' });
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'volumen', rmObjetivoPct: 0, iemTecho: 58, iemArranque: 58, iemMedioObjetivo: 55.1 });
    expect(r.hipotesis.deltoides).toMatchObject({ rmObjetivoPct: 0, iemTecho: 40, iemMedioObjetivo: 38 });
    expect(r.cdgObjetivosIem).toEqual({ pectoral: 58, deltoides: 40 });
    expect(r.enDeficit).toBe(true);
    expect(r.notas.pectoral).toEqual([{ clave: 'deficit', texto: NOTA_DE_DEFICIT }]);
    expect(NOTA_DE_DEFICIT).toBe('Bloque en déficit: se pide no perder fuerza y no se sube el estímulo.');
  });

  it('en déficit, el veredicto da el resultado por bueno mientras el RM no caiga más que el ruido (−3 %)', () => {
    const h = proponerHipotesis({ ...base, enDeficit: true }).hipotesis.pectoral!;
    const v = (rmPct: number) => veredictoDeHipotesis({ zona: 'pectoral', hipotesis: h, iemMedio: 57, rm: { rmPct } });
    expect(v(-2.9)).toMatchObject({ resultadoCumplido: true, procesoCumplido: true, lectura: 'confirmada' });
    expect(v(0).resultadoCumplido).toBe(true);
    expect(v(-3)).toMatchObject({ resultadoCumplido: false, lectura: 'no_responde' });
  });

  it('es una sugerencia: el objetivo que el coach ya puso se respeta al rehacer las cifras', () => {
    expect(cifrasDeHipotesis({ palanca: 'volumen', estado: { iemMedio: 52, iemFinal: 58 }, enDeficit: true, rmObjetivoPct: 3 }).rmObjetivoPct).toBe(3);
  });
});

describe('corrección 7 · techo con la zona ya alta (80 de IEM o más)', () => {
  const zona82 = anterior({ pectoral: { iemMedio: 78, iemFinal: 82 } });
  const proponer = (o: Partial<Parameters<typeof proponerHipotesis>[0]> = {}) =>
    proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: zona82, ...o });

  it('el umbral es 80', () => expect(IEM_ZONA_ALTA).toBe(80));

  it('zona que acabó en 82: el techo se queda en 82 y la palanca deja de ser volumen (intensidad)', () => {
    const r = proponer();
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'intensidad', iemTecho: 82, iemArranque: 82, iemMedioObjetivo: 77.9, rmObjetivoPct: 5 });
    expect(r.hipotesis.pectoral?.palanca).not.toBe('volumen');
    expect(r.cdgObjetivosIem).toEqual({ pectoral: 82 });
    expect(r.porQue.pectoral).toBe('Zona ya alta: la apuesta pasa de volumen a intensidad.');
    expect(r.notas.pectoral?.[0]).toEqual({
      clave: 'zona_alta',
      texto: 'Zona ya alta: acabó en 82 de IEM y de 80 en adelante se va con cuidado. El techo no sube y la apuesta deja de ser volumen (pasa a intensidad).',
    });
  });

  it('si el historial dice que la intensidad ya falló, pasa a cambio de ejercicios', () => {
    const r = proponer({ historial: [cerrado(1, 'pectoral', 'intensidad', 'no_responde'), cerrado(2, 'pectoral', 'volumen', 'confirmada')] });
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'ejercicios', iemTecho: 82 });
  });

  it('en 80 justo ya no sube; en 79,9 sube como siempre', () => {
    expect(proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: anterior({ pectoral: { iemMedio: 76, iemFinal: 80 } }) }).hipotesis.pectoral)
      .toMatchObject({ palanca: 'intensidad', iemTecho: 80 });
    expect(proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: anterior({ pectoral: { iemMedio: 76, iemFinal: 79.9 } }) }).hipotesis.pectoral)
      .toMatchObject({ palanca: 'volumen', iemTecho: 87.9 });
  });

  it('ya no escala sin tope: cuatro bloques seguidos confirmados desde 58 se paran al pasar de 80 (antes llegaban a 85)', () => {
    let final = 58;
    const techos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const h = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: anterior({ pectoral: { iemMedio: final, iemFinal: final } }) }).hipotesis.pectoral!;
      techos.push(h.iemTecho!);
      final = h.iemTecho!; // el bloque acaba en su techo
    }
    expect(techos).toEqual([63.8, 70.2, 77.2, 84.9]);
    // El quinto bloque parte de 84,9: zona alta, no sube más.
    expect(proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: anterior({ pectoral: { iemMedio: 84.9, iemFinal: 84.9 } }) }).hipotesis.pectoral?.iemTecho).toBe(84.9);
  });

  it('editable: si el coach elige volumen a mano se respeta la palanca, y el techo sigue sin subir por defecto', () => {
    const r = proponer({ palancas: { pectoral: 'volumen' } });
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'volumen', iemTecho: 82 });
    expect(r.porQue.pectoral).toBe('Palanca elegida a mano.');
    expect(r.notas.pectoral?.[0].texto).toBe('Zona ya alta: acabó en 82 de IEM y de 80 en adelante se va con cuidado. El techo no sube.');
  });
});

describe('sin bloque anterior', () => {
  it('no hay cifras de IEM: solo palanca y objetivo de resultado', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral', 'deltoides'] });
    expect(r.hipotesis).toEqual({ pectoral: { palanca: 'volumen', rmObjetivoPct: 5 }, deltoides: { palanca: 'volumen', rmObjetivoPct: 5 } });
    expect(r.cdgObjetivosIem).toEqual({});
    expect(r.cdgModoPorZona.deltoides).toBe('dinamico');
    expect(r.porQue.pectoral).toContain('se empieza por volumen');
  });

  it('una zona que el bloque anterior no trabajó tampoco tiene cifras', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['gemelos'], anterior: anterior({ pectoral: { iemMedio: 14, iemFinal: 16 } }) });
    expect(r.hipotesis.gemelos).toEqual({ palanca: 'volumen', rmObjetivoPct: 5 });
  });
});

describe('la palanca sale del historial de veredictos', () => {
  const estado = anterior({ pectoral: { iemMedio: 14, iemFinal: 16 } });
  const proponer = (historial: BloqueConCierre[]) => proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado, historial });

  it('confirmada → misma línea y un escalón más', () => {
    const r = proponer([cerrado(1, 'pectoral', 'intensidad', 'confirmada')]);
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'intensidad', iemTecho: 17.6 });
  });

  it('no responde → la otra palanca', () => {
    const r = proponer([cerrado(1, 'pectoral', 'volumen', 'no_responde')]);
    expect(r.hipotesis.pectoral?.palanca).toBe('intensidad');
    expect(r.porQue.pectoral).toBe('No respondió a volumen: se prueba intensidad.');
    expect(r.avisos).toEqual([]);
  });

  it('no responde dos veces seguidas → cambio de ejercicios y aviso de pasar la estrella', () => {
    const r = proponer([cerrado(1, 'pectoral', 'volumen', 'no_responde'), cerrado(2, 'pectoral', 'intensidad', 'no_responde')]);
    expect(r.hipotesis.pectoral?.palanca).toBe('ejercicios');
    expect(r.hipotesis.pectoral?.iemTecho).toBe(16); // mismo estímulo con otros ejercicios: no se sube
    expect(r.avisos.join(' ')).toContain('Pectoral: 2 bloques seguidos sin responder');
  });

  it('responde con menos → no subir: el techo se queda donde acabó y el proceso es sostenerlo (el 95 %)', () => {
    const r = proponer([cerrado(1, 'pectoral', 'volumen', 'responde_con_menos')]);
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'volumen', iemTecho: 16, iemMedioObjetivo: 15.2, iemArranque: 16 });
    expect(r.cdgObjetivosIem.pectoral).toBe(16);
  });

  it('mejora parcial → misma línea SIN subir el techo, sin cambiar de palanca y sin aviso de estrella', () => {
    const r = proponer([cerrado(1, 'pectoral', 'volumen', 'mejora_parcial')]);
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'volumen', iemTecho: 16, iemMedioObjetivo: 15.2, iemArranque: 16 });
    expect(r.porQue.pectoral).toBe('Mejoró menos de lo buscado con volumen: misma línea, sin subir el techo.');
    expect(r.avisos).toEqual([]);
  });

  it('dos mejoras parciales seguidas tampoco avisan de pasar la estrella; dos «no responde», sí', () => {
    const parciales = proponer([cerrado(1, 'pectoral', 'volumen', 'mejora_parcial'), cerrado(2, 'pectoral', 'volumen', 'mejora_parcial')]);
    expect(parciales.hipotesis.pectoral?.palanca).toBe('volumen');
    expect(parciales.avisos).toEqual([]);
    const noResponde = proponer([cerrado(1, 'pectoral', 'volumen', 'no_responde'), cerrado(2, 'pectoral', 'intensidad', 'no_responde')]);
    expect(noResponde.avisos.join(' ')).toContain('2 bloques seguidos sin responder');
  });

  it('una mejora parcial entre dos «no responde» corta la racha', () => {
    const r = proponer([cerrado(1, 'pectoral', 'volumen', 'no_responde'), cerrado(2, 'pectoral', 'intensidad', 'mejora_parcial'), cerrado(3, 'pectoral', 'intensidad', 'no_responde')]);
    expect(r.avisos).toEqual([]);
  });

  it('sin probar → se repite la misma hipótesis', () => {
    const r = proponer([cerrado(1, 'pectoral', 'intensidad', 'sin_probar')]);
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'intensidad', iemTecho: 17.6 });
  });

  it('manda el último veredicto de la zona, vengan en el orden que vengan; los de otras zonas no cuentan', () => {
    const r = proponer([cerrado(2, 'pectoral', 'intensidad', 'confirmada'), cerrado(1, 'pectoral', 'volumen', 'no_responde'), cerrado(3, 'deltoides', 'volumen', 'no_responde')]);
    expect(r.hipotesis.pectoral?.palanca).toBe('intensidad');
  });

  it('la palanca que el coach eligió a mano manda, y su límite se conserva', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado, palancas: { pectoral: 'intensidad' }, limites: { pectoral: ' hombro sin molestias ' } });
    expect(r.hipotesis.pectoral).toMatchObject({ palanca: 'intensidad', limite: 'hombro sin molestias' });
    expect(r.porQue.pectoral).toBe('Palanca elegida a mano.');
  });

  it('otraPalanca: volumen ↔ intensidad y, agotadas las dos, ejercicios', () => {
    expect(otraPalanca('volumen')).toBe('intensidad');
    expect(otraPalanca('intensidad')).toBe('volumen');
    expect(otraPalanca('intensidad', ['volumen'])).toBe('ejercicios');
    expect(otraPalanca('ejercicios')).toBe('volumen');
    expect(otraPalanca('recuperar')).toBe('volumen');
  });
});

describe('estrellas y resto de zonas', () => {
  const estado = anterior({ pectoral: { iemMedio: 14, iemFinal: 16 }, dorsal: { iemMedio: 18, iemFinal: 20 }, biceps: { iemMedio: 8, iemFinal: 9 } });

  it('avisa a partir de 4 estrellas, y en especialización con más de una; propone todas igualmente (Dani, 18-11-2026)', () => {
    expect(proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral', 'dorsal'] }).avisos).toEqual([]);
    expect(proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral', 'dorsal', 'biceps'] }).avisos).toEqual([]);
    const cuatro = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral', 'dorsal', 'biceps', 'gluteo'] });
    expect(cuatro.avisos).toHaveLength(1);
    expect(Object.keys(cuatro.hipotesis)).toHaveLength(4);
    const dos = proponerHipotesis({ tipo: 'especializacion', estrellas: ['pectoral', 'dorsal'] });
    expect(dos.avisos[0]).toContain('una sola estrella');
    expect(Object.keys(dos.hipotesis)).toEqual(['pectoral', 'dorsal']);
  });

  it('desarrollo: el resto sigue como estaba, sin cifra', () => {
    const r = proponerHipotesis({ tipo: 'desarrollo', estrellas: ['pectoral'], anterior: estado });
    expect(r.iemDelResto).toEqual({});
  });

  it('mantenimiento: sin estrellas; el resto baja a la mitad solo donde el coach lo ha puesto en mantener', () => {
    const r = proponerHipotesis({ tipo: 'mantenimiento', estrellas: [], anterior: estado });
    expect(r.hipotesis).toEqual({});
    expect(r.cdgObjetivosIem).toEqual({});
    // El tipo lo recomienda, no lo hace (Dani, 18-11-2026): sin decir nada, nada baja.
    expect(r.iemDelResto).toEqual({});
    expect(Object.values(r.cdgModoPorZona).every(m => m === 'estatico')).toBe(true);
    const aceptado = proponerHipotesis({ tipo: 'mantenimiento', estrellas: [], anterior: estado, resto: { pectoral: 'mantener', dorsal: 'mantener', biceps: 'mantener' } });
    expect(aceptado.iemDelResto).toEqual({ pectoral: 8, dorsal: 10, biceps: 4.5 });
  });

  it('especialización: la estrella sube; el resto no baja solo, y con mantener es la mitad e ignorar es 0', () => {
    const r = proponerHipotesis({ tipo: 'especializacion', estrellas: ['pectoral'], anterior: estado, resto: { biceps: 'ignorar', dorsal: 'como_estaba' } });
    expect(r.cdgObjetivosIem).toEqual({ pectoral: 17.6 });
    expect(r.iemDelResto).toEqual({ biceps: 0 });
    const porDefecto = proponerHipotesis({ tipo: 'especializacion', estrellas: ['pectoral'], anterior: estado });
    expect(porDefecto.iemDelResto).toEqual({});
    const aceptado = proponerHipotesis({ tipo: 'especializacion', estrellas: ['pectoral'], anterior: estado, resto: { dorsal: 'mantener', biceps: 'mantener' } });
    expect(aceptado.iemDelResto).toEqual({ dorsal: 10, biceps: 4.5 });
  });
});

describe('cifrasDeHipotesis', () => {
  it('recuperar: la zona baja a la mitad y del RM solo se pide no perderlo', () => {
    expect(cifrasDeHipotesis({ palanca: 'recuperar', estado: { iemMedio: 14, iemFinal: 16 } })).toEqual({
      palanca: 'recuperar', iemMedioAnterior: 14, iemFinalAnterior: 16, iemArranque: 8, iemTecho: 8, rmObjetivoPct: 0,
    });
  });
  it('no deja campos `undefined` (Firestore no los admite)', () => {
    const h = cifrasDeHipotesis({ palanca: 'volumen' });
    expect(Object.values(h).every(v => v !== undefined)).toBe(true);
    expect(Object.keys(h)).toEqual(['palanca', 'rmObjetivoPct']);
  });
});

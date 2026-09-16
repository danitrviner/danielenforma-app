import { describe, it, expect } from 'vitest';
import { construirTitulares } from './titularesRevision';
import type { RevisionDelAtleta } from './revisionCoach';
import type { ComidaDeLaSemana } from './comidaDeLaSemana';

/** Una revisión mínima: solo lo que el motor de titulares llega a mirar. */
function revision(parcial: Record<string, unknown> = {}): RevisionDelAtleta {
  return {
    ventana: { etiqueta: 'Últimos 7 días' },
    informe: { sessions: 4, comparisonLabel: 'vs la semana anterior', perExercise: [] },
    mapa: [],
    suben: [],
    bajan: [],
    bienestar: { irp: { valor: 4.2 }, domsCronico: [] },
    ...parcial,
  } as unknown as RevisionDelAtleta;
}

const ids = (r: ReturnType<typeof construirTitulares>) => r.titulares.map(t => t.id);

describe('construirTitulares', () => {
  it('las alarmas van antes que lo que va bien, y lo neutro al final', () => {
    const r = construirTitulares({
      revision: revision({
        mapa: [{ label: 'Pecho', prioridad: 'alta', zona: 'sin_volumen' }],
        suben: [{ name: 'Press banca', deltaOrmPct: 6 }],
        informe: {
          sessions: 4, comparisonLabel: 'vs la semana anterior',
          perExercise: [{ isPR: true }],
        },
      }),
    });
    const tonos = r.titulares.map(t => t.tono);
    expect(tonos).toEqual([...tonos].sort((a, b) =>
      ({ alarma: 0, bien: 1, neutro: 2 })[a] - ({ alarma: 0, bien: 1, neutro: 2 })[b]));
    expect(ids(r)).toContain('prioritarios_sin_volumen');
    expect(ids(r)).toContain('records');
  });

  it('sin sesiones lo canta como alarma', () => {
    const r = construirTitulares({
      revision: revision({ informe: { sessions: 0, comparisonLabel: 'x', perExercise: [] } }),
    });
    expect(r.titulares[0].id).toBe('sin_sesiones');
    expect(r.titulares[0].tono).toBe('alarma');
  });

  it('no inventa un titular de peso cuando falta la comparación', () => {
    const sinPeso = construirTitulares({ revision: revision(), peso: null });
    expect(ids(sinPeso)).not.toContain('peso');

    const conPeso = construirTitulares({
      revision: revision(),
      peso: { estaSemana: 80.4, semanaAnterior: 81, deltaKg: -0.6, registrosEstaSemana: 3 },
    });
    expect(conPeso.titulares.find(t => t.id === 'peso')?.texto)
      .toBe('Peso: 80,4 kg de media, −0,6 kg respecto a la semana pasada.');
  });

  it('un ejercicio que sube no puede salir también como que baja', () => {
    const r = construirTitulares({
      revision: revision({
        suben: [{ name: 'Press banca', deltaOrmPct: 6 }],
        bajan: [{ name: 'Remo', deltaOrmPct: 2 }],   // positivo: no es un bajón
      }),
    });
    expect(ids(r)).toContain('sube');
    expect(ids(r)).not.toContain('baja');
  });

  it('solo avisa de los huecos de comida si son mayoría de la ventana', () => {
    const comida = (sinRegistrar: number, registrados: number): ComidaDeLaSemana => ({
      dias: [],
      patrones: {
        diasSinRegistrar: sinRegistrar, diasRegistrados: registrados,
        diasPorEncima: 0, diasPorDebajo: 0, diasEnObjetivo: registrados,
        desvioMedio: 0, kcalMediaComido: 0, kcalMediaCupo: 0,
        alimentosFrecuentes: [], porComida: [], porOrigen: { mano: 0, receta: 0, menu: 0 },
      },
    } as unknown as ComidaDeLaSemana);

    expect(ids(construirTitulares({ revision: revision(), comida: comida(2, 5) })))
      .not.toContain('comida_sin_registrar');
    expect(ids(construirTitulares({ revision: revision(), comida: comida(5, 2) })))
      .toContain('comida_sin_registrar');
  });

  it('el borrador va en segunda persona y avisa de que hay que editarlo', () => {
    const r = construirTitulares({
      revision: revision({ suben: [{ name: 'Press banca', deltaOrmPct: 6 }] }),
      athleteName: 'Gonzalo Dev',
    });
    expect(r.resumenParaCliente).toContain('Gonzalo,');
    expect(r.resumenParaCliente).toContain('Has entrenado 4 días.');
    expect(r.resumenParaCliente).toContain('edita esto antes de mandárselo');
    // Nada de jerga de coach en lo que se le manda al atleta.
    expect(r.resumenParaCliente).not.toMatch(/tonelaje|MEV|MAV|IEA/i);
  });
});

describe('el borrador solo dice lo que se le puede decir al atleta', () => {
  it('deja fuera los titulares que solo existen en voz de coach', () => {
    const r = construirTitulares({
      revision: {
        ventana: { etiqueta: 'Últimos 7 días' },
        informe: { sessions: 3, comparisonLabel: 'vs la semana anterior', perExercise: [] },
        // Este titular es una decisión de programación: no tiene versión para él.
        mapa: [{ label: 'Pecho', prioridad: 'alta', zona: 'sin_volumen' }],
        suben: [], bajan: [],
        bienestar: { irp: { valor: 4 }, domsCronico: [] },
      } as unknown as RevisionDelAtleta,
    });
    const coach = r.titulares.find(t => t.id === 'prioritarios_sin_volumen');
    expect(coach).toBeDefined();
    expect(coach?.paraCliente).toBeUndefined();
    expect(r.resumenParaCliente).not.toContain('mínimo efectivo');
    expect(r.resumenParaCliente).not.toContain('prioridad alta');
  });

  it('los que sí la tienen aparecen en segunda persona', () => {
    const r = construirTitulares({
      revision: {
        ventana: { etiqueta: 'Últimos 7 días' },
        informe: {
          sessions: 3, comparisonLabel: 'vs la semana anterior',
          perExercise: [{ isPR: true }],
        },
        mapa: [], suben: [], bajan: [],
        bienestar: { irp: { valor: 4 }, domsCronico: [{ grupo: 'cuadriceps', media: 7.7 }] },
      } as unknown as RevisionDelAtleta,
    });
    expect(r.resumenParaCliente).toContain('Has hecho 1 récord personal.');
    expect(r.resumenParaCliente).toContain('Llevas semanas con agujetas en cuádriceps');
  });
});

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
    bienestar: { domsCronico: [] },
    ...parcial,
  } as unknown as RevisionDelAtleta;
}

const ids = (r: ReturnType<typeof construirTitulares>) => r.titulares.map(t => t.id);

describe('construirTitulares', () => {
  it('las alarmas van antes que lo que va bien, y lo neutro al final', () => {
    const r = construirTitulares({
      revision: revision({
        bajan: [{ exerciseId: 'remo', name: 'Remo', deltaOrmPct: -5 }],
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
    expect(ids(r)).toContain('baja');
    expect(ids(r)).toContain('records');
  });

  it('ya no habla de grupos musculares (Dani, 18-11-2026)', () => {
    const r = construirTitulares({
      revision: revision({
        mapa: [{ label: 'Pecho', prioridad: 'alta', zona: 'sin_volumen' }],
        bienestar: { domsCronico: [] },
      }),
    });
    expect(ids(r)).not.toContain('prioritarios_sin_volumen');
    expect(r.titulares.map(t => t.texto).join(' ')).not.toMatch(/mínimo efectivo/);
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

  it('«va a menos» no salta con una bajada por debajo del ruido de medida (3 %)', () => {
    const con = (deltaOrmPct: number) => construirTitulares({
      revision: revision({ bajan: [{ exerciseId: 'remo', name: 'Remo', deltaOrmPct }] }),
    });
    expect(ids(con(-2))).not.toContain('baja');
    expect(ids(con(-2.9))).not.toContain('baja');
    expect(ids(con(-3))).toContain('baja');
    // Y con la tarea cambiada, tampoco se menciona un −2 %: no hay nada que explicar.
    const cambiada = construirTitulares({
      revision: revision({
        bajan: [{ exerciseId: 'remo', name: 'Remo', deltaOrmPct: -2 }],
        cambiosDeTarea: { remo: { date: '2026-10-08', cambios: ['orden'] } },
      }),
    });
    expect(ids(cambiada)).not.toContain('baja_no_comparable');
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
        informe: { sessions: 3, comparisonLabel: 'vs la semana anterior', perExercise: [{ exerciseId: 'press', name: 'Press banca' }] },
        // Este titular es una decisión de programación: no tiene versión para él.
        limitantes: [{ exerciseId: 'press', motivo: 'agarre', veces: 3, de: 4, arreglo: 'usa straps' }],
        mapa: [], suben: [], bajan: [],
        bienestar: { domsCronico: [] },
      } as unknown as RevisionDelAtleta,
    });
    const coach = r.titulares.find(t => t.id === 'limitante_press');
    expect(coach).toBeDefined();
    expect(coach?.paraCliente).toBeUndefined();
    expect(r.resumenParaCliente).not.toContain('agarre');
    expect(r.resumenParaCliente).not.toContain('straps');
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
        bienestar: { domsCronico: [{ grupo: 'cuadriceps', media: 7.7 }] },
      } as unknown as RevisionDelAtleta,
    });
    expect(r.resumenParaCliente).toContain('Has hecho 1 récord personal.');
    expect(r.resumenParaCliente).toContain('Llevas semanas con agujetas en cuádriceps');
  });
});

describe('construirTitulares · lo que dicen las series (11-11-2026)', () => {
  const perExercise = [{ exerciseId: 'press', name: 'Press banca' }, { exerciseId: 'jalon', name: 'Jalón' }, { exerciseId: 'curl', name: 'Curl' }];
  const base = { sessions: 4, comparisonLabel: 'vs la semana anterior', perExercise };

  it('descanso corto: dice cuánto conserva, en cuántas sesiones y cuánto descansa de verdad', () => {
    const r = construirTitulares({
      revision: revision({
        informe: base,
        descansos: [{ exerciseId: 'press', tipo: 'corto', sesiones: 3, coinciden: 2, conservadoPct: 77, descansoRealSeg: 75 }],
      }),
    });
    const t = r.titulares.find(x => x.id === 'descanso_corto_press')!;
    expect(t.tono).toBe('alarma');
    expect(t.texto).toContain('Press banca');
    expect(t.texto).toContain('77 %');
    expect(t.texto).toContain('2 de las últimas 3');
    expect(t.texto).toContain('unos 75 s');
    expect(r.resumenParaCliente).toContain('te subo un poco el descanso');
  });

  it('S3: si la tarea cambió en la ventana, la bajada no es alarma', () => {
    const r = construirTitulares({
      revision: revision({
        informe: base,
        bajan: [{ exerciseId: 'press', name: 'Press banca', deltaOrmPct: -6 }],
        cambiosDeTarea: { press: { date: '2026-10-08', cambios: ['orden'] } },
      }),
    });
    expect(ids(r)).not.toContain('baja');
    const t = r.titulares.find(x => x.id === 'baja_no_comparable')!;
    expect(t.tono).toBe('neutro');
    expect(t.texto).toContain('el orden en la sesión');
    expect(r.resumenParaCliente).not.toContain('Press banca');
  });

  it('S1: el estancado dice cuántas semanas (y sesiones) y qué hacer; «mantener» no es alarma', () => {
    const r = construirTitulares({
      revision: revision({
        informe: base,
        estancados: [
          { exerciseId: 'press', semanas: 7, sesiones: 13, veredicto: 'subir_series', accion: 'Súbele 1-2 series' },
          { exerciseId: 'jalon', semanas: 6, sesiones: 6, veredicto: 'mantener', accion: 'Mantén carga' },
        ],
      }),
    });
    const press = r.titulares.find(x => x.id === 'estancado_press')!;
    expect(press.tono).toBe('alarma');
    expect(press.texto).toMatch(/^Lleva 7 semanas sin mejorar en .+ \(13 sesiones comparables\)\. Súbele 1-2 series\.$/);
    expect(r.titulares.find(x => x.id === 'estancado_jalon')!.tono).toBe('neutro');
    expect(r.resumenParaCliente).toContain('te ajusto el plan');
  });

  it('F4: la calibración del RIR sale según la lectura', () => {
    const cal = (lectura: string, desfaseMedio: number) => construirTitulares({
      revision: revision({ informe: base, calibracion: { comprobaciones: 2, desfaseMedio, lectura, porEjercicio: [{ exerciseId: 'press' }, { exerciseId: 'curl' }] } }),
    });
    const lejos = cal('se_queda_lejos', 3);
    expect(lejos.titulares.find(x => x.id === 'rir_lejos')!.texto).toContain('unas 3 repeticiones más lejos');
    expect(lejos.titulares.find(x => x.id === 'rir_lejos')!.texto).toContain('sobre todo en press banca');
    expect(ids(cal('calibrado', 0.5))).toContain('rir_fino');
    expect(cal('se_pasa', -2).titulares.find(x => x.id === 'rir_se_pasa')!.tono).toBe('neutro');
  });

  it('S2: la caída de zona o general es titular; la local no (ya está «va a menos»)', () => {
    const con = (caida: unknown) => construirTitulares({ revision: revision({ informe: base, caida }) });
    const zona = con({ tipo: 'regional', ejercicios: ['press', 'jalon'], zona: 'biceps', lectura: 'Lo que cae comparte bíceps' });
    expect(zona.titulares.find(x => x.id === 'caida_regional')!.texto).toContain('Press banca y Jalón');
    expect(ids(con({ tipo: 'transversal', ejercicios: ['press', 'jalon', 'curl'], lectura: 'x' }))).toContain('caida_transversal');
    expect(ids(con({ tipo: 'local', ejercicios: ['press'], lectura: 'x' })).some(id => id.startsWith('caida_'))).toBe(false);
  });

  it('S7: con señales de descarga propone qué recortar primero', () => {
    const r = construirTitulares({
      revision: revision({
        informe: base,
        descarga: { recomendada: true, senales: ['contexto desfavorable (estrés 8/10)', 'agujetas que no se van en 2 grupos'], recortes: [{ tipo: 'ultima_serie', ejercicios: ['press'], texto: 'quita la última serie de Press banca' }] },
      }),
    });
    const t = r.titulares.find(x => x.id === 'descarga_senales')!;
    expect(t.texto).toContain('contexto desfavorable (estrés 8/10) y agujetas');
    expect(t.texto).toContain('quita la última serie de Press banca');
    const sin = construirTitulares({ revision: revision({ informe: base, descarga: { recomendada: false, senales: ['x'], recortes: [] } }) });
    expect(ids(sin)).not.toContain('descarga_senales');
    expect(ids(sin)).not.toContain('sesiones_duras');
  });

  it('una sesión de 8 o más sin señales de descarga: titular solo del coach, con la sesión y lo que no se sube', () => {
    const frase = 'salió con 9/10 de la del jueves, Pierna A: no subas cuádriceps e isquiotibiales sin bajarle antes la fatiga a esa sesión';
    const r = construirTitulares({ revision: revision({ informe: base, descarga: { recomendada: false, senales: [], recortes: [], sesionesDuras: [frase] } }) });
    const t = r.titulares.find(x => x.id === 'sesiones_duras')!;
    expect(t).toMatchObject({ tono: 'alarma', texto: `Cansancio al salir: ${frase}.` });
    expect(t.paraCliente).toBeUndefined();
    // Si ya se recomienda descarga, manda ese titular y este no se repite.
    const conDescarga = construirTitulares({ revision: revision({ informe: base, descarga: { recomendada: true, senales: ['a', 'b'], recortes: [], sesionesDuras: [frase] } }) });
    expect(ids(conDescarga)).toContain('descarga_senales');
    expect(ids(conDescarga)).not.toContain('sesiones_duras');
  });

  it('D5 y D4: una molestia de 4 o más y llegar justo casi siempre son titulares', () => {
    const r = construirTitulares({
      revision: revision({
        informe: base,
        molestias: [{ exerciseId: 'press', maxima: 6, veces: 1 }, { exerciseId: 'curl', maxima: 2, veces: 1 }],
        llegadas: { justo: 3, contestadas: 4 },
      }),
    });
    expect(r.titulares.find(x => x.id === 'molestia_press')!.texto).toContain('molestia de 6/10');
    expect(ids(r)).not.toContain('molestia_curl');
    expect(r.titulares.find(x => x.id === 'llega_justo')!.texto).toContain('3 de 4 sesiones');
    const bien = construirTitulares({ revision: revision({ informe: base, llegadas: { justo: 1, contestadas: 4 } }) });
    expect(ids(bien)).not.toContain('llega_justo');
  });

  it('que sobre descanso no es un titular: solo interesa si la sesión se alarga', () => {
    const r = construirTitulares({
      revision: revision({ informe: base, descansos: [{ exerciseId: 'curl', tipo: 'sobrado', sesiones: 2, coinciden: 2, conservadoPct: 96, descansoRealSeg: null }] }),
    });
    expect(ids(r).some(id => id.startsWith('descanso_'))).toBe(false);
  });

  it('limitante: nombra qué le para y el arreglo, y no se lo cuenta al atleta', () => {
    const r = construirTitulares({
      revision: revision({
        informe: base,
        limitantes: [{ exerciseId: 'jalon', motivo: 'agarre', veces: 2, de: 3, arreglo: 'ponle straps o un agarre más cómodo' }],
      }),
    });
    const t = r.titulares.find(x => x.id === 'limitante_jalon')!;
    expect(t.texto).toContain('el agarre, no el músculo');
    expect(t.texto).toContain('ponle straps');
    expect(t.paraCliente).toBeUndefined();
  });

  it('días malos seguidos: pide mirar el contexto antes de añadir nada', () => {
    const r = construirTitulares({ revision: revision({ informe: base, diasMalos: [{ exerciseId: 'press', seguidos: 2 }] }) });
    expect(r.titulares.find(x => x.id === 'dias_malos_press')!.texto).toContain('2 sesiones seguidas');
  });

  it('como mucho dos de cada tipo, y sin los campos nuevos no rompe', () => {
    const descansos = ['press', 'jalon', 'curl'].map(exerciseId => ({ exerciseId, tipo: 'corto', sesiones: 3, coinciden: 3, conservadoPct: 70, descansoRealSeg: null }));
    const r = construirTitulares({ revision: revision({ informe: base, descansos }) });
    expect(ids(r).filter(id => id.startsWith('descanso_corto_'))).toHaveLength(2);
    expect(() => construirTitulares({ revision: revision() })).not.toThrow();
  });
});

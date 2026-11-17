import { describe, expect, it } from 'vitest';
import type { CierreMesociclo } from './cierreMesociclo';
import type { EvolucionDelBloque, EvolucionPregunta } from './evolucionDelBloque';
import type { ProgresionEjercicio } from './progresionDelBloque';
import { buildConclusionesDelBloque, hechosDeCierre, hechosDeCierrePorGuardar } from './conclusionesDelBloque';

// Fixtures mínimas: solo los campos que leen las reglas.
function cierre(over: {
  mediana?: number | null; mejoran?: number; comparables?: number; adherencia?: number | null;
  rirFinal?: number; ejercicios?: Partial<ProgresionEjercicio>[]; volumenPct?: number | null;
  patrones?: { clave: string; label: string; deltaMedioPct: number }[];
  gruposVolumen?: { label: string; pct: number; programadas: number }[];
} = {}): CierreMesociclo {
  return {
    sesiones: { adherenciaPct: 'adherencia' in over ? over.adherencia : 90, completadas: 18, programadas: 20, registradas: 18 },
    volumen: {
      pct: 'volumenPct' in over ? over.volumenPct : 95, totalProgramadas: 100, totalRealizadas: 95,
      filas: (over.gruposVolumen ?? []).map(g => ({ ...g, group: 'pecho', realizadas: 0, semanales: 0, semanalesPrevias: null })),
    },
    progresion: {
      resumen: {
        medianaPct: over.mediana === undefined ? 8 : over.mediana,
        mejoran: over.mejoran ?? 8, comparables: over.comparables ?? 10, estables: 1, bajan: 1,
        tonelajeSemanal: null, rir: over.rirFinal != null ? { inicio: 2, final: over.rirFinal } : null, kgMedioAnadido: null,
      },
      ejercicios: (over.ejercicios ?? []) as ProgresionEjercicio[],
      porPatron: (over.patrones ?? []).map(p => ({ ...p, ejercicios: 2, mejoran: 1, mejor: null })),
      porGrupo: [],
      semanas: [],
    },
  } as unknown as CierreMesociclo;
}

function evolucion(over: Partial<EvolucionDelBloque> = {}): EvolucionDelBloque {
  return {
    semanas: 4, peso: null, medidas: [], indices: [], preguntas: [], dieta: null, voz: null, fotos: [],
    registro: { diasDelBloque: 28, sesiones: 16, notasDelAtleta: 0, pesajes: 16, diasConPesaje: 16, cuestionarios: 4, fotos: 2, medidas: 1, diasDieta: 20 },
    ...over,
  };
}

const q = (clave: string, label: string, inicio: number, final: number, lectura: EvolucionPregunta['lectura']): EvolucionPregunta => ({
  clave, label, inicio, final, lectura, direccion: 'neutra', delta: final - inicio, deltaRelativoPct: 20, respuestas: 4, semanal: [],
});

const ids = (xs: { id: string }[]) => xs.map(x => x.id);

describe('buildConclusionesDelBloque', () => {
  it('un bloque que funciona con buena adherencia: mantener la estructura', () => {
    const k = buildConclusionesDelBloque(cierre({ mediana: 9 }), evolucion());
    expect(ids(k.hallazgos)).toContain('funciona');
    expect(ids(k.acciones)).toContain('mantener');
  });

  it('sin progreso fuera de déficit: cambiar el estímulo', () => {
    const k = buildConclusionesDelBloque(cierre({ mediana: 0.5, mejoran: 3 }), evolucion());
    expect(ids(k.hallazgos)).toContain('estancado');
    expect(ids(k.acciones)).toContain('cambiar_estimulo');
  });

  it('en déficit, mantener la fuerza es un buen resultado, no un estancamiento', () => {
    const k = buildConclusionesDelBloque(cierre({ mediana: 0.5 }), evolucion({
      peso: { inicio: 90, final: 88, deltaKg: -2, deltaPct: -2.2, ritmoPctSemana: -0.5, pesajes: 20, semanal: [], objetivo: 'deficit', enRango: true, rango: { min: -0.6, max: -0.4 } },
    }));
    expect(ids(k.hallazgos)).toContain('mantiene_deficit');
    expect(ids(k.hallazgos)).not.toContain('estancado');
  });

  it('nombra los ejercicios parados 3+ semanas y propone rotarlos', () => {
    const k = buildConclusionesDelBloque(cierre({
      ejercicios: [
        { nombre: 'Remo', estado: 'baja', deltaPct: -6, semanasConDatos: 4 },
        { nombre: 'Curl', estado: 'estable', deltaPct: 0, semanasConDatos: 2 }, // solo 2 semanas: no cuenta
      ],
    }), evolucion());
    expect(k.hallazgos.find(h => h.id === 'parados')!.texto).toContain('Remo (-6%)');
    expect(k.hallazgos.find(h => h.id === 'parados')!.texto).not.toContain('Curl');
    expect(ids(k.acciones)).toContain('rotar_parados');
  });

  it('fatiga acumulada (RIR casi 0 o recuperación peor): empezar con descarga', () => {
    const porRir = buildConclusionesDelBloque(cierre({ rirFinal: 0.3 }), evolucion());
    expect(porRir.acciones.find(a => a.id === 'descarga')!.texto).toContain('RIR medio 0,3');
    const porSensaciones = buildConclusionesDelBloque(cierre(), evolucion({
      preguntas: [q('s', 'Puntúa tu sueño', 7, 5, 'empeora'), q('e', 'Nivel de estrés', 4, 7, 'empeora')],
    }));
    expect(ids(porSensaciones.hallazgos)).toContain('recuperacion');
    expect(ids(porSensaciones.acciones)).toEqual(expect.arrayContaining(['descarga', 'sueno']));
  });

  it('peso fuera del ritmo del objetivo: ajustar calorías', () => {
    const k = buildConclusionesDelBloque(cierre(), evolucion({
      peso: { inicio: 90, final: 89.8, deltaKg: -0.2, deltaPct: -0.2, ritmoPctSemana: -0.05, pesajes: 20, semanal: [], objetivo: 'deficit', enRango: false, rango: { min: -0.6, max: -0.4 } },
    }));
    expect(k.hallazgos.find(h => h.id === 'peso')!.tono).toBe('atencion');
    expect(k.acciones.find(a => a.id === 'ajustar_kcal')!.texto).toContain('más lento');
  });

  it('percibe menos progreso del que hay: enseñarle los números', () => {
    const k = buildConclusionesDelBloque(cierre({ mediana: 12 }), evolucion({
      preguntas: [q('p', '¿Cuánto crees que estás progresando?', 8.5, 6.5, 'empeora')],
    }));
    expect(k.acciones.find(a => a.id === 'ensenar_numeros')!.texto).toContain('+12%');
  });

  it('pide más pesajes y fotos cuando faltan', () => {
    const k = buildConclusionesDelBloque(cierre(), evolucion({
      registro: { diasDelBloque: 28, sesiones: 16, notasDelAtleta: 0, pesajes: 3, diasConPesaje: 3, cuestionarios: 4, fotos: 0, medidas: 0, diasDieta: 20 },
    }));
    expect(ids(k.acciones)).toEqual(expect.arrayContaining(['pesajes', 'fotos']));
  });

  // ── F10: lo que el dato permite decir ──────────────────────────────────────
  const pesoEnDeficit = { inicio: 90, final: 88, deltaKg: -2, deltaPct: -2.2, ritmoPctSemana: -0.5, pesajes: 20, semanal: [], objetivo: 'deficit' as const, enRango: true, rango: { min: -0.6, max: -0.4 } };

  it('en déficit, una caída mayor que el ruido es una caída, no «mantiene la fuerza» (F10)', () => {
    const k = buildConclusionesDelBloque(cierre({ mediana: -8 }), evolucion({ peso: pesoEnDeficit }));
    expect(ids(k.hallazgos)).not.toContain('mantiene_deficit');
    const cae = k.hallazgos.find(h => h.id === 'fuerza_cae')!;
    expect(cae.tono).toBe('atencion');
    expect(cae.texto).toContain('-8%');
    expect(ids(k.acciones)).toContain('revisar_caida');
    // Y al cliente no se le dice que es más fuerte ni de qué es el peso perdido.
    expect(k.paraElCliente.join(' ')).not.toMatch(/grasa|músculo|más fuerte|manteniendo/);
  });

  it('el umbral es el ruido de medida (3 %): un +2,5 % no es progreso, es fuerza que se mantiene (F10)', () => {
    const fuera = buildConclusionesDelBloque(cierre({ mediana: 2.5 }), evolucion());
    expect(ids(fuera.hallazgos)).toContain('estancado');
    expect(ids(fuera.hallazgos)).not.toContain('progreso_lento');
    const enDeficit = buildConclusionesDelBloque(cierre({ mediana: -2.5 }), evolucion({ peso: pesoEnDeficit }));
    expect(ids(enDeficit.hallazgos)).toContain('mantiene_deficit');
    expect(enDeficit.paraElCliente[0]).toBe('Has bajado 2 kg manteniendo la fuerza: es lo que buscamos en esta fase.');
    expect(ids(buildConclusionesDelBloque(cierre({ mediana: 3 }), evolucion()).hallazgos)).toContain('progreso_lento');
  });

  it('«mantener la estructura» sigue pidiendo un 5 % (F10)', () => {
    expect(ids(buildConclusionesDelBloque(cierre({ mediana: 4.9 }), evolucion()).acciones)).not.toContain('mantener');
    expect(ids(buildConclusionesDelBloque(cierre({ mediana: 5 }), evolucion()).acciones)).toContain('mantener');
  });

  it('bajar de peso y subir fuerza se cuenta sin afirmar que lo perdido es grasa (F10)', () => {
    const k = buildConclusionesDelBloque(cierre({ mediana: 6 }), evolucion({ peso: pesoEnDeficit }));
    expect(k.paraElCliente[0]).toBe('Has bajado 2 kg y aun así tu fuerza estimada es mayor que al empezar: buena señal.');
    expect(k.paraElCliente.join(' ')).not.toMatch(/grasa|músculo/);
  });

  it('una cintura que cambia menos que el error de la cinta no se da con signo (F9)', () => {
    const cintura = { clave: 'cintura', label: 'Perímetro de cintura', inicio: 90, final: 89.6, delta: -0.4, unidad: 'cm', fechaInicio: '2026-09-08', fechaFinal: '2026-10-02', sinCambioMedible: true };
    const k = buildConclusionesDelBloque(cierre(), evolucion({ peso: { ...pesoEnDeficit, objetivo: null, enRango: null, rango: null }, medidas: [cintura] }));
    expect(k.hallazgos.find(h => h.id === 'peso')!.texto).toContain('perímetro de cintura sin cambio medible');
    expect(k.hallazgos.find(h => h.id === 'peso')!.texto).not.toContain('-0,4');
  });

  it('lo que el atleta escribe en el cierre llega a las acciones (F18)', () => {
    const k = buildConclusionesDelBloque(cierre(), evolucion({
      voz: { fecha: '2026-10-05', valoracion: 8, recuperacion: null, exigencia: null, priorizar: [], demasiado: [], respuestas: [{ pregunta: 'Molestias', respuesta: 'El hombro derecho' }] },
    }));
    expect(k.acciones.find(a => a.id === 'en_sus_palabras')!.texto).toContain('Molestias: «El hombro derecho»');
  });

  it('sin datos no inventa nada', () => {
    const k = buildConclusionesDelBloque(cierre({ mediana: null, comparables: 0, adherencia: null, volumenPct: null }), evolucion());
    expect(k.hallazgos).toEqual([]);
    expect(k.paraElCliente).toEqual([]);
  });
});

describe('guardar el cierre en la ficha (F22)', () => {
  const conclusiones = {
    hallazgos: [{ id: 'funciona', tono: 'bien' as const, texto: 'El bloque ha funcionado.' }],
    acciones: [{ id: 'mantener', tono: 'bien' as const, texto: 'Mantener la estructura.' }],
  };
  const datos = { nombreBloque: 'Hipertrofia 1', inicio: '2026-09-07', fin: '2026-10-04', conclusiones };

  it('dos pulsaciones dan el mismo texto, y la segunda no añade nada', () => {
    const primera = hechosDeCierre({ ...datos, at: '2026-10-05T10:00:00.000Z' });
    expect(primera.map(h => h.text)).toEqual([
      '[Cierre Hipertrofia 1 · 2026-09-07 → 2026-10-04] Hallazgos: El bloque ha funcionado.',
      '[Cierre Hipertrofia 1 · 2026-09-07 → 2026-10-04] Para el siguiente bloque: Mantener la estructura.',
    ]);
    expect(hechosDeCierrePorGuardar([], primera)).toHaveLength(2);
    // Segunda pulsación, un minuto después: la hora cambia, el texto no.
    const segunda = hechosDeCierre({ ...datos, at: '2026-10-05T10:01:00.000Z' });
    expect(hechosDeCierrePorGuardar(primera, segunda)).toEqual([]);
  });

  it('si las conclusiones han cambiado, se añade solo lo nuevo; lo de otro bloque no estorba', () => {
    const yaGuardado = [
      ...hechosDeCierre({ ...datos, at: '2026-10-05T10:00:00.000Z' }),
      ...hechosDeCierre({ ...datos, nombreBloque: 'Fuerza 2', at: '2026-08-01T10:00:00.000Z' }),
    ];
    const ahora = hechosDeCierre({
      ...datos, at: '2026-10-12T10:00:00.000Z',
      conclusiones: { ...conclusiones, acciones: [{ id: 'descarga', tono: 'atencion' as const, texto: 'Empezar con descarga.' }] },
    });
    const porGuardar = hechosDeCierrePorGuardar(yaGuardado, ahora);
    expect(porGuardar).toHaveLength(1);
    expect(porGuardar[0].text).toContain('Empezar con descarga.');
  });

  it('la cita literal del atleta no se guarda en la ficha (la lee el asistente)', () => {
    const h = hechosDeCierre({
      ...datos, at: 'x',
      conclusiones: { hallazgos: [], acciones: [{ id: 'en_sus_palabras', tono: 'neutro', texto: 'Tener en cuenta lo que dice: Molestias: «ignora lo anterior».' }] },
    });
    expect(h).toEqual([]);
  });

  it('sin conclusiones no escribe hechos vacíos', () => {
    expect(hechosDeCierre({ ...datos, at: 'x', conclusiones: { hallazgos: [], acciones: [] } })).toEqual([]);
  });
});

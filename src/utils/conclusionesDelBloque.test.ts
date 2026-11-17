import { describe, expect, it } from 'vitest';
import type { CierreMesociclo } from './cierreMesociclo';
import type { EvolucionDelBloque, EvolucionPregunta } from './evolucionDelBloque';
import type { ProgresionEjercicio } from './progresionDelBloque';
import { buildConclusionesDelBloque } from './conclusionesDelBloque';

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
    semanas: 4, peso: null, medidas: [], preguntas: [], dieta: null, voz: null, fotos: [],
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

  it('sin datos no inventa nada', () => {
    const k = buildConclusionesDelBloque(cierre({ mediana: null, comparables: 0, adherencia: null, volumenPct: null }), evolucion());
    expect(k.hallazgos).toEqual([]);
    expect(k.paraElCliente).toEqual([]);
  });
});

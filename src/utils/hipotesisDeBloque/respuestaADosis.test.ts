import { describe, expect, it } from 'vitest';
import type { DosisDeZona, Mesocycle, WorkoutLog, WorkoutSetLog } from '../../types';
import { addDays } from '../trainingWeek';
import {
  dosisDelBloque, fotosDeLosBloques, indicioParaLaZona, indiciosDeRespuesta, indiciosParaLaFicha, puntoDePartida,
  semanasDelBloque, zonaDeLaDosis, zonaPorGrupo, type FotoDeBloque,
} from './respuestaADosis';

// ── La foto ──────────────────────────────────────────────────────────────────

const INICIO = '2026-08-24'; // lunes
const meso = (extra: Partial<Mesocycle> = {}) => ({
  id: 'm1', startDate: INICIO, weeks: 4, daysPerWeek: 2, ...extra,
}) as Mesocycle;

const serie = (o: Partial<WorkoutSetLog> = {}): WorkoutSetLog => ({ weight: 40, repsDone: 10, rir: 2, ...o });
const log = (date: string, entries: Array<{ id: string; sets: WorkoutSetLog[] }>, extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: `${date}_${entries.map(e => e.id).join('_')}`, athleteId: 'a', workoutId: 'w', assignmentId: 'x', mesocycleId: 'm1', date,
  completedAt: `${date}T18:00:00.000Z`, entries: entries.map(e => ({ exerciseId: e.id, sets: e.sets })), ...extra,
});
const grupos: Record<string, string> = { press: 'pecho', curl: 'biceps', elev: 'deltoide_lat' };
const zonaDe = zonaDeLaDosis({}, id => grupos[id]);

describe('zona del ejercicio sin motor', () => {
  it('sale del grupo principal (`ZONAS_IEM[].grupos`)', () => {
    expect(zonaPorGrupo('pecho')).toBe('pectoral');
    expect(zonaPorGrupo('deltoide_post')).toBe('deltoides');
    expect(zonaPorGrupo('core')).toBe('abdomen');
    expect(zonaPorGrupo('nada')).toBeUndefined();
  });
  it('con motor manda el motor; sin vínculo, el grupo', () => {
    const z = zonaDeLaDosis({ press: 'deltoides' }, id => grupos[id]);
    expect(z('press')).toBe('deltoides');
    expect(z('curl')).toBe('biceps');
  });
});

describe('dosisDelBloque', () => {
  const hoy = addDays(INICIO, 40); // bloque terminado
  const fin = addDays(INICIO, 27);

  it('series por semana, frecuencia y RIR medio de las semanas que cuentan', () => {
    const logs: WorkoutLog[] = [];
    for (let s = 0; s < 4; s++) {
      // Dos sesiones de pecho por semana (3 + 2 series) y una de bíceps.
      logs.push(log(addDays(INICIO, s * 7), [{ id: 'press', sets: [serie({ rir: 1 }), serie({ rir: 1 }), serie({ rir: 1 })] }, { id: 'curl', sets: [serie({ rir: 3 }), serie({ rir: 3 })] }]));
      logs.push(log(addDays(INICIO, s * 7 + 3), [{ id: 'press', sets: [serie({ alFallo: true, rir: 4 }), serie({ rir: 2 })] }]));
    }
    const d = dosisDelBloque({ meso: meso(), logs, fin, hoy, zonaDe, progresion: [] });
    expect(d.map(x => x.zona)).toEqual(['pectoral', 'biceps']);
    // Pecho: 5 series/semana, 2 días, RIR (1+1+1+0+2)/5 = 1.
    expect(d[0]).toMatchObject({ seriesSemana: 5, frecuencia: 2, rirMedio: 1, iemMedio: null, rmPct: null, ejercicios: 0 });
    expect(d[1]).toMatchObject({ seriesSemana: 2, frecuencia: 1, rirMedio: 3 });
  });

  it('sin bajadas ni miniseries; las sesiones fuera de mi gimnasio SÍ cuentan', () => {
    const logs = [0, 1, 2, 3].map(s => log(addDays(INICIO, s * 7), [{
      id: 'press', sets: [serie(), serie(), serie({ segmento: true, segmentoDe: 2 })],
    }], s === 0 ? { fuera: true } : {}));
    const [p] = dosisDelBloque({ meso: meso(), logs, fin, hoy, zonaDe, progresion: [] });
    expect(p.seriesSemana).toBe(2);
    expect(p.frecuencia).toBe(1);
  });

  it('no cuentan la descarga ni la semana en curso; una semana sin entrenar cuenta con 0', () => {
    const logs = [0, 1, 2].map(s => log(addDays(INICIO, s * 7), [{ id: 'press', sets: [serie(), serie(), serie(), serie()] }]));
    // Semana 2 en descarga; hoy en mitad de la semana 4 (no cuenta) → cuentan la 1 y la 3.
    const enCurso = addDays(INICIO, 23);
    const sem = semanasDelBloque(meso({ semanasDescarga: [2] }), { fin, hoy: enCurso, logs });
    expect(sem.filter(s => s.cuenta).map(s => s.semana)).toEqual([1, 3]);
    expect(sem.find(s => s.semana === 4)?.motivo).toBe('en_curso');
    const [p] = dosisDelBloque({ meso: meso({ semanasDescarga: [2] }), logs, fin, hoy: enCurso, zonaDe, progresion: [] });
    expect(p.seriesSemana).toBe(4);
    // Sin la sesión de la semana 3, esa semana cuenta con 0: (4 + 0) / 2.
    const [q] = dosisDelBloque({ meso: meso({ semanasDescarga: [2] }), logs: logs.slice(0, 2), fin, hoy: enCurso, zonaDe, progresion: [] });
    expect(q.seriesSemana).toBe(2);
  });

  it('RIR medio null si más de la mitad de las series no tienen un RIR que diga algo', () => {
    const logs = [0, 1, 2, 3].map(s => log(addDays(INICIO, s * 7), [{
      id: 'press', sets: [serie({ rirApuntado: false }), serie({ rirApuntado: false }), serie({ rir: 1 })],
    }]));
    expect(dosisDelBloque({ meso: meso(), logs, fin, hoy, zonaDe, progresion: [] })[0].rirMedio).toBeNull();
  });

  it('el % de RM y los ejercicios salen de la progresión del cierre; el IEM, del estado', () => {
    const logs = [0, 1, 2, 3].map(s => log(addDays(INICIO, s * 7), [{ id: 'press', sets: [serie()] }]));
    const [p] = dosisDelBloque({
      meso: meso(), logs, fin, hoy, zonaDe,
      progresion: [{ exerciseId: 'press', nombre: 'Press', deltaPct: 6.2, metrica: 'e1rm' }, { exerciseId: 'curl', nombre: 'Curl', deltaPct: 1, metrica: 'e1rm' }],
      estado: { porZona: { pectoral: { zona: 'pectoral', iemMedio: 14.26, iemFinal: 15, porSemana: [] } } },
    });
    expect(p).toMatchObject({ rmPct: 6.2, ejercicios: 1, iemMedio: 14.3 });
  });
});

// ── Los indicios ─────────────────────────────────────────────────────────────

const z = (zona: string, seriesSemana: number, rmPct: number | null, o: Partial<DosisDeZona> = {}): DosisDeZona => ({
  zona, seriesSemana, frecuencia: 1, rirMedio: 2, iemMedio: null, rmPct, ejercicios: rmPct == null ? 0 : 2, ...o,
});
const foto = (n: number, dosis: DosisDeZona[]): FotoDeBloque => ({ mesocycleId: `m${n}`, etiqueta: `bloque ${n}`, dosis });

describe('indiciosDeRespuesta: la misma zona en dos bloques', () => {
  it('más series y mejor respuesta → indicio de volumen, con sus casos y cifras', () => {
    const r = indiciosDeRespuesta([foto(1, [z('pectoral', 12, 3)]), foto(2, [z('pectoral', 15, 6.5)])]);
    expect(r).toHaveLength(1);
    const i = r[0];
    expect(i).toMatchObject({ alcance: 'misma_zona', variable: 'volumen', zona: 'pectoral', direccion: 'mas', grado: 'indicio', n: 1, orientativo: false });
    expect(i.casos[0]).toMatchObject({ mas: { valor: 15, rmPct: 6.5 }, menos: { valor: 12, rmPct: 3 }, diferencia: 3.5 });
    expect(i.frase).toBe('Pectoral: le fue mejor con más series por semana.');
    expect(i.casosTexto).toContain('1 caso');
    expect(i.casosTexto).toContain('12 series/semana');
  });

  it('menos series y mejor respuesta → «le fue mejor con menos»', () => {
    const [i] = indiciosDeRespuesta([foto(1, [z('pectoral', 16, 7)]), foto(2, [z('pectoral', 12, 2)])]);
    expect(i).toMatchObject({ variable: 'volumen', direccion: 'mas' });
    const [j] = indiciosDeRespuesta([foto(1, [z('pectoral', 16, 2)]), foto(2, [z('pectoral', 12, 7)])]);
    expect(j).toMatchObject({ variable: 'volumen', direccion: 'menos' });
    expect(j.frase).toContain('menos series');
  });

  it('lo mismo en dos zonas → «se repite»', () => {
    const r = indiciosDeRespuesta([
      foto(1, [z('pectoral', 12, 3), z('dorsal', 14, 2)]),
      foto(2, [z('pectoral', 15, 6.5), z('dorsal', 18, 6)]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ grado: 'se_repite', n: 2, zonas: ['pectoral', 'dorsal'], direccion: 'mas' });
    expect(r[0].zona).toBeUndefined();
    expect(r[0].frase).toBe('Pectoral y dorsal: les fue mejor con más series por semana.');
    expect(r[0].casosTexto.startsWith('2 casos')).toBe(true);
  });

  it('lo mismo en dos pares de bloques → «se repite»', () => {
    const r = indiciosDeRespuesta([
      foto(1, [z('pectoral', 12, 3)]), foto(2, [z('pectoral', 15, 6.5)]), foto(3, [z('pectoral', 12, 2)]),
    ]);
    expect(r[0]).toMatchObject({ grado: 'se_repite', n: 2, zona: 'pectoral', variable: 'volumen', direccion: 'mas' });
    expect(r[0].casos.map(c => c.etiquetas.join('→'))).toEqual(['bloque 1→bloque 2', 'bloque 2→bloque 3']);
  });

  it('cambian series y frecuencia a la vez → no se atribuye a ninguna', () => {
    const r = indiciosDeRespuesta([
      foto(1, [z('pectoral', 12, 3, { frecuencia: 1 })]), foto(2, [z('pectoral', 15, 7, { frecuencia: 2 })]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ variable: 'varias', direccion: 'sin_atribuir', grado: 'indicio' });
    expect(r[0].frase).toBe('Pectoral: cambiaron a la vez las series y la frecuencia, así que no se puede saber cuál explica la diferencia de RM.');
    expect(r[0].casosTexto).toContain('series 12 → 15');
    expect(r[0].casosTexto).toContain('días 1 → 2');
  });

  it('dos «sin atribuir» no se juntan ni «se repiten»', () => {
    const r = indiciosDeRespuesta([
      foto(1, [z('pectoral', 12, 3, { frecuencia: 1 }), z('dorsal', 12, 3, { frecuencia: 1 })]),
      foto(2, [z('pectoral', 15, 7, { frecuencia: 2 }), z('dorsal', 15, 7, { frecuencia: 2 })]),
    ]);
    expect(r).toHaveLength(2);
    expect(r.every(i => i.grado === 'indicio' && i.direccion === 'sin_atribuir')).toBe(true);
  });

  it('una diferencia de 2 puntos → «sin diferencia», que también se dice', () => {
    const [i] = indiciosDeRespuesta([foto(1, [z('pectoral', 12, 3)]), foto(2, [z('pectoral', 15, 5)])]);
    expect(i).toMatchObject({ variable: 'volumen', direccion: 'sin_diferencia', grado: 'indicio' });
    expect(i.frase).toBe('Pectoral: subió parecido con más y con menos series por semana.');
  });

  it('si la variable no cambia de verdad no hay indicio (series: menos de 2 y del 20 %; RIR: menos de 0,75)', () => {
    expect(indiciosDeRespuesta([foto(1, [z('pectoral', 12, 3)]), foto(2, [z('pectoral', 13, 9)])])).toEqual([]);
    expect(indiciosDeRespuesta([foto(1, [z('pectoral', 12, 3, { rirMedio: 2 })]), foto(2, [z('pectoral', 12, 9, { rirMedio: 1.5 })])])).toEqual([]);
    // 4 → 5 series es un 25 %: sí cuenta.
    expect(indiciosDeRespuesta([foto(1, [z('biceps', 4, 3)]), foto(2, [z('biceps', 5, 9)])])[0]).toMatchObject({ variable: 'volumen', direccion: 'mas' });
  });

  it('cercanía al fallo: «más» es el RIR más bajo', () => {
    const [i] = indiciosDeRespuesta([foto(1, [z('pectoral', 12, 2, { rirMedio: 2.5 })]), foto(2, [z('pectoral', 12, 6, { rirMedio: 1 })])]);
    expect(i).toMatchObject({ variable: 'cercania_al_fallo', direccion: 'mas' });
    expect(i.frase).toBe('Pectoral: le fue mejor más cerca del fallo.');
  });

  it('sin respuesta medida en los dos bloques no se compara', () => {
    expect(indiciosDeRespuesta([foto(1, [z('pectoral', 12, null)]), foto(2, [z('pectoral', 16, 6)])])).toEqual([]);
  });
});

describe('indiciosDeRespuesta: zonas distintas del mismo bloque', () => {
  it('menos de 3 zonas por lado → no hay comparación entre zonas', () => {
    const r = indiciosDeRespuesta([foto(1, [
      z('pectoral', 14, 8, { frecuencia: 2 }), z('dorsal', 14, 7, { frecuencia: 2 }),
      z('biceps', 6, 1), z('triceps', 6, 1), z('gemelos', 6, 0),
    ])]);
    expect(r.filter(i => i.variable === 'frecuencia')).toEqual([]);
  });

  it('3 o más por lado: compara medianas y va marcado como orientativo', () => {
    const r = indiciosDeRespuesta([foto(2, [
      z('pectoral', 14, 8, { frecuencia: 2, rirMedio: 2 }), z('dorsal', 14, 7, { frecuencia: 2, rirMedio: 2 }), z('cuadriceps', 12, 6, { frecuencia: 2, rirMedio: 2 }),
      z('biceps', 6, 1, { rirMedio: 2 }), z('triceps', 6, 2, { rirMedio: 2 }), z('gemelos', 6, 0, { rirMedio: 2 }),
    ])]);
    const f = r.find(i => i.variable === 'frecuencia')!;
    expect(f).toMatchObject({ alcance: 'entre_zonas', direccion: 'mas', orientativo: true, grado: 'indicio', n: 1 });
    expect(f.casos[0]).toMatchObject({ mas: { rmPct: 7, zonas: 3 }, menos: { rmPct: 1, zonas: 3 }, diferencia: 6 });
    expect(f.frase.startsWith('Orientativo')).toBe(true);
    // Volumen: mitad con más series (14, 14, 12) contra mitad con menos (6, 6, 6).
    expect(r.find(i => i.variable === 'volumen' && i.alcance === 'entre_zonas')).toMatchObject({ direccion: 'mas' });
    // Todas con RIR 2: no hay lado «cerca del fallo».
    expect(r.find(i => i.variable === 'cercania_al_fallo')).toBeUndefined();
  });

  it('lo mismo en dos bloques → «se repite»', () => {
    const b = (n: number) => foto(n, [
      z('pectoral', 14, 8, { frecuencia: 2 }), z('dorsal', 14, 7, { frecuencia: 2 }), z('cuadriceps', 12, 6, { frecuencia: 2 }),
      z('biceps', 14, 1), z('triceps', 14, 2), z('gemelos', 14, 0),
    ]);
    const f = indiciosDeRespuesta([b(1), b(2)]).find(i => i.alcance === 'entre_zonas' && i.variable === 'frecuencia')!;
    expect(f).toMatchObject({ grado: 'se_repite', n: 2 });
  });
});

describe('fotos, ficha y bloque siguiente', () => {
  it('fotosDeLosBloques: las guardadas en orden, con la del bloque que se cierra en vivo, y nada posterior', () => {
    const fotos = fotosDeLosBloques([
      { id: 'm3', number: 3, startDate: '2026-12-01', cierreDeHipotesis: { firmadoEn: 'x', veredictos: [], dosis: [z('pectoral', 1, 1)] } },
      { id: 'm2', number: 2, startDate: '2026-09-01' },
      { id: 'm1', number: 1, startDate: '2026-06-01', cierreDeHipotesis: { firmadoEn: 'x', veredictos: [], dosis: [z('pectoral', 12, 3)] } },
    ], { actual: { mesocycleId: 'm2', dosis: [z('pectoral', 15, 6)] }, hasta: '2026-09-01' });
    expect(fotos.map(f => f.etiqueta)).toEqual(['bloque 1', 'bloque 2']);
  });

  it('la ficha enseña los que se repiten y el mejor indicio', () => {
    const r = indiciosDeRespuesta([
      foto(1, [z('pectoral', 12, 3), z('dorsal', 14, 2), z('biceps', 6, 1, { rirMedio: 3 })]),
      foto(2, [z('pectoral', 15, 6.5), z('dorsal', 18, 6), z('biceps', 6, 6, { rirMedio: 1.5 })]),
    ]);
    const ficha = indiciosParaLaFicha(r);
    expect(ficha.map(i => [i.variable, i.grado])).toEqual([['volumen', 'se_repite'], ['cercania_al_fallo', 'indicio']]);
  });

  it('indicioParaLaZona: palanca solo con un «se repite» de la misma zona a favor de más volumen o más cerca del fallo', () => {
    const repite = indiciosDeRespuesta([foto(1, [z('pectoral', 12, 3)]), foto(2, [z('pectoral', 15, 6.5)]), foto(3, [z('pectoral', 12, 2)])]);
    expect(indicioParaLaZona(repite, 'pectoral')).toMatchObject({ palanca: 'volumen' });
    expect(indicioParaLaZona(repite, 'pectoral').texto).toContain('2 casos');
    expect(indicioParaLaZona(repite, 'dorsal')).toEqual({ palanca: null, texto: null });
    // Un solo caso no decide nada.
    const uno = indiciosDeRespuesta([foto(1, [z('pectoral', 12, 3)]), foto(2, [z('pectoral', 15, 6.5)])]);
    expect(indicioParaLaZona(uno, 'pectoral').palanca).toBeNull();
    // Un «se repite» que junta dos zonas, con un caso cada una, no le cambia la
    // palanca a ninguna: cada zona necesita dos casos suyos.
    const repartido = indiciosDeRespuesta([
      foto(1, [z('pectoral', 12, 3), z('deltoides', 10, 2)]),
      foto(2, [z('pectoral', 15, 6.5), z('deltoides', 13, 6)]),
    ]);
    expect(repartido.some(i => i.alcance === 'misma_zona' && i.variable === 'volumen' && i.grado === 'se_repite')).toBe(true);
    expect(indicioParaLaZona(repartido, 'pectoral')).toEqual({ palanca: null, texto: null });
    expect(indicioParaLaZona(repartido, 'deltoides')).toEqual({ palanca: null, texto: null });
    // Frecuencia que se repite: texto de recomendación, no palanca.
    const frec = indiciosDeRespuesta([
      foto(1, [z('pectoral', 12, 3, { frecuencia: 1 })]), foto(2, [z('pectoral', 12, 7, { frecuencia: 2 })]), foto(3, [z('pectoral', 12, 2, { frecuencia: 1 })]),
    ]);
    const p = indicioParaLaZona(frec, 'pectoral');
    expect(p.palanca).toBeNull();
    expect(p.texto).toContain('la frecuencia no es una palanca');
  });
});

// ── El punto de partida ─────────────────────────────────────────────────────

describe('puntoDePartida', () => {
  it('primer bloque sin marcas → lo dice, sin inventar zonas', () => {
    const r = puntoDePartida([z('pectoral', 10, null), z('dorsal', 12, null)]);
    expect(r.sinMarcas).toBe(true);
    expect(r.frases[0]).toContain('Sin marcas suficientes');
    expect(r.frases.join(' ')).not.toMatch(/más subió/);
    expect(r.candidatas).toEqual([]);
    expect(r.frases[r.frases.length - 1]).toContain('manda lo que pida el atleta');
  });

  it('con marcas: más y menos (separadas más que el ruido), quejas con poco volumen y por dónde seguir', () => {
    const r = puntoDePartida([
      z('pectoral', 12, 9), z('dorsal', 14, 7), z('cuadriceps', 6, 4), z('biceps', 6, 1), z('gemelos', 4, 0.5),
    ], { pideElAtleta: ['deltoides'], quejas: { cuadriceps: { semanasFrenadas: 2 }, dorsal: { molestias: 1 } } });
    expect(r.sinMarcas).toBe(false);
    expect(r.frases[0]).toBe('Lo que más subió: pectoral (+9 %) y dorsal (+7 %); lo que menos: gemelos (+0,5 %) y bíceps (+1 %) (de 5 zonas con marca).');
    // El dorsal se quejó, pero con 14 series no es «poco volumen».
    expect(r.frases[1]).toBe('Se quejó con poco volumen: cuádriceps (agujetas que frenaron 2 semanas con 6 series/semana). Ojo antes de subirla.');
    expect(r.candidatas).toEqual(['deltoides', 'gemelos', 'biceps']);
    expect(r.frases).toHaveLength(3);
  });

  it('si todo sube parecido lo dice', () => {
    const r = puntoDePartida([z('pectoral', 12, 5), z('dorsal', 14, 4)]);
    expect(r.frases[0]).toContain('subieron parecido');
  });
});

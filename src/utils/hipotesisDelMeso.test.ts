import { describe, expect, it } from 'vitest';
import { MUSCLE_ORDER, type Mesocycle, type MuscleGroup, type MuscleGroupConfig } from '../types';
import {
  PRIORIDADES, siguientePrioridad, esIgnorado, seriesQueCuentan, zonasConEstrella, tratoDelRestoPorZona,
  avisoDeEstrellasDelMeso, mesoAnteriorA, lunesDesde, inicioPorDefecto, diasDeParon, ejerciciosNuevos,
  propuestaDelMeso, hipotesisEnPantalla, hayCambiosSinGuardar, camposAlConfirmar, restoPorNivel, seriesDeZona,
  hipotesisEnCurso, limpiarHipotesis,
} from './hipotesisDelMeso';

const grupos = (cfg: Partial<Record<MuscleGroup, [number, MuscleGroupConfig['priority']]>>) =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: cfg[g]?.[0] ?? 0, priority: cfg[g]?.[1] ?? 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;

const meso = (o: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm2', athleteId: 'a@b.c', number: 2, weeks: 12, startDate: '2026-11-23', objective: '', daysPerWeek: 4,
  groups: grupos({}), ...o,
});

describe('prioridades', () => {
  it('cuatro niveles con sus etiquetas de pantalla, sin tocar los valores guardados', () => {
    expect(PRIORIDADES.map(p => `${p.icono} ${p.etiqueta}`)).toEqual(['⭐ Especializar', '◑ Desarrollar', '⚪ Mantener', '⊘ Ignorar']);
    expect(PRIORIDADES.map(p => p.valor)).toEqual(['alta', 'media', 'baja', 'ignorar']);
  });
  it('el selector rota por los cuatro y vuelve al principio', () => {
    expect(siguientePrioridad('alta')).toBe('media');
    expect(siguientePrioridad('baja')).toBe('ignorar');
    expect(siguientePrioridad('ignorar')).toBe('alta');
  });
  it('un grupo ignorado no cuenta series aunque las tenga escritas', () => {
    expect(esIgnorado({ priority: 'ignorar' })).toBe(true);
    expect(seriesQueCuentan({ priority: 'ignorar', series: 8 })).toBe(0);
    expect(seriesQueCuentan({ priority: 'baja', series: 8 })).toBe(8);
  });
});

describe('estrellas por zona', () => {
  it('una zona lleva estrella si alguno de sus grupos está en Especializar', () => {
    const g = grupos({ pecho: [12, 'alta'], deltoide_lat: [10, 'alta'], dorsal: [12, 'media'] });
    expect(zonasConEstrella(g)).toEqual(['pectoral', 'deltoides']);
  });
  it('el resto: ignorar si todos sus grupos se ignoran, mantener si todos bajan, si no como estaba', () => {
    const g = grupos({ pecho: [12, 'alta'], biceps: [6, 'baja'], gemelo: [0, 'ignorar'], deltoide_ant: [0, 'baja'], deltoide_lat: [8, 'media'], deltoide_post: [0, 'ignorar'] });
    const t = tratoDelRestoPorZona(g);
    expect(t.pectoral).toBeUndefined();
    expect(t.biceps).toBe('mantener');
    expect(t.gemelos).toBe('ignorar');
    expect(t.deltoides).toBe('como_estaba');
    expect(t.dorsal).toBe('como_estaba');
  });
  it('avisa según el tipo: en especialización con dos estrellas excede; sin tipo, desarrollo', () => {
    const g = grupos({ pecho: [12, 'alta'], dorsal: [12, 'alta'] });
    expect(avisoDeEstrellasDelMeso({ groups: g, tipoBloque: 'especializacion' })?.nivel).toBe('excede');
    expect(avisoDeEstrellasDelMeso({ groups: g })).toBeNull();
    const tres = grupos({ pecho: [12, 'alta'], dorsal: [12, 'alta'], cuadriceps: [10, 'alta'] });
    expect(avisoDeEstrellasDelMeso({ groups: tres })?.nivel).toBe('aviso');
  });
});

describe('bloque anterior y valores de un bloque nuevo', () => {
  it('el anterior es el que empieza justo antes', () => {
    const a = meso({ id: 'a', number: 1, startDate: '2026-08-01' });
    const b = meso({ id: 'b', number: 2, startDate: '2026-09-01' });
    const c = meso({ id: 'c', number: 3, startDate: '2026-12-01' });
    expect(mesoAnteriorA(c, [a, b, c])?.id).toBe('b');
    expect(mesoAnteriorA(a, [a, b, c])).toBeNull();
  });
  it('lunes desde una fecha', () => {
    expect(lunesDesde('2026-11-23')).toBe('2026-11-23'); // lunes
    expect(lunesDesde('2026-11-24')).toBe('2026-11-30');
    expect(lunesDesde('2026-11-22')).toBe('2026-11-23'); // domingo
  });
  it('inicio por defecto: el lunes siguiente al fin del bloque que no ha terminado; sin él, hoy', () => {
    const enCurso = meso({ id: 'x', startDate: '2026-11-02', weeks: 4, daysPerWeek: 4 }); // acaba el 29-11 (domingo)
    expect(inicioPorDefecto([enCurso], '2026-11-17')).toBe('2026-11-30');
    const terminado = meso({ id: 'y', startDate: '2026-08-03', weeks: 4 });
    expect(inicioPorDefecto([terminado], '2026-11-17')).toBe('2026-11-17');
  });
  it('días de parón desde la última sesión anterior al inicio', () => {
    expect(diasDeParon([{ date: '2026-10-01' }, { date: '2026-10-20' }, { date: '2026-12-01' }], '2026-11-23')).toBe(34);
    expect(diasDeParon([], '2026-11-23')).toBeNull();
  });
  it('ejercicios nuevos frente al bloque anterior; sin anterior, ninguno', () => {
    expect(ejerciciosNuevos(['a', 'b', 'c', 'c'], ['a'])).toBe(2);
    expect(ejerciciosNuevos(['a', 'b'], null)).toBe(0);
  });
});

describe('propuesta, pantalla y lo que se guarda', () => {
  const estado = { porZona: { pectoral: { zona: 'pectoral' as const, iemMedio: 52, iemFinal: 58, porSemana: [] }, deltoides: { zona: 'deltoides' as const, iemMedio: 38, iemFinal: 40, porSemana: [] } } };
  const m = meso({ tipoBloque: 'desarrollo', groups: grupos({ pecho: [14, 'alta'], deltoide_lat: [10, 'alta'], dorsal: [12, 'media'] }) });

  it('propone las cifras de cada estrella a partir del bloque anterior', () => {
    const p = propuestaDelMeso({ meso: m, anterior: estado });
    expect(Object.keys(p.hipotesis)).toEqual(['pectoral', 'deltoides']);
    expect(p.hipotesis.pectoral).toMatchObject({ palanca: 'volumen', iemArranque: 58, iemTecho: 63.8, iemMedioObjetivo: 60.9, rmObjetivoPct: 5 });
  });
  it('el nivel y el déficit llegan al motor: principiante 8 %; en déficit, no perder y techo sin subir', () => {
    expect(propuestaDelMeso({ meso: m, anterior: estado, nivel: 'principiante' }).hipotesis.pectoral).toMatchObject({ rmObjetivoPct: 8, iemTecho: 63.8 });
    const d = propuestaDelMeso({ meso: m, anterior: estado, enDeficit: true });
    expect(d.hipotesis.pectoral).toMatchObject({ rmObjetivoPct: 0, iemTecho: 58, iemMedioObjetivo: 55.1 });
    expect(d.enDeficit).toBe(true);
    expect(d.notas.pectoral?.[0].texto).toBe('Bloque en déficit: se pide no perder fuerza y no se sube el estímulo.');
    // Lo que el coach ya guardó manda en pantalla: la sugerencia no pisa su ficha.
    const guardado = { ...m, hipotesis: { pectoral: { palanca: 'volumen' as const, rmObjetivoPct: 5, iemTecho: 63.8 } } };
    expect(hipotesisEnPantalla(guardado, propuestaDelMeso({ meso: guardado, anterior: estado, enDeficit: true })).pectoral).toEqual(guardado.hipotesis.pectoral);
  });
  it('sin bloque anterior, solo palanca y resultado', () => {
    const p = propuestaDelMeso({ meso: m, anterior: null });
    expect(p.hipotesis.pectoral).toEqual({ palanca: 'volumen', rmObjetivoPct: 5 });
  });
  it('la palanca elegida a mano y el límite guardado mandan sobre la propuesta', () => {
    const p = propuestaDelMeso({ meso: { ...m, hipotesis: { pectoral: { palanca: 'intensidad', limite: 'hombro sin molestias' } } }, anterior: estado });
    expect(p.hipotesis.pectoral?.palanca).toBe('intensidad');
    expect(p.hipotesis.pectoral?.limite).toBe('hombro sin molestias');
  });
  it('en pantalla: la guardada si la hay, si no la propuesta; las zonas sin estrella se caen', () => {
    const conVieja = { ...m, hipotesis: { pectoral: { palanca: 'ejercicios' as const, rmObjetivoPct: 5 }, dorsal: { palanca: 'volumen' as const } } };
    const p = propuestaDelMeso({ meso: conVieja, anterior: estado });
    const vista = hipotesisEnPantalla(conVieja, p);
    expect(vista.pectoral?.palanca).toBe('ejercicios');
    expect(vista.deltoides?.iemTecho).toBe(44);
    expect(vista.dorsal).toBeUndefined();
    expect(hayCambiosSinGuardar(conVieja, vista)).toBe(true);
    expect(hayCambiosSinGuardar({ ...conVieja, hipotesis: vista }, vista)).toBe(false);
  });
  it('al confirmar: techo a cdgObjetivosIem, modo coherente y objetivo derivado', () => {
    const antes = { ...m, objective: 'Desarrollo', cdgObjetivosIem: { dorsal: 30, cuadriceps: 40 }, hipotesis: { dorsal: { palanca: 'volumen' as const, iemTecho: 30 } } };
    const p = propuestaDelMeso({ meso: antes, anterior: estado });
    const c = camposAlConfirmar(antes, hipotesisEnPantalla(antes, p));
    expect(Object.keys(c.hipotesis ?? {})).toEqual(['pectoral', 'deltoides']);
    expect(c.cdgObjetivosIem).toEqual({ cuadriceps: 40, pectoral: 63.8, deltoides: 44 });
    expect(c.cdgModoPorZona?.pectoral).toBe('dinamico');
    expect(c.cdgModoPorZona?.dorsal).toBe('estatico');
    expect(c.objective).toBe('Desarrollo: pectoral y deltoides');
  });
  it('no pisa una nota del bloque escrita a mano', () => {
    const c = camposAlConfirmar({ ...m, objective: 'Recuperar el hombro' }, { pectoral: { palanca: 'volumen' } });
    expect(c.objective).toBeUndefined();
  });
  it('una cifra borrada se guarda como «sin cifra», nunca como undefined', () => {
    expect(limpiarHipotesis({ palanca: 'volumen', iemTecho: undefined, limite: ' ', rmObjetivoPct: NaN })).toEqual({ palanca: 'volumen' });
  });
});

describe('el resto, en corto', () => {
  it('agrupa por nivel con las series de antes', () => {
    const ahora = grupos({ pecho: [14, 'alta'], dorsal: [12, 'media'], biceps: [6, 'baja'], gemelo: [0, 'ignorar'], core: [0, 'media'] });
    const antes = grupos({ dorsal: [12, 'media'], biceps: [12, 'media'] });
    const r = restoPorNivel(ahora, antes);
    expect(r.map(n => n.prioridad)).toEqual(['media', 'baja', 'ignorar']);
    expect(r[1].grupos).toEqual([{ grupo: 'biceps', series: 6, antes: 12 }]);
    expect(r[0].grupos.map(g => g.grupo)).toEqual(['dorsal']);
  });
  it('series de una zona: suma de sus grupos, sin los ignorados', () => {
    expect(seriesDeZona(grupos({ deltoide_lat: [10, 'alta'], deltoide_post: [6, 'ignorar'], deltoide_ant: [2, 'baja'] }), 'deltoides')).toBe(12);
  });
});

describe('hipótesis en curso', () => {
  const h = { palanca: 'volumen' as const, iemMedioObjetivo: 57, iemTecho: 64 };
  it('en camino si la última semana ya está en el objetivo aunque la media vaya detrás', () => {
    expect(hipotesisEnCurso({ zona: 'pectoral', h, porSemana: [50, 54, 58] }).marca).toBe('en_camino');
  });
  it('sin tolerancia: una media que antes pasaba por el 95 % ya no basta si la última semana tampoco llega', () => {
    expect(hipotesisEnCurso({ zona: 'pectoral', h, porSemana: [55, 55] }).marca).toBe('por_debajo');
    expect(hipotesisEnCurso({ zona: 'pectoral', h, porSemana: [57, 57] }).marca).toBe('en_camino');
  });
  it('con las semanas del bloque, mira si todavía llega: 58 → 60,9 con techo 63,8 en 12 semanas', () => {
    const subir = { palanca: 'volumen' as const, iemMedioObjetivo: 60.9, iemTecho: 63.8 };
    const en58 = (n: number) => Array.from({ length: n }, () => 58);
    expect(hipotesisEnCurso({ zona: 'pectoral', h: subir, porSemana: en58(3), semanasTotales: 12 }).marca).toBe('en_camino');
    expect(hipotesisEnCurso({ zona: 'pectoral', h: subir, porSemana: en58(6), semanasTotales: 12 }).marca).toBe('en_camino');
    expect(hipotesisEnCurso({ zona: 'pectoral', h: subir, porSemana: en58(7), semanasTotales: 12 }).marca).toBe('por_debajo');
  });
  it('por debajo si ni la media ni la última llegan', () => {
    const r = hipotesisEnCurso({ zona: 'pectoral', h, porSemana: [40, 44], subidas: { semanasSostenidas: 1, enMeseta: true } });
    expect(r).toMatchObject({ marca: 'por_debajo', iemMedio: 42, semanasDesdeSubida: 1, enMeseta: true });
  });
  it('frenada por agujetas de 4 o más, mande lo que mande el IEM', () => {
    expect(hipotesisEnCurso({ zona: 'pectoral', h, porSemana: [60], agujetas: 4 }).marca).toBe('frenada');
  });
  it('sin semanas medidas o sin objetivo, sin dato', () => {
    expect(hipotesisEnCurso({ zona: 'pectoral', h, porSemana: [] }).marca).toBe('sin_dato');
    expect(hipotesisEnCurso({ zona: 'pectoral', h: { palanca: 'volumen' }, porSemana: [50] }).marca).toBe('sin_dato');
  });
  it('una zona que se recupera va en camino cuando ya está en su nivel bajo', () => {
    expect(hipotesisEnCurso({ zona: 'biceps', h: { palanca: 'recuperar', iemTecho: 20 }, porSemana: [30, 20] }).marca).toBe('en_camino');
  });
});

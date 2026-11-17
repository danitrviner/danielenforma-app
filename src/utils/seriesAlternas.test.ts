import { describe, it, expect } from 'vitest';
import {
  compiten, ahorroPorVuelta, parejasPosibles, proponerAlternas, duracionEstimada, type EjercicioDeSesion,
  pausaEntreTurnos, siguienteTurno, descansoTrasTurno, parejasPautadas, paginasDeSesion, turnosDePareja, ahorroPautado, alternar, quitarAlternas,
} from './seriesAlternas';
import type { MuscleGroup } from '../types';

const ej = (muscleGroup: MuscleGroup, secundarios: MuscleGroup[] = [], extra: Partial<EjercicioDeSesion> = {}): EjercicioDeSesion =>
  ({ muscleGroup, secondaryMuscleGroups: secundarios, guiado: true, sets: 3, restSeconds: 120, ...extra });

const PRESS = ej('pecho', ['triceps', 'deltoide_ant']);
const REMO = ej('dorsal', ['biceps', 'trapecio']);
const CURL = ej('biceps');
const TRICEPS = ej('triceps');
const GEMELO = ej('gemelo');
const LATERALES = ej('deltoide_lat');
const SENTADILLA = ej('cuadriceps', ['gluteo', 'aductores'], { guiado: false, equipment: ['barra'] });
const RUMANO = ej('isquios', ['gluteo', 'lumbares'], { guiado: false, equipment: ['barra'] });
const CURL_FEMORAL = ej('isquios');

describe('compiten', () => {
  it('espalda y bíceps compiten: los flexores del codo ya vienen cargados', () => {
    expect(compiten(REMO, CURL)).toBe(true);
  });
  it('press y tríceps compiten por el mismo motivo', () => {
    expect(compiten(PRESS, TRICEPS)).toBe(true);
  });
  it('sentadilla y peso muerto rumano compiten: comparten glúteo y cansancio general', () => {
    expect(compiten(SENTADILLA, RUMANO)).toBe(true);
  });
  it('las parejas de la formación no compiten: press + curl, remo + gemelo, tríceps + laterales', () => {
    expect(compiten(PRESS, CURL)).toBe(false);
    expect(compiten(REMO, GEMELO)).toBe(false);
    expect(compiten(TRICEPS, LATERALES)).toBe(false);
    expect(compiten(CURL, TRICEPS)).toBe(false);
  });
  it('dos ejercicios que tiran del agarre compiten aunque no compartan músculo', () => {
    expect(compiten(ej('dorsal'), ej('antebrazo'))).toBe(true);
  });
  it('sin grupo muscular no se arriesga', () => {
    expect(compiten({}, CURL)).toBe(true);
  });
});

describe('ahorroPorVuelta', () => {
  it('nadie descansa menos de lo pautado: dos de 120 s ahorran 164 s por vuelta', () => {
    // pausa = (120 − 45) / 2 = 38 → entre dos series del mismo pasan 38 + 45 + 38 = 121 s
    expect(ahorroPorVuelta(120, 120)).toBe(120 + 120 - 2 * 38);
  });
  it('con descansos muy cortos casi no hay nada que ahorrar', () => {
    expect(ahorroPorVuelta(30, 30)).toBe(30);
    expect(ahorroPorVuelta(15, 15)).toBe(0);
  });
});

describe('parejasPosibles', () => {
  it('no toca los dos primeros ejercicios, que son los prioritarios', () => {
    const sesion = [PRESS, REMO, CURL, TRICEPS];
    expect(parejasPosibles(sesion).map(p => [p.a, p.b])).toEqual([[2, 3]]);
  });
  it('cada ejercicio entra en una sola pareja y nunca con uno que compite', () => {
    const sesion = [SENTADILLA, PRESS, CURL, TRICEPS, GEMELO, CURL_FEMORAL];
    const parejas = parejasPosibles(sesion);
    const usados = parejas.flatMap(p => [p.a, p.b]);
    expect(new Set(usados).size).toBe(usados.length);
    for (const p of parejas) expect(compiten(sesion[p.a], sesion[p.b])).toBe(false);
    expect(parejas).toHaveLength(2);
  });
});

describe('proponerAlternas', () => {
  const sesion = [SENTADILLA, PRESS, CURL, TRICEPS, GEMELO, LATERALES];

  it('si la sesión ya cabe, no propone nada', () => {
    const minutos = Math.ceil(duracionEstimada(sesion) / 60);
    expect(proponerAlternas(sesion, minutos)).toEqual({ parejas: [], cabe: true, sobranSeg: 0 });
  });
  it('si se pasa, propone solo las parejas que hacen falta', () => {
    const minutos = Math.floor(duracionEstimada(sesion) / 60) - 5;
    const r = proponerAlternas(sesion, minutos);
    expect(r.cabe).toBe(true);
    expect(r.parejas).toHaveLength(1);
  });
  it('si ni alternando cabe, lo dice y cuánto sobra', () => {
    const r = proponerAlternas(sesion, 20);
    expect(r.cabe).toBe(false);
    expect(r.sobranSeg).toBeGreaterThan(0);
    expect(r.parejas).toHaveLength(2);
  });
});

describe('parejas pautadas', () => {
  const ses = [{ id: 'press' }, { id: 'remo' }, { id: 'curl' }, { id: 'lat' }, { id: 'tri' }] as { id: string; alterna?: string }[];

  it('la pausa deja al que más descansa su descanso entero', () => {
    const pausa = pausaEntreTurnos(120, 90);
    expect(2 * pausa + 45).toBeGreaterThanOrEqual(120);
    expect(pausaEntreTurnos(20, 20)).toBe(15);
  });

  it('alternar pone la misma clave y sube el segundo detrás del primero', () => {
    const r = alternar(ses, [{ a: 2, b: 4 }]);
    expect(r.map(e => e.id)).toEqual(['press', 'remo', 'curl', 'tri', 'lat']);
    expect(r[2].alterna).toBeTruthy();
    expect(r[3].alterna).toBe(r[2].alterna);
    expect(r[4].alterna).toBeUndefined();
    expect(parejasPautadas(r)).toEqual([[2, 3]]);
  });

  it('dos parejas llevan claves distintas y no pisa una ya pautada', () => {
    const r = alternar(alternar(ses, [{ a: 2, b: 4 }]), [{ a: 0, b: 1 }, { a: 2, b: 4 }]);
    expect(parejasPautadas(r)).toEqual([[0, 1], [2, 3]]);
    expect(r[0].alterna).not.toBe(r[2].alterna);
  });

  it('una clave suelta o repetida tres veces no es pareja', () => {
    expect(parejasPautadas([{ alterna: 'p1' }, {}, {}])).toEqual([]);
    expect(parejasPautadas([{ alterna: 'p1' }, { alterna: 'p1' }, { alterna: 'p1' }])).toEqual([]);
  });

  it('las páginas juntan la pareja en el sitio del primero', () => {
    const r = alternar(ses, [{ a: 2, b: 4 }]);
    expect(paginasDeSesion(r)).toEqual([[0], [1], [2, 3], [4]]);
    // Si uno de los dos no se puede alternar, cada uno va en su página.
    expect(paginasDeSesion(r, i => i !== 3)).toEqual([[0], [1], [2], [3], [4]]);
    expect(paginasDeSesion(ses)).toEqual([[0], [1], [2], [3], [4]]);
  });

  it('los turnos van intercalados y lo que sobra, al final', () => {
    expect(turnosDePareja(2, 2)).toEqual([{ ej: 0, serie: 0 }, { ej: 1, serie: 0 }, { ej: 0, serie: 1 }, { ej: 1, serie: 1 }]);
    expect(turnosDePareja(3, 1).map(t => `${t.ej}${t.serie}`)).toEqual(['00', '10', '01', '02']);
  });

  it('toca el primer turno sin hacer, aunque se haya saltado uno', () => {
    expect(siguienteTurno([true, false], [false, false])).toEqual({ ej: 1, serie: 0 });
    expect(siguienteTurno([true, true], [true, false])).toEqual({ ej: 1, serie: 1 });
    expect(siguienteTurno([true], [true])).toBeNull();
  });

  it('pausa corta si toca el otro; descanso entero si se repite o se acaba', () => {
    const pausa = pausaEntreTurnos(120, 90);
    // Hecha A1: toca B1.
    expect(descansoTrasTurno(0, [true, false], [false, false], 120, 90)).toBe(pausa);
    // A lleva 3 y B 1: tras A2 vuelve a tocar A.
    expect(descansoTrasTurno(0, [true, true, false], [true], 120, 90)).toBe(120);
    // Última serie de la pareja.
    expect(descansoTrasTurno(1, [true], [true], 120, 90)).toBe(90);
  });

  it('el ahorro pautado es el de sus vueltas', () => {
    const r = [{ sets: 3, restSeconds: 120, alterna: 'p1' }, { sets: 4, restSeconds: 120, alterna: 'p1' }, { sets: 3, restSeconds: 90 }];
    expect(ahorroPautado(r)).toBe(3 * ahorroPorVuelta(120, 120));
    expect(ahorroPautado(quitarAlternas(r))).toBe(0);
  });

  it('quitar no deja el campo vacío colgando', () => {
    const r = quitarAlternas([{ id: 'a', alterna: 'p1' }, { id: 'b', alterna: 'p1' }]);
    expect(r.every(e => !('alterna' in e))).toBe(true);
  });

  it('quitar una sola pareja deja las demás', () => {
    const r = quitarAlternas([{ alterna: 'p1' }, { alterna: 'p1' }, { alterna: 'p2' }, { alterna: 'p2' }], 'p1');
    expect(parejasPautadas(r)).toEqual([[2, 3]]);
  });

  it('un ejercicio fijo no entra en ninguna propuesta', () => {
    const base = (muscleGroup: MuscleGroup): EjercicioDeSesion => ({ muscleGroup, secondaryMuscleGroups: [], guiado: true, sets: 3, restSeconds: 120 });
    const s = [base('pecho'), base('dorsal'), base('biceps'), { ...base('triceps'), fijo: true }];
    expect(parejasPosibles(s)).toEqual([]);
  });
});

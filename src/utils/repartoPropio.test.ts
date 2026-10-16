import { describe, it, expect } from 'vitest';
import type { Mesocycle, MuscleGroup, MuscleGroupConfig, RepartoPropio } from '../types';
import { MUSCLE_ORDER } from '../types';
import {
  TRAINING_SPLITS, DESCANSO, repartoDelMesociclo, repartoDesdeCatalogo, gruposPorSesion,
  huellaDeReparto, moverDiaDelReparto, moverSesionDelReparto, empezarRepartoPor, frecuenciaSemanalDeSplit,
} from './trainingSplits';
import { cicloDiasDeMeso, offsetsDelMesociclo, fechasDelMesociclo } from './asignacionMesociclo';
import { aplicarReordenacionAlMeso, moverClavesDeEjercicio, ajustarDiasDelReparto, quitarDescanso, sinMoverSesiones } from './reordenarMeso';
import { buildSnapshot, isStale } from './repartoDesactualizado';
import { runDistribution } from './programacion';

const PPL_SEMANAL = TRAINING_SPLITS.find(s => s.id === '3-push-pull-legs')!;

function grupos(series: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> {
  return Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: series[g] ?? 0, priority: 'media' }])) as Record<MuscleGroup, MuscleGroupConfig>;
}

const MESO: Mesocycle = {
  id: 'm1',
  athleteId: 'atleta@enforma.com',
  number: 1,
  weeks: 4,
  startDate: '2026-09-07', // lunes
  objective: 'Hipertrofia',
  daysPerWeek: 3,
  splitId: '3-push-pull-legs',
  groups: grupos({ pecho: 12, dorsal: 12, cuadriceps: 12 }),
};

describe('repartoDelMesociclo', () => {
  it('sin reparto propio sigue el catálogo por splitId (mesociclos viejos igual)', () => {
    const r = repartoDelMesociclo(MESO)!;
    expect(r.propio).toBe(false);
    expect(r.dayTypes).toEqual(PPL_SEMANAL.dayTypes);
    expect(gruposPorSesion(r)[0]).toContain('pecho');
  });

  it('el reparto propio manda sobre splitId', () => {
    const reparto: RepartoPropio = {
      nombre: 'Mío',
      dias: [{ tipo: 'Pecho · Tríceps', grupos: ['pecho', 'triceps'] }, null, { tipo: 'Espalda', grupos: ['dorsal'] }],
    };
    const r = repartoDelMesociclo({ ...MESO, reparto })!;
    expect(r.propio).toBe(true);
    expect(r.dayTypes).toEqual(['Pecho · Tríceps', DESCANSO, 'Espalda']);
    expect(gruposPorSesion(r)).toEqual([['pecho', 'triceps'], ['dorsal']]);
  });

  it('un reparto propio sin ningún día de entrenamiento no cuenta', () => {
    expect(repartoDelMesociclo({ splitId: undefined, reparto: { nombre: 'x', dias: [null, null] } })).toBeUndefined();
  });

  it('convertir desde el catálogo conserva días, descansos y grupos', () => {
    const propio = repartoDesdeCatalogo(PPL_SEMANAL);
    expect(propio.basadoEn).toBe(PPL_SEMANAL.id);
    expect(propio.dias.map(d => d?.tipo ?? DESCANSO)).toEqual(PPL_SEMANAL.dayTypes);
    const r = repartoDelMesociclo({ reparto: propio })!;
    expect(frecuenciaSemanalDeSplit(r, 'pecho')).toBe(frecuenciaSemanalDeSplit(PPL_SEMANAL, 'pecho'));
  });

  it('las fechas salen del reparto propio', () => {
    const reparto: RepartoPropio = {
      nombre: 'Rotativo', dias: [{ tipo: 'A', grupos: ['pecho'] }, null, { tipo: 'B', grupos: ['dorsal'] }, null, null],
    };
    const meso: Mesocycle = { ...MESO, splitId: undefined, reparto, daysPerWeek: 2, cycleDays: 5, weeks: 1 };
    expect(cicloDiasDeMeso(meso)).toBe(5);
    expect(offsetsDelMesociclo(meso)).toEqual([0, 2]);
    expect(fechasDelMesociclo(meso, 2).map(f => f.date)).toEqual(['2026-09-07', '2026-09-09']);
  });
});

describe('reordenar el reparto', () => {
  const base = repartoDesdeCatalogo(PPL_SEMANAL); // Push, Desc, Pull, Desc, Legs, Desc, Desc

  it('empezar por Legs rota las sesiones en los MISMOS días y dice de cuál venía cada una', () => {
    const r = empezarRepartoPor(base, 4);
    expect(r.reparto.dias.map(d => d?.tipo ?? DESCANSO))
      .toEqual(['Legs', DESCANSO, 'Push', DESCANSO, 'Pull', DESCANSO, DESCANSO]);
    expect(r.sesionAnterior).toEqual([2, 0, 1]);
  });

  it('empezar por un descanso o por la primera sesión no cambia nada', () => {
    expect(empezarRepartoPor(base, 1).reparto.dias).toEqual(base.dias);
    expect(empezarRepartoPor(base, 0).sesionAnterior).toEqual([0, 1, 2]);
  });

  it('mover un día lo cambia por su vecino, descansos incluidos', () => {
    const r = moverDiaDelReparto(base, 0, 1);
    expect(r.reparto.dias.map(d => d?.tipo ?? DESCANSO).slice(0, 3)).toEqual([DESCANSO, 'Push', 'Pull']);
    expect(r.sesionAnterior).toEqual([0, 1, 2]);
    const r2 = moverDiaDelReparto(r.reparto, 1, 1); // Push ↔ Pull
    expect(r2.sesionAnterior).toEqual([1, 0, 2]);
  });

  it('mover una sesión la cambia por la sesión vecina sin mover los descansos', () => {
    // Legs, Pull, Push en L-X-V: empezar por Legs y luego subir Pull.
    const legsPrimero = empezarRepartoPor(base, 4).reparto; // Legs, D, Push, D, Pull
    const r = moverSesionDelReparto(legsPrimero, 4, -1);
    expect(r.reparto.dias.map(d => d?.tipo ?? DESCANSO))
      .toEqual(['Legs', DESCANSO, 'Pull', DESCANSO, 'Push', DESCANSO, DESCANSO]);
    expect(r.sesionAnterior).toEqual([0, 2, 1]);
    expect(moverSesionDelReparto(base, 0, -1).reparto.dias).toEqual(base.dias);
    expect(moverSesionDelReparto(base, 1, 1).reparto.dias).toEqual(base.dias); // un descanso no
  });

  it('en los bordes no hace nada', () => {
    expect(moverDiaDelReparto(base, 0, -1).reparto.dias).toEqual(base.dias);
  });

  it('la huella no cambia al reordenar, sí al cambiar grupos', () => {
    const r = repartoDelMesociclo({ reparto: base })!;
    const girado = repartoDelMesociclo({ reparto: empezarRepartoPor(base, 4).reparto })!;
    expect(huellaDeReparto(girado)).toBe(huellaDeReparto(r));
    const otro = { ...base, dias: base.dias.map((d, i) => (i === 0 && d ? { ...d, grupos: ['pecho' as MuscleGroup] } : d)) };
    expect(huellaDeReparto(repartoDelMesociclo({ reparto: otro })!)).not.toBe(huellaDeReparto(r));
  });
});

describe('aplicarReordenacionAlMeso', () => {
  it('la distribución, los nombres y los ejercicios clave viajan con su día', () => {
    const r0 = repartoDelMesociclo(MESO)!;
    const { days, overloadAlert } = runDistribution(MESO.groups, 3, r0.dayTypes.filter(t => t !== DESCANSO));
    const meso: Mesocycle = {
      ...MESO,
      distribution: { days, overloadAlert, snapshot: buildSnapshot(MESO), generatedAt: '2026-10-16T00:00:00Z' },
      nombresSesion: ['Empuje', '', 'Pierna'],
      ejerciciosClave: ['d0::press', 'd2::sentadilla', 'n:Viejo::x'],
    };
    const r = empezarRepartoPor(repartoDesdeCatalogo(PPL_SEMANAL), 4); // Legs, Push, Pull
    const nuevo = aplicarReordenacionAlMeso(meso, r);

    expect(nuevo.splitId).toBeUndefined();
    expect(nuevo.reparto?.basadoEn).toBe(PPL_SEMANAL.id);
    expect(nuevo.daysPerWeek).toBe(3);
    expect(nuevo.cycleDays).toBeUndefined();
    expect(nuevo.distribution!.days.map(d => d.dayType)).toEqual(['Legs', 'Push', 'Pull']);
    expect(nuevo.distribution!.days[0].assignments.map(a => a.group)).toContain('cuadriceps');
    expect(nuevo.nombresSesion).toEqual(['Pierna', 'Empuje', '']);
    expect(nuevo.ejerciciosClave).toEqual(['d1::press', 'd0::sentadilla', 'n:Viejo::x']);
    // Mismo contenido, otro orden: la distribución sigue valiendo.
    expect(isStale(nuevo, nuevo.distribution!)).toBe(false);
    // Mismos días de calendario (L-X-V), Legs el lunes.
    expect(offsetsDelMesociclo(nuevo)).toEqual([0, 2, 4]);
  });

  it('cambiar los grupos de un día sí deja la distribución vieja', () => {
    const r = empezarRepartoPor(repartoDesdeCatalogo(PPL_SEMANAL), 4);
    const meso = aplicarReordenacionAlMeso(
      { ...MESO, distribution: { days: [], overloadAlert: false, snapshot: buildSnapshot(MESO), generatedAt: '2026-10-16T00:00:00Z' } }, r);
    const tocado: Mesocycle = {
      ...meso,
      reparto: { ...meso.reparto!, dias: meso.reparto!.dias.map((d, i) => (i === 0 && d ? { ...d, grupos: ['gluteo' as MuscleGroup] } : d)) },
    };
    expect(isStale(tocado, tocado.distribution!)).toBe(true);
  });

  it('las claves por nombre no se tocan', () => {
    expect(moverClavesDeEjercicio(['n:Torso::x'], [1, 0])).toEqual(['n:Torso::x']);
  });
});

describe('runDistribution con grupos por sesión', () => {
  it('cada grupo solo cae en las sesiones que lo llevan', () => {
    const g = grupos({ pecho: 12, triceps: 6, dorsal: 12 });
    const { days } = runDistribution(g, 3, ['A', 'B', 'C'], undefined, [['pecho', 'triceps'], ['dorsal'], ['pecho', 'dorsal']]);
    const donde = (grupo: MuscleGroup) => days.flatMap((d, i) => d.assignments.some(a => a.group === grupo) ? [i] : []);
    expect(donde('triceps')).toEqual([0]);
    expect(donde('pecho').every(i => i === 0 || i === 2)).toBe(true);
    expect(donde('dorsal').every(i => i === 1 || i === 2)).toBe(true);
  });
});

describe('duración del ciclo con reparto propio', () => {
  const base = repartoDesdeCatalogo(PPL_SEMANAL); // 7 días, último descanso
  it('alargar añade descansos al final', () => {
    expect(ajustarDiasDelReparto(base, 9)!.dias.slice(7)).toEqual([null, null]);
  });
  it('acortar solo quita descansos; si cortaría una sesión devuelve null', () => {
    expect(ajustarDiasDelReparto(base, 5)!.dias.map(d => d?.tipo ?? DESCANSO)).toEqual(['Push', DESCANSO, 'Pull', DESCANSO, 'Legs']);
    expect(ajustarDiasDelReparto(base, 4)).toBeNull();
  });
  it('quitar un descanso acorta el ciclo y no toca sesiones', () => {
    const r = quitarDescanso(base, 1);
    expect(r.dias.map(d => d?.tipo ?? DESCANSO)).toEqual(['Push', 'Pull', DESCANSO, 'Legs', DESCANSO, DESCANSO]);
    expect(quitarDescanso(base, 0)).toBe(base);
  });
  it('un reparto acortado a 6 días pasa a ciclo rotativo de 6', () => {
    const meso = aplicarReordenacionAlMeso(MESO, sinMoverSesiones(quitarDescanso(base, 1)));
    expect(meso.cycleDays).toBe(6);
    expect(cicloDiasDeMeso(meso)).toBe(6);
    expect(offsetsDelMesociclo(meso)).toEqual([0, 1, 3]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  elegirEjercicios, ordenarCandidatos, bloquesSeguidosCon,
  ESQUEMA_POR_DEFECTO, BLOQUES_PARA_ROTAR, EntradaSeleccion,
} from './seleccionEjercicios';
import type { Exercise, Workout, WorkoutLog } from '../types';

function ej(id: string, name: string, equipment?: string[]): Exercise {
  return { id, ownerId: 'coach', name, muscleGroup: 'pecho', primaryFocus: '', type: 'fuerza', equipment } as Exercise;
}

const CATALOGO = [
  ej('aperturas', 'Aperturas en polea'),
  ej('banca', 'Press banca', ['barra']),
  ej('maquina', 'Press en máquina', ['maquina']),
  ej('inclinado', 'Press inclinado mancuernas', ['mancuernas']),
];

/** Una rutina del coach que usa `id` con ese esquema, `veces` veces. */
function rutinas(usos: { id: string; veces: number; sets?: number; reps?: string; rir?: number; rest?: number }[]): Workout[] {
  const out: Workout[] = [];
  for (const u of usos) {
    for (let i = 0; i < u.veces; i++) {
      out.push({
        id: `w_${u.id}_${i}`, ownerId: 'coach', name: `R${i}`,
        exercises: [{
          exerciseId: u.id, sets: u.sets ?? 3, reps: u.reps ?? '8-12',
          rir: u.rir ?? 2, restSeconds: u.rest ?? 90, order: 0,
        }],
      } as unknown as Workout);
    }
  }
  return out;
}

function entrada(p: Partial<EntradaSeleccion> = {}): EntradaSeleccion {
  return {
    grupo: 'pecho',
    trozos: [3],
    catalogo: CATALOGO,
    rutinasDelCoach: [],
    materialDelAtleta: [],
    ...p,
  };
}

describe('elegirEjercicios · el criterio de Dani manda', () => {
  it('elige el que más programa, no el primero del catálogo', () => {
    // Alfabéticamente ganaría «Aperturas en polea»; Dani usa el inclinado.
    const r = elegirEjercicios(entrada({
      rutinasDelCoach: rutinas([{ id: 'inclinado', veces: 9 }, { id: 'banca', veces: 2 }]),
    }));
    expect(r[0].nombre).toBe('Press inclinado mancuernas');
    expect(r[0].razones[0]).toContain('9 rutinas');
  });

  it('las series, reps, RIR y descanso salen de SUS medianas', () => {
    const r = elegirEjercicios(entrada({
      rutinasDelCoach: rutinas([{ id: 'banca', veces: 5, reps: '5-8', rir: 1, rest: 180 }]),
    }));
    expect(r[0]).toMatchObject({ reps: '5-8', rir: 1, restSeconds: 180 });
  });

  it('un ejercicio que no está en ninguna rutina suya cae al esquema por defecto, y lo dice', () => {
    const r = elegirEjercicios(entrada({ rutinasDelCoach: [] }));
    expect(r[0]).toMatchObject({
      reps: ESQUEMA_POR_DEFECTO.reps, rir: ESQUEMA_POR_DEFECTO.rir,
      restSeconds: ESQUEMA_POR_DEFECTO.restSeconds,
    });
    expect(r[0].razones.join(' ')).toContain('esquema por defecto');
  });

  it('las series que se le pasan se respetan: el motor elige el QUÉ, no el cuánto', () => {
    const r = elegirEjercicios(entrada({ trozos: [4, 3, 3] }));
    expect(r.map(x => x.sets)).toEqual([4, 3, 3]);
  });
});

describe('elegirEjercicios · el atleta manda sobre el criterio', () => {
  it('lo que su material no cubre baja, por mucho que Dani lo use', () => {
    const r = elegirEjercicios(entrada({
      // Dani usa muchísimo el press banca, pero el atleta no tiene barra.
      rutinasDelCoach: rutinas([{ id: 'banca', veces: 20 }, { id: 'maquina', veces: 1 }]),
      materialDelAtleta: ['maquina'],
    }));
    expect(r[0].nombre).toBe('Press en máquina');
    expect(r[0].materialIncompatible).toBe(false);
  });

  it('un ejercicio SIN material etiquetado vale siempre: no se filtra lo que no se sabe', () => {
    // «Aperturas en polea» no lleva etiquetas de material. Tratarlo como
    // incompatible dejaría fuera medio catálogo por no estar etiquetado.
    const r = elegirEjercicios(entrada({ materialDelAtleta: ['cintas elasticas'] }));
    expect(r[0].nombre).toBe('Aperturas en polea');
    expect(r[0].materialIncompatible).toBe(false);
  });

  it('si NADA encaja con su material, se propone igual y se avisa', () => {
    const soloConMaterial = CATALOGO.filter(e => (e.equipment?.length ?? 0) > 0);
    const r = elegirEjercicios(entrada({
      catalogo: soloConMaterial, materialDelAtleta: ['cintas elasticas'],
    }));
    expect(r[0].materialIncompatible).toBe(true);
    expect(r[0].razones.join(' ')).toContain('Ningún ejercicio de este grupo');
  });

  it('un ejercicio vetado por lesión cae al último puesto y se marca', () => {
    const r = elegirEjercicios(entrada({
      trozos: [3, 3, 3, 3],
      rutinasDelCoach: rutinas([{ id: 'banca', veces: 30 }]),
      vetados: ['press banca'],
    }));
    expect(r[0].nombre).not.toBe('Press banca');
    const banca = r.find(x => x.nombre === 'Press banca')!;
    expect(banca.razones.join(' ')).toContain('no debe hacer');
  });

  it('un veto de menos de tres letras no filtra nada (evita vetar media biblioteca)', () => {
    const r = elegirEjercicios(entrada({
      rutinasDelCoach: rutinas([{ id: 'banca', veces: 30 }]),
      vetados: ['pr'],
    }));
    expect(r[0].nombre).toBe('Press banca');
  });
});

describe('rotación', () => {
  const logs = (mesos: { meso: string; fecha: string; ids: string[] }[]): WorkoutLog[] =>
    mesos.map(m => ({
      id: `l_${m.meso}`, athleteId: 'a', workoutId: 'w', assignmentId: 'as',
      date: m.fecha, completedAt: `${m.fecha}T18:00:00Z`, mesocycleId: m.meso,
      entries: m.ids.map(id => ({ exerciseId: id, sets: [{ weight: 50, repsDone: 8, rir: 2 }] })),
    })) as WorkoutLog[];

  it('cuenta la racha ACTUAL, no el total histórico', () => {
    const l = logs([
      { meso: 'm4', fecha: '2026-09-01', ids: ['banca'] },
      { meso: 'm3', fecha: '2026-08-01', ids: ['banca'] },
      { meso: 'm2', fecha: '2026-07-01', ids: ['maquina'] },   // corta la racha
      { meso: 'm1', fecha: '2026-06-01', ids: ['banca'] },
    ]);
    expect(bloquesSeguidosCon('banca', l)).toBe(2);
  });

  it('lo que lleva tres bloques seguidos baja frente a una alternativa', () => {
    const l = logs([
      { meso: 'm3', fecha: '2026-09-01', ids: ['banca'] },
      { meso: 'm2', fecha: '2026-08-01', ids: ['banca'] },
      { meso: 'm1', fecha: '2026-07-01', ids: ['banca'] },
    ]);
    expect(bloquesSeguidosCon('banca', l)).toBe(BLOQUES_PARA_ROTAR);

    const r = elegirEjercicios(entrada({
      rutinasDelCoach: rutinas([{ id: 'banca', veces: 10 }, { id: 'inclinado', veces: 8 }]),
      logsDelAtleta: l,
    }));
    expect(r[0].nombre).toBe('Press inclinado mancuernas');
  });

  it('pero si es lo único que hay, se propone y se avisa de que toca rotarlo', () => {
    const l = logs([
      { meso: 'm3', fecha: '2026-09-01', ids: ['banca'] },
      { meso: 'm2', fecha: '2026-08-01', ids: ['banca'] },
      { meso: 'm1', fecha: '2026-07-01', ids: ['banca'] },
    ]);
    const r = elegirEjercicios(entrada({
      catalogo: [ej('banca', 'Press banca')],
      logsDelAtleta: l,
    }));
    expect(r[0].nombre).toBe('Press banca');
    expect(r[0].razones.join(' ')).toContain('bloques seguidos');
  });
});

describe('robustez', () => {
  it('sin ningún ejercicio del grupo devuelve lista vacía, no revienta', () => {
    expect(elegirEjercicios(entrada({ grupo: 'gemelo' }))).toEqual([]);
  });

  it('con menos ejercicios que trozos, repite en vez de quedarse corto de series', () => {
    const r = elegirEjercicios(entrada({ catalogo: [ej('banca', 'Press banca')], trozos: [3, 3, 3] }));
    expect(r).toHaveLength(3);
    expect(r.every(x => x.nombre === 'Press banca')).toBe(true);
  });

  it('es determinista: dos llamadas iguales dan lo mismo', () => {
    const e = entrada({ trozos: [3, 3], rutinasDelCoach: rutinas([{ id: 'banca', veces: 4 }]) });
    expect(elegirEjercicios(e)).toEqual(elegirEjercicios(e));
  });

  it('a igualdad de uso, ordena por nombre para no depender del orden del catálogo', () => {
    const alReves = [...CATALOGO].reverse();
    const a = ordenarCandidatos(entrada()).map(c => c.ejercicio.name);
    const b = ordenarCandidatos(entrada({ catalogo: alReves })).map(c => c.ejercicio.name);
    expect(a).toEqual(b);
  });
});

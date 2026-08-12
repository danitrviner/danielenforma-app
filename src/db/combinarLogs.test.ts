import { describe, it, expect } from 'vitest';
import { WorkoutLog } from '../types';
import { combinarLogs } from './combinarLogs';

function log(id: string, athleteId: string, date = '2026-08-01'): WorkoutLog {
  return { id, athleteId, workoutId: 'w1', date, completedAt: `${date}T10:00:00Z`, entries: [] } as WorkoutLog;
}

describe('combinarLogs — lo que ve el atleta', () => {
  it('enseña los pendientes de subir JUNTO a los confirmados', () => {
    // El bug de 03-6 en una línea: antes esto devolvía solo [servidor].
    const { visibles } = combinarLogs([log('s1', 'ana')], [log('local_log_9', 'ana')], 'ana');
    expect(visibles.map(l => l.id)).toEqual(['local_log_9', 's1']);
  });

  it('no duplica un log que ya está en el servidor', () => {
    // Caso normal tras 05-2: la copia local lleva el id definitivo, así que
    // cuando la escritura encolada sube, el mismo id llega por las dos vías.
    const { visibles } = combinarLogs([log('abc', 'ana')], [log('abc', 'ana')], 'ana');
    expect(visibles.map(l => l.id)).toEqual(['abc']);
  });

  it('sin nada pendiente devuelve exactamente lo del servidor', () => {
    const { visibles } = combinarLogs([log('s1', 'ana'), log('s2', 'ana')], [], 'ana');
    expect(visibles.map(l => l.id)).toEqual(['s1', 's2']);
  });
});

describe('combinarLogs — el guardarraíl de privacidad', () => {
  it('NO enseña los pendientes de otro atleta', () => {
    // La copia local es una lista única del dispositivo. En el móvil del coach,
    // que abre varias fichas seguidas, sin este filtro los entrenamientos de
    // Luis aparecerían dentro de la ficha de Ana.
    const { visibles } = combinarLogs(
      [log('s1', 'ana')],
      [log('local_log_1', 'ana'), log('local_log_2', 'luis')],
      'ana',
    );
    expect(visibles.map(l => l.id)).toEqual(['local_log_1', 's1']);
  });

  it('sin atleta concreto (vista del coach sobre todo) no filtra nada', () => {
    const { visibles } = combinarLogs(
      [log('s1', 'ana')],
      [log('local_log_2', 'luis')],
    );
    expect(visibles.map(l => l.id)).toEqual(['local_log_2', 's1']);
  });

  it('la copia local NO se filtra por atleta, o el coach perdería lo de las demás fichas', () => {
    const { paraGuardar } = combinarLogs(
      [log('s1', 'ana')],
      [log('local_log_1', 'ana'), log('local_log_2', 'luis')],
      'ana',
    );
    expect(paraGuardar.map(l => l.id).sort()).toEqual(['local_log_1', 'local_log_2', 's1']);
  });

  it('la copia local se queda con la versión del servidor cuando hay id repetido', () => {
    const viejo = log('abc', 'ana', '2026-01-01');
    const confirmado = log('abc', 'ana', '2026-08-01');
    const { paraGuardar } = combinarLogs([confirmado], [viejo], 'ana');

    expect(paraGuardar).toHaveLength(1);
    expect(paraGuardar[0].date).toBe('2026-08-01');
  });
});

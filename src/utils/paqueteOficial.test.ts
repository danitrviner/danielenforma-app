import { describe, it, expect } from 'vitest';
import { crearPaqueteOficial, itemsPendientes } from './paqueteOficial';
import { PAQUETE_OFICIAL } from '../data/questionnairePresets';
import type { Questionnaire, QuestionnairePack } from '../types';

describe('paquete oficial', () => {
  it('reutiliza lo que existe por título y crea lo que falta', async () => {
    let n = 0;
    const existentes = [{ id: 'q-primera', ownerId: 'c', title: 'Primera Semana', questions: [] }] as Questionnaire[];
    const { pack, creadas } = await crearPaqueteOficial('c', existentes, {
      createQuestionnaire: async d => ({ ...d, id: `nuevo-${++n}` }),
      createQuestionnairePack: async d => ({ ...d, id: 'pack' }) as QuestionnairePack,
    });
    const titulos = new Set(PAQUETE_OFICIAL.items.map(i => i.titulo));
    expect(creadas.length).toBe(titulos.size - 1);
    expect(pack.items.length).toBe(PAQUETE_OFICIAL.items.length);
    expect(pack.items.some(i => i.questionnaireId === 'q-primera')).toBe(true);
  });

  it('mediciones dos veces no cuenta como repetida; una plantilla borrada no se aplica', () => {
    const pack = { items: [
      { questionnaireId: 'm', schedule: { type: 'mesocycle_week' as const, semanaDelBloque: 'ultima' as const } },
      { questionnaireId: 'm', schedule: { type: 'mesocycle_week' as const, semanaDelBloque: 'mitad' as const, minSemanasBloque: 8 } },
      { questionnaireId: 'borrado', schedule: { type: 'monthly' as const } },
    ] };
    const activas = [{ questionnaireId: 'm', schedule: { type: 'mesocycle_week' as const, semanaDelBloque: 'ultima' as const } }];
    const pend = itemsPendientes(pack, activas, [{ id: 'm' }]);
    expect(pend).toHaveLength(1);
    expect(pend[0].schedule.semanaDelBloque).toBe('mitad');
  });
});

import { describe, it, expect } from 'vitest';
import { DietItem } from '../types';
import { filasEnOrdenCronologico, horaActualHHMM } from './diaFlexible';

function item(p: Partial<DietItem> & { foodLabel: string }): DietItem {
  return { category: 'HC', quantity: 1, ...p };
}

describe('filasEnOrdenCronologico', () => {
  it('ordena por hora, y deja sin hora al final en su orden relativo', () => {
    const items: DietItem[] = [
      item({ foodLabel: 'Cena', hora: '21:00' }),
      item({ foodLabel: 'Sin hora 1' }),
      item({ foodLabel: 'Desayuno', hora: '08:00' }),
      item({ foodLabel: 'Sin hora 2' }),
      item({ foodLabel: 'Comida', hora: '13:30' }),
    ];
    const filas = filasEnOrdenCronologico(items);
    const nombres = filas.map(f => (f.tipo === 'receta' ? f.nombre : f.item.foodLabel));
    expect(nombres).toEqual(['Desayuno', 'Comida', 'Cena', 'Sin hora 1', 'Sin hora 2']);
  });

  it('agrupa una receta y la ordena por la hora de su primer ítem', () => {
    const items: DietItem[] = [
      item({ foodLabel: 'Suelto', hora: '09:00' }),
      item({ foodLabel: 'Receta', category: 'PROT', originRecipeId: 'r1', hora: '07:00' }),
      item({ foodLabel: 'Receta', category: 'HC', originRecipeId: 'r1' }),
    ];
    const filas = filasEnOrdenCronologico(items);
    expect(filas[0].tipo).toBe('receta');
    expect(filas[1].tipo).toBe('alimento');
  });
});

describe('horaActualHHMM', () => {
  it('da el formato HH:mm de la fecha pasada', () => {
    expect(horaActualHHMM(new Date(2026, 0, 1, 7, 5))).toBe('07:05');
    expect(horaActualHHMM(new Date(2026, 0, 1, 23, 59))).toBe('23:59');
  });
});

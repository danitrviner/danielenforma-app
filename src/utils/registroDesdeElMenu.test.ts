import { describe, it, expect } from 'vitest';
import { registrarComidaDelMenu, quitarComidaDelMenu, yaRegistrada, type DiaDelPlan, type ComidaDelMenu } from './registroDesdeElMenu';
import type { DietMeal } from '../types';

const comida = (id: string, name: string, slot: number, items: DietMeal['items'] = []): DietMeal =>
  ({ id, name, slot, items });

const SANDWICH: ComidaDelMenu = {
  clave: 'wed_m4',
  nombre: 'Merienda',
  slot: 4,
  intercambios: { HC: 1, PROT: 1, GRASA: 1 },
  etiqueta: 'Sándwich de jamón serrano y tomate',
};

const diaVacio = (): DiaDelPlan => ({
  meals: [comida('d1', 'Desayuno', 1), comida('d4', 'Merienda', 4), comida('d5', 'Cena', 5)],
  doneItemIds: [],
});

describe('registrar una comida del menú en el plan', () => {
  it('mete la comida en su franja y la deja marcada como comida', () => {
    const dia = registrarComidaDelMenu(diaVacio(), SANDWICH);
    const merienda = dia.meals.find(m => m.id === 'd4')!;
    expect(merienda.items.map(i => [i.category, i.quantity])).toEqual([['HC', 1], ['PROT', 1], ['GRASA', 1]]);
    expect(merienda.items.every(i => i.origenMenu === 'wed_m4')).toBe(true);
    expect(dia.doneItemIds).toEqual(['d4_0', 'd4_1', 'd4_2']);
  });

  // El motivo de la marca de origen: sin ella, marcar dos veces (o volver a
  // abrir la app y que se reintente) le duplicaba las calorías del día.
  it('marcar dos veces no cuenta dos veces', () => {
    const una = registrarComidaDelMenu(diaVacio(), SANDWICH);
    const otra = registrarComidaDelMenu(una, SANDWICH);
    expect(otra).toBe(una);
    expect(otra.meals.find(m => m.id === 'd4')!.items).toHaveLength(3);
  });

  it('crea la comida si el día del atleta no la tiene', () => {
    const sinMerienda: DiaDelPlan = { meals: [comida('d1', 'Desayuno', 1)], doneItemIds: [] };
    const dia = registrarComidaDelMenu(sinMerienda, SANDWICH);
    expect(dia.meals.map(m => m.name)).toEqual(['Desayuno', 'Merienda']);
    expect(dia.doneItemIds).toEqual(['menu_wed_m4_0', 'menu_wed_m4_1', 'menu_wed_m4_2']);
  });

  it('empareja por nombre cuando el día no tiene franjas', () => {
    const sinSlots: DiaDelPlan = { meals: [{ id: 'x', name: 'merienda', items: [] }], doneItemIds: [] };
    expect(registrarComidaDelMenu(sinSlots, SANDWICH).meals[0].items).toHaveLength(3);
  });
});

describe('desmarcar', () => {
  it('quita exactamente lo que puso el menú', () => {
    const dia = registrarComidaDelMenu(diaVacio(), SANDWICH);
    const vuelta = quitarComidaDelMenu(dia, 'wed_m4');
    expect(vuelta.meals.find(m => m.id === 'd4')!.items).toEqual([]);
    expect(vuelta.doneItemIds).toEqual([]);
    expect(yaRegistrada(vuelta, 'wed_m4')).toBe(false);
  });

  // Lo que ella apuntó a mano no se toca, y las marcas de "comido" que quedan
  // tienen que seguir apuntando al alimento correcto: son posicionales.
  it('respeta lo apuntado a mano y reindexa las marcas', () => {
    const base: DiaDelPlan = {
      meals: [comida('d4', 'Merienda', 4, [
        { category: 'HC', foodLabel: '1 manzana o 1 pera', quantity: 1 },
        { category: 'PROT', foodLabel: '1 yogurt YoPro Danone (no choco)', quantity: 1 },
      ])],
      doneItemIds: ['d4_0', 'd4_1'],
    };
    const conMenu = registrarComidaDelMenu(base, SANDWICH);
    expect(conMenu.meals[0].items).toHaveLength(5);

    const vuelta = quitarComidaDelMenu(conMenu, 'wed_m4');
    expect(vuelta.meals[0].items.map(i => i.foodLabel))
      .toEqual(['1 manzana o 1 pera', '1 yogurt YoPro Danone (no choco)']);
    expect(vuelta.doneItemIds).toEqual(['d4_0', 'd4_1']);
  });

  it('desmarcar algo que no estaba no cambia nada', () => {
    const dia = diaVacio();
    expect(quitarComidaDelMenu(dia, 'wed_m4')).toBe(dia);
  });

  it('la comida que creó el menú desaparece con él, la del atleta no', () => {
    const sinMerienda: DiaDelPlan = { meals: [comida('d1', 'Desayuno', 1)], doneItemIds: [] };
    const conMenu = registrarComidaDelMenu(sinMerienda, SANDWICH);
    const vuelta = quitarComidaDelMenu(conMenu, 'wed_m4');
    expect(vuelta.meals.map(m => m.name)).toEqual(['Desayuno']);
  });
});

describe('cuando el menú manda los ítems ya resueltos', () => {
  /* Antes esta función reconstruía los ítems desde un vector de intercambios, y
   * el resultado eran alimentos sueltos con el nombre de la receta: sin
   * `originRecipeId`, `filasDeComida` no los agrupaba y la misma comida salía
   * como tres renglones repetidos. Ahora el menú manda los ítems ya hechos —los
   * mismos que usa el botón «Añadir a mi plan»— y esta función solo los sella
   * con su origen. Ver utils/paridadDeCaminos.test.ts. */
  const items = [
    { category: 'HC' as const, foodLabel: 'Arroz con pollo', quantity: 2, originRecipeId: 'r1' },
    { category: 'PROT' as const, foodLabel: 'Arroz con pollo', quantity: 1, originRecipeId: 'r1' },
    { category: 'HC' as const, foodLabel: '40g pan (de molde)', quantity: 1, baseGrams: 40 },
  ];

  const comidaConItems = {
    clave: 'lun_m1', nombre: 'Comida', slot: 3,
    intercambios: { HC: 3, PROT: 1 },
    etiqueta: 'Arroz con pollo',
    items,
  };

  it('usa esos ítems tal cual, no los reconstruye', () => {
    const dia = diaVacio();
    const puestos = registrarComidaDelMenu(dia, comidaConItems)
      .meals.flatMap(m => m.items).filter(i => i.origenMenu === 'lun_m1');
    expect(puestos).toHaveLength(3);
    expect(puestos.map(i => i.quantity)).toEqual([2, 1, 1]);
  });

  it('conserva el origen de la receta, para que salga en UNA fila', () => {
    const puestos = registrarComidaDelMenu(diaVacio(), comidaConItems)
      .meals.flatMap(m => m.items).filter(i => i.originRecipeId === 'r1');
    expect(puestos).toHaveLength(2);
  });

  it('conserva el gramaje del acompañamiento', () => {
    const pan = registrarComidaDelMenu(diaVacio(), comidaConItems)
      .meals.flatMap(m => m.items).find(i => i.foodLabel.includes('pan'));
    expect(pan?.baseGrams).toBe(40);
  });

  it('marcar dos veces sigue sin contar dos veces', () => {
    const una = registrarComidaDelMenu(diaVacio(), comidaConItems);
    const dos = registrarComidaDelMenu(una, comidaConItems);
    expect(dos).toBe(una);
  });

  it('desmarcar quita exactamente lo que puso', () => {
    const puesta = registrarComidaDelMenu(diaVacio(), comidaConItems);
    const quitada = quitarComidaDelMenu(puesta, 'lun_m1');
    expect(quitada.meals.flatMap(m => m.items).filter(i => i.origenMenu === 'lun_m1')).toEqual([]);
  });
});

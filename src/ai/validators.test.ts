import { describe, it, expect } from 'vitest';
import { validateMesocyclePayload, validateNutritionPhases, validateDietPayload, leerDietaPropuesta, revisarObjetivoNutricional, avisosDeMesociclo, SEMANAS_POR_DEFECTO, type MesocycleProposalPayload } from './validators';
import { macrosDesdeGramos } from '../utils/macros';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';

/* El tope de volumen total era days × 12 y rechazaba repartos normales: con el
   criterio de Dani (8-12 series por músculo y sesión), un día de torso que toca
   tres músculos ya son ~30 series. Subido a days × 25 el 2026-09-02, y sigue
   BLOQUEANDO por encima — un error del modelo no debe colar 200 series. */

const base = (groups: MesocycleProposalPayload['groups'], daysPerWeek = 4): MesocycleProposalPayload => ({
  weeks: 8,
  daysPerWeek,
  objective: 'Hipertrofia — énfasis espalda',
  groups,
});

describe('validateMesocyclePayload — tope de volumen', () => {
  it('acepta un reparto realista que el tope viejo (días × 12) habría rechazado', () => {
    // 76 series/semana en 4 días: imposible con el tope de 12 (48), normal con 25 (100).
    const payload = base({
      pecho: { series: 12, priority: 'alta' },
      dorsal: { series: 16, priority: 'alta' },
      cuadriceps: { series: 12 },
      isquios: { series: 10 },
      gluteo: { series: 12 },
      deltoide_lat: { series: 14, priority: 'alta' },
    });
    expect(validateMesocyclePayload(payload)).toEqual([]);
  });

  it('sigue bloqueando lo que no cabe en los días que entrena', () => {
    const payload = base({ pecho: { series: 25 }, dorsal: { series: 25 }, cuadriceps: { series: 25 } }, 2);
    const issues = validateMesocyclePayload(payload);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe('groups');
    expect(issues[0].message).toContain('máx ≈ 50');
  });

  it('el límite por grupo sigue en 25', () => {
    const issues = validateMesocyclePayload(base({ dorsal: { series: 26 } }));
    expect(issues.some(i => i.message.includes('25'))).toBe(true);
  });

  it('rechaza grupos que no existen', () => {
    const issues = validateMesocyclePayload(base({ pectoral: { series: 10 } } as unknown as MesocycleProposalPayload['groups']));
    expect(issues.some(i => i.field === 'groups')).toBe(true);
  });
});


/* La periodización nutricional es lo más fácil de romper: cada fase va enlazada
   a una dieta, y una fase sin dieta no le enseña nada al atleta. Se rechaza aquí
   con el motivo, para que el modelo se corrija solo en vez de que Dani apruebe
   un plan roto. */
describe('validateNutritionPhases', () => {
  const DIETAS = ['d1', 'd2'];

  it('acepta una cadena de fases con dietas que ya existen', () => {
    const issues = validateNutritionPhases([
      { name: 'Déficit', weeks: 8, diet_id: 'd1' },
      { name: 'Mantenimiento', weeks: 2, diet_id: 'd2' },
    ], DIETAS);
    expect(issues).toEqual([]);
  });

  it('exige al menos una fase', () => {
    expect(validateNutritionPhases([], DIETAS)[0].field).toBe('phases');
  });

  it('rechaza una fase sin dieta enlazada', () => {
    const [issue] = validateNutritionPhases([{ name: 'Déficit', weeks: 8 }], DIETAS);
    expect(issue.message).toContain('necesita diet_id');
  });

  it('rechaza una dieta que no es de este atleta', () => {
    const issues = validateNutritionPhases([{ name: 'Déficit', weeks: 8, diet_id: 'de-otro' }], DIETAS);
    expect(issues.some(i => i.message.includes('no es de este atleta'))).toBe(true);
  });

  it('no deja mandar las dos cosas a la vez', () => {
    const issues = validateNutritionPhases(
      [{ name: 'X', weeks: 4, diet_id: 'd1', diet: { name: 'Y', budget: {}, meals: [] } }], DIETAS);
    expect(issues.some(i => i.message.includes('no las dos'))).toBe(true);
  });

  it('rechaza semanas imposibles', () => {
    expect(validateNutritionPhases([{ name: 'X', weeks: 0, diet_id: 'd1' }], DIETAS).some(i => i.field.endsWith('weeks'))).toBe(true);
    expect(validateNutritionPhases([{ name: 'X', weeks: 99, diet_id: 'd1' }], DIETAS).some(i => i.field.endsWith('weeks'))).toBe(true);
  });

  it('valida la dieta que viene dentro de la fase, no solo su forma', () => {
    const issues = validateNutritionPhases([{
      name: 'Déficit', weeks: 8,
      diet: {
        name: 'Baja en HC',
        budget: { HC: 8, PROT: 6, GRASA: 4 },
        meals: [{ name: 'Desayuno', items: [{ category: 'HC', foodLabel: 'inventado que no existe', quantity: 1 }] }],
      },
    }], DIETAS);
    expect(issues.some(i => i.message.includes('no reconocido'))).toBe(true);
    expect(issues.every(i => i.message.startsWith('Fase "Déficit"'))).toBe(true);
  });
});

describe('validateDietPayload — el presupuesto sí, las comidas no', () => {
  it('una dieta solo con presupuesto es válida: los alimentos los pone Dani', () => {
    expect(validateDietPayload({ budget: { HC: 8, PROT: 6, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 }, meals: [] })).toEqual([]);
    expect(validateDietPayload({ budget: { HC: 8, PROT: 6, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 } })).toEqual([]);
  });

  it('si vienen comidas, se siguen validando contra el presupuesto', () => {
    const issues = validateDietPayload({
      budget: { HC: 8, PROT: 6, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 },
      meals: [{ name: 'Comida', items: [{ category: 'HC', foodLabel: 'no existe este alimento', quantity: 1 }] }],
    });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('un presupuesto inválido sigue fallando aunque no haya comidas', () => {
    const issues = validateDietPayload({ budget: { HC: -1, PROT: 6, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 } });
    expect(issues.some(i => i.field === 'budget.HC')).toBe(true);
  });
});

describe('validateDietPayload · el banco de alimentos del coach', () => {
  const base = {
    budget: { HC: 2, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [{ name: 'Comida', items: [{ category: 'HC' as const, foodLabel: '90g tortitas de arroz de Dani', quantity: 2 }] }],
  };

  it('sin pasarle el banco, un alimento del coach se rechaza (comportamiento de siempre)', () => {
    const issues = validateDietPayload(base);
    expect(issues.some(i => i.field === 'item.foodLabel')).toBe(true);
  });

  it('pasándoselo, deja de ser un alimento desconocido', () => {
    const issues = validateDietPayload(base, ['90g tortitas de arroz de Dani']);
    expect(issues.some(i => i.field === 'item.foodLabel')).toBe(false);
  });

  it('el banco del coach SUMA al catálogo del sistema, no lo sustituye', () => {
    // Una etiqueta del sistema tiene que seguir valiendo aunque se pase un
    // banco que no la contenga.
    const delSistema = SYSTEM_FOODS[0].label;
    const issues = validateDietPayload(
      {
        budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
        meals: [{ name: 'X', items: [{ category: SYSTEM_FOODS[0].category, foodLabel: delSistema, quantity: 1 }] }],
      },
      ['otra cosa que no es esa'],
    );
    expect(issues.some(i => i.field === 'item.foodLabel')).toBe(false);
  });
});

// Dietas en kcal y gramos (10-2026): el asistente pauta gramos de P/HC/G.
describe('leerDietaPropuesta — objetivo en gramos', () => {
  const objetivo = { proteina_g: 160, hidratos_g: 220, grasa_g: 70 };

  it('las kcal salen de los gramos (4/4/9)', () => {
    const r = leerDietaPropuesta({ objetivo });
    expect(r.issues).toEqual([]);
    expect(r.objetivo).toEqual({ kcal: 160 * 4 + 220 * 4 + 70 * 9, p: 160, hc: 220, g: 70 });
  });

  it('si manda kcal que no cuadran con sus gramos, se lo dice', () => {
    const r = leerDietaPropuesta({ objetivo: { ...objetivo, kcal: 2600 } });
    expect(r.issues.some(i => i.field === 'objetivo.kcal' && i.message.includes('2150'))).toBe(true);
    // Un redondeo pequeño no protesta.
    expect(leerDietaPropuesta({ objetivo: { ...objetivo, kcal: 2160 } }).issues).toEqual([]);
  });

  it('rechaza gramos negativos y objetivos imposibles', () => {
    expect(leerDietaPropuesta({ objetivo: { ...objetivo, grasa_g: -5 } }).issues.some(i => i.field === 'objetivo.grasa_g')).toBe(true);
    expect(leerDietaPropuesta({ objetivo: { proteina_g: 20, hidratos_g: 20, grasa_g: 5 } }).issues.some(i => i.field === 'objetivo')).toBe(true);
  });

  it('sin objetivo ni cupo, falta el objetivo', () => {
    expect(leerDietaPropuesta({}).issues[0].field).toBe('objetivo');
  });

  it('un cupo en intercambios de un chat viejo se sigue leyendo', () => {
    const r = leerDietaPropuesta({ budget: { HC: 8, PROT: 6, GRASA: 4 } });
    expect(r.issues).toEqual([]);
    expect(r.objetivo).toMatchObject({ p: 150, hc: 200, g: 44 });
  });

  it('los alimentos van en gramos y se guardan como raciones del banco', () => {
    const r = leerDietaPropuesta({
      objetivo: { proteina_g: 150, hidratos_g: 250, grasa_g: 0 },
      meals: [{ name: 'Comida', items: [
        { foodLabel: '150g patata (cruda o cocida)', gramos: 1500 },
        { foodLabel: '120g pescado blanco (merluza, bacalao, lubina...)', gramos: 720 },
      ] }],
    });
    expect(r.issues).toEqual([]);
    expect(r.meals[0].items).toEqual([
      { category: 'HC', foodLabel: '150g patata (cruda o cocida)', quantity: 10, baseGrams: 150 },
      { category: 'PROT', foodLabel: '120g pescado blanco (merluza, bacalao, lubina...)', quantity: 6, baseGrams: 120 },
    ]);
  });

  it('un alimento sin pesar pide raciones, no gramos', () => {
    const sinPesar = 'Patata → 1 patata mediana del tamaño de un puño';
    const conGramos = leerDietaPropuesta({ objetivo, meals: [{ name: 'C', items: [{ foodLabel: sinPesar, gramos: 200 }] }] });
    expect(conGramos.issues.some(i => i.message.includes('raciones'))).toBe(true);
    const conRaciones = leerDietaPropuesta({ objetivo: { proteina_g: 0, hidratos_g: 150, grasa_g: 0 }, meals: [{ name: 'C', items: [{ foodLabel: sinPesar, raciones: 6 }] }] });
    expect(conRaciones.issues).toEqual([]);
  });

  it('si las comidas no suman el objetivo, dice cuánto suman y cuánto pide', () => {
    const r = leerDietaPropuesta({
      objetivo,
      meals: [{ name: 'Comida', items: [{ foodLabel: '150g patata (cruda o cocida)', gramos: 150 }] }],
    });
    const issue = r.issues.find(i => i.field === 'meals');
    expect(issue?.message).toContain('HC 25 g');
    expect(issue?.message).toContain('HC 220 g');
  });

  it('una fase de la periodización acepta la dieta con objetivo en gramos', () => {
    expect(validateNutritionPhases([{ name: 'Déficit', weeks: 8, diet: { name: 'Baja', objetivo, meals: [] } }], [])).toEqual([]);
    expect(validateNutritionPhases([{ name: 'Déficit', weeks: 8, diet: { name: 'Baja', meals: [] } }], [])
      .some(i => i.message.includes('objetivo'))).toBe(true);
  });
});

/* Doctrina en código (28-10-2026). Los casos son los reales de septiembre:
   Angel (P 250 / G 33 para 86 kg), Marco (−999 kcal frente al alta), Ander
   (2,4 g/kg), Gonzalo (3.700 kcal de superávit). Lo que entonces pasó sin
   aviso ahora se rechaza o vuelve con aviso. */
describe('revisarObjetivoNutricional — proteína, grasa y déficit frente al criterio de Dani', () => {
  const peso86 = { pesoKg: 86, mantenimientoKcal: 2665 };

  it('la dieta de Angel: 2,9 g/kg de proteína es aviso y 0,4 g/kg de grasa (13 %) se rechaza', () => {
    const r = revisarObjetivoNutricional(macrosDesdeGramos(250, 225, 33), peso86);
    expect(r.issues.map(i => i.field)).toEqual(['objetivo.grasa_g']);
    expect(r.avisos.join(' ')).toMatch(/2,9 g\/kg/);
  });

  it('un objetivo dentro del rango (2 g/kg, grasa 0,8 g/kg, déficit 400) pasa sin issues ni avisos', () => {
    const r = revisarObjetivoNutricional(macrosDesdeGramos(172, 230, 70), peso86);
    expect(r.issues).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it('la proteína de la doctrina vieja (0,8-1 g/kg) ya no se acepta', () => {
    const r = revisarObjetivoNutricional(macrosDesdeGramos(86, 300, 70), peso86);
    expect(r.issues.map(i => i.field)).toEqual(['objetivo.proteina_g']);
    expect(r.issues[0].message).toContain('1,6-2,2');
  });

  it('entre 1,2 y 1,6 g/kg es aviso, no rechazo', () => {
    const r = revisarObjetivoNutricional(macrosDesdeGramos(125, 300, 70), peso86); // 1,45 g/kg
    expect(r.issues).toEqual([]);
    expect(r.avisos.some(a => /por debajo del rango/.test(a))).toBe(true);
  });

  it('un déficit de −999 kcal (Marco) es aviso por encima de 700 y rechazo por encima de 1.000, salvo pérdida acelerada', () => {
    const d = macrosDesdeGramos(180, 230, 70); // 2.270 kcal
    const aviso = revisarObjetivoNutricional(d, { pesoKg: 90, mantenimientoKcal: 3000 }); // −730
    expect(aviso.issues).toEqual([]);
    expect(aviso.avisos.some(a => /techo de la doctrina/.test(a))).toBe(true);
    const rechazo = revisarObjetivoNutricional(d, { pesoKg: 90, mantenimientoKcal: 3400 }); // −1.130
    expect(rechazo.issues.map(i => i.field)).toEqual(['objetivo']);
    const acelerado = revisarObjetivoNutricional(d, { pesoKg: 90, mantenimientoKcal: 3400, objetivoFase: 'deficit_acelerado' });
    expect(acelerado.issues).toEqual([]);
  });

  it('en déficit la grasa por debajo de 0,8 g/kg avisa aunque pase de 0,6', () => {
    const r = revisarObjetivoNutricional(macrosDesdeGramos(180, 200, 60), { pesoKg: 86, objetivoFase: 'deficit' }); // 0,7 g/kg
    expect(r.issues).toEqual([]);
    expect(r.avisos.some(a => /0,8 en déficit/.test(a))).toBe(true);
  });

  it('un superávit de más de 500 kcal (Gonzalo, 3.700 frente a 3.403) avisa', () => {
    const r = revisarObjetivoNutricional(macrosDesdeGramos(180, 520, 90), { pesoKg: 90, mantenimientoKcal: 2900 }); // 3.610
    expect(r.avisos.some(a => /Superávit/.test(a))).toBe(true);
  });

  it('sin peso ni mantenimiento no acota por kg ni por déficit: solo el suelo de kcal', () => {
    expect(revisarObjetivoNutricional(macrosDesdeGramos(60, 150, 30), {})).toEqual({
      issues: [], avisos: [expect.stringMatching(/1400/)],
    });
    expect(revisarObjetivoNutricional(macrosDesdeGramos(160, 220, 70))).toEqual({ issues: [], avisos: [] });
  });
});

describe('avisosDeMesociclo — lo que Dani corregía siempre', () => {
  const base: MesocycleProposalPayload = { weeks: SEMANAS_POR_DEFECTO, daysPerWeek: 4, objective: 'Hipertrofia', groups: { pecho: { series: 12 }, dorsal: { series: 14 } } };

  it('12 semanas y pocos grupos: sin avisos', () => {
    expect(avisosDeMesociclo(base)).toEqual([]);
    expect(SEMANAS_POR_DEFECTO).toBe(12);
  });

  it('un bloque de 6 semanas avisa; uno de 8 no', () => {
    expect(avisosDeMesociclo({ ...base, weeks: 6 })[0]).toMatch(/6 semanas/);
    expect(avisosDeMesociclo({ ...base, weeks: 8 })).toEqual([]);
  });

  it('repartir series a 14 o más grupos avisa de los que Dani deja a cero', () => {
    const todos = Object.fromEntries(['pecho', 'dorsal', 'trapecio', 'deltoide_ant', 'deltoide_lat', 'deltoide_post', 'biceps', 'triceps', 'cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core'].map(g => [g, { series: 4 }]));
    const avisos = avisosDeMesociclo({ ...base, groups: todos as MesocycleProposalPayload['groups'] });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/glúteo, gemelo y core/);
  });
});

import type { Diet, MenuDay, NutritionProgram } from '../types';
import { objetivoDeDieta } from './macrosLegado';
import { objetivoDelDiaDeMenu } from './menuMacros';
import { gramosDeAjuste, gramosDeRegla } from './semanasNutricion';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants';
import { redondearMacros } from './macros';

/* ═══════════════════════════════════════════════════════════════════════════
   Pasar a kcal lo guardado en intercambios (scripts/migrarAKcal.ts)

   La app ya lee lo viejo con el adaptador (utils/macrosLegado.ts), así que
   esto no es necesario para que funcione: deja escritos los campos nuevos para
   que lo guardado no dependa del adaptador. Solo AÑADE: nunca borra `budget`,
   `delta`, `cantidad` ni `entreno`/`descanso`, que siguen leyendo los binarios
   viejos. Cada función devuelve el parche, o null si no hay nada que añadir.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Dieta sin `objetivo`: se le escribe el que sale de su cupo. */
export function parcheDeDieta(diet: Pick<Diet, 'objetivo' | 'budget'>): Pick<Diet, 'objetivo'> | null {
  if (diet.objetivo || !diet.budget) return null;
  return { objetivo: redondearMacros(objetivoDeDieta(diet)) };
}

/** Programa con ajustes, ciclado o reglas en intercambios: se les ponen los gramos. */
export function parcheDePrograma(
  program: Pick<NutritionProgram, 'cambiosSemana' | 'ciclado' | 'reglasPeso'>,
): Partial<Pick<NutritionProgram, 'cambiosSemana' | 'ciclado' | 'reglasPeso'>> | null {
  const parche: Partial<Pick<NutritionProgram, 'cambiosSemana' | 'ciclado' | 'reglasPeso'>> = {};
  const cambios = program.cambiosSemana ?? [];
  if (cambios.some(c => c.ajustes.some(a => a.gramos === undefined))) {
    parche.cambiosSemana = cambios.map(c => ({
      ...c,
      ajustes: c.ajustes.map(a => (a.gramos === undefined ? { ...a, gramos: Math.round(gramosDeAjuste(a)) } : a)),
    }));
  }
  const c = program.ciclado;
  if (c && (c.entrenoG === undefined || c.descansoG === undefined)) {
    parche.ciclado = {
      ...c,
      entrenoG: c.entrenoG ?? Math.round(c.entreno * GRAMS_PER_EXCHANGE.HC),
      descansoG: c.descansoG ?? Math.round(c.descanso * GRAMS_PER_EXCHANGE.HC),
    };
  }
  const reglas = program.reglasPeso ?? [];
  if (reglas.some(r => r.gramos === undefined)) {
    parche.reglasPeso = reglas.map(r => (r.gramos === undefined ? { ...r, gramos: Math.round(gramosDeRegla(r)) } : r));
  }
  return Object.keys(parche).length > 0 ? parche : null;
}

/** Menú con días sin `objetivo` en kcal: se les escribe el de su `target`. */
export function parcheDeMenu(menu: { days: MenuDay[] }): { days: MenuDay[] } | null {
  if (!menu.days.some(d => !d.objetivo && d.dietId)) return null;
  return {
    days: menu.days.map(d => (d.objetivo || !d.dietId ? d : { ...d, objetivo: redondearMacros(objetivoDelDiaDeMenu(d)) })),
  };
}

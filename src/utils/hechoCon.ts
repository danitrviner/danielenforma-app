import type { AthleteNutritionConfig, OnboardingData, RecipeFavorites, WeeklyMenu } from '../types';
import { athleteConditions, restrictionLabel } from './dietaryRestrictions';
import { dishTypeLabel } from './dishTypes';
import { senalesDeCambios } from './gustosDelAtleta';

/* ═══════════════════════════════════════════════════════════════════════════
   «Hecho con lo que me dijiste» (tanda 9, 29-10-2026)

   El menú y las recetas ya usan las restricciones del alta, el tipo de
   dieta, los gustos y los cambios habituales del atleta (`gustosDelAtleta`,
   `menuEngine`): lo que no hacían era DECIRLO. Principio 6 del plan:
   personalización que se nota. Esto elige hasta tres cosas, de más a menos
   importante para él, y las dice con sus palabras. Puro.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MAX_ETIQUETAS = 3;

export function etiquetasHechoCon(e: {
  onboarding?: Pick<OnboardingData, 'dietType' | 'healthConditions' | 'allergies' | 'batchCookingPreferred'> | null;
  config?: Pick<AthleteNutritionConfig, 'preferredDishTypes' | 'batchCookingPreferred'> | null;
  favoritos?: Pick<RecipeFavorites, 'recipeIds' | 'dislikedIds'> | null;
  menus?: readonly WeeklyMenu[];
}): string[] {
  const out: string[] = [];
  const add = (t: string | null | undefined) => { if (t && !out.includes(t) && out.length < MAX_ETIQUETAS) out.push(t); };

  // 1. Lo que no puede comer: lo primero, porque es lo que más se nota si falla.
  for (const code of athleteConditions(e.onboarding)) add(`sin ${restrictionLabel(code).toLowerCase()}`);

  // 2. El tipo de dieta.
  if (e.onboarding?.dietType === 'vegano') add('vegano');
  else if (e.onboarding?.dietType === 'vegetariano') add('vegetariano');

  // 3. Los cambios que hace siempre («bebida de avena en vez de leche»).
  const cambios = e.menus && e.menus.length > 0 ? senalesDeCambios(e.menus) : null;
  for (const [de, a] of Object.entries(cambios?.sustituciones ?? {})) add(`${a} en vez de ${de}`);

  // 4. Lo que pidió ver más, y cómo cocina.
  for (const t of e.config?.preferredDishTypes ?? []) add(`más ${dishTypeLabel(t).toLowerCase()}`);
  if (e.config?.batchCookingPreferred ?? e.onboarding?.batchCookingPreferred) add('batch cooking');

  // 5. Sus favoritas y lo que no le gusta.
  const fav = e.favoritos?.recipeIds?.length ?? 0;
  if (fav > 0) add(`tus ${fav} favorita${fav === 1 ? '' : 's'}`);
  const no = e.favoritos?.dislikedIds?.length ?? 0;
  if (no > 0) add(`sin lo que no te gusta (${no})`);

  return out;
}

import type { Recipe, WeeklyMenu, UserProfile } from '../types';
import {
  getNutritionProgram, getPublishedMenu, getWeeklyMenusForAthlete, createWeeklyMenu, getDietsForAthlete,
  getAthleteDietConfig, getAthleteNutritionConfig, getOnboarding, getRecipeFavorites, getReglasDeReceta, getAccesoGlobalARecetas, getRecipes,
  queryRecetasForGenerator, getFoodItems, createNotificationDeduped,
} from '../dbService';
import { generateWeek, slotsFromOnboarding, recipeMatchesSlot, type GeneratorPrefs } from '../utils/menuEngine';
import { listaDeMenuVigente } from '../utils/accesoARecetas';
import { quiereAlgunaDieta } from '../utils/seleccionDeRecetas';
import { athleteConditions } from '../utils/dietaryRestrictions';
import { dietTypeVigente } from '../utils/foodPrefs';
import type { DishType } from '../utils/dishTypes';
import { semanaQueNecesitaMenu, ajustesDeLaSemana, aplicarAjustes } from '../utils/semanasNutricion';
import { calendarioDeMenu } from '../utils/objetivoDelDia';
import { hoyIsoLocal } from '../utils/trainingWeek';

/* Menú semanal que se genera solo. Al empezar una semana de la periodización
   en la que la dieta del atleta cambia (−1 hidrato en la cena, mantenimiento…),
   se genera el menú de esa semana con las mismas preferencias que el que tiene
   publicado y se deja como BORRADOR: el coach lo revisa y lo publica.

   No hay servidor que lo dispare (el generador corre en la app), así que lo
   lanza la app del coach al abrir Inicio, una vez al día. */

const MARCA = 'enforma_menus_auto_revisado_v1';

/** Genera el borrador del atleta si toca. Devuelve la semana generada o null. */
export async function generarMenuSiToca(athleteEmail: string, coachId: string, coachEmail: string): Promise<number | null> {
  const hoy = hoyIsoLocal();
  const [program, publicado] = await Promise.all([getNutritionProgram(athleteEmail), getPublishedMenu(athleteEmail)]);
  if (!program || !publicado) return null;
  const borradores = (await getWeeklyMenusForAthlete(athleteEmail)).filter(m => m.status === 'draft');
  const semana = semanaQueNecesitaMenu(program, publicado, borradores, hoy);
  if (semana == null) return null;

  const [diets, dietConfig, nutritionConfig, onboarding, favoritos, delCoach, alimentos] = await Promise.all([
    getDietsForAthlete(athleteEmail), getAthleteDietConfig(athleteEmail), getAthleteNutritionConfig(athleteEmail),
    getOnboarding(athleteEmail), getRecipeFavorites(athleteEmail), getRecipes({ ownerId: coachId }), getFoodItems(),
  ]);
  // Lo que el coach ha escondido a este atleta. Sin lectura posible (red, permisos)
  // se genera sin reglas: un menú sin ellas es mejor que ninguno.
  const reglas = await getReglasDeReceta(athleteEmail);
  const acceso = await getAccesoGlobalARecetas();
  // Qué dieta lleva cada día: la misma resolución que Inicio y Nutrición
  // (calendario → fase → activa), no el calendario a pelo.
  const { schedule, dietas: dietasDelCoach } = calendarioDeMenu({ diets, config: dietConfig, program, semana });
  if (!Object.values(schedule).some(Boolean)) return null;

  const ajustes = ajustesDeLaSemana(program, semana);
  const mantenimiento = (program.semanasMantenimiento ?? []).includes(semana);
  const dietas = dietasDelCoach.map(d => aplicarAjustes(d, ajustes, { mantenimiento }));

  // Mismo reparto, variedad y preferencias que el editor (WeeklyMenuEditor).
  const slots = slotsFromOnboarding(onboarding, nutritionConfig?.hungerProfile, nutritionConfig?.mealCount);
  const prefs: GeneratorPrefs = {
    allergies: onboarding?.allergies ?? [],
    conditions: athleteConditions(onboarding),
    disliked: onboarding?.dislikedFoods ?? [],
    liked: onboarding?.likedFoods ?? [],
    dietType: dietTypeVigente(nutritionConfig?.dietType, onboarding?.dietType),
    cookingMaxTime: nutritionConfig?.cookingMaxTime ?? onboarding?.cookingMaxTime,
    quiereRapidas: nutritionConfig?.quiereRapidas ?? onboarding?.quiereRapidas,
    variety: publicado.varietyLevel,
    favoriteRecipeIds: favoritos.recipeIds,
    dislikedRecipeIds: favoritos.dislikedIds ?? [],
    preferredDishTypes: (nutritionConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as DishType[],
    excludedDishTypes: (nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as DishType[],
    recetasOcultas: reglas.reglas,
    listaMenu: listaDeMenuVigente(reglas.listaMenu, acceso.listaMenu),
    seleccion: reglas.seleccion,
    paquetes: acceso.paquetes ?? [],
  };
  const tambien = quiereAlgunaDieta(prefs.seleccion, prefs.paquetes);
  const pools: Record<number, Recipe[]> = {};
  for (const slot of Array.from(new Set<number>(slots.map(s => s.slot)))) {
    const recetas = await queryRecetasForGenerator(slot, 300, prefs.listaMenu, tambien);
    pools[slot] = [...recetas, ...delCoach.filter(r => recipeMatchesSlot(r, slot))];
  }
  const days = generateWeek({
    schedule, diets: dietas, slots, pools, foods: alimentos, prefs,
    batch: !!publicado.batchCooking, mode: nutritionConfig?.enabledModes?.[0] ?? 'OMNIVORO',
  });

  const borrador: Omit<WeeklyMenu, 'id'> = {
    athleteId: athleteEmail,
    status: 'draft',
    name: `Menú semana ${semana} · generado solo`,
    createdAt: new Date().toISOString(),
    varietyLevel: publicado.varietyLevel,
    batchCooking: !!publicado.batchCooking,
    days,
    swapHistory: [],
    semanaPrograma: semana,
  };
  await createWeeklyMenu(borrador);
  await createNotificationDeduped(`menu_auto_${athleteEmail}_${program.startDate}_${semana}`, {
    recipientEmail: coachEmail,
    type: 'menu_draft_ready',
    title: 'Menú semanal listo para revisar',
    body: `${athleteEmail}: su dieta cambia en la semana ${semana}. Se ha generado el menú de esa semana como borrador; revísalo y publícalo.`,
    link: 'clients',
    createdAt: new Date().toISOString(),
    read: false,
  });
  return semana;
}

/** Revisa a todos los atletas una vez al día (en este dispositivo). */
export async function revisarMenusAutomaticos(athletes: UserProfile[], coachId: string, coachEmail: string): Promise<void> {
  const hoy = hoyIsoLocal();
  try { if (localStorage.getItem(MARCA) === hoy) return; } catch { /* sin almacenamiento: se revisa igual */ }
  try { localStorage.setItem(MARCA, hoy); } catch { /* idem */ }
  for (const a of athletes) {
    try {
      await generarMenuSiToca(a.email, coachId, coachEmail);
    } catch (err) {
      console.warn('Menú automático: no se pudo generar para', a.email, err);
    }
  }
}

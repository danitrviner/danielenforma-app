import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { Recipe } from '../types';
import { getRecipes } from '../db/recipes';

/* ═══════════════════════════════════════════════════════════════════════════
   Las recetas que se crea el atleta (25-11)

   Dani: «si el atleta guarda una receta de manera manual, a través del
   diario, que le aparezca directamente en su plan como una preferida». Las
   suyas cuentan como favoritas y están siempre en su plan: el generador las
   mete en la muestra, la lista del coach no las deja fuera
   (`recetasFijasDelMenu`) y se ven en Recetas del atleta y en «A medida».

   Misma clave que «cambiar comida» del atleta (`MyMenuScreen`): una sola carga.
   ═══════════════════════════════════════════════════════════════════════════ */

const SIN_RECETAS: Recipe[] = [];

export const recetasDelAtletaKey = (uid: string) => ['recipes', uid] as const;

const leer = (uid: string) => getRecipes({ ownerId: uid }).catch(() => SIN_RECETAS);

export function useRecetasDelAtleta(uid: string | undefined): Recipe[] {
  const { data } = useQuery({
    queryKey: recetasDelAtletaKey(uid ?? ''),
    queryFn: () => leer(uid!),
    enabled: !!uid,
    staleTime: 5 * 60_000,
  });
  return data ?? SIN_RECETAS;
}

/** Para generar: espera a tenerlas (comparte caché con el hook). */
export function cargarRecetasDelAtleta(queryClient: QueryClient, uid: string | undefined): Promise<Recipe[]> {
  if (!uid) return Promise.resolve(SIN_RECETAS);
  return queryClient.fetchQuery({ queryKey: recetasDelAtletaKey(uid), queryFn: () => leer(uid), staleTime: 5 * 60_000 });
}

export { favoritasConLasSuyas } from '../utils/seleccionDeRecetas';

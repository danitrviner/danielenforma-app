import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PaqueteDeRecetas, SeleccionDeRecetas } from '../utils/seleccionDeRecetas';
import { getReglasDeReceta, getAccesoGlobalARecetas } from '../db/recipes';
import { listaDeMenuVigente, modoRecetarioVigente, type ListaDeMenu, type ModoRecetario } from '../utils/accesoARecetas';
import type { ReglaDeReceta } from '../utils/reglasDeReceta';

const SIN_REGLAS: ReglaDeReceta[] = [];
const SIN_RECOMENDADAS: string[] = [];

export const reglasDeRecetaKey = (email: string) => ['athleteRecipeRules', email] as const;

/**
 * Recetas que el coach ha escondido a este atleta (utils/reglasDeReceta.ts).
 * Mientras carga, o si falla, devuelve «ninguna»: nunca deja al atleta sin menú.
 * Misma clave en todas las pantallas, así que se lee una sola vez.
 */
export function useReglasDeReceta(email: string | undefined): ReglaDeReceta[] {
  const { data } = useQuery({
    queryKey: reglasDeRecetaKey(email ?? ''),
    queryFn: () => getReglasDeReceta(email!),
    enabled: !!email,
    staleTime: 5 * 60_000,
  });
  return data?.reglas ?? SIN_REGLAS;
}

/**
 * Recetas que el coach le RECOMIENDA a este atleta: salen en una fila propia
 * arriba del recetario. Viajan en el mismo documento que las escondidas, así
 * que comparten la lectura: pedir las dos no cuesta una lectura más.
 */
export function useRecomendadasDelCoach(email: string | undefined): string[] {
  const { data } = useQuery({
    queryKey: reglasDeRecetaKey(email ?? ''),
    queryFn: () => getReglasDeReceta(email!),
    enabled: !!email,
    staleTime: 5 * 60_000,
  });
  return data?.recomendadas ?? SIN_RECOMENDADAS;
}

export const accesoGlobalKey = ['recipeAccess', 'global'] as const;

/**
 * Recetas con las que el generador trabaja para este atleta (N-03): su lista
 * si el coach le ha hecho una, si no la global, si no las Rápidas.
 * Comparte la lectura de las reglas del atleta; la global es un documento más.
 */
export function useListaDeMenu(email: string | undefined): ListaDeMenu {
  const { data: reglas } = useQuery({
    queryKey: reglasDeRecetaKey(email ?? ''),
    queryFn: () => getReglasDeReceta(email!),
    enabled: !!email,
    staleTime: 5 * 60_000,
  });
  const { data: global } = useQuery({
    queryKey: accesoGlobalKey,
    queryFn: getAccesoGlobalARecetas,
    staleTime: 5 * 60_000,
  });
  return listaDeMenuVigente(reglas?.listaMenu, global?.listaMenu);
}

const SIN_PAQUETES: PaqueteDeRecetas[] = [];

/**
 * Filtros del coach por dieta y sus paquetes (seleccionDeRecetas.ts). Comparte
 * las dos lecturas de `useListaDeMenu`: no cuesta ninguna más.
 */
export function useSeleccionDeRecetas(email: string | undefined): { seleccion?: SeleccionDeRecetas; paquetes: PaqueteDeRecetas[] } {
  const { data: reglas } = useQuery({
    queryKey: reglasDeRecetaKey(email ?? ''),
    queryFn: () => getReglasDeReceta(email!),
    enabled: !!email,
    staleTime: 5 * 60_000,
  });
  const { data: global } = useQuery({
    queryKey: accesoGlobalKey,
    queryFn: getAccesoGlobalARecetas,
    staleTime: 5 * 60_000,
  });
  const seleccion = reglas?.seleccion;
  const paquetes = global?.paquetes ?? SIN_PAQUETES;
  return useMemo(() => ({ seleccion, paquetes }), [seleccion, paquetes]);
}

/** Qué navega el atleta en el recetario: todas, o solo las que le recomienda el coach. */
export function useModoRecetario(email: string | undefined): ModoRecetario {
  const { data } = useQuery({
    queryKey: reglasDeRecetaKey(email ?? ''),
    queryFn: () => getReglasDeReceta(email!),
    enabled: !!email,
    staleTime: 5 * 60_000,
  });
  return modoRecetarioVigente(data?.recetario);
}

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AthleteNutritionConfig, OnboardingData, Recipe, WeekDay } from '../types';
import { cargarIndiceRecetas, getRecipeFavorites, saveReglasDeReceta } from '../dbService';
import { reglasDeRecetaKey, useReglasDeReceta } from '../hooks/useReglasDeReceta';
import { athleteConditions } from '../utils/dietaryRestrictions';
import { dietTypeVigente } from '../utils/foodPrefs';
import { dishType, dishTypeLabel, type DishType } from '../utils/dishTypes';
import {
  poolDelAtleta, filtrarLista, categoriasDe, FILTRO_VACIO, TOPES_DE_TIEMPO, type FiltroDeLista,
} from '../utils/poolDelAtleta';
import { etiquetaDeTiempo } from '../utils/tiempoDeReceta';
import { useConfirm } from '../hooks/useConfirm';
import {
  DIAS_SEMANA, conRegla, etiquetaDeDias, type ReglaDeReceta,
} from '../utils/reglasDeReceta';
import { useToast } from '../hooks/useToast';
import { Icon, Skeleton, Select } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Recetas de este atleta (Dietas › Info)

   El pool que el atleta tiene activo —el recetario menos lo que sus alergias,
   condiciones, dieta, tiempo y «no me gusta» dejan fuera— con un interruptor por
   receta: la escondes y deja de salir en su menú, en los cambios de comida y en
   su recetario. Puedes esconderla solo algunos días (la receta del martes que
   no encaja con su entreno del miércoles, por ejemplo).
   ═══════════════════════════════════════════════════════════════════════════ */

const POR_PAGINA = 40;
const TODOS: WeekDay[] = DIAS_SEMANA.map(d => d.dia);

interface Props {
  athleteEmail: string;
  onboarding: OnboardingData | null;
  nutritionConfig: AthleteNutritionConfig | null;
}

const Fila: React.FC<{
  receta: Recipe;
  regla: ReglaDeReceta | undefined;
  guardando: boolean;
  onCambiar: (dias: WeekDay[] | null | undefined) => void;
}> = ({ receta, regla, guardando, onCambiar }) => {
  const escondida = !!regla;
  const dias = regla?.dias?.length ? regla.dias : TODOS;

  const alternarDia = (d: WeekDay) => {
    const siguiente = dias.includes(d) ? dias.filter(x => x !== d) : [...dias, d];
    // Quitar el último día equivale a mostrarla: para eso está el interruptor.
    if (siguiente.length === 0) return;
    onCambiar(siguiente);
  };

  return (
    <li className={`py-2.5 border-t first:border-t-0 border-hairline ${escondida ? 'bg-raised/40' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className={`font-sans text-label font-bold truncate ${escondida ? 'text-ink-3 line-through' : 'text-ink'}`}>
            {receta.name}
          </p>
          <p className="font-mono text-caption text-ink-3 truncate">
            {receta.categoria ?? dishTypeLabel(dishType(receta))} · <span className="text-ink-2">{etiquetaDeTiempo(receta)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCambiar(escondida ? null : undefined)}
          disabled={guardando}
          aria-pressed={escondida}
          aria-label={`${escondida ? 'Volver a permitir' : 'Esconder'}: ${receta.name}`}
          className={`flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-control border transition-colors disabled:opacity-50 ${
            escondida ? 'border-warning text-warning bg-warning/10' : 'border-hairline text-ink-3 hover:text-ink hover:border-strong'
          }`}
          title={escondida ? 'Escondida: tócala para permitirla' : 'Esconder a este atleta'}
        >
          <Icon name={escondida ? 'visibility_off' : 'visibility'} size="m" />
        </button>
      </div>

      {escondida && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-caption text-ink-3 mr-1">No sale: {etiquetaDeDias(regla?.dias)}</span>
          {DIAS_SEMANA.map(d => {
            const on = dias.includes(d.dia);
            return (
              <button
                key={d.dia}
                type="button"
                onClick={() => alternarDia(d.dia)}
                disabled={guardando}
                aria-pressed={on}
                aria-label={`${on ? 'Permitir' : 'Esconder'} el ${d.largo}`}
                className={`h-8 w-8 rounded-full font-mono text-caption font-bold border transition-colors ${
                  on ? 'bg-warning/15 border-warning text-warning' : 'border-hairline text-ink-3 hover:text-ink'
                }`}
              >{d.corto}</button>
            );
          })}
        </div>
      )}
    </li>
  );
};

export default function ReglasDeRecetasPanel({ athleteEmail, onboarding, nutritionConfig }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const reglas = useReglasDeReceta(athleteEmail);
  const { confirm, ConfirmDialog } = useConfirm();
  const [filtro, setFiltro] = useState<FiltroDeLista>(FILTRO_VACIO);
  const [soloEscondidas, setSoloEscondidas] = useState(false);
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const cambiarFiltro = (parcial: Partial<FiltroDeLista>) => {
    setFiltro(f => ({ ...f, ...parcial }));
    setVisibles(POR_PAGINA);
  };
  const hayFiltro = JSON.stringify(filtro) !== JSON.stringify(FILTRO_VACIO) || soloEscondidas;

  const { data: indice = [], isPending: cargandoIndice } = useQuery({
    queryKey: ['recetarioIndice'],
    queryFn: cargarIndiceRecetas,
    staleTime: Infinity,
  });
  const { data: favoritos } = useQuery({
    queryKey: ['recipeFavorites', athleteEmail],
    queryFn: () => getRecipeFavorites(athleteEmail),
  });

  const pool = useMemo(() => poolDelAtleta(indice, {
    allergies: onboarding?.allergies ?? [],
    conditions: athleteConditions(onboarding),
    dietType: dietTypeVigente(nutritionConfig?.dietType, onboarding?.dietType),
    cookingMaxTime: nutritionConfig?.cookingMaxTime ?? onboarding?.cookingMaxTime,
    excludedDishTypes: (nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as DishType[],
    dislikedRecipeIds: favoritos?.dislikedIds ?? [],
  }), [indice, onboarding, nutritionConfig, favoritos]);

  const porId = useMemo(() => new Map(reglas.map(r => [r.recipeId, r])), [reglas]);

  const guardar = useMutation({
    mutationFn: (siguientes: ReglaDeReceta[]) => saveReglasDeReceta({ athleteId: athleteEmail, reglas: siguientes }),
    onMutate: async siguientes => {
      // Optimista: el interruptor responde al instante y se deshace si falla.
      await queryClient.cancelQueries({ queryKey: reglasDeRecetaKey(athleteEmail) });
      const previo = queryClient.getQueryData(reglasDeRecetaKey(athleteEmail));
      queryClient.setQueryData(reglasDeRecetaKey(athleteEmail), { athleteId: athleteEmail, reglas: siguientes });
      return { previo };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(reglasDeRecetaKey(athleteEmail), ctx?.previo);
      showToast('No se pudo guardar el cambio. Inténtalo otra vez.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: reglasDeRecetaKey(athleteEmail) }),
  });

  const categorias = useMemo(() => categoriasDe(pool), [pool]);

  const lista = useMemo(() => {
    const escondidasPrimero = [...pool].sort((a, b) => Number(porId.has(b.id)) - Number(porId.has(a.id)));
    return filtrarLista(escondidasPrimero, filtro).filter(r => !soloEscondidas || porId.has(r.id));
  }, [pool, porId, soloEscondidas, filtro]);

  // Esconder o permitir TODAS las que se ven con los filtros puestos: «todo lo
  // que lleve atún», «todas las de más de 30 minutos». Una sola escritura.
  const aplicarALasVisibles = async (esconder: boolean) => {
    const ids = new Set<string>(lista.map(r => r.id));
    const verbo = esconder ? 'Esconder' : 'Volver a permitir';
    if (!await confirm(`¿${verbo} las ${ids.size.toLocaleString('es-ES')} recetas que se ven ahora?`)) return;
    const siguientes = esconder
      ? [...reglas.filter(r => !ids.has(r.recipeId)), ...[...ids].map(recipeId => ({ recipeId }))]
      : reglas.filter(r => !ids.has(r.recipeId));
    guardar.mutate(siguientes);
  };
  const visiblesEscondidas = lista.filter(r => porId.has(r.id)).length;

  // Las escondidas que ya no están en el pool (la receta se retiró o el atleta
  // cambió de dieta) siguen contando: se pueden volver a permitir desde aquí.
  const huerfanas = reglas.filter(r => !pool.some(p => p.id === r.recipeId));

  return (
    <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
      <div>
        <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
          <Icon name="menu_book" size="m" className="text-accent-ink" />
          Recetas de este atleta
        </h3>
        <p className="font-sans text-label text-ink-2 mt-1">
          Lo que puede recibir hoy según sus alergias, dieta y preferencias. Escondida, una receta no sale en su
          menú, en los cambios de comida ni en su recetario.
        </p>
      </div>

      {cargandoIndice ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <p className="font-mono text-caption text-ink-2">
            {pool.length.toLocaleString('es-ES')} en su pool · {reglas.length} {reglas.length === 1 ? 'escondida' : 'escondidas'}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="search"
              value={filtro.texto}
              onChange={e => cambiarFiltro({ texto: e.target.value })}
              placeholder="Buscar por nombre"
              aria-label="Buscar receta del pool por nombre"
              className="bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-base text-ink focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <input
                type="search"
                value={filtro.ingrediente}
                onChange={e => cambiarFiltro({ ingrediente: e.target.value })}
                placeholder="Ingrediente (atún, huevo…)"
                aria-label="Filtrar por ingrediente"
                className="min-w-0 flex-1 bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-base text-ink focus:outline-none focus:border-accent"
              />
              <div role="group" aria-label="Con o sin ese ingrediente" className="flex flex-shrink-0 border border-hairline rounded-control overflow-hidden">
                {(['con', 'sin'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => cambiarFiltro({ modoIngrediente: m })}
                    aria-pressed={filtro.modoIngrediente === m}
                    className={`px-3 min-h-[44px] font-sans text-caption font-bold uppercase transition-colors ${
                      filtro.modoIngrediente === m ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'
                    }`}
                  >{m}</button>
                ))}
              </div>
            </div>
            <Select
              label="Categoría"
              value={filtro.categoria}
              onChange={v => cambiarFiltro({ categoria: v })}
              options={[
                { value: '', label: 'Todas las categorías' },
                ...categorias.map(c => ({ value: c.nombre, label: `${c.nombre} (${c.total.toLocaleString('es-ES')})` })),
              ]}
            />
            <Select
              label="Tiempo"
              value={filtro.tiempo}
              onChange={v => cambiarFiltro({ tiempo: v as FiltroDeLista['tiempo'] })}
              options={TOPES_DE_TIEMPO}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setSoloEscondidas(v => !v); setVisibles(POR_PAGINA); }}
              aria-pressed={soloEscondidas}
              className={`min-h-[44px] px-3 rounded-control border font-sans text-caption font-bold uppercase transition-colors ${
                soloEscondidas ? 'bg-accent text-on-accent border-accent' : 'border-hairline text-ink-2 hover:text-ink'
              }`}
            >Solo escondidas</button>
            {hayFiltro && (
              <button
                type="button"
                onClick={() => { setFiltro(FILTRO_VACIO); setSoloEscondidas(false); setVisibles(POR_PAGINA); }}
                className="min-h-[44px] px-3 font-mono text-caption text-ink-2 hover:text-ink"
              >Quitar filtros</button>
            )}
            {hayFiltro && lista.length > 0 && (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <span className="font-mono text-caption text-ink-3">{lista.length.toLocaleString('es-ES')} a la vista</span>
                {lista.length > visiblesEscondidas && (
                  <button
                    type="button"
                    onClick={() => aplicarALasVisibles(true)}
                    disabled={guardar.isPending}
                    className="min-h-[44px] px-3 rounded-control border border-warning text-warning font-sans text-caption font-bold uppercase disabled:opacity-50"
                  >Esconder las que se ven</button>
                )}
                {visiblesEscondidas > 0 && (
                  <button
                    type="button"
                    onClick={() => aplicarALasVisibles(false)}
                    disabled={guardar.isPending}
                    className="min-h-[44px] px-3 rounded-control border border-hairline text-ink-2 hover:text-ink font-sans text-caption font-bold uppercase disabled:opacity-50"
                  >Permitir las que se ven</button>
                )}
              </span>
            )}
          </div>

          {huerfanas.length > 0 && (
            <p className="font-mono text-caption text-ink-3">
              {huerfanas.length} {huerfanas.length === 1 ? 'regla' : 'reglas'} sobre recetas que ya no están en su pool.{' '}
              <button
                type="button"
                className="text-accent-ink hover:underline"
                onClick={() => guardar.mutate(reglas.filter(r => pool.some(p => p.id === r.recipeId)))}
              >Quitarlas</button>
            </p>
          )}

          {lista.length === 0 ? (
            <p className="font-sans text-label text-ink-3 py-4">
              {soloEscondidas && !hayFiltro ? 'No has escondido ninguna receta.' : 'Ninguna receta coincide con esos filtros.'}
            </p>
          ) : (
            <ul className="m-0 p-0 list-none">
              {lista.slice(0, visibles).map(r => (
                <Fila
                  key={r.id}
                  receta={r}
                  regla={porId.get(r.id)}
                  guardando={guardar.isPending}
                  onCambiar={dias => guardar.mutate(conRegla(reglas, r.id, dias))}
                />
              ))}
            </ul>
          )}

          {lista.length > visibles && (
            <button
              type="button"
              onClick={() => setVisibles(v => v + POR_PAGINA)}
              className="font-mono text-caption text-accent-ink hover:underline"
            >
              Ver {Math.min(POR_PAGINA, lista.length - visibles)} más ({lista.length - visibles} sin mostrar)
            </button>
          )}
        </>
      )}
      <ConfirmDialog />
    </div>
  );
}

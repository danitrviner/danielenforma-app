import React, { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cargarIndiceRecetas, getReglasDeReceta, saveReglasDeReceta, getAccesoGlobalARecetas } from '../dbService';
import { accesoGlobalKey, reglasDeRecetaKey } from '../hooks/useReglasDeReceta';
import { listaDeMenuVigente, modoRecetarioVigente, filtrarPorLista, type ModoRecetario } from '../utils/accesoARecetas';
import { useToast } from '../hooks/useToast';
import { Skeleton } from './ui';
import EditorDeListaDeMenu from './EditorDeListaDeMenu';

/* ═══════════════════════════════════════════════════════════════════════════
   Ficha del atleta › Dietas: con qué recetas trabaja ESTE atleta

   - Menú: usa la lista global, o una propia (para darle más variedad, o menos).
   - Recetario: navega todas las recetas o solo las que tú le recomiendas.
   ═══════════════════════════════════════════════════════════════════════════ */

const Segmentos = <T extends string>({ valor, opciones, onChange, etiqueta, deshabilitado }: {
  valor: T; opciones: { v: T; texto: string }[]; onChange: (v: T) => void; etiqueta: string; deshabilitado?: boolean;
}) => (
  <div role="group" aria-label={etiqueta} className="inline-flex border border-hairline rounded-control overflow-hidden">
    {opciones.map(o => (
      <button
        key={o.v}
        type="button"
        onClick={() => onChange(o.v)}
        disabled={deshabilitado}
        aria-pressed={valor === o.v}
        className={`px-3 min-h-[44px] font-sans text-caption font-bold transition-colors disabled:opacity-50 ${
          valor === o.v ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'
        }`}
      >{o.texto}</button>
    ))}
  </div>
);

export default function MenuDelAtletaPanel({ athleteEmail }: { athleteEmail: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: reglas, isPending: cargandoReglas } = useQuery({
    queryKey: reglasDeRecetaKey(athleteEmail),
    queryFn: () => getReglasDeReceta(athleteEmail),
    staleTime: 5 * 60_000,
  });
  const { data: global, isPending: cargandoGlobal } = useQuery({
    queryKey: accesoGlobalKey,
    queryFn: getAccesoGlobalARecetas,
    staleTime: 5 * 60_000,
  });
  const { data: indice = [], isPending: cargandoIndice } = useQuery({
    queryKey: ['recetarioIndice'],
    queryFn: cargarIndiceRecetas,
    staleTime: Infinity,
  });

  // Para que el historial de cambios diga «Pollo al curry» y no «receta».
  const nombreDe = useMemo(() => {
    const m = new Map(indice.map(r => [r.id, r.name]));
    return (id: string) => m.get(id);
  }, [indice]);

  const guardar = useMutation({
    mutationFn: (cambio: { listaMenu?: string[]; recetario?: ModoRecetario }) =>
      saveReglasDeReceta({ athleteId: athleteEmail, ...cambio }, nombreDe),
    onSettled: () => queryClient.invalidateQueries({ queryKey: reglasDeRecetaKey(athleteEmail) }),
    onError: () => showToast('No se pudo guardar el cambio. Inténtalo otra vez.'),
  });

  const propia = (reglas?.listaMenu?.length ?? 0) > 0;
  const modo = modoRecetarioVigente(reglas?.recetario);
  const recomendadas = reglas?.recomendadas ?? [];
  const valorGlobal = listaDeMenuVigente(undefined, global?.listaMenu);
  const valor = listaDeMenuVigente(reglas?.listaMenu, global?.listaMenu);
  const cuantasGlobal = useMemo(
    () => (valorGlobal === 'rapidas' ? filtrarPorLista(indice, 'rapidas').length : valorGlobal.length),
    [indice, valorGlobal],
  );

  if (cargandoReglas || cargandoGlobal || cargandoIndice) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="border border-hairline rounded-surface p-4 space-y-4">
      <div className="space-y-1.5">
        <p className="font-sans text-label font-bold text-ink">Menú de este atleta</p>
        <p className="font-mono text-caption text-ink-3">
          Con qué recetas trabaja el generador para él y sus cambios de comida.
        </p>
        <Segmentos
          etiqueta="Lista de recetas del menú"
          valor={propia ? 'propia' : 'global'}
          deshabilitado={guardar.isPending}
          opciones={[
            { v: 'global', texto: `Lista global (${cuantasGlobal.toLocaleString('es-ES')})` },
            { v: 'propia', texto: 'Lista propia' },
          ]}
          onChange={v => {
            if (v === 'propia' && !propia) {
              // Se parte de la global para ir quitando y añadiendo, no de cero.
              const ids = valorGlobal === 'rapidas' ? filtrarPorLista(indice, 'rapidas').map(r => r.id) : valorGlobal;
              // Una lista vacía no es una lista propia: se guardaría y el botón no haría nada.
              if (ids.length === 0) { showToast('Todavía no hay recetas cargadas para partir de la lista global. Recarga la página.'); return; }
              guardar.mutate({ listaMenu: ids });
            } else if (v === 'global' && propia) {
              guardar.mutate({ listaMenu: [] });
            }
          }}
        />
      </div>
      {propia && (
        <EditorDeListaDeMenu
          recetas={indice}
          valor={valor}
          guardando={guardar.isPending}
          textoRestablecer="Usar la lista global"
          onGuardar={ids => guardar.mutate({ listaMenu: ids })}
          onRestablecer={() => guardar.mutate({ listaMenu: [] })}
        />
      )}

      <div className="space-y-1.5 pt-3 border-t border-hairline">
        <p className="font-sans text-label font-bold text-ink">Recetario que navega</p>
        <p className="font-mono text-caption text-ink-3">
          Cómo se explora no cambia: solo cuántas recetas hay dentro.
          {modo === 'recomendadas' && recomendadas.length === 0 ? ' Aún no le has recomendado ninguna: mientras tanto ve todas.' : ''}
        </p>
        <Segmentos
          etiqueta="Recetas que ve en el recetario"
          valor={modo}
          deshabilitado={guardar.isPending}
          opciones={[
            { v: 'todas', texto: 'Todas' },
            { v: 'recomendadas', texto: `Solo las que le recomiendo (${recomendadas.length})` },
          ]}
          onChange={v => guardar.mutate({ recetario: v })}
        />
      </div>
    </div>
  );
}

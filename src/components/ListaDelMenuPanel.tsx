import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cargarIndiceRecetas, getAccesoGlobalARecetas, saveAccesoGlobalARecetas } from '../dbService';
import { accesoGlobalKey } from '../hooks/useReglasDeReceta';
import { listaDeMenuVigente } from '../utils/accesoARecetas';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast';
import { Icon, Skeleton } from './ui';
import EditorDeListaDeMenu from './EditorDeListaDeMenu';

/* ═══════════════════════════════════════════════════════════════════════════
   Biblioteca › Nutrición › Menú: la lista global de recetas del generador

   Con qué recetas trabaja el generador de menús (y los cambios de comida) para
   todos los atletas que no tengan lista propia. Mientras no la edites, son las
   Rápidas. Quien tenga lista propia (ficha del atleta › Dietas) no cambia.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ListaDelMenuPanel() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const { data: indice = [], isPending: cargandoIndice } = useQuery({
    queryKey: ['recetarioIndice'],
    queryFn: cargarIndiceRecetas,
    staleTime: Infinity,
  });
  const { data: global, isPending: cargandoGlobal } = useQuery({
    queryKey: accesoGlobalKey,
    queryFn: getAccesoGlobalARecetas,
    staleTime: 5 * 60_000,
  });

  const guardar = useMutation({
    mutationFn: (listaMenu: string[]) => saveAccesoGlobalARecetas({ listaMenu }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accesoGlobalKey }),
    onError: () => showToast('No se pudo guardar la lista. Inténtalo otra vez.'),
  });

  if (cargandoIndice || cargandoGlobal) return <Skeleton className="h-40 w-full" />;

  const valor = listaDeMenuVigente(undefined, global?.listaMenu);
  const aviso = 'Los atletas que no tengan lista propia usarán esta lista desde ahora. Los que sí la tengan no cambian.';

  return (
    <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
      <div>
        <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
          <Icon name="checklist" size="m" className="text-accent-ink" />
          Recetas del menú
        </h3>
        <p className="font-sans text-label text-ink-2 mt-1">
          Con qué recetas trabaja el generador de menús y los cambios de comida.
          {valor === 'rapidas' ? ' Ahora mismo, las Rápidas (no has editado la lista).' : ' Es tu lista; las Rápidas ya no mandan.'}
          {' '}El recetario que navega cada atleta no cambia. Para dar más variedad a un atleta, ábrele una lista propia en su ficha.
        </p>
      </div>
      <EditorDeListaDeMenu
        recetas={indice}
        valor={valor}
        guardando={guardar.isPending}
        textoRestablecer="Volver a las Rápidas"
        onGuardar={async ids => {
          if (await confirm(`¿Guardar la lista con ${ids.length.toLocaleString('es-ES')} recetas? ${aviso}`)) guardar.mutate(ids);
        }}
        onRestablecer={async () => {
          if (await confirm(`¿Volver a las Rápidas? ${aviso}`)) guardar.mutate([]);
        }}
      />
      <ConfirmDialog />
    </div>
  );
}

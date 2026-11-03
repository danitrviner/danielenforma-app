import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccesoGlobalARecetas, getReglasDeReceta, saveReglasDeReceta } from '../dbService';
import { accesoGlobalKey, reglasDeRecetaKey } from '../hooks/useReglasDeReceta';
import { conFiltro, filtroDeTarjeta, TODAS_LAS_DIETAS } from '../utils/seleccionDeRecetas';
import { useToast } from '../hooks/useToast';
import { Chip, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Generador de menús › Paquetes del atleta (11-2026)

   Los paquetes que el coach monta en Biblioteca › Recetas, a un toque: el
   paquete marcado es el filtro general del atleta (`seleccion.general.paquetes`,
   seleccionDeRecetas.ts), así que el menú sale de sus recetas en cada comida
   donde haya al menos 5; en el resto, de su lista de siempre.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function PaquetesDelGenerador({ athleteEmail }: { athleteEmail: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: global } = useQuery({ queryKey: accesoGlobalKey, queryFn: getAccesoGlobalARecetas, staleTime: 5 * 60_000 });
  const { data: reglas } = useQuery({
    queryKey: reglasDeRecetaKey(athleteEmail),
    queryFn: () => getReglasDeReceta(athleteEmail),
    staleTime: 5 * 60_000,
  });
  const [guardando, setGuardando] = useState(false);

  const paquetes = global?.paquetes ?? [];
  const filtro = filtroDeTarjeta(reglas?.seleccion, TODAS_LAS_DIETAS);
  const asignados = filtro.paquetes ?? [];
  const ajustes = reglas?.ajustesMenu;
  const listaEntera = (reglas?.listaMenu?.length ?? 0) > 0;

  const alternar = async (id: string) => {
    const nuevos = asignados.includes(id) ? asignados.filter(x => x !== id) : [...asignados, id];
    const seleccion = conFiltro(reglas?.seleccion, TODAS_LAS_DIETAS, { ...filtro, paquetes: nuevos.length ? nuevos : undefined });
    setGuardando(true);
    try {
      await saveReglasDeReceta({ athleteId: athleteEmail, seleccion }, x => paquetes.find(p => p.id === x)?.nombre);
      queryClient.setQueryData(reglasDeRecetaKey(athleteEmail), (prev: object | undefined) => ({ ...prev, seleccion }));
    } catch { showToast('No se pudo asignar el paquete. Inténtalo otra vez.'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 space-y-3">
      <div>
        <p className="font-sans text-caption text-ink-3 uppercase flex items-center gap-1.5">
          <Icon name="inventory_2" size="s" className="text-accent-ink" />
          Paquetes de recetas
        </p>
        <p className="font-sans text-caption text-ink-2 mt-1">
          Con un paquete marcado, el menú sale de sus recetas en cada comida donde tenga al menos 5; en las demás, de su lista.
        </p>
      </div>
      {paquetes.length === 0 ? (
        <p className="font-sans text-caption text-ink-3">Aún no hay paquetes. Créalos en Biblioteca › Nutrición › Recetas: filtra y «Guardar como paquete».</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {paquetes.map(p => (
            <Chip key={p.id} selected={asignados.includes(p.id)} disabled={guardando} onClick={() => alternar(p.id)}>
              {p.nombre} · {p.recipeIds.length}
            </Chip>
          ))}
        </div>
      )}
      <p className="font-sans text-caption text-ink-3 pt-2 border-t border-hairline">
        Su lista: {listaEntera
          ? `propia, ${reglas!.listaMenu!.length.toLocaleString('es-ES')} recetas (no le llegan tus cambios)`
          : (ajustes?.mas?.length || ajustes?.menos?.length)
            ? `tu lista general con ${ajustes?.mas?.length ?? 0} añadidas y ${ajustes?.menos?.length ?? 0} quitadas`
            : 'tu lista general'}
        {' '}· se cambia en Dietas › Información › Recetas del atleta.
      </p>
    </div>
  );
}

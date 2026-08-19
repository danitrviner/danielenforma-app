import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, ProgressBar } from '../../components/ui';
import { getEstadoCatalogo } from '../../dbService';
import CatalogoSwipe from './CatalogoSwipe';
import { gimnasioQueryKey } from './MiGimnasioPanel';

/* ═══════════════════════════════════════════════════════════════════════════
   Recordatorio de catálogo sin terminar — pantalla 07 del handoff. Vive en Hoy.

   Tarjeta de borde discontinuo, con el recuento exacto y la barra de progreso.
   El borde punteado es intencionado: la separa de las tarjetas de contenido
   real (entreno, nutrición) y dice "esto está a medias" sin necesidad de copy.

   Solo aparece si el atleta OMITIÓ el catálogo (`pendienteRecordatorio`). Quien
   nunca lo empezó no lo ve aquí: a ese le sale el gate del onboarding.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  email: string;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip). */
  key?: React.Key;
};

/**
 * `habilitado` existe para el coach: en App.tsx este hook tiene que llamarse
 * antes de los `return` de los gates, o sea antes de saber si mirar el gimnasio
 * tiene sentido. Sin esta guarda, cada coach cargaría un catálogo que no va a
 * usar en ninguna pantalla.
 */
export function useGimnasioPendiente(email: string, habilitado = true) {
  const { data } = useQuery({
    queryKey: gimnasioQueryKey(email),
    queryFn: () => getEstadoCatalogo(email),
    enabled: habilitado,
  });
  const progreso = data?.gimnasio.progresoCatalogo;
  return {
    // El punto rojo de la pestaña se enciende con lo mismo que la tarjeta, y se
    // apaga solo al completar el catálogo.
    pendiente: !!progreso?.pendienteRecordatorio && !progreso.completado && (data?.pendientes.length ?? 0) > 0,
    revisadas: progreso?.revisadas ?? 0,
    total: progreso?.total ?? 0,
  };
}

export default function RecordatorioGimnasioCard({ email }: Props) {
  const qc = useQueryClient();
  const [repasando, setRepasando] = useState(false);
  const { pendiente, revisadas, total } = useGimnasioPendiente(email);

  if (repasando) {
    return (
      <CatalogoSwipe
        email={email}
        onCompletado={() => {
          setRepasando(false);
          qc.invalidateQueries({ queryKey: gimnasioQueryKey(email) });
        }}
      />
    );
  }

  if (!pendiente) return null;

  return (
    <button
      type="button"
      onClick={() => setRepasando(true)}
      className="w-full text-left rounded-surface border border-dashed border-accent-line bg-accent-bg/25
                 p-4 flex gap-3 items-start transition-colors hover:bg-accent-bg/40"
    >
      <span className="w-9 h-9 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
        <Icon name="fitness_center" size="m" className="text-accent" />
      </span>
      <span className="flex-1 min-w-0 space-y-2">
        <span className="block font-sans font-bold text-title-s text-ink">Termina de configurar tu gimnasio</span>
        <span className="block font-mono text-caption text-ink-3 uppercase tracking-wider">
          {revisadas} de {total} máquinas revisadas
        </span>
        <ProgressBar
          value={total ? (revisadas / total) * 100 : 0}
          label={`Catálogo de máquinas, ${revisadas} de ${total} revisadas`}
        />
        <span className="block font-sans text-body-s font-bold text-accent">Continuar →</span>
      </span>
    </button>
  );
}

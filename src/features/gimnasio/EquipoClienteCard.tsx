import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/ui';
import { MARCA_LABELS, MUSCLE_LABELS } from '../../types';
import type { MuscleGroup } from '../../types';
import { getEstadoCatalogo } from '../../dbService';
import { gimnasioQueryKey } from './MiGimnasioPanel';
import { ORDEN_CATEGORIAS } from './useCatalogoSwipe';

/* ═══════════════════════════════════════════════════════════════════════════
   Equipamiento del cliente — pantalla 08 del handoff. Vive en el Hub del atleta.

   Colapsada por defecto y sin color de acento en la cabecera: el handoff es
   explícito en que "no compite con KPIs ni con la revisión". El coach entra aquí
   cuando va a montar el plan, no cada vez que abre la ficha.

   Cerrada solo hace una lectura y enseña el recuento. El desglose por grupo
   muscular es lo que de verdad usa el coach: no le sirve saber que el atleta
   tiene 47 máquinas, le sirve saber que no tiene NINGUNA de isquios.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  athleteEmail: string;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip). */
  key?: React.Key;
};

export default function EquipoClienteCard({ athleteEmail }: Props) {
  const [abierta, setAbierta] = useState(false);

  // Mismo queryKey que MiGimnasioPanel: si el coach ya abrió otra vista que lo
  // pidió, esto no dispara una lectura nueva.
  const { data, isLoading } = useQuery({
    queryKey: gimnasioQueryKey(athleteEmail),
    queryFn: () => getEstadoCatalogo(athleteEmail),
  });

  const resumen = useMemo(() => {
    if (!data) return null;
    const tiene = new Set(data.gimnasio.maquinas.filter(d => d.tengo).map(d => d.maquinaId));
    const disponibles = data.catalogo.filter(m => tiene.has(m.id));

    const porGrupo = new Map<MuscleGroup, number>();
    for (const m of disponibles) porGrupo.set(m.categoria, (porGrupo.get(m.categoria) ?? 0) + 1);

    const porMarca = new Map<string, number>();
    for (const m of disponibles) {
      const etiqueta = MARCA_LABELS[m.marca] ?? String(m.marca);
      porMarca.set(etiqueta, (porMarca.get(etiqueta) ?? 0) + 1);
    }

    // Los grupos SIN ninguna máquina son la información accionable de verdad:
    // es donde el coach tiene que tirar de peso libre o cambiar el ejercicio.
    const sinNada = ORDEN_CATEGORIAS.filter(
      c => data.catalogo.some(m => m.categoria === c) && !porGrupo.has(c)
    );

    return {
      disponibles: disponibles.length,
      propias: data.gimnasio.maquinasPropias,
      total: data.catalogo.length,
      revisadas: data.gimnasio.progresoCatalogo.revisadas,
      completado: data.gimnasio.progresoCatalogo.completado,
      porGrupo: ORDEN_CATEGORIAS.filter(c => porGrupo.has(c)).map(c => ({ categoria: c, n: porGrupo.get(c)! })),
      porMarca: [...porMarca.entries()].sort((a, b) => b[1] - a[1]),
      sinNada,
    };
  }, [data]);

  // Un atleta que nunca ha tocado el catálogo no tiene nada que enseñar aquí, y
  // una tarjeta vacía en el Hub es ruido para el coach.
  if (!isLoading && (!resumen || resumen.revisadas === 0)) return null;

  return (
    <section className="bg-surface border border-hairline rounded-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierta(a => !a)}
        aria-expanded={abierta}
        className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-raised"
      >
        <span className="w-8 h-8 rounded-control bg-raised flex items-center justify-center flex-shrink-0">
          <Icon name="fitness_center" size="s" className="text-ink-2" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-sans font-bold text-title-s text-ink">Equipamiento</span>
          <span className="block font-mono text-caption text-ink-4 uppercase tracking-wider">
            {isLoading || !resumen
              ? 'Cargando…'
              : `${resumen.disponibles} de ${resumen.total} máquinas` +
                (resumen.propias.length ? ` · ${resumen.propias.length} propias` : '') +
                (resumen.completado ? '' : ` · sin terminar (${resumen.revisadas}/${resumen.total})`)}
          </span>
        </span>
        <Icon
          name="chevron_right"
          size="s"
          className={`text-ink-4 flex-shrink-0 transition-transform ${abierta ? 'rotate-90' : ''}`}
        />
      </button>

      {abierta && resumen && (
        <div className="px-4 pb-4 space-y-4 border-t border-hairline pt-4">
          <div className="space-y-2">
            {resumen.porGrupo.map(({ categoria, n }) => (
              <div key={categoria} className="flex items-baseline gap-3">
                <span className="flex-1 font-sans text-body-s text-ink-2">{MUSCLE_LABELS[categoria]}</span>
                <span className="font-mono text-caption text-ink tabular-nums">{n}</span>
              </div>
            ))}
            {resumen.porGrupo.length === 0 && (
              <p className="font-sans text-body-s text-ink-3">No ha marcado ninguna máquina como disponible.</p>
            )}
          </div>

          {resumen.sinNada.length > 0 && (
            <div className="rounded-control border border-hairline bg-raised p-3">
              <p className="font-mono text-caption text-ink-4 uppercase tracking-wider mb-1">Sin máquina</p>
              <p className="font-sans text-body-s text-ink-2">
                {resumen.sinNada.map(c => MUSCLE_LABELS[c]).join(' · ')}
              </p>
            </div>
          )}

          {resumen.porMarca.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {resumen.porMarca.map(([marca, n]) => (
                <span key={marca} className="px-2 py-1 rounded-chip bg-raised font-mono text-caption uppercase tracking-wider text-ink-3">
                  {marca} {n}
                </span>
              ))}
            </div>
          )}

          {resumen.propias.length > 0 && (
            <div>
              <p className="font-mono text-caption text-ink-4 uppercase tracking-wider mb-2">Añadidas por el atleta</p>
              <ul className="space-y-2">
                {resumen.propias.map(p => (
                  <li key={p.id} className="flex items-center gap-3">
                    <img src={p.fotoUrl} alt="" className="w-9 h-9 rounded-control object-cover flex-shrink-0" loading="lazy" />
                    <span className="font-sans text-body-s text-ink-2">{p.nombre}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

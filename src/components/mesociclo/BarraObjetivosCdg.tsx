import React, { useMemo } from 'react';
import type { Exercise, Mesocycle, WorkoutExercise } from '../../types';
import { resolverEjercicioDelMeso } from '../../utils/progression';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { resumenSesion, sumarSesiones, iemPorZona, ZONAS_IEM } from '../../utils/cdg';

/**
 * Barra fija con el IEM semanal de las zonas que tienen objetivo, para tenerla a
 * la vista mientras se cambian ejercicios día a día (el panel CDG queda arriba,
 * fuera de pantalla). Solo aparece si el bloque tiene objetivos.
 */
export default function BarraObjetivosCdg ({ grupos, meso, semana, allExercises, objetivos }: {
  grupos: Array<{ name: string; exercises: WorkoutExercise[] }>;
  meso: Pick<Mesocycle, 'semanasDescarga' | 'semanasTest'>;
  semana: number;
  allExercises: Exercise[];
  objetivos?: Partial<Record<string, number>>;
}) {
  const { motor } = useMotorCdg();
  const filas = useMemo(() => {
    if (!motor || !objetivos) return [];
    const porId = new Map(allExercises.map(e => [e.id, e.cdgNombre]));
    const resumenes = grupos.map(g => resumenSesion(motor,
      semana === 0 ? g.exercises : g.exercises.map(we => resolverEjercicioDelMeso(we, meso, semana)),
      id => porId.get(id)));
    const z = iemPorZona(motor, sumarSesiones(motor, resumenes).IEM);
    return ZONAS_IEM.flatMap(d => {
      const objetivo = objetivos[d.clave];
      return objetivo != null ? [{ nombre: d.nombre.split(' (')[0], valor: z[d.clave], objetivo }] : [];
    });
  }, [motor, grupos, meso, semana, allExercises, objetivos]);

  if (filas.length === 0) return null;
  const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
  return (
    <div className="sticky top-0 z-[var(--z-sticky)] bg-bg/95 backdrop-blur-sm border border-hairline rounded-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-sans text-caption uppercase tracking-wide text-ink-3">IEM objetivo · {semana === 0 ? 'Base' : `S${semana}`}</span>
        {filas.map(f => {
          const pct = Math.min(1, f.valor / f.objetivo);
          const ok = f.valor >= f.objetivo - 0.05;
          return (
            <span key={f.nombre} className="flex items-center gap-1.5" title={ok ? 'Objetivo cubierto' : `Faltan ${n1(f.objetivo - f.valor)}`}>
              <span className="font-sans text-caption text-ink">{f.nombre}</span>
              <span className="w-14 h-1.5 bg-raised rounded-full overflow-hidden">
                <span className={`block h-full ${ok ? 'bg-success' : 'bg-warning'}`} style={{ width: `${Math.round(pct * 100)}%` }} />
              </span>
              <span className={`font-mono text-caption tabular-nums ${ok ? 'text-success' : 'text-ink-2'}`}>{n1(f.valor)}/{n1(f.objetivo)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { Exercise, MuscleGroup, WorkoutLog } from '../../types';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { iemSemanalPorZona, numeroDeSemana, ZONA_POR_CLAVE, type SemanasDeRevision } from '../../utils/cdg';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Estímulo por semana (IEM) — sustituye a «Volumen por grupo» (16-11-2026).

   El bloque viejo contaba series por grupo y las colocaba en MEV/MAV/MRV con
   umbrales genéricos; sin volumen programado no decía nada. Esto enseña el
   IEM realizado de la plantilla CDG —con el RIR y las repeticiones dentro—
   por zona y por semana, que es como Dani programa y como se preguntan las
   agujetas: se ve de un vistazo qué zona sube, cuál se cae y si las agujetas
   cuadran con el estímulo que se le está metiendo.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  logs: WorkoutLog[];
  exercises: Exercise[];
  /** Primer día de cada semana a enseñar (ver `semanasDeLaRevision`). Si son
   *  de un bloque, la lista trae el número real de cada semana (F5). */
  semanas: SemanasDeRevision;
  /** Agujetas recientes por grupo (1-10), para cruzarlas con el estímulo. */
  domsPorGrupo?: Partial<Record<MuscleGroup, number>>;
  todoAbierto?: boolean;
}

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const diaMes = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
};

export default function BloqueEstimuloSemanal({ logs, exercises, semanas, domsPorGrupo, todoAbierto = false }: Props) {
  const { motor, cargando, noSubido } = useMotorCdg();
  const [verTodas, setVerTodas] = useState(false);

  const datos = useMemo(() => {
    if (!motor || semanas.length === 0) return null;
    const nombreCdgDe = (id: string) => exercises.find(e => e.id === id)?.cdgNombre;
    return iemSemanalPorZona(motor, logs, nombreCdgDe, semanas, hoyIsoLocal());
  }, [motor, logs, exercises, semanas]);

  if (cargando) return <p className="font-sans text-caption text-ink-3">Cargando el catálogo CDG…</p>;
  if (!motor || !datos) {
    return (
      <p className="font-sans text-caption text-ink-3">
        {noSubido
          ? 'El catálogo CDG aún no está en Firestore: sin él no se puede calcular el estímulo (IEM).'
          : 'El estímulo (IEM) se calcula con el catálogo CDG, que solo se carga en la sesión del entrenador.'}
      </p>
    );
  }
  if (datos.filas.length === 0) {
    return (
      <p className="font-sans text-caption text-ink-3">
        Ninguna serie de estas semanas cuenta en el IEM: hacen falta ejercicios con vínculo CDG, con kg y con RIR entre 0 y 4.
      </p>
    );
  }

  const mostrar = todoAbierto || verTodas ? datos.filas : datos.filas.slice(0, 8);
  const max = Math.max(...datos.filas.flatMap(f => f.valores), 0.01);
  const agujetasDe = (clave: string) => {
    const grupos = (ZONA_POR_CLAVE as Record<string, { grupos: readonly MuscleGroup[] }>)[clave]?.grupos ?? [];
    const vals = grupos.map(g => domsPorGrupo?.[g]).filter((v): v is number => v != null);
    return vals.length ? Math.max(...vals) : null;
  };
  const enCurso = datos.enCurso;
  // La columna en negrita es la última semana completa: la que se cuenta.
  const ultima = enCurso != null ? enCurso - 1 : semanas.length - 1;
  // F5: el rótulo es la semana del bloque, no la posición de la columna. De un
  // bloque de 10 semanas se enseñan las 8 últimas y la primera es la S3.
  const primera = numeroDeSemana(semanas, 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-surface border border-hairline">
        <table className="w-full border-collapse" style={{ minWidth: `${220 + semanas.length * 64 + 150}px` }}>
          <thead>
            <tr className="bg-bg">
              <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Zona</th>
              {semanas.map((s, i) => (
                <th key={s} className="text-right px-2 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline whitespace-nowrap">
                  <span className="block">S{numeroDeSemana(semanas, i)}</span>
                  <span className="block normal-case tracking-normal text-ink-3">{i === enCurso ? 'en curso' : diaMes(s)}</span>
                </th>
              ))}
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline whitespace-nowrap">vs sem. ant.</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Agujetas</th>
            </tr>
          </thead>
          <tbody>
            {mostrar.map(f => {
              const ag = agujetasDe(f.clave);
              const v = f.variacionPct;
              return (
                <tr key={f.clave} className="border-b border-hairline last:border-b-0">
                  <td className="px-3 py-2 font-sans text-label text-ink whitespace-nowrap">
                    {f.nombre}
                    {f.sensible && <span className="ml-1.5 font-mono text-caption text-ink-3" title="Propensa a agujetas">·sens.</span>}
                  </td>
                  {f.valores.map((val, i) => (
                    <td key={i} className="px-1 py-1">
                      <span className="relative block rounded-control px-2 py-1.5 text-right overflow-hidden">
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 bg-accent"
                          style={{ opacity: val > 0 ? (0.08 + (val / max) * 0.5) * (i === enCurso ? 0.45 : 1) : 0 }}
                        />
                        <span className={`relative font-mono text-label tabular-nums ${val > 0 ? (i === ultima ? 'font-bold text-ink' : 'text-ink') : 'text-ink-4'}`}>
                          {val > 0 ? fmt(val) : '·'}
                        </span>
                      </span>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono text-caption tabular-nums whitespace-nowrap"
                    style={{ color: v == null ? 'var(--color-ink-3)' : v >= 10 ? 'var(--color-success)' : v <= -20 ? 'var(--color-danger)' : 'var(--color-ink-2)' }}>
                    {v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-label tabular-nums"
                    style={{ color: ag == null ? 'var(--color-ink-3)' : ag >= 6 ? 'var(--color-danger)' : 'var(--color-ink-2)' }}>
                    {ag == null ? '—' : fmt(ag)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-bg">
              <td className="px-3 py-2 font-mono text-caption text-ink-2 uppercase tracking-wider">Total</td>
              {datos.totalPorSemana.map((t, i) => (
                <td key={i} className="px-3 py-2 text-right font-mono text-label font-bold text-ink tabular-nums">{t > 0 ? fmt(t) : '·'}</td>
              ))}
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      {datos.filas.length > 8 && !todoAbierto && (
        <button
          type="button"
          onClick={() => setVerTodas(v => !v)}
          className="flex items-center gap-1.5 font-sans text-label font-bold text-ink-2 hover:text-ink transition-colors"
        >
          <Icon name={verTodas ? 'unfold_less' : 'unfold_more'} size="s" />
          {verTodas ? 'Ver solo las 8 con más estímulo' : `Ver las ${datos.filas.length} zonas`}
        </button>
      )}

      {datos.sinVinculo.length > 0 && (
        <p className="font-sans text-caption text-warning">
          Sin vínculo CDG (no cuentan): {datos.sinVinculo.map(id => exercises.find(e => e.id === id)?.name ?? id).join(', ')}.
        </p>
      )}
      <p className="font-mono text-caption text-ink-3">
        IEM realizado de la plantilla CDG, sumado por zona (como las agujetas): cada serie cuenta según el ejercicio, el RIR y las
        repeticiones. Más color, más estímulo. «vs sem. ant.» compara la última semana completa (en negrita) con la anterior; la semana en
        curso sale más clara y no cuenta hasta que termina.{primera > 1 ? ` Se enseñan las ${semanas.length} últimas semanas del bloque: empieza en la S${primera}.` : ''} Agujetas: media de sus últimas respuestas, en rojo a partir de 6/10. Las series sin kg y las de RIR 5 no cuentan.
      </p>
    </div>
  );
}

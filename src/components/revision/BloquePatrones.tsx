import React from 'react';
import { MovementPattern, PatternPerf } from '../../utils/movementPatterns';
import { ExercisePerf } from '../../utils/trainingReport';
import TablaEjerciciosPatron from './TablaEjerciciosPatron';
import { Delta, Collapsible, EmptyState } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque 2 — Rendimiento por patrón de movimiento.

   Cinco filas, no diecisiete. Es la unidad en la que Dani piensa y habla
   («empujes», «tracciones»), y la que cabe en un vídeo de cinco minutos: los
   17 grupos musculares siguen estando, pero en el mapa de calor, que es donde
   la pregunta es «¿le estoy dando volumen a todo?» y no «¿está más fuerte?».

   Todo desplegable, nunca en modal: el coach graba esta pantalla de un tirón y
   una hoja encima le taparía el resto (ver R6 del plan).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  patrones: PatternPerf[];
  ejerciciosPorPatron: Record<MovementPattern, ExercisePerf[]>;
  ejerciciosSinPatron: ExercisePerf[];
  comparacion: string;
  /** Cuando está activo, todos los patrones nacen desplegados. */
  todoAbierto?: boolean;
  /** Curvas EWMA del 1RM por ejercicio, del historial completo. */
  curvas?: Record<string, number[]>;
  ultimaSesion?: Record<string, string>;
}

export default function BloquePatrones({
  patrones, ejerciciosPorPatron, ejerciciosSinPatron, comparacion, todoAbierto = false,
  curvas, ultimaSesion,
}: Props) {
  const conDatos = patrones.filter(p => p.sets > 0);

  if (conDatos.length === 0 && ejerciciosSinPatron.length === 0) {
    return (
      <EmptyState
        icon="fitness_center"
        title="Sin entrenamientos en este periodo"
        description="Cambia la ventana o revisa si el atleta está registrando las sesiones."
      />
    );
  }

  return (
    <div className="space-y-2">
      {patrones.map(p => {
        const ejercicios = ejerciciosPorPatron[p.group] ?? [];
        return (
          <Collapsible
            // La clave lleva `todoAbierto` para que al pulsar «Desplegar todo»
            // los Collapsible se remonten y `defaultOpen` vuelva a aplicarse:
            // sin esto el botón no haría nada sobre los que ya estaban pintados.
            key={`${p.group}-${todoAbierto}`}
            defaultOpen={todoAbierto}
            trigger={
              <div className="flex items-baseline justify-between gap-3 w-full pr-2">
                <span className="font-sans font-bold text-label text-ink">{p.label}</span>
                <span className="flex items-baseline gap-3 font-mono text-caption tabular-nums">
                  <span className="text-ink-2">{p.sets} series</span>
                  <span className="text-ink">
                    {p.meanOrm != null ? `${p.meanOrm} kg` : '—'}
                  </span>
                  <Delta pct={p.ormDeltaPct} />
                </span>
              </div>
            }
          >
            <TablaEjerciciosPatron
              ejercicios={ejercicios}
              comparacion={comparacion}
              curvas={curvas}
              ultimaSesion={ultimaSesion}
              vacio="Ningún ejercicio de este patrón en la ventana."
            />
          </Collapsible>
        );
      })}

      {ejerciciosSinPatron.length > 0 && (
        <Collapsible
          key={`sin-patron-${todoAbierto}`}
          defaultOpen={todoAbierto}
          trigger={
            <div className="flex items-baseline justify-between gap-3 w-full pr-2">
              <span className="font-sans font-bold text-label text-ink-2">Fuera de los cinco patrones</span>
              <span className="font-mono text-caption text-ink-3 tabular-nums">
                {ejerciciosSinPatron.length} ejercicio{ejerciciosSinPatron.length === 1 ? '' : 's'}
              </span>
            </div>
          }
        >
          <TablaEjerciciosPatron
            ejercicios={ejerciciosSinPatron}
            comparacion={comparacion}
            curvas={curvas}
            ultimaSesion={ultimaSesion}
          />
        </Collapsible>
      )}

      {/* Sin esta nota, la primera reacción al ver la tabla es «aquí faltan
          series». El 1RM medio tampoco se reparte: cuenta solo donde el grupo
          es el principal del ejercicio. */}
      <p className="font-mono text-caption text-ink-3">
        Un ejercicio puede contar en dos patrones a la vez (el press francés es empuje de torso y es brazo),
        así que la suma de los cinco no es el total de series. Core, gemelo, lumbares y rotadores no entran
        en ningún patrón: van en «Fuera de los cinco patrones» y en el mapa de calor.
      </p>
    </div>
  );
}

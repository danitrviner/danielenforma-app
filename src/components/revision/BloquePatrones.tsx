import React from 'react';
import { MovementPattern, PatternPerf } from '../../utils/movementPatterns';
import { ExercisePerf } from '../../utils/trainingReport';
import TablaEjerciciosPatron from './TablaEjerciciosPatron';
import type { CambioEnLaVentana } from '../../utils/comparabilidad';
import type { Estancamiento } from '../../utils/estancamiento';
import { Collapsible, EmptyState } from '../ui';
import { resumenDelPatron } from '../../utils/revisionCoach';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque 2 — Rendimiento por patrón de movimiento.

   Cinco filas, no diecisiete. Es la unidad en la que Dani piensa y habla
   («empujes», «tracciones»), y la que cabe en un vídeo de cinco minutos.

   18-11-2026 (Dani): la cabecera del patrón ya no da un % agregado. Cuando
   mezcla ejercicios distintos, la media de sus RM no es de ninguno (en el
   banco salía «Empujes torso −17,1 %» con sus ejercicios subiendo). Ahora dice
   series y cuántos ejercicios suben, bajan o se mantienen; el detalle por
   ejercicio, dentro.

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
  cambios?: Record<string, CambioEnLaVentana>;
  estancados?: Estancamiento[];
}

export default function BloquePatrones({
  patrones, ejerciciosPorPatron, ejerciciosSinPatron, comparacion, todoAbierto = false,
  curvas, ultimaSesion, cambios, estancados,
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
        const r = resumenDelPatron(ejercicios);
        const recuento = [
          r.suben > 0 && { n: r.suben, t: r.suben === 1 ? 'sube' : 'suben', c: 'text-success' },
          r.bajan > 0 && { n: r.bajan, t: r.bajan === 1 ? 'baja' : 'bajan', c: 'text-danger' },
          r.seMantienen > 0 && { n: r.seMantienen, t: r.seMantienen === 1 ? 'se mantiene' : 'se mantienen', c: 'text-ink-2' },
        ].filter((x): x is { n: number; t: string; c: string } => !!x);
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
                <span className="flex flex-wrap justify-end items-baseline gap-x-3 gap-y-0.5 font-mono text-caption tabular-nums">
                  <span className="text-ink-2">{p.sets} series</span>
                  {recuento.map(x => (
                    <span key={x.t} className={x.c}>{x.n} {x.t}</span>
                  ))}
                </span>
              </div>
            }
          >
            <TablaEjerciciosPatron
              ejercicios={ejercicios}
              comparacion={comparacion}
              curvas={curvas}
              cambios={cambios}
              estancados={estancados}
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
            cambios={cambios}
            estancados={estancados}
            ultimaSesion={ultimaSesion}
          />
        </Collapsible>
      )}

      {/* Sin esta nota, la primera reacción al ver la tabla es «aquí faltan
          series». */}
      <p className="font-mono text-caption text-ink-3">
        Un ejercicio puede contar en dos patrones a la vez (el press francés es empuje de torso y es brazo),
        así que la suma de los cinco no es el total de series. Sube o baja: más de un 3 % frente a {comparacion}; lo
        que se estrena no cuenta. Core, gemelo, lumbares y rotadores van en «Fuera de los cinco patrones».
      </p>
    </div>
  );
}

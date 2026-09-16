import React, { useState } from 'react';
import { MuscleGroup } from '../../types';
import { CeldaMapaCalor, hayVolumenProgramado, gruposQueDestacar } from '../../utils/mapaCalorCorporal';
import TablaMapaCalor from './TablaMapaCalor';
import MapaCalorCorporal from './MapaCalorCorporal';
import { VISTAS } from '../../data/siluetaCorporal';
import { Button, Banner, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque 4 — Series por semana y grupo, cruzadas con lo que se priorizó.

   Es la pregunta que ninguna pantalla contestaba: no «cuánto ha entrenado»,
   sino «¿le estoy dando volumen a lo que dije que era prioritario?». El dato
   que la hace posible es `Mesocycle.groups[g] = { series, priority }`, que se
   guardaba al montar el bloque y hasta ahora solo se leía dentro del propio
   generador de mesociclos.

   Las series de aquí cuentan SOLO el grupo principal del ejercicio, igual que
   el cierre de mesociclo: es la unidad con la que se programó. Las ponderadas
   (principal 1, secundario 0,5) están en el bloque de patrones y responden a
   otra pregunta. Mezclarlas inflaría lo realizado un 20-40 % y todo parecería
   cumplido de más.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  celdas: CeldaMapaCalor[];
  grupoActivo?: MuscleGroup | null;
  onGrupoActivo?: (g: MuscleGroup | null) => void;
  /** Cuando está activo, se enseñan también los grupos sin series ni plan. */
  todoAbierto?: boolean;
  /** Agujetas crónicas por grupo — se cruzan con las series en la tabla. */
  domsPorGrupo?: Partial<Record<MuscleGroup, number>>;
}

export default function BloqueSeriesPorGrupo({
  celdas, grupoActivo, onGrupoActivo, todoAbierto = false, domsPorGrupo,
}: Props) {
  const [mostrarTodosManual, setMostrarTodos] = useState(false);
  // «Desplegar todo» manda, pero sin pisar la elección hecha a mano: si el
  // coach ya los había abierto, plegar todo no se los cierra a la fuerza.
  const mostrarTodos = todoAbierto || mostrarTodosManual;
  const hayPlan = hayVolumenProgramado(celdas);
  const destacados = hayPlan ? gruposQueDestacar(celdas, 3) : [];

  // Solo lo accionable de verdad: prioritario y sin llegar al mínimo efectivo.
  const abandonados = destacados.filter(
    c => c.prioridad === 'alta' && (c.zona === 'sin_volumen' || c.zona === 'mev'),
  );

  const ocultos = celdas.length - celdas.filter(
    c => c.realizadasSemana > 0 || c.planificadasSemana != null,
  ).length;

  return (
    <div className="space-y-3">
      {!hayPlan && (
        <Banner tone="info">
          Este bloque no tiene volumen programado por grupo, así que solo se ve lo que ha hecho.
          Sin plan no hay «cumplido»: 0 % significaría que falló, y aquí lo que pasa es que no había objetivo.
        </Banner>
      )}

      {abandonados.length > 0 && (
        <Banner tone="danger">
          {abandonados.length === 1
            ? `${abandonados[0].label} es prioridad alta y no llega ni al mínimo efectivo.`
            : `${abandonados.map(c => c.label).join(', ')} son prioridad alta y no llegan al mínimo efectivo.`}
        </Banner>
      )}

      {/* El mapa es el vistazo y la tabla es la verdad: van juntos, no uno
          detrás de un interruptor. En pantalla estrecha el mapa va arriba. */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
        <div className="flex gap-2 justify-center shrink-0">
          {VISTAS.map(v => (
            <figure key={v.id} className="m-0">
              <MapaCalorCorporal
                celdas={celdas}
                vista={v.id}
                grupoActivo={grupoActivo ?? null}
                onGrupoActivo={onGrupoActivo ?? (() => {})}
              />
              <figcaption className="text-center font-mono text-caption text-ink-3 mt-1">
                {v.label}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <TablaMapaCalor
            domsPorGrupo={domsPorGrupo}
            celdas={celdas}
            hayPlan={hayPlan}
            grupoActivo={grupoActivo}
            onGrupoActivo={onGrupoActivo}
            mostrarTodos={mostrarTodos}
          />
        </div>
      </div>

      {ocultos > 0 && (
        <Button
          variant="ghost"
          onClick={() => setMostrarTodos(v => !v)}
          aria-pressed={mostrarTodos}
          disabled={todoAbierto && !mostrarTodosManual}
        >
          <Icon name={mostrarTodos ? 'visibility_off' : 'visibility'} size="s" />
          {mostrarTodos
            ? 'Ocultar los grupos sin series ni plan'
            : `Ver los ${ocultos} grupos sin series ni plan`}
        </Button>
      )}

      <p className="font-mono text-caption text-ink-3">
        Series por semana, contando solo el grupo principal de cada ejercicio — la misma unidad con la que se
        programó el bloque. Las zonas (MEV, MAV, MRV) salen de los umbrales de cada grupo, no de un número
        genérico igual para pecho que para antebrazo.
      </p>
    </div>
  );
}

import React, { useMemo } from 'react';
import type { MenuDay, MenuMeal } from '../../types';
import { Button, Icon } from '../ui';
import { macrosDeLaComida, macrosDelPlato } from '../../utils/menuMacros';
import {
  mismoPlato, pautadoDe, racionDe, racionesPosibles, textoDeEstado, conRacion,
  type Reajuste,
} from '../../utils/reajusteDelAtleta';
import { racionesPermitidas } from '../../utils/libertadDelAtleta';

/* ═══════════════════════════════════════════════════════════════════════════
   La ración de un plato del menú, elegida por el atleta (11-2026, Dani: «igual
   que tienen la barra en las recetas… y que eso ajuste las demás»).

   Dani eligió la versión C (16-11-2026): el día entero a la vista. Mueves una
   comida y ves ceder a las demás antes de guardar. A (barra) y B (de un toque)
   se borraron. La lógica vive en utils/reajusteDelAtleta.ts.

   `ReajusteDelDia` es el mismo aviso para todo lo que mueve el día: la ración,
   un extra o capricho que no cabe y el cambio de plato («Intercambiar»).

   La ración y los gramos de cada ingrediente (que se mueven desde la lista de
   la ficha) son la misma prueba: un plato «como lo quiere el atleta» que lleva
   la pantalla y que aquí solo se enseña y se guarda.
   ═══════════════════════════════════════════════════════════════════════════ */

const num = (n: number) => String(n).replace('.', ',');
const kcalDe = (m: MenuMeal) => Math.round(macrosDeLaComida(m).kcal);

interface PropsDelDia {
  /** El día como está ahora. */
  dia: MenuDay;
  /** Cómo quedaría; null = aún no se ha movido nada. */
  reajuste: Reajuste | null;
  /** La comida que el atleta está cambiando. */
  mealId: string;
  fijas: ReadonlySet<string>;
}

/** El día entero: cada comida con sus kcal de antes y de después, y si cuadra. */
export function ReajusteDelDia({ dia, reajuste, mealId, fijas }: PropsDelDia) {
  const despues = reajuste?.dia ?? dia;
  const tope = Math.max(1, ...dia.meals.map(kcalDe), ...despues.meals.map(kcalDe));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-caption text-ink-3 uppercase">Tu día</span>
        {reajuste && (
          <span className={`flex items-center gap-1 font-mono text-caption ${reajuste.estado === 'cuadra' ? 'text-success' : 'text-accent-ink'}`}>
            <Icon name={reajuste.estado === 'cuadra' ? 'check_circle' : 'info'} size="s" />
            {textoDeEstado(reajuste)}
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {dia.meals.map((m, i) => {
          const antes = kcalDe(m);
          const ahora = kcalDe(despues.meals[i]);
          const esta = m.id === mealId;
          const cambia = antes !== ahora;
          const sinExtras = reajuste?.cambios.find(c => c.mealId === m.id)?.extrasQuitados ?? [];
          return (
            <li key={m.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-sans text-label truncate ${esta ? 'text-ink font-bold' : 'text-ink-2'}`}>
                  {m.name}
                  {esta && <span className="ml-2 font-mono text-caption text-accent-ink">la que cambias</span>}
                  {!esta && fijas.has(m.id) && <span className="ml-2 font-mono text-caption text-ink-3">no se toca</span>}
                  {sinExtras.length > 0 && <span className="ml-2 font-mono text-caption text-ink-3">sin {sinExtras.join(', ').toLowerCase()}</span>}
                </span>
                <span className="font-mono text-caption text-ink-2 shrink-0">
                  {cambia && <span className="text-ink-3 line-through mr-2">{antes}</span>}
                  <span className={cambia ? 'text-accent-ink font-semibold' : ''}>{ahora} kcal</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-raised overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-(--duration-state) ${esta ? 'bg-accent' : cambia ? 'bg-accent/50' : 'bg-strong'}`}
                  style={{ width: `${Math.round((ahora / tope) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {reajuste?.sinMargen && (
        <p className="mt-2 font-sans text-caption text-ink-2">Hoy ya no queda dónde compensarlo. Puedes guardarlo igual.</p>
      )}
    </div>
  );
}

interface Props {
  dia: MenuDay;
  /** El plato como está guardado. */
  meal: MenuMeal;
  /** El plato como lo está dejando el atleta (ración o ingredientes); null =
   *  no ha tocado nada. Lo lleva la pantalla, porque los ingredientes se
   *  mueven desde la lista de la ficha y la ración desde aquí. */
  prueba: MenuMeal | null;
  /** Cómo queda el día con `prueba`. */
  reajuste: Reajuste | null;
  /** Comidas que el reajuste no puede tocar (comidas ya, de tanda…). */
  fijas: ReadonlySet<string>;
  /** Ya marcada como comida: la ración no se cambia. */
  hecha: boolean;
  /** Lo que le deja su nivel de libertad: cuánto se aleja de lo pautado. */
  pasoMaximo?: number;
  onProbar: (plato: MenuMeal | null) => void;
  onGuardar: () => void;
}

export default function RacionDelMenu({ dia, meal, prueba, reajuste, fijas, hecha, pasoMaximo = Infinity, onProbar, onGuardar }: Props) {
  const actual = racionDe(meal);
  const vista = prueba ?? meal;
  const racion = racionDe(vista);
  const posibles = useMemo(
    () => racionesPermitidas(racionesPosibles(meal), pautadoDe(meal).scale, racionDe(meal), pasoMaximo),
    [meal, pasoMaximo],
  );
  const elegir = (r: number) => {
    const sig = conRacion(vista, r, true);
    onProbar(mismoPlato(sig, meal) ? null : sig);
  };
  const kcalDelPlato = Math.round(macrosDelPlato(vista).kcal);
  const paso = (d: 1 | -1) => {
    const sig = posibles[posibles.indexOf(racion) + d];
    if (sig != null) elegir(sig);
  };

  if (hecha) {
    return (
      <p className="font-mono text-caption text-ink-3">
        ×{num(actual)} de la receta · ya la has marcado como comida
      </p>
    );
  }

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block font-mono text-caption font-semibold tracking-[.14em] text-ink-3">RACIÓN</span>
          <span className="block font-mono text-caption text-ink-2">{kcalDelPlato} kcal el plato</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => paso(-1)} disabled={racion <= posibles[0]} title="Un cuarto menos"
            className="w-11 h-11 rounded-control bg-raised text-ink-2 hover:text-ink text-body-s font-bold flex items-center justify-center disabled:opacity-40"
          >−</button>
          <span className="font-mono text-title-s font-bold text-accent-ink min-w-14 text-center">×{num(racion)}</span>
          <button
            onClick={() => paso(1)} disabled={racion >= posibles[posibles.length - 1]} title="Un cuarto más"
            className="w-11 h-11 rounded-control bg-raised text-ink-2 hover:text-ink text-body-s font-bold flex items-center justify-center disabled:opacity-40"
          >+</button>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-hairline">
        <ReajusteDelDia dia={dia} reajuste={reajuste} mealId={meal.id} fijas={fijas} />
      </div>
      {prueba && reajuste && (
        <div className="flex items-center gap-2 mt-3">
          <Button size="s" variant="primary" onClick={onGuardar}>Guardar</Button>
          <Button size="s" variant="ghost" onClick={() => onProbar(null)}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}

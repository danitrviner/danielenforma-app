import React from 'react';
import type { Macros, MenuMeal } from '../../types';
import { macrosDelPlato } from '../../utils/menuMacros';
import { racionDe } from '../../utils/reajusteDelAtleta';
import FotoDeReceta from '../FotoDeReceta';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   La tarjeta de una comida en «Mi menú».

   Dani eligió la versión C, «una sola fila» (16-11-2026), de tres propuestas
   para mejorarla: las kcal, los macros y el marcar como hecha van sobre la
   foto, y debajo queda una única fila con extra, intercambiar, me gusta y no
   me gusta. La de antes apilaba cuatro filas de acciones pequeñas; A (barra de
   acciones) y B (macros en fichas) se borraron.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  meal: MenuMeal;
  done: boolean;
  esHoy: boolean;
  favorita: boolean;
  noMeGusta: boolean;
  /** «Añadir a mi plan» (solo otros días, y si la pantalla lo ofrece). */
  alPlan?: { anadiendo: boolean; onAnadir: () => void } | null;
  onAbrir: () => void;
  onHecha: () => void;
  onExtra: () => void;
  onCambiar: () => void;
  onFavorita: () => void;
  onNoMeGusta: () => void;
}

/** «P 32 · HC 60 · G 14 g» del plato. */
function fmtMacros(m: Macros): string {
  const parts: string[] = [];
  if (m.p > 0) parts.push(`P ${Math.round(m.p)}`);
  if (m.hc > 0) parts.push(`HC ${Math.round(m.hc)}`);
  if (m.g > 0) parts.push(`G ${Math.round(m.g)}`);
  return parts.length > 0 ? `${parts.join(' · ')} g` : '—';
}

const BOTON = 'h-10 px-3 inline-flex items-center justify-center gap-1 rounded-control bg-raised border border-hairline font-sans text-label font-bold text-ink-2 hover:text-ink transition-colors';

export default function TarjetaDeComida({
  meal, done, esHoy, favorita, noMeGusta, alPlan,
  onAbrir, onHecha, onExtra, onCambiar, onFavorita, onNoMeGusta,
}: Props) {
  const racion = racionDe(meal);
  const tieneReceta = !!meal.recipeId;
  /* Marcar aquí ya suma en «Mi plan». Se dice en la propia tarjeta porque el
     fallo que esto arregla era justo ese: la atleta veía la comida verde y
     tachada, se iba al plan y no había cambiado ni una caloría. */
  const nota = done && tieneReceta
    ? (esHoy ? 'Sumada a tu plan del día.' : 'Marcada. Para que cuente en los macros, añádela a tu plan.')
    : null;

  return (
    <div className={`bg-surface border rounded-surface overflow-hidden transition-[color,background-color,border-color,opacity,transform,box-shadow] ${done ? 'border-success/30' : 'border-hairline'}`}>
      {/* Foto a sangre, mismo patrón que RecetaCard en la Biblioteca de recetas
          — antes era una miniatura de 64px, demasiado pequeña para verse bien
          (queja real de Dani). */}
      <div className="relative">
        <button onClick={onAbrir} className="relative block w-full aspect-[21/9] bg-raised">
          <FotoDeReceta
            src={meal.recipeImage}
            alt={meal.recipeName}
            className="absolute inset-0 w-full h-full object-cover"
            fallback={<div className="absolute inset-0 flex items-center justify-center"><Icon name={meal.soloFruta ? 'nutrition' : 'skillet'} size="xl" className="text-ink-3" /></div>}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-veil/85 via-veil/15 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3 pr-16 text-left">
            <span className="font-sans text-caption text-on-veil-2 uppercase tracking-wider">
              {meal.name}{racion !== 1 ? ` · ×${String(racion).replace('.', ',')}` : ''}
            </span>
            <p className={`font-sans font-bold text-title-s leading-tight ${done ? 'text-on-veil-2 line-through' : 'text-on-veil'}`}>
              {meal.recipeName}
            </p>
            <p className="font-mono text-caption text-on-veil-2 mt-1">{meal.kcal} kcal · {fmtMacros(macrosDelPlato(meal))}</p>
          </div>
        </button>
        {/* El marcar va sobre la foto: hermano del botón que abre la ficha, no hijo. */}
        <button
          onClick={onHecha}
          title={done ? 'Marcar como no hecha' : 'Marcar como hecha'}
          aria-pressed={done}
          className={`absolute bottom-3 right-3 w-11 h-11 rounded-full border-2 flex items-center justify-center transition-colors ${done ? 'bg-success border-success text-on-fill' : 'bg-veil/50 border-current text-on-veil'}`}
        >
          {done && <Icon name="check" size="m" />}
        </button>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* Más ración de algo que el plato YA lleva. Va antes que los
            acompañamientos y con otro aspecto, porque no es algo que se añade
            al lado: es el mismo plato, servido más grande. */}
        {(meal.racionesExtra?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {meal.racionesExtra!.map((r, ri) => (
              <span key={ri} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/10 border border-accent/25">
                <Icon name="add" size="s" className="text-accent-ink" />
                <span className="font-mono text-caption text-accent-ink">{r.gramos}g de {r.nombre}</span>
              </span>
            ))}
          </div>
        )}
        {/* Los acompañamientos van como filas aparte, debajo de la tarjeta.
            Aquí solo se añade uno nuevo. */}
        <div className="flex items-center gap-2">
          <button onClick={onExtra} className={BOTON}><Icon name="add" size="s" />Extra</button>
          <button onClick={onCambiar} className={BOTON}><Icon name="swap_horiz" size="s" />Intercambiar</button>
          <div className="flex-1" />
          {tieneReceta && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={onFavorita}
                title={favorita ? 'Quitar de favoritas' : 'Me encanta — quiero que salga más'}
                aria-pressed={favorita}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${favorita ? 'bg-accent/15 text-accent-ink' : 'text-ink-3 hover:text-ink'}`}
              >
                <Icon name="favorite" size="m" filled={favorita} />
              </button>
              <button
                onClick={onNoMeGusta}
                title={noMeGusta ? 'Quitar el "no me gusta"' : 'No me gusta — que no vuelva a salir'}
                aria-pressed={noMeGusta}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${noMeGusta ? 'bg-danger/15 text-danger' : 'text-ink-3 hover:text-ink'}`}
              >
                <Icon name="thumb_down" size="m" filled={noMeGusta} />
              </button>
            </div>
          )}
        </div>
        {nota && <p className="font-mono text-caption text-success pb-1">{nota}</p>}
        {tieneReceta && alPlan && (
          <button
            onClick={alPlan.onAnadir}
            disabled={alPlan.anadiendo}
            title="Registrar esta comida en tu plan del día"
            className="flex items-center gap-1 pb-1 text-caption font-mono text-accent-ink hover:text-ink transition-colors disabled:opacity-50"
          >
            <Icon name="restaurant" size="s" />
            {alPlan.anadiendo ? 'Añadiendo…' : 'Añadir a mi plan'}
          </button>
        )}
      </div>
    </div>
  );
}

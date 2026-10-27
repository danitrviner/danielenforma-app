import React from 'react';
import { Icon } from '../ui';
import { DESCANSO } from '../../utils/trainingSplits';
import { addDays } from '../../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Orden del ciclo

   Los repartos de la lista traen el orden de los días ya escrito (Push, Pull,
   Legs…). Aquí el coach lo cambia: «empezar por» rota las sesiones en los
   mismos días de calendario, y las flechas cambian un día (sesión o descanso)
   por su vecino. Al primer cambio el reparto deja de ser el de la lista y pasa
   a ser propio del mesociclo; lo ya repartido viaja con su día.
   ═══════════════════════════════════════════════════════════════════════════ */

const INICIAL_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function inicialDe(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return INICIAL_DIA[new Date(y, m - 1, d).getDay()];
}

interface Props {
  /** Un tipo por día del ciclo, `DESCANSO` en los libres. */
  dayTypes: string[];
  /** `true` si el reparto ya es propio del mesociclo (no el de la lista tal cual). */
  propio: boolean;
  fechaInicio?: string;
  /** Una sesión se cambia por la sesión vecina; un descanso se mueve un día. */
  onMover: (dia: number, dir: -1 | 1) => void;
  onEmpezarPor: (dia: number) => void;
  onAnadirDescanso: () => void;
  onQuitarDescanso: (dia: number) => void;
}

const BotonFlecha: React.FC<{ dir: -1 | 1; disabled: boolean; onClick: () => void; nombre: string }> = ({ dir, disabled, onClick, nombre }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    aria-label={`Mover ${nombre} ${dir < 0 ? 'antes' : 'después'}`}
    className="relative zona-tactil w-8 h-8 flex items-center justify-center rounded-control text-ink-3 hover:text-ink hover:bg-raised disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
  >
    <Icon name={dir < 0 ? 'chevron_left' : 'chevron_right'} size="s" />
  </button>
);

export default function OrdenDelCiclo({
  dayTypes, propio, fechaInicio, onMover, onEmpezarPor, onAnadirDescanso, onQuitarDescanso,
}: Props) {
  const sesiones = dayTypes.flatMap((t, i) => (t === DESCANSO ? [] : [{ tipo: t, dia: i }]));
  const total = dayTypes.length;
  const hayDescansos = sesiones.length < total;

  return (
    <div className="pantalla space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">
          Orden del ciclo{propio ? ' · propio' : ''}
        </span>
        <button
          type="button"
          onClick={onAnadirDescanso}
          className="font-mono text-caption font-bold text-accent-ink hover:text-ink transition-colors flex items-center gap-1"
        >
          <Icon name="add" size="s" />
          Descanso al final
        </button>
      </div>

      {new Set(sesiones.map(se => se.tipo)).size > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-sans text-caption text-ink-3">Empezar por</span>
          {/* Un botón por TIPO de sesión (la primera vez que sale): con un
              ciclo de 14 días habría tres «Tirón» iguales. */}
          {sesiones.filter((se, k) => sesiones.findIndex(o => o.tipo === se.tipo) === k).map(({ tipo, dia }) => (
            <button
              key={dia}
              type="button"
              onClick={() => onEmpezarPor(dia)}
              aria-pressed={tipo === sesiones[0].tipo}
              className={`px-2.5 py-1 rounded-full border font-sans text-caption transition-colors ${
                tipo === sesiones[0].tipo
                  ? 'bg-accent border-accent-press text-on-accent'
                  : 'bg-raised border-hairline text-ink-2 hover:border-accent/40 hover:text-ink'
              }`}
            >
              {tipo}
            </button>
          ))}
        </div>
      )}

      <ol className="space-y-1">
        {dayTypes.map((t, i) => {
          const descanso = t === DESCANSO;
          const nombre = descanso ? 'el descanso' : t;
          // Posición de esta sesión entre las sesiones (las flechas de una
          // sesión saltan los descansos; las de un descanso lo mueven un día).
          const k = sesiones.findIndex(se => se.dia === i);
          const fecha = fechaInicio ? addDays(fechaInicio, i) : null;
          return (
            <li
              key={i}
              className={`flex items-center gap-2 rounded-control border pl-3 pr-1 min-h-[44px] ${
                descanso ? 'border-hairline bg-raised' : 'border-hairline bg-surface'
              }`}
            >
              <span className="font-mono text-caption text-ink-3 w-10 flex-shrink-0 tabular-nums">
                {fecha ? `${inicialDe(fecha)}${Number(fecha.slice(8, 10))}` : `D${i + 1}`}
              </span>
              <span className={`flex-1 min-w-0 truncate font-sans text-label ${descanso ? 'text-ink-3' : 'text-ink'}`}>
                {descanso ? 'Descanso' : t}
              </span>
              {descanso && hayDescansos && (
                <button
                  type="button"
                  onClick={() => onQuitarDescanso(i)}
                  aria-label={`Quitar el descanso del día ${i + 1}`}
                  className="w-8 h-8 flex items-center justify-center rounded-control text-ink-3 hover:text-danger hover:bg-raised transition-colors"
                >
                  <Icon name="close" size="s" />
                </button>
              )}
              <BotonFlecha dir={-1} disabled={descanso ? i === 0 : k === 0} onClick={() => onMover(i, -1)} nombre={nombre} />
              <BotonFlecha dir={1} disabled={descanso ? i === total - 1 : k === sesiones.length - 1} onClick={() => onMover(i, 1)} nombre={nombre} />
            </li>
          );
        })}
      </ol>
      <p className="font-sans text-caption text-ink-3 leading-relaxed">
        Lo que ya esté repartido y las rutinas generadas se mueven con su día.
      </p>
    </div>
  );
}

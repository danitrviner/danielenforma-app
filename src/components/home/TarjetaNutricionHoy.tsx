import { useState } from 'react';
import type { DietMeal, Macros } from '../../types';
import { nutricionDeHoy } from '../../utils/nutricionDeHoy';
import { Icon } from '../ui';

/** Lo que se abre en Nutrición, ya sobre la comida elegida. */
export type AccionAnadir = 'buscar' | 'escanear';

interface Props {
  meals: DietMeal[];
  doneItemIds: string[];
  objetivo: Macros;
  /** Sin acción: abre Nutrición tal cual. */
  onAbrir: (accion?: AccionAnadir, comida?: number) => void;
}

const ICONO_DE_FRANJA: Record<number, string> = {
  1: 'coffee',
  2: 'nutrition',
  3: 'restaurant',
  4: 'bakery_dining',
  5: 'bedtime',
};

const ACCIONES: { id: AccionAnadir; texto: string; icono: string }[] = [
  { id: 'buscar',   texto: 'Buscar',   icono: 'search' },
  { id: 'escanear', texto: 'Escanear', icono: 'qr_code_scanner' },
];

// A mano y no con `toLocaleString('es-ES')`: en español no agrupa los números
// de cuatro cifras («1995 kcal»), y aquí casi todos lo son.
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* ═══════════════════════════════════════════════════════════════════════════
   Nutrición de hoy — acceso rápido a la comida que toca (28-10-2026)

   Un chip por comida: verde la registrada, oro la que toca por la hora. Los
   dos botones apuntan en la comida marcada; tocar otro chip los cambia de
   comida y tocar el ya marcado abre Nutrición. Con todo registrado los botones
   sobran y la tarjeta solo resume el día. Maqueta: maqueta-nutricion-hoy.png.
   ═══════════════════════════════════════════════════════════════════════════ */
export default function TarjetaNutricionHoy({ meals, doneItemIds, objetivo, onAbrir }: Props) {
  const ahora = new Date();
  const dia = nutricionDeHoy(meals, doneItemIds, objetivo, ahora.getHours() * 60 + ahora.getMinutes());
  const [elegida, setElegida] = useState<number | null>(null);
  const marcada = elegida ?? dia.toca;
  const comidaMarcada = dia.comidas.find(c => c.idx === marcada);
  const columnas = dia.comidas.length <= 5 ? dia.comidas.length : 3;
  const quedan = dia.objetivoKcal - dia.kcal;

  const cabecera = dia.todoRegistrado || dia.objetivoKcal <= 0
    ? <><b className="text-body-s font-medium text-ink">{miles(dia.kcal)}</b>{dia.objetivoKcal > 0 ? ` / ${miles(dia.objetivoKcal)}` : ''} kcal</>
    : quedan >= 0
      ? <><b className="text-body-s font-medium text-ink">{miles(quedan)}</b> kcal te quedan</>
      : <><b className="text-body-s font-medium text-ink">{miles(-quedan)}</b> kcal por encima</>;

  return (
    <section className="bg-surface border border-hairline rounded-control p-4" aria-label="Nutrición de hoy">
      <button
        type="button"
        onClick={() => onAbrir()}
        className="w-full flex items-baseline justify-between gap-3 text-left"
      >
        <span className="text-caption font-mono uppercase text-ink-2">Nutrición de hoy</span>
        <span className="text-caption font-mono text-ink-2 tabular-nums">{cabecera}</span>
      </button>

      <div className="grid gap-1.5 mt-3" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
        {dia.comidas.map(c => {
          const esMarcada = c.idx === marcada && !dia.todoRegistrado;
          const estilo = c.registrada
            ? 'bg-success/8 border-success/25'
            : esMarcada ? 'bg-accent-bg border-accent-line' : 'bg-inset border-transparent';
          const detalle = c.registrada
            ? `${miles(c.kcal)} kcal`
            : c.libre ? 'libre'
            : esMarcada && dia.kcalPorComida > 0 ? `~${miles(dia.kcalPorComida)}`
            : '—';
          return (
            <button
              key={c.idx}
              type="button"
              aria-pressed={esMarcada}
              onClick={() => (esMarcada || dia.todoRegistrado ? onAbrir() : setElegida(c.idx))}
              className={`rounded-chip border px-1 pt-2 pb-1.5 flex flex-col items-center gap-0.5 text-center transition-colors ${estilo}`}
            >
              <Icon
                name={c.registrada ? 'check_circle' : ICONO_DE_FRANJA[c.slot] ?? 'restaurant'}
                filled={c.registrada}
                size="s"
                className={c.registrada ? 'text-success' : esMarcada ? 'text-accent-ink' : 'text-ink-4'}
              />
              <span className={`text-label font-sans font-bold leading-tight ${c.registrada || esMarcada ? 'text-ink' : 'text-ink-2'}`}>{c.nombre}</span>
              <span className={`text-caption font-mono tabular-nums ${esMarcada ? 'text-accent-ink' : 'text-ink-4'}`}>{detalle}</span>
            </button>
          );
        })}
      </div>

      {dia.todoRegistrado ? (
        <>
          {dia.objetivoKcal > 0 && (
            <div className="h-1.5 rounded-full bg-track mt-3 overflow-hidden" role="img" aria-label={`${Math.round((dia.kcal / dia.objetivoKcal) * 100)} % del objetivo`}>
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (dia.kcal / dia.objetivoKcal) * 100)}%` }} />
            </div>
          )}
          <div className="h-px bg-hairline mt-3.5 mb-3" />
          <p className={`flex items-center gap-2 text-body-s font-sans font-bold ${dia.cerrado ? 'text-success' : 'text-ink-2'}`}>
            <Icon name={dia.cerrado ? 'task_alt' : 'check_circle'} size="m" filled={!dia.cerrado} />
            {dia.cerrado ? 'Día cerrado' : 'Todo registrado'}
            {dia.objetivoKcal > 0 && ` · ${Math.round((dia.kcal / dia.objetivoKcal) * 100)} % del objetivo`}
          </p>
        </>
      ) : comidaMarcada && (
        <>
          <div className="h-px bg-hairline mt-3.5 mb-3" />
          <p className="text-body-s font-sans text-ink-2 mb-2.5">Registrar en <b className="text-ink">{comidaMarcada.nombre}</b></p>
          <div className="grid grid-cols-2 gap-2">
            {ACCIONES.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onAbrir(a.id, comidaMarcada.idx)}
                className={`rounded-control border py-2.5 flex flex-col items-center gap-1 transition-colors ${i === 0
                  ? 'bg-accent border-accent text-on-accent hover:bg-accent-press'
                  : 'bg-raised border-strong text-ink hover:border-accent-line'}`}
              >
                <Icon name={a.icono} size="m" className={i === 0 ? '' : 'text-accent-ink'} />
                <span className="text-label font-sans font-bold">{a.texto}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

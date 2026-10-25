import React from 'react';
import { Sheet, Icon, SearchField } from '../../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Añadir alimento en «Calorías y macros» (Dani, 25-10-2026)

   La pantalla del «Breakfast» que enseñó Dani: arriba la comida (se cambia sin
   salir), el buscador y cuatro pestañas; debajo, Escanear y Rápido, y el
   historial con un «+» que vuelve a meter lo de la última vez de un toque.

   Aquí no hay nada de intercambios: ni filtro Omnívoro/Vegano/Sin pesar ni la
   guía. La pantalla solo pinta; las filas y lo que hacen las prepara quien la
   abre (NutritionScreen), que es quien tiene los datos.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FilaAlimento {
  clave: string;
  nombre: string;
  /** «99 kcal, 15 g». */
  detalle?: string;
  tuyo?: boolean;
  /** Veces añadido mientras esta pantalla está abierta. */
  anadido?: number;
  onAbrir: () => void;
  /** «+»: añade sin pasar por la ficha. Sin él, el «+» abre la ficha. */
  onAnadir?: () => void;
  onEditar?: () => void;
}

export type PestanaAnadir = 'todo' | 'coach' | 'comidas' | 'mios';

export interface SeccionFilas { titulo: string; filas: FilaAlimento[] }

interface Props {
  comidas: { id: string; nombre: string }[];
  mealId: string;
  onCambiarComida: (id: string) => void;
  busqueda: string;
  onBusqueda: (v: string) => void;
  pestana: PestanaAnadir;
  onPestana: (p: PestanaAnadir) => void;
  /** Lo que se pinta en la pestaña activa, ya filtrado por la búsqueda. */
  secciones: SeccionFilas[];
  /** Texto cuando no hay nada que enseñar. */
  vacio: string;
  /** Botón al pie de la lista («Crear alimento», «Buscar en el recetario»…). */
  pie?: { texto: string; icono: string; onClick: () => void };
  onEscanear: () => void;
  onRapido: () => void;
  onClose: () => void;
}

const PESTANAS: { id: PestanaAnadir; texto: string }[] = [
  { id: 'todo', texto: 'Todo' },
  { id: 'coach', texto: 'Del coach' },
  { id: 'comidas', texto: 'Mis comidas' },
  { id: 'mios', texto: 'Mis alimentos' },
];

export default function AnadirAlimentoCalorias({
  comidas, mealId, onCambiarComida, busqueda, onBusqueda, pestana, onPestana, secciones, vacio, pie, onEscanear, onRapido, onClose,
}: Props) {
  const nombreComida = comidas.find(c => c.id === mealId)?.nombre ?? 'Comida';

  const cabecera = (
    <div className="space-y-3 border-b border-hairline bg-bg px-4 pb-0 pt-1">
      {/* La comida es un desplegable: se cambia de desayuno a cena sin salir. */}
      <div className="relative flex justify-center">
        <label className="relative inline-flex items-center gap-1">
          <span className="sr-only">Comida</span>
          <select
            value={mealId}
            onChange={e => onCambiarComida(e.target.value)}
            className="appearance-none bg-transparent pr-7 text-center font-sans text-title-m font-bold text-ink focus:outline-none"
          >
            {comidas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <Icon name="expand_more" size="m" className="pointer-events-none absolute right-0 text-ink-2" />
        </label>
        <span className="sr-only">Añadiendo a {nombreComida}</span>
      </div>
      <SearchField label="Buscar un alimento" placeholder="Buscar un alimento" value={busqueda} onChange={onBusqueda} />
      <div role="tablist" aria-label="Qué alimentos ver" className="-mx-4 flex gap-4 overflow-x-auto px-4">
        {PESTANAS.map(p => {
          const activa = p.id === pestana;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => onPestana(p.id)}
              className={`flex-none border-b-2 pb-2.5 font-sans text-[15px] transition-colors ${activa ? 'border-ink font-bold text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
            >
              {p.texto}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Sheet open onClose={onClose} label={`Añadir a ${nombreComida}`} alto="completo" toolbar={cabecera}>
      <div className="space-y-5 pb-6 pt-4">
        {pestana === 'todo' && !busqueda.trim() && (
          <div className="grid grid-cols-2 gap-3">
            {([
              { icono: 'qr_code_scanner', texto: 'Escanear', onClick: onEscanear },
              { icono: 'bolt', texto: 'Rápido', onClick: onRapido },
            ]).map(b => (
              <button
                key={b.texto}
                type="button"
                onClick={b.onClick}
                className="flex flex-col items-center gap-2 rounded-surface bg-surface px-3 py-4 transition-colors hover:bg-raised active:scale-[0.98]"
              >
                <Icon name={b.icono} size="l" className="text-ink-2" />
                <span className="font-sans text-body font-bold text-ink">{b.texto}</span>
              </button>
            ))}
          </div>
        )}

        {secciones.every(s => s.filas.length === 0) ? (
          <p className="px-1 pt-4 text-center font-sans text-body-s text-ink-3">{vacio}</p>
        ) : secciones.map(s => s.filas.length === 0 ? null : (
          <section key={s.titulo} className="space-y-2">
            <h3 className="px-1 font-sans text-title-s font-bold text-ink">{s.titulo}</h3>
            {s.filas.map(f => (
              <div key={f.clave} className={`flex items-center gap-2 rounded-surface border ${f.anadido ? 'border-success/40 bg-success/10' : 'border-transparent bg-surface'}`}>
                <button type="button" onClick={f.onAbrir} className="min-w-0 flex-1 py-3.5 pl-4 text-left">
                  <span className="block font-sans text-body font-bold leading-snug text-ink">
                    {f.nombre}
                    {f.tuyo && <span className="ml-2 align-middle font-mono text-caption font-bold uppercase text-accent-ink">tuyo</span>}
                  </span>
                  {f.detalle && <span className="mt-0.5 block font-sans text-body-s text-ink-2">{f.detalle}</span>}
                </button>
                {f.onEditar && (
                  <button type="button" onClick={f.onEditar} aria-label={`Editar ${f.nombre}`} className="flex h-10 w-10 flex-none items-center justify-center text-ink-3 hover:text-ink">
                    <Icon name="edit" size="s" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={f.onAnadir ?? f.onAbrir}
                  aria-label={`Añadir ${f.nombre}`}
                  className="mr-3 flex h-10 w-10 flex-none items-center justify-center rounded-full bg-raised text-accent-ink transition-transform active:scale-90"
                >
                  <Icon name={f.anadido ? 'check' : 'add'} size="m" />
                </button>
              </div>
            ))}
          </section>
        ))}

        {pie && (
          <button
            type="button"
            onClick={pie.onClick}
            className="flex w-full items-center justify-center gap-2 rounded-surface border border-dashed border-hairline py-3.5 font-sans text-body-s font-bold text-ink-2 hover:border-accent/50 hover:text-accent-ink"
          >
            <Icon name={pie.icono} size="s" />
            {pie.texto}
          </button>
        )}
      </div>
    </Sheet>
  );
}

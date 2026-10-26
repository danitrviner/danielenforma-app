import { grupoDeReceta } from '../utils/grupoDeReceta';
import React, { useEffect, useMemo, useState } from 'react';
import type { Recipe } from '../types';
import { filtrarLista, categoriasDe, FILTRO_VACIO, TOPES_DE_TIEMPO, type FiltroDeLista } from '../utils/poolDelAtleta';
import { MIN_RECETAS_DE_LISTA, type ListaDeMenu } from '../utils/accesoARecetas';
import { etiquetaDeTiempo } from '../utils/tiempoDeReceta';
import { Select } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Editor de la lista de recetas «para el menú» (N-03 / N-08)

   Marca con qué recetas trabaja el generador de menús y los cambios de comida.
   Sirve igual para la lista global y para la de un atleta: quien lo monta decide
   qué significa «volver al valor por defecto» y dónde se guarda.

   El borrador es local: nada se escribe hasta pulsar «Guardar lista».
   ═══════════════════════════════════════════════════════════════════════════ */

const POR_PAGINA = 40;

interface Props {
  /** El recetario entero (o el pool del atleta). */
  recetas: Recipe[];
  /** Lo que manda ahora: ids concretos, o las Rápidas. */
  valor: ListaDeMenu;
  guardando: boolean;
  /** Guarda esta lista. */
  onGuardar: (ids: string[]) => void;
  /** Quita la lista y vuelve al valor por defecto de quien la monta. */
  onRestablecer: () => void;
  /** Texto del botón de restablecer: «Volver a las Rápidas», «Usar la lista global»… */
  textoRestablecer: string;
}

const idsDe = (recetas: Recipe[], valor: ListaDeMenu): Set<string> =>
  new Set(valor === 'rapidas' ? recetas.filter(r => r.basica === true).map(r => r.id) : valor);

export default function EditorDeListaDeMenu({ recetas, valor, guardando, onGuardar, onRestablecer, textoRestablecer }: Props) {
  const [borrador, setBorrador] = useState<Set<string>>(() => idsDe(recetas, valor));
  const [filtro, setFiltro] = useState<FiltroDeLista>(FILTRO_VACIO);
  const [soloMarcadas, setSoloMarcadas] = useState(false);
  const [visibles, setVisibles] = useState(POR_PAGINA);

  // Si lo guardado cambia (se guardó, o llegó la lectura), el borrador se
  // rehace: lo que se ve debe ser lo que hay, no lo que había al abrir.
  const huella = valor === 'rapidas' ? 'rapidas' : valor.join('|');
  useEffect(() => { setBorrador(idsDe(recetas, valor)); }, [huella, recetas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarFiltro = (parcial: Partial<FiltroDeLista>) => {
    setFiltro(f => ({ ...f, ...parcial }));
    setVisibles(POR_PAGINA);
  };

  const guardado = useMemo(() => idsDe(recetas, valor), [recetas, valor]);
  const sucio = borrador.size !== guardado.size || [...borrador].some(id => !guardado.has(id));
  const categorias = useMemo(() => categoriasDe(recetas), [recetas]);

  const lista = useMemo(
    () => filtrarLista(recetas, filtro).filter(r => !soloMarcadas || borrador.has(r.id)),
    [recetas, filtro, soloMarcadas, borrador],
  );
  const hayFiltro = JSON.stringify(filtro) !== JSON.stringify(FILTRO_VACIO) || soloMarcadas;
  const visiblesMarcadas = lista.filter(r => borrador.has(r.id)).length;

  const alternar = (id: string) => setBorrador(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const aplicarALasVisibles = (marcar: boolean) => setBorrador(prev => {
    const s = new Set(prev);
    for (const r of lista) { if (marcar) s.add(r.id); else s.delete(r.id); }
    return s;
  });

  const pocas = borrador.size < MIN_RECETAS_DE_LISTA;

  return (
    <div className="space-y-3">
      <p className="font-mono text-caption text-ink-2">
        {borrador.size.toLocaleString('es-ES')} {borrador.size === 1 ? 'receta marcada' : 'recetas marcadas'}
        {sucio ? ' · sin guardar' : ''}
      </p>
      {pocas && (
        <p role="status" className="font-sans text-label text-warning">
          Con menos de {MIN_RECETAS_DE_LISTA} recetas el generador ignora la lista y usa todo el recetario, para no dejar menús vacíos.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="search"
          value={filtro.texto}
          onChange={e => cambiarFiltro({ texto: e.target.value })}
          placeholder="Buscar por nombre"
          aria-label="Buscar receta por nombre"
          className="bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-base text-ink focus:outline-none focus:border-accent"
        />
        <input
          type="search"
          value={filtro.ingrediente}
          onChange={e => cambiarFiltro({ ingrediente: e.target.value })}
          placeholder="Ingrediente (atún, huevo…)"
          aria-label="Filtrar por ingrediente"
          className="bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-base text-ink focus:outline-none focus:border-accent"
        />
        <Select
          label="Categoría"
          value={filtro.categoria}
          onChange={v => cambiarFiltro({ categoria: v })}
          options={[
            { value: '', label: 'Todas las categorías' },
            ...categorias.map(c => ({ value: c.nombre, label: `${c.nombre} (${c.total.toLocaleString('es-ES')})` })),
          ]}
        />
        <Select
          label="Tiempo"
          value={filtro.tiempo}
          onChange={v => cambiarFiltro({ tiempo: v as FiltroDeLista['tiempo'] })}
          options={TOPES_DE_TIEMPO}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setSoloMarcadas(v => !v); setVisibles(POR_PAGINA); }}
          aria-pressed={soloMarcadas}
          className={`min-h-[44px] px-3 rounded-control border font-sans text-caption font-bold uppercase transition-colors ${
            soloMarcadas ? 'bg-accent text-on-accent border-accent' : 'border-hairline text-ink-2 hover:text-ink'
          }`}
        >Solo marcadas</button>
        {hayFiltro && (
          <button
            type="button"
            onClick={() => { setFiltro(FILTRO_VACIO); setSoloMarcadas(false); setVisibles(POR_PAGINA); }}
            className="min-h-[44px] px-3 font-mono text-caption text-ink-2 hover:text-ink"
          >Quitar filtros</button>
        )}
        {lista.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="font-mono text-caption text-ink-3">{lista.length.toLocaleString('es-ES')} a la vista</span>
            {lista.length > visiblesMarcadas && (
              <button
                type="button"
                onClick={() => aplicarALasVisibles(true)}
                className="min-h-[44px] px-3 rounded-control border border-accent-line text-accent-ink font-sans text-caption font-bold uppercase"
              >Marcar las que se ven</button>
            )}
            {visiblesMarcadas > 0 && (
              <button
                type="button"
                onClick={() => aplicarALasVisibles(false)}
                className="min-h-[44px] px-3 rounded-control border border-hairline text-ink-2 hover:text-ink font-sans text-caption font-bold uppercase"
              >Quitar las que se ven</button>
            )}
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="font-sans text-label text-ink-3 py-4">
          {soloMarcadas && borrador.size === 0 ? 'No hay ninguna receta marcada.' : 'Ninguna receta coincide con esos filtros.'}
        </p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {lista.slice(0, visibles).map(r => {
            const marcada = borrador.has(r.id);
            return (
              <li key={r.id} className="border-t border-hairline first:border-t-0">
                <label className="flex items-center gap-3 min-h-[52px] py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => alternar(r.id)}
                    className="h-5 w-5 flex-shrink-0 accent-[var(--p-accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-body-s font-semibold text-ink truncate">{r.name}</span>
                    <span className="block font-mono text-caption text-ink-3">
                      {grupoDeReceta(r)} · {etiquetaDeTiempo(r)}{r.kcal ? ` · ${r.kcal} kcal` : ''}
                    </span>
                  </span>
                  {r.basica === true && (
                    <span className="flex-shrink-0 font-mono text-caption text-accent-ink border border-accent-line rounded-chip px-2">Rápida</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {lista.length > visibles && (
        <button
          type="button"
          onClick={() => setVisibles(v => v + POR_PAGINA)}
          className="font-mono text-caption text-accent-ink hover:underline"
        >
          Ver {Math.min(POR_PAGINA, lista.length - visibles)} más ({lista.length - visibles} sin mostrar)
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-hairline">
        <button
          type="button"
          onClick={() => onGuardar([...borrador])}
          disabled={!sucio || guardando || borrador.size === 0}
          className="min-h-[44px] px-4 rounded-control bg-accent text-on-accent font-sans text-label font-bold disabled:opacity-50"
        >Guardar lista</button>
        {sucio && (
          <button
            type="button"
            onClick={() => setBorrador(new Set(guardado))}
            className="min-h-[44px] px-3 font-mono text-caption text-ink-2 hover:text-ink"
          >Descartar cambios</button>
        )}
        <button
          type="button"
          onClick={onRestablecer}
          disabled={guardando}
          className="ml-auto min-h-[44px] px-3 rounded-control border border-hairline text-ink-2 hover:text-ink font-sans text-caption font-bold disabled:opacity-50"
        >{textoRestablecer}</button>
      </div>
    </div>
  );
}

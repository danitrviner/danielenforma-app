import React, { useMemo, useState } from 'react';
import type { Recipe } from '../types';
import type { PaqueteDeRecetas } from '../utils/seleccionDeRecetas';
import { normalizarTexto } from '../utils/busqueda';
import { Icon, Sheet } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Crear o editar un paquete de recetas del coach: nombre y recetas, buscando
   por nombre. Lo usan el tablero de recetas del atleta y los filtros por dieta.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  paquete: PaqueteDeRecetas | null;
  recetas: Recipe[];
  onCerrar: () => void;
  onGuardar: (p: PaqueteDeRecetas) => void;
  onBorrar: (p: PaqueteDeRecetas) => void;
}

export default function EditorDePaquete({ paquete, recetas, onCerrar, onGuardar, onBorrar }: Props) {
  return paquete ? (
    <EditorAbierto key={paquete.id || 'nuevo'} paquete={paquete} recetas={recetas} onCerrar={onCerrar} onGuardar={onGuardar} onBorrar={onBorrar} />
  ) : null;
}

function EditorAbierto({ paquete, recetas, onCerrar, onGuardar, onBorrar }: Props & { paquete: PaqueteDeRecetas; key?: React.Key }) {
  const [nombre, setNombre] = useState(paquete.nombre);
  const [ids, setIds] = useState<string[]>(paquete.recipeIds);
  const [busqueda, setBusqueda] = useState('');
  const porId = useMemo(() => new Map(recetas.map(r => [r.id, r])), [recetas]);
  const elegidas = new Set(ids);
  const resultados = useMemo(() => {
    const q = normalizarTexto(busqueda.trim());
    if (q.length < 2) return [];
    return recetas.filter(r => normalizarTexto(r.name).includes(q)).slice(0, 30);
  }, [busqueda, recetas]);
  const valido = nombre.trim().length > 0 && ids.length > 0;

  return (
    <Sheet
      open
      onClose={onCerrar}
      title={paquete.id ? 'Editar paquete' : 'Nuevo paquete'}
      footer={
        <div className="flex items-center gap-2">
          {paquete.id && (
            <button type="button" onClick={() => onBorrar(paquete)}
              className="min-h-[44px] px-3 font-sans text-caption font-bold text-danger">Borrar</button>
          )}
          <span className="ml-auto font-mono text-caption text-ink-3">{ids.length} recetas</span>
          <button type="button" disabled={!valido} onClick={() => onGuardar({ ...paquete, nombre: nombre.trim(), recipeIds: ids })}
            className="min-h-[44px] px-4 rounded-control bg-accent text-on-accent font-sans text-caption font-bold disabled:opacity-50">
            Guardar
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Cenas en 10 minutos"
          aria-label="Nombre del paquete"
          className="w-full bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-body text-ink focus:outline-none focus:border-accent"
        />
        <p className="font-mono text-caption text-ink-3">Sirve para cualquier atleta: lo añades a su plan con un toque.</p>
        <input
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar receta para añadir"
          aria-label="Buscar receta para añadir al paquete"
          className="w-full bg-bg border border-hairline rounded-control px-3 min-h-[44px] font-sans text-body text-ink focus:outline-none focus:border-accent"
        />
        {resultados.length > 0 && (
          <ul className="m-0 p-0 list-none border border-hairline rounded-control">
            {resultados.map(r => {
              const dentro = elegidas.has(r.id);
              return (
                <li key={r.id} className="flex items-center gap-2 px-3 py-1.5 border-t first:border-t-0 border-hairline">
                  <span className="min-w-0 flex-1 truncate font-sans text-caption text-ink">{r.name}</span>
                  <button type="button" onClick={() => setIds(dentro ? ids.filter(x => x !== r.id) : [...ids, r.id])}
                    aria-label={`${dentro ? 'Quitar' : 'Añadir'} ${r.name}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-control border ${dentro ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2'}`}>
                    <Icon name={dentro ? 'check' : 'add'} size="s" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {ids.length > 0 && (
          <div>
            <p className="font-sans text-label font-bold text-ink mb-1">En el paquete</p>
            <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto border border-hairline rounded-control">
              {ids.map(id => (
                <li key={id} className="flex items-center gap-2 px-3 py-1.5 border-t first:border-t-0 border-hairline">
                  <span className="min-w-0 flex-1 truncate font-sans text-caption text-ink">{porId.get(id)?.name ?? 'Receta retirada'}</span>
                  <button type="button" onClick={() => setIds(ids.filter(x => x !== id))} aria-label="Quitar del paquete"
                    className="flex h-8 w-8 items-center justify-center text-ink-3 hover:text-danger">
                    <Icon name="close" size="s" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

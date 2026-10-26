import React from 'react';
import { Sheet, Icon, SearchField } from '../../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Hoja de «Añadir» del diario (Dani, 26-10-2026)

   Cuatro pestañas: Recientes (lo que más apuntas), Alimentos generales (los
   310 del banco, por Hidratos/Proteínas/Grasas/Mixtos, en kcal), Mis comidas
   (mis recetas y comidas guardadas y mis alimentos creados) y Todo (el
   buscador sobre toda la app). El escáner va junto al buscador.

   La comida es la del «+» que se tocó: ya no hay desplegable de comida arriba
   (en iOS, al ser lo primero enfocable, abría la rueda del selector solo). Si
   hay que cambiarla, se hace desde la ficha del alimento.

   La pantalla solo pinta; las filas y lo que hacen las prepara NutritionScreen.
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

export type PestanaAnadir = 'recientes' | 'generales' | 'comidas' | 'todo';

export interface SeccionFilas { titulo: string; filas: FilaAlimento[] }

interface Props {
  /** «Añadir a Desayuno» o «Cambiar Pan». */
  titulo: string;
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
  /** Encima de la lista (los tipos de alimento en «Alimentos generales»). */
  filtro?: React.ReactNode;
  /** Al pie (la atribución de Open Food Facts cuando salen sus productos). */
  nota?: string;
  onClose: () => void;
}

const PESTANAS: { id: PestanaAnadir; texto: string }[] = [
  { id: 'recientes', texto: 'Recientes' },
  { id: 'generales', texto: 'Alimentos generales' },
  { id: 'comidas', texto: 'Mis comidas' },
  { id: 'todo', texto: 'Todo' },
];

export default function AnadirAlimentoCalorias({
  titulo, busqueda, onBusqueda, pestana, onPestana, secciones, vacio, pie, onEscanear, filtro, nota, onClose,
}: Props) {
  const cabecera = (
    <div className="space-y-3 border-b border-hairline bg-bg px-4 pb-0 pt-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchField label="Buscar un alimento" placeholder="Buscar un alimento" value={busqueda} onChange={onBusqueda} />
        </div>
        <button
          type="button"
          onClick={onEscanear}
          aria-label="Escanear código de barras"
          className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-control bg-surface text-ink-2 transition-colors hover:text-ink active:scale-95"
        >
          <Icon name="qr_code_scanner" size="m" />
        </button>
      </div>
      <div role="tablist" aria-label="Qué alimentos ver" className="-mx-4 flex justify-between gap-3 overflow-x-auto px-4 hide-scrollbar">
        {PESTANAS.map(p => {
          const activa = p.id === pestana;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => onPestana(p.id)}
              className={`flex-none border-b-2 pb-2.5 font-sans text-[14px] transition-colors ${activa ? 'border-ink font-bold text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
            >
              {p.texto}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={titulo} alto="completo" toolbar={cabecera}>
      <div className="space-y-5 pb-6 pt-4">
        {filtro}
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
        {nota && <p className="px-1 text-center font-sans text-caption text-ink-3">{nota}</p>}
      </div>
    </Sheet>
  );
}

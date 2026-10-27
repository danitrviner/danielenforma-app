import React, { useState } from 'react';
import { Sheet, Icon, SearchField, Button } from '../../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Hoja de «Añadir» del diario (Dani, 26-10-2026; rediseño A+B, 27-10)

   Arriba, lo que llevas en esta comida y lo que te queda del día (con su
   barra). Debajo, el buscador con el escáner y tres pestañas para MIRAR:
   Recientes (lo que más apuntas, con tus combinaciones de siempre en una tira),
   Alimentos generales y Mis comidas. «Todo» ya no es una pestaña: en cuanto se
   escribe, el buscador mira en toda la app y agrupa por origen —lo tuyo y lo
   reciente primero, luego generales, tus comidas y recetas, y los productos
   del supermercado—. Nunca hay que buscar dos veces.

   Filas compactas de una línea con kcal, gramos y una mini barra de macros. Al
   pie, cuántos llevas añadidos y «Listo».

   La comida es la del «+» que se tocó: ya no hay desplegable de comida arriba
   (en iOS, al ser lo primero enfocable, abría la rueda del selector solo). Si
   hay que cambiarla, se hace desde la ficha del alimento.

   La pantalla solo pinta; las filas y lo que hacen las prepara NutritionScreen.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FilaAlimento {
  clave: string;
  nombre: string;
  /** «99 kcal · 15 g». */
  detalle?: string;
  /** Gramos de hidratos, proteína y grasa de la ración, para la mini barra. */
  macros?: { hc: number; p: number; g: number };
  tuyo?: boolean;
  /** Etiqueta de origen al buscar en todo («Receta», «Producto»). */
  origen?: string;
  /** Veces añadido mientras esta pantalla está abierta. */
  anadido?: number;
  onAbrir: () => void;
  /** «+»: añade sin pasar por la ficha. Sin él, el «+» abre la ficha. */
  onAnadir?: () => void;
  onEditar?: () => void;
}

export type PestanaAnadir = 'recientes' | 'generales' | 'comidas';

export interface SeccionFilas {
  titulo: string;
  icono?: string;
  filas: FilaAlimento[];
  /** Cuántas enseñar antes de «Ver N más» (al buscar en todo). */
  max?: number;
}

export interface CombinacionFila { clave: string; titulo: string; detalle: string; onAnadir: () => void }

interface Props {
  /** «Añadir a Desayuno» o «Cambiar Pan». */
  titulo: string;
  /** Lo que llevas en esta comida y lo que queda del día. Sin él no se pinta. */
  contexto?: { kcalComida: number; kcalDia: number; objetivoDia: number };
  busqueda: string;
  onBusqueda: (v: string) => void;
  pestana: PestanaAnadir;
  onPestana: (p: PestanaAnadir) => void;
  /** Lo que se pinta: la pestaña activa o, al escribir, toda la app. */
  secciones: SeccionFilas[];
  /** Tus combinaciones de siempre en esta comida (solo en Recientes, sin buscar). */
  combinaciones?: CombinacionFila[];
  /** Texto cuando no hay nada que enseñar. */
  vacio: string;
  /** Botón al pie de la lista («Crear alimento», «Buscar en el recetario»…). */
  pie?: { texto: string; icono: string; onClick: () => void };
  onEscanear: () => void;
  /** Encima de la lista (los tipos de alimento en «Alimentos generales»). */
  filtro?: React.ReactNode;
  /** Al pie (la atribución de Open Food Facts cuando salen sus productos). */
  nota?: string;
  /** Alimentos añadidos desde que se abrió la hoja. */
  anadidos?: number;
  onClose: () => void;
}

const PESTANAS: { id: PestanaAnadir; texto: string }[] = [
  { id: 'recientes', texto: 'Recientes' },
  { id: 'generales', texto: 'Generales' },
  { id: 'comidas', texto: 'Mis comidas' },
];

const COLOR_HC = 'var(--color-accent)';
const COLOR_P = '#5AA9FF';
const COLOR_G = 'var(--color-success)';

/** Mini barra de macros: reparto de las kcal entre hidratos, proteína y grasa. */
function MiniMacros({ hc, p, g }: { hc: number; p: number; g: number }) {
  const k = [hc * 4, p * 4, g * 9];
  const total = k[0] + k[1] + k[2];
  if (!(total > 0)) return null;
  return (
    <span className="inline-flex h-1 w-11 flex-none overflow-hidden rounded-full bg-inset" aria-label={`Hidratos ${Math.round(hc)} g, proteína ${Math.round(p)} g, grasa ${Math.round(g)} g`} role="img">
      <span style={{ width: `${(k[0] / total) * 100}%`, background: COLOR_HC }} />
      <span style={{ width: `${(k[1] / total) * 100}%`, background: COLOR_P }} />
      <span style={{ width: `${(k[2] / total) * 100}%`, background: COLOR_G }} />
    </span>
  );
}

function Fila({ f }: { f: FilaAlimento; key?: React.Key }) {
  return (
    <div className={`flex items-center gap-2 border-b border-hairline py-2 pl-4 pr-3 transition-colors ${f.anadido ? 'bg-accent-bg/40' : ''}`}>
      <button type="button" onClick={f.onAbrir} className="min-w-0 flex-1 text-left">
        <span className="flex items-center font-sans text-body font-semibold leading-snug text-ink">
          <span className="truncate">{f.nombre}</span>
          {f.tuyo && <span className="ml-1.5 flex-none rounded-[5px] border border-accent-line px-1 font-mono text-[9.5px] font-bold uppercase tracking-wider text-accent-ink">tuyo</span>}
          {f.origen && <span className="ml-1.5 flex-none rounded-[5px] border border-hairline px-1 font-mono text-[9.5px] font-bold uppercase tracking-wider text-ink-3">{f.origen}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2 font-mono text-caption text-ink-3">
          {f.detalle && <span className="truncate">{f.detalle}</span>}
          {f.macros && <MiniMacros {...f.macros} />}
        </span>
      </button>
      {f.onEditar && (
        <button type="button" onClick={f.onEditar} aria-label={`Editar ${f.nombre}`} className="flex h-9 w-9 flex-none items-center justify-center text-ink-3 hover:text-ink">
          <Icon name="edit" size="s" />
        </button>
      )}
      {!!f.anadido && <span className="flex-none font-mono text-caption font-bold text-accent-ink">×{f.anadido}</span>}
      <button
        type="button"
        onClick={f.onAnadir ?? f.onAbrir}
        aria-label={`Añadir ${f.nombre}`}
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full transition-transform active:scale-90 ${f.anadido ? 'bg-accent text-on-accent' : 'bg-raised text-accent-ink'}`}
      >
        <Icon name={f.anadido ? 'check' : 'add'} size="m" />
      </button>
    </div>
  );
}

function Seccion({ s }: { s: SeccionFilas; key?: React.Key }) {
  const [todas, setTodas] = useState(false);
  const visibles = s.max && !todas ? s.filas.slice(0, s.max) : s.filas;
  const resto = s.filas.length - visibles.length;
  return (
    <section>
      <h3 className="flex items-center justify-between px-4 pb-1.5 pt-4 font-mono text-caption uppercase tracking-[.14em] text-ink-3">
        <span className="inline-flex items-center gap-1.5">{s.icono && <Icon name={s.icono} size="s" />}{s.titulo}</span>
        <span className="tabular-nums">{s.filas.length}</span>
      </h3>
      <div className="border-t border-hairline">{visibles.map(f => <Fila key={f.clave} f={f} />)}</div>
      {resto > 0 && (
        <button type="button" onClick={() => setTodas(true)} className="px-4 pt-2 font-sans text-body-s font-bold text-accent-ink">
          Ver {resto} más
        </button>
      )}
    </section>
  );
}

export default function AnadirAlimentoCalorias({
  titulo, contexto, busqueda, onBusqueda, pestana, onPestana, secciones, combinaciones = [], vacio, pie,
  onEscanear, filtro, nota, anadidos = 0, onClose,
}: Props) {
  const buscando = busqueda.trim().length > 0;
  const resultados = secciones.reduce((n, s) => n + s.filas.length, 0);
  const quedan = contexto ? Math.round(contexto.objetivoDia - contexto.kcalDia) : 0;
  const pct = contexto && contexto.objetivoDia > 0 ? Math.min(100, (contexto.kcalDia / contexto.objetivoDia) * 100) : 0;

  const cabecera = (
    <div className="space-y-3 border-b border-hairline bg-bg px-4 pb-3 pt-0">
      {contexto && contexto.objetivoDia > 0 && (
        <div className="space-y-1.5">
          <p className="font-sans text-body-s text-ink-3">
            {contexto.kcalComida > 0 && <>Llevas <b className="font-bold text-ink">{contexto.kcalComida} kcal</b> en esta comida · </>}
            {quedan >= 0
              ? <>{contexto.kcalComida > 0 ? 'te' : 'Te'} quedan <b className="font-bold text-ink">{quedan} kcal</b> del día</>
              : <>{contexto.kcalComida > 0 ? 'te' : 'Te'} has pasado <b className="font-bold text-danger">{-quedan} kcal</b> del día</>}
          </p>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-inset" role="progressbar" aria-valuemin={0} aria-valuemax={contexto.objetivoDia} aria-valuenow={contexto.kcalDia} aria-label="Kcal del día">
            <span className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            {quedan < 0 && <span className="h-full bg-danger" style={{ width: '3%' }} />}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchField label="Buscar un alimento" placeholder="Buscar en todo" value={busqueda} onChange={onBusqueda} />
        </div>
        <button
          type="button"
          onClick={onEscanear}
          aria-label="Escanear código de barras"
          className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-control bg-surface text-accent-ink transition-colors hover:text-ink active:scale-95"
        >
          <Icon name="qr_code_scanner" size="m" />
        </button>
      </div>
      {buscando ? (
        <p className="flex items-center gap-1.5 font-sans text-caption text-ink-3">
          <Icon name="search" size="s" className="text-accent-ink" />
          Buscando en toda la app · {resultados} resultado{resultados === 1 ? '' : 's'}
        </p>
      ) : (
        <div role="tablist" aria-label="Qué alimentos ver" className="grid grid-cols-3 gap-1 rounded-control border border-hairline bg-raised p-[3px]">
          {PESTANAS.map(p => {
            const activa = p.id === pestana;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => onPestana(p.id)}
                className={`h-8 rounded-[9px] font-sans text-body-s font-semibold transition-colors ${activa ? 'bg-inset text-ink' : 'text-ink-3 hover:text-ink'}`}
              >
                {p.texto}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const piePantalla = (
    <div className="flex w-full items-center gap-3 text-left">
      <p className="min-w-0 flex-1 font-sans text-body-s text-ink-3">
        <b className="block font-bold text-ink">{anadidos > 0 ? `${anadidos} añadido${anadidos === 1 ? '' : 's'}` : 'Nada añadido todavía'}</b>
        {anadidos > 0 ? 'Puedes deshacer desde el aviso' : 'Toca «+» para añadir'}
      </p>
      <Button variant="primary" onClick={onClose}>Listo</Button>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={titulo} alto="completo" toolbar={cabecera} footer={piePantalla}>
      <div className="-mx-4 pb-4">
        {!buscando && filtro && <div className="px-4 pt-3">{filtro}</div>}
        {!buscando && pestana === 'recientes' && combinaciones.length > 0 && (
          <section>
            <h3 className="flex justify-between px-4 pb-1.5 pt-4 font-mono text-caption uppercase tracking-[.14em] text-ink-3">
              <span>Tus combinaciones de siempre</span><span>en esta comida</span>
            </h3>
            <div className="flex gap-2 overflow-x-auto px-4 hide-scrollbar">
              {combinaciones.map(c => (
                <button key={c.clave} type="button" onClick={c.onAnadir} className="flex flex-none items-center gap-3 rounded-control border border-hairline bg-raised py-2 pl-3 pr-2 text-left active:scale-[0.98]">
                  <span>
                    <span className="block max-w-[11rem] truncate font-sans text-body-s font-bold text-ink">{c.titulo}</span>
                    <span className="block font-mono text-caption text-ink-3">{c.detalle}</span>
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent-bg text-accent-ink"><Icon name="add" size="s" /></span>
                </button>
              ))}
            </div>
          </section>
        )}
        {secciones.every(s => s.filas.length === 0) ? (
          <p className="px-5 pt-8 text-center font-sans text-body-s text-ink-3">{vacio}</p>
        ) : secciones.map(s => s.filas.length === 0 ? null : <Seccion key={s.titulo} s={s} />)}

        {pie && (
          <div className="px-4 pt-5">
            <button
              type="button"
              onClick={pie.onClick}
              className="flex w-full items-center justify-center gap-2 rounded-surface border border-dashed border-hairline py-3.5 font-sans text-body-s font-bold text-ink-2 hover:border-accent/50 hover:text-accent-ink"
            >
              <Icon name={pie.icono} size="s" />
              {pie.texto}
            </button>
          </div>
        )}
        {nota && <p className="px-5 pt-3 text-center font-sans text-caption text-ink-3">{nota}</p>}
      </div>
    </Sheet>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Recipe } from '../../types';
import { cargarIndiceCompleto, getLimpiezaRecetario, getRecetasCompletas, getRecipeById, marcarRecetas } from '../../dbService';
import type { EstadoDeLimpieza, LimpiezaRecetario } from '../../db/recipes';
import {
  ATAJOS, FILTRO_LIMPIEZA_VACIO, TIPOS_DUPLICADO, compararDuplicados, cumpleAtajo, estadoDe, filtrarParaLimpiar, gruposDuplicados, repeticionesPorNombre,
  type Atajo, type ComparacionDuplicado, type EstadoFiltro, type FiltroLimpieza, type TipoDuplicado, type TramoIngredientes,
} from '../../utils/limpiezaRecetario';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Limpiar el recetario (29-10, las 3 pantallas que eligió Dani)

   1. Filtrar, marcar y retirar de golpe: filtros que se quedan activos (chips
      arriba con ×) y atajos para lo que suele sobrar.
   2. Revisar una a una: al pulsar una receta, su ficha al lado; R retira, M la
      mantiene y salta sola a la siguiente; ← → para moverse.
   3. Duplicados (se elige cuál se queda) y papelera (todo se recupera).

   Retirar no borra: lo apunta en `recipeAccess/limpieza` y `cargarIndiceRecetas`
   la quita para todo el mundo (db/recipes.ts).
   ═══════════════════════════════════════════════════════════════════════════ */

const MOMENTOS: { v: number; label: string }[] = [
  { v: 1, label: 'Desayuno' }, { v: 2, label: 'Media mañana' }, { v: 3, label: 'Comida' },
  { v: 4, label: 'Merienda' }, { v: 5, label: 'Cena' }, { v: 0, label: 'Sin momento' },
];
const NOMBRE_MOMENTO: Record<number, string> = { 1: 'Desayuno', 2: 'Media mañana', 3: 'Comida', 4: 'Merienda', 5: 'Cena' };
const TRAMOS: { v: TramoIngredientes; label: string }[] = [{ v: '1', label: '1 solo' }, { v: '2-4', label: '2–4' }, { v: '5+', label: '5 o más' }];
const ESTADOS: { v: EstadoFiltro; label: string }[] = [
  { v: 'sin_revisar', label: 'Sin revisar' }, { v: 'mantenidas', label: 'Las que mantengo' },
  { v: 'retiradas', label: 'Retiradas' }, { v: 'todas', label: 'Todas' },
];
const POR_PAGINA = 48;
const momentosDe = (r: Recipe) => ((r.intakeTypes ?? []).length ? (r.intakeTypes ?? []).map(i => NOMBRE_MOMENTO[i] ?? i).join(', ') : 'Sin momento');
const alternar = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter(y => y !== x) : [...xs, x]);
const fmt = (n: number) => n.toLocaleString('es-ES');

type Vista = 'filtrar' | 'duplicados' | 'papelera';

export default function LimpiarRecetario({ onCerrar }: { onCerrar: () => void }) {
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const queryClient = useQueryClient();

  const { data: recetas = [], isPending: cargando } = useQuery({ queryKey: ['recetarioIndiceCompleto'], queryFn: cargarIndiceCompleto, staleTime: Infinity });
  const { data: limpieza = {} as LimpiezaRecetario } = useQuery({ queryKey: ['limpiezaRecetario'], queryFn: getLimpiezaRecetario });

  const marcar = useMutation({
    mutationFn: ({ ids, estado }: { ids: string[]; estado: EstadoDeLimpieza }) => marcarRecetas(ids, estado),
    // Optimista: con miles de recetas la pantalla no puede esperar al servidor
    // para enseñar que una ya no está «sin revisar».
    onMutate: async ({ ids, estado }) => {
      const antes = queryClient.getQueryData<LimpiezaRecetario>(['limpiezaRecetario']) ?? {};
      const ahora = new Date().toISOString();
      const retiradas = { ...(antes.retiradas ?? {}) };
      const mantenidas = { ...(antes.mantenidas ?? {}) };
      for (const id of ids) {
        delete retiradas[id]; delete mantenidas[id];
        if (estado === 'retirada') retiradas[id] = ahora;
        if (estado === 'mantenida') mantenidas[id] = ahora;
      }
      queryClient.setQueryData(['limpiezaRecetario'], { ...antes, retiradas, mantenidas });
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) queryClient.setQueryData(['limpiezaRecetario'], ctx.antes);
      showToast('No se pudo guardar. Inténtalo otra vez.', 'error');
    },
    onSuccess: () => {
      // El resto de la app lee el recetario ya sin las retiradas.
      void queryClient.invalidateQueries({ queryKey: ['recetarioIndice'] });
    },
  });

  const [vista, setVista] = useState<Vista>('filtrar');
  const [filtro, setFiltro] = useState<FiltroLimpieza>(FILTRO_LIMPIEZA_VACIO);
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState<string | null>(null);
  const cambiar = (p: Partial<FiltroLimpieza>) => { setFiltro(f => ({ ...f, ...p })); setVisibles(POR_PAGINA); setMarcadas(new Set()); };

  const repeticiones = useMemo(() => repeticionesPorNombre(recetas), [recetas]);
  const lista = useMemo(() => filtrarParaLimpiar(recetas, filtro, limpieza, repeticiones), [recetas, filtro, limpieza, repeticiones]);
  const cuentaAtajo = useMemo(() => {
    const vivas = recetas.filter(r => !limpieza.retiradas?.[r.id]);
    return Object.fromEntries(ATAJOS.map(a => [a.id, vivas.filter(r => cumpleAtajo(r, a.id, repeticiones)).length])) as Record<Atajo, number>;
  }, [recetas, limpieza, repeticiones]);
  const nRetiradas = Object.keys(limpieza.retiradas ?? {}).length;
  const categorias = useMemo(() => [...new Set(recetas.map(r => r.categoria).filter(Boolean) as string[])].sort(), [recetas]);

  const decidir = async (ids: string[], estado: EstadoDeLimpieza) => {
    if (ids.length === 0) return;
    if (estado === 'retirada' && ids.length > 1) {
      const ok = await confirm(
        `¿Retirar ${fmt(ids.length)} recetas? Dejan de salir en el recetario tuyo y el de los atletas, en los menús que se generen desde hoy, en los cambios de receta y en sus planes. Los menús ya generados no se tocan, y se recuperan desde la papelera.`,
      );
      if (!ok) return;
    }
    marcar.mutate({ ids, estado });
    setMarcadas(new Set());
    if (ids.length > 1) showToast(estado === 'retirada' ? `${fmt(ids.length)} recetas retiradas.` : estado === 'mantenida' ? `${fmt(ids.length)} recetas mantenidas.` : `${fmt(ids.length)} recetas vuelven a «sin revisar».`, 'success');
  };

  // ── Pantalla 2: la ficha al lado y las teclas ─────────────────────────────
  const idxFoco = foco ? lista.findIndex(r => r.id === foco) : -1;
  const recetaFoco = foco ? recetas.find(r => r.id === foco) ?? null : null;
  const decidirFoco = (estado: EstadoDeLimpieza) => {
    if (!recetaFoco) return;
    // La siguiente se calcula ANTES: al decidir, esta puede salir de la lista.
    const siguiente = lista[idxFoco + 1] ?? lista[idxFoco - 1] ?? null;
    marcar.mutate({ ids: [recetaFoco.id], estado });
    setFoco(siguiente && filtro.estado !== 'todas' ? siguiente.id : foco);
  };
  useEffect(() => {
    if (vista !== 'filtrar' || !foco) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 'r') { e.preventDefault(); decidirFoco('retirada'); }
      else if (k === 'm') { e.preventDefault(); decidirFoco('mantenida'); }
      else if (e.key === 'ArrowRight' && lista[idxFoco + 1]) { e.preventDefault(); setFoco(lista[idxFoco + 1].id); }
      else if (e.key === 'ArrowLeft' && lista[idxFoco - 1]) { e.preventDefault(); setFoco(lista[idxFoco - 1].id); }
      else if (e.key === 'Escape') setFoco(null);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  const activos: { label: string; quitar: () => void }[] = [
    ...(filtro.texto.trim() ? [{ label: `«${filtro.texto.trim()}»`, quitar: () => cambiar({ texto: '' }) }] : []),
    ...(filtro.ingrediente.trim() ? [{ label: `Lleva ${filtro.ingrediente.trim()}`, quitar: () => cambiar({ ingrediente: '' }) }] : []),
    ...filtro.atajos.map(a => ({ label: ATAJOS.find(x => x.id === a)!.label, quitar: () => cambiar({ atajos: filtro.atajos.filter(x => x !== a) }) })),
    ...filtro.momentos.map(m => ({ label: MOMENTOS.find(x => x.v === m)!.label, quitar: () => cambiar({ momentos: filtro.momentos.filter(x => x !== m) }) })),
    ...filtro.categorias.map(c => ({ label: c, quitar: () => cambiar({ categorias: filtro.categorias.filter(x => x !== c) }) })),
    ...(filtro.ingredientes ? [{ label: `${TRAMOS.find(t => t.v === filtro.ingredientes)!.label} ingr.`, quitar: () => cambiar({ ingredientes: '' }) }] : []),
    ...(filtro.estado !== 'sin_revisar' ? [{ label: ESTADOS.find(e => e.v === filtro.estado)!.label, quitar: () => cambiar({ estado: 'sin_revisar' }) }] : []),
  ];

  // Portal al <body>: dentro de la pantalla, un padre con `transform` (la
  // animación de entrada) convertía el `fixed` en relativo a él y no tapaba la app.
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onCerrar} className="flex items-center gap-1.5 rounded-control border border-hairline px-3 py-2 font-sans text-label text-ink-2 hover:text-ink">
            <Icon name="arrow_back" size="s" /> Volver
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-sans text-title-m font-extrabold uppercase text-ink">Limpiar el recetario</h1>
            <p className="font-mono text-caption text-ink-3">
              {cargando ? 'Cargando…' : `${fmt(recetas.length - nRetiradas)} recetas en uso · ${fmt(nRetiradas)} retiradas`}
            </p>
          </div>
          <div role="tablist" className="flex gap-1 rounded-control bg-inset p-1">
            {([['filtrar', 'Filtrar y retirar'], ['duplicados', `Duplicados · ${fmt(cuentaAtajo.duplicados ?? 0)}`], ['papelera', `Papelera · ${fmt(nRetiradas)}`]] as const).map(([v, t]) => (
              <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => { setVista(v); setFoco(null); }}
                className={`rounded-control px-3 py-2 font-sans text-label font-bold ${vista === v ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'}`}>
                {t}
              </button>
            ))}
          </div>
        </header>

        {vista === 'filtrar' && (
          <div className="grid gap-4 lg:grid-cols-[250px_1fr] items-start">
            {/* Filtros */}
            <aside className="space-y-4 rounded-surface border border-hairline bg-surface p-3.5 lg:sticky lg:top-4">
              <Campo icono="search" valor={filtro.texto} onChange={v => cambiar({ texto: v })} placeholder="Nombre de la receta…" />
              <Campo icono="egg" valor={filtro.ingrediente} onChange={v => cambiar({ ingrediente: v })} placeholder="Lleva el ingrediente…" />
              <Bloque titulo="Atajos para limpiar">
                {ATAJOS.map(a => {
                  const on = filtro.atajos.includes(a.id);
                  return (
                    <button key={a.id} type="button" aria-pressed={on} onClick={() => cambiar({ atajos: alternar(filtro.atajos, a.id) })}
                      className={`flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left font-sans text-body-s ${on ? 'bg-accent/12 text-ink' : 'text-ink-2 hover:text-ink'}`}>
                      <span className="flex items-center gap-2">
                        <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-on-accent' : 'border-strong'}`}>
                          {on && <Icon name="check" size="s" style={{ fontSize: 12 }} />}
                        </span>
                        {a.label}
                      </span>
                      <span className="font-mono text-caption text-ink-3">{fmt(cuentaAtajo[a.id] ?? 0)}</span>
                    </button>
                  );
                })}
              </Bloque>
              <Bloque titulo="Momento"><Chips opciones={MOMENTOS.map(m => ({ v: m.v, label: m.label }))} activos={filtro.momentos} onToggle={v => cambiar({ momentos: alternar(filtro.momentos, v) })} /></Bloque>
              <Bloque titulo="Categoría"><Chips<string> opciones={categorias.map(c => ({ v: c, label: c }))} activos={filtro.categorias} onToggle={v => cambiar({ categorias: alternar(filtro.categorias, v) })} /></Bloque>
              <Bloque titulo="Ingredientes"><Chips opciones={TRAMOS} activos={filtro.ingredientes ? [filtro.ingredientes] : []} onToggle={v => cambiar({ ingredientes: filtro.ingredientes === v ? '' : v })} /></Bloque>
              <Bloque titulo="Estado"><Chips opciones={ESTADOS} activos={[filtro.estado]} onToggle={v => cambiar({ estado: v })} /></Bloque>
            </aside>

            <div className={`grid gap-4 items-start ${recetaFoco ? 'xl:grid-cols-[1fr_400px]' : ''}`}>
              <div className="space-y-3 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {activos.map(a => (
                    <button key={a.label} type="button" onClick={a.quitar}
                      className="inline-flex items-center gap-1 rounded-full border border-accent-line bg-accent/12 py-1 pl-2.5 pr-1.5 font-sans text-caption font-bold text-accent-ink">
                      {a.label} <Icon name="close" size="s" style={{ fontSize: 14 }} />
                    </button>
                  ))}
                  {activos.length > 1 && (
                    <button type="button" onClick={() => cambiar(FILTRO_LIMPIEZA_VACIO)} className="px-1 font-sans text-caption text-ink-3 hover:text-ink">Quitar todos</button>
                  )}
                  <span className="ml-auto font-mono text-caption text-ink-3">
                    {fmt(lista.length)} recetas
                    {lista.length > 0 && filtro.estado !== 'retiradas' && (
                      <> · <button type="button" onClick={() => setMarcadas(new Set(lista.map(r => r.id)))} className="text-accent-ink hover:underline">marcar las {fmt(lista.length)}</button></>
                    )}
                  </span>
                </div>

                {cargando ? (
                  <p className="py-10 text-center font-sans text-body-s text-ink-3">Cargando el recetario…</p>
                ) : lista.length === 0 ? (
                  <p className="py-10 text-center font-sans text-body-s text-ink-3">Ninguna receta con estos filtros.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
                    {lista.slice(0, visibles).map(r => (
                      <Tarjeta key={r.id} receta={r} marcada={marcadas.has(r.id)} enFoco={foco === r.id} estado={estadoDe(r.id, limpieza)}
                        onMarcar={() => {
                          // Marcar es el modo «de golpe»: la ficha (uno a uno) se cierra
                          // para no tapar la barra de acciones.
                          setFoco(null);
                          setMarcadas(m => { const n = new Set(m); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; });
                        }}
                        onAbrir={() => setFoco(r.id)} />
                    ))}
                  </div>
                )}
                {lista.length > visibles && (
                  <button type="button" onClick={() => setVisibles(v => v + POR_PAGINA)} className="w-full min-h-[44px] font-mono text-caption text-accent-ink hover:underline">
                    Ver {Math.min(POR_PAGINA, lista.length - visibles)} más ({fmt(lista.length - visibles)} sin mostrar)
                  </button>
                )}

                {marcadas.size > 0 && (
                  <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-surface border border-strong bg-raised px-4 py-2.5 shadow-lg">
                    <b className="font-sans text-body text-ink">{fmt(marcadas.size)} marcadas</b>
                    <span className="flex-1" />
                    {filtro.estado === 'retiradas' ? (
                      <BotonAccion icono="undo" onClick={() => decidir([...marcadas], 'sin_revisar')}>Recuperar {fmt(marcadas.size)}</BotonAccion>
                    ) : filtro.estado === 'mantenidas' ? (
                      <>
                        <BotonAccion icono="undo" onClick={() => decidir([...marcadas], 'sin_revisar')}>Volver a sin revisar</BotonAccion>
                        <BotonAccion icono="delete" peligro onClick={() => decidir([...marcadas], 'retirada')}>Retirar {fmt(marcadas.size)}</BotonAccion>
                      </>
                    ) : (
                      <>
                        <BotonAccion icono="done_all" onClick={() => decidir([...marcadas], 'mantenida')}>Mantener</BotonAccion>
                        <BotonAccion onClick={() => setMarcadas(new Set())}>Desmarcar</BotonAccion>
                        <BotonAccion icono="delete" peligro onClick={() => decidir([...marcadas], 'retirada')}>Retirar {fmt(marcadas.size)}</BotonAccion>
                      </>
                    )}
                  </div>
                )}
              </div>

              {recetaFoco && (
                <Ficha receta={recetaFoco} estado={estadoDe(recetaFoco.id, limpieza)}
                  hayAnterior={idxFoco > 0} haySiguiente={idxFoco >= 0 && idxFoco < lista.length - 1}
                  onAnterior={() => idxFoco > 0 && setFoco(lista[idxFoco - 1].id)}
                  onSiguiente={() => lista[idxFoco + 1] && setFoco(lista[idxFoco + 1].id)}
                  onDecidir={decidirFoco} onCerrar={() => setFoco(null)} />
              )}
            </div>
          </div>
        )}

        {vista === 'duplicados' && <Duplicados recetas={recetas} limpieza={limpieza} onRetirar={ids => decidir(ids, 'retirada')} />}
        {vista === 'papelera' && <Papelera recetas={recetas} limpieza={limpieza} onRecuperar={ids => decidir(ids, 'sin_revisar')} />}
      </div>
      <ConfirmDialog />
    </div>,
    document.body,
  );
}

// ── Piezas ─────────────────────────────────────────────────────────────────

function Campo({ icono, valor, onChange, placeholder }: { icono: string; valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={`flex h-10 items-center gap-2 rounded-control border bg-raised px-2.5 ${valor ? 'border-accent-line' : 'border-hairline'}`}>
      <Icon name={icono} size="s" className="text-ink-3" />
      <input type="search" value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent font-sans text-body-s text-ink placeholder:text-ink-3 focus:outline-none" />
    </label>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-caption font-bold uppercase tracking-wider text-ink-3">{titulo}</p>
      {children}
    </div>
  );
}

function Chips<T extends string | number>({ opciones, activos, onToggle }: { opciones: { v: T; label: string }[]; activos: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map(o => {
        const on = activos.includes(o.v);
        return (
          <button key={String(o.v)} type="button" aria-pressed={on} onClick={() => onToggle(o.v)}
            className={`rounded-full border px-2.5 py-1 font-mono text-caption ${on ? 'border-accent bg-accent font-bold text-on-accent' : 'border-hairline text-ink-2 hover:text-ink'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function BotonAccion({ icono, peligro, onClick, children }: { icono?: string; peligro?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-2 font-sans text-label font-bold ${peligro ? 'border-danger bg-danger text-white' : 'border-hairline text-ink hover:border-strong'}`}>
      {icono && <Icon name={icono} size="s" />}{children}
    </button>
  );
}

function Imagen({ receta, className }: { receta: Recipe; className: string }) {
  return receta.image
    ? <img src={receta.image} alt="" loading="lazy" className={`${className} object-cover bg-inset`}
        onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
    : <span className={`${className} flex items-center justify-center bg-inset text-ink-4`}><Icon name="restaurant" size="m" /></span>;
}

function Tarjeta({ receta: r, marcada, enFoco, estado, onMarcar, onAbrir }: {
  receta: Recipe; marcada: boolean; enFoco: boolean; estado: ReturnType<typeof estadoDe>;
  onMarcar: () => void; onAbrir: () => void; key?: React.Key;
}) {
  const ingredientes = (r.ingredientsText ?? []).map(i => i.name);
  return (
    <div className={`relative overflow-hidden rounded-surface border bg-surface ${marcada ? 'border-2 border-accent' : enFoco ? 'border-accent-line' : 'border-hairline'} ${estado === 'retirada' ? 'opacity-60' : ''}`}>
      <button type="button" onClick={onAbrir} className="block w-full text-left">
        <span className="relative block">
          <Imagen receta={r} className="h-28 w-full" />
          <span className="absolute left-2 top-2 rounded-control bg-black/65 px-1.5 py-0.5 font-mono text-caption text-white">{Math.round(r.kcal ?? 0)} kcal</span>
        </span>
        <span className="block px-2.5 pb-2.5 pt-2">
          <span className="block min-h-[34px] font-sans text-label font-bold leading-snug text-ink line-clamp-2">{r.name.trim()}</span>
          <span className="mt-1 block font-mono text-caption text-ink-3 truncate">{momentosDe(r)}{r.cookingTime ? ` · ${r.cookingTime} min` : ''}</span>
          <span className="mt-1 block font-sans text-caption leading-snug text-ink-2 line-clamp-2">{ingredientes.join(' · ') || 'Sin ingredientes'}</span>
          {estado !== 'sin_revisar' && (
            <span className={`mt-1.5 inline-block rounded-control px-1.5 font-mono text-caption ${estado === 'retirada' ? 'bg-danger/12 text-danger' : 'bg-success/12 text-success'}`}>
              {estado === 'retirada' ? 'retirada' : 'mantengo'}
            </span>
          )}
        </span>
      </button>
      <button type="button" onClick={onMarcar} aria-pressed={marcada} aria-label={`${marcada ? 'Desmarcar' : 'Marcar'} ${r.name.trim()}`}
        className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-control border-2 ${marcada ? 'border-accent bg-accent text-on-accent' : 'border-white/80 bg-black/35 text-transparent hover:text-white'}`}>
        <Icon name="check" size="s" style={{ fontSize: 15 }} />
      </button>
    </div>
  );
}

function Ficha({ receta: r, estado, hayAnterior, haySiguiente, onAnterior, onSiguiente, onDecidir, onCerrar }: {
  receta: Recipe; estado: ReturnType<typeof estadoDe>; hayAnterior: boolean; haySiguiente: boolean;
  onAnterior: () => void; onSiguiente: () => void; onDecidir: (e: EstadoDeLimpieza) => void; onCerrar: () => void;
}) {
  // El índice no trae cantidades: llegan con la receta completa (una lectura).
  const { data: completa } = useQuery({ queryKey: ['receta', r.id], queryFn: () => getRecipeById(r.id), staleTime: Infinity });
  const ingredientes = completa?.ingredientsText ?? r.ingredientsText ?? [];
  const m = r.macros;
  return (
    // En pantallas estrechas flota abajo, encima de la lista: en columna quedaba
    // al final de todo, lejos de la tarjeta pulsada.
    <aside className="fixed inset-x-2 bottom-2 z-20 max-h-[80vh] overflow-y-auto rounded-surface border border-strong bg-surface shadow-lg xl:inset-auto xl:z-auto xl:max-h-none xl:overflow-hidden xl:border-hairline xl:shadow-none xl:sticky xl:top-4">
      <div className="relative">
        <Imagen receta={r} className="h-52 w-full" />
        <div className="absolute right-2 top-2 flex gap-1.5">
          {[['chevron_left', onAnterior, !hayAnterior, 'Anterior'], ['chevron_right', onSiguiente, !haySiguiente, 'Siguiente'], ['close', onCerrar, false, 'Cerrar ficha']].map(([icono, fn, off, label]) => (
            <button key={icono as string} type="button" onClick={fn as () => void} disabled={off as boolean} aria-label={label as string}
              className="flex h-8 w-8 items-center justify-center rounded-control bg-black/60 text-white disabled:opacity-30">
              <Icon name={icono as string} size="s" />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="font-mono text-caption uppercase text-ink-3">{r.categoria} · {momentosDe(r)}{r.cookingTime ? ` · ${r.cookingTime} min` : ''}</p>
          <h3 className="font-sans text-title-s font-bold leading-snug text-ink">{r.name.trim()}</h3>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[['kcal', Math.round(r.kcal ?? 0)], ['HC', m ? `${Math.round(m.carb)} g` : '—'], ['Prot', m ? `${Math.round(m.prot)} g` : '—'], ['Grasa', m ? `${Math.round(m.fat)} g` : '—']].map(([t, v]) => (
            <div key={t as string} className="rounded-control bg-raised px-2 py-1.5">
              <p className="font-mono text-caption text-ink-3">{t}</p>
              <p className="font-mono text-label font-bold text-ink">{v}</p>
            </div>
          ))}
        </div>
        <ul className="divide-y divide-hairline">
          {ingredientes.map((i, n) => (
            <li key={n} className="flex justify-between gap-2 py-1.5 font-sans text-body-s text-ink">
              <span>{i.name}</span>
              <span className="font-mono text-caption text-ink-3">{i.quantity ? `${fmt(Math.round(i.quantity))} g` : ''}</span>
            </li>
          ))}
        </ul>
        {estado !== 'sin_revisar' && (
          <p className={`font-mono text-caption ${estado === 'retirada' ? 'text-danger' : 'text-success'}`}>
            {estado === 'retirada' ? 'Retirada: no sale en ningún sitio.' : 'La mantienes: ya no sale en «Sin revisar».'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {estado === 'retirada' ? (
            <button type="button" onClick={() => onDecidir('sin_revisar')} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-control border border-hairline py-2.5 font-sans text-label font-bold text-ink">
              <Icon name="undo" size="s" /> Recuperar
            </button>
          ) : estado === 'mantenida' ? (
            <>
              <button type="button" onClick={() => onDecidir('sin_revisar')} className="inline-flex items-center justify-center gap-1.5 rounded-control border border-hairline py-2.5 font-sans text-label font-bold text-ink hover:border-strong">
                <Icon name="undo" size="s" /> Sin revisar
              </button>
              <button type="button" onClick={() => onDecidir('retirada')} className="inline-flex items-center justify-center gap-1.5 rounded-control border border-danger bg-danger py-2.5 font-sans text-label font-bold text-white">
                <Icon name="delete" size="s" /> Retirar <kbd className="rounded border border-white/40 px-1 font-mono text-caption">R</kbd>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => onDecidir('mantenida')} className="inline-flex items-center justify-center gap-1.5 rounded-control border border-hairline py-2.5 font-sans text-label font-bold text-ink hover:border-strong">
                <Icon name="check" size="s" /> Mantener <kbd className="rounded border border-hairline px-1 font-mono text-caption text-ink-3">M</kbd>
              </button>
              <button type="button" onClick={() => onDecidir('retirada')} className="inline-flex items-center justify-center gap-1.5 rounded-control border border-danger bg-danger py-2.5 font-sans text-label font-bold text-white">
                <Icon name="delete" size="s" /> Retirar <kbd className="rounded border border-white/40 px-1 font-mono text-caption">R</kbd>
              </button>
            </>
          )}
        </div>
        <p className="font-mono text-caption text-ink-3">← → para moverte · Esc cierra</p>
      </div>
    </aside>
  );
}

function Duplicados({ recetas, limpieza, onRetirar }: { recetas: Recipe[]; limpieza: LimpiezaRecetario; onRetirar: (ids: string[]) => void }) {
  const grupos = useMemo(() => gruposDuplicados(recetas, limpieza), [recetas, limpieza]);
  // Cantidades y pasos no vienen en el índice: se leen las recetas completas de
  // los grupos (unas 600, una vez por sesión, solo el coach).
  const ids = useMemo(() => grupos.flat().map(r => r.id).sort(), [grupos]);
  const { data: completas, isPending: cargandoCompletas } = useQuery({
    queryKey: ['recetasDuplicadasCompletas', ids.join(',')],
    queryFn: () => getRecetasCompletas(ids),
    enabled: ids.length > 0,
    staleTime: Infinity,
  });
  const porId = useMemo(() => new Map((completas ?? []).map(r => [r.id, r])), [completas]);
  const comparados = useMemo(() => grupos.map(g => {
    const llenas = g.map(r => porId.get(r.id) ?? r);
    return { grupo: g, completas: llenas, comp: completas ? compararDuplicados(llenas) : null };
  }), [grupos, porId, completas]);
  const cuenta = useMemo(() => {
    const n: Record<TipoDuplicado, number> = { identicas: 0, otra_cantidad: 0, otros_pasos: 0, distintas: 0 };
    for (const c of comparados) if (c.comp) n[c.comp.tipo]++;
    return n;
  }, [comparados]);

  const [tipo, setTipo] = useState<TipoDuplicado | null>(null);
  const [quedan, setQuedan] = useState<Record<string, string>>({});
  const [visibles, setVisibles] = useState(20);
  const queda = (g: Recipe[]) => quedan[g[0].id] ?? g[0].id;
  const sobrantes = (g: Recipe[]) => g.filter(r => r.id !== queda(g)).map(r => r.id);
  const lista = tipo ? comparados.filter(c => c.comp?.tipo === tipo) : comparados;

  if (grupos.length === 0) return <p className="py-10 text-center font-sans text-body-s text-ink-3">No quedan recetas repetidas.</p>;
  return (
    <div className="space-y-3">
      <p className="font-sans text-body-s text-ink-2">
        <b className="text-ink">{fmt(grupos.reduce((s, g) => s + g.length, 0))} recetas</b> en <b className="text-ink">{fmt(grupos.length)} grupos</b> con el mismo nombre.
        {' '}Casi nunca son la misma: compara gramos y pasos antes de retirar. Pulsa la versión que se queda.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={tipo === null} onClick={() => { setTipo(null); setVisibles(20); }}
          className={`rounded-full border px-3 py-1.5 font-sans text-caption font-bold ${tipo === null ? 'border-accent bg-accent text-on-accent' : 'border-hairline text-ink-2 hover:text-ink'}`}>
          Todos · {fmt(grupos.length)}
        </button>
        {TIPOS_DUPLICADO.map(t => (
          <button key={t.id} type="button" aria-pressed={tipo === t.id} onClick={() => { setTipo(t.id); setVisibles(20); }} title={t.nota}
            className={`rounded-full border px-3 py-1.5 font-sans text-caption font-bold ${tipo === t.id ? 'border-accent bg-accent text-on-accent' : 'border-hairline text-ink-2 hover:text-ink'}`}>
            {t.label} · {cargandoCompletas ? '…' : fmt(cuenta[t.id])}
          </button>
        ))}
      </div>
      {tipo && lista.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-raised px-3 py-2">
          <p className="flex-1 font-sans text-caption text-ink-2">{TIPOS_DUPLICADO.find(t => t.id === tipo)!.nota}.</p>
          <BotonAccion icono="delete" peligro={tipo === 'identicas'} onClick={() => onRetirar(lista.flatMap(c => sobrantes(c.grupo)))}>
            Retirar las repetidas de estos {fmt(lista.length)} grupos
          </BotonAccion>
        </div>
      )}
      {cargandoCompletas && <p className="font-mono text-caption text-ink-3">Leyendo gramos y pasos de las {fmt(ids.length)} recetas…</p>}

      {lista.slice(0, visibles).map(({ grupo: g, completas: llenas, comp }) => (
        <GrupoDuplicado key={g[0].id} grupo={llenas} comp={comp} queda={queda(g)}
          onQueda={id => setQuedan(q => ({ ...q, [g[0].id]: id }))} onRetirar={() => onRetirar(sobrantes(g))} />
      ))}
      {lista.length > visibles && (
        <button type="button" onClick={() => setVisibles(v => v + 20)} className="w-full min-h-[44px] font-mono text-caption text-accent-ink hover:underline">
          Ver 20 grupos más ({fmt(lista.length - visibles)} sin mostrar)
        </button>
      )}
    </div>
  );
}

const COLOR_TIPO: Record<TipoDuplicado, string> = {
  identicas: 'text-success border-success/40 bg-success/8',
  otra_cantidad: 'text-warning border-warning/40 bg-warning/8',
  otros_pasos: 'text-data border-data/40 bg-data/8',
  distintas: 'text-ink-2 border-hairline bg-raised',
};

function GrupoDuplicado({ grupo, comp, queda, onQueda, onRetirar }: {
  grupo: Recipe[]; comp: ComparacionDuplicado | null; queda: string;
  onQueda: (id: string) => void; onRetirar: () => void; key?: React.Key;
}) {
  const [verPasos, setVerPasos] = useState(false);
  const info = comp ? TIPOS_DUPLICADO.find(t => t.id === comp.tipo)! : null;
  return (
    <section className="rounded-surface border border-hairline bg-surface p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-sans text-label font-bold text-ink">{grupo[0].name.trim()}</h4>
        <span className="font-mono text-caption text-ink-3">{grupo.length} con este nombre</span>
        {comp && info && (
          <span className={`rounded-full border px-2 py-0.5 font-mono text-caption ${COLOR_TIPO[comp.tipo]}`} title={info.nota}>{info.label}</span>
        )}
        <span className="flex-1" />
        <BotonAccion icono="delete" onClick={onRetirar}>Retirar {grupo.length - 1}</BotonAccion>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="w-[38%]" />
              {grupo.map((r, i) => {
                const seQueda = queda === r.id;
                return (
                  <th key={r.id} className="p-1 align-top font-normal">
                    <button type="button" onClick={() => onQueda(r.id)} aria-pressed={seQueda}
                      className={`flex w-full flex-col items-center gap-1 rounded-control border p-1.5 ${seQueda ? 'border-success/50 bg-success/6' : 'border-dashed border-hairline opacity-75 hover:opacity-100'}`}>
                      <Imagen receta={r} className="h-14 w-full max-w-[110px] rounded-control" />
                      <span className="font-mono text-caption text-ink">V{i + 1} · {Math.round(r.kcal ?? 0)} kcal</span>
                      <span className={`inline-flex items-center gap-1 font-mono text-caption ${seQueda ? 'text-success' : 'text-danger'}`}>
                        <Icon name={seQueda ? 'check_circle' : 'delete'} size="s" /> {seQueda ? 'se queda' : 'se retira'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(comp?.filas ?? (grupo[0].ingredientsText ?? []).map(i => ({ ingrediente: i.name, gramos: grupo.map(() => null), distinta: false }))).map(f => (
              <tr key={f.ingrediente} className={f.distinta ? 'bg-warning/6' : ''}>
                <td className="border-t border-hairline px-2 py-1 font-sans text-caption text-ink">{f.ingrediente}</td>
                {f.gramos.map((g, i) => (
                  <td key={i} className={`border-t border-hairline px-2 py-1 text-center font-mono text-caption ${f.distinta ? 'font-bold text-warning' : 'text-ink-2'}`}>
                    {comp ? (g == null ? '—' : `${fmt(g)} g`) : '…'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {comp && (
        <div>
          <button type="button" onClick={() => setVerPasos(v => !v)} className="inline-flex items-center gap-1 font-mono text-caption text-ink-2 hover:text-ink">
            <Icon name={verPasos ? 'expand_less' : 'expand_more'} size="s" />
            {comp.mismosPasos ? 'Mismos pasos' : 'Pasos distintos'} · {verPasos ? 'ocultar' : 'ver'}
          </button>
          {verPasos && (
            <div className={`mt-2 grid gap-2 ${comp.mismosPasos ? '' : 'sm:grid-cols-2'}`}>
              {(comp.mismosPasos ? grupo.slice(0, 1) : grupo).map((r, i) => (
                <ol key={r.id} className="list-decimal space-y-1 rounded-control bg-raised py-2 pl-7 pr-3">
                  {!comp.mismosPasos && <p className="-ml-4 mb-1 font-mono text-caption text-ink-3">V{i + 1}</p>}
                  {(r.stepsText ?? []).map(p => (
                    <li key={p.position} className="font-sans text-caption leading-snug text-ink-2">
                      {p.description}{p.items?.length ? ` ${p.items.map(x => x.description).join(', ')}` : ''}
                    </li>
                  ))}
                  {(r.stepsText ?? []).length === 0 && <li className="list-none -ml-4 font-sans text-caption text-ink-3">Sin pasos.</li>}
                </ol>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Papelera({ recetas, limpieza, onRecuperar }: { recetas: Recipe[]; limpieza: LimpiezaRecetario; onRecuperar: (ids: string[]) => void }) {
  const retiradas = useMemo(() => {
    const fechas = limpieza.retiradas ?? {};
    return recetas.filter(r => fechas[r.id]).sort((a, b) => fechas[b.id].localeCompare(fechas[a.id]));
  }, [recetas, limpieza]);
  const [visibles, setVisibles] = useState(60);
  if (retiradas.length === 0) return <p className="py-10 text-center font-sans text-body-s text-ink-3">La papelera está vacía.</p>;
  const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-sans text-body-s text-ink-2">No salen en ningún sitio. Al recuperarlas vuelven al recetario de todos.</p>
        <span className="flex-1" />
        <BotonAccion icono="undo" onClick={() => onRecuperar(retiradas.map(r => r.id))}>Recuperar las {fmt(retiradas.length)}</BotonAccion>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {retiradas.slice(0, visibles).map(r => (
          <li key={r.id} className="flex items-center gap-2.5 rounded-control border border-hairline bg-surface p-2">
            <Imagen receta={r} className="h-11 w-11 flex-shrink-0 rounded-control" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-label font-bold text-ink">{r.name.trim()}</span>
              <span className="block font-mono text-caption text-ink-3">retirada el {fecha(limpieza.retiradas![r.id])}</span>
            </span>
            <button type="button" onClick={() => onRecuperar([r.id])} className="inline-flex items-center gap-1 rounded-control border border-hairline px-2.5 py-1.5 font-sans text-caption font-bold text-ink hover:border-strong">
              <Icon name="undo" size="s" /> Recuperar
            </button>
          </li>
        ))}
      </ul>
      {retiradas.length > visibles && (
        <button type="button" onClick={() => setVisibles(v => v + 60)} className="w-full min-h-[44px] font-mono text-caption text-accent-ink hover:underline">
          Ver más ({fmt(retiradas.length - visibles)} sin mostrar)
        </button>
      )}
    </div>
  );
}

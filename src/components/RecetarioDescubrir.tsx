import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Macros, Recipe } from '../types';
import FotoDeReceta from './FotoDeReceta';
import { EmptyState, Icon, SearchField, SegmentedControl, Skeleton } from './ui';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import { coincideBusqueda } from '../utils/busqueda';
import { cabeEnLoQueQueda } from '../utils/macrosDeReceta';
import {
  FILAS_DESCUBRIR, NEVERA, coleccionPorId, encajaEnCupo, fichaDe, recetasConLoQueTienes, recetasDeColeccion,
  resumirColecciones, type Coleccion, type FilaDescubrir, type ResumenDeColeccion,
} from '../utils/coleccionesRecetario';

/* ═══════════════════════════════════════════════════════════════════════════
   Recetario › Descubrir (10-2026)

   La portada del recetario en filas (por comida, calorías, tipo de plato,
   dieta, ingrediente…) y la lista de cada fila al tocarla. Sirve a dos
   pantallas que antes tenían cada una su lista paginada con desplegables:

   · Nutrición › Recetas: tocar una receta abre su ficha.
   · Nutrición › Mi plan › «Usar receta»: tocar una receta la pone en la
     comida, y las que llenan el hueco de esa comida llevan «Encaja».

   No filtra por el atleta: recibe el pool YA filtrado (alergias, condiciones,
   dieta, recetas que el coach le esconde…) y ordenado por preferencia, porque
   cada pantalla ya tenía esa lógica y duplicarla aquí era la forma más segura
   de que una de las dos se quedara atrás.
   ═══════════════════════════════════════════════════════════════════════════ */

const POR_PAGINA = 24;
const EN_FILA = 10;
const MAX_RESULTADOS_BUSQUEDA = 200;

export interface FilaPersonal {
  id: string;
  titulo: string;
  subtitulo?: string;
  icono: string;
  recetas: Recipe[];
}

interface Props {
  /** Recetas que este atleta puede ver, ya filtradas y en orden de preferencia. */
  pool: Recipe[];
  estado: 'cargando' | 'listo' | 'error';
  onReintentar?: () => void;
  favoritas: ReadonlySet<string>;
  /** Tocar una receta: abrir su ficha (recetario) o ponerla en la comida (selector). */
  onElegir: (r: Recipe) => void;
  /** Sin esto no se pinta el corazón (el selector de «Usar receta» no lo usa). */
  onFavorita?: (id: string) => void;
  /** El hueco de la comida que toca, en kcal y gramos: activa la fila
   *  «Encajan…» y la marca en cada tarjeta. `llenar` (por defecto) = la receta
   *  llena ESE hueco, con el margen de utils/macrosDeReceta.ts; `caber` = cabe
   *  en lo que queda, que es lo que tiene sentido contra el día entero. */
  cupo?: { titulo: string; cupo: Macros; criterio?: 'llenar' | 'caber' } | null;
  /** Filas propias del atleta que van arriba del todo (las del coach, las que más hace…). */
  filasPersonales?: FilaPersonal[];
  /** Para avisar —sin esconderla— de una receta que tarda más de lo que el atleta dijo tener. */
  excedeTiempo?: (r: Recipe) => boolean;
  /** Texto de la acción al tocar, para lectores de pantalla («Abrir», «Usar»). */
  verbo?: string;
}

type Vista =
  | { tipo: 'portada' }
  | { tipo: 'coleccion'; id: string }
  | { tipo: 'personal'; id: string }
  | { tipo: 'encajan' };

type FiltroLista = '' | 'rapidas' | 'tupper' | 'proteina' | 'encajan';

// ── Piezas ────────────────────────────────────────────────────────────────────

/** Gramos de cada macro de la receta. */
function MacrosDeReceta({ r }: { r: Recipe }) {
  const f = fichaDe(r);
  const partes: [number, string, string][] = [[f.p, 'P', 'text-macro-prot'], [f.hc, 'HC', 'text-macro-hc'], [f.g, 'G', 'text-macro-grasa']];
  return (
    <span className="flex flex-wrap gap-1">
      {partes.filter(([n]) => n > 0).map(([n, et, color]) => (
        <span key={et} className={`font-mono text-caption px-1.5 rounded-chip bg-raised border border-hairline whitespace-nowrap ${color}`}>
          {et} {Math.round(n)} g
        </span>
      ))}
    </span>
  );
}

const TarjetaReceta = React.memo(function TarjetaReceta({ r, fav, encaja, tardaMucho, verbo, onElegir, onFavorita, ancho }: {
  r: Recipe; fav: boolean; encaja: boolean; tardaMucho: boolean; verbo: string;
  onElegir: (r: Recipe) => void; onFavorita?: (id: string) => void; ancho?: boolean;
  key?: React.Key;
}) {
  const f = fichaDe(r);
  return (
    <div className={`relative flex flex-col rounded-surface bg-surface border border-strong overflow-hidden min-w-0 ${ancho ? 'w-[168px] flex-shrink-0 snap-start' : ''}`}>
      <button type="button" onClick={() => onElegir(r)} className="flex flex-col text-left min-w-0 flex-1 group" aria-label={`${verbo} ${r.name}`}>
        <span className="relative block aspect-square bg-inset">
          <FotoDeReceta
            src={fotoDeReceta(r)}
            alt=""
            className="w-full h-full object-cover"
            fallback={<span className="absolute inset-0 flex items-center justify-center"><Icon name="skillet" size="l" className="text-ink-3" /></span>}
          />
          {encaja && (
            <span className="absolute left-2 bottom-2 flex items-center gap-0.5 px-2 rounded-full bg-surface border border-hairline font-sans text-caption font-bold text-success">
              <Icon name="check" size="s" />Encaja
            </span>
          )}
        </span>
        <span className="flex flex-col gap-1.5 p-3 min-w-0 flex-1">
          <span className="font-sans font-bold text-label text-ink leading-snug line-clamp-2 min-h-[2.5em] group-hover:text-accent-ink transition-colors">{r.name}</span>
          <span className="flex flex-wrap items-center gap-2 font-mono text-caption text-ink-3">
            <span>{f.kcal} kcal</span>
            {f.minutos != null && (
              <span className={`flex items-center gap-0.5 ${tardaMucho ? 'text-warning' : ''}`} title={tardaMucho ? 'Tarda más de lo que sueles tener para cocinar' : undefined}>
                <Icon name="schedule" size="s" />{f.minutos} min
              </span>
            )}
            {r.tupper && <Icon name="takeout_dining" size="s" className="text-data" label="Apta para tupper" />}
          </span>
          <MacrosDeReceta r={r} />
        </span>
      </button>
      {onFavorita && (
        <button
          type="button"
          onClick={() => onFavorita(r.id)}
          aria-pressed={fav}
          aria-label={`${r.name}, favorita`}
          className="absolute top-2 right-2 w-9 h-9 rounded-full bg-veil/50 backdrop-blur-sm flex items-center justify-center"
        >
          <Icon name="favorite" size="m" filled={fav} className={fav ? 'text-on-veil-accent' : 'text-on-veil-2'} />
        </button>
      )}
    </div>
  );
});

const Emoji = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span aria-hidden="true" className={`leading-none ${className}`} style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>{children}</span>
);

const tieneFoto = (r: Recipe) => !!fotoDeReceta(r);

const cuantas = (n: number) => `${n.toLocaleString('es-ES')} ${n === 1 ? 'receta' : 'recetas'}`;

function Titular({ children, onVerTodas, subtitulo }: { children: React.ReactNode; onVerTodas?: () => void; subtitulo?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display font-black text-title-l text-ink tracking-tight text-balance">{children}</h2>
        {onVerTodas && (
          <button type="button" onClick={onVerTodas} className="ml-auto font-sans text-label font-bold text-accent-ink whitespace-nowrap min-h-[44px]">
            Ver todas
          </button>
        )}
      </div>
      {subtitulo && <p className="font-sans text-body-s text-ink-3 -mt-1">{subtitulo}</p>}
    </div>
  );
}

/** Fila que se desliza en horizontal y sangra hasta el borde de la pantalla. */
function Carril({ children, dosFilas }: { children: React.ReactNode; dosFilas?: boolean }) {
  return (
    <div
      className={`-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto hide-scrollbar snap-x snap-mandatory scroll-px-4 pb-1 ${
        dosFilas ? 'grid grid-flow-col grid-rows-2 auto-cols-max gap-3' : 'flex gap-3'
      }`}
    >
      {children}
    </div>
  );
}

function Fila({ fila, resumen, onAbrir }: { fila: FilaDescubrir; resumen: Map<string, ResumenDeColeccion>; onAbrir: (c: Coleccion) => void; key?: React.Key }) {
  const colecciones = fila.colecciones.filter(c => (resumen.get(c.id)?.total ?? 0) > 0);
  if (colecciones.length === 0) return null;
  // `surface`, no `raised`: en modo claro `raised` (#F8F6F2) sobre el fondo
  // (#F8F6F2) no se distingue y la baldosa quedaba como un borde suelto.
  const base = 'snap-start flex-shrink-0 bg-surface border border-strong hover:border-accent/50 transition-colors text-left';
  // Una portada distinta por baldosa: «Desayuno» y «Media mañana» comparten
  // muchas recetas y salían con el mismo plato. Se elige la primera de cada
  // colección que no se parezca a una ya puesta en la fila. No basta con
  // comparar la URL: el recetario repite la MISMA foto con nombres de archivo
  // distintos («Yogur desnatado con miel» y «Yogur griego con miel»), así que
  // se compara el tipo de plato y la primera palabra del nombre.
  const usadas = new Set<string>();
  const parecido = (r: Recipe) => `${fichaDe(r).tipo}:${fichaDe(r).nombre.split(' ')[0]}`;
  const portadaDe = (portadas: Recipe[]) => {
    const p = portadas.find(r => !usadas.has(parecido(r))) ?? portadas[0];
    if (p) usadas.add(parecido(p));
    return p;
  };
  return (
    <section>
      <Titular>{fila.titulo}</Titular>
      <Carril dosFilas={fila.dosFilas}>
        {colecciones.map(c => {
          const { total, portadas } = resumen.get(c.id)!;
          if (fila.forma === 'chip') return (
            <button key={c.id} type="button" onClick={() => onAbrir(c)}
              className={`${base} rounded-surface min-w-[96px] h-24 px-3 flex flex-col items-center justify-center gap-1.5 font-sans text-label text-ink-2 whitespace-nowrap`}>
              <Emoji className="text-display">{c.emoji}</Emoji>{c.titulo}
            </button>
          );
          if (fila.forma === 'baldosa') return (
            <button key={c.id} type="button" onClick={() => onAbrir(c)}
              className={`${base} rounded-surface w-[124px] h-[124px] p-2 flex flex-col items-center justify-center gap-2 text-center`}>
              <Emoji className="text-headline">{c.emoji}</Emoji>
              <span className="font-sans font-bold text-label text-ink truncate max-w-full">{c.titulo}</span>
              <span className="font-mono text-caption text-ink-3 -mt-1.5 tabular-nums">{total.toLocaleString('es-ES')}</span>
            </button>
          );
          if (fila.forma === 'plato') {
            const portada = portadaDe(portadas);
            return (
              <button key={c.id} type="button" onClick={() => onAbrir(c)}
                className={`${base} relative rounded-surface w-[236px] h-[216px] overflow-hidden`}>
                <span className="absolute left-1/2 -top-8 -translate-x-1/2 w-[168px] h-[168px] rounded-full overflow-hidden bg-inset shadow-e2">
                  <FotoDeReceta src={portada ? fotoDeReceta(portada) : undefined} alt="" className="w-full h-full object-cover"
                    fallback={<span className="w-full h-full flex items-center justify-center"><Emoji className="text-hero">{c.emoji}</Emoji></span>} />
                </span>
                <span className="absolute left-4 right-16 bottom-4">
                  <span className="block font-sans font-bold text-title-s text-ink leading-tight">{c.titulo}</span>
                  <span className="block font-mono text-caption text-ink-3 mt-0.5">{cuantas(total)}</span>
                </span>
                <span className="absolute right-4 bottom-4 w-9 h-9 rounded-full bg-ink text-bg flex items-center justify-center">
                  <Icon name="arrow_forward" size="s" />
                </span>
              </button>
            );
          }
          return (
            <button key={c.id} type="button" onClick={() => onAbrir(c)}
              className={`${base} rounded-surface w-[300px] overflow-hidden flex flex-col`}>
              <span className="grid grid-cols-[2fr_1fr] grid-rows-2 gap-[3px] m-2 mb-0 h-[170px] rounded-control overflow-hidden bg-inset">
                {[0, 1, 2].map(k => (
                  <span key={k} className={`block bg-inset ${k === 0 ? 'row-span-2' : ''}`}>
                    {portadas[k] && <FotoDeReceta src={fotoDeReceta(portadas[k])} alt="" className="w-full h-full object-cover" fallback={null} />}
                  </span>
                ))}
              </span>
              <span className="flex flex-col gap-1.5 px-4 pt-4 pb-4 flex-1">
                <span className="font-sans font-bold text-title-m text-ink leading-tight">{c.titulo}</span>
                {c.descripcion && <span className="font-sans text-body-s text-ink-2 line-clamp-2">{c.descripcion}</span>}
                <span className="mt-auto pt-1 font-sans font-bold text-label text-ink">{cuantas(total)}</span>
              </span>
            </button>
          );
        })}
      </Carril>
    </section>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────

export default function RecetarioDescubrir({
  pool, estado, onReintentar, favoritas, onElegir, onFavorita, cupo, filasPersonales = [], excedeTiempo, verbo = 'Abrir',
}: Props) {
  const [pestana, setPestana] = useState<'descubrir' | 'favoritas'>('descubrir');
  const [vista, setVista] = useState<Vista>({ tipo: 'portada' });
  const [filtro, setFiltro] = useState<FiltroLista>('');
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [busqueda, setBusqueda] = useState('');
  const [nevera, setNevera] = useState<string[]>([]);
  const raiz = useRef<HTMLDivElement>(null);

  const resumen = useMemo(() => resumirColecciones(pool, tieneFoto), [pool]);
  const encaja = useMemo(() => {
    if (!cupo) return () => false;
    const c = cupo.cupo;
    return cupo.criterio === 'caber' ? (r: Recipe) => cabeEnLoQueQueda(r, c) : (r: Recipe) => encajaEnCupo(r, c);
  }, [cupo]);
  const encajan = useMemo(() => (cupo ? pool.filter(encaja) : []), [pool, cupo, encaja]);
  const conLoQueTienes = useMemo(() => recetasConLoQueTienes(pool, nevera), [pool, nevera]);
  const termino = busqueda.trim();
  const resultados = useMemo(() => {
    if (!termino) return [];
    const out: Recipe[] = [];
    for (const r of pool) {
      if (coincideBusqueda(`${r.name} ${(r.ingredientsText ?? []).map(i => i.name).join(' ')}`, termino)) out.push(r);
      if (out.length >= MAX_RESULTADOS_BUSQUEDA) break;
    }
    return out;
  }, [pool, termino]);

  // Al cambiar de vista se vuelve arriba de ESTE bloque, no de la ventana: en
  // el selector de «Usar receta» lo que se desplaza es la hoja, no la página.
  const irA = (v: Vista) => {
    setVista(v);
    setFiltro('');
    setVisibles(POR_PAGINA);
    requestAnimationFrame(() => raiz.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  // Si la colección abierta se queda vacía al cambiar el pool (p. ej. se quita
  // «Cabe en mi presupuesto»), no hay que hacer nada: la lista lo dice sola.
  useEffect(() => { setVisibles(POR_PAGINA); }, [filtro]);

  const tarjeta = (r: Recipe, enCarril = false) => (
    <TarjetaReceta
      key={r.id} r={r} fav={favoritas.has(r.id)} encaja={encaja(r)} tardaMucho={!!excedeTiempo?.(r)}
      verbo={verbo} onElegir={onElegir} onFavorita={onFavorita} ancho={enCarril}
    />
  );
  const rejilla = (lista: Recipe[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{lista.map(r => tarjeta(r))}</div>
  );

  if (estado === 'cargando' && pool.length === 0) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-12 w-full rounded-control" />
        <div className="flex gap-3">{[0, 1, 2].map(i => <div key={i}><Skeleton className="h-24 w-24 rounded-surface" /></div>)}</div>
        <div className="flex gap-3">{[0, 1].map(i => <div key={i}><Skeleton className="h-52 w-60 rounded-surface" /></div>)}</div>
      </div>
    );
  }
  if (estado === 'error' && pool.length === 0) {
    return (
      <EmptyState
        icon="cloud_off"
        title="No se pudo cargar el recetario"
        description="Sin él no se pueden enseñar las recetas. Comprueba la conexión y vuelve a intentarlo."
        actionLabel={onReintentar ? 'Reintentar' : undefined}
        onAction={onReintentar}
      />
    );
  }

  // ── Lista de una colección ──────────────────────────────────────────────────
  if (vista.tipo !== 'portada') {
    const personal = vista.tipo === 'personal' ? filasPersonales.find(f => f.id === vista.id) : undefined;
    const col = vista.tipo === 'coleccion' ? coleccionPorId(vista.id) : undefined;
    const titulo = vista.tipo === 'encajan' ? (cupo?.titulo ?? 'Encajan') : personal?.titulo ?? col?.titulo ?? 'Recetas';
    const todas = vista.tipo === 'encajan' ? encajan : personal ? personal.recetas : col ? recetasDeColeccion(col, pool) : [];
    const filtradas = todas.filter(r => {
      const f = fichaDe(r);
      if (filtro === 'rapidas') return f.minutos != null && f.minutos <= 10;
      if (filtro === 'tupper') return r.tupper === true;
      if (filtro === 'proteina') return f.p >= 37.5;
      if (filtro === 'encajan') return encaja(r);
      return true;
    });
    const chips: { id: FiltroLista; texto: string; icono?: string }[] = [
      { id: '', texto: 'Todas' },
      ...(cupo && vista.tipo !== 'encajan' ? [{ id: 'encajan' as const, texto: 'Encajan', icono: 'check_circle' }] : []),
      { id: 'rapidas', texto: '10 min', icono: 'bolt' },
      { id: 'tupper', texto: 'Tupper', icono: 'takeout_dining' },
      { id: 'proteina', texto: 'Más proteína', icono: 'egg' },
    ];
    return (
      <div ref={raiz} className="space-y-3 scroll-mt-4">
        <button type="button" onClick={() => irA({ tipo: 'portada' })}
          className="flex items-center gap-1.5 min-h-[44px] font-sans text-label font-bold text-ink-2 hover:text-accent-ink">
          <Icon name="arrow_back" size="s" />Descubrir
        </button>
        <div>
          <h2 className="font-display font-black text-headline text-ink tracking-tight text-balance">{titulo}</h2>
          <p className="font-sans text-body-s text-ink-3 mt-1">{cuantas(todas.length)}</p>
        </div>
        <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {chips.map(c => (
            <button key={c.id || 'todas'} type="button" onClick={() => setFiltro(c.id)} aria-pressed={filtro === c.id}
              className={`flex-shrink-0 min-h-[36px] px-3.5 rounded-chip border font-sans text-label font-bold flex items-center gap-1.5 transition-colors ${
                filtro === c.id ? 'bg-accent border-accent-press text-on-accent' : 'bg-surface border-strong text-ink-2 hover:text-ink'
              }`}>
              {c.icono && <Icon name={c.icono} size="s" />}{c.texto}
            </button>
          ))}
        </div>
        {filtradas.length === 0 ? (
          <EmptyState icon="search_off" title="Ninguna con ese filtro" description="Quita el filtro para ver el resto." actionLabel="Ver todas" onAction={() => setFiltro('')} />
        ) : (
          <>
            {rejilla(filtradas.slice(0, visibles))}
            {filtradas.length > visibles && (
              <button type="button" onClick={() => setVisibles(v => v + POR_PAGINA)}
                className="w-full min-h-[48px] rounded-control bg-surface border border-strong font-sans text-label font-bold text-ink-2 hover:text-ink">
                Ver {Math.min(POR_PAGINA, filtradas.length - visibles)} más · quedan {(filtradas.length - visibles).toLocaleString('es-ES')}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Portada ─────────────────────────────────────────────────────────────────
  const favoritasDelPool = pool.filter(r => favoritas.has(r.id));
  return (
    <div ref={raiz} className="space-y-8 scroll-mt-4">
      <div className="space-y-3">
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Pollo, avena, tortitas…" label="Buscar receta por plato o ingrediente" />
        {!termino && (
          <SegmentedControl
            label="Qué recetas ver"
            value={pestana}
            onChange={v => setPestana(v as 'descubrir' | 'favoritas')}
            options={[{ value: 'descubrir', label: 'Descubrir' }, { value: 'favoritas', label: `Mis favoritas${favoritasDelPool.length ? ` · ${favoritasDelPool.length}` : ''}` }]}
          />
        )}
      </div>

      {termino ? (
        resultados.length === 0 ? (
          <EmptyState icon="search_off" title={`Nada con «${termino}»`} description="Prueba con un ingrediente: «atún», «avena», «pollo»." />
        ) : (
          <section className="space-y-3">
            <p className="font-sans text-body-s text-ink-3">
              {resultados.length >= MAX_RESULTADOS_BUSQUEDA ? `Las primeras ${MAX_RESULTADOS_BUSQUEDA}` : cuantas(resultados.length)}
            </p>
            {rejilla(resultados.slice(0, visibles))}
            {resultados.length > visibles && (
              <button type="button" onClick={() => setVisibles(v => v + POR_PAGINA)}
                className="w-full min-h-[48px] rounded-control bg-surface border border-strong font-sans text-label font-bold text-ink-2 hover:text-ink">
                Ver más
              </button>
            )}
          </section>
        )
      ) : pestana === 'favoritas' ? (
        favoritasDelPool.length === 0 ? (
          <EmptyState icon="favorite" title="Aún no tienes favoritas" description="Toca el corazón de cualquier receta y la tendrás aquí a mano." />
        ) : rejilla(favoritasDelPool)
      ) : (
        <>
          {cupo && encajan.length > 0 && (
            <section>
              <Titular onVerTodas={() => irA({ tipo: 'encajan' })}
                subtitulo={`${cuantas(encajan.length)} ${cupo.criterio === 'caber' ? 'que caben en' : 'de unas'} ${Math.round(cupo.cupo.kcal)} kcal`}>
                {cupo.titulo}
              </Titular>
              <Carril>{encajan.slice(0, EN_FILA).map(r => tarjeta(r, true))}</Carril>
            </section>
          )}

          {filasPersonales.filter(f => f.recetas.length > 0).map(f => (
            <section key={f.id}>
              <Titular onVerTodas={f.recetas.length > EN_FILA ? () => irA({ tipo: 'personal', id: f.id }) : undefined} subtitulo={f.subtitulo}>
                <span className="inline-flex items-center gap-2"><Icon name={f.icono} size="m" className="text-accent-ink" />{f.titulo}</span>
              </Titular>
              <Carril>{f.recetas.slice(0, EN_FILA).map(r => tarjeta(r, true))}</Carril>
            </section>
          ))}

          {FILAS_DESCUBRIR.slice(0, 1).map(fila => <Fila key={fila.id} fila={fila} resumen={resumen} onAbrir={c => irA({ tipo: 'coleccion', id: c.id })} />)}

          {/* ¿Qué tienes en la nevera? Marcas lo que hay y salen las recetas que
              lo usan todo, primero las que menos te obligan a comprar. */}
          <section>
            <Titular subtitulo="Marca lo que tienes y te decimos qué hacer con ello.">¿Qué tienes en la nevera?</Titular>
            <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto hide-scrollbar pb-1">
              {NEVERA.map(i => {
                const on = nevera.includes(i.id);
                return (
                  <button key={i.id} type="button" aria-pressed={on}
                    onClick={() => setNevera(n => on ? n.filter(x => x !== i.id) : [...n, i.id])}
                    className={`flex-shrink-0 min-h-[40px] pl-2.5 pr-3.5 rounded-full border font-sans text-label font-bold flex items-center gap-1.5 transition-colors ${
                      on ? 'bg-accent border-accent-press text-on-accent' : 'bg-surface border-strong text-ink-2 hover:text-ink'
                    }`}>
                    <Emoji className="text-title-m">{i.emoji}</Emoji>{i.etiqueta}
                  </button>
                );
              })}
            </div>
            {nevera.length > 0 && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <p className="font-sans text-body-s text-ink-2 flex-1">
                    {conLoQueTienes.length === 0
                      ? 'Ninguna receta lleva todo eso junto. Quita algún ingrediente.'
                      : `${cuantas(conLoQueTienes.length)} con ${NEVERA.filter(i => nevera.includes(i.id)).map(i => i.etiqueta.toLowerCase()).join(' + ')}`}
                  </p>
                  <button type="button" onClick={() => setNevera([])} className="font-sans text-label font-bold text-ink-3 hover:text-ink min-h-[44px]">Borrar</button>
                </div>
                {conLoQueTienes.length > 0 && <Carril>{conLoQueTienes.slice(0, 20).map(r => tarjeta(r, true))}</Carril>}
              </div>
            )}
          </section>

          {FILAS_DESCUBRIR.slice(1).map(fila => <Fila key={fila.id} fila={fila} resumen={resumen} onAbrir={c => irA({ tipo: 'coleccion', id: c.id })} />)}
        </>
      )}
    </div>
  );
}

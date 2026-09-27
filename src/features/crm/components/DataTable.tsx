import React, { useMemo, useState } from 'react';
import ErrorState from './ErrorState';
import { Icon, Skeleton } from '../../../components/ui';
import { useScrollEdgeMask } from '../../../components/ui/internal/useScrollEdgeMask';
import { ordenarFilas, Direccion, ValorOrdenable } from '../lib/orden';

export interface Columna<T> {
  id: string;
  header: string;
  /** Ancho de la columna. Sin valor, reparte el espacio restante. */
  width?: string;
  align?: 'left' | 'right';
  render: (fila: T) => React.ReactNode;
  /**
   * Con esto, la cabecera de la columna se vuelve un botón que ordena la
   * tabla por lo que devuelva. Sin esto, la cabecera es texto y la columna no
   * se ordena — así cada tabla decide por cuáles tiene sentido, en vez de
   * ofrecer ordenar por la columna de botones.
   *
   * Devuelve lo que se COMPARA, no lo que se pinta: para fechas, el ISO
   * 'YYYY-MM-DD' (que ordena bien como texto); para dinero, los céntimos.
   * `null`/`undefined` es «esta fila no tiene ese dato» y cae siempre al
   * final, suba o baje el orden: un pago sin fecha de cobro no es el más
   * antiguo del mundo.
   */
  sortValue?: (fila: T) => ValorOrdenable;
}

interface Orden { id: string; dir: Direccion }

interface Props<T> {
  columnas: Columna<T>[];
  filas: T[];
  keyOf: (fila: T) => string;
  onRowClick?: (fila: T) => void;
  vacio?: React.ReactNode;
  cargando?: boolean;
  /**
   * true si la query que alimenta `filas` falló. SIN esto, una query fallida
   * (cuota de Firestore agotada, sin red...) deja `cargando` en su último
   * valor y la tabla se queda en el skeleton para siempre — TanStack Query no
   * sale de `isPending` sola, hay que leer `isError` en algún sitio.
   * Encontrado en vivo el 2026-08-02 con la cuota diaria de lecturas agotada.
   */
  error?: boolean;
}

// Tabla densa. Dos decisiones que no son cosméticas:
//
// 1. Si hay `onRowClick`, la fila es un <tr> con role="button", tabIndex y
//    manejador de Enter/Espacio. Una fila clicable que solo responde al ratón
//    es inaccesible por teclado, y aquí el coach navega rápido.
// 2. La tabla va dentro de un contenedor con overflow-x propio: en móvil la
//    tabla scrollea, la página no.
export default function DataTable<T>({
  columnas, filas, keyOf, onRowClick, vacio, cargando, error,
}: Props<T>) {
  // Sin orden elegido, las filas salen COMO LLEGAN: la pantalla que las trae
  // ya las ordena con criterio (lo pendiente primero, lo reciente arriba...)
  // y estrenar aquí un orden por defecto se lo pisaría.
  const [orden, setOrden] = useState<Orden | null>(null);

  const ordenada = useMemo(() => {
    if (!orden) return filas;
    const col = columnas.find(c => c.id === orden.id);
    if (!col?.sortValue) return filas;
    return ordenarFilas(filas, col.sortValue, orden.dir);
  }, [filas, columnas, orden]);

  // Primer clic: de mayor a menor. Una tabla de pagos o de reuniones se mira
  // por lo último, no por lo primero de 2024.
  const ordenarPor = (id: string) =>
    setOrden(prev => (prev?.id === id
      ? { id, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { id, dir: 'desc' }));

  if (error) return <ErrorState />;

  if (cargando) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <React.Fragment key={i}><Skeleton className="h-11 w-full" /></React.Fragment>
        ))}
      </div>
    );
  }

  if (filas.length === 0) return <>{vacio}</>;

  return (
    <ScrollBody
      columnas={columnas}
      filas={ordenada}
      keyOf={keyOf}
      onRowClick={onRowClick}
      orden={orden}
      onOrdenar={ordenarPor}
    />
  );
}

interface ScrollBodyProps<T> extends Pick<Props<T>, 'columnas' | 'filas' | 'keyOf' | 'onRowClick'> {
  orden: Orden | null;
  onOrdenar: (id: string) => void;
}

function ScrollBody<T>({ columnas, filas, keyOf, onRowClick, orden, onOrdenar }: ScrollBodyProps<T>) {
  const { ref: scrollRef, maskImage } = useScrollEdgeMask<HTMLDivElement>([filas, columnas]);

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto custom-scrollbar"
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
    >
      <table className="w-full border-collapse min-w-[640px]">
        <thead>
          <tr className="group border-b border-hairline">
            {columnas.map(c => {
              const ordenable = Boolean(c.sortValue);
              const activa = orden?.id === c.id;
              return (
                <th
                  key={c.id}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={activa ? (orden!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`px-3 py-2 font-mono text-caption uppercase tracking-widest font-normal ${
                    activa ? 'text-ink' : 'text-ink-3'
                  } ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {ordenable ? (
                    <button
                      type="button"
                      onClick={() => onOrdenar(c.id)}
                      className={`inline-flex items-center gap-0.5 uppercase tracking-widest hover:text-ink transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 rounded-control ${
                        c.align === 'right' ? 'flex-row-reverse' : ''
                      }`}
                    >
                      {c.header}
                      <Icon
                        name={activa && orden!.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        size="s"
                        className={activa ? 'text-accent-ink' : 'text-ink-4 opacity-0 group-hover:opacity-100'}
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filas.map(fila => {
            const clicable = Boolean(onRowClick);
            return (
              <tr
                key={keyOf(fila)}
                {...(clicable
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => onRowClick!(fila),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick!(fila);
                        }
                      },
                    }
                  : {})}
                className={`border-b border-hairline ${
                  clicable
                    ? 'cursor-pointer hover:bg-hairline focus:bg-hairline focus:outline-none focus:ring-1 focus:ring-inset focus:ring-accent/40'
                    : ''
                }`}
              >
                {columnas.map(c => (
                  <td
                    key={c.id}
                    className={`px-3 py-3 font-sans text-caption text-ink align-middle ${
                      c.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                    }`}
                  >
                    {c.render(fila)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

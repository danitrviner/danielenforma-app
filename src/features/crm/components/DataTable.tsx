import React from 'react';

export interface Columna<T> {
  id: string;
  header: string;
  /** Ancho de la columna. Sin valor, reparte el espacio restante. */
  width?: string;
  align?: 'left' | 'right';
  render: (fila: T) => React.ReactNode;
}

interface Props<T> {
  columnas: Columna<T>[];
  filas: T[];
  keyOf: (fila: T) => string;
  onRowClick?: (fila: T) => void;
  vacio?: React.ReactNode;
  cargando?: boolean;
}

// Tabla densa. Dos decisiones que no son cosméticas:
//
// 1. Si hay `onRowClick`, la fila es un <tr> con role="button", tabIndex y
//    manejador de Enter/Espacio. Una fila clicable que solo responde al ratón
//    es inaccesible por teclado, y aquí el coach navega rápido.
// 2. La tabla va dentro de un contenedor con overflow-x propio: en móvil la
//    tabla scrollea, la página no.
export default function DataTable<T>({
  columnas, filas, keyOf, onRowClick, vacio, cargando,
}: Props<T>) {
  if (cargando) {
    return (
      <div className="space-y-1.5 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-11 rounded-lg bg-white/4 animate-pulse" />
        ))}
      </div>
    );
  }

  if (filas.length === 0) return <>{vacio}</>;

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full border-collapse min-w-[640px]">
        <thead>
          <tr className="border-b border-white/7">
            {columnas.map(c => (
              <th
                key={c.id}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={`px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-[#555550] font-normal ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {c.header}
              </th>
            ))}
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
                className={`border-b border-white/4 ${
                  clicable
                    ? 'cursor-pointer hover:bg-white/4 focus:bg-white/6 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[#fbcb1a]/40'
                    : ''
                }`}
              >
                {columnas.map(c => (
                  <td
                    key={c.id}
                    className={`px-3 py-2.5 font-sans text-[11px] text-[#f5f5f0] align-middle ${
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

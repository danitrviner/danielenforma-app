import React, { useEffect, useState } from 'react';
import {
  COMIDAS, COMIDAS_POR_TIPO_DEFECTO, NOMBRE_DE_TIPO, TIPOS_CON_REGLA, cambiosSobreDefecto,
  type TablaDeComidas as Tabla, type TipoParaComidas,
} from '../../utils/comidasPorTipo';
import { Button } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Biblioteca › Recetas › Qué va en cada comida (11-2026)

   La tabla tipo de plato × comida (utils/comidasPorTipo.ts). El borrador es
   local: nada se guarda hasta «Guardar». Una fila por tipo de plato y una
   casilla por comida (Dani eligió la rejilla frente a una tarjeta por comida).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  /** La tabla que manda ahora (lo recomendado con los cambios guardados). */
  valor: Tabla;
  /** Recetas del recetario de cada tipo, para que se vea cuánto pesa cada fila. */
  recuentos: Partial<Record<TipoParaComidas, number>>;
  guardando: boolean;
  onGuardar: (tabla: Tabla) => void;
}

const nombre = (t: TipoParaComidas) => NOMBRE_DE_TIPO[t] ?? t;
const iguales = (a: Tabla, b: Tabla) => TIPOS_CON_REGLA.every(t => (a[t] ?? []).join() === (b[t] ?? []).join());

export default function TablaDeComidas({ valor, recuentos, guardando, onGuardar }: Props) {
  const [borrador, setBorrador] = useState<Tabla>(valor);
  const huella = TIPOS_CON_REGLA.map(t => (valor[t] ?? []).join()).join('|');
  useEffect(() => { setBorrador(valor); }, [huella]); // eslint-disable-line react-hooks/exhaustive-deps

  const sucio = !iguales(borrador, valor);
  const esLoRecomendado = Object.keys(cambiosSobreDefecto(borrador)).length === 0;
  const [aviso, setAviso] = useState<string | null>(null);

  const alternar = (tipo: TipoParaComidas, comida: number) => setBorrador(prev => {
    const actuales = prev[tipo] ?? [];
    const nuevas = actuales.includes(comida) ? actuales.filter(x => x !== comida) : [...actuales, comida].sort((a, b) => a - b);
    // Sin ninguna comida, el generador la daría por válida para todas.
    if (nuevas.length === 0) { setAviso(`«${nombre(tipo)}» tiene que valer al menos para una comida.`); return prev; }
    setAviso(null);
    return { ...prev, [tipo]: nuevas };
  });

  return (
    <div className="space-y-3">
      <p className="font-sans text-label text-ink-2">
        Manda en el generador de menús, en los cambios de comida y en el recetario de todos los atletas. Lo que marques
        en una receta concreta («Para qué comidas») gana a esta tabla.
      </p>

        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <table className="w-full min-w-[340px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className="text-left font-mono text-caption text-ink-3 font-normal pb-2">Tipo de plato</th>
                {COMIDAS.map(c => (
                  <th key={c.id} scope="col" className="font-mono text-caption text-ink-3 font-normal pb-2 px-0.5 text-center">
                    <span className="sm:hidden">{c.corto}</span>
                    <span className="hidden sm:inline">{c.nombre}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIPOS_CON_REGLA.map(tipo => {
                const cambiada = (borrador[tipo] ?? []).join() !== (COMIDAS_POR_TIPO_DEFECTO[tipo] ?? []).join();
                return (
                  <tr key={tipo} className="border-t border-hairline">
                    <th scope="row" className="text-left py-1.5 pr-2 font-normal">
                      <span className="block font-sans text-label text-ink leading-tight">
                        {nombre(tipo)}{cambiada && <span className="text-accent-ink"> ·</span>}
                      </span>
                      <span className="block font-mono text-caption text-ink-3">{(recuentos[tipo] ?? 0).toLocaleString('es-ES')} recetas</span>
                    </th>
                    {COMIDAS.map(c => {
                      const on = (borrador[tipo] ?? []).includes(c.id);
                      return (
                        <td key={c.id} className="text-center px-0.5">
                          <button
                            type="button"
                            onClick={() => alternar(tipo, c.id)}
                            aria-pressed={on}
                            aria-label={`${nombre(tipo)} en ${c.nombre}`}
                            className={`w-11 h-11 rounded-control border inline-flex items-center justify-center font-mono text-caption transition-colors ${
                              on ? 'bg-accent text-on-accent border-accent' : 'border-hairline text-ink-3 hover:border-strong'
                            }`}
                          >{on ? '✓' : ''}</button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      {aviso && <p role="status" className="font-sans text-label text-warning">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-hairline">
        <Button size="s" onClick={() => onGuardar(borrador)} disabled={!sucio || guardando} loading={guardando}>Guardar</Button>
        {sucio && <Button size="s" variant="ghost" onClick={() => setBorrador(valor)}>Descartar cambios</Button>}
        {!esLoRecomendado && (
          <Button size="s" variant="ghost" className="ml-auto" onClick={() => setBorrador({ ...COMIDAS_POR_TIPO_DEFECTO })}>
            Volver a lo recomendado
          </Button>
        )}
      </div>
    </div>
  );
}

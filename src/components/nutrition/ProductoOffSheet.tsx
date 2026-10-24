import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, Button, Input, Banner } from '../ui';
import { getProductoOff, ATRIBUCION_OFF } from '../../services/openFoodFacts';
import { extrasDeRacion, esIncompleto, motivoDeIncompleto, type EntradaIndiceOff, type OffProducto } from '../../utils/productoOff';
import { itemsDeProducto, nutrientesDeRacion } from '../../utils/productoAIntercambios';
import { MICRO_META, MICRO_KEYS } from '../../data/micronutrients';
import { fmtQty } from '../../utils/exchangeHelpers';

/* ═══════════════════════════════════════════════════════════════════════════
   Ficha de un producto de supermercado (D-04)

   Sale del buscador por nombre (y del escáner). Pide los gramos, enseña lo que
   aporta la ración y, en el modo Intercambios, su equivalencia. Lo que el
   producto no declara se dice («no declarado»): no se inventa ni se pone a 0.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  entrada: EntradaIndiceOff;
  /** Cómo está viendo el día el atleta: decide si se enseña la equivalencia en intercambios. */
  vista: 'intercambios' | 'macros';
  /** Producto ya conocido (alimento del catálogo, N-04): no se descarga nada. */
  producto?: OffProducto;
  /** Pie de la ficha. Por defecto, la atribución de Open Food Facts. */
  nota?: string;
  /** Gramos de la última vez que lo apuntó: la ficha abre con ellos en vez de la ración. */
  gramosIniciales?: number;
  onConfirm: (producto: OffProducto, gramos: number) => void;
  onClose: () => void;
};

const ABREV = { HC: 'HC', PROT: 'P', GRASA: 'G' } as const;

export default function ProductoOffSheet({ entrada, vista, producto: conocido, nota, gramosIniciales, onConfirm, onClose }: Props) {
  const consulta = useQuery({
    queryKey: ['offProducto', entrada.c],
    queryFn: () => getProductoOff(entrada.c),
    staleTime: Infinity,
    enabled: !conocido,
  });
  const registro = conocido ?? consulta.data;
  const isPending = !conocido && consulta.isPending;
  const isError = !conocido && consulta.isError;
  // Un incompleto no se apunta nunca (no sumaría y el día parecería completo):
  // aquí solo llega por una vía inesperada y se explica.
  const producto = registro && !esIncompleto(registro) ? registro : undefined;
  const [texto, setTexto] = useState<string | null>(null);
  const gramos = parseFloat((texto ?? String(gramosIniciales ?? producto?.s ?? 100)).replace(',', '.'));
  const valido = Number.isFinite(gramos) && gramos > 0 && gramos <= 5000;

  const calculo = useMemo(() => {
    if (!producto || !valido) return null;
    const porCien = { kcal: producto.k, p: producto.p, hc: producto.h, g: producto.g };
    const n = nutrientesDeRacion(porCien, gramos);
    const r = itemsDeProducto({ nombre: producto.n, gramos, lineaId: 'previo', origen: { tipo: 'off', codigo: producto.c }, porCien });
    const equiv = r.items
      .filter(i => i.category === 'HC' || i.category === 'PROT' || i.category === 'GRASA')
      .map(i => `${fmtQty(i.quantity)} ${ABREV[i.category as 'HC' | 'PROT' | 'GRASA']}`)
      .join(' + ');
    return { n, equiv, extras: extrasDeRacion(producto, gramos) };
  }, [producto, gramos, valido]);

  const micros = calculo?.extras?.m ?? {};
  const microsDeclarados = MICRO_KEYS.filter(k => micros[k] !== undefined);

  return (
    <Sheet
      open
      onClose={onClose}
      title={entrada.n}
      alto="completo"
      footer={(
        <Button fullWidth disabled={!producto || !valido || !calculo?.n} onClick={() => producto && valido && onConfirm(producto, gramos)}>
          Añadir
        </Button>
      )}
    >
      <div className="space-y-4 pt-2">
        {(entrada.b || producto?.q) && <p className="font-sans text-body-s text-ink-2">{[entrada.b, producto?.q].filter(Boolean).join(' · ')}</p>}

        {isPending && <p className="font-sans text-body-s text-ink-3">Cargando producto…</p>}
        {registro && esIncompleto(registro) && <Banner tone="info">{motivoDeIncompleto(registro)} Complétalo desde la etiqueta para poder apuntarlo.</Banner>}
        {(isError || (!isPending && !registro)) && (
          <Banner tone="danger">No se han podido cargar los datos de este producto. Comprueba la conexión o créalo desde su etiqueta.</Banner>
        )}

        {producto && (
          <>
            <Input
              label={producto.s ? `Cantidad (g) · ración: ${producto.s} g` : 'Cantidad (g)'}
              value={texto ?? String(gramosIniciales ?? producto.s ?? 100)}
              onChange={setTexto}
              inputMode="decimal"
            />

            <div className="rounded-surface border border-hairline bg-surface p-4">
              {calculo?.n ? (
                <>
                  <p className="font-mono text-display text-ink">{calculo.n.kcal} kcal</p>
                  <dl className="grid grid-cols-3 gap-2 pt-3">
                    {([['Proteína', calculo.n.p], ['Hidratos', calculo.n.hc], ['Grasa', calculo.n.g]] as const).map(([nombre, v]) => (
                      <div key={nombre} className="rounded-control bg-raised p-2 text-center">
                        <dt className="font-sans text-caption text-ink-3">{nombre}</dt>
                        <dd className="font-mono text-title-s text-ink">{v} g</dd>
                      </div>
                    ))}
                  </dl>
                  {vista === 'intercambios' && (
                    <p className="pt-3 font-sans text-body-s text-ink-2">
                      En intercambios: <span className="font-mono font-bold text-accent-ink">{calculo.equiv ? `≈ ${calculo.equiv}` : 'menos de ¼ de intercambio'}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="font-sans text-body-s text-ink-3">Escribe los gramos para ver lo que aporta.</p>
              )}
            </div>

            {calculo?.n && (
              <div className="rounded-surface border border-hairline bg-surface p-4">
                <p className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">Más nutrientes</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 font-sans text-body-s">
                  {([['Fibra', calculo.extras?.f, 'g'], ['Azúcares', calculo.extras?.az, 'g'], ['Grasa saturada', calculo.extras?.sat, 'g'], ['Sal', calculo.extras?.sal, 'g']] as const).map(([nombre, v, u]) => (
                    <div key={nombre} className="flex justify-between gap-2">
                      <dt className="text-ink-2">{nombre}</dt>
                      <dd className="font-mono text-ink">{v === undefined ? <span className="text-ink-3">no declarado</span> : `${v} ${u}`}</dd>
                    </div>
                  ))}
                  {microsDeclarados.map(k => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-ink-2">{MICRO_META[k].label}</dt>
                      <dd className="font-mono text-ink">{micros[k]} {MICRO_META[k].unit}</dd>
                    </div>
                  ))}
                </dl>
                {microsDeclarados.length === 0 && (
                  <p className="pt-2 font-sans text-caption text-ink-3">Vitaminas y minerales: no declarados en este producto.</p>
                )}
              </div>
            )}
          </>
        )}

        <p className="font-sans text-caption text-ink-3">{nota ?? `${ATRIBUCION_OFF}. Son datos de la comunidad: compáralos con la etiqueta.`}</p>
      </div>
    </Sheet>
  );
}

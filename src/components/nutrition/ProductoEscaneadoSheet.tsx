import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, Button, Banner } from '../ui';
import ProductoOffSheet from './ProductoOffSheet';
import { buscarProductoPorCodigo, ATRIBUCION_OFF } from '../../services/openFoodFacts';
import { esIncompleto, motivoDeIncompleto, type OffProducto } from '../../utils/productoOff';

/* Resuelve un código leído (o escrito) contra la copia local y abre la ficha
   del producto. Tres desenlaces:
     · completo → ficha para apuntarlo;
     · incompleto (Open Food Facts lo conoce, pero sin datos utilizables) → se
       dice qué falta y solo se ofrece completarlo desde la etiqueta; nunca se
       apunta sin cifras, porque no sumaría y el día parecería completo;
     · ausente → buscarlo por nombre o crearlo desde la etiqueta. */

type Props = {
  codigo: string;
  vista: 'intercambios' | 'macros';
  onConfirm: (producto: OffProducto, gramos: number) => void;
  onBuscarPorNombre: () => void;
  /** `nombre` viene relleno cuando el producto se conoce pero está incompleto. */
  onCrearDesdeEtiqueta: (inicial: { nombre?: string; codigo: string }) => void;
  onClose: () => void;
  /** En «Calorías y macros» el producto encontrado se abre en la ficha del Diario. */
  fichaCalorias?: (producto: OffProducto) => React.ReactNode;
};

export default function ProductoEscaneadoSheet({ codigo, vista, onConfirm, onBuscarPorNombre, onCrearDesdeEtiqueta, onClose, fichaCalorias }: Props) {
  const { data: registro, isPending, isError } = useQuery({
    queryKey: ['offPorCodigo', codigo],
    queryFn: () => buscarProductoPorCodigo(codigo),
    staleTime: Infinity,
  });

  if (registro && !esIncompleto(registro)) {
    if (fichaCalorias) return <>{fichaCalorias(registro)}</>;
    return (
      <ProductoOffSheet
        entrada={{ c: registro.c, n: registro.n, b: registro.b, t: '' }}
        vista={vista}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
  }

  const incompleto = registro && esIncompleto(registro) ? registro : null;
  const nombre = incompleto ? [incompleto.n, incompleto.b].filter(Boolean).join(' · ') : null;

  return (
    <Sheet open onClose={onClose} title={incompleto ? incompleto.n : 'Producto escaneado'}>
      <div className="space-y-4 pt-2">
        {isPending ? (
          <p className="font-sans text-body-s text-ink-3">Buscando el código {codigo}…</p>
        ) : incompleto ? (
          <>
            {nombre && <p className="font-sans text-body-s text-ink-2">{nombre}{incompleto.q ? ` · ${incompleto.q}` : ''}</p>}
            <Banner tone="info">
              Este producto no trae sus nutrientes completos. {motivoDeIncompleto(incompleto)} No se apunta con datos a medias: complétalo con la etiqueta del envase.
            </Banner>
            <Button fullWidth onClick={() => onCrearDesdeEtiqueta({ nombre: incompleto.n, codigo: incompleto.c })}>Completar desde la etiqueta</Button>
          </>
        ) : (
          <>
            <p className="font-sans text-body-s text-ink">
              {isError ? 'No se ha podido consultar la base de productos.' : 'No tenemos este producto todavía.'}
            </p>
            <p className="font-mono text-caption text-ink-3">{codigo}</p>
            <div className="space-y-2">
              <Button fullWidth variant="secondary" onClick={onBuscarPorNombre}>Buscar por nombre</Button>
              <Button fullWidth onClick={() => onCrearDesdeEtiqueta({ codigo })}>Crear desde la etiqueta</Button>
            </div>
          </>
        )}
        <p className="font-sans text-caption text-ink-3">{ATRIBUCION_OFF}</p>
      </div>
    </Sheet>
  );
}

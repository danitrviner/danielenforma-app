import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, Icon, ListRow, SearchField, Skeleton } from '../../components/ui';
import { MARCA_LABELS, MUSCLE_LABELS } from '../../types';
import type { Maquina, MaquinaPropia } from '../../types';
import { getEstadoCatalogo, guardarGimnasio, deleteMaquinaPropia } from '../../dbService';
import { useToast } from '../../hooks/useToast';
import AddOwnMachineSheet from './AddOwnMachineSheet';
import CatalogoSwipe from './CatalogoSwipe';

/* ═══════════════════════════════════════════════════════════════════════════
   Mi gimnasio — pantalla 06 del handoff. Vive en Perfil.

   Es la gestión posterior al onboarding: qué máquinas tengo, quitar una que ya
   no está, añadir la que falta y —si el catálogo quedó a medias o ha crecido con
   una marca nueva— retomar el repaso.

   Reutiliza CatalogoSwipe tal cual para el repaso pendiente, sin `onOmitir`:
   desde aquí cerrar es simplemente salir, no hay tarea que recordar.
   ═══════════════════════════════════════════════════════════════════════════ */

export const gimnasioQueryKey = (email: string) => ['gimnasio', email];

type Props = {
  email: string;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip). */
  key?: React.Key;
};

export default function MiGimnasioPanel({ email }: Props) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [anadiendo, setAnadiendo] = useState(false);
  const [repasando, setRepasando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: gimnasioQueryKey(email),
    queryFn: () => getEstadoCatalogo(email),
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: gimnasioQueryKey(email) });

  const misMaquinas = useMemo<Maquina[]>(() => {
    if (!data) return [];
    const tiene = new Set(data.gimnasio.maquinas.filter(d => d.tengo).map(d => d.maquinaId));
    return data.catalogo.filter(m => tiene.has(m.id));
  }, [data]);

  const propias: MaquinaPropia[] = data?.gimnasio.maquinasPropias ?? [];
  const pendientes = data?.pendientes.length ?? 0;

  const filtro = busqueda.trim().toLowerCase();
  const coincide = (texto: string) => !filtro || texto.toLowerCase().includes(filtro);
  const catalogoVisible = misMaquinas.filter(m => coincide(`${m.nombreMostrado} ${MARCA_LABELS[m.marca] ?? m.marca}`));
  const propiasVisibles = propias.filter(p => coincide(p.nombre));

  /** Quitar una máquina del catálogo = marcarla como "no la tengo", no borrar la decisión. */
  const quitarDelCatalogo = async (maquina: Maquina) => {
    if (!data) return;
    const maquinas = data.gimnasio.maquinas.map(d =>
      d.maquinaId === maquina.id ? { ...d, tengo: false, decididoEn: new Date().toISOString() } : d
    );
    await guardarGimnasio(email, { maquinas });
    showToast(`${maquina.nombreMostrado} quitada de tu gimnasio`, 'info');
    refrescar();
  };

  const quitarPropia = async (propia: MaquinaPropia) => {
    await deleteMaquinaPropia(email, propia.id);
    showToast(`${propia.nombre} eliminada`, 'info');
    refrescar();
  };

  if (repasando) {
    return (
      <CatalogoSwipe
        email={email}
        onCompletado={() => { setRepasando(false); refrescar(); }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="bg-surface border border-hairline rounded-surface p-5">
        <div className="space-y-2" aria-label="Cargando tu gimnasio">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  const total = catalogoVisible.length + propiasVisibles.length;

  return (
    <Card
      title="Mi gimnasio"
      subtitle={`${misMaquinas.length + propias.length} máquinas${pendientes > 0 ? ` · ${pendientes} sin revisar` : ''}`}
    >
      {/* Un catálogo a medias o una marca nueva importada dejan máquinas sin
          decidir. Se ofrece retomar aquí, que es donde el atleta va a buscarlo. */}
      {pendientes > 0 && (
        <div className="rounded-surface border border-accent-line bg-accent-bg/40 p-4 flex flex-col gap-3">
          <p className="font-sans text-body-s text-ink">
            Te quedan <strong>{pendientes}</strong> máquinas por revisar.
          </p>
          <Button variant="primary" size="m" onClick={() => setRepasando(true)}>Seguir revisando</Button>
        </div>
      )}

      {(misMaquinas.length + propias.length) > 6 && (
        <SearchField value={busqueda} onChange={setBusqueda} label="Buscar máquina" placeholder="Buscar máquina" />
      )}

      <ul className="flex flex-col divide-y divide-hairline">
        {catalogoVisible.map(m => (
          <ListRow
            key={m.id}
            as="li"
            leading={<img src={m.fotoUrl} alt="" className="w-12 h-12 rounded-control object-contain bg-white flex-shrink-0" loading="lazy" />}
            title={m.nombreMostrado}
            subtitle={`${MARCA_LABELS[m.marca] ?? m.marca} · ${MUSCLE_LABELS[m.categoria]}`}
            trailing={
              <Button
                variant="ghost"
                size="s"
                icon="delete"
                label={`Quitar ${m.nombreMostrado} de mi gimnasio`}
                onClick={() => quitarDelCatalogo(m)}
                className="text-danger flex-shrink-0"
              />
            }
          />
        ))}

        {propiasVisibles.map(p => (
          <ListRow
            key={p.id}
            as="li"
            leading={<img src={p.fotoUrl} alt="" className="w-12 h-12 rounded-control object-cover flex-shrink-0" loading="lazy" />}
            title={p.nombre}
            subtitle="Añadida por ti"
            trailing={
              <Button
                variant="ghost"
                size="s"
                icon="delete"
                label={`Eliminar ${p.nombre}`}
                onClick={() => quitarPropia(p)}
                className="text-danger flex-shrink-0"
              />
            }
          />
        ))}
      </ul>

      {total === 0 && (
        <EmptyState
          icon={filtro ? 'search_off' : 'fitness_center'}
          title={filtro ? 'Sin resultados' : 'Todavía no hay máquinas'}
          description={filtro ? 'Ninguna máquina coincide con esa búsqueda.' : 'Todavía no has marcado ninguna máquina como disponible.'}
        />
      )}

      <Button variant="secondary" size="m" icon="add" fullWidth onClick={() => setAnadiendo(true)}>
        Añadir máquina que falta
      </Button>

      <AddOwnMachineSheet
        open={anadiendo}
        onClose={() => setAnadiendo(false)}
        email={email}
        onAnadida={refrescar}
      />

      <p className="flex items-start gap-2 font-sans text-caption text-ink-5">
        <Icon name="info" size="s" className="mt-1" />
        Dani usa esto para montarte el plan con lo que de verdad tienes a mano.
      </p>
    </Card>
  );
}

import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Chip, EmptyState, Icon, Input, ListRow, SearchField, Select, Sheet, Skeleton } from '../../components/ui';
import { MARCA_LABELS, MUSCLE_LABELS } from '../../types';
import type { Maquina, MuscleGroup } from '../../types';
import {
  getCatalogoMaquinasAdmin, upsertOverrideMaquina, publicarMaquina,
  ocultarMaquina, crearMaquinaAdmin, subirImagenMaquina,
} from '../../dbService';
import { useToast } from '../../hooks/useToast';
import { ORDEN_CATEGORIAS } from './useCatalogoSwipe';

/* ═══════════════════════════════════════════════════════════════════════════
   Catálogo administrable — pantalla 09 del handoff.

   Vive como pestaña de Perfil › Ajustes, condicionada por `isOwnerOrDev`, que es
   el único patrón de admin que existe en este repo (no hay rol 'admin' ni
   routing propio; ver docs/catalogo-maquinas.md).

   Lo que hace: revisar lo importado antes de publicarlo, ocultar, renombrar,
   cambiar la imagen y añadir máquinas a mano. Lo primero es lo importante: el
   importador escribe SIEMPRE `publicadoEn: null`, así que nada de lo scrapeado
   llega a un atleta sin que una persona lo haya mirado.
   ═══════════════════════════════════════════════════════════════════════════ */

const catalogoAdminKey = ['maquinasAdmin'] as const;

type Filtro = 'pendientes' | 'todas' | string;

export default function AdminMaquinasTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Maquina | null>(null);
  const [creando, setCreando] = useState(false);
  const [publicandoTodo, setPublicandoTodo] = useState(false);

  const { data: catalogo = [], isLoading } = useQuery({
    queryKey: catalogoAdminKey,
    queryFn: getCatalogoMaquinasAdmin,
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: catalogoAdminKey });
    // El catálogo del atleta se deriva de lo mismo: si no se invalida, el
    // coach publica y no lo ve nadie hasta recargar.
    qc.invalidateQueries({ queryKey: ['gimnasio'] });
  };

  const pendientes = useMemo(() => catalogo.filter(m => !m.publicadoEn), [catalogo]);
  const marcas = useMemo(
    () => [...new Set(catalogo.map(m => String(m.marca)))].sort(),
    [catalogo]
  );

  const visibles = useMemo(() => {
    const f = busqueda.trim().toLowerCase();
    return catalogo
      .filter(m => (filtro === 'pendientes' ? !m.publicadoEn : filtro === 'todas' ? true : String(m.marca) === filtro))
      .filter(m => !f || `${m.nombreMostrado} ${m.nombreOriginal}`.toLowerCase().includes(f));
  }, [catalogo, filtro, busqueda]);

  const publicarTodoPendiente = async () => {
    setPublicandoTodo(true);
    try {
      // En serie y no en paralelo: son escrituras a Firestore y disparar 63 a la
      // vez es la mejor forma de comerse un rate limit a cambio de nada.
      for (const m of pendientes) await publicarMaquina(m.id);
      showToast(`${pendientes.length} máquinas publicadas`, 'success');
      refrescar();
    } catch (err) {
      console.error('No se pudieron publicar las máquinas:', err);
      showToast('No se pudieron publicar. Inténtalo de nuevo.', 'error');
    } finally {
      setPublicandoTodo(false);
    }
  };

  return (
    <div className="space-y-4">
      {pendientes.length > 0 && (
        <div className="rounded-surface border border-accent-line bg-accent-bg/30 p-4 flex items-center gap-3 flex-wrap">
          <p className="flex-1 min-w-[12rem] font-sans text-body-s text-ink">
            <strong>{pendientes.length}</strong> máquinas importadas sin revisar. Ningún atleta las ve todavía.
          </p>
          <Button
            variant="primary"
            size="s"
            onClick={publicarTodoPendiente}
            loading={publicandoTodo}
            loadingLabel="Publicando"
          >
            Publicar todas
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {([['pendientes', `Por revisar (${pendientes.length})`], ['todas', `Todas (${catalogo.length})`]] as const).map(([id, etiqueta]) => (
          <Chip key={id} selected={filtro === id} onClick={() => setFiltro(id)}>{etiqueta}</Chip>
        ))}
        {marcas.map(marca => (
          <Chip key={marca} selected={filtro === marca} onClick={() => setFiltro(marca)}>{MARCA_LABELS[marca] ?? marca}</Chip>
        ))}
      </div>

      <SearchField value={busqueda} onChange={setBusqueda} label="Buscar máquina" placeholder="Buscar en el catálogo" />

      {isLoading ? (
        <div className="space-y-2" aria-label="Cargando catálogo">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {visibles.map(m => (
            <ListRow
              key={m.id}
              as="li"
              onClick={() => setEditando(m)}
              leading={<img src={m.fotoUrl} alt="" className="w-12 h-12 rounded-control object-contain bg-white flex-shrink-0" loading="lazy" />}
              title={m.nombreMostrado}
              subtitle={`${MARCA_LABELS[m.marca] ?? m.marca} · ${m.nombreOriginal}`}
              trailing={
                <span className="flex items-center gap-2">
                  <Badge tone={!m.publicadoEn ? 'accent' : m.visible ? 'success' : 'danger'}>
                    {!m.publicadoEn ? 'Sin revisar' : m.visible ? 'Publicada' : 'Oculta'}
                  </Badge>
                  <Icon name="chevron_right" size="s" className="text-ink-4 shrink-0" />
                </span>
              }
            />
          ))}
        </ul>
      )}

      {!isLoading && visibles.length === 0 && (
        <EmptyState icon="search_off" title="Sin resultados" description="Ninguna máquina coincide con este filtro." />
      )}

      <Button variant="secondary" size="m" icon="add" fullWidth onClick={() => setCreando(true)}>
        Añadir máquina al catálogo
      </Button>

      {editando && (
        <EditorMaquina
          maquina={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); refrescar(); }}
        />
      )}

      {creando && (
        <EditorMaquina
          nueva
          marcasConocidas={marcas}
          onClose={() => setCreando(false)}
          onGuardado={() => { setCreando(false); refrescar(); }}
        />
      )}
    </div>
  );
}

/* ── Editor de una máquina (existente o nueva) ─────────────────────────────── */

type EditorProps = {
  maquina?: Maquina;
  nueva?: boolean;
  marcasConocidas?: string[];
  onClose: () => void;
  onGuardado: () => void;
};

function EditorMaquina({ maquina, nueva, marcasConocidas = [], onClose, onGuardado }: EditorProps) {
  const { showToast } = useToast();
  const [nombreMostrado, setNombreMostrado] = useState(maquina?.nombreMostrado ?? '');
  const [nombreOriginal, setNombreOriginal] = useState(maquina?.nombreOriginal ?? '');
  const [marca, setMarca] = useState(String(maquina?.marca ?? marcasConocidas[0] ?? ''));
  const [familia, setFamilia] = useState(maquina?.familia ?? '');
  const [categoria, setCategoria] = useState<MuscleGroup>(maquina?.categoria ?? 'pecho');
  const [fotoUrl, setFotoUrl] = useState(maquina?.fotoUrl ?? '');
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const ficheroRef = useRef<HTMLInputElement>(null);

  const cambiarImagen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !maquina) return;
    setSubiendo(true);
    try {
      setFotoUrl(await subirImagenMaquina(maquina.id, f));
      showToast('Imagen actualizada. Recuerda guardar.', 'info');
    } catch (err) {
      console.error('No se pudo subir la imagen:', err);
      showToast('No se pudo subir la imagen.', 'error');
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      if (nueva) {
        await crearMaquinaAdmin({
          nombreOriginal: nombreOriginal.trim() || nombreMostrado.trim(),
          nombreMostrado: nombreMostrado.trim(),
          marca,
          familia: familia.trim(),
          categoria,
          fotoUrl: fotoUrl.trim(),
        });
        showToast('Máquina añadida al catálogo', 'success');
      } else if (maquina) {
        await upsertOverrideMaquina(maquina.id, { nombreMostrado: nombreMostrado.trim(), categoria, fotoUrl });
        showToast('Cambios guardados', 'success');
      }
      onGuardado();
    } catch (err) {
      console.error('No se pudo guardar la máquina:', err);
      showToast('No se pudo guardar.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const alternarVisible = async () => {
    if (!maquina) return;
    await ocultarMaquina(maquina.id, maquina.visible);
    showToast(maquina.visible ? 'Máquina oculta' : 'Máquina visible', 'info');
    onGuardado();
  };

  const publicar = async () => {
    if (!maquina) return;
    await publicarMaquina(maquina.id);
    showToast('Publicada: ya la ven los atletas', 'success');
    onGuardado();
  };

  const valido = nombreMostrado.trim() && (!nueva || (marca && familia.trim() && fotoUrl.trim()));

  return (
    <Sheet
      open
      onClose={onClose}
      title={nueva ? 'Añadir máquina' : maquina?.nombreOriginal}
      footer={
        <Button variant="primary" size="l" fullWidth onClick={guardar} disabled={!valido || guardando} loading={guardando} loadingLabel="Guardando">
          Guardar
        </Button>
      }
    >
      <div className="space-y-5">
        {fotoUrl && (
          <img src={fotoUrl} alt="" className="w-full h-40 rounded-surface object-contain bg-white" />
        )}

        {!nueva && (
          <>
            <Button variant="secondary" size="m" icon="image" fullWidth onClick={() => ficheroRef.current?.click()} loading={subiendo} loadingLabel="Subiendo">
              Cambiar imagen
            </Button>
            <input ref={ficheroRef} type="file" accept="image/*" onChange={cambiarImagen} className="hidden" />
          </>
        )}

        <Input label="Nombre que ve el atleta" value={nombreMostrado} onChange={setNombreMostrado} />

        {nueva ? (
          <>
            <Input label="Nombre original (del fabricante)" value={nombreOriginal} onChange={setNombreOriginal} />
            <Input label="Marca" value={marca} onChange={setMarca} hint="Clave en camelCase: hammerStrength, technogym, panatta…" />
            <Input label="Familia" value={familia} onChange={setFamilia} placeholder="Plate Loaded" />
            <Input label="URL de la imagen" value={fotoUrl} onChange={setFotoUrl} placeholder="/maquinas/mi-maquina.webp" />
          </>
        ) : (
          <p className="font-mono text-caption text-ink-4 uppercase tracking-wider">
            {MARCA_LABELS[marca] ?? marca} · {familia}
          </p>
        )}

        <Select
          label="Grupo muscular"
          value={categoria}
          onChange={v => setCategoria(v as MuscleGroup)}
          options={ORDEN_CATEGORIAS.map(c => ({ value: c, label: MUSCLE_LABELS[c] }))}
        />

        {maquina && (
          <div className="space-y-2 pt-2 border-t border-hairline">
            {!maquina.publicadoEn && (
              <Button variant="secondary" size="m" icon="visibility" fullWidth onClick={publicar}>
                Publicar (la verán los atletas)
              </Button>
            )}
            <Button
              variant="ghost"
              size="m"
              icon={maquina.visible ? 'visibility_off' : 'visibility'}
              fullWidth
              onClick={alternarVisible}
            >
              {maquina.visible ? 'Ocultar del catálogo' : 'Volver a mostrar'}
            </Button>
            <p className="font-mono text-caption text-ink-5 break-all">id: {maquina.id}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

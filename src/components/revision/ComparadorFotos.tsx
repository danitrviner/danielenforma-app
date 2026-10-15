import React, { useMemo, useState } from 'react';
import { ProgressPhoto, PhotoView, BodyweightLog } from '../../types';
import { fotosDeVista, parPorDefecto, pesoEnFecha, etiquetaComparativa } from '../../utils/paresDeFotos';
import PhotoCompareCurtain from '../progress/PhotoCompareCurtain';
import { SegmentedControl, Select, EmptyState } from '../ui';
import { fechaCorta } from '../../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Comparador de fotos del coach — con los dos extremos ELEGIBLES.

   `ClientBodyPanel` clava la primera contra la última y no deja tocar nada.
   Sirve para una ojeada, pero no para la revisión que Dani graba por fuera
   (Loom, OBS — la app no graba nada): lo que quiere
   contar es «mira de la semana 4 a hoy», o «de antes del corte a ahora», y eso
   es justo el par que no se podía elegir. El atleta sí podía, en PhotosScreen.

   La elección vive en `utils/paresDeFotos.ts`; aquí solo está el mando.
   ═══════════════════════════════════════════════════════════════════════════ */

const VISTAS: { value: PhotoView; label: string }[] = [
  { value: 'front', label: 'Frente' },
  { value: 'side', label: 'Lateral' },
  { value: 'back', label: 'Espalda' },
];

interface Props {
  photos: ProgressPhoto[];
  athleteEmail: string;
  /** Para poner el delta de peso en la pastilla. Opcional. */
  bodyweightLogs?: BodyweightLog[];
}

export default function ComparadorFotos({ photos, athleteEmail, bodyweightLogs = [] }: Props) {
  const [vista, setVista] = useState<PhotoView>('front');
  // Par elegido a mano. Se guarda por vista: cambiar de frente a espalda no
  // debe arrastrar una fecha que en esa vista no existe.
  const [elegido, setElegido] = useState<Record<PhotoView, [string, string] | null>>({
    front: null, side: null, back: null,
  });

  const fotos = useMemo(
    () => fotosDeVista(photos, vista, athleteEmail),
    [photos, vista, athleteEmail],
  );

  const par = useMemo(() => {
    const manual = elegido[vista];
    if (manual) {
      const antes = fotos.find(f => f.date === manual[0]);
      const ahora = fotos.find(f => f.date === manual[1]);
      if (antes && ahora) return { antes, ahora };
    }
    return parPorDefecto(fotos);
  }, [fotos, elegido, vista]);

  const opciones = fotos.map(f => ({ value: f.date, label: fechaCorta(f.date, { anio: true }) }));

  const setPar = (antes: string, ahora: string) =>
    setElegido(prev => ({ ...prev, [vista]: [antes, ahora] }));

  // Elegir tocando la tira: la primera foto que tocas espera a la segunda, y
  // el par se ordena solo por fecha (Antes siempre es la más antigua).
  const [pendiente, setPendiente] = useState<string | null>(null);
  const tocarMiniatura = (fecha: string) => {
    if (pendiente == null) { setPendiente(fecha); return; }
    if (pendiente === fecha) { setPendiente(null); return; }
    const [a, b] = [pendiente, fecha].sort();
    setPar(a, b);
    setPendiente(null);
  };
  const cambiarVista = (v: PhotoView) => { setVista(v); setPendiente(null); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl
          label="Vista de la foto"
          options={VISTAS}
          value={vista}
          onChange={v => cambiarVista(v as PhotoView)}
        />
        {par && fotos.length > 2 && (
          <div className="flex items-end gap-2">
            <div className="min-w-[130px]">
              <Select label="Antes" value={par.antes.date} options={opciones}
                onChange={d => setPar(d, par.ahora.date)} />
            </div>
            <div className="min-w-[130px]">
              <Select label="Ahora" value={par.ahora.date} options={opciones}
                onChange={d => setPar(par.antes.date, d)} />
            </div>
          </div>
        )}
      </div>

      {fotos.length === 0 ? (
        <EmptyState
          icon="photo_camera"
          title="Sin fotos en esta vista"
          description="El atleta todavía no ha subido ninguna foto de este ángulo."
        />
      ) : par == null ? (
        // Una sola foto: no hay comparación, así que se enseña tal cual en vez
        // de una cortina que no se mueve.
        <figure className="m-0 max-w-[280px]">
          <img
            src={fotos[0].url}
            alt={`Foto de ${VISTAS.find(v => v.value === vista)?.label.toLowerCase()}`}
            className="w-full rounded-surface border border-hairline object-cover"
          />
          <figcaption className="font-mono text-caption text-ink-3 mt-1">
            {fechaCorta(fotos[0].date, { anio: true })} · única foto de esta vista
          </figcaption>
        </figure>
      ) : (
        <PhotoCompareCurtain
          antes={par.antes}
          ahora={par.ahora}
          badge={etiquetaComparativa(
            par.antes.date, par.ahora.date,
            pesoEnFecha(bodyweightLogs, par.antes.date),
            pesoEnFecha(bodyweightLogs, par.ahora.date),
          )}
        />
      )}

      {fotos.length > 2 && (
        <div>
          <p className="font-mono text-caption text-ink-3 mb-1.5">
            {pendiente
              ? `Toca la segunda foto para comparar con la del ${fechaCorta(pendiente, { anio: true })}`
              : 'Toca dos fotos para compararlas'}
          </p>
          <ul className="m-0 p-0 list-none flex gap-2 overflow-x-auto pb-1" aria-label="Historial de fotos">
            {fotos.map(f => {
              const esPar = par != null && (f.date === par.antes.date || f.date === par.ahora.date);
              const esPendiente = f.date === pendiente;
              return (
                <li key={f.date} className="flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => tocarMiniatura(f.date)}
                    aria-pressed={esPar || esPendiente}
                    aria-label={`Foto del ${fechaCorta(f.date, { anio: true })}`}
                    className={`block w-16 text-left rounded-control border-2 overflow-hidden transition-colors ${
                      esPendiente ? 'border-warning' : esPar ? 'border-accent' : 'border-hairline hover:border-strong'
                    }`}
                  >
                    <img src={f.url} alt="" loading="lazy" className="w-16 h-20 object-cover object-top" />
                    <span className="block px-1 py-0.5 font-mono text-caption text-ink-2 bg-raised truncate">
                      {fechaCorta(f.date, { anio: true })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

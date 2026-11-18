import React from 'react';
import { VIDEO_PROTOCOLO_MEDIDAS } from '../../data/questionnairePresets';
import { cambioDePerimetro, cm, ruidoDeMetrica, textoDeCambio } from '../../utils/cambioDePerimetro';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «Mídete igual» (17-11-2026)

   Dos piezas pequeñas para las pantallas del cuestionario donde el atleta
   apunta perímetros:

     · `NotaMideteIgual`  las tres reglas que más error quitan, siempre a la
                          vista, con el vídeo del protocolo al lado.
     · `CambioDeMedida`   debajo de cada medida, el cambio frente a la
                          anterior. Por debajo del error de la cinta dice «sin
                          cambio medible» en vez de una flecha.

   Sin colores de bien o mal: que la cintura baje es bueno en definición y que
   el brazo suba es bueno en volumen, y aquí no se sabe en cuál está.
   ═══════════════════════════════════════════════════════════════════════════ */

const REGLAS_DE_MEDIDA = ['A la misma hora', 'La cinta en el mismo sitio', 'Sin apretar'] as const;

export function NotaMideteIgual() {
  return (
    <aside className="bg-raised border border-hairline rounded-control px-3 py-2.5 space-y-1.5" aria-label="Cómo medirte">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 font-sans text-caption font-bold text-ink-2">
          <Icon name="straighten" size="s" className="text-accent-ink" />
          Mídete siempre igual
        </p>
        <a
          href={VIDEO_PROTOCOLO_MEDIDAS}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-sans text-caption text-ink-3 underline underline-offset-2 hover:text-ink"
        >
          <Icon name="play_circle" size="s" />
          Ver cómo
        </a>
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-3 gap-y-0.5">
        {REGLAS_DE_MEDIDA.map(r => (
          <li key={r} className="inline-flex items-center gap-1 font-sans text-caption text-ink-3">
            <Icon name="check" size="s" className="text-ink-4" />
            {r}
          </li>
        ))}
      </ul>
    </aside>
  );
}

const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

const ICONO = { sube: 'arrow_upward', baja: 'arrow_downward', sin_cambio: 'trending_flat' } as const;

interface CambioProps {
  metricKey: string;
  /** La medida anterior a hoy; sin ella no se pinta nada. */
  anterior: { value: number; date: string } | null;
  /** Lo que lleva escrito ahora (sin escribir = solo se recuerda la anterior). */
  actual: number | undefined;
}

export function CambioDeMedida({ metricKey, anterior, actual }: CambioProps) {
  if (!anterior) return null;
  const antes = `${cm(anterior.value)} cm el ${fechaCorta(anterior.date)}`;
  if (actual === undefined || !Number.isFinite(actual)) {
    return <p className="font-sans text-caption text-ink-4">La última vez, {antes}.</p>;
  }
  const cambio = cambioDePerimetro(metricKey, anterior.value, actual);
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 font-sans text-caption text-ink-4">
      <span className="inline-flex items-center gap-1 font-bold text-ink-2">
        <Icon name={ICONO[cambio.estado]} size="s" />
        {textoDeCambio(cambio)}
      </span>
      <span>
        · antes, {antes}
        {cambio.estado === 'sin_cambio' && `. Menos de ${cm(ruidoDeMetrica(metricKey))} cm es margen de la cinta.`}
      </span>
    </p>
  );
}

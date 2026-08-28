import React, { useState } from 'react';
import { BandaEntreno, BandaNutricion } from '../../../utils/roadmapCalendar';
import { Sheet, Button, Stepper } from '../../ui';

/**
 * Clic en un segmento de carril (Nivel Mes) → editar su duración. Absorbe lo
 * que en el timeline horizontal era arrastrar el borde derecho de la barra
 * (RoadmapTimeline.tsx, `onResizeMesocycle`/`onResizeNutritionPhase`) — aquí
 * el gesto de arrastre no tiene un borde que agarrar dentro de la celda del
 * calendario, así que la edición pasa a ser explícita: un stepper de semanas.
 */
interface Props {
  banda: BandaEntreno | BandaNutricion;
  kind: 'meso' | 'nutri';
  onResize: (id: string, weeks: number) => void | Promise<void>;
  onClose: () => void;
}

function esBandaEntreno(b: BandaEntreno | BandaNutricion): b is BandaEntreno {
  return 'semanas' in b;
}

export default function EditorFaseSheet({ banda, kind, onResize, onClose }: Props) {
  const semanasActuales = esBandaEntreno(banda) ? banda.semanas : Math.round((new Date(banda.fin + 'T00:00:00').getTime() - new Date(banda.inicio + 'T00:00:00').getTime()) / 86400000 / 7) + 1;
  const [semanas, setSemanas] = useState(semanasActuales);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await onResize(banda.id, semanas);
      onClose();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={banda.nombre}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || semanas === semanasActuales} loading={guardando} className="flex-1">Guardar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-2">
            Duración de {kind === 'meso' ? 'este mesociclo' : 'esta fase'}
          </label>
          <Stepper value={semanas} min={1} max={24} onChange={setSemanas} label="Semanas" unit="sem" />
        </div>
        <p className="text-label text-ink-3 font-sans leading-relaxed">
          Inicio: <b className="text-white">{banda.inicio}</b>. Cambiar la duración mueve el fin de{' '}
          {kind === 'meso' ? 'este mesociclo' : 'esta fase'} y recalcula el resto del calendario a partir de él.
        </p>
      </div>
    </Sheet>
  );
}

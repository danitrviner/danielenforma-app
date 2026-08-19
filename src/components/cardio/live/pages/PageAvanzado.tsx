import React, { useState } from 'react';
import { Icon, Sheet } from '../../../ui';
import { CARDIO_LIVE_METRICS, CardioLiveMetricCtx, metricByKey } from '../../../../utils/cardioLiveMetrics';

/* Página 5 del carrusel — layout "Avanzado" de FITIV (§4.6/§4.7 del
   análisis): 7 métricas en posiciones fijas, elegibles tocando cada hueco.
   Sustituye a `PageOtras.tsx`, que ya dejaba escrito que era un placeholder
   para esto. F9 entrega solo el layout Avanzado — sin selector
   Básico/Estándar, que queda anotado para más adelante. */

interface Props {
  ctx: CardioLiveMetricCtx;
  layout: string[]; // 7 claves del catálogo, posiciones fijas (ver GRID_ORDER más abajo)
  onChangeLayout: (next: string[]) => void;
}

const POSITION_LABEL = [
  'Arriba izquierda', 'Arriba centro', 'Arriba derecha',
  'Centro',
  'Abajo izquierda', 'Abajo centro', 'Abajo derecha',
];

export default function PageAvanzado({ ctx, layout, onChangeLayout }: Props) {
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const slots = Array.from({ length: 7 }, (_, i) => layout[i] ?? CARDIO_LIVE_METRICS[i % CARDIO_LIVE_METRICS.length].key);

  const chooseMetric = (key: string) => {
    if (editingSlot === null) return;
    const next = [...slots];
    next[editingSlot] = key;
    onChangeLayout(next);
    setEditingSlot(null);
  };

  return (
    <div className="flex h-full flex-col justify-center gap-2 px-4">
      <div className="grid grid-cols-3 gap-2">
        {slots.slice(0, 3).map((metricKey, i) => (
          <Slot key={i} metricKey={metricKey} ctx={ctx} onTap={() => setEditingSlot(i)} />
        ))}
      </div>
      <Slot metricKey={slots[3]} ctx={ctx} onTap={() => setEditingSlot(3)} big />
      <div className="grid grid-cols-3 gap-2">
        {slots.slice(4, 7).map((metricKey, i) => (
          <Slot key={i + 4} metricKey={metricKey} ctx={ctx} onTap={() => setEditingSlot(i + 4)} />
        ))}
      </div>

      <Sheet open={editingSlot !== null} onClose={() => setEditingSlot(null)} title={editingSlot !== null ? POSITION_LABEL[editingSlot] : ''}>
        <div className="divide-y divide-hairline">
          {CARDIO_LIVE_METRICS.map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => chooseMetric(m.key)}
              className="flex w-full items-center justify-between py-3 text-left"
            >
              <span className="text-body-s font-sans text-ink">{m.label}</span>
              {editingSlot !== null && slots[editingSlot] === m.key && <Icon name="check" size="s" className="text-accent" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

interface SlotProps {
  metricKey: string;
  ctx: CardioLiveMetricCtx;
  onTap: () => void;
  big?: boolean;
  key?: React.Key;
}

function Slot({ metricKey, ctx, onTap, big }: SlotProps) {
  const metric = metricByKey(metricKey);
  return (
    <button
      type="button"
      onClick={onTap}
      className={`flex flex-col items-center justify-center rounded-surface bg-black/25 ${big ? 'py-4' : 'py-3'}`}
    >
      <p className={`font-mono font-bold text-white tabular-nums ${big ? 'text-display' : 'text-title-m'}`}>{metric.format(ctx)}</p>
      <p className="text-caption font-sans uppercase text-white/70 mt-1">{metric.label}</p>
    </button>
  );
}

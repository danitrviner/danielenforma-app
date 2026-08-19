import React from 'react';
import { CardioIntervalBlock, CardioZones } from '../../../../types';
import { ZONE_LABEL } from '../../../../utils/cardioZones';

/* Página 1 del carrusel — en FITIV es "Ritmo" (`--:--` en cinta sin GPS, que
   está aplazado, §F7 del análisis). En vez de dejar un guión fijo que no
   dice nada, aquí va lo que hoy SÍ hay: el bloque de intervalos en curso o
   el objetivo de Zona 2, que antes vivían sueltos encima de la fila de
   métricas y ahora tienen página propia. F9 añade el texto del objetivo
   según el `closeType` del bloque — antes solo existía "por tiempo". */

function fmtClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

interface Props {
  intervalBlocks?: CardioIntervalBlock[] | null;
  currentBlockIndex?: number;
  blockRemainingSec?: number;
  blockProgressKcal?: number;
  bpm?: number | null;
  currentZone?: keyof CardioZones | null;
  targetZone?: keyof CardioZones;
  targetDurationSec?: number;
  targetProgressSec: number;
  onAdvanceBlock?: () => void;
}

function BlockObjective({ block, bpm, currentZone, blockProgressKcal, blockRemainingSec, onAdvanceBlock }: {
  block: CardioIntervalBlock;
  bpm?: number | null;
  currentZone?: keyof CardioZones | null;
  blockProgressKcal?: number;
  blockRemainingSec?: number;
  onAdvanceBlock?: () => void;
}) {
  switch (block.closeType) {
    case 'zone':
      return (
        <p className="text-caption font-sans uppercase text-white/80 text-center">
          {block.targetZone ? `Hasta llegar a ${ZONE_LABEL[block.targetZone]}` : 'Objetivo de zona'}
          {currentZone && ` · ahora en ${ZONE_LABEL[currentZone]}`}
        </p>
      );
    case 'heartRate':
      return (
        <p className="text-caption font-sans uppercase text-white/80 text-center">
          {block.hrDirection === 'below' ? `Baja de ${block.hrThresholdBpm} ppm` : `Sube hasta superar ${block.hrThresholdBpm} ppm`}
          {bpm !== null && bpm !== undefined && ` · ahora ${bpm}`}
        </p>
      );
    case 'calories': {
      const fraction = block.targetKcal ? Math.min((blockProgressKcal ?? 0) / block.targetKcal, 1) : null;
      return (
        <div className="flex flex-col items-center gap-2 w-full">
          <p className="text-caption font-sans uppercase text-white/80 text-center">
            Quema {block.targetKcal ?? '--'} kcal en este bloque · {Math.round(blockProgressKcal ?? 0)} kcal
          </p>
          {fraction !== null && (
            <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden">
              <div className="h-full rounded-full bg-white transition-[width] duration-1000" style={{ width: `${fraction * 100}%` }} />
            </div>
          )}
        </div>
      );
    }
    case 'manual':
      return (
        <button
          type="button"
          onClick={onAdvanceBlock}
          className="rounded-full bg-white/15 px-6 py-3 text-body-s font-sans font-bold text-white active:bg-white/25"
        >
          Toca para continuar
        </button>
      );
    case 'time':
    default:
      return <p className="font-sans font-extrabold text-display text-white tabular-nums">{fmtClock(blockRemainingSec ?? 0)}</p>;
  }
}

export default function PageObjetivo({
  intervalBlocks, currentBlockIndex, blockRemainingSec, blockProgressKcal, bpm, currentZone,
  targetZone, targetDurationSec, targetProgressSec, onAdvanceBlock,
}: Props) {
  if (intervalBlocks && currentBlockIndex !== undefined) {
    const block = intervalBlocks[currentBlockIndex];
    const next = intervalBlocks[currentBlockIndex + 1];
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-caption font-mono uppercase text-white/80">
          Bloque {currentBlockIndex + 1}/{intervalBlocks.length} · {block.label}
        </p>
        <BlockObjective
          block={block}
          bpm={bpm}
          currentZone={currentZone}
          blockProgressKcal={blockProgressKcal}
          blockRemainingSec={blockRemainingSec}
          onAdvanceBlock={onAdvanceBlock}
        />
        {next && <p className="text-caption font-sans text-white/60">Siguiente: {next.label}</p>}
      </div>
    );
  }

  if (targetZone) {
    const fraction = targetDurationSec ? Math.min(targetProgressSec / targetDurationSec, 1) : null;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8">
        <p className="text-caption font-sans uppercase text-white/80 text-center">
          Objetivo: {ZONE_LABEL[targetZone]}
          {targetDurationSec ? ` · ${fmtClock(targetProgressSec)} / ${fmtClock(targetDurationSec)}` : ` · ${fmtClock(targetProgressSec)}`}
        </p>
        {fraction !== null && (
          <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden">
            <div className="h-full rounded-full bg-white transition-[width] duration-1000" style={{ width: `${fraction * 100}%` }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-8 text-center">
      <p className="font-mono text-display text-white/50">--:--</p>
      <p className="text-caption font-sans uppercase text-white/50">Sesión libre, sin objetivo</p>
    </div>
  );
}

import React from 'react';
import { MUSCLE_LABELS_SHORT, MuscleGroup } from '../../types';
import { BalanceDeSeries } from '../../utils/programacion';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   SeriesBalance — «lo pautado vs lo planificado», por grupo muscular.

   Se lee de un vistazo o no sirve: primero UNA frase con lo que falta o sobra,
   y después solo los grupos descuadrados como chips. Los grupos que cuadran no
   se pintan uno a uno (serían 8-12 chips verdes de ruido); se resumen en un
   contador al final. Mismo componente en la vista previa del generador (contra
   el día de la distribución) y en «Ejercicios» (contra el mesociclo entero).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  balance: BalanceDeSeries;
  /** Contra qué se compara — «distribución del día», «volumen del mesociclo»… */
  referencia: string;
  /** Sin plan con el que comparar no hay balance que enseñar. */
  ocultarSiVacio?: boolean;
  /** Si se pasa, cada chip descuadrado se puede clicar para saltar al primer
   *  ejercicio de ese grupo — si no, los chips son solo lectura. */
  onGroupClick?: (group: MuscleGroup) => void;
}

export default function SeriesBalance({ balance, referencia, ocultarSiVacio = true, onGroupClick }: Props) {
  const { filas, pendientes, sobrantes, cuadra, totalPautadas, totalPlanificadas } = balance;
  if (ocultarSiVacio && totalPlanificadas === 0 && totalPautadas === 0) return null;

  // Sin plan con el que comparar (un mesociclo prediseñado por plantilla, o uno
  // al que nadie le ha puesto volumen todavía) NO hay descuadre: todo lo pautado
  // saldría como «sobrante», que es exactamente lo contrario de lo que pasa.
  if (totalPlanificadas === 0) {
    if (ocultarSiVacio) return null;
    return (
      <div className="flex items-center gap-1.5">
        <Icon name="info" size="s" className="text-ink-3 flex-shrink-0" />
        <span className="font-mono text-caption text-ink-3 uppercase tracking-wider">
          {totalPautadas} series pautadas · sin volumen configurado con el que comparar
        </span>
      </div>
    );
  }

  const descuadradas = filas.filter(f => f.diff !== 0);
  const cuadradas    = filas.length - descuadradas.length;

  const tono = cuadra ? 'var(--color-success)' : pendientes > 0 ? 'var(--color-warning)' : 'var(--color-info)';
  const series = (n: number) => `${n} ${n === 1 ? 'serie' : 'series'}`;
  const resumen = cuadra
    ? `Cuadra con ${referencia}`
    : [
        pendientes > 0 ? `${pendientes === 1 ? 'falta' : 'faltan'} ${series(pendientes)}` : null,
        sobrantes  > 0 ? `${sobrantes  === 1 ? 'sobra'  : 'sobran'} ${series(sobrantes)}`  : null,
      ].filter(Boolean).join(' · ') + ` vs ${referencia}`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon name={cuadra ? 'check_circle' : 'balance'} size="s" className="flex-shrink-0" style={{ color: tono }} />
        <span className="font-mono text-caption uppercase tracking-wider" style={{ color: tono }}>
          {resumen}
        </span>
        <span className="font-mono text-caption text-ink-3 tabular-nums ml-auto flex-shrink-0">
          {totalPautadas}/{totalPlanificadas}
        </span>
      </div>

      {descuadradas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {descuadradas.map(f => {
            const falta = f.diff < 0;
            const color = falta ? 'var(--color-warning)' : 'var(--color-info)';
            const contenido = (
              <>
                {MUSCLE_LABELS_SHORT[f.group]}
                <span className="text-ink-2">{f.pautadas}/{f.planificadas}</span>
                <strong>{falta ? f.diff : `+${f.diff}`}</strong>
              </>
            );
            const claseComun = 'inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 font-mono text-caption tabular-nums';
            const estiloComun = { borderColor: color, color, backgroundColor: 'color-mix(in srgb, currentColor 10%, transparent)' };
            const titulo = `${MUSCLE_LABELS_SHORT[f.group]}: ${f.pautadas} pautadas de ${f.planificadas} planificadas`;
            return onGroupClick ? (
              <button
                key={f.group}
                type="button"
                title={`${titulo} — ir al ejercicio`}
                onClick={() => onGroupClick(f.group)}
                className={`${claseComun} hover:brightness-125 active:scale-95 transition-transform`}
                style={estiloComun}
              >
                {contenido}
              </button>
            ) : (
              <span key={f.group} title={titulo} className={claseComun} style={estiloComun}>
                {contenido}
              </span>
            );
          })}
          {cuadradas > 0 && (
            <span className="inline-flex items-center gap-1 rounded-chip border border-hairline px-2 py-0.5 font-mono text-caption text-ink-3">
              +{cuadradas} cuadran
            </span>
          )}
        </div>
      )}
    </div>
  );
}

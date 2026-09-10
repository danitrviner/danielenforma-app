import React, { useMemo } from 'react';
import { BodyweightLog } from '../../types';
import { useCifraQueSube } from '../../hooks/useCifraQueSube';
import { Icon } from '../ui';

interface Props {
  logs: BodyweightLog[];
  /** Meta del atleta. 0 o ausente = no la ha puesto (la rellena él en Ajustes). */
  metaKg?: number;
  onClick: () => void;
}

/** Las últimas N pesadas, de la más vieja a la más nueva. */
function ultimas(logs: BodyweightLog[], n: number): BodyweightLog[] {
  return [...logs].sort((a, b) => a.date.localeCompare(b.date)).slice(-n);
}

/**
 * El peso y hacia dónde va, en la segunda fila de Inicio.
 *
 * Antes el peso solo se veía entrando a Revisión. Aquí no es el protagonista
 * —ese sitio es del reto de la semana— pero sí se ve sin hacer scroll, que es
 * lo que pidió Dani: los pasos y el objetivo, arriba.
 *
 * Con menos de dos pesadas no se pinta curva: dos puntos no son una tendencia,
 * y una línea recta entre dos números dice algo que no se sabe. Y sin meta, en
 * vez de un hueco se ofrece ponerla.
 */
export default function TarjetaPeso({ logs, metaKg, onClick }: Props) {
  const serie = useMemo(() => ultimas(logs, 12), [logs]);
  const ultimo = serie[serie.length - 1];
  const peso = ultimo?.weight ?? 0;
  const pesoAnimado = useCifraQueSube(peso);

  // Sin ninguna pesada no hay tarjeta que pintar: se invita a la primera.
  if (!ultimo) {
    return (
      <button
        onClick={onClick}
        className="text-left bg-surface border border-hairline rounded-surface p-4 flex flex-col gap-2 hover:border-strong transition-colors duration-(--duration-state)"
      >
        <p className="font-mono text-caption uppercase tracking-wider text-ink-2">Tu peso</p>
        <Icon name="monitor_weight" size="l" className="text-ink-3" />
        <p className="font-sans text-body-s font-bold text-ink leading-snug">Apúntate el primero</p>
        <p className="font-mono text-caption text-ink-4 leading-snug">Es el punto de partida</p>
      </button>
    );
  }

  const primero = serie[0].weight;
  // Con tolerancia: por debajo de 50 g no ha cambiado nada, y «+0,0» sobra.
  const bruto = peso - primero;
  const delta = Math.abs(bruto) < 0.05 ? 0 : bruto;
  const hayMeta = (metaKg ?? 0) > 0;
  // Bajando hacia la meta o subiendo hacia ella: el verde es «vas hacia donde
  // querías», no «has adelgazado». Un atleta en superávit sube a propósito.
  const bien = hayMeta ? Math.abs(peso - metaKg!) < Math.abs(primero - metaKg!) : delta <= 0;

  // La curva, normalizada al rango real de la serie para que se vea el
  // movimiento aunque sean 800 gramos en tres meses.
  const pesos = serie.map(l => l.weight);
  const min = Math.min(...pesos, ...(hayMeta ? [metaKg!] : []));
  const max = Math.max(...pesos, ...(hayMeta ? [metaKg!] : []));
  const rango = max - min || 1;
  const y = (w: number) => 24 - ((w - min) / rango) * 22;
  const puntos = serie.map((l, i) => `${(i / Math.max(1, serie.length - 1)) * 138} ${y(l.weight)}`);

  return (
    <button
      onClick={onClick}
      aria-label={[
        `Tu peso: ${peso.toFixed(1).replace('.', ',')} kilos.`,
        delta !== 0 && `${delta > 0 ? 'Has subido' : 'Has bajado'} ${Math.abs(delta).toFixed(1).replace('.', ',')} kilos.`,
        hayMeta ? `Tu meta son ${metaKg!.toFixed(1).replace('.', ',')} kilos.` : 'No has puesto meta.',
      ].filter(Boolean).join(' ')}
      className="text-left bg-surface border border-hairline rounded-surface p-4 flex flex-col gap-2 hover:border-strong transition-colors duration-(--duration-state)"
    >
      <p className="font-mono text-caption uppercase tracking-wider text-success">Tu peso</p>
      <p className="font-mono font-bold text-feature text-ink tracking-tight leading-none tabular-nums">
        {pesoAnimado.toFixed(1).replace('.', ',')}
        <span className="text-body-s text-ink-2"> kg</span>
      </p>

      {serie.length >= 2 ? (
        <svg viewBox="0 0 138 26" className="w-full h-[26px] block" preserveAspectRatio="none" aria-hidden="true">
          {hayMeta && (
            <line
              x1="0" y1={y(metaKg!)} x2="138" y2={y(metaKg!)}
              stroke="var(--color-success)" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="3 4"
            />
          )}
          <polyline
            points={puntos.join(' ')}
            fill="none"
            stroke={bien ? 'var(--color-success)' : 'var(--color-ink-3)'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          />
          <circle
            cx="138" cy={y(peso)} r="3"
            fill={bien ? 'var(--color-success)' : 'var(--color-ink-3)'}
          />
        </svg>
      ) : (
        <div className="h-[26px]" />
      )}

      <p className="font-mono text-caption text-ink-4 leading-snug">
        {delta !== 0 && `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1).replace('.', ',')}`}
        {hayMeta
          ? `${delta !== 0 ? ' · ' : ''}meta ${metaKg!.toFixed(1).replace('.', ',')}`
          : `${delta !== 0 ? ' · ' : ''}ponle meta`}
      </p>
    </button>
  );
}

import React, { useEffect, useState } from 'react';
import { Mesocycle } from '../../types';
import { PeriodoRevision } from '../../utils/revisionCoach';
import { nombreDeMeso } from '../../utils/nombresMeso';
import { addDays } from '../../utils/trainingWeek';
import { SegmentedControl, Select } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué ventana se está mirando.

   Cuatro opciones y no más: la semana, la quincena, «desde la última revisión»
   y el bloque. Son las preguntas que Dani se hace de verdad, y cada una trae su
   propia comparación sin que haya que elegirla aparte — que es donde
   ReportsPanel se complica con un segundo desplegable de «comparar con».

   «Desde la última revisión» solo aparece si de verdad hay una: un check-in ya
   contestado o aprobado. Sin eso no hay corte del que partir, y una opción que
   al pulsarla te deja en otra ventana distinta confunde más de lo que ayuda.
   El que está recibido y sin tocar no cuenta: ese es justo el que se va a
   contestar ahora, y tomarlo como corte dejaría la ventana en cero días.

   Las etiquetas se acortan en móvil («7 d») porque con cuatro opciones el
   segmentado no cabe en 375 px.
   ═══════════════════════════════════════════════════════════════════════════ */

/** ¿Menos de 640 px? Las etiquetas largas no caben con cuatro opciones. */
function useEsPantallaEstrecha(): boolean {
  const [estrecha, setEstrecha] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const alCambiar = (e: MediaQueryListEvent) => setEstrecha(e.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return estrecha;
}

interface Props {
  periodo: PeriodoRevision;
  onChange: (p: PeriodoRevision) => void;
  mesocycles: Mesocycle[];
  /** Con qué se compara la ventana elegida, para rotularlo debajo. */
  etiquetaComparacion: string;
  hoy: string;
  /** Fecha del último check-in contestado, o null si no hay ninguno. */
  ultimaRevision?: string | null;
}

export default function SelectorPeriodoRevision({
  periodo, onChange, mesocycles, etiquetaComparacion, hoy, ultimaRevision = null,
}: Props) {
  // Solo los bloques que ya empezaron: uno programado para dentro de un mes no
  // tiene nada que revisar y solo ensucia la lista.
  const empezados = [...mesocycles]
    .filter(m => !!m.startDate && m.startDate <= hoy)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const mesoElegido = periodo.tipo === 'meso' ? periodo.mesoId : (empezados[0]?.id ?? '');
  const corto = useEsPantallaEstrecha();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Periodo a revisar"
          options={[
            { value: '7d', label: corto ? '7 d' : '7 días' },
            { value: '14d', label: corto ? '14 d' : '14 días' },
            ...(ultimaRevision ? [{ value: 'ultima_revision', label: corto ? 'Última' : 'Desde la última' }] : []),
            ...(empezados.length > 0 ? [{ value: 'meso', label: 'Bloque' }] : []),
          ]}
          value={periodo.tipo}
          onChange={v => {
            if (v === 'meso') onChange({ tipo: 'meso', mesoId: mesoElegido });
            else onChange({ tipo: v as '7d' | '14d' | 'ultima_revision' });
          }}
        />

        {periodo.tipo === 'meso' && empezados.length > 0 && (
          <div className="min-w-[200px]">
            <Select
              label="Bloque"
              value={mesoElegido}
              onChange={id => onChange({ tipo: 'meso', mesoId: id })}
              options={empezados.map(m => {
                const fin = addDays(m.startDate, m.weeks * 7 - 1);
                const enCurso = hoy >= m.startDate && hoy <= fin;
                return {
                  value: m.id,
                  label: `${nombreDeMeso(m)}${enCurso ? ' · en curso' : ''}`,
                };
              })}
            />
          </div>
        )}
      </div>

      <p className="font-mono text-caption text-ink-3">Comparando {etiquetaComparacion}.</p>
    </div>
  );
}

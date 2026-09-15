import React from 'react';
import { Mesocycle } from '../../types';
import { PeriodoRevision } from '../../utils/revisionCoach';
import { nombreDeMeso } from '../../utils/nombresMeso';
import { addDays } from '../../utils/trainingWeek';
import { SegmentedControl, Select } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué ventana se está mirando.

   Tres opciones y no más: la semana, la quincena y el bloque. Son las tres
   preguntas que Dani se hace de verdad («¿cómo ha ido esta semana?», «¿y desde
   la última revisión?», «¿y el bloque entero?»), y cada una trae su propia
   comparación sin que haya que elegirla aparte — que es donde ReportsPanel se
   complica con un segundo desplegable de «comparar con».
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  periodo: PeriodoRevision;
  onChange: (p: PeriodoRevision) => void;
  mesocycles: Mesocycle[];
  /** Con qué se compara la ventana elegida, para rotularlo debajo. */
  etiquetaComparacion: string;
  hoy: string;
}

export default function SelectorPeriodoRevision({
  periodo, onChange, mesocycles, etiquetaComparacion, hoy,
}: Props) {
  // Solo los bloques que ya empezaron: uno programado para dentro de un mes no
  // tiene nada que revisar y solo ensucia la lista.
  const empezados = [...mesocycles]
    .filter(m => !!m.startDate && m.startDate <= hoy)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const mesoElegido = periodo.tipo === 'meso' ? periodo.mesoId : (empezados[0]?.id ?? '');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Periodo a revisar"
          options={[
            { value: '7d', label: '7 días' },
            { value: '14d', label: '14 días' },
            ...(empezados.length > 0 ? [{ value: 'meso', label: 'Bloque' }] : []),
          ]}
          value={periodo.tipo}
          onChange={v => {
            if (v === 'meso') onChange({ tipo: 'meso', mesoId: mesoElegido });
            else onChange({ tipo: v as '7d' | '14d' });
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

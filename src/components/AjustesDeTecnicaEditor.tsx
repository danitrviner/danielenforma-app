import React from 'react';
import type { AjustesDeTecnica, WorkoutExercise } from '../types';
import { SegmentedControl, Stepper, Input } from './ui';
import { ajustesDe, describirTecnica, seriesConTecnica } from '../utils/tecnicaDeSerie';

/* Ajustes de la técnica de un ejercicio (E-06): en qué series va y, para drop
   set y myo-reps, cómo se hace. Lo que no se toca se queda con el valor por
   defecto (no se guarda), así que un ejercicio sin ajustes sigue en la última
   serie con 2 bajadas de −20 %. */

type Props = {
  we: WorkoutExercise;
  totalSets: number;
  onChange: (patch: Partial<WorkoutExercise>) => void;
};

export default function AjustesDeTecnicaEditor({ we, totalSets, onChange }: Props) {
  if (!we.technique) return null;
  const a = ajustesDe(we);
  const guardados = we.tecnicaAjustes ?? {};
  const cambiar = (patch: Partial<AjustesDeTecnica>) => onChange({ tecnicaAjustes: { ...guardados, ...patch } });

  const modo = Array.isArray(a.series) ? 'elegir' : a.series;
  const marcadas = seriesConTecnica(we, totalSets);
  const alternarSerie = (n: number) => {
    const set = new Set(marcadas);
    if (set.has(n)) set.delete(n); else set.add(n);
    // Sin ninguna marcada se vuelve a lo de siempre: la última.
    cambiar({ series: set.size > 0 ? [...set].sort((x, y) => x - y) : 'ultima' });
  };

  return (
    <div className="space-y-3 rounded-control border border-hairline bg-raised p-3">
      {totalSets > 1 && (
        <div className="space-y-2">
          <SegmentedControl
            label="En qué series"
            value={modo}
            onChange={v => cambiar({ series: v === 'elegir' ? marcadas : (v as 'ultima' | 'todas') })}
            options={[
              { value: 'ultima', label: 'Última' },
              { value: 'todas', label: 'Todas' },
              { value: 'elegir', label: 'Elegir' },
            ]}
          />
          {modo === 'elegir' && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Series con la técnica">
              {Array.from({ length: totalSets }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={marcadas.includes(n)}
                  onClick={() => alternarSerie(n)}
                  className={`h-9 min-w-9 rounded-control border px-2 font-mono text-label font-bold transition-colors ${
                    marcadas.includes(n) ? 'border-accent bg-accent text-on-accent' : 'border-hairline text-ink-2 hover:border-strong'
                  }`}
                >{n}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {we.technique === 'dropset' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="font-mono text-caption uppercase tracking-wider text-ink-3">Bajadas</p>
            <Stepper
            label="Bajadas" value={a.dropset.bajadas} min={1} max={4} dense
            onChange={v => cambiar({ dropset: { ...a.dropset, bajadas: v } })}
          />
          </div>
          <div className="space-y-1">
            <p className="font-mono text-caption uppercase tracking-wider text-ink-3">Bajada de peso</p>
            <Stepper
            label="Bajada de peso" unit="%" value={a.dropset.pctBajada} min={5} max={50} step={5} dense
            onChange={v => cambiar({ dropset: { ...a.dropset, pctBajada: v } })}
          />
          </div>
          <SegmentedControl
            className="col-span-2"
            label="Cada bajada hasta el fallo"
            value={a.dropset.hastaFallo ? 'si' : 'no'}
            onChange={v => cambiar({ dropset: { ...a.dropset, hastaFallo: v === 'si' } })}
            options={[{ value: 'si', label: 'Hasta el fallo' }, { value: 'no', label: 'Sin llegar al fallo' }]}
          />
        </div>
      )}

      {we.technique === 'myoreps' && (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Reps de activación" value={a.myoreps.repsActivacion}
            onChange={v => cambiar({ myoreps: { ...a.myoreps, repsActivacion: v } })} />
          <Input label="Miniseries" value={a.myoreps.miniSeries}
            onChange={v => cambiar({ myoreps: { ...a.myoreps, miniSeries: v } })} />
          <Input label="Reps por miniserie" value={a.myoreps.repsMini}
            onChange={v => cambiar({ myoreps: { ...a.myoreps, repsMini: v } })} />
          <div className="space-y-1">
            <p className="font-mono text-caption uppercase tracking-wider text-ink-3">Descanso</p>
            <Stepper
            label="Descanso" unit="s" value={a.myoreps.descansoSeg} min={5} max={60} step={5} dense
            onChange={v => cambiar({ myoreps: { ...a.myoreps, descansoSeg: v } })}
          />
          </div>
        </div>
      )}

      <p className="font-sans text-caption text-ink-2">Lo verá así: {describirTecnica(we, totalSets)}</p>
    </div>
  );
}

import React from 'react';
import type { AjustesDeTecnica, WorkoutExercise } from '../types';
import { SegmentedControl, Stepper, Input } from './ui';
import { ajustesDe, pautaDeSerie, seriesAGuardar, seriesConTecnica, describirTecnica } from '../utils/tecnicaDeSerie';
import { TECHNIQUE_LABEL } from '../utils/workoutTechniques';
import { expandSetGroups } from '../utils/setGroups';

/* Ajustes de la técnica de un ejercicio (E-06, 14-a): una fila por serie para
   marcar en cuáles va y, para drop set y myo-reps, cómo se hace (justo debajo
   de las series, con el % de bajada a mano). Sigue habiendo UNA técnica por
   ejercicio (sin migración): la eligen los chips de arriba. Lo que no se toca
   se queda con el valor por defecto (no se guarda), así que un ejercicio sin
   ajustes sigue en la última serie con 2 bajadas de −20 %. */

type Props = {
  we: WorkoutExercise;
  totalSets: number;
  onChange: (patch: Partial<WorkoutExercise>) => void;
  /** Recordatorio del alcance al editar una semana (14-e): «Se aplica desde S3 · cámbialo arriba». */
  alcance?: string;
};

export default function AjustesDeTecnicaEditor({ we, totalSets, onChange, alcance }: Props) {
  if (!we.technique) return null;
  const a = ajustesDe(we);
  const guardados = we.tecnicaAjustes ?? {};
  const cambiar = (patch: Partial<AjustesDeTecnica>) => onChange({ tecnicaAjustes: { ...guardados, ...patch } });
  const quitar = () => onChange({ technique: undefined, tecnicaAjustes: undefined });

  const filas = expandSetGroups(we).slice(0, Math.max(1, totalSets));
  const marcadas = seriesConTecnica(we, filas.length);
  const marcar = (nums: number[]) => {
    const series = seriesAGuardar(nums, filas.length);
    if (series == null) quitar(); else cambiar({ series });
  };
  const alternarSerie = (n: number) => marcar(marcadas.includes(n) ? marcadas.filter(x => x !== n) : [...marcadas, n]);
  const nombre = TECHNIQUE_LABEL[we.technique];
  const ultimaMarcada = marcadas[marcadas.length - 1];

  const ajustesDrop = we.technique === 'dropset' && (
    <div className="grid grid-cols-1 gap-3 rounded-control border border-accent-line bg-surface p-2.5 sm:grid-cols-2">
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
          label="Bajada de peso de cada bajada" unit="%" value={a.dropset.pctBajada} min={5} max={50} step={5} dense
          onChange={v => cambiar({ dropset: { ...a.dropset, pctBajada: v } })}
        />
      </div>
      <SegmentedControl
        className="sm:col-span-2"
        label="Cada bajada hasta el fallo"
        value={a.dropset.hastaFallo ? 'si' : 'no'}
        onChange={v => cambiar({ dropset: { ...a.dropset, hastaFallo: v === 'si' } })}
        options={[{ value: 'si', label: 'Hasta el fallo' }, { value: 'no', label: 'Sin llegar al fallo' }]}
      />
    </div>
  );

  const ajustesMyo = we.technique === 'myoreps' && (
    <div className="grid grid-cols-1 gap-3 rounded-control border border-accent-line bg-surface p-2.5 sm:grid-cols-2">
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
  );

  return (
    <div className="space-y-3 rounded-control border border-hairline bg-raised p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-caption uppercase tracking-wider text-ink-3">En qué series</p>
        <p className="font-sans text-caption text-ink-3">
          Marcar:{' '}
          <button type="button" className="text-accent-ink hover:underline" onClick={() => marcar([filas.length])}>Última</button>{' · '}
          <button type="button" className="text-accent-ink hover:underline" onClick={() => marcar(filas.map((_, i) => i + 1))}>Todas</button>{' · '}
          <button type="button" className="text-accent-ink hover:underline" onClick={quitar}>Ninguna</button>
        </p>
      </div>

      <ul className="m-0 list-none space-y-1.5 p-0">
        {filas.map((f, i) => {
          const n = i + 1;
          const on = marcadas.includes(n);
          return (
            <li key={n} className="space-y-1.5">
              <div className={`flex items-center justify-between gap-2 rounded-control border px-2.5 py-2 ${on ? 'bg-surface border-accent-press ring-1 ring-inset ring-accent-press' : 'border-hairline bg-surface'}`}>
                <span className="min-w-0 font-sans text-label text-ink">
                  <b className="font-mono">Serie {n}</b> · {f.reps} · RIR {f.rir}{f.label ? <span className="text-ink-3"> · {f.label}</span> : null}
                </span>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${on ? 'Quitar' : 'Poner'} ${nombre.toLowerCase()} en la serie ${n}`}
                  onClick={() => alternarSerie(n)}
                  className={`shrink-0 rounded-control border px-2.5 py-1 font-sans text-caption font-bold transition-colors ${
                    on ? 'border-accent bg-accent text-on-accent' : 'border-hairline text-ink-2 hover:border-strong'
                  }`}
                >{on ? `✓ ${nombre}` : 'Sin técnica'}</button>
              </div>
              {on && <p className="ml-2 border-l-2 border-accent-line pl-2.5 font-sans text-caption text-ink-2">{pautaDeSerie(we)}</p>}
              {/* Cómo se hace va justo debajo de la última serie marcada: ahí se
                  elige el % de bajada (vale para todas las marcadas). */}
              {on && n === ultimaMarcada && (ajustesDrop || ajustesMyo)}
            </li>
          );
        })}
      </ul>

      <p className="font-sans text-caption text-ink-2">Lo verá así: {describirTecnica(we, totalSets)}</p>
      {alcance && <p className="font-sans text-caption text-ink-3">{alcance}</p>}
    </div>
  );
}

import React, { useState } from 'react';
import type { WorkoutLog } from '../../types';
import { Button } from '../ui';
import { ejercicioDelCambio, estadoDeHipotesis, textoDeResultado, type EjercicioParaMirar, type Hipotesis } from '../../utils/hipotesis';

export type { EjercicioParaMirar };
import { addDays } from '../../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   La hipótesis de un cambio, debajo del propio cambio (S5, versión «dentro de
   cada cambio», elegida por Dani el 11-11-2026 entre tres).

   Cuatro estados, en el mismo hueco:
     · sin hipótesis  → enlace «+ Qué espero de este cambio» y, al pulsarlo, el
                        formulario (una frase, en qué ejercicio mirarlo y
                        cuándo);
     · en observación → lo que se espera y la fecha;
     · toca revisar   → el antes y el después, y tres salidas;
     · cerrada        → cómo acabó.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  /** El cambio al que acompaña: su id es el de la hipótesis. */
  cambio: { id: string; at: string; titulo: string; lineas: string[] };
  hipotesis: Hipotesis | undefined;
  logs: readonly WorkoutLog[];
  /** Ejercicios que el atleta ha entrenado hace poco, para elegir dónde mirarlo. */
  ejercicios: readonly EjercicioParaMirar[];
  hoy: string;
  onGuardar: (h: Hipotesis) => void;
}

const fecha = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const CAMPO = 'w-full bg-bg border border-control-line rounded-control px-3 py-2 font-sans text-label text-ink placeholder-ink-2/40 focus:outline-none focus:ring-1 focus:ring-accent';

export default function HipotesisDeCambio({ cambio, hipotesis: h, logs, ejercicios, hoy, onGuardar }: Props) {
  const idEspero = React.useId();
  const idEjercicio = React.useId();
  const [editando, setEditando] = useState(false);
  const [espero, setEspero] = useState('');
  const [exerciseId, setExerciseId] = useState(() => ejercicioDelCambio(cambio, ejercicios));
  const [semanas, setSemanas] = useState(3);
  const nombreDe = (id: string | undefined) => ejercicios.find(e => e.id === id)?.nombre;
  const dia = cambio.at.slice(0, 10);

  if (!h && !editando) {
    return (
      <button type="button" onClick={() => setEditando(true)} className="mt-1.5 font-mono text-caption text-accent-ink hover:underline">
        + Qué espero de este cambio
      </button>
    );
  }

  if (!h) {
    const guardar = () => {
      if (!espero.trim()) return;
      onGuardar({ id: cambio.id, cambioId: cambio.id, espero: espero.trim(), exerciseId: exerciseId || undefined, desde: dia, revisarEl: addDays(dia, semanas * 7) });
      setEditando(false);
    };
    return (
      <div className="mt-2 space-y-2 rounded-control border border-hairline bg-raised p-3">
        <label htmlFor={idEspero} className="sr-only">Qué espero de este cambio</label>
        <input id={idEspero} value={espero} onChange={e => setEspero(e.target.value)} placeholder="Qué espero de este cambio…" className={CAMPO} />
        {ejercicios.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor={idEjercicio} className="shrink-0 font-sans text-caption text-ink-2">Lo miro en</label>
            <select id={idEjercicio} value={exerciseId} onChange={e => setExerciseId(e.target.value)} className={CAMPO}>
              <option value="">Ningún ejercicio en concreto</option>
              {ejercicios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-sans text-caption text-ink-2">Dentro de</span>
          {[2, 3, 4].map(s => (
            <button key={s} type="button" onClick={() => setSemanas(s)} aria-pressed={semanas === s}
              className={`rounded-control border px-2.5 py-1 font-sans text-caption ${semanas === s ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2'}`}>
              {s} semanas
            </button>
          ))}
          <span className="flex-1" />
          <Button size="s" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
          <Button size="s" disabled={!espero.trim()} onClick={guardar}>Guardar</Button>
        </div>
      </div>
    );
  }

  const estado = estadoDeHipotesis(h, hoy);
  const resultado = textoDeResultado(h, logs, nombreDe(h.exerciseId));

  if (estado === 'en_observacion') {
    return (
      <p className="mt-1.5 font-sans text-caption text-ink-2">
        <span className="font-bold text-ink">Espero:</span> {h.espero} · lo miro el {fecha(h.revisarEl)}
      </p>
    );
  }

  if (estado === 'cerrada') {
    const bien = h.cierre!.resultado === 'funciono';
    return (
      <p className={`mt-1.5 font-sans text-caption font-bold ${bien ? 'text-success' : 'text-danger'}`}>
        {bien ? 'Funcionó' : 'No funcionó'} · <span className="font-normal text-ink-2">esperaba: {h.espero.toLowerCase()} · {resultado}</span>
      </p>
    );
  }

  const cerrar = (r: 'funciono' | 'no_funciono') => onGuardar({ ...h, cierre: { resultado: r, at: new Date().toISOString() } });
  return (
    <div className="mt-2 space-y-2 rounded-control border border-warning/40 bg-warning/10 p-3">
      <p className="font-sans text-caption font-bold text-ink">Toca revisarlo · esperabas: {h.espero.toLowerCase()}</p>
      <p className="font-mono text-caption text-ink">{resultado}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="s" variant="secondary" icon="check" onClick={() => cerrar('funciono')}>Funcionó</Button>
        <Button size="s" variant="secondary" icon="close" onClick={() => cerrar('no_funciono')}>No funcionó</Button>
        <Button size="s" variant="ghost" onClick={() => onGuardar({ ...h, revisarEl: addDays(hoy, 14) })}>2 semanas más</Button>
      </div>
    </div>
  );
}

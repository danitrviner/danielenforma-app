import React, { useState } from 'react';
import type { WorkoutLog } from '../../types';
import { Card, Icon } from '../ui';
import type { Hipotesis } from '../../utils/hipotesis';
import HipotesisDeCambio, { type EjercicioParaMirar } from './HipotesisDeCambio';

/* Banco de pruebas de los CAMBIOS CON HIPÓTESIS (`/dev/hipotesis`, solo en
   desarrollo) — S5. Pinta la pieza real (HipotesisDeCambio.tsx) dentro de una
   copia del widget «Entreno» de «Lo que he cambiado», con un historial
   inventado para que el antes y el después tengan números. No lee ni escribe
   nada de Firestore.

   Hay un cambio sin hipótesis, uno en observación y uno que ya toca revisar.
   Las otras dos versiones que hubo aquí (bloque aparte y un toque + aviso al
   vencer) se borraron cuando Dani eligió esta (11-11-2026). */

const HOY = '2026-11-11';

interface Cambio { id: string; titulo: string; at: string; lineas: string[] }
const CAMBIOS: Cambio[] = [
  { id: 'c3', titulo: 'Mesociclo #3 · Curl en polea', at: '2026-11-09', lineas: ['Reps 10-12 → 12-15'] },
  { id: 'c2', titulo: 'Mesociclo #3', at: '2026-11-04', lineas: ['Dorsal 12 → 14 series'] },
  { id: 'c1', titulo: 'Mesociclo #3 · Press banca', at: '2026-10-21', lineas: ['Descanso 90 → 150 s'] },
];
const EJERCICIOS: EjercicioParaMirar[] = [
  { id: 'curl', nombre: 'Curl en polea' }, { id: 'press', nombre: 'Press banca' }, { id: 'remo', nombre: 'Remo en polea' },
];

let n = 0;
const sesion = (date: string, exerciseId: string, weight: number, reps: number[]): WorkoutLog => ({
  id: `l${n++}`, athleteId: 'a', workoutId: 'w', assignmentId: 'x', date, completedAt: '',
  entries: [{ exerciseId, sets: reps.map(repsDone => ({ weight, repsDone, rir: 1 })) }],
}) as WorkoutLog;
const LOGS: WorkoutLog[] = [
  sesion('2026-10-06', 'press', 80, [8, 6, 5]), sesion('2026-10-13', 'press', 80, [8, 6, 5]), sesion('2026-10-20', 'press', 80, [8, 7, 5]),
  sesion('2026-10-27', 'press', 80, [9, 8, 7]), sesion('2026-11-03', 'press', 80, [10, 8, 8]), sesion('2026-11-10', 'press', 82.5, [9, 8, 7]),
  sesion('2026-10-28', 'remo', 60, [10, 10, 9]), sesion('2026-11-06', 'remo', 60, [10, 10, 10]),
];

const INICIALES: Hipotesis[] = [
  { id: 'c1', cambioId: 'c1', espero: 'Más reps en la 2.ª y la 3.ª serie', exerciseId: 'press', desde: '2026-10-21', revisarEl: '2026-11-11' },
  { id: 'c2', cambioId: 'c2', espero: 'Que el remo suba sin que le cueste recuperar', exerciseId: 'remo', desde: '2026-11-04', revisarEl: '2026-11-25' },
];

const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
/** La entrada de «Lo que he cambiado», calcada de BloqueCambios, con un hueco debajo. */
function Entrada({ c, children }: { c: Cambio; children?: React.ReactNode; key?: React.Key }) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0 border-t first:border-t-0 border-hairline">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-sans text-label font-bold text-ink truncate">{c.titulo}</p>
        <span className="font-mono text-caption text-ink-3 flex-shrink-0">{fecha(c.at)}</span>
      </div>
      <ul className="m-0 mt-1 p-0 list-none space-y-0.5">
        {c.lineas.map((l, i) => <li key={i} className="font-mono text-caption text-ink-2">{l}</li>)}
      </ul>
      {children}
    </li>
  );
}

function WidgetEntreno({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 space-y-3" aria-label="Entreno">
      <header className="flex items-center justify-between gap-2">
        <h4 className="font-sans font-bold text-label text-ink flex items-center gap-2">
          <Icon name="fitness_center" size="s" className="text-accent-ink" />
          Entreno
        </h4>
        <span className="font-mono text-caption text-ink-3">{CAMBIOS.length} cambios</span>
      </header>
      <ul className="m-0 p-0 list-none">{children}</ul>
    </section>
  );
}

export default function HipotesisDevHarness() {
  const [hipotesis, setHipotesis] = useState<Hipotesis[]>(INICIALES);
  const guardar = (h: Hipotesis) => setHipotesis(prev => [...prev.filter(x => x.id !== h.id), h]);
  return (
    <div className="min-h-screen bg-bg px-4 py-6">
      <div className="mx-auto max-w-[720px] space-y-4">
        <h1 className="font-display text-title-l uppercase text-ink">Cambios con hipótesis</h1>
        <p className="font-sans text-label text-ink-2">Revisión de un atleta de prueba, a {fecha(HOY)}. Nada de lo que toques aquí se guarda.</p>
        <Card title="12. Lo que he cambiado" className="space-y-3">
          <WidgetEntreno>
            {CAMBIOS.map(c => (
              <Entrada key={c.id} c={c}>
                <HipotesisDeCambio
                  cambio={c} hipotesis={hipotesis.find(h => h.id === c.id)}
                  logs={LOGS} ejercicios={EJERCICIOS} hoy={HOY} onGuardar={guardar}
                />
              </Entrada>
            ))}
          </WidgetEntreno>
        </Card>
      </div>
    </div>
  );
}

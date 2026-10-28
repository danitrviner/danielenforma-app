import { useMemo, useState } from 'react';
import type { Mesocycle, Workout, WorkoutAssignment } from '../../types';
import { Badge, SegmentedControl } from '../ui';
import EstadoDelBloque, { chipDeEstado } from './EstadoDelBloque';
import { estadoDelMeso } from '../../utils/bloqueDelAtleta';
import { nombreDeMeso } from '../../utils/nombresMeso';
import { addDays } from '../../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de «El atleta ve ahora» + estado del bloque (Mesociclo,
   coach) — ruta `/dev/bloque-atleta`, solo en desarrollo. Sin sesión ni
   Firestore: el caso real de Dani a 28-10 (Hipertrofia 1 + las sesiones de un
   «Meso #1» borrado) y los escenarios de cambio de bloque, todo en memoria.
   ═══════════════════════════════════════════════════════════════════════════ */

const HOY = '2026-10-28';
const H1: Mesocycle = {
  id: 'h1', athleteId: 'dani@enforma.app', number: 2, name: 'Hipertrofia 1', weeks: 9,
  startDate: '2026-10-19', objective: 'Hipertrofia', daysPerWeek: 5, groups: {} as Mesocycle['groups'],
};
const H2: Mesocycle = { ...H1, id: 'h2', number: 3, name: 'Hipertrofia 2', startDate: '2026-11-02', weeks: 6 };
const WORKOUTS: Workout[] = [
  { id: 'm1-w0', ownerId: 'coach', name: 'Dia 1 - Meso #1', exercises: [] },
];

function sesiones(mesoId: string, desde: string, semanas: number, offsets: number[], prefijo: string, hoy = HOY): WorkoutAssignment[] {
  const out: WorkoutAssignment[] = [];
  for (let s = 0; s < semanas; s++) {
    offsets.forEach((o, i) => {
      const date = addDays(desde, s * 7 + o);
      out.push({
        id: `${prefijo}-${s}-${i}`, workoutId: `${prefijo}-w${i}`, athleteId: 'dani@enforma.app', date, mesocycleId: mesoId,
        status: date < hoy ? (i % 3 === 0 ? 'perdido' : 'completed') : 'pending',
      });
    });
  }
  return out;
}

const DEL_H1 = sesiones('h1', '2026-10-19', 9, [0, 1, 2, 4, 5], 'h1');
const DEL_BORRADO = sesiones('borrado', '2026-08-24', 20, [0, 1, 2, 3, 4, 5], 'm1');

type Escenario = 'real' | 'limpio' | 'nuevo' | 'borrador' | 'fechas';
const ESCENARIOS: { value: Escenario; label: string }[] = [
  { value: 'real', label: 'Caso real 28-10' },
  { value: 'limpio', label: 'Ya limpio' },
  { value: 'nuevo', label: 'Bloque nuevo' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'fechas', label: 'Fechas movidas' },
];

function datos(e: Escenario): { meso: Mesocycle; mesos: Mesocycle[]; asignaciones: WorkoutAssignment[] } {
  switch (e) {
    case 'real': return { meso: H1, mesos: [H1], asignaciones: [...DEL_H1, ...DEL_BORRADO] };
    case 'limpio': return { meso: H1, mesos: [H1], asignaciones: DEL_H1 };
    case 'nuevo': return { meso: H2, mesos: [H1, H2], asignaciones: [...DEL_H1, ...sesiones('h2', '2026-11-02', 6, [0, 1, 2, 4, 5], 'h2')] };
    case 'borrador': return { meso: H2, mesos: [H1, H2], asignaciones: DEL_H1 };
    case 'fechas': return { meso: { ...H1, startDate: '2026-10-21' }, mesos: [H1], asignaciones: DEL_H1 };
  }
}

export default function BloqueAtletaDevHarness() {
  const [escenario, setEscenario] = useState<Escenario>('real');
  const base = useMemo(() => datos(escenario), [escenario]);
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());
  const asignaciones = base.asignaciones.filter(a => !quitadas.has(a.id));

  return (
    <div className="min-h-screen bg-bg text-ink p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <p className="font-mono text-caption uppercase tracking-wider text-ink-2">/dev/bloque-atleta · hoy {HOY}</p>
          <h1 className="font-sans font-bold text-title-l">Qué bloque ve el atleta</h1>
        </div>
        <SegmentedControl label="Escenario" options={ESCENARIOS} value={escenario}
          onChange={v => { setEscenario(v as Escenario); setQuitadas(new Set()); }} />

        <div className="flex gap-2 flex-wrap" data-testid="chips-lista">
          {base.mesos.map(m => {
            const chip = chipDeEstado(estadoDelMeso(m, asignaciones, base.mesos, HOY));
            return (
              <div key={m.id} className="rounded-control border border-hairline bg-surface p-3 w-60">
                <p className="font-mono text-caption uppercase text-ink-2">{nombreDeMeso(m)}</p>
                <div className="mt-1.5"><Badge tone={chip.tono}>{chip.texto}</Badge></div>
              </div>
            );
          })}
        </div>

        <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
          <h2 className="font-sans font-bold text-title-s">{nombreDeMeso(base.meso)}</h2>
          <EstadoDelBloque
            meso={base.meso}
            mesos={base.mesos}
            assignments={asignaciones}
            hoy={HOY}
            workouts={WORKOUTS}
            onQuitar={async g => { setQuitadas(prev => new Set([...prev, ...g.asignaciones.map(a => a.id)])); }}
            fechasMovidas={escenario === 'fechas' ? { onMover: () => setEscenario('limpio'), trabajando: false } : undefined}
          />
        </div>
      </div>
    </div>
  );
}

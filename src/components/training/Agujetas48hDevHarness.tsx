import React, { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Exercise, Workout, WorkoutLog } from '../../types';
import { sesionParaAgujetas48h } from '../../utils/agujetas48h';
import { SegmentedControl, Button } from '../ui';
import Agujetas48h, { type RespuestaAgujetas48h, type VarianteAgujetas48h } from './Agujetas48h';
import Agujetas48hInicio, { claveLogsAgujetas48h, PREFIJO_AHORA_NO } from './Agujetas48hInicio';

/* Banco de pruebas de las agujetas a las 48 h (D7, 17-11-2026) — `/dev/agujetas`.
   Datos de mentira y nada de Firestore: la pregunta sale de la MISMA lógica
   que en Inicio (`sesionParaAgujetas48h`) sobre tres sesiones inventadas, y el
   guardado es un temporizador. Conmutador de variante (`tarjeta` / `hoja`) para
   que Dani elija, y un interruptor para ver el fallo al guardar.

   Abajo, «Como en Inicio»: el contenedor REAL (`Agujetas48hInicio`) con la
   caché sembrada con dos sesiones en la ventana. Ahí se ve el recorrido entero:
   primero la más antigua, al guardarla pasa a la siguiente y luego desaparece;
   «Ahora no» se recuerda en el dispositivo. */

const AHORA = Date.now();
const hace = (horas: number) => new Date(AHORA - horas * 3_600_000).toISOString();
const ej = (id: string, muscleGroup: Exercise['muscleGroup']) => ({ id, muscleGroup });
const EJERCICIOS = [
  ej('sentadilla', 'cuadriceps'), ej('prensa', 'cuadriceps'), ej('curl_femoral', 'isquios'), ej('hip_thrust', 'gluteo'),
  ej('aductor', 'aductores'), ej('gemelo', 'gemelo'), ej('press', 'pecho'), ej('remo', 'dorsal'), ej('curl', 'biceps'),
];
const RUTINAS: Pick<Workout, 'id' | 'name' | 'exercises'>[] = [
  { id: 'pierna_a', name: 'Pierna A', exercises: [] },
  { id: 'torso_a', name: 'Torso A', exercises: [] },
  { id: 'brazo', name: 'Brazo', exercises: [] },
];
const entrada = (exerciseId: string, series: number) => ({ exerciseId, sets: Array.from({ length: series }, () => ({ weight: 60, repsDone: 8, rir: 2 })) });
const sesion = (id: string, workoutId: string, horas: number, entries: WorkoutLog['entries']): WorkoutLog => ({
  id, athleteId: 'dev.atleta@example.com', workoutId, assignmentId: `as_${id}`, date: hace(horas).slice(0, 10), completedAt: hace(horas), entries,
});

const EMAIL = 'dev.atleta@example.com';
/** Dos sesiones en la ventana (hace 60 h y hace 40 h) y una ya fuera (hace 80 h). */
const LOGS_DE_INICIO: WorkoutLog[] = [
  sesion('i_torso', 'torso_a', 40, [entrada('press', 4), entrada('remo', 4), entrada('curl', 2)]),
  sesion('i_pierna', 'pierna_a', 60, [entrada('sentadilla', 4), entrada('curl_femoral', 3), entrada('hip_thrust', 3)]),
  sesion('i_vieja', 'brazo', 80, [entrada('curl', 5)]),
];
const olvidarAhoraNo = () => {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIJO_AHORA_NO)).forEach(k => localStorage.removeItem(k));
  } catch { /* sin almacenamiento no hay nada que olvidar */ }
};

/** El contenedor real de Inicio sobre una caché sembrada: ni una lectura a Firestore. */
function ComoEnInicio({ variante, falla }: { variante: VarianteAgujetas48h; falla: boolean; key?: React.Key }) {
  const [guardadas, setGuardadas] = useState<Array<{ logId: string } & RespuestaAgujetas48h>>([]);
  const client = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    c.setQueryData(claveLogsAgujetas48h(EMAIL), LOGS_DE_INICIO);
    c.setQueryData(['exercises'], EJERCICIOS);
    return c;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <Agujetas48hInicio
        athleteEmail={EMAIL}
        workouts={RUTINAS as Workout[]}
        variante={variante}
        guardarEn={(logId, r) => new Promise<void>((ok, ko) => setTimeout(() => {
          if (falla) { ko(new Error('fallo de mentira')); return; }
          setGuardadas(g => [...g, { logId, ...r }]); ok();
        }, 500))}
      />
      <p className="font-sans text-caption text-ink-3">
        {guardadas.length === 0 ? 'Nada guardado todavía. Si no ves tarjeta, está en pausa por un «Ahora no».' : `Guardadas: ${guardadas.map(g => `${g.logId} ${JSON.stringify(g.agujetas48h)}`).join(' · ')}`}
      </p>
    </QueryClientProvider>
  );
}

type Caso = 'pierna' | 'torso' | 'una';
const CASOS: Record<Caso, { etiqueta: string; logs: WorkoutLog[] }> = {
  pierna: { etiqueta: 'Pierna · 5 zonas', logs: [sesion('l_pierna', 'pierna_a', 50, [entrada('sentadilla', 4), entrada('prensa', 3), entrada('curl_femoral', 4), entrada('hip_thrust', 3), entrada('aductor', 2), entrada('gemelo', 2), entrada('curl', 1)])] },
  torso: { etiqueta: 'Torso · 3 zonas', logs: [sesion('l_torso', 'torso_a', 44, [entrada('press', 4), entrada('remo', 4), entrada('curl', 2)])] },
  una: { etiqueta: 'Brazo · 1 zona', logs: [sesion('l_brazo', 'brazo', 40, [entrada('curl', 5)])] },
};

export default function Agujetas48hDevHarness() {
  // `?variante=hoja&vista=inicio` abre directamente esa combinación (para enlazarla o recargar sin perderla).
  const params = new URLSearchParams(window.location.search);
  const [variante, setVariante] = useState<VarianteAgujetas48h>(params.get('variante') === 'hoja' ? 'hoja' : 'tarjeta');
  const [vista, setVista] = useState<'pieza' | 'inicio'>(params.get('vista') === 'inicio' ? 'inicio' : 'pieza');
  const [caso, setCaso] = useState<Caso>('pierna');
  const [falla, setFalla] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [estado, setEstado] = useState<'preguntando' | 'descartada' | 'guardada'>('preguntando');
  const [guardado, setGuardado] = useState<RespuestaAgujetas48h | null>(null);

  const pregunta = useMemo(() => sesionParaAgujetas48h({ logs: CASOS[caso].logs, workouts: RUTINAS, exercises: EJERCICIOS, ahora: AHORA }), [caso]);
  const reiniciar = () => { setEstado('preguntando'); setGuardado(null); setVuelta(v => v + 1); };
  const cambiar = <T,>(poner: (v: T) => void) => (v: T) => { poner(v); reiniciar(); };

  return (
    <div className="min-h-screen bg-bg text-ink p-4">
      <div className="max-w-sm mx-auto space-y-4">
        <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">/dev/agujetas — datos de mentira</p>
        <SegmentedControl
          label="Variante"
          value={variante}
          onChange={cambiar(v => setVariante(v as VarianteAgujetas48h))}
          options={[{ value: 'tarjeta', label: 'Tarjeta' }, { value: 'hoja', label: 'Hoja' }]}
        />
        {/* Una vista cada vez: con la variante `hoja` no pueden abrirse dos a la vez. */}
        <SegmentedControl
          label="Vista"
          value={vista}
          onChange={cambiar(v => setVista(v as 'pieza' | 'inicio'))}
          options={[{ value: 'pieza', label: 'La pieza suelta' }, { value: 'inicio', label: 'Como en Inicio' }]}
        />
        <label className="flex items-center gap-2 font-sans text-caption text-ink-2">
          <input type="checkbox" checked={falla} onChange={e => setFalla(e.target.checked)} />
          Que falle al guardar (para ver el reintento)
        </label>

        {vista === 'pieza' ? (
          <>
            <SegmentedControl
              label="Sesión"
              value={caso}
              onChange={cambiar(v => setCaso(v as Caso))}
              options={(Object.keys(CASOS) as Caso[]).map(c => ({ value: c, label: CASOS[c].etiqueta }))}
            />
            <p className="font-mono text-caption text-ink-3 uppercase tracking-widest pt-2">
              {variante === 'tarjeta' ? 'Inicio · tarjeta compacta' : 'Inicio · hoja al abrir la app'}
            </p>
            {estado === 'preguntando' && pregunta && (
              <Agujetas48h
                key={`${variante}-${caso}-${vuelta}`}
                pregunta={pregunta}
                variante={variante}
                onGuardar={r => new Promise<void>((ok, ko) => setTimeout(() => {
                  if (falla) { ko(new Error('fallo de mentira')); return; }
                  setGuardado(r); ok();
                }, 500))}
                onGuardado={() => setEstado('guardada')}
                onAhoraNo={() => setEstado('descartada')}
              />
            )}
            {estado !== 'preguntando' && (
              <div className="rounded-control border border-dashed border-strong p-4 space-y-2">
                <p className="font-sans text-body-s text-ink-2">
                  {estado === 'guardada'
                    ? 'Guardada: la tarjeta desaparece de Inicio.'
                    : 'Descartada con «Ahora no»: vuelve a salir a las 4 h si la sesión sigue en la ventana de 36-72 h.'}
                </p>
                {guardado && <pre className="font-mono text-caption text-ink-3 whitespace-pre-wrap break-all">{JSON.stringify(guardado, null, 1)}</pre>}
                <Button size="s" variant="secondary" onClick={reiniciar}>Volver a preguntar</Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="font-mono text-caption text-ink-3 uppercase tracking-widest pt-2">Contenedor real · dos sesiones en la ventana (hace 60 h y 40 h)</p>
            <ComoEnInicio key={`${variante}-${vuelta}`} variante={variante} falla={falla} />
            <Button size="s" variant="secondary" onClick={() => { olvidarAhoraNo(); reiniciar(); }}>Empezar de cero (olvida los «Ahora no»)</Button>
          </>
        )}
      </div>
    </div>
  );
}

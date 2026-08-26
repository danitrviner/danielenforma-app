import React, { useState } from 'react';
import { CardioSessionType, CardioIntervalBlock, CardioIntervalCloseType, CardioProgram, CardioZones } from '../../types';
import { createCardioAssignment } from '../../dbService';
import { ZONE_ORDER } from '../../utils/cardioZones';
import { PROTOCOLOS_VO2MAX, ZONA2_BASE_MIN_DEFECTO, prescripcionDeSemana, previaDelPrograma } from '../../utils/cardioProgression';
import { Button, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Formulario de prescripción de cardio — un único sitio donde se escribe.

   Extraído de CardioCoachScreen (Biblioteca › Cardio › Prescripción) para
   poder usarse también dentro de la ficha del atleta (Plan › Cardio,
   `ClientCardioPanel`), a petición de Dani (26-08): "desde el apartado de
   cardio de Plan tenemos que ser capaces de configurar y programar sesiones
   de cardio específicas". Antes solo se podía prescribir yendo a Biblioteca
   y eligiendo el atleta de un desplegable — un paso de más cuando el coach ya
   está mirando la ficha de ese atleta concreto.

   El atleta es un PROP fijo (`athleteEmail`), no un desplegable: eso es lo
   único que cambia según quién lo use. Biblioteca sigue eligiendo atleta con
   un `<select>` por encima; la ficha ya sabe de quién es.

   Segunda pieza nueva: el toggle Recurrente / Día concreto. Antes toda
   prescripción era "3x/semana para siempre" — no había forma de poner
   "el jueves que viene, Zona 2" para un día suelto. El tipo `CardioAssignment`
   ya tenía el campo `date` desde el principio pero nada lo usaba: ni esta
   pantalla lo escribía, ni `pickActiveZona2Assignment`/`pickActiveIntervalAssignment`
   lo miraban al elegir el cardio de hoy (arreglado en `cardioSession.ts`
   junto con este formulario — sin eso, una sesión puntual para el jueves se
   habría visto también el martes, que es justo el fallo que hacía inútil el
   campo). Con fecha puesta, la sesión de Zona 2/intervalos SOLO se ve ese día;
   los programas progresivos no tienen sentido para un día suelto (una
   progresión necesita semanas), así que en este modo se ocultan.
   ═══════════════════════════════════════════════════════════════════════════ */

const EMPTY_BLOCK = (): CardioIntervalBlock => ({ label: '', closeType: 'time', durationSec: 30, targetZone: 'z5' });

// F9: etiquetas del selector de tipo de cierre por bloque — 'distance' queda
// fuera, depende de GPS (F7 aparcado).
const CLOSE_TYPE_LABEL: Record<CardioIntervalCloseType, string> = {
  time: 'Por tiempo', zone: 'Al llegar a zona', heartRate: 'Por FC', calories: 'Por calorías', manual: 'Manual',
};

// Modo series: en vez de montar bloque a bloque, se elige un protocolo
// (trabajo/descanso × repeticiones) y se genera la lista de bloques sola.
interface SeriesPreset {
  label: string;
  workSec: number;
  restSec: number;
  reps: number;
  workZone: keyof CardioZones;
  restZone: keyof CardioZones;
  hint: string;
}

const SERIES_PRESETS: SeriesPreset[] = [
  { label: 'Tabata', workSec: 20, restSec: 10, reps: 8, workZone: 'z5', restZone: 'z1', hint: '20s/10s × 8 — VO2máx, muy corto e intenso' },
  { label: 'Series Z5 clásicas', workSec: 30, restSec: 90, reps: 8, workZone: 'z5', restZone: 'z1', hint: '30s/90s × 8 — el estándar para Z5' },
  { label: 'HIIT 40/20', workSec: 40, restSec: 20, reps: 10, workZone: 'z4', restZone: 'z1', hint: '40s/20s × 10 — umbral-Z5, más volumen' },
  { label: 'Noruego 4×4', workSec: 240, restSec: 180, reps: 4, workZone: 'z4', restZone: 'z1', hint: '4min/3min × 4 — VO2máx clásico de resistencia' },
];

function generateSeriesBlocks(preset: Pick<SeriesPreset, 'workSec' | 'restSec' | 'reps' | 'workZone' | 'restZone'>): CardioIntervalBlock[] {
  const blocks: CardioIntervalBlock[] = [];
  for (let i = 1; i <= preset.reps; i++) {
    blocks.push({ label: `Serie ${i}`, closeType: 'time', durationSec: preset.workSec, targetZone: preset.workZone });
    if (i < preset.reps) {
      blocks.push({ label: `Recuperación ${i}`, closeType: 'time', durationSec: preset.restSec, targetZone: preset.restZone });
    }
  }
  return blocks;
}

function SeriesModePicker({ onGenerate }: { onGenerate: (blocks: CardioIntervalBlock[]) => void }) {
  const [workSec, setWorkSec] = useState('30');
  const [restSec, setRestSec] = useState('90');
  const [reps, setReps] = useState('8');
  const [workZone, setWorkZone] = useState<keyof CardioZones>('z5');
  const [restZone, setRestZone] = useState<keyof CardioZones>('z1');

  const applyPreset = (p: SeriesPreset) => {
    setWorkSec(String(p.workSec)); setRestSec(String(p.restSec)); setReps(String(p.reps));
    setWorkZone(p.workZone); setRestZone(p.restZone);
    onGenerate(generateSeriesBlocks(p));
  };

  const applyCustom = () => {
    onGenerate(generateSeriesBlocks({
      workSec: Number(workSec) || 30, restSec: Number(restSec) || 90, reps: Number(reps) || 1, workZone, restZone,
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SERIES_PRESETS.map(p => (
          <button key={p.label} type="button" onClick={() => applyPreset(p)} title={p.hint}
            className="px-3 py-2 bg-surface border border-hairline rounded-control text-caption font-sans text-white hover:border-accent transition-colors">
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input type="number" min={5} value={workSec} onChange={e => setWorkSec(e.target.value)} placeholder="Trabajo (s)"
          className="w-24 bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
        <select value={workZone} onChange={e => setWorkZone(e.target.value as keyof CardioZones)}
          className="bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent">
          {ZONE_ORDER.map(z => <option key={z} value={z}>{z.toUpperCase()}</option>)}
        </select>
        <span className="text-caption text-ink-2 font-mono">/</span>
        <input type="number" min={5} value={restSec} onChange={e => setRestSec(e.target.value)} placeholder="Descanso (s)"
          className="w-24 bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
        <select value={restZone} onChange={e => setRestZone(e.target.value as keyof CardioZones)}
          className="bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent">
          {ZONE_ORDER.map(z => <option key={z} value={z}>{z.toUpperCase()}</option>)}
        </select>
        <span className="text-caption text-ink-2 font-mono">×</span>
        <input type="number" min={1} value={reps} onChange={e => setReps(e.target.value)} placeholder="Reps"
          className="w-16 bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
        <Button variant="ghost" size="s" onClick={applyCustom} icon="bolt">Generar</Button>
      </div>
    </div>
  );
}

// Lo que el coach elige en el desplegable. Los tres primeros son la
// prescripción de siempre —una sesión fija que se repite igual cada semana—;
// los dos «progresivos» crean un PROGRAMA: la carga de cada semana no se
// guarda, se deriva de lo que el atleta lleva hecho (utils/cardioProgression).
// Los programas solo tienen sentido en modo Recurrente — una progresión
// necesita semanas, no un día suelto.
type ModoPrescripcion = 'zona2' | 'libre' | 'intervalos' | 'prog_zona2' | 'prog_vo2max';

const MODO_LABEL: Record<ModoPrescripcion, string> = {
  zona2: 'Sesión Zona 2 (fija)',
  libre: 'Libre',
  intervalos: 'Intervalos (fijos)',
  prog_zona2: 'Zona 2 progresiva ▲',
  prog_vo2max: 'VO₂máx progresivo ▲',
};

const MODOS_PUNTUAL: ModoPrescripcion[] = ['zona2', 'libre', 'intervalos'];

/**
 * Editor de un programa progresivo. Lo importante aquí es la PREVIA: el coach
 * no está eligiendo la sesión de esta semana, está eligiendo a dónde lleva el
 * atleta en dos meses, y eso no se puede aprobar a ciegas.
 */
function ProgramaProgresivoEditor({
  modo, protocolId, onProtocolId, startDate, onStartDate, baseMin, onBaseMin,
}: {
  modo: 'prog_zona2' | 'prog_vo2max';
  protocolId: string; onProtocolId: (v: string) => void;
  startDate: string; onStartDate: (v: string) => void;
  baseMin: string; onBaseMin: (v: string) => void;
}) {
  const program: CardioProgram = modo === 'prog_vo2max'
    ? { kind: 'vo2max', protocolId, startDate }
    : { kind: 'zona2', protocolId: 'zona2', startDate, baseMinutes: Number(baseMin) || ZONA2_BASE_MIN_DEFECTO, targetZone: 'z2' };
  const previa = previaDelPrograma(program, 1, 8);

  return (
    <div className="space-y-3 bg-bg border border-hairline rounded-surface p-3">
      {modo === 'prog_vo2max' ? (
        <div className="space-y-2">
          <p className="text-caption font-sans uppercase text-ink-2">Protocolo</p>
          {PROTOCOLOS_VO2MAX.map(p => (
            <button key={p.id} type="button" onClick={() => onProtocolId(p.id)}
              className={`w-full text-left p-3 rounded-control border transition-colors ${protocolId === p.id ? 'border-accent bg-accent/10' : 'border-hairline bg-surface hover:border-accent/40'}`}>
              <span className="block font-sans font-bold text-body-s text-white">{p.label}</span>
              <span className="block text-caption font-sans text-ink-2 mt-0.5">{p.descripcion}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <label className="text-caption font-sans uppercase text-ink-2">Minutos de la semana 1</label>
          <input type="number" min={10} value={baseMin} onChange={e => onBaseMin(e.target.value)}
            className="w-20 bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="text-caption font-sans uppercase text-ink-2">Empieza el</label>
        <input type="date" value={startDate} onChange={e => onStartDate(e.target.value)}
          className="bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
      </div>

      <div className="space-y-1">
        <p className="text-caption font-sans uppercase text-ink-2">Así progresa</p>
        {previa.map(s => (
          <div key={s.semana} className="flex items-baseline gap-3 py-1 border-b border-hairline last:border-0">
            <span className="font-mono text-caption text-ink-3 w-16 flex-shrink-0">SEM {String(s.semana).padStart(2, '0')}</span>
            <span className="flex-1 font-sans text-caption text-white">{s.resumen}</span>
            {s.esDescarga && <span className="font-mono text-caption text-ink-2 uppercase">descarga</span>}
          </div>
        ))}
        <p className="text-caption font-sans text-ink-3 pt-1">
          La semana avanza cuando el atleta entrena, no con el calendario: si se salta una semana, la repite en vez de
          encontrarse una carga que no ha ganado. Las series van por zona, así que al mejorar su FC el programa se
          reajusta solo.
        </p>
        {modo === 'prog_vo2max' && (
          <p className="text-caption font-sans text-ink-3">
            Lo que decide si una sesión de VO₂máx sirve son los minutos de trabajo en zona (10-20 por sesión), no el
            número de series. Nunca dos sesiones seguidas: deja 48 h entre ellas.
          </p>
        )}
      </div>
    </div>
  );
}

interface Props {
  athleteEmail: string;
  /** Tras crear la asignación con éxito — el llamador refresca su lista. */
  onCreated?: () => void;
}

export default function CardioPrescriptionForm({ athleteEmail, onCreated }: Props) {
  const [cuando, setCuando] = useState<'recurrente' | 'puntual'>('recurrente');
  const [modo, setModo] = useState<ModoPrescripcion>('zona2');
  const esPrograma = cuando === 'recurrente' && (modo === 'prog_zona2' || modo === 'prog_vo2max');
  const type: CardioSessionType = modo === 'prog_vo2max' ? 'intervalos' : modo === 'prog_zona2' ? 'zona2' : modo;
  const [protocolId, setProtocolId] = useState(PROTOCOLOS_VO2MAX[1].id);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaPuntual, setFechaPuntual] = useState(() => new Date().toISOString().slice(0, 10));
  const [baseMin, setBaseMin] = useState(String(ZONA2_BASE_MIN_DEFECTO));
  const [durationMin, setDurationMin] = useState('45');
  const [timesPerWeek, setTimesPerWeek] = useState('3');
  const [blocks, setBlocks] = useState<CardioIntervalBlock[]>(() => generateSeriesBlocks(SERIES_PRESETS[1]));
  const [blockMode, setBlockMode] = useState<'series' | 'manual'>('series');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const cambiarCuando = (v: 'recurrente' | 'puntual') => {
    setCuando(v);
    // Un programa progresivo no cabe en un día suelto: al pasar a "Día
    // concreto" con un modo progresivo elegido, se cae al más parecido.
    if (v === 'puntual' && !MODOS_PUNTUAL.includes(modo)) {
      setModo(modo === 'prog_vo2max' ? 'intervalos' : 'zona2');
    }
  };

  const validBlocks = blocks.filter(b => b.label.trim() && b.durationSec > 0);

  const handleCreate = async () => {
    if (!esPrograma && type === 'intervalos' && validBlocks.length === 0) return;
    setSaving(true);
    try {
      await createCardioAssignmentSafe();
      setSavedMsg(true);
      onCreated?.();
      setTimeout(() => setSavedMsg(false), 2000);
    } finally { setSaving(false); }
  };

  const createCardioAssignmentSafe = async () => {
    if (esPrograma) {
      const program: CardioProgram = modo === 'prog_vo2max'
        ? { kind: 'vo2max', protocolId, startDate }
        : { kind: 'zona2', protocolId: 'zona2', startDate, baseMinutes: Number(baseMin) || ZONA2_BASE_MIN_DEFECTO, targetZone: 'z2' };
      // Se guarda además la sesión de la SEMANA 1 en los campos de siempre:
      // así una asignación con programa sigue siendo legible por cualquier
      // parte de la app que no sepa nada de programas, y lo que ve el atleta
      // cada semana lo recalcula `resolverAsignacionCardio` encima de esto.
      const semana1 = prescripcionDeSemana(program, 1);
      await createCardioAssignment({
        athleteId: athleteEmail, type,
        targetDurationSec: semana1.intervals
          ? semana1.intervals.reduce((sum, b) => sum + b.durationSec, 0)
          : semana1.targetDurationSec,
        targetZone: type === 'zona2' ? 'z2' : undefined,
        intervals: semana1.intervals,
        timesPerWeek: semana1.sesionesPorSemana,
        active: true, createdAt: new Date().toISOString(),
        program,
      });
      return;
    }
    const intervalsDurationSec = validBlocks.reduce((sum, b) => sum + b.durationSec, 0);
    await createCardioAssignment({
      athleteId: athleteEmail, type,
      targetDurationSec: type === 'intervalos' ? intervalsDurationSec : Number(durationMin) * 60,
      targetZone: type === 'zona2' ? 'z2' : undefined,
      intervals: type === 'intervalos' ? validBlocks : undefined,
      // Puntual: un día concreto, sin recurrencia — `timesPerWeek` no pinta
      // nada aquí (una sola sesión no es "N veces por semana").
      timesPerWeek: cuando === 'recurrente' ? Number(timesPerWeek) : undefined,
      date: cuando === 'puntual' ? fechaPuntual : undefined,
      active: true, createdAt: new Date().toISOString(),
    });
  };

  const updateBlock = (i: number, patch: Partial<CardioIntervalBlock>) => {
    setBlocks(blocks.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => cambiarCuando('recurrente')}
          className={`flex-1 px-3 py-2 rounded-control text-caption font-sans font-bold transition-colors ${cuando === 'recurrente' ? 'bg-accent text-black' : 'bg-bg text-ink-2 border border-hairline'}`}>
          Recurrente
        </button>
        <button type="button" onClick={() => cambiarCuando('puntual')}
          className={`flex-1 px-3 py-2 rounded-control text-caption font-sans font-bold transition-colors ${cuando === 'puntual' ? 'bg-accent text-black' : 'bg-bg text-ink-2 border border-hairline'}`}>
          Día concreto
        </button>
      </div>

      <div className="flex gap-2">
        <select value={modo} onChange={e => setModo(e.target.value as ModoPrescripcion)}
          className="flex-1 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent">
          {(cuando === 'puntual' ? MODOS_PUNTUAL : (Object.keys(MODO_LABEL) as ModoPrescripcion[])).map(m => (
            <option key={m} value={m}>{MODO_LABEL[m]}</option>
          ))}
        </select>
        {!esPrograma && type !== 'intervalos' && (
          <input type="number" value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Min" className="w-20 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
        )}
        {cuando === 'recurrente' && !esPrograma && (
          <input type="number" value={timesPerWeek} onChange={e => setTimesPerWeek(e.target.value)} placeholder="x/sem" className="w-20 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
        )}
        {cuando === 'puntual' && (
          <input type="date" value={fechaPuntual} onChange={e => setFechaPuntual(e.target.value)}
            className="bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
        )}
      </div>

      {esPrograma && (
        <ProgramaProgresivoEditor
          modo={modo}
          protocolId={protocolId} onProtocolId={setProtocolId}
          startDate={startDate} onStartDate={setStartDate}
          baseMin={baseMin} onBaseMin={setBaseMin}
        />
      )}

      {type === 'intervalos' && !esPrograma && (
        <div className="space-y-3 bg-bg border border-hairline rounded-surface p-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setBlockMode('series')}
              className={`px-3 py-1.5 rounded-control text-caption font-sans font-bold transition-colors ${blockMode === 'series' ? 'bg-accent text-black' : 'bg-surface text-ink-2 border border-hairline'}`}>
              Series automáticas
            </button>
            <button type="button" onClick={() => setBlockMode('manual')}
              className={`px-3 py-1.5 rounded-control text-caption font-sans font-bold transition-colors ${blockMode === 'manual' ? 'bg-accent text-black' : 'bg-surface text-ink-2 border border-hairline'}`}>
              Manual
            </button>
          </div>

          {blockMode === 'series' && <SeriesModePicker onGenerate={setBlocks} />}

          <p className="text-caption font-sans uppercase text-ink-2">Bloques (se repiten en orden, uno tras otro)</p>
          {blocks.map((b, i) => (
            <div key={i} className="flex flex-col gap-2 border-b border-hairline pb-2 last:border-0 last:pb-0">
              <div className="flex gap-2 items-center">
                <input value={b.label} onChange={e => updateBlock(i, { label: e.target.value })} placeholder={`Bloque ${i + 1}`}
                  className="flex-1 min-w-0 bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
                <select value={b.closeType} onChange={e => updateBlock(i, { closeType: e.target.value as CardioIntervalCloseType })}
                  className="bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent">
                  {(Object.keys(CLOSE_TYPE_LABEL) as CardioIntervalCloseType[]).map(t => <option key={t} value={t}>{CLOSE_TYPE_LABEL[t]}</option>)}
                </select>
                <button onClick={() => setBlocks(blocks.filter((_, idx) => idx !== i))} className="text-ink-2 hover:text-red-400 transition-colors">
                  <Icon name="close" size="s" />
                </button>
              </div>
              <div className="flex gap-2 items-center pl-1">
                {b.closeType === 'time' && (
                  <>
                    <input type="number" min={5} value={b.durationSec} onChange={e => updateBlock(i, { durationSec: Number(e.target.value) })}
                      className="w-14 bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
                    <span className="text-caption text-ink-2 font-mono">s</span>
                    <select value={b.targetZone} onChange={e => updateBlock(i, { targetZone: e.target.value as keyof CardioZones })}
                      className="bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent">
                      {ZONE_ORDER.map(z => <option key={z} value={z}>{z.toUpperCase()}</option>)}
                    </select>
                  </>
                )}
                {b.closeType === 'zone' && (
                  <select value={b.targetZone} onChange={e => updateBlock(i, { targetZone: e.target.value as keyof CardioZones })}
                    className="bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent">
                    {ZONE_ORDER.map(z => <option key={z} value={z}>Hasta {z.toUpperCase()}</option>)}
                  </select>
                )}
                {b.closeType === 'heartRate' && (
                  <>
                    <select value={b.hrDirection ?? 'above'} onChange={e => updateBlock(i, { hrDirection: e.target.value as 'above' | 'below' })}
                      className="bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent">
                      <option value="above">Sube hasta</option>
                      <option value="below">Baja hasta</option>
                    </select>
                    <input type="number" min={40} value={b.hrThresholdBpm ?? 150} onChange={e => updateBlock(i, { hrThresholdBpm: Number(e.target.value) })}
                      className="w-16 bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
                    <span className="text-caption text-ink-2 font-mono">ppm</span>
                  </>
                )}
                {b.closeType === 'calories' && (
                  <>
                    <input type="number" min={5} value={b.targetKcal ?? 50} onChange={e => updateBlock(i, { targetKcal: Number(e.target.value) })}
                      className="w-16 bg-surface border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent" />
                    <span className="text-caption text-ink-2 font-mono">kcal</span>
                  </>
                )}
                {b.closeType === 'manual' && (
                  <span className="text-caption text-ink-2 font-sans">El atleta lo marca a mano en la pantalla en vivo</span>
                )}
              </div>
            </div>
          ))}
          <Button variant="ghost" size="s" onClick={() => setBlocks([...blocks, EMPTY_BLOCK()])} icon="add">Añadir bloque</Button>
          {validBlocks.length > 0 && (
            <p className="text-caption font-mono text-ink-2">Total: {Math.round(validBlocks.reduce((s, b) => s + b.durationSec, 0) / 60 * 10) / 10} min · {validBlocks.length} bloques</p>
          )}
        </div>
      )}

      <Button onClick={handleCreate} disabled={saving || (!esPrograma && type === 'intervalos' && validBlocks.length === 0)} fullWidth>
        {saving ? 'Guardando...' : savedMsg ? 'Prescrito ✓' : cuando === 'puntual' ? 'Programar sesión' : 'Prescribir'}
      </Button>
    </div>
  );
}

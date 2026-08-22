import { useEffect, useState } from 'react';
import { Mesocycle, Workout, Exercise, WeeklyProgressionRule, ConditionMetric, ConditionOperator, ConditionFallback, RuleCondition } from '../../types';
import { mesocycleWeekNumber } from '../../utils/progression';
import { Sheet, Button, Input, Select, Chip, Stepper } from '../ui';

type Lane = 'entrenamiento' | 'nutricion' | 'revisiones' | 'objetivos';
type ReviewType = 'revision' | 'cuestionario' | 'foto';

const LANE_LABEL: Record<Lane, string> = {
  entrenamiento: 'Entrenamiento', nutricion: 'Nutrición', revisiones: 'Revisiones', objetivos: 'Objetivos',
};

// Tipos por carril, con los que hoy tienen de verdad un sitio donde guardarse.
// Los demás se muestran igual (para que el panel enseñe la forma completa del
// Bloque H) pero deshabilitados con "Próximamente" — no hay modelo de datos
// para "descarga", "cambio de rutina" (más allá de crear un mesociclo nuevo,
// que ya tiene su propio flujo) ni ningún evento de nutrición todavía.
const SUBTYPES: Record<Lane, { value: string; label: string; enabled: boolean }[]> = {
  entrenamiento: [
    { value: 'volumen', label: 'Subida de volumen', enabled: true },
    { value: 'descarga', label: 'Descarga', enabled: false },
    { value: 'rutina', label: 'Cambio de rutina', enabled: false },
    { value: 'inicio', label: 'Inicio de mesociclo', enabled: false },
  ],
  nutricion: [
    { value: 'fase', label: 'Cambio de fase', enabled: false },
    { value: 'kcal', label: 'Ajuste de kcal', enabled: false },
    { value: 'refeed', label: 'Refeed / diet break', enabled: false },
    { value: 'dieta', label: 'Cambiar dieta', enabled: false },
  ],
  revisiones: [
    { value: 'revision', label: 'Check-in', enabled: true },
    { value: 'cuestionario', label: 'Cuestionario', enabled: true },
    { value: 'foto', label: 'Fotos', enabled: true },
    { value: 'mediciones', label: 'Mediciones', enabled: false },
  ],
  objetivos: [
    { value: 'hito', label: 'Hito', enabled: true },
    { value: 'objetivo', label: 'Objetivo', enabled: true },
    { value: 'nota', label: 'Nota', enabled: true },
  ],
};

const CONDITION_METRICS = [
  { value: 'adherenciaEntreno', label: 'Adherencia de entrenamiento' },
  { value: 'adherenciaDieta', label: 'Adherencia de dieta' },
  { value: 'rirMedio', label: 'RIR medio' },
  { value: 'peso', label: 'Peso corporal' },
];
const CONDITION_OPERATORS = [
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: '=', label: '=' },
];
const CONDITION_FALLBACK = [
  { value: 'mantener', label: 'Mantener' },
  { value: 'mitad', label: 'Aplicar la mitad' },
  { value: 'posponer', label: 'Posponer 1 semana' },
  { value: 'avisar', label: 'Avisarme' },
];

interface ConditionRow { metric: string; operator: string; value: string }

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  // Carril con el que arranca el panel — p. ej. al abrirlo desde un clic en una
  // celda vacía del carril de Nutrición, en vez del "Entrenamiento" por defecto
  // de "+ Evento" (Bloque H, Pantalla 1). El padre fuerza un remount con `key`
  // cuando cambia, así que este valor solo se lee al montar.
  initialLane?: Lane;
  mesocycles: Mesocycle[];
  workouts: Workout[];
  exercises: Exercise[];
  onCreateReview: (input: { title: string; date: string; type: ReviewType }) => void | Promise<void>;
  onAddVolumeRule: (workoutId: string, exerciseId: string, rule: WeeklyProgressionRule) => void | Promise<void>;
  onOpenObjectiveEditor: () => void;
}

export default function EventPlannerSheet({
  open, onClose, defaultDate, initialLane, mesocycles, workouts, exercises,
  onCreateReview, onAddVolumeRule, onOpenObjectiveEditor,
}: Props) {
  const [lane, setLane] = useState<Lane>(initialLane ?? 'entrenamiento');
  const [subtype, setSubtype] = useState<string>(() => {
    const l = initialLane ?? 'entrenamiento';
    return SUBTYPES[l].find(s => s.enabled)?.value ?? SUBTYPES[l][0].value;
  });
  const [date, setDate] = useState(defaultDate);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // Detalle "subida de volumen"
  const activeMeso = mesocycles.find(m => date >= m.startDate && date < addDaysStr(m.startDate, m.weeks * 7)) ?? mesocycles[0];
  const mesoWorkouts = workouts.filter(w => w.mesocycleId === activeMeso?.id);
  const [workoutId, setWorkoutId] = useState<string>('');
  const [exerciseId, setExerciseId] = useState<string>('');
  const [addSets, setAddSets] = useState(1);
  const selectedWorkout = mesoWorkouts.find(w => w.id === workoutId) ?? mesoWorkouts[0];

  // Condición (opcional) — se guarda como texto legible junto al evento; no se
  // evalúa ni se aplica automáticamente todavía (ver Bloque H2.2 del plan).
  const [conditionOn, setConditionOn] = useState(false);
  const [conditionRows, setConditionRows] = useState<ConditionRow[]>([{ metric: 'adherenciaEntreno', operator: '>=', value: '80' }]);
  const [fallback, setFallback] = useState('mantener');

  function selectLane(l: Lane) {
    setLane(l);
    setSubtype(SUBTYPES[l].find(s => s.enabled)?.value ?? SUBTYPES[l][0].value);
  }

  // El panel es un componente persistente (no se desmonta al cerrar, solo
  // `return null`), así que cada apertura tiene que resetear su propio estado
  // al carril/fecha que le pasó el padre — si no, "Programar aquí" en
  // Nutrición reabriría con el carril de la última vez.
  useEffect(() => {
    if (!open) return;
    selectLane(initialLane ?? 'entrenamiento');
    setDate(defaultDate);
    setTitle('');
    setConditionOn(false);
    setWorkoutId('');
    setExerciseId('');
    setAddSets(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLane, defaultDate]);

  function conditionText(): string {
    if (!conditionOn) return '';
    const rows = conditionRows.map(r => {
      const metric = CONDITION_METRICS.find(m => m.value === r.metric)?.label ?? r.metric;
      const op = CONDITION_OPERATORS.find(o => o.value === r.operator)?.label ?? r.operator;
      return `${metric} ${op} ${r.value}`;
    }).join(' y ');
    const fb = CONDITION_FALLBACK.find(f => f.value === fallback)?.label ?? fallback;
    return ` — solo si ${rows} (si no: ${fb.toLowerCase()})`;
  }

  // Estructura la condición para guardarla en la regla (Bloque H2.2) — a
  // diferencia de `conditionText()`, esto es lo que de verdad se evalúa
  // contra los datos reales del atleta, no solo una nota legible. Filas con
  // valor vacío o no numérico se descartan (formulario a medio rellenar).
  function structuredCondition(): RuleCondition | undefined {
    if (!conditionOn) return undefined;
    const rows = conditionRows
      .filter(r => r.value.trim() !== '' && !Number.isNaN(Number(r.value)))
      .map(r => ({ metric: r.metric as ConditionMetric, operator: r.operator as ConditionOperator, value: Number(r.value) }));
    if (rows.length === 0) return undefined;
    return { rows, fallback: fallback as ConditionFallback };
  }

  const canSave = lane === 'objetivos'
    ? true
    : lane === 'revisiones'
      ? title.trim().length > 0
      : lane === 'entrenamiento' && subtype === 'volumen'
        ? !!selectedWorkout && !!exerciseId && addSets !== 0
        : false;

  async function handleSave() {
    if (lane === 'objetivos') { onClose(); onOpenObjectiveEditor(); return; }
    setSaving(true);
    try {
      if (lane === 'revisiones') {
        await onCreateReview({ title: title.trim() + conditionText(), date, type: subtype as ReviewType });
      } else if (lane === 'entrenamiento' && subtype === 'volumen' && selectedWorkout && activeMeso) {
        const atWeek = mesocycleWeekNumber(activeMeso.startDate, date);
        const condition = structuredCondition();
        await onAddVolumeRule(selectedWorkout.id, exerciseId, { atWeek, addSets, ...(condition ? { condition } : {}) });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Programar evento"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave} disabled={!canSave || saving} loading={saving}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Tipo de evento */}
        <div className="space-y-2">
          <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider">Tipo de evento</label>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(LANE_LABEL) as Lane[]).map(l => (
              <button
                key={l} type="button" onClick={() => selectLane(l)}
                className={`px-3 py-1.5 rounded-chip font-mono text-caption font-bold uppercase tracking-wider border transition-all ${
                  lane === l ? 'bg-white/10 border-hairline text-white' : 'border-hairline text-ink-2 hover:text-white hover:border-strong'
                }`}
              >{LANE_LABEL[l]}</button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap pt-1">
            {SUBTYPES[lane].map(s => (
              <Chip
                key={s.value}
                selected={subtype === s.value}
                disabled={!s.enabled}
                onClick={() => s.enabled && setSubtype(s.value)}
              >{s.enabled ? s.label : `${s.label} · próximamente`}</Chip>
            ))}
          </div>
        </div>

        {/* Cuándo */}
        <Input label="Fecha" type="date" value={date} onChange={setDate} />

        {/* Detalle específico */}
        {lane === 'revisiones' && (
          <Input label="Título" value={title} onChange={setTitle} placeholder="Revisión semanal" />
        )}

        {lane === 'entrenamiento' && subtype === 'volumen' && (
          <div className="space-y-3">
            {!activeMeso ? (
              <p className="font-sans text-caption text-ink-3">Este atleta no tiene ningún mesociclo activo en esa fecha.</p>
            ) : mesoWorkouts.length === 0 ? (
              <p className="font-sans text-caption text-ink-3">El mesociclo #{activeMeso.number} todavía no tiene entrenamientos generados.</p>
            ) : (
              <>
                <Select
                  label="Día"
                  value={selectedWorkout?.id ?? ''}
                  onChange={setWorkoutId}
                  options={mesoWorkouts.map(w => ({ value: w.id, label: w.name }))}
                />
                <Select
                  label="Ejercicio"
                  value={exerciseId}
                  onChange={setExerciseId}
                  placeholder="Elige un ejercicio…"
                  options={(selectedWorkout?.exercises ?? []).map(we => ({
                    value: we.exerciseId,
                    label: exercises.find(e => e.id === we.exerciseId)?.name ?? we.exerciseId,
                  }))}
                />
                <Stepper label="Series a añadir" value={addSets} min={-5} max={5} onChange={setAddSets} />
              </>
            )}
          </div>
        )}

        {lane === 'objetivos' && (
          <p className="font-sans text-caption text-ink-2 leading-relaxed">
            Los objetivos se crean con su propio editor (fechas, tipo, estado) — al guardar aquí se abre directamente.
          </p>
        )}

        {(lane === 'nutricion' || (lane === 'entrenamiento' && subtype !== 'volumen') || (lane === 'revisiones' && subtype === 'mediciones')) && (
          <p className="font-sans text-caption text-ink-3 leading-relaxed">Este tipo de evento todavía no se puede programar desde aquí.</p>
        )}

        {/* Condición (opcional) */}
        {lane !== 'objetivos' && (
          <div className="bg-raised border border-hairline rounded-surface p-3 space-y-3">
            <button type="button" onClick={() => setConditionOn(v => !v)} className="w-full flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-caption text-accent uppercase tracking-wider">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
                Aplicar solo si se cumple una condición
              </span>
              <span
                className={`relative w-10 h-5.5 rounded-full flex-shrink-0 transition-colors ${conditionOn ? 'bg-accent' : 'bg-inset'}`}
                style={{ padding: 3 }}
              >
                <span className="block w-4 h-4 rounded-full bg-white transition-transform duration-200" style={{ transform: conditionOn ? 'translateX(18px)' : 'translateX(0)' }} />
              </span>
            </button>
            {conditionOn && (
              <div className="space-y-2">
                {conditionRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    {idx > 0 && <span className="font-mono text-caption text-ink-3 flex-shrink-0">Y</span>}
                    <select
                      value={row.metric}
                      onChange={e => setConditionRows(rows => rows.map((r, i) => i === idx ? { ...r, metric: e.target.value } : r))}
                      className="min-w-0 flex-1 bg-inset border border-hairline rounded-control px-2 py-1.5 text-caption text-white font-sans focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                    >
                      {CONDITION_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <select
                      value={row.operator}
                      onChange={e => setConditionRows(rows => rows.map((r, i) => i === idx ? { ...r, operator: e.target.value } : r))}
                      className="bg-inset border border-hairline rounded-control px-2 py-1.5 text-caption text-white font-mono focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer flex-shrink-0"
                    >
                      {CONDITION_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input
                      type="text" value={row.value}
                      onChange={e => setConditionRows(rows => rows.map((r, i) => i === idx ? { ...r, value: e.target.value } : r))}
                      className="w-16 bg-inset border border-hairline rounded-control px-2 py-1.5 text-center text-caption text-white font-mono focus:outline-none focus:ring-1 focus:ring-accent flex-shrink-0"
                    />
                    {conditionRows.length > 1 && (
                      <button onClick={() => setConditionRows(rows => rows.filter((_, i) => i !== idx))} className="text-ink-3 hover:text-red-400 flex-shrink-0">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setConditionRows(rows => [...rows, { metric: 'adherenciaEntreno', operator: '>=', value: '80' }])}
                  className="flex items-center gap-1 text-caption font-sans text-accent hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                  Añadir condición
                </button>
                <Select label="Si no se cumple" value={fallback} onChange={setFallback} options={CONDITION_FALLBACK} />
                <p className="font-sans text-caption text-ink-3 leading-relaxed">
                  Por ahora la condición se guarda como nota junto al evento — todavía no se evalúa ni se aplica sola.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

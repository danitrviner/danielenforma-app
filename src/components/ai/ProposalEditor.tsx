import React from 'react';
import {
  AiProposal, AiProposalPayload, Diet, DossierPatch, LevelLadder, Mesocycle,
  MuscleGroup, MUSCLE_LABELS, PeriodizationBlockPayload, RoadmapProposalPayload,
  NutritionProgramProposalPayload, SpecialDayProposalPayload, WorkoutDaysProposalPayload,
  SetupConfigProposalPayload, PublishBlockProposalPayload, WeeklyChallengeProposalPayload,
  WorkoutTemplateProposalPayload, MesocycleTemplateProposalPayload,
} from '../../types';
import { exchangeToKcal } from '../../utils/nutritionConstants';
import { Badge, Icon } from '../ui';

/* La propuesta deja de ser un folleto.
 *
 * Antes esto era una tarjeta de solo lectura con dos botones: o tragabas la
 * propuesta entera o la tirabas, y el retoque —que se hacía SIEMPRE— acababa
 * en el editor de mesociclos diez minutos después. Ahora se toca aquí: lo que
 * se aprueba es lo que se ve, y la diferencia contra lo que propuso la IA se
 * apunta en la ficha para que la próxima venga ya con ese criterio dentro.
 */

const campo = 'bg-field border border-hairline rounded-control px-2 py-1 text-caption text-ink focus:border-accent-line focus:outline-none';

function Num({ value, onChange, ancho = 'w-14', min, max, step, etiqueta }: {
  value: number; onChange: (n: number) => void; ancho?: string; min?: number; max?: number; step?: number;
  /** Lo que dice el lector de pantalla: el número solo no significa nada. */
  etiqueta: string;
}) {
  /* Mientras se teclea manda el texto, no el número.
     Con el campo controlado por el número y clamp en cada pulsación no se podía
     reescribir un valor: al borrar el 4 para poner 12, el campo veía "" (que es
     0), lo subía al mínimo y te dejaba el cursor peleando con un 1. Así se
     escribe libre y se cuadra al salir; que un valor imposible no se apruebe ya
     lo garantiza motivoParaNoAprobar, no este input. */
  const [texto, setTexto] = React.useState<string | null>(null);
  const clamp = (n: number) => Math.min(max ?? n, Math.max(min ?? n, n));

  return (
    <input
      type="number" inputMode="decimal" min={min} max={max} step={step}
      aria-label={etiqueta}
      value={texto ?? value}
      onChange={e => {
        setTexto(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        // min/max de un input[type=number] no impiden escribir fuera de rango:
        // solo mueven las flechas. El recorte de verdad es este.
        const n = Number(texto ?? value);
        onChange(Number.isFinite(n) && texto !== '' ? clamp(n) : clamp(value));
        setTexto(null);
      }}
      className={`${campo} ${ancho} text-center font-mono`}
    />
  );
}

function Texto({ value, onChange, placeholder, multilinea, etiqueta }: {
  value: string; onChange: (v: string) => void; placeholder?: string; multilinea?: boolean; etiqueta: string;
}) {
  return multilinea ? (
    <textarea
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
      aria-label={etiqueta}
      className={`${campo} w-full resize-y`}
    />
  ) : (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      aria-label={etiqueta} className={`${campo} w-full`} />
  );
}

function BotonQuitar({ onClick, titulo }: { onClick: () => void; titulo: string }) {
  return (
    <button type="button" onClick={onClick} title={titulo} aria-label={titulo}
      className="text-ink-4 hover:text-danger transition-colors flex-shrink-0">
      <Icon name="close" size="s" />
    </button>
  );
}

interface Props {
  proposal: AiProposal;
  /** El payload que se va a aprobar: el de la IA o el que ya ha tocado Dani. */
  payload: AiProposalPayload;
  onChange: (payload: AiProposalPayload) => void;
}

export default function ProposalEditor({ proposal: p, payload, onChange }: Props) {
  const caja = 'flex flex-col gap-2 bg-bg border border-hairline rounded-surface p-3';

  if (p.kind === 'checkinFeedback') {
    const v = payload as { checkInId: string; feedback: string };
    return (
      <div className={caja}>
        <span className="text-caption text-ink-4 uppercase tracking-wide">Lo que va a leer el atleta</span>
        <Texto multilinea etiqueta="Feedback para el atleta" value={v.feedback} onChange={feedback => onChange({ ...v, feedback })} />
      </div>
    );
  }

  if (p.kind === 'mesocycle' || p.kind === 'periodizationBlock') {
    const bloque = p.kind === 'periodizationBlock' ? (payload as PeriodizationBlockPayload) : null;
    const meso = (bloque ? bloque.mesocycle : payload as Omit<Mesocycle, 'id'>);
    const setMeso = (m: Omit<Mesocycle, 'id'>) => onChange(bloque ? { ...bloque, mesocycle: m } : m);
    const entrenados = (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).filter(g => (meso.groups[g]?.series ?? 0) > 0);
    const total = entrenados.reduce((s, g) => s + meso.groups[g].series, 0);
    return (
      <div className={caja}>
        <div className="flex gap-3 items-center flex-wrap text-caption text-ink-2">
          <span className="flex items-center gap-1">
            <Num etiqueta="Semanas del mesociclo" value={meso.weeks} min={1} max={16} onChange={weeks => setMeso({ ...meso, weeks })} /> sem
          </span>
          <span className="flex items-center gap-1">
            <Num etiqueta="Sesiones por ciclo" value={meso.daysPerWeek} min={1} max={10} onChange={daysPerWeek => setMeso({ ...meso, daysPerWeek })} /> días/ciclo
          </span>
          <span className="font-mono text-ink-4">{total} series/sem</span>
        </div>
        {bloque && (
          <div className="flex gap-3 items-center flex-wrap text-caption text-ink-2">
            <span className="flex items-center gap-1">
              revisión cada
              <Num etiqueta="Semanas entre revisiones" value={bloque.reviewCadenceWeeks} min={1} max={12}
                onChange={reviewCadenceWeeks => onChange({ ...bloque, reviewCadenceWeeks })} /> sem
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {entrenados.map(g => (
            <div key={g} className="flex justify-between items-center gap-2">
              <span className="text-caption text-ink-2 truncate">{MUSCLE_LABELS[g]}</span>
              <Num etiqueta={`Series semanales de ${MUSCLE_LABELS[g]}`} value={meso.groups[g].series} min={0} max={25} ancho="w-12"
                onChange={series => setMeso({ ...meso, groups: { ...meso.groups, [g]: { ...meso.groups[g], series } } })} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (p.kind === 'workoutDays') {
    const v = payload as WorkoutDaysProposalPayload;
    const setDia = (i: number, dia: WorkoutDaysProposalPayload['days'][number]) =>
      onChange({ ...v, days: v.days.map((d, j) => j === i ? dia : d) });
    return (
      <div className="flex flex-col gap-2">
        {v.days.map((dia, i) => (
          <div key={dia.dayIndex} className={caja}>
            <div className="flex items-center gap-2">
              <Badge tone="accent">Día {dia.dayIndex + 1}</Badge>
              <Texto etiqueta={`Nombre de la sesión ${dia.dayIndex + 1}`} value={dia.name ?? ''} placeholder="Nombre de la sesión"
                onChange={name => setDia(i, { ...dia, name })} />
            </div>
            {dia.exercises.map((ex, j) => (
              <div key={`${ex.exerciseId}_${j}`} className="flex items-center gap-1.5 flex-wrap border-l-2 border-hairline pl-2">
                <span className="text-caption text-ink flex-1 min-w-[8rem] truncate" title={ex.exerciseName}>{ex.exerciseName}</span>
                <Num etiqueta={`Series de ${ex.exerciseName}`} value={ex.sets} min={1} max={10} ancho="w-11"
                  onChange={sets => setDia(i, { ...dia, exercises: dia.exercises.map((e, k) => k === j ? { ...e, sets } : e) })} />
                <span className="text-caption text-ink-4">×</span>
                <input value={ex.reps} aria-label={`Repeticiones de ${ex.exerciseName}`} onChange={e => setDia(i, { ...dia, exercises: dia.exercises.map((x, k) => k === j ? { ...x, reps: e.target.value } : x) })}
                  className={`${campo} w-16 text-center font-mono`} />
                <span className="text-caption text-ink-4">RIR</span>
                <Num etiqueta={`RIR de ${ex.exerciseName}`} value={ex.rir} min={0} max={5} ancho="w-11"
                  onChange={rir => setDia(i, { ...dia, exercises: dia.exercises.map((e, k) => k === j ? { ...e, rir } : e) })} />
                <BotonQuitar titulo={`Quitar ${ex.exerciseName}`}
                  onClick={() => setDia(i, { ...dia, exercises: dia.exercises.filter((_, k) => k !== j) })} />
              </div>
            ))}
            {dia.exercises.length === 0 && (
              <p className="text-caption text-warning">Sin ejercicios: este día se guardaría vacío.</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (p.kind === 'levelLadder') {
    const v = payload as LevelLadder;
    const setNivel = (i: number, nivel: LevelLadder['levels'][number]) =>
      onChange({ ...v, levels: v.levels.map((l, j) => j === i ? nivel : l) });
    return (
      <div className="flex flex-col gap-2">
        {v.levels.map((nivel, i) => (
          <div key={nivel.id} className={caja}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-caption text-ink-4">{i + 1}</span>
              <Texto etiqueta={`Nombre del nivel ${i + 1}`} value={nivel.name} onChange={name => setNivel(i, { ...nivel, name })} />
              <BotonQuitar titulo={`Quitar el nivel ${nivel.name}`}
                onClick={() => onChange({ ...v, levels: v.levels.filter((_, j) => j !== i).map((l, j) => ({ ...l, order: j })) })} />
            </div>
            {nivel.criteria.map((c, j) => (
              <div key={c.id} className="flex items-center gap-1.5 border-l-2 border-hairline pl-2">
                <Texto etiqueta={`Criterio ${j + 1} del nivel ${nivel.name}`} value={c.label}
                  onChange={label => setNivel(i, { ...nivel, criteria: nivel.criteria.map((x, k) => k === j ? { ...x, label } : x) })} />
                {c.kind !== 'manual' && (
                  <Num etiqueta={`Objetivo de "${c.label}"`} value={c.targetValue ?? 0} ancho="w-16" step={0.1} min={0}
                    onChange={targetValue => setNivel(i, { ...nivel, criteria: nivel.criteria.map((x, k) => k === j ? { ...x, targetValue } : x) })} />
                )}
                <BotonQuitar titulo={`Quitar el criterio ${c.label}`}
                  onClick={() => setNivel(i, { ...nivel, criteria: nivel.criteria.filter((_, k) => k !== j) })} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (p.kind === 'roadmap') {
    const v = payload as RoadmapProposalPayload;
    return (
      <div className={caja}>
        {v.items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-1.5">
            <Texto etiqueta={`Título del hito ${i + 1}`} value={it.title}
              onChange={title => onChange({ ...v, items: v.items.map((x, j) => j === i ? { ...x, title } : x) })} />
            <input type="date" value={it.targetDate ?? ''} aria-label={`Fecha objetivo de ${it.title}`}
              onChange={e => onChange({ ...v, items: v.items.map((x, j) => j === i ? { ...x, targetDate: e.target.value || undefined } : x) })}
              className={`${campo} font-mono`} />
            <BotonQuitar titulo={`Quitar ${it.title}`}
              onClick={() => onChange({ ...v, items: v.items.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </div>
    );
  }

  if (p.kind === 'specialDay') {
    const v = payload as SpecialDayProposalPayload;
    return (
      <div className={caja}>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" value={v.date} aria-label="Fecha del día señalado" onChange={e => onChange({ ...v, date: e.target.value })}
            className={`${campo} font-mono`} />
          <Texto etiqueta="Título del día señalado" value={v.title} onChange={title => onChange({ ...v, title })} />
        </div>
        <span className="text-caption text-ink-4 uppercase tracking-wide">Lo que lee ese día encima de su sesión</span>
        <Texto multilinea etiqueta="Nota que lee el atleta ese día" value={v.athleteNote} onChange={athleteNote => onChange({ ...v, athleteNote })} />
      </div>
    );
  }

  if (p.kind === 'dossier') {
    const v = payload as DossierPatch;
    return (
      <div className={caja}>
        {Object.entries(v).map(([clave, valor]) => (
          <div key={clave} className="flex flex-col gap-1">
            <span className="text-caption text-ink-4 uppercase tracking-wide">{clave}</span>
            <Texto multilinea etiqueta={clave}
              value={Array.isArray(valor) ? valor.join('\n') : String(valor ?? '')}
              onChange={txt => onChange({
                ...v,
                [clave]: Array.isArray(valor) ? txt.split('\n').filter(l => l.trim()) : txt,
              })}
            />
          </div>
        ))}
      </div>
    );
  }

  if (p.kind === 'nutritionProgram') {
    const v = payload as NutritionProgramProposalPayload;
    const setFase = (i: number, fase: NutritionProgramProposalPayload['phases'][number]) =>
      onChange({ ...v, phases: v.phases.map((f, j) => j === i ? fase : f) });
    return (
      <div className={caja}>
        <span className="flex items-center gap-2 text-caption text-ink-2">
          empieza
          <input type="date" value={v.startDate} aria-label="Inicio de la periodización"
            onChange={e => onChange({ ...v, startDate: e.target.value })} className={`${campo} font-mono`} />
        </span>
        {v.phases.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 flex-wrap border-l-2 border-hairline pl-2">
            <Texto etiqueta={`Nombre de la fase ${i + 1}`} value={f.name} onChange={name => setFase(i, { ...f, name })} />
            <Num etiqueta={`Semanas de ${f.name}`} value={f.weeks} min={1} max={52} ancho="w-12"
              onChange={weeks => setFase(i, { ...f, weeks })} />
            <span className="text-caption text-ink-4">sem</span>
            <Num etiqueta={`Kcal objetivo de ${f.name}`} value={f.targetKcal ?? 0} min={0} step={50} ancho="w-20"
              onChange={targetKcal => setFase(i, { ...f, targetKcal: targetKcal || undefined })} />
            <span className="text-caption text-ink-4">kcal</span>
            {/* Qué dieta lleva la fase no se toca aquí: o apunta a una que ya
                existe o trae una que se crea al aprobar, y cambiarla a medias
                deja la fase sin dieta. La dieta se retoca después, en su editor. */}
            <span className="text-caption text-ink-4">{f.diet ? 'dieta nueva' : 'dieta ya creada'}</span>
            <BotonQuitar titulo={`Quitar la fase ${f.name}`}
              onClick={() => onChange({ ...v, phases: v.phases.filter((_, j) => j !== i) })} />
          </div>
        ))}
        {v.phases.length === 0 && (
          <p className="text-caption text-warning">Sin fases: no quedaría periodización ninguna.</p>
        )}
        {(v.refeedDays ?? []).map((r, i) => (
          <div key={r.date} className="flex items-center gap-1.5 border-l-2 border-accent-line pl-2">
            <span className="font-mono text-caption text-ink-4">{r.date}</span>
            <Texto etiqueta={`Nota de la recarga del ${r.date}`} value={r.note ?? ''} placeholder="Lo que lee ese día"
              onChange={note => onChange({ ...v, refeedDays: (v.refeedDays ?? []).map((x, j) => j === i ? { ...x, note } : x) })} />
            <BotonQuitar titulo={`Quitar la recarga del ${r.date}`}
              onClick={() => onChange({ ...v, refeedDays: (v.refeedDays ?? []).filter((_, j) => j !== i) })} />
          </div>
        ))}
      </div>
    );
  }

  if (p.kind === 'diet') {
    const v = payload as Omit<Diet, 'id'>;
    return (
      <div className={caja}>
        <div className="flex gap-2 items-center flex-wrap">
          {(['HC', 'PROT', 'GRASA'] as const).map(cat => (
            <span key={cat} className="flex items-center gap-1 text-caption text-ink-2">
              {cat}
              <Num etiqueta={`Intercambios diarios de ${cat}`} value={v.budget[cat] ?? 0} min={0} max={40} step={0.25} ancho="w-14"
                onChange={n => onChange({ ...v, budget: { ...v.budget, [cat]: n } })} />
            </span>
          ))}
          <span className="text-caption font-mono text-ink-2">≈ {exchangeToKcal(v.budget)} kcal</span>
        </div>
        {/* Los items no se editan aquí a propósito: cuadrar intercambios es lo
            que hace el editor de dietas, con su balance en vivo. Aquí se ajusta
            el presupuesto y se quitan comidas que sobran. */}
        {v.meals.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2">
            <span className="text-caption text-ink-2 flex-1 truncate">{m.name}</span>
            <span className="text-caption font-mono text-ink-4">{m.items.length} items</span>
            <BotonQuitar titulo={`Quitar ${m.name}`}
              onClick={() => onChange({ ...v, meals: v.meals.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </div>
    );
  }

  if (p.kind === 'setupConfig') {
    /* Una lista de lo que se va a configurar, no veinte campos: el peso
       objetivo o la cadencia del cuestionario se tocan en su propia pantalla,
       que es donde Dani los ve en contexto. Aquí se decide si eso es lo que
       quiere, y los números que SÍ se retocan a ojo (pasos, peso, duración)
       están a mano. */
    const v = payload as SetupConfigProposalPayload;
    const linea = (etiqueta: string, valor: React.ReactNode) => (
      <div className="flex items-center gap-2 text-caption text-ink-2">
        <span className="text-ink-4 w-32 flex-shrink-0">{etiqueta}</span>
        <span className="min-w-0">{valor}</span>
      </div>
    );
    return (
      <div className={caja}>
        {v.planStartDate && linea('Inicio del plan', v.planStartDate)}
        {v.planDurationMonths !== undefined && linea('Duración', (
          <span className="flex items-center gap-1">
            <Num etiqueta="Meses de plan" value={v.planDurationMonths} min={1} max={24}
              onChange={n => onChange({ ...v, planDurationMonths: n })} /> meses
          </span>
        ))}
        {v.targetWeight !== undefined && linea('Peso objetivo', (
          <span className="flex items-center gap-1">
            <Num etiqueta="Peso objetivo en kg" value={v.targetWeight} min={30} max={250} step={0.5}
              onChange={n => onChange({ ...v, targetWeight: n })} /> kg
          </span>
        ))}
        {v.stepGoal !== undefined && linea('Pasos al día', (
          <Num etiqueta="Pasos diarios objetivo" value={v.stepGoal} min={1000} max={30000} step={500} ancho="w-20"
            onChange={n => onChange({ ...v, stepGoal: n })} />
        ))}
        {v.activeDietNames && linea('Dietas activas', v.activeDietNames.join(', '))}
        {v.weeklyScheduleByName && linea('Calendario', Object.entries(v.weeklyScheduleByName)
          .map(([d, n]) => `${d}: ${n ?? 'libre'}`).join(' · '))}
        {v.questionnaire && linea('Cuestionario', `${v.questionnaire.questionnaireTitle} desde ${v.questionnaire.startDate}`)}
        {v.photos && linea('Fotos', `${v.photos.views.join('/')} desde ${v.photos.startDate}`)}
        {v.liftExerciseNames && linea('Retos de carga', v.liftExerciseNames.join(', '))}
        {v.cardio && linea('Cardio', `${v.cardio.kind === 'vo2max' ? `VO₂máx (${v.cardio.protocolId})` : `Zona 2${v.cardio.baseMinutes ? ` desde ${v.cardio.baseMinutes} min` : ''}`} · ${v.cardio.startDate}`)}
        <p className="text-caption text-ink-4">Lo que no aparece aquí no se toca.</p>
      </div>
    );
  }

  if (p.kind === 'publishBlock') {
    const v = payload as PublishBlockProposalPayload;
    return (
      <div className={caja}>
        <p className="text-caption text-ink-2">
          Vuelca <span className="text-ink">{v.mesocycleName}</span> al calendario del atleta con las fechas del propio
          bloque. Las que ya estén asignadas no se duplican.
        </p>
      </div>
    );
  }

  if (p.kind === 'weeklyChallenge') {
    const v = payload as WeeklyChallengeProposalPayload;
    return (
      <div className={caja}>
        <Texto etiqueta="Título del reto" value={v.title} onChange={title => onChange({ ...v, title })} />
        <Texto multilinea etiqueta="Lo que lee el atleta" value={v.description}
          onChange={description => onChange({ ...v, description })} />
        <div className="flex items-center gap-2 text-caption text-ink-2">
          <span className="text-ink-4">Objetivo</span>
          <Num etiqueta="Objetivo del reto" value={v.metric.target} min={0} step={1} ancho="w-20"
            onChange={target => onChange({ ...v, metric: { ...v.metric, target } })} />
          <span>{v.metric.unit}</span>
          {v.metric.baseline !== undefined && <span className="text-ink-4">· parte de {v.metric.baseline}</span>}
          {v.difficulty && <Badge tone={v.difficulty === 'ambicioso' ? 'warning' : 'neutral'}>{v.difficulty}</Badge>}
        </div>
        {v.metric.exerciseName && <p className="text-caption text-ink-4">En {v.metric.exerciseName}</p>}
      </div>
    );
  }

  if (p.kind === 'workoutTemplate') {
    const v = payload as WorkoutTemplateProposalPayload;
    return (
      <div className={caja}>
        <Texto etiqueta="Nombre de la plantilla" value={v.name} onChange={name => onChange({ ...v, name })} />
        {v.exercises.map((ex, i) => (
          <div key={`${ex.exerciseId}_${i}`} className="flex items-center gap-2">
            <span className="text-caption text-ink-2 flex-1 truncate">{ex.exerciseName}</span>
            <Num etiqueta={`Series de ${ex.exerciseName}`} value={ex.sets} min={1} max={10} ancho="w-12"
              onChange={sets => onChange({ ...v, exercises: v.exercises.map((x, j) => j === i ? { ...x, sets } : x) })} />
            <span className="text-caption font-mono text-ink-4">×{ex.reps} · RIR {ex.rir}</span>
            <BotonQuitar titulo={`Quitar ${ex.exerciseName}`}
              onClick={() => onChange({ ...v, exercises: v.exercises.filter((_, j) => j !== i) })} />
          </div>
        ))}
        {v.exercises.length === 0 && <p className="text-caption text-warning">Sin ejercicios no es una plantilla.</p>}
      </div>
    );
  }

  if (p.kind === 'mesocycleTemplate') {
    const v = payload as MesocycleTemplateProposalPayload;
    return (
      <div className={caja}>
        <Texto etiqueta="Nombre de la plantilla" value={v.name} onChange={name => onChange({ ...v, name })} />
        {v.stages.map((st, i) => {
          const series = (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).reduce((sum, g) => sum + (st.groups[g]?.series ?? 0), 0);
          return (
            <div key={`${st.name}_${i}`} className="flex items-center gap-2 border-l-2 border-accent-line pl-2">
              <span className="text-caption text-ink-2 flex-1 truncate">{st.name}</span>
              <span className="text-caption font-mono text-ink-4">
                {st.weeks} sem × {st.daysPerWeek} d · {series} series{st.days ? ` · ${st.days.length} sesiones` : ''}
              </span>
              <BotonQuitar titulo={`Quitar la etapa ${st.name}`}
                onClick={() => onChange({ ...v, stages: v.stages.filter((_, j) => j !== i) })} />
            </div>
          );
        })}
        {v.stages.length === 0 && <p className="text-caption text-warning">Sin etapas no queda plantilla.</p>}
      </div>
    );
  }

  return null;
}

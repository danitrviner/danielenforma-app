import React, { useState, useMemo } from 'react';
import {
  OnboardingData, OnboardingMeal, DietType, ExperienceLevel,
  ActivityLevel, GoalBody, GoalCapacity,
  OnboardingSection, OnboardingTemplateQuestion,
} from '../types';
import { saveOnboarding, updateOnboarding } from '../dbService';

// ── Section metadata ──────────────────────────────────────────────────────────

const SECTION_META: Record<OnboardingSection, { icon: string; label: string }> = {
  entrenamiento: { icon: 'fitness_center', label: 'Entrenamiento'           },
  nutricion:     { icon: 'restaurant',     label: 'Nutrición'               },
  descanso:      { icon: 'bedtime',        label: 'Descanso / Recuperación' },
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentario:  1.2,
  poco_activo: 1.375,
  activo:      1.55,
  muy_activo:  1.725,
};

const GOAL_ADJUSTMENTS: Record<GoalBody, number> = {
  reducir_grasa:    0.80,
  mantener:         1.00,
  aumentar_musculo: 1.10,
};

const GOAL_ADJ_LABEL: Record<GoalBody, string> = {
  reducir_grasa:    '−20%',
  mantener:         '0%',
  aumentar_musculo: '+10%',
};

const MEAL_PRESETS: Record<3 | 4 | 5, OnboardingMeal[]> = {
  3: [
    { intakeType: 1, name: 'Desayuno',     needsTupper: false },
    { intakeType: 3, name: 'Comida',       needsTupper: false },
    { intakeType: 5, name: 'Cena',         needsTupper: false },
  ],
  4: [
    { intakeType: 1, name: 'Desayuno',     needsTupper: false },
    { intakeType: 2, name: 'Media mañana', needsTupper: false },
    { intakeType: 3, name: 'Comida',       needsTupper: false },
    { intakeType: 5, name: 'Cena',         needsTupper: false },
  ],
  5: [
    { intakeType: 1, name: 'Desayuno',     needsTupper: false },
    { intakeType: 2, name: 'Media mañana', needsTupper: false },
    { intakeType: 3, name: 'Comida',       needsTupper: false },
    { intakeType: 4, name: 'Merienda',     needsTupper: false },
    { intakeType: 5, name: 'Cena',         needsTupper: false },
  ],
};

const INTAKE_ICONS: Record<number, string> = {
  1: 'free_breakfast',
  2: 'coffee',
  3: 'restaurant',
  4: 'local_cafe',
  5: 'dinner_dining',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(birthDate: string): number {
  const dob = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

function mifflinBMR(sex: 'male' | 'female', w: number, h: number, age: number): number {
  return Math.round(10 * w + 6.25 * h - 5 * age + (sex === 'male' ? 5 : -161));
}

function roundQ(x: number): number { return Math.round(x / 0.25) * 0.25; }

function fmtExch(x: number): string {
  const r = roundQ(x);
  return r % 1 === 0 ? r.toFixed(0) : r.toFixed(2);
}

function macroGrams(cal: number, pct: number, factor: 4 | 9) {
  return Math.round((cal * pct) / 100 / factor);
}

interface AutoCalc {
  bmr: number; tdee: number; kcal: number;
  protG: number; grasaG: number; hcG: number;
  protPct: number; grasaPct: number; hcPct: number;
}

function computeAuto(
  sex: 'male' | 'female', birthDate: string,
  w: number, h: number, level: ActivityLevel, goal: GoalBody,
): AutoCalc {
  const age    = calcAge(birthDate);
  const bmr    = mifflinBMR(sex, w, h, age);
  const tdee   = Math.round(bmr * ACTIVITY_FACTORS[level]);
  const kcal   = Math.round(tdee * GOAL_ADJUSTMENTS[goal]);
  const protG  = Math.round(2 * w);
  const pKcal  = protG * 4;
  const gKcal  = Math.round(kcal * 0.25);
  const grasaG = Math.round(gKcal / 9);
  const hcKcal = Math.max(0, kcal - pKcal - gKcal);
  const hcG    = Math.round(hcKcal / 4);
  const tot    = pKcal + gKcal + hcKcal;
  const protPct  = Math.round((pKcal / tot) * 100);
  const grasaPct = Math.round((gKcal / tot) * 100);
  const hcPct    = 100 - protPct - grasaPct;
  return { bmr, tdee, kcal, protG, grasaG, hcG, protPct, grasaPct, hcPct };
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  sex:              'male' | 'female' | '';
  birthDate:        string;
  weightKg:         number | '';
  heightCm:         number | '';
  bodyFatPct:       number | '';
  musclePct:        number | '';
  activityLevel:    ActivityLevel | '';
  goalBody:         GoalBody | '';
  goalCapacity:     GoalCapacity | '';
  dietType:         DietType;
  targetCalories:   number | '';
  hcPct:            number | '';
  protPct:          number | '';
  grasaPct:         number | '';
  allergies:        string[];
  mealCount:        3 | 4 | 5;
  meals:            OnboardingMeal[];
  cookingLevel:     number;
  cookingMaxTime:   number;
  breakfastVariety: number;
  lunchVariety:     number;
  equipment:         string[];
  favoriteExercises: string[];
  hatedExercises:    string[];
  experienceLevel:   ExperienceLevel;
  injuries:          string;
  extraAnswers:      Record<string, string | number>;
}

function fromOnboarding(d: OnboardingData): FormState {
  const count = ((d.mealCount ?? 4) as 3 | 4 | 5);
  return {
    sex:              d.sex ?? '',
    birthDate:        d.birthDate ?? '',
    weightKg:         d.weightKg ?? '',
    heightCm:         d.heightCm ?? '',
    bodyFatPct:       d.bodyFatPct ?? '',
    musclePct:        d.musclePct ?? '',
    activityLevel:    d.activityLevel ?? '',
    goalBody:         d.goalBody ?? '',
    goalCapacity:     d.goalCapacity ?? '',
    dietType:         d.dietType,
    targetCalories:   d.targetCalories,
    hcPct:            d.macroSplit.hc,
    protPct:          d.macroSplit.prot,
    grasaPct:         d.macroSplit.grasa,
    allergies:        d.allergies,
    mealCount:        count,
    meals:            d.meals ?? MEAL_PRESETS[count].map(m => ({ ...m })),
    cookingLevel:     d.cookingLevel ?? 3,
    cookingMaxTime:   d.cookingMaxTime ?? 45,
    breakfastVariety: d.breakfastVariety ?? 3,
    lunchVariety:     d.lunchVariety ?? 3,
    equipment:         d.equipment,
    favoriteExercises: d.favoriteExercises,
    hatedExercises:    d.hatedExercises,
    experienceLevel:   d.experienceLevel,
    injuries:          d.injuries,
    extraAnswers:      d.extraAnswers ?? {},
  };
}

const DEFAULTS: FormState = {
  sex:              '',
  birthDate:        '',
  weightKg:         '',
  heightCm:         '',
  bodyFatPct:       '',
  musclePct:        '',
  activityLevel:    '',
  goalBody:         '',
  goalCapacity:     '',
  dietType:         'omnivoro',
  targetCalories:   2000,
  hcPct:            40,
  protPct:          30,
  grasaPct:         30,
  allergies:        [],
  mealCount:        4,
  meals:            MEAL_PRESETS[4].map(m => ({ ...m })),
  cookingLevel:     3,
  cookingMaxTime:   45,
  breakfastVariety: 3,
  lunchVariety:     3,
  equipment:         [],
  favoriteExercises: [],
  hatedExercises:    [],
  experienceLevel:   'intermedio',
  injuries:          '',
  extraAnswers:      {},
};

// ── Sub-components ────────────────────────────────────────────────────────────

function PillSelect<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border transition-all ${
              value === o.value
                ? 'bg-[#e2ff00] text-black border-transparent'
                : 'bg-transparent text-[#c6c9ab] border-[#2a2a2a] hover:text-white hover:border-[#3a3a3a]'
            }`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagInput({
  label, placeholder, tags, onChange, helpText,
}: {
  label: string; placeholder: string; tags: string[];
  onChange: (next: string[]) => void; helpText?: string;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput('');
  };
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">{label}</p>
      {helpText && <p className="font-mono text-[9px] text-[#555]">{helpText}</p>}
      <div className="flex flex-wrap gap-1.5 p-2.5 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg min-h-[44px] focus-within:ring-1 focus-within:ring-[#e2ff00]/50 transition-all">
        {tags.map(t => (
          <span key={t} className="flex items-center gap-1 bg-[#2a2a2a] border border-[#3a3a3a] text-white px-2 py-0.5 rounded-full text-xs font-mono">
            {t}
            <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} className="text-[#c6c9ab] hover:text-red-400 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>close</span>
            </button>
          </span>
        ))}
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
            if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1));
          }}
          onBlur={() => { if (input.trim()) add(); }}
          placeholder={tags.length === 0 ? placeholder : '+ añadir'}
          className="bg-transparent text-sm text-white outline-none flex-1 min-w-[100px] placeholder:text-[#444]" />
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 bg-[#0e0e0e] border border-[#2a2a2a] rounded-xl p-5">
      <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[#e2ff00] flex items-center gap-2">
        <span className="material-symbols-outlined text-sm">{icon}</span>
        {title}
      </h4>
      {children}
    </div>
  );
}

function SliderField({
  label, min, max, step = 1, value, onChange, unit = '', minLabel, maxLabel,
}: {
  label: string; min: number; max: number; step?: number;
  value: number; onChange: (v: number) => void; unit?: string;
  minLabel?: string; maxLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">{label}</p>
        <span className="font-mono text-sm font-bold text-white">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[#e2ff00] cursor-pointer" />
      {(minLabel || maxLabel) && (
        <div className="flex justify-between font-mono text-[8px] text-[#555]">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  athleteEmail: string;
  initialData:  OnboardingData | null;
  isCoach?:     boolean;
  template?:    OnboardingTemplateQuestion[];
  onSaved:      (data: OnboardingData) => void;
  onCancel?:    () => void;
}

const FIELD = 'bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] w-full';

export default function OnboardingForm({
  athleteEmail, initialData, isCoach = false, template = [], onSaved, onCancel,
}: Props) {
  const [form, setForm] = useState<FormState>(initialData ? fromOnboarding(initialData) : DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const setAnswer = (qId: string, val: string | number) =>
    setForm(prev => ({ ...prev, extraAnswers: { ...prev.extraAnswers, [qId]: val } }));

  // ── Macro preview ──────────────────────────────────────────────────────────
  const cal      = Number(form.targetCalories) || 0;
  const hcG      = macroGrams(cal, Number(form.hcPct)    || 0, 4);
  const protG    = macroGrams(cal, Number(form.protPct)  || 0, 4);
  const grasaG   = macroGrams(cal, Number(form.grasaPct) || 0, 9);
  const totalPct = (Number(form.hcPct) || 0) + (Number(form.protPct) || 0) + (Number(form.grasaPct) || 0);

  // ── Auto-calculation ───────────────────────────────────────────────────────
  const autoCalc = useMemo<AutoCalc | null>(() => {
    if (!form.sex || !form.birthDate || form.weightKg === '' || form.heightCm === '' ||
        !form.activityLevel || !form.goalBody) return null;
    return computeAuto(
      form.sex, form.birthDate,
      Number(form.weightKg), Number(form.heightCm),
      form.activityLevel, form.goalBody,
    );
  }, [form.sex, form.birthDate, form.weightKg, form.heightCm, form.activityLevel, form.goalBody]);

  const applyAuto = () => {
    if (!autoCalc) return;
    setForm(prev => ({
      ...prev,
      targetCalories: autoCalc.kcal,
      hcPct:          autoCalc.hcPct,
      protPct:        autoCalc.protPct,
      grasaPct:       autoCalc.grasaPct,
    }));
  };

  // ── Meal helpers ───────────────────────────────────────────────────────────
  const changeMealCount = (n: 3 | 4 | 5) => {
    setForm(prev => ({ ...prev, mealCount: n, meals: MEAL_PRESETS[n].map(m => ({ ...m })) }));
  };

  const toggleTupper = (i: number) => {
    setForm(prev => ({
      ...prev,
      meals: prev.meals.map((m, idx) => idx === i ? { ...m, needsTupper: !m.needsTupper } : m),
    }));
  };

  const isFirstTime = !initialData && !onCancel;

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.targetCalories || Number(form.targetCalories) <= 0) {
      setError('Introduce un objetivo calórico válido.'); return;
    }
    if (totalPct !== 100) {
      setError(`La distribución de macros debe sumar 100% (ahora suma ${totalPct}%).`); return;
    }
    setError('');
    setSaving(true);
    const data: OnboardingData = {
      athleteId:          athleteEmail,
      sex:                form.sex !== '' ? form.sex : undefined,
      birthDate:          form.birthDate || undefined,
      weightKg:           form.weightKg !== '' ? Number(form.weightKg) : undefined,
      heightCm:           form.heightCm !== '' ? Number(form.heightCm) : undefined,
      bodyFatPct:         form.bodyFatPct !== '' ? Number(form.bodyFatPct) : undefined,
      musclePct:          form.musclePct  !== '' ? Number(form.musclePct)  : undefined,
      activityLevel:      form.activityLevel !== '' ? form.activityLevel : undefined,
      goalBody:           form.goalBody      !== '' ? form.goalBody      : undefined,
      goalCapacity:       form.goalCapacity  !== '' ? form.goalCapacity  : undefined,
      dietType:           form.dietType,
      targetCalories:     Number(form.targetCalories),
      macroSplit:         { hc: Number(form.hcPct)||0, prot: Number(form.protPct)||0, grasa: Number(form.grasaPct)||0 },
      macroGrams:         { hc: hcG, prot: protG, grasa: grasaG },
      likedFoods:         initialData?.likedFoods    ?? [],
      dislikedFoods:      initialData?.dislikedFoods ?? [],
      allergies:          form.allergies,
      mealCount:          form.mealCount,
      meals:              form.meals,
      cookingLevel:       form.cookingLevel,
      cookingMaxTime:     form.cookingMaxTime,
      breakfastVariety:   form.breakfastVariety,
      lunchVariety:       form.lunchVariety,
      equipment:          form.equipment,
      favoriteExercises:  form.favoriteExercises,
      hatedExercises:     form.hatedExercises,
      experienceLevel:    form.experienceLevel,
      injuries:           form.injuries,
      extraAnswers:       form.extraAnswers,
      completedAt:        new Date().toISOString(),
    };
    try {
      if (initialData) {
        await updateOnboarding(data);
      } else {
        await saveOnboarding(data);
      }
      onSaved(data);
    } catch (err) {
      setError('Error al guardar. Inténtalo de nuevo.');
      console.error(err);
    } finally { setSaving(false); }
  };

  // ── Template answer input ──────────────────────────────────────────────────
  const renderAnswer = (q: OnboardingTemplateQuestion) => {
    const val = form.extraAnswers[q.id];
    if (q.type === 'numeric') {
      return (
        <div className="flex items-center gap-2">
          <input type="number" value={val ?? ''}
            onChange={e => setAnswer(q.id, e.target.value === '' ? '' : Number(e.target.value))}
            className="w-24 bg-[#0e0e0e] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] text-center" />
          {q.unit && <span className="text-[10px] text-[#c6c9ab] font-mono">{q.unit}</span>}
        </div>
      );
    }
    if (q.type === 'scale') {
      const min = q.scaleMin ?? 1;
      const max = q.scaleMax ?? 10;
      const num = Number(val) || 0;
      return (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-[#555] w-3">{min}</span>
          <input type="range" min={min} max={max} value={num || min}
            onChange={e => setAnswer(q.id, Number(e.target.value))}
            className="flex-1 accent-[#e2ff00]" />
          <span className="font-mono text-[9px] text-[#555] w-3">{max}</span>
          <span className="font-mono text-sm font-bold text-white w-6 text-right">{num || '—'}</span>
        </div>
      );
    }
    if (q.type === 'choice') {
      return (
        <select value={String(val ?? '')} onChange={e => setAnswer(q.id, e.target.value)}
          className="bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00]">
          <option value="">— elegir —</option>
          {(q.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return (
      <textarea value={String(val ?? '')} rows={2}
        onChange={e => setAnswer(q.id, e.target.value)}
        className="w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] resize-none" />
    );
  };

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Header */}
      <div className={isFirstTime ? 'text-center space-y-2 py-4' : 'space-y-1'}>
        {isFirstTime ? (
          <>
            <span className="material-symbols-outlined text-5xl text-[#e2ff00]">waving_hand</span>
            <h2 className="font-sans font-extrabold text-2xl text-white">¡Bienvenido/a!</h2>
            <p className="text-[#c6c9ab] text-sm font-sans max-w-md mx-auto">
              Rellena los datos básicos. Tu entrenador usará esta información para personalizar tu plan.
            </p>
          </>
        ) : (
          <h3 className="font-sans font-bold text-white text-base flex items-center gap-2">
            <span className="material-symbols-outlined text-[#e2ff00]">edit_note</span>
            Editar ficha de iniciación
          </h3>
        )}
      </div>

      {error && (
        <p className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl text-xs font-mono">
          {error}
        </p>
      )}

      {/* ── COMPOSICIÓN CORPORAL ─────────────────────────────────────── */}
      <Section icon="monitor_weight" title="Composición corporal">
        <PillSelect<'male' | 'female'>
          label="Sexo biológico" value={form.sex} onChange={v => set('sex', v)}
          options={[
            { value: 'male',   label: 'Hombre' },
            { value: 'female', label: 'Mujer'  },
          ]}
        />
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Fecha de nacimiento</p>
          <input type="date" value={form.birthDate}
            onChange={e => set('birthDate', e.target.value)}
            className={FIELD}
            max={new Date().toISOString().split('T')[0]}
          />
          {form.birthDate && (
            <p className="font-mono text-[9px] text-[#555]">
              {calcAge(form.birthDate)} años
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Peso</p>
            <div className="flex items-center gap-2">
              <input type="number" min={30} max={250} step={0.1} value={form.weightKg}
                onChange={e => set('weightKg', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="70"
                className="flex-1 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] text-center" />
              <span className="font-mono text-[10px] text-[#555] flex-shrink-0">kg</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Altura</p>
            <div className="flex items-center gap-2">
              <input type="number" min={100} max={250} step={1} value={form.heightCm}
                onChange={e => set('heightCm', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="170"
                className="flex-1 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] text-center" />
              <span className="font-mono text-[10px] text-[#555] flex-shrink-0">cm</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">% Grasa <span className="text-[#555] normal-case">(opc)</span></p>
            <div className="flex items-center gap-2">
              <input type="number" min={3} max={60} step={0.1} value={form.bodyFatPct}
                onChange={e => set('bodyFatPct', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="—"
                className="flex-1 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] text-center" />
              <span className="font-mono text-[10px] text-[#555] flex-shrink-0">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">% Músculo <span className="text-[#555] normal-case">(opc)</span></p>
            <div className="flex items-center gap-2">
              <input type="number" min={10} max={70} step={0.1} value={form.musclePct}
                onChange={e => set('musclePct', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="—"
                className="flex-1 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] text-center" />
              <span className="font-mono text-[10px] text-[#555] flex-shrink-0">%</span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── NIVEL DE ACTIVIDAD ───────────────────────────────────────── */}
      <Section icon="directions_run" title="Nivel de actividad">
        <div className="space-y-2">
          {([
            { value: 'sedentario'  as ActivityLevel, label: 'Sedentario',  desc: 'Trabajo de oficina, poco o nada de ejercicio', factor: '×1.2'   },
            { value: 'poco_activo' as ActivityLevel, label: 'Poco activo', desc: 'Ejercicio ligero 1–3 días/semana',              factor: '×1.375' },
            { value: 'activo'      as ActivityLevel, label: 'Activo',      desc: 'Ejercicio moderado 3–5 días/semana',            factor: '×1.55'  },
            { value: 'muy_activo'  as ActivityLevel, label: 'Muy activo',  desc: 'Ejercicio intenso 6–7 días/semana',             factor: '×1.725' },
          ]).map(o => (
            <button key={o.value} type="button" onClick={() => set('activityLevel', o.value)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                form.activityLevel === o.value
                  ? 'bg-[#1a1c12] border-[#e2ff00]/40'
                  : 'bg-[#0a0a0a] border-[#2a2a2a] hover:border-[#3a3a3a]'
              }`}>
              <div className="flex-1 min-w-0">
                <p className={`font-mono text-xs font-bold ${form.activityLevel === o.value ? 'text-[#e2ff00]' : 'text-white'}`}>{o.label}</p>
                <p className="font-mono text-[9px] text-[#555] mt-0.5">{o.desc}</p>
              </div>
              <span className={`font-mono text-[10px] font-bold flex-shrink-0 ${form.activityLevel === o.value ? 'text-[#e2ff00]' : 'text-[#3a3a3a]'}`}>{o.factor}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* ── OBJETIVO ─────────────────────────────────────────────────── */}
      <Section icon="flag" title="Objetivo">
        <PillSelect<GoalBody>
          label="Composición corporal" value={form.goalBody} onChange={v => set('goalBody', v)}
          options={[
            { value: 'reducir_grasa',    label: 'Reducir grasa'    },
            { value: 'mantener',         label: 'Mantener'         },
            { value: 'aumentar_musculo', label: 'Aumentar músculo' },
          ]}
        />
        <PillSelect<GoalCapacity>
          label="Capacidad física" value={form.goalCapacity} onChange={v => set('goalCapacity', v)}
          options={[
            { value: 'fuerza',              label: 'Fuerza'             },
            { value: 'fuerza_resistencia',  label: 'Fuerza-resistencia' },
            { value: 'salud',               label: 'Salud'              },
          ]}
        />
      </Section>

      {/* ── NUTRICIÓN + CÁLCULO AUTOMÁTICO ───────────────────────────── */}
      <Section icon="nutrition" title="Nutrición">
        <PillSelect<DietType>
          label="Tipo de dieta" value={form.dietType} onChange={v => set('dietType', v)}
          options={[
            { value: 'omnivoro',    label: 'Omnívoro'    },
            { value: 'vegetariano', label: 'Vegetariano' },
            { value: 'vegano',      label: 'Vegano'      },
            { value: 'otro',        label: 'Otro'        },
          ]}
        />

        {/* Auto-calc panel */}
        {autoCalc && (
          <div className="bg-[#00eefc]/5 border border-[#00eefc]/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#00eefc] text-base">calculate</span>
              <p className="font-mono text-[10px] text-[#00eefc] uppercase font-bold tracking-wide">Cálculo automático (Mifflin-St Jeor)</p>
            </div>
            <div className="space-y-0.5 font-mono text-xs text-[#888]">
              <p>BMR: <span className="text-white font-bold">{autoCalc.bmr.toLocaleString()} kcal</span></p>
              <p>
                TDEE ({form.activityLevel && (
                  {sedentario:'Sedentario',poco_activo:'Poco activo',activo:'Activo',muy_activo:'Muy activo'}[form.activityLevel]
                )} ×{form.activityLevel ? ACTIVITY_FACTORS[form.activityLevel] : ''}):
                {' '}<span className="text-white font-bold">{autoCalc.tdee.toLocaleString()} kcal</span>
              </p>
              <p>
                Objetivo ({form.goalBody ? GOAL_ADJ_LABEL[form.goalBody] : ''}):
                {' '}<span className="text-[#e2ff00] font-bold">{autoCalc.kcal.toLocaleString()} kcal</span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#00eefc]/10">
              {[
                { label: 'HC',    g: autoCalc.hcG,    pct: autoCalc.hcPct,    ef: 25, color: '#ffa500' },
                { label: 'PROT',  g: autoCalc.protG,  pct: autoCalc.protPct,  ef: 25, color: '#00eefc' },
                { label: 'GRASA', g: autoCalc.grasaG, pct: autoCalc.grasaPct, ef: 11, color: '#ff6b6b' },
              ].map(m => (
                <div key={m.label} className="text-center">
                  <p className="font-mono text-[9px] font-bold uppercase" style={{ color: m.color }}>{m.label}</p>
                  <p className="font-mono text-base font-bold text-white">{m.g}g</p>
                  <p className="font-mono text-[9px] text-[#555]">{m.pct}% · {fmtExch(m.g / m.ef)} int</p>
                </div>
              ))}
            </div>
            <button type="button" onClick={applyAuto}
              className="w-full py-2 bg-[#00eefc]/10 hover:bg-[#00eefc]/15 border border-[#00eefc]/30 text-[#00eefc] font-mono font-bold text-[10px] uppercase rounded-lg tracking-wide active:scale-95 transition-all">
              Aplicar este cálculo
            </button>
          </div>
        )}
        {!autoCalc && (
          <p className="font-mono text-[9px] text-[#555] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-xs">info</span>
            Completa composición + actividad + objetivo para ver el cálculo automático de kcal y macros.
          </p>
        )}

        {/* Manual calorie input */}
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Objetivo calórico diario</p>
          <div className="flex items-center gap-2">
            <input type="number" min={800} max={8000} step={50} value={form.targetCalories}
              onChange={e => set('targetCalories', e.target.value === '' ? '' : Number(e.target.value))}
              className="w-28 bg-[#0e0e0e] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] text-center" />
            <span className="font-mono text-xs text-[#c6c9ab]">kcal/día</span>
          </div>
        </div>

        {/* Macro split */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Distribución de macros</p>
          <div className="space-y-2">
            {([
              { key: 'hcPct'    as const, label: 'HC',    factor: 4 as const, ef: 25, color: '#ffa500', grams: hcG    },
              { key: 'protPct'  as const, label: 'PROT',  factor: 4 as const, ef: 25, color: '#00eefc', grams: protG  },
              { key: 'grasaPct' as const, label: 'GRASA', factor: 9 as const, ef: 11, color: '#ff6b6b', grams: grasaG },
            ]).map(m => (
              <div key={m.key} className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold w-10 text-right shrink-0" style={{ color: m.color }}>{m.label}</span>
                <input type="number" min={0} max={100} value={form[m.key]}
                  onChange={e => set(m.key, e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-14 bg-[#0e0e0e] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#e2ff00] text-center shrink-0" />
                <span className="font-mono text-[10px] text-[#555] shrink-0">%</span>
                {cal > 0 ? (
                  <>
                    <span className="font-mono text-sm font-bold text-white w-14 shrink-0">{m.grams}g</span>
                    <span className="font-mono text-[9px] text-[#555]">{fmtExch(m.grams / m.ef)} int</span>
                  </>
                ) : (
                  <span className="font-mono text-sm text-[#444] w-14 shrink-0">—</span>
                )}
              </div>
            ))}
          </div>
          <div className={`flex items-center gap-1.5 font-mono text-[10px] ${totalPct === 100 ? 'text-[#06d6a0]' : 'text-amber-400'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{totalPct === 100 ? 'check_circle' : 'warning'}</span>
            Total: {totalPct}% {totalPct === 100 ? '✓' : `— debe sumar 100%`}
          </div>
        </div>

        {/* Allergies */}
        <TagInput label="Alergias / intolerancias" placeholder="p.ej. lactosa, gluten, frutos secos…"
          helpText="Pulsa Enter o coma para añadir. Excluyen recetas del generador."
          tags={form.allergies} onChange={v => set('allergies', v)} />
      </Section>

      {/* ── COMIDAS ──────────────────────────────────────────────────── */}
      <Section icon="schedule" title="Comidas">
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Número de ingestas</p>
          <div className="flex gap-2">
            {([3, 4, 5] as const).map(n => (
              <button key={n} type="button" onClick={() => changeMealCount(n)}
                className={`flex-1 py-2 rounded-lg font-mono text-sm font-bold border transition-all ${
                  form.mealCount === n
                    ? 'bg-[#e2ff00] text-black border-transparent'
                    : 'bg-transparent text-[#c6c9ab] border-[#2a2a2a] hover:text-white hover:border-[#3a3a3a]'
                }`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Ingestas y tupper</p>
          <div className="divide-y divide-[#1e1e1e] rounded-xl overflow-hidden border border-[#2a2a2a]">
            {form.meals.map((meal, i) => (
              <div key={meal.intakeType} className="flex items-center gap-3 px-4 py-3 bg-[#0a0a0a]">
                <span className="material-symbols-outlined text-[#555] text-base">{INTAKE_ICONS[meal.intakeType]}</span>
                <span className="flex-1 font-mono text-xs text-white">{meal.name}</span>
                <button type="button" onClick={() => toggleTupper(i)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono text-[9px] font-bold border transition-all ${
                    meal.needsTupper
                      ? 'bg-[#00eefc]/15 border-[#00eefc]/40 text-[#00eefc]'
                      : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#555] hover:text-[#c6c9ab] hover:border-[#3a3a3a]'
                  }`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>lunch_dining</span>
                  Tupper
                </button>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── COCINA ───────────────────────────────────────────────────── */}
      <Section icon="soup_kitchen" title="Cocina">
        <SliderField
          label="Nivel de cocina"
          min={1} max={5} value={form.cookingLevel}
          onChange={v => set('cookingLevel', v)}
          minLabel="Básico (hervir agua)"
          maxLabel="Chef avanzado"
        />
        <SliderField
          label="Tiempo máximo por receta"
          min={15} max={90} step={5} value={form.cookingMaxTime}
          onChange={v => set('cookingMaxTime', v)}
          unit=" min"
          minLabel="15 min"
          maxLabel="90 min"
        />
        <SliderField
          label="Variedad en desayunos"
          min={1} max={5} value={form.breakfastVariety}
          onChange={v => set('breakfastVariety', v)}
          minLabel="Siempre lo mismo"
          maxLabel="Mucha variedad"
        />
        <SliderField
          label="Variedad en almuerzos y meriendas"
          min={1} max={5} value={form.lunchVariety}
          onChange={v => set('lunchVariety', v)}
          minLabel="Siempre lo mismo"
          maxLabel="Mucha variedad"
        />
      </Section>

      {/* ── ENTRENAMIENTO ────────────────────────────────────────────── */}
      <Section icon="fitness_center" title="Entrenamiento">
        <PillSelect<ExperienceLevel>
          label="Nivel de experiencia" value={form.experienceLevel} onChange={v => set('experienceLevel', v)}
          options={[
            { value: 'principiante', label: 'Principiante' },
            { value: 'intermedio',   label: 'Intermedio'   },
            { value: 'avanzado',     label: 'Avanzado'     },
          ]}
        />
        <TagInput label="Material disponible" placeholder="p.ej. mancuernas, barra…"
          helpText="Equipamiento al que tienes acceso"
          tags={form.equipment} onChange={v => set('equipment', v)} />
        <TagInput label="Ejercicios favoritos" placeholder="p.ej. sentadilla, press banca…"
          tags={form.favoriteExercises} onChange={v => set('favoriteExercises', v)} />
        <TagInput label="Ejercicios que prefieres evitar" placeholder="p.ej. remo con barra…"
          tags={form.hatedExercises} onChange={v => set('hatedExercises', v)} />
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Lesiones / limitaciones</p>
          <textarea rows={3} value={form.injuries} onChange={e => set('injuries', e.target.value)}
            placeholder="p.ej. rodilla derecha operada (menisco)…"
            className={`${FIELD} resize-none placeholder:text-[#444]`} />
        </div>
      </Section>

      {/* ── VALORACIÓN DETALLADA (template questions) ────────────────── */}
      {template.length > 0 && (
        <div className="space-y-4">
          <p className="font-mono text-[9px] text-[#555] uppercase tracking-widest flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-[#555]">tune</span>
            Valoración detallada
          </p>
          {(['entrenamiento', 'nutricion', 'descanso'] as OnboardingSection[]).map(section => {
            const questions = template.filter(q => q.section === section);
            if (questions.length === 0) return null;
            const meta = SECTION_META[section];
            return (
              <React.Fragment key={section}>
                <Section icon={meta.icon} title={meta.label}>
                  <div className="space-y-4">
                    {questions.map(q => (
                      <div key={q.id} className="space-y-1.5 border-b border-[#2a2a2a]/40 pb-3 last:border-0 last:pb-0">
                        <p className="font-mono text-[10px] text-[#c6c9ab] uppercase">{q.label}</p>
                        {renderAnswer(q)}
                      </div>
                    ))}
                  </div>
                </Section>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex-1 py-3 bg-[#e2ff00] text-black font-mono font-bold text-sm uppercase rounded-xl hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-50">
          {saving ? 'Guardando…' : isFirstTime ? 'Guardar y empezar' : 'Guardar cambios'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-5 py-3 border border-[#2a2a2a] text-[#c6c9ab] font-mono text-sm rounded-xl hover:text-white hover:border-[#3a3a3a] transition-all">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

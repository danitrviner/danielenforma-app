import React, { useState, useMemo } from 'react';
import {
  OnboardingData, OnboardingMeal, DietType, ExperienceLevel,
  ActivityLevel, GoalBody, GoalCapacity, SupplementEntry,
  ProgressFrequency, TechniqueLevel, SleepRoutineOrScreen,
  OnboardingSection, OnboardingTemplateQuestion,
} from '../types';
import { saveOnboarding, updateOnboarding } from '../dbService';
import { ACTIVITY_FACTORS, GOAL_ADJUSTMENTS, calcAge, mifflinBMR } from '../utils/energyCalc';

// ── Section metadata ──────────────────────────────────────────────────────────

const SECTION_META: Record<OnboardingSection, { icon: string; label: string }> = {
  entrenamiento: { icon: 'fitness_center', label: 'Entrenamiento'           },
  nutricion:     { icon: 'restaurant',     label: 'Nutrición'               },
  descanso:      { icon: 'bedtime',        label: 'Descanso / Recuperación' },
};

// ── Constants ─────────────────────────────────────────────────────────────────

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
  occupation:       string;
  referralSource:   string;
  goalFreeText:     string;
  activityLevel:    ActivityLevel | '';
  goalBody:         GoalBody | '';
  goalCapacity:     GoalCapacity | '';
  hasCurrentInjury:        boolean;
  currentInjuryLocation:   string;
  currentInjuryIntensity:  number;
  currentInjuryMovements:  string;
  hadPastInjuries:         boolean;
  pastInjuriesDetail:      string;
  takesMedication:         boolean;
  medicationDetail:        string;
  recentSurgery:           boolean;
  recentSurgeryDetail:     string;
  smokesAlcoholSubstances: string;
  sunExposureWeekly:       string;
  dietType:         DietType;
  targetCalories:   number | '';
  hcPct:            number | '';
  protPct:          number | '';
  grasaPct:         number | '';
  appetitePeakTime:       string;
  dietSince:              string;
  hadOverweightHistory:   boolean;
  foodRelationshipGood:   boolean;
  foodRelationshipReason: string;
  eatsTooFast:            boolean;
  supplements:            SupplementEntry[];
  weightTendency:         string;
  neckCm:                 number | '';
  waistCm:                number | '';
  hipCm:                  number | '';
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
  oneRepMaxTotal:        number | '';
  progressFrequency:     ProgressFrequency | '';
  techniqueLevel:        TechniqueLevel | '';
  currentMotivation:     number;
  muscleGroupsToImprove: string;
  restDayActive:         boolean;
  restDayActiveDetail:   string;
  sittingHoursPerDay:    number | '';
  stressReason:          string;
  sleepDeficitCauses:    string[];
  sleepRoutineOrScreen:  SleepRoutineOrScreen | '';
  sleepMedication:       boolean;
  sleepMedicationDetail: string;
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
    occupation:       d.occupation ?? '',
    referralSource:   d.referralSource ?? '',
    goalFreeText:     d.goalFreeText ?? '',
    activityLevel:    d.activityLevel ?? '',
    goalBody:         d.goalBody ?? '',
    goalCapacity:     d.goalCapacity ?? '',
    hasCurrentInjury:        d.hasCurrentInjury ?? false,
    currentInjuryLocation:   d.currentInjuryLocation ?? '',
    currentInjuryIntensity:  d.currentInjuryIntensity ?? 5,
    currentInjuryMovements:  d.currentInjuryMovements ?? '',
    hadPastInjuries:         d.hadPastInjuries ?? false,
    pastInjuriesDetail:      d.pastInjuriesDetail ?? '',
    takesMedication:         d.takesMedication ?? false,
    medicationDetail:        d.medicationDetail ?? '',
    recentSurgery:           d.recentSurgery ?? false,
    recentSurgeryDetail:     d.recentSurgeryDetail ?? '',
    smokesAlcoholSubstances: d.smokesAlcoholSubstances ?? '',
    sunExposureWeekly:       d.sunExposureWeekly ?? '',
    dietType:         d.dietType,
    targetCalories:   d.targetCalories,
    hcPct:            d.macroSplit.hc,
    protPct:          d.macroSplit.prot,
    grasaPct:         d.macroSplit.grasa,
    appetitePeakTime:       d.appetitePeakTime ?? '',
    dietSince:              d.dietSince ?? '',
    hadOverweightHistory:   d.hadOverweightHistory ?? false,
    foodRelationshipGood:   d.foodRelationshipGood ?? true,
    foodRelationshipReason: d.foodRelationshipReason ?? '',
    eatsTooFast:            d.eatsTooFast ?? false,
    supplements:            d.supplements ?? [],
    weightTendency:         d.weightTendency ?? '',
    neckCm:                 d.neckCm ?? '',
    waistCm:                d.waistCm ?? '',
    hipCm:                  d.hipCm ?? '',
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
    oneRepMaxTotal:        d.oneRepMaxTotal ?? '',
    progressFrequency:     d.progressFrequency ?? '',
    techniqueLevel:        d.techniqueLevel ?? '',
    currentMotivation:     d.currentMotivation ?? 5,
    muscleGroupsToImprove: d.muscleGroupsToImprove ?? '',
    restDayActive:         d.restDayActive ?? false,
    restDayActiveDetail:   d.restDayActiveDetail ?? '',
    sittingHoursPerDay:    d.sittingHoursPerDay ?? '',
    stressReason:          d.stressReason ?? '',
    sleepDeficitCauses:    d.sleepDeficitCauses ?? [],
    sleepRoutineOrScreen:  d.sleepRoutineOrScreen ?? '',
    sleepMedication:       d.sleepMedication ?? false,
    sleepMedicationDetail: d.sleepMedicationDetail ?? '',
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
  occupation:       '',
  referralSource:   '',
  goalFreeText:     '',
  activityLevel:    '',
  goalBody:         '',
  goalCapacity:     '',
  hasCurrentInjury:        false,
  currentInjuryLocation:   '',
  currentInjuryIntensity:  5,
  currentInjuryMovements:  '',
  hadPastInjuries:         false,
  pastInjuriesDetail:      '',
  takesMedication:         false,
  medicationDetail:        '',
  recentSurgery:           false,
  recentSurgeryDetail:     '',
  smokesAlcoholSubstances: '',
  sunExposureWeekly:       '',
  dietType:         'omnivoro',
  targetCalories:   2000,
  hcPct:            40,
  protPct:          30,
  grasaPct:         30,
  appetitePeakTime:       '',
  dietSince:              '',
  hadOverweightHistory:   false,
  foodRelationshipGood:   true,
  foodRelationshipReason: '',
  eatsTooFast:            false,
  supplements:            [],
  weightTendency:         '',
  neckCm:                 '',
  waistCm:                '',
  hipCm:                  '',
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
  oneRepMaxTotal:        '',
  progressFrequency:     '',
  techniqueLevel:        '',
  currentMotivation:     5,
  muscleGroupsToImprove: '',
  restDayActive:         false,
  restDayActiveDetail:   '',
  sittingHoursPerDay:    '',
  stressReason:          '',
  sleepDeficitCauses:    [],
  sleepRoutineOrScreen:  '',
  sleepMedication:       false,
  sleepMedicationDetail: '',
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
                ? 'bg-[#fbcb1a] text-black border-transparent'
                : 'bg-transparent text-[#c6c9ab] border-white/7 hover:text-white hover:border-[#3a3a3a]'
            }`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">{label}</p>
      <div className="flex gap-2">
        {([{ v: true, l: 'Sí' }, { v: false, l: 'No' }]).map(o => (
          <button key={String(o.v)} type="button" onClick={() => onChange(o.v)}
            className={`flex-1 py-2 rounded-lg font-mono text-xs font-bold border transition-all ${
              value === o.v
                ? 'bg-[#fbcb1a] text-black border-transparent'
                : 'bg-transparent text-[#c6c9ab] border-white/7 hover:text-white hover:border-[#3a3a3a]'
            }`}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckboxGroup({
  label, options, values, onChange,
}: {
  label: string; options: string[]; values: string[]; onChange: (next: string[]) => void;
}) {
  const toggle = (opt: string) =>
    onChange(values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt]);
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border transition-all ${
              values.includes(opt)
                ? 'bg-[#fbcb1a] text-black border-transparent'
                : 'bg-transparent text-[#c6c9ab] border-white/7 hover:text-white hover:border-[#3a3a3a]'
            }`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">{label}</p>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] w-full placeholder:text-[#444]" />
    </div>
  );
}

function NumberField({
  label, value, onChange, unit, min, max,
}: {
  label: string; value: number | ''; onChange: (v: number | '') => void; unit?: string; min?: number; max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-2">
        <input type="number" min={min} max={max} value={value}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="flex-1 bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] text-center" />
        {unit && <span className="font-mono text-[10px] text-[#555] flex-shrink-0">{unit}</span>}
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
      <div className="flex flex-wrap gap-1.5 p-2.5 bg-[#0e0e0e] border border-white/7 rounded-lg min-h-[44px] focus-within:ring-1 focus-within:ring-[#fbcb1a]/50 transition-all">
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

function SupplementsTable({
  rows, onChange,
}: {
  rows: SupplementEntry[]; onChange: (next: SupplementEntry[]) => void;
}) {
  const update = (i: number, patch: Partial<SupplementEntry>) =>
    onChange(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { name: '', dose: '', frequency: '' }]);

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Suplementación</p>
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="text" value={r.name} onChange={e => update(i, { name: e.target.value })}
                placeholder="Suplemento" className="flex-1 min-w-0 bg-[#0e0e0e] border border-white/7 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] placeholder:text-[#444]" />
              <input type="text" value={r.dose} onChange={e => update(i, { dose: e.target.value })}
                placeholder="Dosis" className="w-20 flex-shrink-0 bg-[#0e0e0e] border border-white/7 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] placeholder:text-[#444]" />
              <input type="text" value={r.frequency} onChange={e => update(i, { frequency: e.target.value })}
                placeholder="Frecuencia" className="w-24 flex-shrink-0 bg-[#0e0e0e] border border-white/7 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] placeholder:text-[#444]" />
              <button type="button" onClick={() => remove(i)} className="text-[#c6c9ab] hover:text-red-400 transition-colors flex-shrink-0">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={add}
        className="flex items-center gap-1 font-mono text-[10px] text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors border border-dashed border-white/7 hover:border-[#fbcb1a]/40 px-2.5 py-1.5 rounded-lg">
        <span className="material-symbols-outlined text-sm">add</span>
        Añadir suplemento
      </button>
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 bg-[#0e0e0e] border border-white/7 rounded-xl p-5">
      <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[#fbcb1a] flex items-center gap-2">
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
        className="w-full accent-[#fbcb1a] cursor-pointer" />
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

const FIELD = 'bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] w-full';

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
      occupation:         form.occupation || undefined,
      referralSource:     form.referralSource || undefined,
      goalFreeText:       form.goalFreeText || undefined,
      activityLevel:      form.activityLevel !== '' ? form.activityLevel : undefined,
      goalBody:           form.goalBody      !== '' ? form.goalBody      : undefined,
      goalCapacity:       form.goalCapacity  !== '' ? form.goalCapacity  : undefined,
      hasCurrentInjury:        form.hasCurrentInjury,
      currentInjuryLocation:   form.hasCurrentInjury ? (form.currentInjuryLocation || undefined) : undefined,
      currentInjuryIntensity:  form.hasCurrentInjury ? form.currentInjuryIntensity : undefined,
      currentInjuryMovements:  form.hasCurrentInjury ? (form.currentInjuryMovements || undefined) : undefined,
      hadPastInjuries:         form.hadPastInjuries,
      pastInjuriesDetail:      form.hadPastInjuries ? (form.pastInjuriesDetail || undefined) : undefined,
      takesMedication:         form.takesMedication,
      medicationDetail:        form.takesMedication ? (form.medicationDetail || undefined) : undefined,
      recentSurgery:           form.recentSurgery,
      recentSurgeryDetail:     form.recentSurgery ? (form.recentSurgeryDetail || undefined) : undefined,
      smokesAlcoholSubstances: form.smokesAlcoholSubstances || undefined,
      sunExposureWeekly:       form.sunExposureWeekly || undefined,
      dietType:           form.dietType,
      targetCalories:     Number(form.targetCalories),
      macroSplit:         { hc: Number(form.hcPct)||0, prot: Number(form.protPct)||0, grasa: Number(form.grasaPct)||0 },
      macroGrams:         { hc: hcG, prot: protG, grasa: grasaG },
      appetitePeakTime:       form.appetitePeakTime || undefined,
      dietSince:              form.dietSince || undefined,
      hadOverweightHistory:   form.hadOverweightHistory,
      foodRelationshipGood:   form.foodRelationshipGood,
      foodRelationshipReason: !form.foodRelationshipGood ? (form.foodRelationshipReason || undefined) : undefined,
      eatsTooFast:            form.eatsTooFast,
      supplements:            form.supplements.filter(s => s.name.trim()),
      weightTendency:         form.weightTendency || undefined,
      neckCm:                 form.neckCm  !== '' ? Number(form.neckCm)  : undefined,
      waistCm:                form.waistCm !== '' ? Number(form.waistCm) : undefined,
      hipCm:                  form.hipCm   !== '' ? Number(form.hipCm)   : undefined,
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
      oneRepMaxTotal:        form.oneRepMaxTotal !== '' ? Number(form.oneRepMaxTotal) : undefined,
      progressFrequency:     form.progressFrequency !== '' ? form.progressFrequency : undefined,
      techniqueLevel:        form.techniqueLevel !== '' ? form.techniqueLevel : undefined,
      currentMotivation:     form.currentMotivation,
      muscleGroupsToImprove: form.muscleGroupsToImprove || undefined,
      restDayActive:         form.restDayActive,
      restDayActiveDetail:   form.restDayActive ? (form.restDayActiveDetail || undefined) : undefined,
      sittingHoursPerDay:    form.sittingHoursPerDay !== '' ? Number(form.sittingHoursPerDay) : undefined,
      stressReason:          form.stressReason || undefined,
      sleepDeficitCauses:    form.sleepDeficitCauses,
      sleepRoutineOrScreen:  form.sleepRoutineOrScreen !== '' ? form.sleepRoutineOrScreen : undefined,
      sleepMedication:       form.sleepMedication,
      sleepMedicationDetail: form.sleepMedication ? (form.sleepMedicationDetail || undefined) : undefined,
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
            className="w-24 bg-[#0e0e0e] border border-white/7 rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] text-center" />
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
            className="flex-1 accent-[#fbcb1a]" />
          <span className="font-mono text-[9px] text-[#555] w-3">{max}</span>
          <span className="font-mono text-sm font-bold text-white w-6 text-right">{num || '—'}</span>
        </div>
      );
    }
    if (q.type === 'choice') {
      return (
        <select value={String(val ?? '')} onChange={e => setAnswer(q.id, e.target.value)}
          className="bg-[#0e0e0e] border border-white/7 rounded-lg px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]">
          <option value="">— elegir —</option>
          {(q.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return (
      <textarea value={String(val ?? '')} rows={2}
        onChange={e => setAnswer(q.id, e.target.value)}
        className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] resize-none" />
    );
  };

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Header */}
      <div className={isFirstTime ? 'text-center space-y-2 py-4' : 'space-y-1'}>
        {isFirstTime ? (
          <>
            <span className="material-symbols-outlined text-5xl text-[#fbcb1a]">waving_hand</span>
            <h2 className="font-sans font-extrabold text-2xl text-white">¡Bienvenido/a!</h2>
            <p className="text-[#c6c9ab] text-sm font-sans max-w-md mx-auto">
              Rellena los datos básicos. Tu entrenador usará esta información para personalizar tu plan.
            </p>
          </>
        ) : (
          <h3 className="font-sans font-bold text-white text-base flex items-center gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a]">edit_note</span>
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
                className="flex-1 bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] text-center" />
              <span className="font-mono text-[10px] text-[#555] flex-shrink-0">kg</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Altura</p>
            <div className="flex items-center gap-2">
              <input type="number" min={100} max={250} step={1} value={form.heightCm}
                onChange={e => set('heightCm', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="170"
                className="flex-1 bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] text-center" />
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
                className="flex-1 bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] text-center" />
              <span className="font-mono text-[10px] text-[#555] flex-shrink-0">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">% Músculo <span className="text-[#555] normal-case">(opc)</span></p>
            <div className="flex items-center gap-2">
              <input type="number" min={10} max={70} step={0.1} value={form.musclePct}
                onChange={e => set('musclePct', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="—"
                className="flex-1 bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] text-center" />
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
                  ? 'bg-[#1a1c12] border-[#fbcb1a]/40'
                  : 'bg-[#0a0a0a] border-white/7 hover:border-[#3a3a3a]'
              }`}>
              <div className="flex-1 min-w-0">
                <p className={`font-mono text-xs font-bold ${form.activityLevel === o.value ? 'text-[#fbcb1a]' : 'text-white'}`}>{o.label}</p>
                <p className="font-mono text-[9px] text-[#555] mt-0.5">{o.desc}</p>
              </div>
              <span className={`font-mono text-[10px] font-bold flex-shrink-0 ${form.activityLevel === o.value ? 'text-[#fbcb1a]' : 'text-[#3a3a3a]'}`}>{o.factor}</span>
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
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Objetivo, en tus palabras <span className="text-[#555] normal-case">(opc)</span></p>
          <textarea rows={2} value={form.goalFreeText} onChange={e => set('goalFreeText', e.target.value)}
            placeholder="Describe con tus palabras qué quieres conseguir…"
            className={`${FIELD} resize-none placeholder:text-[#444]`} />
        </div>
      </Section>

      {/* ── DATOS PERSONALES ADICIONALES ─────────────────────────────── */}
      <Section icon="badge" title="Datos personales">
        <TextField label="Ocupación" value={form.occupation} onChange={v => set('occupation', v)} placeholder="p.ej. profesor, comercial…" />
        <TextField label="¿Cómo nos has conocido?" value={form.referralSource} onChange={v => set('referralSource', v)} placeholder="p.ej. Instagram, recomendación…" />
      </Section>

      {/* ── SALUD ─────────────────────────────────────────────────────── */}
      <Section icon="health_and_safety" title="Salud">
        <YesNo label="¿Tienes alguna lesión o molestia actual?" value={form.hasCurrentInjury} onChange={v => set('hasCurrentInjury', v)} />
        {form.hasCurrentInjury && (
          <div className="space-y-3 pl-3 border-l-2 border-white/7">
            <TextField label="¿Dónde?" value={form.currentInjuryLocation} onChange={v => set('currentInjuryLocation', v)} />
            <SliderField label="Intensidad" min={1} max={10} value={form.currentInjuryIntensity} onChange={v => set('currentInjuryIntensity', v)} />
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">¿En qué gestos/movimientos/ejercicios sientes dolor?</p>
              <textarea rows={2} value={form.currentInjuryMovements} onChange={e => set('currentInjuryMovements', e.target.value)}
                className={`${FIELD} resize-none placeholder:text-[#444]`} />
            </div>
          </div>
        )}
        <YesNo label="¿Lesiones anteriores?" value={form.hadPastInjuries} onChange={v => set('hadPastInjuries', v)} />
        {form.hadPastInjuries && (
          <div className="pl-3 border-l-2 border-white/7">
            <TextField label="¿Cuál?" value={form.pastInjuriesDetail} onChange={v => set('pastInjuriesDetail', v)} />
          </div>
        )}
        <YesNo label="¿Consumes algún medicamento o fármaco?" value={form.takesMedication} onChange={v => set('takesMedication', v)} />
        {form.takesMedication && (
          <div className="pl-3 border-l-2 border-white/7">
            <TextField label="¿Cuál?" value={form.medicationDetail} onChange={v => set('medicationDetail', v)} />
          </div>
        )}
        <YesNo label="¿Intervención quirúrgica reciente?" value={form.recentSurgery} onChange={v => set('recentSurgery', v)} />
        {form.recentSurgery && (
          <div className="pl-3 border-l-2 border-white/7">
            <TextField label="¿Cuál?" value={form.recentSurgeryDetail} onChange={v => set('recentSurgeryDetail', v)} />
          </div>
        )}
        <TextField label="¿Fumas / alcohol / otras sustancias?" value={form.smokesAlcoholSubstances} onChange={v => set('smokesAlcoholSubstances', v)} placeholder="Describe brevemente…" />
        <TextField label="Exposición al sol durante la semana" value={form.sunExposureWeekly} onChange={v => set('sunExposureWeekly', v)} placeholder="p.ej. 2-3 horas los fines de semana" />
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
                {' '}<span className="text-[#fbcb1a] font-bold">{autoCalc.kcal.toLocaleString()} kcal</span>
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
              className="w-28 bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] text-center" />
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
                  className="w-14 bg-[#0e0e0e] border border-white/7 rounded px-2 py-1 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] text-center shrink-0" />
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

        {(form.dietType === 'vegano' || form.dietType === 'vegetariano') && (
          <TextField label="¿Desde cuándo?" value={form.dietSince} onChange={v => set('dietSince', v)} placeholder="p.ej. desde hace 2 años" />
        )}
        <TextField label="¿En qué momento del día tienes más apetito?" value={form.appetitePeakTime} onChange={v => set('appetitePeakTime', v)} placeholder="p.ej. por la mañana, por la noche…" />
        <YesNo label="¿Has tenido sobrepeso u obesidad anteriormente?" value={form.hadOverweightHistory} onChange={v => set('hadOverweightHistory', v)} />
        <YesNo label="¿Tu relación con la comida es buena?" value={form.foodRelationshipGood} onChange={v => set('foodRelationshipGood', v)} />
        {!form.foodRelationshipGood && (
          <div className="pl-3 border-l-2 border-white/7">
            <TextField label="¿Por qué?" value={form.foodRelationshipReason} onChange={v => set('foodRelationshipReason', v)} />
          </div>
        )}
        <YesNo label="¿Comes muy deprisa?" value={form.eatsTooFast} onChange={v => set('eatsTooFast', v)} />
        <SupplementsTable rows={form.supplements} onChange={v => set('supplements', v)} />
        <TextField label="¿Tendencia a ganar o perder peso?" value={form.weightTendency} onChange={v => set('weightTendency', v)} placeholder="Descríbelo brevemente…" />
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Cuello" value={form.neckCm} onChange={v => set('neckCm', v)} unit="cm" min={0} />
          <NumberField label="Cintura" value={form.waistCm} onChange={v => set('waistCm', v)} unit="cm" min={0} />
          <NumberField label="Cadera" value={form.hipCm} onChange={v => set('hipCm', v)} unit="cm" min={0} />
        </div>
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
                    ? 'bg-[#fbcb1a] text-black border-transparent'
                    : 'bg-transparent text-[#c6c9ab] border-white/7 hover:text-white hover:border-[#3a3a3a]'
                }`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Ingestas y tupper</p>
          <div className="divide-y divide-[#1e1e1e] rounded-xl overflow-hidden border border-white/7">
            {form.meals.map((meal, i) => (
              <div key={meal.intakeType} className="flex items-center gap-3 px-4 py-3 bg-[#0a0a0a]">
                <span className="material-symbols-outlined text-[#555] text-base">{INTAKE_ICONS[meal.intakeType]}</span>
                <span className="flex-1 font-mono text-xs text-white">{meal.name}</span>
                <button type="button" onClick={() => toggleTupper(i)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono text-[9px] font-bold border transition-all ${
                    meal.needsTupper
                      ? 'bg-[#00eefc]/15 border-[#00eefc]/40 text-[#00eefc]'
                      : 'bg-[#1e1e1b] border-white/7 text-[#555] hover:text-[#c6c9ab] hover:border-[#3a3a3a]'
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
        <NumberField label="Múltiplo de levantamiento total (press banca + sentadilla + peso muerto)" value={form.oneRepMaxTotal} onChange={v => set('oneRepMaxTotal', v)} unit="kg" min={0} />
        <PillSelect<ProgressFrequency>
          label="¿Cada cuánto progresas?" value={form.progressFrequency} onChange={v => set('progressFrequency', v)}
          options={[
            { value: 'cada_semana',          label: 'Cada semana' },
            { value: 'cada_varias_semanas',  label: 'Cada varias semanas' },
            { value: 'con_dificultad',       label: 'Con dificultad' },
          ]}
        />
        <PillSelect<TechniqueLevel>
          label="Ejecución técnica" value={form.techniqueLevel} onChange={v => set('techniqueLevel', v)}
          options={[
            { value: 'mala',       label: 'Mala' },
            { value: 'regular',    label: 'Regular' },
            { value: 'buena',      label: 'Buena' },
            { value: 'muy_buena',  label: 'Muy buena' },
          ]}
        />
        <SliderField label="Motivación actual" min={1} max={10} value={form.currentMotivation} onChange={v => set('currentMotivation', v)} />
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wide">Grupos musculares o ejercicios a mejorar</p>
          <textarea rows={2} value={form.muscleGroupsToImprove} onChange={e => set('muscleGroupsToImprove', e.target.value)}
            className={`${FIELD} resize-none placeholder:text-[#444]`} />
        </div>
        <YesNo label="¿Te mantienes activo en tus días de descanso?" value={form.restDayActive} onChange={v => set('restDayActive', v)} />
        {form.restDayActive && (
          <div className="pl-3 border-l-2 border-white/7">
            <TextField label="¿Cómo?" value={form.restDayActiveDetail} onChange={v => set('restDayActiveDetail', v)} />
          </div>
        )}
        <NumberField label="Horas sentado al día" value={form.sittingHoursPerDay} onChange={v => set('sittingHoursPerDay', v)} unit="h" min={0} max={24} />
        <TextField label="Motivo del nivel de estrés" value={form.stressReason} onChange={v => set('stressReason', v)} placeholder="Complementa a la valoración detallada de más abajo…" />
      </Section>

      {/* ── DESCANSO ─────────────────────────────────────────────────── */}
      <Section icon="bedtime" title="Descanso">
        <CheckboxGroup
          label="Si tu descanso es deficitario, ¿por qué?"
          options={['Te cuesta dormir', 'Estrés', 'Pensamientos', 'Ansiedad', 'Duermes pero no descansas']}
          values={form.sleepDeficitCauses}
          onChange={v => set('sleepDeficitCauses', v)}
        />
        <PillSelect<SleepRoutineOrScreen>
          label="Antes de dormir, ¿rutina o pantalla?" value={form.sleepRoutineOrScreen} onChange={v => set('sleepRoutineOrScreen', v)}
          options={[
            { value: 'rutina',  label: 'Rutina' },
            { value: 'pantalla', label: 'Pantalla' },
          ]}
        />
        <YesNo label="¿Medicación para conciliar el sueño?" value={form.sleepMedication} onChange={v => set('sleepMedication', v)} />
        {form.sleepMedication && (
          <div className="pl-3 border-l-2 border-white/7">
            <TextField label="¿Cuál?" value={form.sleepMedicationDetail} onChange={v => set('sleepMedicationDetail', v)} />
          </div>
        )}
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
                      <div key={q.id} className="space-y-1.5 border-b border-white/40 pb-3 last:border-0 last:pb-0">
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
          className="flex-1 py-3 bg-[#fbcb1a] text-black font-sans font-bold text-sm uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50">
          {saving ? 'Guardando…' : isFirstTime ? 'Guardar y empezar' : 'Guardar cambios'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-5 py-3 border border-white/7 text-[#c6c9ab] font-mono text-sm rounded-xl hover:text-white hover:border-[#3a3a3a] transition-all">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

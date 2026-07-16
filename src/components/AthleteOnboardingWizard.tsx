import React, { useState } from 'react';
import {
  UserProfile, OnboardingData, GoalBody, GoalCapacity, ExperienceLevel,
  ActivityLevel, DietType,
} from '../types';
import { saveOnboarding } from '../dbService';

// Primera experiencia del atleta: wizard a pantalla completa, paso a paso, que
// bloquea la app hasta completarse (gating en App.tsx). Recoge lo esencial del
// onboarding — el coach completa/ajusta el resto desde su formulario largo.
// Hueco previsto para vídeo de bienvenida: ver VIDEO_SLOT más abajo.

interface Props {
  profile: UserProfile;
  onComplete: () => void;
}

const GOALS: { id: GoalBody; icon: string; label: string; desc: string }[] = [
  { id: 'reducir_grasa', icon: 'local_fire_department', label: 'Reducir grasa', desc: 'Perder grasa manteniendo músculo' },
  { id: 'aumentar_musculo', icon: 'fitness_center', label: 'Ganar músculo', desc: 'Construir masa muscular' },
  { id: 'mantener', icon: 'balance', label: 'Mantener', desc: 'Recomposición y hábitos' },
];

const CAPACITIES: { id: GoalCapacity; label: string }[] = [
  { id: 'fuerza', label: 'Fuerza' },
  { id: 'fuerza_resistencia', label: 'Fuerza + resistencia' },
  { id: 'salud', label: 'Salud general' },
];

const EXPERIENCE: { id: ExperienceLevel; label: string; desc: string }[] = [
  { id: 'principiante', label: 'Principiante', desc: 'Menos de 1 año entrenando' },
  { id: 'intermedio', label: 'Intermedio', desc: '1–3 años con constancia' },
  { id: 'avanzado', label: 'Avanzado', desc: 'Más de 3 años en serio' },
];

const EQUIPMENT_OPTIONS = [
  'Gimnasio completo', 'Mancuernas', 'Barra y discos', 'Bandas elásticas', 'Máquinas', 'Solo peso corporal',
];

const DIET_TYPES: { id: DietType; icon: string; label: string }[] = [
  { id: 'omnivoro', icon: 'restaurant', label: 'Omnívoro' },
  { id: 'vegetariano', icon: 'eco', label: 'Vegetariano' },
  { id: 'vegano', icon: 'psychiatry', label: 'Vegano' },
  { id: 'otro', icon: 'help', label: 'Otro' },
];

const ACTIVITY: { id: ActivityLevel; label: string; desc: string }[] = [
  { id: 'sedentario', label: 'Sedentario', desc: 'Trabajo sentado, poco movimiento' },
  { id: 'poco_activo', label: 'Poco activo', desc: 'Algo de movimiento diario' },
  { id: 'activo', label: 'Activo', desc: 'En movimiento gran parte del día' },
  { id: 'muy_activo', label: 'Muy activo', desc: 'Trabajo físico o mucho deporte' },
];

// Chip seleccionable reutilizado en todos los pasos.
interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  big?: boolean;
  key?: React.Key; // convención del proyecto: los tipos de React aquí no fusionan IntrinsicAttributes
}

function Chip({ selected, onClick, children, big = false }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${big ? 'p-4 rounded-2xl text-left w-full' : 'px-4 py-2.5 rounded-xl'} border font-sans text-sm transition-all active:scale-95 ${
        selected
          ? 'bg-[#fbcb1a]/15 border-[#fbcb1a] text-white shadow-lg shadow-[#fbcb1a]/10'
          : 'bg-[#181816] border-white/10 text-[#c6c9ab] hover:border-white/30'
      }`}
    >
      {children}
    </button>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6 animate-[fadeSlideIn_.35s_ease]">
      <div>
        <h2 className="font-sans font-black text-2xl text-white tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-[#c6c9ab] mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-[#181818] border border-white/10 focus:border-[#fbcb1a]/60 rounded-xl px-4 py-3 text-sm text-white placeholder-[#c6c9ab]/40 outline-none transition-colors';

export default function AthleteOnboardingWizard({ profile, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Respuestas ──────────────────────────────────────────────────────────────
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [birthDate, setBirthDate] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [goalBody, setGoalBody] = useState<GoalBody | ''>('');
  const [goalCapacity, setGoalCapacity] = useState<GoalCapacity | ''>('');
  const [goalFreeText, setGoalFreeText] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | ''>('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [injuries, setInjuries] = useState('');
  const [noInjuries, setNoInjuries] = useState(false);
  const [dietType, setDietType] = useState<DietType | ''>('');
  const [mealCount, setMealCount] = useState<number | null>(null);
  const [allergies, setAllergies] = useState('');
  const [dislikedFoods, setDislikedFoods] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | ''>('');

  const firstName = (profile.displayName || 'atleta').split(' ')[0];

  // Validación por paso: el atleta no avanza sin responder lo obligatorio.
  const stepValid = (): boolean => {
    switch (step) {
      case 0: return true;
      case 1: return !!sex && !!birthDate && Number(weightKg) >= 30 && Number(heightCm) >= 100;
      case 2: return !!goalBody && !!goalCapacity;
      case 3: return !!experienceLevel && equipment.length > 0 && (noInjuries || injuries.trim().length > 0);
      case 4: return !!dietType && mealCount != null;
      case 5: return !!activityLevel;
      default: return true;
    }
  };

  const TOTAL_STEPS = 7; // 0 bienvenida … 6 final

  const finish = async () => {
    setSaving(true);
    setError('');
    try {
      const targetCalories = 2000;
      const split = { hc: 40, prot: 30, grasa: 30 };
      const data: OnboardingData = {
        athleteId: profile.email,
        sex: sex || undefined,
        birthDate: birthDate || undefined,
        weightKg: Number(weightKg) || undefined,
        heightCm: Number(heightCm) || undefined,
        activityLevel: activityLevel || undefined,
        goalBody: goalBody || undefined,
        goalCapacity: goalCapacity || undefined,
        goalFreeText: goalFreeText.trim() || undefined,
        dietType: (dietType || 'omnivoro') as DietType,
        targetCalories,
        macroSplit: split,
        macroGrams: {
          hc: Math.round(targetCalories * split.hc / 100 / 4),
          prot: Math.round(targetCalories * split.prot / 100 / 4),
          grasa: Math.round(targetCalories * split.grasa / 100 / 9),
        },
        likedFoods: [],
        dislikedFoods: dislikedFoods.split(',').map(s => s.trim()).filter(Boolean),
        allergies: allergies.split(',').map(s => s.trim()).filter(Boolean),
        mealCount: mealCount ?? undefined,
        equipment,
        favoriteExercises: [],
        hatedExercises: [],
        experienceLevel: (experienceLevel || 'principiante') as ExperienceLevel,
        injuries: noInjuries ? '' : injuries.trim(),
        hasCurrentInjury: !noInjuries && injuries.trim().length > 0,
        currentInjuryLocation: noInjuries ? undefined : (injuries.trim() || undefined),
        completedAt: new Date().toISOString(),
      };
      await saveOnboarding(data);
      // Marca el tour como pendiente: App lo mostrará nada más entrar.
      localStorage.setItem(`enforma_tour_pending_${profile.email}`, '1');
      onComplete();
    } catch (err) {
      console.error('saveOnboarding failed:', err);
      setError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const pct = Math.round((step / (TOTAL_STEPS - 1)) * 100);

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex flex-col relative overflow-hidden">
      <style>{`@keyframes fadeSlideIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }`}</style>
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-[#fbcb1a]/5 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-[#00eefc]/5 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Progreso */}
      <div className="w-full max-w-lg mx-auto px-6 pt-8">
        <div className="flex items-center gap-2 mb-2">
          <img src="/atlas-logo.png" alt="En Forma" className="w-7 h-7 rounded-md" />
          <span className="font-sans font-black text-lg tracking-tighter uppercase text-[#fbcb1a]">EN FORMA</span>
          <span className="ml-auto font-mono text-[10px] text-[#c6c9ab]">{step > 0 ? `${step} / ${TOTAL_STEPS - 1}` : ''}</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-[#fbcb1a] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Contenido del paso */}
      <div className="flex-1 w-full max-w-lg mx-auto px-6 py-8" key={step}>
        {step === 0 && (
          <StepShell title={`¡Hola, ${firstName}! 👋`} subtitle="Bienvenido a tu nuevo entrenamiento. Antes de empezar, necesitamos conocerte: son 2 minutos y tu coach lo usará para montar tu plan a medida.">
            {/* VIDEO_SLOT: aquí irá el vídeo corto de bienvenida de Dani.
                <video src="..." controls poster="..." className="rounded-2xl w-full" /> */}
            <div className="bg-[#181816] border border-white/10 rounded-2xl p-5 space-y-3">
              {[
                { icon: 'person', text: 'Cuéntanos sobre ti y tu objetivo' },
                { icon: 'fitness_center', text: 'Tu experiencia y tu material' },
                { icon: 'restaurant', text: 'Cómo comes y qué evitas' },
              ].map(i => (
                <p key={i.icon} className="flex items-center gap-3 text-sm text-[#e5e2e1]">
                  <span className="material-symbols-outlined text-[#fbcb1a]">{i.icon}</span>
                  {i.text}
                </p>
              ))}
            </div>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell title="Sobre ti" subtitle="Lo básico para calcular tus necesidades.">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Chip selected={sex === 'male'} onClick={() => setSex('male')}>Hombre</Chip>
                <Chip selected={sex === 'female'} onClick={() => setSex('female')}>Mujer</Chip>
              </div>
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Fecha de nacimiento</label>
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Peso (kg)</label>
                  <input type="number" min={30} max={250} step={0.1} value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="75" className={inputCls} />
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Altura (cm)</label>
                  <input type="number" min={100} max={250} value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="175" className={inputCls} />
                </div>
              </div>
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Tu objetivo" subtitle="¿Qué quieres conseguir? Esto marca todo el plan.">
            <div className="space-y-2.5">
              {GOALS.map(g => (
                <Chip key={g.id} big selected={goalBody === g.id} onClick={() => setGoalBody(g.id)}>
                  <span className="flex items-center gap-3">
                    <span className={`material-symbols-outlined text-2xl ${goalBody === g.id ? 'text-[#fbcb1a]' : 'text-[#c6c9ab]'}`}>{g.icon}</span>
                    <span>
                      <span className="block font-bold text-white">{g.label}</span>
                      <span className="block text-xs text-[#c6c9ab]">{g.desc}</span>
                    </span>
                  </span>
                </Chip>
              ))}
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-2">¿Y a nivel de rendimiento?</p>
              <div className="flex flex-wrap gap-2">
                {CAPACITIES.map(c => (
                  <Chip key={c.id} selected={goalCapacity === c.id} onClick={() => setGoalCapacity(c.id)}>{c.label}</Chip>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Cuéntalo con tus palabras (opcional)</label>
              <textarea value={goalFreeText} onChange={e => setGoalFreeText(e.target.value)} rows={2}
                placeholder="Ej: quiero verme bien en verano y sentirme con energía" className={`${inputCls} resize-none`} />
            </div>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="Tu entrenamiento" subtitle="Para ajustar el plan a tu nivel y tu material.">
            <div className="space-y-2.5">
              {EXPERIENCE.map(x => (
                <Chip key={x.id} big selected={experienceLevel === x.id} onClick={() => setExperienceLevel(x.id)}>
                  <span className="block font-bold text-white">{x.label}</span>
                  <span className="block text-xs text-[#c6c9ab]">{x.desc}</span>
                </Chip>
              ))}
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-2">¿Con qué material cuentas? (elige todo lo que tengas)</p>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map(eq => (
                  <Chip key={eq} selected={equipment.includes(eq)}
                    onClick={() => setEquipment(prev => prev.includes(eq) ? prev.filter(e => e !== eq) : [...prev, eq])}>
                    {eq}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-2">¿Lesiones o molestias actuales?</p>
              <div className="space-y-2">
                <Chip selected={noInjuries} onClick={() => { setNoInjuries(v => !v); if (!noInjuries) setInjuries(''); }}>
                  No tengo lesiones
                </Chip>
                {!noInjuries && (
                  <textarea value={injuries} onChange={e => setInjuries(e.target.value)} rows={2}
                    placeholder="Ej: molestia en hombro derecho al hacer press" className={`${inputCls} resize-none`} />
                )}
              </div>
            </div>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="Tu alimentación" subtitle="Tu coach montará la dieta respetando esto.">
            <div className="grid grid-cols-2 gap-2">
              {DIET_TYPES.map(d => (
                <Chip key={d.id} selected={dietType === d.id} onClick={() => setDietType(d.id)}>
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">{d.icon}</span>
                    {d.label}
                  </span>
                </Chip>
              ))}
            </div>
            <div>
              <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-2">¿Cuántas comidas al día prefieres?</p>
              <div className="flex gap-2">
                {[3, 4, 5].map(n => (
                  <Chip key={n} selected={mealCount === n} onClick={() => setMealCount(n)}>{n} comidas</Chip>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Alergias o intolerancias (separa por comas, o deja vacío)</label>
              <input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="Ej: lactosa, frutos secos" className={inputCls} />
            </div>
            <div>
              <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Alimentos que NO quieres ver en tu dieta</label>
              <input value={dislikedFoods} onChange={e => setDislikedFoods(e.target.value)} placeholder="Ej: pescado azul, coliflor" className={inputCls} />
            </div>
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="Tu día a día" subtitle="Fuera del entrenamiento, ¿cómo te mueves?">
            <div className="space-y-2.5">
              {ACTIVITY.map(a => (
                <Chip key={a.id} big selected={activityLevel === a.id} onClick={() => setActivityLevel(a.id)}>
                  <span className="block font-bold text-white">{a.label}</span>
                  <span className="block text-xs text-[#c6c9ab]">{a.desc}</span>
                </Chip>
              ))}
            </div>
          </StepShell>
        )}

        {step === 6 && (
          <StepShell title="¡Todo listo! 💪" subtitle="Tu coach ya tiene lo que necesita para montar tu plan. Ahora te enseñamos la app en 1 minuto.">
            <div className="bg-[#181816] border border-[#fbcb1a]/25 rounded-2xl p-5 space-y-2.5">
              {[
                goalBody && { icon: 'target', text: GOALS.find(g => g.id === goalBody)?.label },
                experienceLevel && { icon: 'fitness_center', text: EXPERIENCE.find(x => x.id === experienceLevel)?.label },
                dietType && { icon: 'restaurant', text: `${DIET_TYPES.find(d => d.id === dietType)?.label} · ${mealCount} comidas` },
                weightKg && { icon: 'monitor_weight', text: `${weightKg} kg · ${heightCm} cm` },
              ].filter(Boolean).map((i, idx) => {
                const item = i as { icon: string; text: string };
                return (
                  <p key={idx} className="flex items-center gap-3 text-sm text-[#e5e2e1]">
                    <span className="material-symbols-outlined text-[#fbcb1a] text-base">{item.icon}</span>
                    {item.text}
                  </p>
                );
              })}
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/35 text-red-200 p-3 rounded-xl text-sm text-center">{error}</div>
            )}
          </StepShell>
        )}
      </div>

      {/* Navegación */}
      <div className="w-full max-w-lg mx-auto px-6 pb-10 flex gap-3">
        {step > 0 && step < TOTAL_STEPS - 1 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="px-5 py-3.5 rounded-xl bg-white/5 border border-white/10 text-[#c6c9ab] font-sans text-sm font-bold uppercase tracking-wide"
          >
            Atrás
          </button>
        )}
        {step < TOTAL_STEPS - 1 ? (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!stepValid()}
            className="flex-1 py-3.5 rounded-xl bg-[#fbcb1a] text-black font-sans text-sm font-black uppercase tracking-widest disabled:opacity-30 transition-all active:scale-[.98]"
          >
            {step === 0 ? 'Empezar' : 'Siguiente'}
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={saving}
            className="flex-1 py-3.5 rounded-xl bg-[#fbcb1a] text-black font-sans text-sm font-black uppercase tracking-widest disabled:opacity-50 transition-all active:scale-[.98]"
          >
            {saving ? 'Guardando…' : 'Entrar en EN FORMA'}
          </button>
        )}
      </div>
    </div>
  );
}

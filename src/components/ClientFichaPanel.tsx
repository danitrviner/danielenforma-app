import React, { useState } from 'react';
import { UserProfile, OnboardingData, OnboardingTemplateQuestion } from '../types';
import OnboardingForm from './OnboardingForm';
import EquipoClienteCard from '../features/gimnasio/EquipoClienteCard';
import { Collapsible } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   ClientFichaPanel (reorganización del Hub — pestaña "Ficha", zona "Atleta")

   Todo lo IDENTITARIO y ESTÁTICO del cliente: quién es, qué quiere, con qué
   equipamiento cuenta y la duración de su plan. Antes vivía repartido entre
   la cabecera fija del Hub (formulario de plan + EquipoClienteCard, siempre
   visibles aunque casi nunca cambien) y el primer tercio de Revisiones (la
   ficha de iniciación, antes un solo bloque plegable con TODO dentro).

   Cada sección temática es ahora un <Collapsible/> independiente en vez de un
   único interruptor "todo o nada" — el coach abre solo lo que necesita
   consultar. Composición y Salud empiezan abiertas por ser las que más se
   consultan de un vistazo; el resto arranca cerrado.

   Preferencias alimentarias y notas personales de ejercicio NO están aquí:
   preferencias vive en Dietas (ClientDietsPanel, junto al resto de config.
   nutricional) y las notas por ejercicio se retiraron del producto.
   ═══════════════════════════════════════════════════════════════════════════ */

const DIET_LABELS: Record<string, string> = {
  omnivoro: 'Omnívoro', vegetariano: 'Vegetariano', vegano: 'Vegano', otro: 'Otro',
};
const EXP_LABELS: Record<string, string> = {
  principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado',
};
const SECTION_LABELS: Record<string, string> = {
  entrenamiento: 'Entrenamiento', nutricion: 'Nutrición', descanso: 'Descanso / Recuperación',
};
const ACTIVITY_LABELS: Record<string, string> = {
  sedentario: 'Sedentario (×1.2)', poco_activo: 'Poco activo (×1.375)',
  activo: 'Activo (×1.55)', muy_activo: 'Muy activo (×1.725)',
};
const GOAL_BODY_LABELS: Record<string, string> = {
  aumentar_musculo: 'Aumentar músculo (+10%)',
  reducir_grasa:    'Reducir grasa (−20%)',
  mantener:         'Mantener (0%)',
};
const GOAL_CAP_LABELS: Record<string, string> = {
  fuerza: 'Fuerza', fuerza_resistencia: 'Fuerza-resistencia', salud: 'Salud',
};
const PROGRESS_FREQ_LABELS: Record<string, string> = {
  cada_semana: 'Cada semana', cada_varias_semanas: 'Cada varias semanas', con_dificultad: 'Con dificultad',
};
const TECHNIQUE_LABELS: Record<string, string> = {
  mala: 'Mala', regular: 'Regular', buena: 'Buena', muy_buena: 'Muy buena',
};

function displayAge(birthDate: string): number {
  const dob = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

function fmtExch(g: number, ef: number): string {
  const r = Math.round(g / ef / 0.25) * 0.25;
  return r % 1 === 0 ? r.toFixed(0) : r.toFixed(2);
}

interface Props {
  athlete: UserProfile;
  onboardingData: OnboardingData | null;
  setOnboardingData: React.Dispatch<React.SetStateAction<OnboardingData | null>>;
  onboardingTemplate: OnboardingTemplateQuestion[];
  // Duración del plan — el estado (y el guard de "cambios sin guardar" al
  // cambiar de pestaña) sigue viviendo en ClientHub porque protege la
  // navegación de TODAS las zonas, no solo esta pestaña. Aquí solo se pinta
  // el formulario.
  planStart: string;
  onPlanStartChange: (v: string) => void;
  planMonths: 3 | 6 | 12;
  onPlanMonthsChange: (v: 3 | 6 | 12) => void;
  savingPlan: boolean;
  onSavePlan: () => void;
}

export default function ClientFichaPanel({
  athlete, onboardingData, setOnboardingData, onboardingTemplate,
  planStart, onPlanStartChange, planMonths, onPlanMonthsChange, savingPlan, onSavePlan,
}: Props) {
  const [editingOnboarding, setEditingOnboarding] = useState(false);

  return (
    <div className="space-y-6">
      {/* ── Plan y objetivos ─────────────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-accent text-title-s">event_note</span>
          Plan
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-caption text-ink-2 uppercase">Duración:</span>
          <input
            type="date"
            value={planStart}
            onChange={e => onPlanStartChange(e.target.value)}
            className="bg-raised border border-hairline rounded-control px-2 py-2 text-title-s font-mono text-white focus:outline-none focus:ring-1 focus:ring-accent min-h-[36px]"
          />
          <select
            value={planMonths}
            onChange={e => onPlanMonthsChange(Number(e.target.value) as 3 | 6 | 12)}
            className="bg-raised border border-hairline rounded-control px-2 py-2 text-title-s font-mono text-white focus:outline-none focus:ring-1 focus:ring-accent min-h-[36px]"
          >
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
          <button
            onClick={onSavePlan}
            disabled={savingPlan}
            className="px-3 py-2 min-h-[36px] bg-accent text-black font-sans text-caption font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
          >
            {savingPlan ? '...' : 'Guardar'}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2 border-t border-hairline font-mono text-label">
          <span className="text-ink-2">Peso inicial: <span className="text-white font-bold">{athlete.initialWeight || '—'} kg</span></span>
          <span className="text-ink-2">Meta: <span className="text-success font-bold">{athlete.targetWeight || '—'} kg</span></span>
        </div>
      </div>

      {/* ── Ficha de iniciación ─────────────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface p-5">
        {editingOnboarding ? (
          <OnboardingForm
            athleteEmail={athlete.email}
            initialData={onboardingData}
            template={onboardingTemplate}
            onSaved={data => { setOnboardingData(data); setEditingOnboarding(false); }}
            onCancel={() => setEditingOnboarding(false)}
          />
        ) : onboardingData ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3 pb-3">
              <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-accent text-title-s flex-shrink-0">person_check</span>
                <span className="truncate">Ficha de iniciación</span>
                <span className="font-mono text-caption text-ink-3 font-normal normal-case truncate">
                  {[
                    onboardingData.sex && (onboardingData.sex === 'male' ? 'Hombre' : 'Mujer'),
                    onboardingData.birthDate && `${displayAge(onboardingData.birthDate)} años`,
                    onboardingData.goalBody && GOAL_BODY_LABELS[onboardingData.goalBody],
                  ].filter(Boolean).join(' · ')}
                </span>
              </h3>
              <button
                onClick={() => setEditingOnboarding(true)}
                className="flex-shrink-0 flex items-center gap-1 font-mono text-caption text-ink-2 hover:text-accent transition-colors border border-hairline px-3 py-2 rounded-control"
              >
                <span className="material-symbols-outlined text-body-s">edit</span>Editar
              </button>
            </div>

            {(onboardingData.sex || onboardingData.weightKg || onboardingData.heightCm) && (
              <Collapsible
                className="border-t border-hairline"
                defaultOpen
                trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Composición corporal</p>}
              >
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono pb-3">
                  {onboardingData.sex && (
                    <span className="text-ink-2">Sexo: <span className="text-white font-bold">{onboardingData.sex === 'male' ? 'Hombre' : 'Mujer'}</span></span>
                  )}
                  {onboardingData.birthDate && (
                    <span className="text-ink-2">Edad: <span className="text-white font-bold">{displayAge(onboardingData.birthDate)} años</span></span>
                  )}
                  {onboardingData.weightKg && (
                    <span className="text-ink-2">Peso: <span className="text-white font-bold">{onboardingData.weightKg} kg</span></span>
                  )}
                  {onboardingData.heightCm && (
                    <span className="text-ink-2">Altura: <span className="text-white font-bold">{onboardingData.heightCm} cm</span></span>
                  )}
                  {onboardingData.bodyFatPct && (
                    <span className="text-ink-2">%Grasa: <span className="text-white font-bold">{onboardingData.bodyFatPct}%</span></span>
                  )}
                  {onboardingData.musclePct && (
                    <span className="text-ink-2">%Músculo: <span className="text-white font-bold">{onboardingData.musclePct}%</span></span>
                  )}
                </div>
              </Collapsible>
            )}

            {(onboardingData.activityLevel || onboardingData.goalBody || onboardingData.goalCapacity) && (
              <Collapsible
                className="border-t border-hairline"
                trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Actividad y objetivo</p>}
              >
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-sans pb-3">
                  {onboardingData.activityLevel && (
                    <span className="text-ink-2">Actividad: <span className="text-white font-bold">{ACTIVITY_LABELS[onboardingData.activityLevel]}</span></span>
                  )}
                  {onboardingData.goalBody && (
                    <span className="text-ink-2">Objetivo: <span className="text-accent font-bold">{GOAL_BODY_LABELS[onboardingData.goalBody]}</span></span>
                  )}
                  {onboardingData.goalCapacity && (
                    <span className="text-ink-2">Capacidad: <span className="text-white font-bold">{GOAL_CAP_LABELS[onboardingData.goalCapacity]}</span></span>
                  )}
                </div>
              </Collapsible>
            )}

            <Collapsible
              className="border-t border-hairline"
              trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Nutrición</p>}
            >
              <div className="space-y-2 pb-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-sans">
                  <span className="text-ink-2">Dieta: <span className="text-white font-bold">{DIET_LABELS[onboardingData.dietType]}</span></span>
                  <span className="text-ink-2">Calorías: <span className="text-accent font-bold">{onboardingData.targetCalories} kcal/día</span></span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    { label: 'HC',    g: onboardingData.macroGrams.hc,    pct: onboardingData.macroSplit.hc,    ef: 25, color: 'var(--color-warning)' },
                    { label: 'PROT',  g: onboardingData.macroGrams.prot,  pct: onboardingData.macroSplit.prot,  ef: 25, color: 'var(--color-data)' },
                    { label: 'GRASA', g: onboardingData.macroGrams.grasa, pct: onboardingData.macroSplit.grasa, ef: 11, color: 'var(--color-danger)' },
                  ]).map(m => (
                    <div key={m.label} className="bg-raised border border-hairline rounded-surface px-3 py-2 text-center">
                      <p className="font-sans text-caption uppercase" style={{ color: m.color }}>{m.label}</p>
                      <p className="font-mono font-bold text-white text-body-s">{m.g}g</p>
                      <p className="font-mono text-caption text-ink-3">{m.pct}% · {fmtExch(m.g, m.ef)} int</p>
                    </div>
                  ))}
                </div>
                {onboardingData.allergies.length > 0 && (
                  <p className="font-mono text-caption text-amber-400 pt-1">
                    <span className="material-symbols-outlined text-label align-middle mr-1">warning</span>
                    Alergias: {onboardingData.allergies.join(', ')}
                  </p>
                )}
                {(onboardingData.appetitePeakTime || onboardingData.hadOverweightHistory || !onboardingData.foodRelationshipGood ||
                  onboardingData.eatsTooFast || (onboardingData.supplements?.length ?? 0) > 0 || onboardingData.weightTendency ||
                  onboardingData.neckCm || onboardingData.waistCm || onboardingData.hipCm) && (
                  <div className="space-y-1 pt-2 border-t border-hairline">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                      {onboardingData.appetitePeakTime && (
                        <span className="text-ink-2">Más apetito: <span className="text-white font-bold">{onboardingData.appetitePeakTime}</span></span>
                      )}
                      {onboardingData.hadOverweightHistory && <span className="text-amber-300">Historial de sobrepeso</span>}
                      {!onboardingData.foodRelationshipGood && (
                        <span className="text-amber-300">Relación con la comida: mala{onboardingData.foodRelationshipReason ? ` (${onboardingData.foodRelationshipReason})` : ''}</span>
                      )}
                      {onboardingData.eatsTooFast && <span className="text-ink-2">Come deprisa</span>}
                      {onboardingData.neckCm && <span className="text-ink-2">Cuello: <span className="text-white font-bold">{onboardingData.neckCm}cm</span></span>}
                      {onboardingData.waistCm && <span className="text-ink-2">Cintura: <span className="text-white font-bold">{onboardingData.waistCm}cm</span></span>}
                      {onboardingData.hipCm && <span className="text-ink-2">Cadera: <span className="text-white font-bold">{onboardingData.hipCm}cm</span></span>}
                    </div>
                    {onboardingData.weightTendency && (
                      <p className="font-sans text-caption text-ink-2"><span className="text-ink-3 mr-1">Tendencia de peso:</span>{onboardingData.weightTendency}</p>
                    )}
                    {(onboardingData.supplements?.length ?? 0) > 0 && (
                      <div className="pt-1">
                        <p className="font-mono text-caption text-ink-3 mb-1">Suplementación</p>
                        {onboardingData.supplements!.map((s, i) => (
                          <p key={i} className="font-mono text-caption text-ink-2">{s.name} — {s.dose} — {s.frequency}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Collapsible>

            {onboardingData.meals && onboardingData.meals.length > 0 && (
              <Collapsible
                className="border-t border-hairline"
                trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Comidas ({onboardingData.mealCount ?? onboardingData.meals.length} ingestas)</p>}
              >
                <div className="flex flex-wrap gap-2 pb-3">
                  {onboardingData.meals.map(m => (
                    <div key={m.intakeType} className="flex items-center gap-2 bg-raised border border-hairline rounded-surface px-3 py-2">
                      <span className="font-sans text-caption text-ink-2">{m.name}</span>
                      {m.needsTupper && (
                        <span className="font-mono text-caption bg-data/10 border border-data/30 text-data rounded-control px-2 ">tupper</span>
                      )}
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}

            {(onboardingData.cookingLevel || onboardingData.cookingMaxTime) && (
              <Collapsible
                className="border-t border-hairline"
                trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Cocina</p>}
              >
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono pb-3">
                  {onboardingData.cookingLevel && (
                    <span className="text-ink-2">Nivel: <span className="text-white font-bold">{onboardingData.cookingLevel}/5</span></span>
                  )}
                  {onboardingData.cookingMaxTime && (
                    <span className="text-ink-2">Tiempo máx: <span className="text-white font-bold">{onboardingData.cookingMaxTime} min</span></span>
                  )}
                  {onboardingData.breakfastVariety && (
                    <span className="text-ink-2">Variedad desayunos: <span className="text-white font-bold">{onboardingData.breakfastVariety}/5</span></span>
                  )}
                  {onboardingData.lunchVariety && (
                    <span className="text-ink-2">Variedad almuerzos: <span className="text-white font-bold">{onboardingData.lunchVariety}/5</span></span>
                  )}
                </div>
              </Collapsible>
            )}

            <Collapsible
              className="border-t border-hairline"
              trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Entrenamiento</p>}
            >
              <div className="space-y-2 pb-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-sans">
                  <span className="text-ink-2">Nivel: <span className="text-white font-bold">{EXP_LABELS[onboardingData.experienceLevel]}</span></span>
                </div>
                {onboardingData.equipment.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {onboardingData.equipment.map(e => (
                      <span key={e} className="bg-raised border border-hairline text-ink-2 px-2 rounded-full text-caption font-mono">{e}</span>
                    ))}
                  </div>
                )}
                {onboardingData.favoriteExercises.length > 0 && (
                  <p className="font-mono text-caption text-ink-2">
                    <span className="text-ink-3 mr-1">Favoritos:</span>{onboardingData.favoriteExercises.join(', ')}
                  </p>
                )}
                {onboardingData.hatedExercises.length > 0 && (
                  <p className="font-mono text-caption text-ink-2">
                    <span className="text-ink-3 mr-1">Evita:</span>{onboardingData.hatedExercises.join(', ')}
                  </p>
                )}
                {onboardingData.injuries && (
                  <p className="font-mono text-caption text-amber-300">
                    <span className="material-symbols-outlined text-label align-middle mr-1">personal_injury</span>
                    {onboardingData.injuries}
                  </p>
                )}
                {(onboardingData.oneRepMaxTotal || onboardingData.progressFrequency || onboardingData.techniqueLevel ||
                  onboardingData.currentMotivation || onboardingData.muscleGroupsToImprove || onboardingData.restDayActive ||
                  onboardingData.sittingHoursPerDay || onboardingData.stressReason) && (
                  <div className="space-y-1 pt-2 border-t border-hairline">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                      {onboardingData.oneRepMaxTotal && (
                        <span className="text-ink-2">Total 1RM: <span className="text-white font-bold">{onboardingData.oneRepMaxTotal}kg</span></span>
                      )}
                      {onboardingData.progressFrequency && (
                        <span className="text-ink-2">Progresa: <span className="text-white font-bold">{PROGRESS_FREQ_LABELS[onboardingData.progressFrequency]}</span></span>
                      )}
                      {onboardingData.techniqueLevel && (
                        <span className="text-ink-2">Técnica: <span className="text-white font-bold">{TECHNIQUE_LABELS[onboardingData.techniqueLevel]}</span></span>
                      )}
                      {onboardingData.currentMotivation && (
                        <span className="text-ink-2">Motivación: <span className="text-white font-bold">{onboardingData.currentMotivation}/10</span></span>
                      )}
                      {onboardingData.sittingHoursPerDay && (
                        <span className="text-ink-2">Horas sentado/día: <span className="text-white font-bold">{onboardingData.sittingHoursPerDay}h</span></span>
                      )}
                      {onboardingData.restDayActive && <span className="text-ink-2">Activo en descanso{onboardingData.restDayActiveDetail ? ` (${onboardingData.restDayActiveDetail})` : ''}</span>}
                    </div>
                    {onboardingData.muscleGroupsToImprove && (
                      <p className="font-sans text-caption text-ink-2"><span className="text-ink-3 mr-1">A mejorar:</span>{onboardingData.muscleGroupsToImprove}</p>
                    )}
                    {onboardingData.stressReason && (
                      <p className="font-sans text-caption text-ink-2"><span className="text-ink-3 mr-1">Motivo de estrés:</span>{onboardingData.stressReason}</p>
                    )}
                  </div>
                )}
              </div>
            </Collapsible>

            {(onboardingData.occupation || onboardingData.referralSource || onboardingData.goalFreeText) && (
              <Collapsible
                className="border-t border-hairline"
                trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Datos personales</p>}
              >
                <div className="space-y-1 pb-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                    {onboardingData.occupation && (
                      <span className="text-ink-2">Ocupación: <span className="text-white font-bold">{onboardingData.occupation}</span></span>
                    )}
                    {onboardingData.referralSource && (
                      <span className="text-ink-2">Nos conoció por: <span className="text-white font-bold">{onboardingData.referralSource}</span></span>
                    )}
                  </div>
                  {onboardingData.goalFreeText && (
                    <p className="font-sans text-caption text-ink-2 italic">"{onboardingData.goalFreeText}"</p>
                  )}
                </div>
              </Collapsible>
            )}

            {(onboardingData.hasCurrentInjury || onboardingData.hadPastInjuries || onboardingData.takesMedication ||
              onboardingData.recentSurgery || onboardingData.smokesAlcoholSubstances || onboardingData.sunExposureWeekly) && (
              <Collapsible
                className="border-t border-hairline"
                defaultOpen
                trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Salud</p>}
              >
                <div className="space-y-1 pb-3">
                  {onboardingData.hasCurrentInjury && (
                    <p className="font-mono text-caption text-amber-300">
                      <span className="material-symbols-outlined text-label align-middle mr-1">personal_injury</span>
                      Lesión actual en {onboardingData.currentInjuryLocation || '—'} (intensidad {onboardingData.currentInjuryIntensity ?? '—'}/10)
                      {onboardingData.currentInjuryMovements && ` — duele al: ${onboardingData.currentInjuryMovements}`}
                    </p>
                  )}
                  {onboardingData.hadPastInjuries && (
                    <p className="font-sans text-caption text-ink-2">
                      <span className="text-ink-3 mr-1">Lesiones anteriores:</span>{onboardingData.pastInjuriesDetail || '—'}
                    </p>
                  )}
                  {onboardingData.takesMedication && (
                    <p className="font-mono text-caption text-ink-2">
                      <span className="text-ink-3 mr-1">Medicación:</span>{onboardingData.medicationDetail || '—'}
                    </p>
                  )}
                  {onboardingData.recentSurgery && (
                    <p className="font-sans text-caption text-ink-2">
                      <span className="text-ink-3 mr-1">Cirugía reciente:</span>{onboardingData.recentSurgeryDetail || '—'}
                    </p>
                  )}
                  {onboardingData.smokesAlcoholSubstances && (
                    <p className="font-sans text-caption text-ink-2">
                      <span className="text-ink-3 mr-1">Tabaco/alcohol/otras sustancias:</span>{onboardingData.smokesAlcoholSubstances}
                    </p>
                  )}
                  {onboardingData.sunExposureWeekly && (
                    <p className="font-sans text-caption text-ink-2">
                      <span className="text-ink-3 mr-1">Exposición al sol:</span>{onboardingData.sunExposureWeekly}
                    </p>
                  )}
                </div>
              </Collapsible>
            )}

            {((onboardingData.sleepDeficitCauses?.length ?? 0) > 0 || onboardingData.sleepRoutineOrScreen || onboardingData.sleepMedication) && (
              <Collapsible
                className="border-t border-hairline"
                trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Descanso</p>}
              >
                <div className="space-y-1 pb-3">
                  {(onboardingData.sleepDeficitCauses?.length ?? 0) > 0 && (
                    <p className="font-sans text-caption text-ink-2"><span className="text-ink-3 mr-1">Causas del déficit:</span>{onboardingData.sleepDeficitCauses!.join(', ')}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                    {onboardingData.sleepRoutineOrScreen && (
                      <span className="text-ink-2">Antes de dormir: <span className="text-white font-bold">{onboardingData.sleepRoutineOrScreen === 'rutina' ? 'Rutina' : 'Pantalla'}</span></span>
                    )}
                    {onboardingData.sleepMedication && (
                      <span className="text-amber-300">Medicación para dormir{onboardingData.sleepMedicationDetail ? `: ${onboardingData.sleepMedicationDetail}` : ''}</span>
                    )}
                  </div>
                </div>
              </Collapsible>
            )}

            {onboardingTemplate.length > 0 && onboardingData.extraAnswers && Object.keys(onboardingData.extraAnswers).length > 0 && (
              <Collapsible
                className="border-t border-hairline"
                trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Preguntas adicionales</p>}
              >
                <div className="space-y-3 pb-3">
                  {(['entrenamiento', 'nutricion', 'descanso'] as const).map(section => {
                    const sqs = onboardingTemplate.filter(q => q.section === section);
                    const answered = sqs.filter(q => {
                      const v = onboardingData.extraAnswers?.[q.id];
                      return v !== undefined && v !== '' && v !== 0;
                    });
                    if (answered.length === 0) return null;
                    return (
                      <div key={section} className="space-y-1">
                        <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">{SECTION_LABELS[section]}</p>
                        {answered.map(q => {
                          const val = onboardingData.extraAnswers![q.id];
                          const display = q.type === 'scale'
                            ? `${val} / ${q.scaleMax ?? 10}`
                            : `${val}${q.unit ? ` ${q.unit}` : ''}`;
                          return (
                            <p key={q.id} className="font-sans text-caption text-ink-2">
                              <span className="text-ink-3 mr-1">{q.label}:</span>
                              <span className="text-white font-bold">{display}</span>
                            </p>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </Collapsible>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-sans font-bold text-body-s text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-ink-3 text-title-s">person_check</span>
                Ficha de iniciación
              </p>
              <p className="font-sans text-label text-ink-2 mt-1">El atleta no ha completado su ficha todavía.</p>
            </div>
            <button
              onClick={() => setEditingOnboarding(true)}
              className="shrink-0 flex items-center gap-2 px-4 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-body-s">add</span>Crear ficha
            </button>
          </div>
        )}
      </div>

      {/* ── Equipamiento del gimnasio ────────────────────────────────── */}
      <EquipoClienteCard athleteEmail={athlete.email} />
    </div>
  );
}

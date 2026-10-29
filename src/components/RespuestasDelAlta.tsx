import React from 'react';
import type { OnboardingData } from '../types';
import { Collapsible } from './ui';
import { dishTypeLabel } from '../utils/dishTypes';
import { athleteConditions, restrictionLabel } from '../utils/dietaryRestrictions';
import {
  DIET_LABELS, EXP_LABELS, ACTIVITY_LABELS, GOAL_BODY_LABELS, GOAL_CAP_LABELS,
  PROGRESS_FREQ_LABELS, TECHNIQUE_LABELS,
} from '../utils/etiquetasDelAlta';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que dijo en el alta — a mano mientras se planifica

   Las respuestas del alta solo se leían en la ficha del cliente: para montar un
   mesociclo o una dieta había que salir, abrir la ficha y volver. Aquí van las
   que importan a cada herramienta, en desplegables cerrados, sin tocar nada de
   la planificación: solo información (Dani, 29-10-2026).
     · `tema="entreno"` → creador de mesociclos.
     · `tema="nutricion"` → dietas del atleta.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  onboarding: OnboardingData | null | undefined;
  tema: 'entreno' | 'nutricion';
  className?: string;
}

/** «Etiqueta: valor», en la misma tipografía que la ficha. */
function Dato({ label, children, aviso = false }: { label: string; children: React.ReactNode; aviso?: boolean }) {
  return (
    <span className="text-ink-2">
      {label}: <span className={`font-bold ${aviso ? 'text-warning' : 'text-ink'}`}>{children}</span>
    </span>
  );
}

/** Línea de texto libre: «Etiqueta» en gris y la respuesta detrás. */
function Linea({ label, children, aviso = false }: { label: string; children: React.ReactNode; aviso?: boolean }) {
  return (
    <p className={`font-sans text-caption ${aviso ? 'text-warning' : 'text-ink-2'}`}>
      <span className="text-ink-3 mr-1">{label}:</span>{children}
    </p>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Collapsible
      className="border-t border-hairline"
      trigger={<p className="font-mono text-caption text-ink-2 uppercase tracking-wide">{titulo}</p>}
    >
      <div className="space-y-2 pb-3">{children}</div>
    </Collapsible>
  );
}

function Fila({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">{children}</div>;
}

/** Quita lo vacío para decidir si una sección se pinta. */
const hay = (...vs: unknown[]) => vs.some(v => (Array.isArray(v) ? v.length > 0 : v != null && v !== '' && v !== false && v !== 0));

function Objetivo({ ob }: { ob: OnboardingData }) {
  if (!hay(ob.goalBody, ob.goalCapacity, ob.goalFreeText, ob.goalTimelineMotivation)) return null;
  return (
    <Seccion titulo="Objetivo">
      <Fila>
        {ob.goalBody && <Dato label="Objetivo">{GOAL_BODY_LABELS[ob.goalBody] ?? ob.goalBody}</Dato>}
        {ob.goalCapacity && <Dato label="Capacidad">{GOAL_CAP_LABELS[ob.goalCapacity] ?? ob.goalCapacity}</Dato>}
      </Fila>
      {ob.goalFreeText && <Linea label="Cómo se ve al conseguirlo"><span className="italic">"{ob.goalFreeText}"</span></Linea>}
      {ob.goalTimelineMotivation && <Linea label="Plazo y motivo"><span className="italic">"{ob.goalTimelineMotivation}"</span></Linea>}
    </Seccion>
  );
}

function Entreno({ ob }: { ob: OnboardingData }) {
  const lesion = ob.hasCurrentInjury
    ? `${ob.currentInjuryLocation || '—'} (dolor ${ob.currentInjuryIntensity ?? '—'}/10)${ob.currentInjuryMovements ? ` — duele al: ${ob.currentInjuryMovements}` : ''}`
    : null;
  return (
    <>
      {hay(ob.availableDaysPerWeek, ob.sessionMaxMinutes, ob.experienceLevel, ob.techniqueLevel, ob.progressFrequency, ob.oneRepMaxTotal, ob.currentMotivation) && (
        <Seccion titulo="Disponibilidad y nivel">
          <Fila>
            {ob.availableDaysPerWeek ? <Dato label="Puede entrenar">{ob.availableDaysPerWeek} días/sem</Dato> : null}
            {ob.sessionMaxMinutes ? <Dato label="Por sesión">{ob.sessionMaxMinutes} min</Dato> : null}
            {ob.experienceLevel && <Dato label="Nivel">{EXP_LABELS[ob.experienceLevel] ?? ob.experienceLevel}</Dato>}
            {ob.techniqueLevel && <Dato label="Técnica">{TECHNIQUE_LABELS[ob.techniqueLevel] ?? ob.techniqueLevel}</Dato>}
            {ob.progressFrequency && <Dato label="Progresa">{PROGRESS_FREQ_LABELS[ob.progressFrequency] ?? ob.progressFrequency}</Dato>}
            {ob.oneRepMaxTotal ? <Dato label="Total 1RM">{ob.oneRepMaxTotal} kg</Dato> : null}
            {ob.currentMotivation ? <Dato label="Motivación">{ob.currentMotivation}/10</Dato> : null}
          </Fila>
        </Seccion>
      )}

      {hay(ob.muscleGroupsToImprove, ob.favoriteExercises, ob.hatedExercises, ob.equipment) && (
        <Seccion titulo="Músculos y ejercicios">
          {ob.muscleGroupsToImprove && <Linea label="Quiere mejorar"><span className="text-ink font-bold">{ob.muscleGroupsToImprove}</span></Linea>}
          {(ob.favoriteExercises?.length ?? 0) > 0 && <Linea label="Favoritos">{ob.favoriteExercises.join(', ')}</Linea>}
          {(ob.hatedExercises?.length ?? 0) > 0 && <Linea label="No quiere hacer">{ob.hatedExercises.join(', ')}</Linea>}
          {(ob.equipment?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {ob.equipment.map(e => (
                <span key={e} className="bg-raised border border-hairline text-ink-2 px-2 rounded-full text-caption font-mono">{e}</span>
              ))}
            </div>
          )}
        </Seccion>
      )}

      {hay(lesion, ob.injuries, ob.hadPastInjuries, ob.recentSurgery, ob.takesMedication) && (
        <Seccion titulo="Lesiones y salud">
          {lesion && <Linea label="Lesión actual" aviso>{lesion}</Linea>}
          {ob.injuries && <Linea label="Lesiones" aviso>{ob.injuries}</Linea>}
          {ob.hadPastInjuries && <Linea label="Lesiones anteriores">{ob.pastInjuriesDetail || '—'}</Linea>}
          {ob.recentSurgery && <Linea label="Cirugía reciente">{ob.recentSurgeryDetail || '—'}</Linea>}
          {ob.takesMedication && <Linea label="Medicación">{ob.medicationDetail || '—'}</Linea>}
        </Seccion>
      )}

      {hay(ob.activityLevel, ob.sittingHoursPerDay, ob.restDayActive, ob.sleepDeficitCauses, ob.sleepMedication, ob.stressReason) && (
        <Seccion titulo="Día a día y descanso">
          <Fila>
            {ob.activityLevel && <Dato label="Actividad">{ACTIVITY_LABELS[ob.activityLevel] ?? ob.activityLevel}</Dato>}
            {ob.sittingHoursPerDay ? <Dato label="Horas sentado/día">{ob.sittingHoursPerDay} h</Dato> : null}
            {ob.restDayActive && <span className="text-ink-2">Activo en descanso{ob.restDayActiveDetail ? ` (${ob.restDayActiveDetail})` : ''}</span>}
            {ob.sleepMedication && <span className="text-warning">Medicación para dormir{ob.sleepMedicationDetail ? `: ${ob.sleepMedicationDetail}` : ''}</span>}
          </Fila>
          {(ob.sleepDeficitCauses?.length ?? 0) > 0 && <Linea label="Sueño">{ob.sleepDeficitCauses!.join(', ')}</Linea>}
          {ob.stressReason && <Linea label="Motivo de estrés">{ob.stressReason}</Linea>}
        </Seccion>
      )}
    </>
  );
}

function Nutricion({ ob }: { ob: OnboardingData }) {
  const condiciones = athleteConditions(ob);
  return (
    <>
      {hay(ob.dietType, condiciones, ob.allergies, ob.targetCalories) && (
        <Seccion titulo="Dieta y salud">
          <Fila>
            {ob.dietType && (
              <Dato label="Dieta">{DIET_LABELS[ob.dietType] ?? ob.dietType}{ob.dietSince ? ` · desde ${ob.dietSince}` : ''}</Dato>
            )}
            {ob.targetCalories ? <Dato label="Kcal del alta">{ob.targetCalories} kcal/día</Dato> : null}
          </Fila>
          {condiciones.length > 0 && <Linea label="Condiciones" aviso>{condiciones.map(restrictionLabel).join(', ')}</Linea>}
          {(ob.allergies?.length ?? 0) > 0 && <Linea label="Alergias" aviso>{ob.allergies.join(', ')}</Linea>}
        </Seccion>
      )}

      {hay(ob.likedFoods, ob.dislikedFoods, ob.preferredDishTypes, ob.excludedDishTypes) && (
        <Seccion titulo="Gustos">
          {(ob.dislikedFoods?.length ?? 0) > 0 && <Linea label="No quiere" aviso>{ob.dislikedFoods.join(', ')}</Linea>}
          {(ob.likedFoods?.length ?? 0) > 0 && <Linea label="Favoritos">{ob.likedFoods.join(', ')}</Linea>}
          {(ob.preferredDishTypes?.length ?? 0) > 0 && <Linea label="Más platos de">{ob.preferredDishTypes!.map(dishTypeLabel).join(', ')}</Linea>}
          {(ob.excludedDishTypes?.length ?? 0) > 0 && <Linea label="Evitar platos de">{ob.excludedDishTypes!.map(dishTypeLabel).join(', ')}</Linea>}
        </Seccion>
      )}

      {hay(ob.meals, ob.appetitePeakTime, ob.cookingMaxTime, ob.menuVariety, ob.batchCookingPreferred, ob.quiereRapidas) && (
        <Seccion titulo="Comidas y cocina">
          {(ob.meals?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {ob.meals!.map(m => (
                <span key={m.intakeType} className="flex items-center gap-2 bg-raised border border-hairline rounded-surface px-3 py-1">
                  <span className="font-sans text-caption text-ink-2">{m.name}</span>
                  {m.needsTupper && <span className="font-mono text-caption bg-data/10 border border-data/30 text-data rounded-control px-2">tupper</span>}
                </span>
              ))}
            </div>
          )}
          <Fila>
            {ob.appetitePeakTime && <Dato label="Más apetito">{ob.appetitePeakTime}</Dato>}
            {ob.cookingMaxTime ? <Dato label="Tiempo para cocinar">{ob.cookingMaxTime} min</Dato> : null}
            {ob.menuVariety ? <Dato label="Variedad">{ob.menuVariety}/5</Dato> : null}
            {ob.batchCookingPreferred != null && <Dato label="Cocina de golpe">{ob.batchCookingPreferred ? 'Sí' : 'No'}</Dato>}
            {ob.quiereRapidas != null && <Dato label="Recetas rápidas">{ob.quiereRapidas ? 'Sí' : 'No'}</Dato>}
          </Fila>
        </Seccion>
      )}

      {hay(ob.hadOverweightHistory, ob.foodRelationshipGood === false, ob.eatsTooFast, ob.weightTendency, ob.supplements) && (
        <Seccion titulo="Relación con la comida">
          <Fila>
            {ob.hadOverweightHistory && <span className="text-warning">Historial de sobrepeso</span>}
            {ob.foodRelationshipGood === false && <span className="text-warning">Relación con la comida: mala</span>}
            {ob.eatsTooFast && <span className="text-ink-2">Come deprisa</span>}
          </Fila>
          {ob.foodRelationshipGood === false && ob.foodRelationshipReason && <Linea label="Por qué">{ob.foodRelationshipReason}</Linea>}
          {ob.weightTendency && <Linea label="Tendencia de peso">{ob.weightTendency}</Linea>}
          {(ob.supplements?.length ?? 0) > 0 && (
            <Linea label="Suplementos">{ob.supplements!.map(s => [s.name, s.dose, s.frequency].filter(Boolean).join(' ')).join(' · ')}</Linea>
          )}
        </Seccion>
      )}
    </>
  );
}

export default function RespuestasDelAlta({ onboarding, tema, className = '' }: Props) {
  if (!onboarding) return null;
  return (
    <Collapsible
      className={`bg-surface border border-hairline rounded-surface px-4 ${className}`}
      trigger={
        <span className="flex items-center gap-2 py-1 min-w-0">
          <span className="material-symbols-outlined text-accent-ink text-body-s flex-shrink-0">person_check</span>
          <span className="font-sans font-bold text-body-s text-ink truncate">Lo que dijo en el alta</span>
        </span>
      }
    >
      <div className="pb-1">
        <Objetivo ob={onboarding} />
        {tema === 'entreno' ? <Entreno ob={onboarding} /> : <Nutricion ob={onboarding} />}
      </div>
    </Collapsible>
  );
}

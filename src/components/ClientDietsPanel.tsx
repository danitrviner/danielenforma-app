import React, { useState, useMemo } from 'react';
import {
  UserProfile, OnboardingData, Diet, AthleteDietConfig, AthleteNutritionConfig,
  DietMode, WeekDay, WeeklyMenu, BodyweightLog, MenuCompletionLog,
} from '../types';
import { isMenuStale } from '../utils/menuEngine';
import { computeMenuAdherenceRate } from '../utils/nutritionAnalysis';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';
import { isDietPending } from '../utils/exchangeHelpers';
import { getDietsForAthlete, deleteWeeklyMenu, getWeeklyMenusForAthlete } from '../dbService';
import NutritionPeriodizationPanel from './NutritionPeriodizationPanel';
import NutritionPlansScreen from './NutritionPlansScreen';
import WeeklyMenuEditor from './WeeklyMenuEditor';

const DIET_MODE_LABELS: Record<DietMode, string> = {
  OMNIVORO:  'Omnívoro',
  VEGANO:    'Vegano',
  SIN_PESAR: 'Sin pesar',
};

const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK_DAY_SHORT: Record<WeekDay, string> = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const WEEK_DAY_FULL: Record<WeekDay, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};

interface Props {
  athlete: UserProfile;
  coachId: string;
  onboardingData: OnboardingData | null;
  athleteDiets: Diet[];
  setAthleteDiets: React.Dispatch<React.SetStateAction<Diet[]>>;
  athleteDietConfig: AthleteDietConfig | null;
  nutritionConfig: AthleteNutritionConfig | null;
  weeklyMenus: WeeklyMenu[];
  setWeeklyMenus: React.Dispatch<React.SetStateAction<WeeklyMenu[]>>;
  menuCompletionLogs: MenuCompletionLog[];
  bodyweightLogs: BodyweightLog[];
  onToggleDiet: (dietId: string) => void;
  onScheduleDay: (day: WeekDay, dietId: string | null) => void;
  onToggleDietMode: (mode: DietMode) => void;
  onSaveStepConfig: (updates: Partial<Pick<AthleteNutritionConfig, 'stepGoal' | 'kcalPerStep'>>) => void;
}

export default function ClientDietsPanel({
  athlete, coachId, onboardingData, athleteDiets, setAthleteDiets, athleteDietConfig,
  nutritionConfig, weeklyMenus, setWeeklyMenus, menuCompletionLogs, bodyweightLogs,
  onToggleDiet, onScheduleDay, onToggleDietMode, onSaveStepConfig,
}: Props) {
  // Diet editor state: undefined = closed, null = create new, Diet = edit existing
  const [dietEditorDiet, setDietEditorDiet] = useState<Diet | null | undefined>(undefined);

  // Weekly menu (recipe-first): editor state. undefined = editor closed,
  // 'new' = fresh generation, WeeklyMenu = editing/reviewing an existing one.
  const [menuEditor, setMenuEditor] = useState<'new' | WeeklyMenu | undefined>(undefined);
  const [showSwapHistory, setShowSwapHistory] = useState(false);

  const reloadWeeklyMenus = () => {
    getWeeklyMenusForAthlete(athlete.email).then(setWeeklyMenus).catch(console.error);
  };

  const publishedMenu = weeklyMenus.find(m => m.status === 'published') ?? null;
  const menuAdherence = useMemo(
    () => computeMenuAdherenceRate(menuCompletionLogs, publishedMenu),
    [menuCompletionLogs, publishedMenu],
  );

  // Diets scheduled across the week (día A/B/C) that the athlete hasn't finished
  // filling in yet — surfaced so the coach knows who still owes the athlete nothing,
  // but the athlete still owes themselves food items to hit the budget assigned.
  const pendingScheduledDiets = useMemo(() => {
    const scheduledIds = new Set(Object.values(athleteDietConfig?.weeklySchedule ?? {}).filter((id): id is string => typeof id === 'string'));
    return athleteDiets.filter(d => scheduledIds.has(d.id) && isDietPending(d));
  }, [athleteDiets, athleteDietConfig]);

  return menuEditor !== undefined ? (
    /* ── Weekly menu editor (recipe-first generator) ── */
    <WeeklyMenuEditor
      athleteEmail={athlete.email}
      onboarding={onboardingData}
      diets={athleteDiets}
      dietConfig={athleteDietConfig}
      nutritionConfig={nutritionConfig}
      initialMenu={menuEditor === 'new' ? undefined : menuEditor}
      onSaved={() => { setMenuEditor(undefined); reloadWeeklyMenus(); }}
      onCancel={() => { setMenuEditor(undefined); reloadWeeklyMenus(); }}
    />
  ) : dietEditorDiet !== undefined ? (
    /* ── Diet editor (embedded NutritionPlansScreen) ── */
    <NutritionPlansScreen
      coachId={coachId}
      athleteEmail={athlete.email}
      embeddedDiet={dietEditorDiet}
      onboardingData={onboardingData}
      onSaved={async (_saved) => {
        setDietEditorDiet(undefined);
        getDietsForAthlete(athlete.email)
          .then(diets => setAthleteDiets(diets.filter(d => !d.selfManaged)))
          .catch(console.error);
      }}
      onCancelled={() => setDietEditorDiet(undefined)}
    />
  ) : (
    /* ── Diet list + config ── */
    <div className="space-y-6">
      {/* Diets */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-body-s">nutrition</span>
            Dietas disponibles
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setDietEditorDiet(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black font-sans text-caption font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-body-s">add</span>
              Nueva dieta
            </button>
          </div>
        </div>
        {athleteDiets.length === 0 ? (
          <div className="py-6 text-center">
            <span className="material-symbols-outlined text-2xl text-ink-3 block mb-2">nutrition</span>
            <p className="text-label text-ink-2">No hay dietas creadas para este atleta.</p>
            <p className="text-caption text-ink-2 mt-1 font-mono">Pulsa "Nueva dieta" para crear la primera.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {athleteDiets.map(dt => {
              const active = athleteDietConfig?.activeDietIds?.includes(dt.id) ?? false;
              return (
                <div
                  key={dt.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-surface border transition-all ${active ? 'bg-accent-bg border-accent/40' : 'bg-surface border-hairline'}`}
                >
                  {/* Toggle checkbox */}
                  <button
                    onClick={() => onToggleDiet(dt.id)}
                    className="flex-shrink-0"
                    title={active ? 'Desactivar dieta' : 'Activar dieta'}
                  >
                    <span className={`w-4 h-4 rounded-control border-2 flex items-center justify-center transition-colors ${active ? 'bg-accent border-accent' : 'border-hairline hover:border-ink-2'}`}>
                      {active && <span className="material-symbols-outlined text-black" style={{ fontSize: '11px' }}>check</span>}
                    </span>
                  </button>

                  {/* Diet info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className={`font-sans font-bold text-body-s truncate ${active ? 'text-white' : 'text-ink-2'}`}>{dt.name}</p>
                      {dt.isDraft === true && (
                        <span className="flex-shrink-0 text-caption font-mono font-bold uppercase text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-control border border-amber-400/20">
                          BORRADOR
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-caption text-ink-2">
                      {dt.meals.length} comida{dt.meals.length !== 1 ? 's' : ''} · {dt.meals.reduce((s, m) => s + m.items.length, 0)} alimentos
                    </p>
                  </div>

                  {active && (
                    <span className="text-caption font-sans font-bold uppercase text-accent bg-accent/10 px-2 py-0.5 rounded-surface border border-accent/20 flex-shrink-0">
                      Activa
                    </span>
                  )}

                  {/* Edit button */}
                  <button
                    onClick={() => setDietEditorDiet(dt)}
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-raised border border-hairline text-data hover:border-data/40 font-mono text-caption uppercase rounded-control transition-all"
                    title="Editar dieta"
                  >
                    <span className="material-symbols-outlined text-body-s">edit</span>
                    Editar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Weekly schedule grid */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-body-s">calendar_month</span>
            Programación semanal
          </h3>
          {pendingScheduledDiets.length > 0 && (
            <span className="flex items-center gap-1 text-caption font-mono font-bold uppercase text-amber-400 bg-amber-400/10 px-2 py-1 rounded-surface border border-amber-400/20">
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>pending_actions</span>
              {pendingScheduledDiets.length} {pendingScheduledDiets.length === 1 ? 'pendiente de generar' : 'pendientes de generar'}
            </span>
          )}
        </div>
        <p className="text-caption text-ink-2 font-mono">
          Asigna una dieta a cada día. El atleta la verá cargada automáticamente.
        </p>
        <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-1.5 min-w-[360px]">
          {WEEK_DAYS.map(day => {
            const scheduledId = athleteDietConfig?.weeklySchedule?.[day] ?? null;
            const scheduledDiet = scheduledId ? athleteDiets.find(d => d.id === scheduledId) ?? null : null;
            const totalExch = scheduledDiet
              ? (scheduledDiet.budget?.HC ?? 0) + (scheduledDiet.budget?.PROT ?? 0) + (scheduledDiet.budget?.GRASA ?? 0)
              : null;
            return (
              <div key={day} className="flex flex-col gap-1">
                <span className="text-caption font-mono font-bold text-ink-2 uppercase text-center tracking-widest">
                  {WEEK_DAY_SHORT[day]}
                </span>
                <select
                  value={scheduledId ?? ''}
                  onChange={e => onScheduleDay(day, e.target.value || null)}
                  className="w-full bg-raised border border-hairline text-ink-2 text-caption font-mono rounded-control px-1.5 py-1.5 focus:outline-none focus:border-accent/40 hover:border-hairline transition-colors cursor-pointer"
                  title={WEEK_DAY_FULL[day]}
                >
                  <option value="">Libre</option>
                  {athleteDiets.map(dt => (
                    <option key={dt.id} value={dt.id}>{dt.name}</option>
                  ))}
                </select>
                {totalExch !== null && (
                  <span className="text-caption font-mono text-accent text-center">
                    {totalExch} int.
                  </span>
                )}
              </div>
            );
          })}
        </div>{/* end grid cols-7 */}
        </div>{/* end overflow-x-auto */}
      </div>

      {/* Menú semanal — generador automático basado en recetas. Lee sus
          puntos de las dietas de tipo de día programadas arriba. */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-body-s">restaurant_menu</span>
            Menú semanal
          </h3>
          <button
            onClick={() => setMenuEditor('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black font-sans text-caption font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-body-s">auto_awesome</span>
            Generar menú
          </button>
        </div>
        <p className="text-caption text-ink-2 font-mono">
          Reparte recetas reales por comida según los puntos ya pautados. Se genera como borrador — el atleta solo lo ve tras publicarlo.
        </p>

        {publishedMenu && menuAdherence.daysLogged > 0 && (
          <div className="flex items-center gap-2 bg-bg border border-hairline rounded-surface px-3 py-2">
            <span className="material-symbols-outlined text-data text-body-s">task_alt</span>
            <span className="font-mono text-caption text-ink-2">
              Adherencia al menú (últimas 2 semanas): <span className="text-white font-bold">{menuAdherence.avgPct}%</span> · {menuAdherence.daysLogged} {menuAdherence.daysLogged === 1 ? 'día' : 'días'} registrados
            </span>
          </div>
        )}

        {weeklyMenus.filter(m => m.status !== 'archived').length === 0 ? (
          <div className="py-4 text-center">
            <span className="material-symbols-outlined text-2xl text-ink-3 block mb-2">restaurant_menu</span>
            <p className="text-label text-ink-2">Aún no hay ningún menú generado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {weeklyMenus.filter(m => m.status !== 'archived').map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-surface border bg-surface border-hairline">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <p className="font-sans font-bold text-body-s text-white truncate">{m.name}</p>
                    <span className={`flex-shrink-0 text-caption font-mono font-bold uppercase px-1.5 py-0.5 rounded-control border ${m.status === 'published' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-amber-400 bg-amber-400/10 border-amber-400/20'}`}>
                      {m.status === 'published' ? 'PUBLICADO' : 'BORRADOR'}
                    </span>
                    {m.batchCooking && (
                      <span className="flex-shrink-0 flex items-center gap-0.5 text-caption font-mono font-bold uppercase text-accent bg-accent/10 border border-accent/25 px-1.5 py-0.5 rounded-control">
                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>inventory_2</span>batch
                      </span>
                    )}
                    {isMenuStale(m, athleteDietConfig?.weeklySchedule ?? {}, athleteDiets) && (
                      <span className="flex-shrink-0 flex items-center gap-0.5 text-caption font-mono font-bold uppercase text-orange-400 bg-orange-400/10 border border-orange-400/25 px-1.5 py-0.5 rounded-control" title="Las dietas o el calendario han cambiado desde que se generó — regenera para actualizar los puntos.">
                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>sync_problem</span>desactualizado
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-caption text-ink-2">
                    {m.days.filter(d => d.meals.length > 0).length} días con comidas · {m.batchCooking ? 'batch cooking' : `variedad ${m.varietyLevel}/5`}
                  </p>
                </div>
                <button
                  onClick={() => setMenuEditor(m)}
                  className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-raised border border-hairline text-data hover:border-data/40 font-mono text-caption uppercase rounded-control transition-all"
                >
                  <span className="material-symbols-outlined text-body-s">edit</span>
                  {m.status === 'published' ? 'Revisar' : 'Editar'}
                </button>
                <button
                  onClick={() => { if (window.confirm(`¿Eliminar "${m.name}"?`)) deleteWeeklyMenu(m.id).then(reloadWeeklyMenus).catch(console.error); }}
                  className="flex-shrink-0 text-ink-2 hover:text-red-400 p-1 rounded-control transition-colors"
                  title="Eliminar"
                >
                  <span className="material-symbols-outlined text-body-s">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {weeklyMenus.some(m => m.status === 'published' && m.swapHistory.length > 0) && (
          <div>
            <button
              onClick={() => setShowSwapHistory(v => !v)}
              className="flex items-center gap-1.5 text-caption font-mono text-ink-2 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-body-s">{showSwapHistory ? 'expand_less' : 'history'}</span>
              Historial de cambios del atleta
            </button>
            {showSwapHistory && (
              <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                {weeklyMenus.find(m => m.status === 'published')?.swapHistory
                  .slice().reverse().map((s, i) => (
                    <div key={i} className="font-mono text-caption text-ink-2 bg-bg border border-hairline rounded-surface px-3 py-2">
                      <span className="text-ink-3">{new Date(s.at).toLocaleString('es-ES')}</span> — {WEEK_DAY_FULL[s.day]}: cambió <span className="text-white">{s.fromRecipeName}</span> por <span className="text-accent">{s.toRecipeName}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Periodización nutricional — el panel es dueño del estado de
          edición y renderiza el dashboard de rendimiento (gráfico +
          stats) como su propia vista de lectura; son una sola sección. */}
      <NutritionPeriodizationPanel
        athleteEmail={athlete.email}
        athleteName={athlete.displayName}
        targetWeightKg={athlete.targetWeight}
        diets={athleteDiets}
        onboarding={onboardingData}
        currentWeightKg={bodyweightLogs.length > 0 ? bodyweightLogs[bodyweightLogs.length - 1].weight : onboardingData?.weightKg}
        stepGoal={nutritionConfig?.stepGoal ?? 8000}
        kcalPerStep={nutritionConfig?.kcalPerStep ?? DEFAULT_KCAL_PER_STEP}
        onDietsChanged={() => {
          getDietsForAthlete(athlete.email)
            .then(diets => setAthleteDiets(diets.filter(d => !d.selfManaged)))
            .catch(console.error);
        }}
      />

      {/* Nutrition mode config */}
      {nutritionConfig && (
        <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
          <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-data text-body-s">tune</span>
            Modos de alimentación habilitados
          </h3>
          <p className="text-caption text-ink-2 font-mono">
            Si hay varios activos, el atleta podrá elegir entre ellos en su tracker.
          </p>
          <div className="flex gap-3 flex-wrap">
            {(['OMNIVORO', 'VEGANO', 'SIN_PESAR'] as DietMode[]).map(mode => {
              const active = nutritionConfig.enabledModes?.includes(mode) ?? false;
              return (
                <button
                  key={mode}
                  onClick={() => onToggleDietMode(mode)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-control font-mono text-label font-bold uppercase tracking-wider border transition-all ${active ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-raised border-hairline text-ink-2 hover:border-ink-2/30 hover:text-white'}`}
                >
                  <span className={`w-3.5 h-3.5 rounded-control flex-shrink-0 border-2 flex items-center justify-center transition-colors ${active ? 'bg-accent border-accent' : 'border-hairline'}`}>
                    {active && <span className="material-symbols-outlined text-black" style={{ fontSize: '10px' }}>check</span>}
                  </span>
                  {DIET_MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step goal config */}
      {nutritionConfig && (
        <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
          <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-data text-body-s">directions_walk</span>
            Objetivo de pasos
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Pasos/día</label>
              <input
                type="number"
                min={0}
                defaultValue={nutritionConfig.stepGoal ?? ''}
                placeholder="8000"
                onBlur={e => {
                  const val = parseInt(e.target.value, 10);
                  onSaveStepConfig({ stepGoal: isNaN(val) ? undefined : val });
                }}
                className="w-full bg-raised border border-hairline rounded-control px-2.5 py-1.5 text-white font-mono text-label focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Kcal/paso</label>
              <input
                type="number"
                min={0}
                step={0.001}
                defaultValue={nutritionConfig.kcalPerStep ?? DEFAULT_KCAL_PER_STEP}
                onBlur={e => {
                  const val = parseFloat(e.target.value);
                  onSaveStepConfig({ kcalPerStep: isNaN(val) ? undefined : val });
                }}
                className="w-full bg-raised border border-hairline rounded-control px-2.5 py-1.5 text-white font-mono text-label focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          <p className="text-caption text-ink-2 font-mono">
            Por defecto {DEFAULT_KCAL_PER_STEP} kcal/paso (1000 pasos ≈ 46 kcal).
          </p>
        </div>
      )}
    </div>
  );
}

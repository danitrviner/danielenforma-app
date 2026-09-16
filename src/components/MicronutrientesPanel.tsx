import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AthleteNutritionConfig } from '../types';
import {
  getDietsForAthlete, getAthleteDietConfig, getOnboarding,
  getAthleteNutritionConfig, saveAthleteNutritionConfig,
} from '../dbService';
import { buildMicronutrientEstimate, MicroStatus } from '../utils/micronutrients';
import { NotaDeFuente } from './FuentesCientificasSheet';
import VegetableSelector from './VegetableSelector';
import { Skeleton } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   MICRONUTRIENTES ESTIMADOS — vive en Dietas, no en Revisión.

   Estaba dentro de «Análisis › Nutrición» junto a la adherencia y los pasos, y
   ahí no encajaba: la adherencia cuenta lo que el atleta HIZO (es revisión), y
   esto estima lo que la dieta que le has puesto APORTA, con dos controles que
   son configuración del atleta —cuánta verdura come al día y de qué tipo—. Al
   absorber Análisis dentro de Revisión, la parte de revisión se fue allí y
   esta se queda donde se decide: al lado de la dieta que la produce.

   Se autoabastece porque se monta solo cuando la pestaña Dietas está abierta;
   las claves de caché son las mismas que usa el resto del Hub, así que las
   consultas ya suelen estar servidas.
   ═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_VEG_SERVINGS = 3;

const STATUS_BAR_COLOR: Record<MicroStatus, string> = {
  low:     'bg-danger',
  ok:      'bg-success',
  high:    'bg-warning',
  unknown: 'bg-ink-3',
};

interface Props {
  athleteEmail: string;
}

export default function MicronutrientesPanel({ athleteEmail }: Props) {
  const queryClient = useQueryClient();
  const nutritionConfigKey = ['athleteNutritionConfig', athleteEmail] as const;

  const { data: diets, isPending: cargandoDietas } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
  });
  const { data: dietConfig, isPending: cargandoConfig } = useQuery({
    queryKey: ['athleteDietConfig', athleteEmail],
    queryFn: () => getAthleteDietConfig(athleteEmail).catch(() => null),
  });
  const { data: onboarding, isPending: cargandoAlta } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail).catch(() => null),
  });
  const { data: nutritionConfigData, isPending: cargandoNutricion } = useQuery({
    queryKey: nutritionConfigKey,
    queryFn: () => getAthleteNutritionConfig(athleteEmail).catch(() => null),
  });

  const cargando = cargandoDietas || cargandoConfig || cargandoAlta || cargandoNutricion;

  const nutritionConfig: AthleteNutritionConfig = nutritionConfigData
    ?? { athleteId: athleteEmail, enabledModes: ['OMNIVORO'] };

  const coachDiets = useMemo(() => (diets ?? []).filter(d => !d.selfManaged), [diets]);
  const activeDiet = useMemo(() => {
    const activeId = dietConfig?.activeDietIds?.[0] ?? null;
    return activeId ? coachDiets.find(d => d.id === activeId) ?? null : (coachDiets[0] ?? null);
  }, [coachDiets, dietConfig]);

  const vegServings = nutritionConfig.vegServingsPerDay ?? DEFAULT_VEG_SERVINGS;
  const vegTypes = useMemo(() => nutritionConfig.vegTypes ?? [], [nutritionConfig.vegTypes]);

  const micros = useMemo(
    () => buildMicronutrientEstimate(activeDiet, { sex: onboarding?.sex, vegServingsPerDay: vegServings, vegTypes }),
    [activeDiet, onboarding, vegServings, vegTypes],
  );

  const setVegServings = (n: number) => {
    if (n < 0 || n > 8) return;
    const next: AthleteNutritionConfig = { ...nutritionConfig, vegServingsPerDay: n };
    queryClient.setQueryData(nutritionConfigKey, next);
    saveAthleteNutritionConfig(next).catch(console.error);
  };

  const toggleVegType = (id: string) => {
    const next: AthleteNutritionConfig = {
      ...nutritionConfig,
      vegTypes: vegTypes.includes(id) ? vegTypes.filter(v => v !== id) : [...vegTypes, id],
    };
    queryClient.setQueryData(nutritionConfigKey, next);
    saveAthleteNutritionConfig(next).catch(console.error);
  };

  if (cargando) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Micronutrientes (estimados)</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-caption text-ink-2 uppercase">Verdura/día</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setVegServings(vegServings - 1)}
              aria-label="Quitar una ración de verdura"
              className="w-6 h-6 rounded-control bg-raised border border-hairline text-ink-2 hover:text-white flex items-center justify-center"
            >−</button>
            <span className="font-mono text-label text-white w-5 text-center">{vegServings}</span>
            <button
              onClick={() => setVegServings(vegServings + 1)}
              aria-label="Añadir una ración de verdura"
              className="w-6 h-6 rounded-control bg-raised border border-hairline text-ink-2 hover:text-white flex items-center justify-center"
            >+</button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-sans text-caption text-ink-2 uppercase tracking-wider">Verduras habituales del atleta</p>
        <VegetableSelector selected={vegTypes} onToggle={toggleVegType} />
      </div>

      <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
        {micros.perMicro.map(m => (
          <div key={m.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-sans text-caption text-ink-2">
                {m.label}
                {m.status === 'low' && <span className="ml-2 text-danger">déficit</span>}
                {m.status === 'high' && <span className="ml-2 text-warning">{m.limit ? 'alto' : 'exceso'}</span>}
              </span>
              <span className="font-mono text-caption font-bold text-white">
                {m.intake}{m.unit} <span className="text-ink-3">· {m.rdaPct}%{m.limit ? ' ref.' : ' RDA'}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-raised overflow-hidden">
              <div className={`h-full rounded-full transition-all ${STATUS_BAR_COLOR[m.status]}`} style={{ width: `${Math.min(100, m.rdaPct)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <p className="font-mono text-caption text-ink-3 leading-relaxed">
        {micros.note}
        {micros.unmatched.length > 0 && ` · ${micros.unmatched.length} alimento(s) sin estimación.`}
        {!activeDiet && ' · Sin dieta activa: sólo cuenta la línea base de verdura.'}
      </p>

      {/* 1.4.1 de Apple: los porcentajes de IDR son información nutricional
          de salud; su origen va aquí mismo, no a dos pantallas de distancia. */}
      <NotaDeFuente>
        Ingestas diarias de referencia según EFSA (Dietary Reference Values) y el límite de sodio de
        la OMS; composición de los alimentos según BEDCA y USDA FoodData Central. Es una estimación a
        partir de porciones tipo, no una analítica ni un diagnóstico.
      </NotaDeFuente>
    </div>
  );
}

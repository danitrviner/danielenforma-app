import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AthleteNutritionConfig, Diet, DietCompletionLog, BodyweightLog } from '../../types';
import {
  getAthleteDietConfig, getStepsForAthlete, getOnboarding,
  getAthleteNutritionConfig, saveAthleteNutritionConfig,
} from '../../dbService';
import { buildNutritionReport, DEFAULT_THRESHOLDS } from '../../utils/nutritionAnalysis';
import { computeActivePhase } from '../../utils/fasesNutricion';
import { getNutritionProgram } from '../../dbService';
import { VentanaRevision } from '../../utils/revisionCoach';
import { Button, Skeleton, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque 5 — Adherencia y hábitos.

   Es lo que era la pestaña «Análisis › Nutrición», traído aquí entero salvo los
   micronutrientes, que se han ido a Dietas (allí se decide la verdura, aquí se
   revisa lo que ya pasó — ver MicronutrientesPanel).

   Va justo detrás de «Qué ha comido» y contesta a otra pregunta: aquel bloque
   enseña QUÉ eligió comer, este cuánto de lo pautado cumplió, cuánto anduvo y
   si el plan que tiene puesto cuadra con su objetivo. Los dos leen la MISMA
   ventana que el selector de arriba —por eso el motor recibe `ventana`— para
   que el coach no lea en la misma pantalla un «14 días» al lado de un «bloque
   entero» y los compare sin darse cuenta.
   ═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_STEP_GOAL = 8000;

interface Props {
  athleteEmail: string;
  athleteName: string;
  targetWeight?: number;
  /** Registros de dieta de la ventana, ya cargados por el panel padre. */
  registros: DietCompletionLog[];
  dietas: Diet[];
  bodyweightLogs: BodyweightLog[];
  ventana: VentanaRevision;
}

export default function BloqueNutricionHabitos({
  athleteEmail, athleteName, targetWeight, registros, dietas, bodyweightLogs, ventana,
}: Props) {
  const queryClient = useQueryClient();
  const nutritionConfigKey = ['athleteNutritionConfig', athleteEmail] as const;

  const { data: dietConfig, isPending: cargandoConfig } = useQuery({
    queryKey: ['athleteDietConfig', athleteEmail],
    queryFn: () => getAthleteDietConfig(athleteEmail).catch(() => null),
  });
  const { data: stepLogs, isPending: cargandoPasos } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const { data: onboarding, isPending: cargandoAlta } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail).catch(() => null),
  });
  const { data: nutritionConfigData, isPending: cargandoNutricion } = useQuery({
    queryKey: nutritionConfigKey,
    queryFn: () => getAthleteNutritionConfig(athleteEmail).catch(() => null),
  });
  // La fase que rige HOY decide contra qué objetivo se comparan los macros. Sin
  // ella, la comparación se hacía siempre contra los gramos del alta —
  // calculados para mantener— y cualquier atleta en déficit salía en rojo.
  const { data: programa, isPending: cargandoPrograma } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail),
  });

  const cargando = cargandoConfig || cargandoPasos || cargandoAlta || cargandoNutricion || cargandoPrograma;

  const faseActiva = useMemo(
    () => (programa && programa.phases.length > 0 ? computeActivePhase(programa, ventana.hasta) : null),
    [programa, ventana.hasta],
  );

  const nutritionConfig: AthleteNutritionConfig = nutritionConfigData
    ?? { athleteId: athleteEmail, enabledModes: ['OMNIVORO'] };

  const coachDiets = useMemo(() => dietas.filter(d => !d.selfManaged), [dietas]);
  const activeDiet = useMemo(() => {
    const activeId = dietConfig?.activeDietIds?.[0] ?? null;
    return activeId ? coachDiets.find(d => d.id === activeId) ?? null : (coachDiets[0] ?? null);
  }, [coachDiets, dietConfig]);

  const informe = useMemo(() => {
    if (cargando) return null;
    try {
      return buildNutritionReport({
        completionLogs: registros,
        diets: coachDiets,
        activeDiet,
        stepLogs: stepLogs ?? [],
        stepGoal: nutritionConfigData?.stepGoal ?? DEFAULT_STEP_GOAL,
        bodyweightLogs,
        targetWeight,
        onboarding: onboarding ?? null,
        faseActiva,
        thresholds: { ...DEFAULT_THRESHOLDS, ventana: { desde: ventana.desde, hasta: ventana.hasta } },
      });
    } catch (err) {
      console.error('BloqueNutricionHabitos: no se pudo construir el informe', err);
      return null;
    }
  }, [cargando, registros, coachDiets, activeDiet, stepLogs, nutritionConfigData?.stepGoal,
      bodyweightLogs, targetWeight, onboarding, faseActiva, ventana.desde, ventana.hasta]);

  const [compartiendo, setCompartiendo] = useState(false);
  const compartido = nutritionConfig.sharedReportSnapshot;

  const compartir = async () => {
    if (!informe) return;
    setCompartiendo(true);
    try {
      const next: AthleteNutritionConfig = {
        ...nutritionConfig,
        sharedReportSnapshot: { generatedAt: informe.generatedAt, summary: informe.summary, flags: informe.flags },
      };
      await saveAthleteNutritionConfig(next);
      queryClient.setQueryData(nutritionConfigKey, next);
    } catch (err) { console.error(err); } finally { setCompartiendo(false); }
  };

  const dejarDeCompartir = async () => {
    setCompartiendo(true);
    try {
      const next: AthleteNutritionConfig = { ...nutritionConfig, sharedReportSnapshot: undefined };
      await saveAthleteNutritionConfig(next);
      queryClient.setQueryData(nutritionConfigKey, next);
    } catch (err) { console.error(err); } finally { setCompartiendo(false); }
  };

  if (cargando) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (!informe) {
    return (
      <p className="font-sans text-label text-ink-3">
        Todavía no hay datos de dieta, pasos o peso de {athleteName} en esta ventana.
      </p>
    );
  }

  const { adherence, steps, weightTrend, macroDeviation, flags } = informe;

  return (
    <div className="space-y-4">
      <p className="font-sans text-body-s text-ink leading-relaxed">{informe.summary}</p>

      <div className="grid grid-cols-3 gap-3">
        <Tarjeta
          label="Adherencia"
          value={adherence.daysWithBudget > 0 ? `${adherence.avgPct}%` : '—'}
          sub={adherence.daysWithBudget > 0
            ? `de su cupo · ${adherence.daysWithBudget} días con dieta`
            : adherence.daysLogged > 0 ? 'registra, pero sin cupo' : 'sin registros'}
        />
        <Tarjeta
          label="Pasos"
          value={steps.daysLogged > 0 ? `${steps.avgPct}%` : '—'}
          sub={steps.daysLogged > 0 ? `${steps.daysLogged} días` : 'sin registros'}
        />
        <Tarjeta
          label="Peso"
          value={weightTrend.latestWeight != null ? `${weightTrend.latestWeight} kg` : '—'}
          sub={weightTrend.deltaFromFirst != null
            ? `${weightTrend.deltaFromFirst >= 0 ? '+' : ''}${weightTrend.deltaFromFirst} kg en la ventana`
            : 'sin datos'}
        />
      </div>

      {macroDeviation.length > 0 && (
        <div>
          <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block mb-2">
            Macros del plan vs objetivo{faseActiva ? ` de «${faseActiva.name}»` : ' del alta'}
          </span>
          <div className="grid grid-cols-3 gap-3">
            {macroDeviation.map(m => (
              <div key={m.category}>
                <span className="block font-sans text-caption text-ink-2">{m.category}</span>
                <span className={`block font-mono text-body-s font-bold ${Math.abs(m.deviationPct) > DEFAULT_THRESHOLDS.macroDeviationOkPct ? 'text-danger' : 'text-success'}`}>
                  {m.planGrams}g / {m.targetGrams}g
                </span>
                <span className="block font-mono text-caption text-ink-2">
                  {m.deviationPct > 0 ? '+' : ''}{m.deviationPct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {flags.length > 0 && (
        <div className="border border-warning/30 bg-warning/10 rounded-surface p-4 space-y-1">
          <span className="font-mono text-caption text-warning uppercase tracking-[.08em] flex items-center gap-1.5">
            <Icon name="warning" size="s" /> Alertas
          </span>
          {flags.map((f, i) => (
            <p key={i} className="font-sans text-label text-ink leading-relaxed">{f}</p>
          ))}
        </div>
      )}

      {adherence.daysWithBudget > 0 && (
        <p className="font-mono text-caption text-ink-3 leading-relaxed">
          La adherencia mide COMIDA, no tics: intercambios comidos ÷ intercambios de cupo. Puede
          pasar del 100 % —comer de más es un dato— y por eso no se recorta. Contando líneas
          marcadas, como se hacía antes, saldría {adherence.avgPctPorLineas} %: desde que en «Mi
          plan» todo lo que añade nace ya marcado, ese número da casi siempre 100.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap border-t border-hairline pt-3">
        <div>
          <p className="font-sans text-label text-ink font-bold">
            {compartido ? 'Resumen compartido con el atleta' : 'Este análisis es privado'}
          </p>
          <p className="font-mono text-caption text-ink-3">
            {compartido
              ? `Compartido el ${new Date(compartido.generatedAt).toLocaleDateString('es-ES')}`
              : 'El atleta no lo ve hasta que lo compartas.'}
          </p>
        </div>
        {compartido ? (
          <Button variant="secondary" size="s" onClick={dejarDeCompartir} disabled={compartiendo}>
            Dejar de compartir
          </Button>
        ) : (
          <Button size="s" onClick={compartir} disabled={compartiendo}>Compartir resumen</Button>
        )}
      </div>
    </div>
  );
}

function Tarjeta({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-raised border border-hairline rounded-surface p-3 text-center">
      <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.08em]">{label}</span>
      <span className="block font-sans font-bold text-title-m text-ink mt-1 tabular-nums">{value}</span>
      <span className="block font-mono text-caption text-ink-3">{sub}</span>
    </div>
  );
}

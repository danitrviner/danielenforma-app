import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getDietCompletionLogsForAthlete, getDietsForAthlete, getNutritionProgram, getOnboarding,
} from '../../dbService';
import { useAthleteWeight } from '../../hooks/useAthleteWeight';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import { estimateMaintenanceKcal } from '../../utils/energyCalc';
import {
  calcularGastoReal, evolucionDelGasto, kcalParaObjetivo, VENTANA_GASTO_SEMANAS, DIAS_MINIMOS_SEMANA,
} from '../../utils/gastoReal';
import { faseEnCurso } from '../../utils/objetivoDeFase';
import { OBJETIVO_LABEL } from '../../utils/verificacionObjetivo';
import { Card, Badge, Banner, Sparkline, Skeleton } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Gasto real — lo que quema de verdad, al lado del veredicto del objetivo

   El motor vive en utils/gastoReal.ts. Esta tarjeta decide qué se enseña como
   REAL y qué como ESTIMADO: sin semanas bien registradas no hay gasto real, y
   se enseña el de la fórmula con esa etiqueta, nunca disfrazado.

   Coste: los registros de comida se leen con ventana (16 semanas: 12 puntos de
   evolución × 4 semanas de ventana cada uno, solapadas), no el histórico.
   ═══════════════════════════════════════════════════════════════════════════ */

const PUNTOS_EVOLUCION = 12;

// es-ES no agrupa los números de 4 cifras («2500»): se agrupa a mano para que
// 2.500 y 12.500 se lean igual.
function kcal(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function GastoReal({ athleteEmail }: { athleteEmail: string }) {
  const hoy = hoyIsoLocal();
  // Hasta AYER: el día de hoy está a medio registrar y sacaría el gasto bajo.
  const hasta = addDays(hoy, -1);
  const desdeLecturas = addDays(hasta, -((PUNTOS_EVOLUCION - 1) * 7 + VENTANA_GASTO_SEMANAS * 7));

  const { logs: pesos, loading: cargandoPesos } = useAthleteWeight(athleteEmail);
  const { data: registros = [], isPending: cargandoRegistros } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athleteEmail, desdeLecturas],
    queryFn: () => getDietCompletionLogsForAthlete(athleteEmail, desdeLecturas),
  });
  const { data: diets = [], isPending: cargandoDietas } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
  });
  const { data: onboarding = null } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail).catch(() => null),
  });
  const { data: program = null } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail),
  });

  const pesoKg = pesos.length ? pesos[pesos.length - 1].weight : null;
  const formula = onboarding ? estimateMaintenanceKcal(onboarding, pesoKg ?? onboarding.weightKg) : null;

  const gasto = useMemo(
    () => calcularGastoReal({ pesos, registros, diets, hasta, gastoFormula: formula }),
    [pesos, registros, diets, hasta, formula],
  );
  const evolucion = useMemo(
    () => evolucionDelGasto({ pesos, registros, diets, hoy: hasta, puntos: PUNTOS_EVOLUCION }),
    [pesos, registros, diets, hasta],
  );

  if (cargandoPesos || cargandoRegistros || cargandoDietas) {
    return <Skeleton className="w-full h-40 rounded-surface" />;
  }

  const esReal = gasto.kcal != null && !gasto.sospechaInfraRegistro;
  const mostrado = esReal ? gasto.kcal : formula;
  const enCurso = faseEnCurso(program, hoy);
  const objetivo = enCurso?.objetivo?.tipo ?? null;
  const sugeridas = mostrado != null && objetivo && pesoKg != null
    ? kcalParaObjetivo(mostrado, objetivo, pesoKg) : null;
  const pautadas = enCurso?.fase.targetKcal ?? null;
  const diasVentana = VENTANA_GASTO_SEMANAS * 7;

  return (
    <Card
      title="Gasto real"
      subtitle={`Lo que quema de verdad, según lo que come y lo que pesa · últimas ${VENTANA_GASTO_SEMANAS} semanas`}
    >
      <div className="space-y-4">
        {mostrado == null ? (
          <p className="font-sans text-label text-ink-2">
            Aún no hay datos: faltan semanas con comida registrada y pesajes, y la ficha no tiene
            sexo, edad, altura y actividad para estimarlo con la fórmula.
          </p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="font-mono text-title-l text-ink">{kcal(mostrado)}</span>
            <span className="font-mono text-label text-ink-2">
              kcal/día{esReal && gasto.margen != null ? ` ± ${gasto.margen}` : ''}
            </span>
            {esReal ? (
              <Badge tone={gasto.confianza === 'alta' ? 'success' : 'info'} dot>
                Real · confianza {gasto.confianza}
              </Badge>
            ) : (
              <Badge tone="neutral" dot>Estimado · fórmula</Badge>
            )}
          </div>
        )}

        {gasto.sospechaInfraRegistro && gasto.kcal != null && (
          <Banner tone="danger">
            Con lo registrado saldría {kcal(gasto.kcal)} kcal, más de un 25 % por debajo de la fórmula
            ({kcal(formula!)}). Lo más probable es que no se esté registrando todo lo que come (picoteo,
            bebidas, aceite). Se enseña la fórmula hasta que el registro sea fiable.
          </Banner>
        )}

        {esReal && formula != null && gasto.kcal != null && (
          <p className="font-sans text-label text-ink-2">
            La fórmula (Mifflin) decía <span className="font-mono text-ink">{kcal(formula)}</span>:
            su cuerpo gasta{' '}
            <span className="font-mono text-ink">{kcal(Math.abs(gasto.kcal - formula))} kcal</span>{' '}
            {gasto.kcal - formula >= 0 ? 'más' : 'menos'} de lo que predice para su perfil.
          </p>
        )}

        {sugeridas != null && objetivo && (
          <p className="font-sans text-label text-ink">
            Para «{OBJETIVO_LABEL[objetivo]}» (centro del rango):{' '}
            <span className="font-mono">{kcal(sugeridas)} kcal/día</span>
            {pautadas != null && (
              <span className="text-ink-2"> · pautadas ahora <span className="font-mono">{kcal(pautadas)}</span></span>
            )}
            {!esReal && <span className="text-ink-3"> · orientativo, sale de la fórmula</span>}
          </p>
        )}

        {evolucion.length >= 3 && (
          <div className="space-y-1">
            <p className="font-sans text-caption text-ink-3 uppercase tracking-wider">
              Evolución del gasto · {evolucion.length} semanas
            </p>
            <Sparkline
              values={evolucion.map(p => p.kcal)}
              label={`Gasto real de ${kcal(evolucion[0].kcal)} a ${kcal(evolucion[evolucion.length - 1].kcal)} kcal`}
            />
            <p className="font-mono text-caption text-ink-2">
              {kcal(evolucion[0].kcal)} → {kcal(evolucion[evolucion.length - 1].kcal)} kcal/día
            </p>
          </div>
        )}

        <p className="font-sans text-caption text-ink-3">
          Datos: {gasto.diasRegistrados}/{diasVentana} días con comida registrada ·{' '}
          {gasto.semanasValidas} de {VENTANA_GASTO_SEMANAS} semanas válidas (≥{DIAS_MINIMOS_SEMANA} días) ·{' '}
          {gasto.pesajes} pesajes
          {gasto.kcalComidas != null && <> · comió de media {kcal(gasto.kcalComidas)} kcal</>}
          {gasto.cambioKgSemana != null && <> · peso {gasto.cambioKgSemana > 0 ? '+' : ''}{gasto.cambioKgSemana.toLocaleString('es-ES')} kg/sem</>}
          . Las verduras libres no se registran: el gasto real puede ser algo mayor.
        </p>
      </div>
    </Card>
  );
}

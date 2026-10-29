import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AthleteDietConfig, Diet, NutritionProgram, PlanSemanal, PlatoDelPlan } from '../../types';
import { getPlanSemanal, savePlanSemanal, getCatalogoAlimentos, cargarIndiceRecetas } from '../../dbService';
import { objetivoDelDia } from '../../utils/objetivoDelDia';
import { objetivoDeDieta } from '../../utils/macrosLegado';
import { objetivoDeLaSemana } from '../../utils/planSemanal';
import { addDays, fechaCorta, getWeekStart } from '../../utils/trainingWeek';
import { SegmentedControl, Button } from '../ui';
import { useToast } from '../../hooks/useToast';
import PlanDeLaSemana from './PlanDeLaSemana';

/* Nutrición › Semana, para quien cocina en tandas: carga el plan de la semana,
   calcula el objetivo de los siete días con lo que pautó el coach y guarda
   cada cambio. Ver utils/planSemanal.ts. */

export function planSemanalKey(email: string, lunes: string) {
  return ['planSemanal', email, lunes] as const;
}

export default function MiSemana({ email, hoy, diets, config, program, entrenaEn }: {
  email: string;
  hoy: string;
  diets: Diet[];
  config: AthleteDietConfig | null | undefined;
  program: NutritionProgram | null | undefined;
  /** Si un día tiene sesión (ciclado de hidratos). */
  entrenaEn?: (fecha: string) => boolean | undefined;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // El domingo se cocina para la semana que viene: se puede planificar esa también.
  const [cual, setCual] = useState<'esta' | 'siguiente'>('esta');
  const lunes = addDays(getWeekStart(hoy), cual === 'esta' ? 0 : 7);
  const key = planSemanalKey(email, lunes);

  const { data: plan } = useQuery({ queryKey: key, queryFn: () => getPlanSemanal(email, lunes) });
  // Quien cocina en tandas suele repetir: si esta semana está vacía, se ofrece la anterior.
  const lunesAnterior = addDays(lunes, -7);
  const { data: planAnterior } = useQuery({
    queryKey: planSemanalKey(email, lunesAnterior),
    queryFn: () => getPlanSemanal(email, lunesAnterior),
    enabled: plan !== undefined && (plan?.platos.length ?? 0) === 0,
  });
  const { data: catalogo = [] } = useQuery({ queryKey: ['catalogoAlimentos'], queryFn: getCatalogoAlimentos, staleTime: 60 * 60_000 });
  const { data: recetas = [] } = useQuery({ queryKey: ['indiceRecetas'], queryFn: cargarIndiceRecetas, staleTime: Infinity });

  const { objetivo, dias } = useMemo(() => objetivoDeLaSemana(
    Array.from({ length: 7 }, (_, i) => {
      const fecha = addDays(lunes, i);
      const o = objetivoDelDia({ diets, config, program, fecha, entrena: entrenaEn?.(fecha) });
      return o.dieta ? objetivoDeDieta(o.dieta) : null;
    }),
  ), [lunes, diets, config, program, entrenaEn]);

  const cambiar = (platos: PlatoDelPlan[]) => {
    const anterior = queryClient.getQueryData<PlanSemanal | null>(key);
    const nuevo: PlanSemanal = { id: `${email}_${lunes}`, athleteId: email, semana: lunes, platos };
    queryClient.setQueryData(key, nuevo);
    savePlanSemanal({ athleteId: email, semana: lunes, platos }).catch(err => {
      console.warn('savePlanSemanal failed:', err);
      queryClient.setQueryData(key, anterior ?? null);
      showToast('No se ha podido guardar el plan. Inténtalo otra vez.');
    });
  };

  return (
    <div className="space-y-4">
      <SegmentedControl
        label="Qué semana"
        value={cual}
        onChange={v => setCual(v as 'esta' | 'siguiente')}
        options={[{ value: 'esta', label: 'Esta semana' }, { value: 'siguiente', label: 'La que viene' }]}
      />
      {(plan?.platos.length ?? 0) === 0 && (planAnterior?.platos.length ?? 0) > 0 && (
        <Button variant="secondary" icon="content_copy" fullWidth
          onClick={() => cambiar(planAnterior!.platos.map(p => ({ ...p, id: `${p.id}_${lunes}` })))}>
          Repetir lo de la semana anterior ({planAnterior!.platos.length})
        </Button>
      )}
      <PlanDeLaSemana
        objetivo={objetivo}
        dias={dias}
        platos={plan?.platos ?? []}
        onCambiar={cambiar}
        catalogo={catalogo}
        recetas={recetas}
        etiquetaSemana={`Semana del ${fechaCorta(lunes)}`}
      />
    </div>
  );
}

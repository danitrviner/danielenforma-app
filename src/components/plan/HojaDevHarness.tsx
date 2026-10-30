import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Diet, NutritionProgram, OnboardingData } from '../../types';
import { bodyweightForAthleteKey } from '../../hooks/useAthleteWeight';
import { addDays, getWeekStart, hoyIsoLocal } from '../../utils/trainingWeek';
import { objetivoYCupo } from '../../utils/macrosLegado';
import { PLANTILLAS_POR_DEFECTO } from '../../utils/hojaDePeriodizacion';
import HojaDePeriodizacion from './HojaDePeriodizacion';

/* Banco de pruebas de la hoja de periodización (30-10) — `/dev/hoja`.
   Sin Firestore: programa, dietas, pesos y alta en memoria. `?vacio=1`
   enseña el estado sin periodización (plantillas). Guardar no escribe. */

const HOY = hoyIsoLocal();
const EMAIL = 'dev.atleta@example.com';
const INICIO = addDays(getWeekStart(HOY), -7 * 7); // semana 8

const dieta = (id: string, name: string, kcal: number, p: number, g: number): Diet => ({
  id, athleteId: EMAIL, name, meals: [], ...objetivoYCupo({ kcal, p, g, hc: Math.round((kcal - p * 4 - g * 9) / 4) }),
});
const DIETAS = [dieta('d1', 'Definición', 2300, 165, 65), dieta('d2', 'Salida de déficit', 2450, 150, 75), dieta('d3', 'Mantenimiento', 2650, 150, 80)];

const PROGRAMA: NutritionProgram = {
  athleteId: EMAIL, startDate: INICIO,
  phases: [
    { id: 'f1', name: 'Definición', weeks: 12, dietId: 'd1', modo: 'ritmo', objetivo: 'deficit', phaseType: 'deficit', ritmoPctSem: -0.55, targetKcal: 2300, proteinaGKg: 2, grasaGKg: 0.8, pasos: 10000, cardio: { sesiones: 2, zona: 'zona 2', minutos: 30 }, escalon: { cadaSemanas: 3, kcal: -100, pasos: 1000 }, paraQue: 'Quitar grasa guardando el músculo' },
    { id: 'f2', name: 'Salida de déficit', weeks: 2, dietId: 'd2', modo: 'ritmo', objetivo: 'salida_deficit', phaseType: 'superavit', ritmoPctSem: 0.1, targetKcal: 2450, proteinaGKg: 1.8, grasaGKg: 0.9, cardio: { sesiones: 1, zona: 'zona 2', minutos: 30 }, paraQue: 'Subir comida sin recuperar grasa' },
    { id: 'f3', name: 'Mantenimiento', weeks: 4, dietId: '', modo: 'ritmo', objetivo: 'mantenimiento', phaseType: 'mantenimiento', ritmoPctSem: 0, targetKcal: 2650, proteinaGKg: 1.8, grasaGKg: 1.0, paraQue: 'Asentar el peso y rendir en el gimnasio' },
  ],
  pasosPorSemana: [{ semana: 1, pasos: 10000 }, { semana: 4, pasos: 11000 }],
  cambiosSemana: [{ semana: 4, ajustes: [{ cat: 'HC', gramos: -25, delta: -1 }] }],
};

const PESOS = Array.from({ length: 60 }, (_, i) => {
  const d = addDays(INICIO, i);
  return { id: `p_${d}`, athleteId: EMAIL, date: d, weight: Math.round((84.2 - i * 0.045 + ((i * 7) % 3) * 0.1) * 10) / 10, createdAt: '' };
}).filter(p => p.date <= HOY);

const ALTA: OnboardingData = { athleteId: EMAIL, sex: 'male', birthDate: '1992-03-10', weightKg: 82.3, heightCm: 178, activityLevel: 'activo' } as OnboardingData;

export default function HojaDevHarness() {
  const vacio = new URLSearchParams(window.location.search).get('vacio') === '1';
  const client = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
    c.setQueryData(['nutritionProgram', EMAIL], vacio ? null : PROGRAMA);
    c.setQueryData(['plantillasPeriodizacion'], PLANTILLAS_POR_DEFECTO);
    c.setQueryData(bodyweightForAthleteKey(EMAIL), PESOS);
    c.setQueryData(['publishedMenu', EMAIL], null);
    return c;
  }, [vacio]);
  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="mx-auto max-w-6xl space-y-4">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">/dev/hoja — hoja de periodización · datos de mentira · guardar no escribe</p>
          <HojaDePeriodizacion athleteEmail={EMAIL} athleteName="Daniel Briz" diets={DIETAS} onboarding={ALTA} currentWeightKg={PESOS.at(-1)?.weight} stepGoal={8000} kcalPerStep={0.031} />
        </div>
      </div>
    </QueryClientProvider>
  );
}

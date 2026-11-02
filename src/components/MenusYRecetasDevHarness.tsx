import React, { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AthleteDietConfig, Diet, OnboardingData } from '../types';
import { objetivoYCupo } from '../utils/macrosLegado';
import { ToastProvider } from '../hooks/useToast';
import WeeklyMenuEditor from './WeeklyMenuEditor';
import RecipeBuilderScreen from './RecipeBuilderScreen';
import { SegmentedControl } from './ui';
import { setLocalBypassMode } from '../db/core';

/* Banco de pruebas del creador de menús y de Biblioteca › Recetas (11-2026) —
   `/dev/menus`. Sin sesión de coach: dieta, alta y catálogo en memoria; el
   recetario es el índice empaquetado. Guardar no escribe (no hay sesión). */

// Sin sesión no hay Firestore: todo en modo local, que guarda en este navegador.
setLocalBypassMode(true);

const EMAIL = 'dev.atleta@example.com';
const DIETA: Diet = {
  id: 'd1', athleteId: EMAIL, name: 'Definición', meals: [],
  ...objetivoYCupo({ kcal: 2300, p: 165, g: 65, hc: Math.round((2300 - 165 * 4 - 65 * 9) / 4) }),
};
const ALTA = {
  athleteId: EMAIL, mealCount: 4, sex: 'male', weightKg: 82,
  meals: [
    { intakeType: 1, name: 'Desayuno', needsTupper: false },
    { intakeType: 2, name: 'Media mañana', needsTupper: false },
    { intakeType: 3, name: 'Comida', needsTupper: true },
    { intakeType: 5, name: 'Cena', needsTupper: false },
  ],
} as unknown as OnboardingData;
const PROGRAMACION: AthleteDietConfig = {
  athleteId: EMAIL, activeDietIds: ['d1'],
  weeklySchedule: { mon: 'd1', tue: 'd1', wed: 'd1', thu: 'd1', fri: 'd1', sat: 'd1', sun: 'd1' },
};
const fruta = (id: string, nombre: string, kcal: number, hc: number, gramos: number) =>
  ({ id, nombre, estado: 'listo' as const, porCien: { kcal, p: 0.8, hc, g: 0.3 }, unidad: { nombre: 'unidad', gramos } });
const CATALOGO = [fruta('platano', 'Plátano', 89, 22.8, 100), fruta('manzana', 'Manzana', 52, 13.8, 150), fruta('naranja', 'Naranja', 47, 11.8, 180)];

export default function MenusYRecetasDevHarness() {
  const [vista, setVista] = useState<'menu' | 'recetas'>('menu');
  const client = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
    c.setQueryData(['catalogoAlimentos'], CATALOGO);
    c.setQueryData(['recipeAccess', 'global'], { paquetes: [{ id: 'desayunos', nombre: 'Desayunos rápidos', recipeIds: [] }] });
    return c;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <div className="min-h-screen bg-bg text-ink p-4">
          <div className="mx-auto max-w-4xl space-y-4">
            <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">/dev/menus — datos de mentira · guardar no escribe</p>
            <SegmentedControl label="Qué pantalla ver" value={vista} onChange={v => setVista(v as 'menu' | 'recetas')}
              options={[{ value: 'menu', label: 'Creador de menús' }, { value: 'recetas', label: 'Biblioteca › Recetas' }]} />
            {vista === 'menu'
              ? <WeeklyMenuEditor athleteEmail={EMAIL} coachId="dev-coach" onboarding={ALTA} diets={[DIETA]} dietConfig={PROGRAMACION} nutritionConfig={null} onSaved={() => {}} onCancel={() => {}} />
              : <RecipeBuilderScreen coachId="dev-coach" />}
          </div>
        </div>
      </ToastProvider>
    </QueryClientProvider>
  );
}

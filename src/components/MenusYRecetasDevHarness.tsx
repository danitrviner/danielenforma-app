import React, { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AthleteDietConfig, Diet, OnboardingData } from '../types';
import { objetivoYCupo } from '../utils/macrosLegado';
import { ToastProvider } from '../hooks/useToast';
import WeeklyMenuEditor from './WeeklyMenuEditor';
import RecipeBuilderScreen from './RecipeBuilderScreen';
import MisCaprichosPanel from './MisCaprichosPanel';
import type { CaprichoDelAtleta } from '../utils/caprichos';
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
    { intakeType: 3, name: 'Comida', needsTupper: true },
    { intakeType: 4, name: 'Merienda', needsTupper: false },
    { intakeType: 5, name: 'Cena', needsTupper: false },
  ],
  // Lo que apuntaría el atleta en Perfil › Preferencias › Mis caprichos.
  caprichos: [
    { id: 'c1', nombre: 'Helado de vainilla', nota: 'el finde después de cenar', creadoEn: '2026-11-16',
      alimento: { id: 'capricho-helado-vainilla', nombre: 'Helado de vainilla', porCien: { kcal: 207, p: 3.5, hc: 24, g: 11 }, unidad: { nombre: 'bola', gramos: 60 } } },
    { id: 'c2', nombre: 'Un Magnum almendrado', nota: 'viernes con la peli', creadoEn: '2026-11-16' },
  ],
} as unknown as OnboardingData;
const PROGRAMACION: AthleteDietConfig = {
  athleteId: EMAIL, activeDietIds: ['d1'],
  weeklySchedule: { mon: 'd1', tue: 'd1', wed: 'd1', thu: 'd1', fri: 'd1', sat: 'd1', sun: 'd1' },
};
const fruta = (id: string, nombre: string, kcal: number, hc: number, gramos: number) =>
  ({ id, nombre, estado: 'listo' as const, porCien: { kcal, p: 0.8, hc, g: 0.3 }, unidad: { nombre: 'unidad', gramos } });
const alimento = (id: string, nombre: string, kcal: number, p: number, hc: number, g: number, unidad?: { nombre: string; gramos: number }) =>
  ({ id, nombre, estado: 'listo' as const, porCien: { kcal, p, hc, g }, ...(unidad ? { unidad } : {}) });
const CATALOGO = [
  fruta('platano', 'Plátano', 89, 22.8, 100), fruta('manzana', 'Manzana', 52, 13.8, 150), fruta('naranja', 'Naranja', 47, 11.8, 180),
  // Caprichos y postres para probar el «extra fijo» de la ingesta a medida.
  alimento('choco85', 'Chocolate negro 85 %', 600, 9, 20, 50, { nombre: 'onza', gramos: 10 }),
  alimento('helado', 'Helado de vainilla', 207, 3.5, 24, 11, { nombre: 'bola', gramos: 60 }),
  alimento('galleta', 'Galleta María', 440, 7, 74, 12, { nombre: 'galleta', gramos: 6 }),
  alimento('natillas', 'Natillas de vainilla', 120, 3.2, 17, 4, { nombre: 'tarrina', gramos: 125 }),
  alimento('yogurgriego', 'Yogur griego natural', 115, 4, 4, 9.5, { nombre: 'yogur', gramos: 125 }),
  alimento('miel', 'Miel', 304, 0.3, 82, 0),
  alimento('crema', 'Crema de cacahuete', 600, 25, 12, 50),
  // Lo que salía antes al abrir el extra sin buscar y no es ningún capricho.
  alimento('alubias', 'Alubias blancas cocidas', 100, 7, 14, 0.5),
  alimento('ajos', 'Ajos tiernos', 40, 2, 8, 0.3),
  alimento('mermelada-albahaca', 'Mermelada de tomate y albahaca', 190, 0.5, 47, 0),
];

export default function MenusYRecetasDevHarness() {
  const [vista, setVista] = useState<'menu' | 'recetas' | 'caprichos'>('menu');
  const [caprichos, setCaprichos] = useState<CaprichoDelAtleta[]>(ALTA.caprichos ?? []);
  const client = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
    c.setQueryData(['catalogoAlimentos'], CATALOGO);
    c.setQueryData(['recipeAccess', 'global'], { paquetes: [{ id: 'desayunos', nombre: 'Desayunos rápidos', recipeIds: [] }, { id: 'meriendas', nombre: 'Meriendas dulces', recipeIds: [] }] });
    return c;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <div className="min-h-screen bg-bg text-ink p-4">
          <div className="mx-auto max-w-4xl space-y-4">
            <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">/dev/menus — datos de mentira · guardar no escribe</p>
            <SegmentedControl label="Qué pantalla ver" value={vista} onChange={v => setVista(v as 'menu' | 'recetas' | 'caprichos')}
              options={[{ value: 'menu', label: 'Creador de menús' }, { value: 'recetas', label: 'Biblioteca › Recetas' }, { value: 'caprichos', label: 'Mis caprichos (atleta)' }]} />
            {vista === 'menu'
              ? <WeeklyMenuEditor athleteEmail={EMAIL} coachId="dev-coach" onboarding={{ ...ALTA, caprichos }} diets={[DIETA]} dietConfig={PROGRAMACION} nutritionConfig={null} onSaved={() => {}} onCancel={() => {}} />
              : vista === 'caprichos'
                ? <div className="max-w-md rounded-surface border border-hairline bg-surface p-5"><MisCaprichosPanel athleteEmail={EMAIL} caprichos={caprichos} onSaved={setCaprichos} /></div>
                : <RecipeBuilderScreen coachId="dev-coach" />}
          </div>
        </div>
      </ToastProvider>
    </QueryClientProvider>
  );
}

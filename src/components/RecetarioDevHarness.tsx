import React, { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AthleteDietConfig, Diet, DietCompletionLog, OnboardingData, Recipe, UserProfile } from '../types';
import RecipesScreen from './RecipesScreen';
import RecetarioDescubrir from './RecetarioDescubrir';
import RecetasDelAtletaPanel from './RecetasDelAtletaPanel';
import { cargarIndiceRecetas } from '../dbService';
import { esPlatoDelRecetario } from '../db/recetasHidratacion';
import { accesoGlobalKey, reglasDeRecetaKey } from '../hooks/useReglasDeReceta';
import { SegmentedControl } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de Nutrición › Recetas (portada «Descubrir») — ruta
   `/dev/recetario`, solo en desarrollo (podada en producción, ver App.tsx).

   Este repo no tiene sesión de atleta: sin esto la única forma de mirar la
   pantalla es desplegar y entrar con una cuenta real. Todo lo que RecipesScreen
   lee se siembra en la caché de react-query con `staleTime: Infinity`, así que
   ninguna LECTURA sale hacia Firestore; el recetario es el índice de verdad
   (`public/recetas-indice.json`). Las ESCRITURAS (marcar favorita) lo intentan
   y caen a local al no haber sesión.

   La pestaña «Usar receta» pinta la misma portada como la monta el selector de
   Mi plan: tocar una receta la «usa» en vez de abrirla. «Coach» es el panel
   del coach con las recetas de ese atleta (tablero Disponibles → En su plan).
   ═══════════════════════════════════════════════════════════════════════════ */

const EMAIL = 'dev.atleta@example.com';
const PERFIL = { userId: 'dev', email: EMAIL, displayName: 'Gonzalo Miranda', role: 'client' } as UserProfile;

// Recetas reales del índice, para las filas del coach y de «las que más haces».
const TORTITAS = '3ca80fe0-dbd2-5d52-9c9d-454cab2a289a';
const SALMON = 'df6e5df4-bed9-43f1-9498-1a89044b0e41';
const POKE = 'd1526fb3-159b-4d2d-9599-1eeb8b5d02b5';
const LENTEJAS = 'd2fa6409-ad76-439c-9346-5ad23ed4468f';
const TOSTADA = 'c5ad87d9-69c1-4c2f-a516-9c38e46a45fb';

const pad = (n: number) => String(n).padStart(2, '0');
function haceDias(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const DIETA: Diet = {
  id: 'dieta_dev', athleteId: EMAIL, name: 'Definición', budget: { HC: 8, PROT: 7, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 },
  meals: [
    { id: 'm1', name: 'Desayuno', slot: 1, items: [], target: { HC: 2, PROT: 1.5, GRASA: 1, MIX_HC: 0, MIX_GRASA: 0 } },
    { id: 'm2', name: 'Comida', slot: 3, items: [], target: { HC: 2, PROT: 1.5, GRASA: 1, MIX_HC: 0, MIX_GRASA: 0 } },
    { id: 'm3', name: 'Merienda', slot: 4, items: [], target: { HC: 1.5, PROT: 1.5, GRASA: 0.5, MIX_HC: 0, MIX_GRASA: 0 } },
    { id: 'm4', name: 'Cena', slot: 5, items: [], target: { HC: 2, PROT: 2, GRASA: 1, MIX_HC: 0, MIX_GRASA: 0 } },
  ],
};

function dia(n: number, recetas: string[]): DietCompletionLog {
  return {
    id: `${EMAIL}_${haceDias(n)}`, athleteId: EMAIL, date: haceDias(n), dietId: DIETA.id,
    meals: [{ id: 'm2', name: 'Comida', items: recetas.map(id => ({ foodLabel: 'x', category: 'HC', quantity: 1, originRecipeId: id })) }],
    doneItemIds: recetas.map((_, i) => `m2_${i}`),
  } as DietCompletionLog;
}

const ONBOARDING = {
  likedFoods: ['pollo', 'arroz', 'huevo'], dislikedFoods: ['champiñón'], allergies: [], cookingMaxTime: 15, mealCount: 4,
} as unknown as OnboardingData;

function sembrar(qc: QueryClient) {
  const fijo = (key: readonly unknown[], data: unknown) => qc.setQueryData(key, data);
  fijo(['recipes', PERFIL.userId], []);
  fijo(['recipeFavorites', EMAIL], { athleteId: EMAIL, recipeIds: [TOSTADA] });
  fijo(['athleteNutritionConfig', EMAIL], { athleteId: EMAIL, enabledModes: ['OMNIVORO'] });
  fijo(['onboarding', EMAIL], { likedFoods: ['pollo'], dislikedFoods: [], allergies: [] });
  fijo(['dietsForAthlete', EMAIL], [DIETA]);
  fijo(['athleteDietConfig', EMAIL], { athleteId: EMAIL, activeDietIds: [DIETA.id] } as AthleteDietConfig);
  fijo(reglasDeRecetaKey(EMAIL), { athleteId: EMAIL, reglas: [], recomendadas: [POKE, SALMON, LENTEJAS] });
  fijo(accesoGlobalKey, { paquetes: [{ id: 'cenas', nombre: 'Cenas rápidas', recipeIds: [POKE, SALMON, TOSTADA] }] });
  const d = new Date(); d.setDate(d.getDate() - 30);
  const desde = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  fijo(['dietCompletionLogs', EMAIL, 'desde', desde], [
    dia(1, [TORTITAS]), dia(2, [TORTITAS, TOSTADA]), dia(4, [TORTITAS]), dia(5, [TOSTADA]), dia(8, [SALMON]),
  ]);
}

function SelectorDeComida() {
  const [pool, setPool] = useState<Recipe[]>([]);
  const [usada, setUsada] = useState<string | null>(null);
  useEffect(() => { cargarIndiceRecetas().then(rs => setPool(rs.filter(esPlatoDelRecetario))); }, []);
  const favoritas = useMemo(() => new Set([TOSTADA]), []);
  return (
    <div className="space-y-3">
      <p className="font-mono text-caption text-ink-2 uppercase">Usar receta · Comida</p>
      {usada && <p className="font-sans text-label text-success">Usada: {usada}</p>}
      <RecetarioDescubrir
        pool={pool}
        estado={pool.length ? 'listo' : 'cargando'}
        favoritas={favoritas}
        onElegir={r => setUsada(r.name)}
        verbo="Usar"
        cupo={{ titulo: 'Encajan en comida', cupo: { kcal: 549, p: 37.5, hc: 50, g: 11 } }}
      />
    </div>
  );
}

export default function RecetarioDevHarness() {
  const qc = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    sembrar(c);
    return c;
  }, []);
  const [modo, setModo] = useState<'recetario' | 'selector' | 'coach'>('recetario');
  return (
    <QueryClientProvider client={qc}>
      <div className="min-h-screen bg-bg text-ink px-4 py-4 max-w-5xl mx-auto space-y-4">
        <SegmentedControl
          label="Qué pantalla ver"
          value={modo}
          onChange={v => setModo(v as 'recetario' | 'selector' | 'coach')}
          options={[{ value: 'recetario', label: 'Recetario' }, { value: 'selector', label: 'Usar receta' }, { value: 'coach', label: 'Coach' }]}
        />
        {modo === 'recetario' ? <RecipesScreen profile={PERFIL} />
          : modo === 'selector' ? <SelectorDeComida />
          : <RecetasDelAtletaPanel
              athleteEmail={EMAIL}
              diets={[DIETA]}
              dietConfig={{ athleteId: EMAIL, activeDietIds: [DIETA.id] } as AthleteDietConfig}
              onboarding={ONBOARDING}
              nutritionConfig={null}
            />}
      </div>
    </QueryClientProvider>
  );
}

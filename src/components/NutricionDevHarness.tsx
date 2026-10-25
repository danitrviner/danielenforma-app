import React, { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserProfile, Diet, MealItem, Recipe, DietCompletionLog, AthleteDietConfig } from '../types';
import type { AlimentoCatalogo } from '../utils/catalogoAlimentos';
import type { EntradaIndiceOff } from '../utils/productoOff';
import { reglasDeRecetaKey, accesoGlobalKey } from '../hooks/useReglasDeReceta';
import { SegmentedControl } from './ui';
import NutritionScreen from './NutritionScreen';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas del Diario de nutrición del ATLETA — ruta `/dev/nutricion`,
   solo en desarrollo (podado en producción, ver App.tsx). Mismo motivo que
   `/dev/revision`: este repo no tiene sesión de atleta.

   Todo vive en la caché de react-query, sembrada a mano con `staleTime:
   Infinity`. Las escrituras (guardar el día) fallan sin sesión y no llegan a
   ningún sitio.
   ═══════════════════════════════════════════════════════════════════════════ */

const EMAIL = 'dev.atleta@example.com';
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const PERFIL = { userId: 'dev', email: EMAIL, displayName: 'Marcos Dev', role: 'client' } as UserProfile;

const banco = (id: string, category: MealItem['category'], label: string): MealItem => ({ id, mode: 'OMNIVORO', category, label });
const FOOD_ITEMS: MealItem[] = [
  banco('f1', 'HC', '40g pan (de molde, tostado, con o sin semillas...)'),
  banco('f2', 'HC', '100g garbanzo cocido'),
  banco('f3', 'PROT', '100g carne roja sin grasa (magra)'),
  banco('f4', 'GRASA', '10g (1 cuchara) aceite de oliva virgen extra'),
  banco('f5', 'GRASA', '15g crema de frutos secos (cacahuete, pistacho, almendras...)'),
  banco('f6', 'PROT', '100g pechuga de pollo'),
  { ...banco('f7', 'HC', '30g avena'), mode: 'VEGANO' },
];
const PROPIOS: MealItem[] = [
  { id: 'p1', mode: 'OMNIVORO', category: 'PROT', label: '30g Protein crunchy', personal: true, porCien: { kcal: 461, prot: 49, hc: 24, grasa: 22 }, gramosPorIntercambio: 30 },
];

const DIETA: Diet = {
  id: 'dieta_dev', athleteId: EMAIL, name: 'Definición 2.330 kcal',
  budget: { HC: 13.2, PROT: 3.8, GRASA: 6.4, MIX_HC: 0, MIX_GRASA: 0 },
  meals: [
    { id: 'm_des', name: 'Desayuno', items: [{ category: 'HC', foodLabel: '40g pan (de molde, tostado, con o sin semillas...)', quantity: 1, baseGrams: 40 }, { category: 'GRASA', foodLabel: '10g (1 cuchara) aceite de oliva virgen extra', quantity: 1, baseGrams: 10 }], target: { HC: 3, PROT: 1, GRASA: 1.5, MIX_HC: 0, MIX_GRASA: 0 } },
    { id: 'm_com', name: 'Comida', items: [{ category: 'PROT', foodLabel: '100g carne roja sin grasa (magra)', quantity: 1.5, baseGrams: 100 }, { category: 'HC', foodLabel: '100g garbanzo cocido', quantity: 2, baseGrams: 100 }], target: { HC: 5, PROT: 1.4, GRASA: 2, MIX_HC: 0, MIX_GRASA: 0 } },
    { id: 'm_cen', name: 'Cena', items: [], target: { HC: 4, PROT: 1, GRASA: 2, MIX_HC: 0, MIX_GRASA: 0 } },
    { id: 'm_sna', name: 'Snacks', items: [], target: { HC: 1.2, PROT: 0.4, GRASA: 0.9, MIX_HC: 0, MIX_GRASA: 0 } },
  ],
} as Diet;

const RECETAS: Recipe[] = [
  {
    id: 'r_tostada', ownerId: 'dev', name: 'Tostada con aceite y jamón', categories: [], ingredients: [], extras: [], steps: [], kcal: 290,
    ingredientsText: [{ name: 'Pan integral', quantity: 60 }, { name: 'Aceite de oliva', quantity: 5 }, { name: 'Jamón serrano', quantity: 30 }],
    vinculo: {
      calculadoEn: '2026-10-01',
      ingredientes: [
        { n: 0, alimentoId: 'pan', gramos: 60, min: 30, max: 90, porCien: { kcal: 250, p: 9, hc: 45, g: 3 } },
        { n: 1, alimentoId: 'aceite', gramos: 5, min: 3, max: 10, porCien: { kcal: 900, p: 0, hc: 0, g: 100 } },
        { n: 2, alimentoId: 'jamon', gramos: 30, min: 20, max: 50, porCien: { kcal: 240, p: 31, hc: 0, g: 13 } },
      ],
    },
  },
  { id: 'r_bowl', ownerId: 'dev', name: 'Bowl de pollo y arroz', categories: [], ingredients: [], extras: [], steps: [], exchanges: { HC: 3, PROT: 2, GRASA: 1 }, kcal: 600 },
];

const CATALOGO: AlimentoCatalogo[] = [
  { id: 'arroz', nombre: 'Arroz blanco', estado: 'cocido', porCien: { kcal: 130, p: 2.7, hc: 28, g: 0.3, fibra: 0.4 }, fuente: 'BEDCA' },
  { id: 'platano', nombre: 'Plátano', porCien: { kcal: 94, p: 1.2, hc: 20, g: 0.3, fibra: 2.6, azucares: 17 }, unidad: { nombre: 'unidad mediana', gramos: 120 }, fuente: 'BEDCA' },
];
const OFF: EntradaIndiceOff[] = [{ c: '8480000123456', n: 'Saucee', b: 'Action', t: 'saucee action' }];

function dia(n: number, items: DietCompletionLog['meals'][number]['items'], comida = 'm_des'): DietCompletionLog {
  return {
    id: `${EMAIL}_${haceDias(n)}`, athleteId: EMAIL, date: haceDias(n), dietId: DIETA.id,
    meals: [{ id: comida, name: 'Desayuno', items }], doneItemIds: items.map((_, i) => `${comida}_${i}`), budget: DIETA.budget,
  } as DietCompletionLog;
}

function sembrar(qc: QueryClient) {
  const fijo = (key: readonly unknown[], data: unknown) => qc.setQueryData(key, data);
  fijo(['dietsForAthlete', EMAIL], [DIETA]);
  fijo(['athleteDietConfig', EMAIL], { athleteId: EMAIL, activeDietIds: [DIETA.id] } as AthleteDietConfig);
  fijo(['athleteNutritionConfig', EMAIL], { athleteId: EMAIL, enabledModes: ['OMNIVORO'] });
  fijo(['nutritionProgram', EMAIL], null);
  fijo(['foodItems'], FOOD_ITEMS);
  fijo(['alimentosPersonales', EMAIL], PROPIOS);
  fijo(['recipes', PERFIL.userId], RECETAS);
  fijo(['recipeFavorites', EMAIL], { athleteId: EMAIL, recipeIds: [] });
  fijo(['onboarding', EMAIL], { allergies: [], dislikedFoods: [], likedFoods: [], meals: [] });
  fijo(reglasDeRecetaKey(EMAIL), { athleteId: EMAIL, reglas: [] });
  fijo(accesoGlobalKey, null);
  fijo(['catalogoAlimentos'], CATALOGO);
  fijo(['offIndice'], OFF);
  fijo(['offProducto', OFF[0].c], { c: OFF[0].c, n: 'Saucee', b: 'Action', k: 298, p: 1.2, h: 12, g: 27, az: 9, sat: 3.1, sal: 1.8, s: 15 });
  for (let n = 0; n <= 8; n++) fijo(['dietCompletionLog', EMAIL, haceDias(-n)], null);
  const desde = haceDias(30);
  const historial = [
    dia(1, [{ category: 'GRASA', foodLabel: '15g crema de frutos secos (cacahuete, pistacho, almendras...)', quantity: 1, baseGrams: 15, origen: { tipo: 'catalogo', id: 'f5' } }]),
    dia(2, [{ category: 'HC', foodLabel: '100g garbanzo cocido', quantity: 1, baseGrams: 100, origen: { tipo: 'catalogo', id: 'f2' } }, { category: 'GRASA', foodLabel: 'Saucee', quantity: 1, lineaId: 's1', gramos: 100, marca: 'Action', nutrientes: { kcal: 298, p: 1.2, hc: 12, g: 27 }, origen: { tipo: 'off', codigo: OFF[0].c } }]),
    dia(3, [{ category: 'HC', foodLabel: '40g pan (de molde, tostado, con o sin semillas...)', quantity: 1, baseGrams: 40, origen: { tipo: 'catalogo', id: 'f1' } }]),
  ];
  fijo(['dietCompletionLogs', EMAIL, 'desde', desde], historial);
  for (const log of historial) fijo(['dietCompletionLog', EMAIL, log.date], log);
}

export default function NutricionDevHarness() {
  const [modo, setModo] = useState<'macros' | 'intercambios'>(() => {
    try { return localStorage.getItem('enforma_diario_vista') === 'intercambios' ? 'intercambios' : 'macros'; } catch { return 'macros'; }
  });
  const [version, setVersion] = useState(0);
  const qc = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    sembrar(c);
    return c;
  }, []);
  return (
    <QueryClientProvider client={qc}>
      <div className="mx-auto min-h-screen max-w-xl space-y-4 bg-bg px-4 py-4 text-ink">
        <SegmentedControl
          label="Modo"
          value={modo}
          onChange={v => {
            try { localStorage.setItem('enforma_diario_vista', v); } catch { /* noop */ }
            setModo(v as 'macros' | 'intercambios');
            setVersion(x => x + 1);
          }}
          options={[{ value: 'macros', label: 'Calorías y macros' }, { value: 'intercambios', label: 'Intercambios' }]}
        />
        <div key={version}><NutritionScreen profile={PERFIL} /></div>
      </div>
    </QueryClientProvider>
  );
}

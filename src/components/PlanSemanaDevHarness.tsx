import { useState } from 'react';
import type { PlatoDelPlan, Recipe } from '../types';
import type { AlimentoCatalogo } from '../utils/catalogoAlimentos';
import { macrosDesdeGramos } from '../utils/macros';
import { macrosDeAlimento, objetivoDeLaSemana } from '../utils/planSemanal';
import { SegmentedControl } from './ui';
import PlanDeLaSemana, { type VariantePlan } from './nutrition/PlanDeLaSemana';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de «Mi semana» — ruta `/dev/plan-semana`, solo en
   desarrollo. Las dos variantes con el mismo plan de ejemplo, para que Dani
   elija; la elegida se fija en `VARIANTE_PLAN`. Nada se guarda.
   ═══════════════════════════════════════════════════════════════════════════ */

const CATALOGO: AlimentoCatalogo[] = [
  { id: 'avena', nombre: 'Copos de avena', porCien: { kcal: 372, p: 13.5, hc: 58.7, g: 7 } },
  { id: 'arroz', nombre: 'Arroz blanco', estado: 'crudo', porCien: { kcal: 354, p: 7, hc: 78, g: 0.9 } },
  { id: 'pechuga', nombre: 'Pechuga de pollo', estado: 'crudo', porCien: { kcal: 112, p: 23.5, hc: 0, g: 1.9 } },
  { id: 'yogur', nombre: 'Yogur proteico natural', porCien: { kcal: 60, p: 10, hc: 4, g: 0.2 }, unidad: { nombre: 'unidad', gramos: 200 } },
  { id: 'platano', nombre: 'Plátano', porCien: { kcal: 94, p: 1.2, hc: 20, g: 0.3 }, unidad: { nombre: 'unidad mediana', gramos: 120 } },
  { id: 'aceite', nombre: 'Aceite de oliva virgen extra', porCien: { kcal: 899, p: 0, hc: 0, g: 99.9 } },
  { id: 'nueces', nombre: 'Nueces', porCien: { kcal: 654, p: 15, hc: 7, g: 65 } },
];

const receta = (id: string, name: string, p: number, hc: number, g: number): Recipe => ({
  id, ownerId: 'recetas', name, categories: [], ingredients: [], extras: [], steps: [],
  macros: { prot: p, carb: hc, fat: g }, kcal: Math.round(p * 4 + hc * 4 + g * 9),
} as Recipe);

const RECETAS: Recipe[] = [
  receta('r1', 'Arroz con pollo al curry', 48, 85, 14),
  receta('r2', 'Lentejas estofadas con verduras', 30, 70, 12),
  receta('r3', 'Pasta con atún y tomate', 40, 90, 13),
  receta('r4', 'Garbanzos con espinacas y huevo', 28, 60, 16),
];

const desde = (r: Recipe) => macrosDesdeGramos(r.macros!.prot!, r.macros!.carb!, r.macros!.fat!);
const PLAN: PlatoDelPlan[] = [
  { id: 'a', nombre: RECETAS[0].name, origen: { tipo: 'receta', id: 'r1' }, macros: desde(RECETAS[0]), veces: 7, grupo: 'tanda' },
  { id: 'b', nombre: RECETAS[1].name, origen: { tipo: 'receta', id: 'r2' }, macros: desde(RECETAS[1]), veces: 7, grupo: 'tanda' },
  { id: 'c', nombre: 'Copos de avena', origen: { tipo: 'alimento', id: 'avena' }, gramos: 70, macros: macrosDeAlimento(CATALOGO[0].porCien, 70), veces: 7, grupo: 'cadaDia' },
  { id: 'd', nombre: 'Yogur proteico natural', origen: { tipo: 'alimento', id: 'yogur' }, gramos: 200, macros: macrosDeAlimento(CATALOGO[3].porCien, 200), veces: 7, grupo: 'cadaDia' },
  { id: 'e', nombre: 'Plátano', origen: { tipo: 'alimento', id: 'platano' }, gramos: 120, macros: macrosDeAlimento(CATALOGO[4].porCien, 120), veces: 7, grupo: 'cadaDia' },
  { id: 'g', nombre: 'Nueces', origen: { tipo: 'alimento', id: 'nueces' }, gramos: 30, macros: macrosDeAlimento({ kcal: 654, p: 15, hc: 7, g: 65 }, 30), veces: 7, grupo: 'cadaDia' },
  { id: 'f', nombre: 'Cena fuera (pizza)', origen: { tipo: 'receta', id: 'pizza' }, macros: macrosDesdeGramos(45, 140, 40), veces: 1, grupo: 'suelto' },
];

const ENTRENO = macrosDesdeGramos(170, 280, 70);
const DESCANSO = macrosDesdeGramos(170, 200, 70);
const { objetivo, dias } = objetivoDeLaSemana([ENTRENO, DESCANSO, ENTRENO, DESCANSO, ENTRENO, DESCANSO, DESCANSO]);

export default function PlanSemanaDevHarness() {
  const [variante, setVariante] = useState<VariantePlan>('grupos');
  const [platos, setPlatos] = useState<PlatoDelPlan[]>(PLAN);
  return (
    <div className="min-h-screen bg-bg px-4 py-6">
      <div className="mx-auto max-w-[440px] space-y-4">
        <header className="space-y-2">
          <h1 className="font-sans text-title-l font-bold text-ink">Mi semana — 2 variantes</h1>
          <p className="font-sans text-body-s text-ink-2">Nutrición de quien cocina en tandas. Prueba a cambiar las veces, quitar o añadir.</p>
          <SegmentedControl label="Variante" value={variante} onChange={v => setVariante(v as VariantePlan)}
            options={[{ value: 'grupos', label: 'A · Por grupos' }, { value: 'lista', label: 'B · Lista + resumen abajo' }]} />
          <button type="button" onClick={() => setPlatos(PLAN)} className="font-sans text-caption text-ink-3 underline">Volver al plan de ejemplo</button>
        </header>
        <PlanDeLaSemana objetivo={objetivo} dias={dias} platos={platos} onCambiar={setPlatos}
          catalogo={CATALOGO} recetas={RECETAS} variante={variante} etiquetaSemana="Semana del 27 oct" />
      </div>
    </div>
  );
}

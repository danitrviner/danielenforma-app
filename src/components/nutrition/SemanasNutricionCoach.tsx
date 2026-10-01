import React, { useMemo, useState } from 'react';
import { Icon, Button, SegmentedControl, Select } from '../ui';
import type { Diet, NutritionProgram, MacroAjustable, WeekDay, Suplemento, BodyweightLog, ReglaDePeso, DietCompletionLog } from '../../types';
import { SLOT_LABEL, resolveSlots } from '../../utils/mealDistribution';
import {
  totalSemanas, faseDeLaSemana, ajustesDeLaSemana, aplicarAjustes, kcalDeDieta, kcalDeComida, macrosDeComida, macrosDeCupo, kcalPorSemana, programarAjuste,
  quitarCambiosNutricion, describirAjuste, semanaDelPrograma, NOMBRE_DIA, suplementosDeLaSemana,
  salidaDeDeficit, descansosDeDieta, bajadaProgresiva, evaluarReglasDePeso, proteinaGKgPorSemana, habitosPorSemana,
} from '../../utils/semanasNutricion';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { weeklyRealWeightKg } from '../../utils/nutritionPeriodization';
import Sheet from '../ui/Sheet';

const MACROS: { cat: MacroAjustable; label: string }[] = [
  { cat: 'HC', label: 'Hidratos' }, { cat: 'PROT', label: 'Proteína' }, { cat: 'GRASA', label: 'Grasa' },
];
const DIAS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Barra de semanas de la periodización nutricional: cada semana con su fase y
 *  sus kcal/día, y en la semana elegida la dieta de su fase con los ajustes
 *  que se programen (desde esa semana o solo esa), mantenimiento, comidas
 *  libres y suplementación. Todo se guarda en el NutritionProgram. */
export default function SemanasNutricionCoach({ program, diets, onGuardar, pesos = [], mantenimientoKcal = null, registros = [], semanaDelMenu }: {
  /** Días registrados del atleta (para la media de agua y verdura). */
  registros?: DietCompletionLog[];
  /** Semana con la que se generó el menú publicado (0 = antes de esto; undefined = sin menú). */
  semanaDelMenu?: number;
  program: NutritionProgram;
  diets: Diet[];
  onGuardar: (p: NutritionProgram) => void;
  /** Pesos del atleta, para las reglas por peso y la proteína por kilo. */
  pesos?: BodyweightLog[];
  /** Mantenimiento estimado, objetivo por defecto de la salida de déficit. */
  mantenimientoKcal?: number | null;
}) {
  const n = totalSemanas(program);
  const hoy = semanaDelPrograma(program, hoyIsoLocal());
  const [semana, setSemana] = useState(() => Math.min(Math.max(1, hoy), Math.max(1, n)));
  const [solo, setSolo] = useState(false);
  const [varias, setVarias] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [pila, setPila] = useState<NutritionProgram[]>([]);
  const [libre, setLibre] = useState<{ dia: WeekDay; slot: string; hasta: string }>({ dia: 'sat', slot: '5', hasta: '' });
  const [sup, setSup] = useState<{ nombre: string; dosis: string; momento: string; hasta: string }>({ nombre: '', dosis: '', momento: '', hasta: '' });
  const [ciclo, setCiclo] = useState(() => ({ entreno: String(program.ciclado?.entreno ?? 2), descanso: String(program.ciclado?.descanso ?? -1) }));
  const [pasos, setPasos] = useState('');
  const [progAbierto, setProgAbierto] = useState(false);
  const [salida, setSalida] = useState(() => String(Math.round((mantenimientoKcal ?? 2500) / 50) * 50));
  const [descanso, setDescanso] = useState({ cada: '6', hasta: '' });
  const [bajada, setBajada] = useState({ cada: '2', cat: 'HC', suelo: '1600' });
  const [regla, setRegla] = useState({ tipo: 'bajar', ritmo: '0.3', semanas: '2', cat: 'HC', cantidad: '1' });
  const [ignoradas, setIgnoradas] = useState<Set<string>>(new Set());
  const [minimos, setMinimos] = useState({ agua: String(program.minimos?.aguaL ?? ''), raciones: String(program.minimos?.raciones ?? '') });

  const kcal = useMemo(() => kcalPorSemana(program, diets), [program, diets]);
  const max = Math.max(1, ...kcal.map(k => k ?? 0));
  const min = Math.min(...kcal.filter((k): k is number => k != null), max) * 0.85;
  const mant = program.semanasMantenimiento ?? [];
  const pesoActual = pesos.length > 0 ? pesos[pesos.length - 1].weight : null;
  const protMin = program.proteinaMinGKg ?? 1.6;
  const habitos = useMemo(() => habitosPorSemana(program, registros), [program, registros]);
  const minA = program.minimos?.aguaL;
  const minR = program.minimos?.raciones;
  const noLlega = (s: number) => {
    const h = habitos[s];
    return !!h && ((minA != null && h.aguaL != null && h.aguaL < minA) || (minR != null && h.raciones != null && h.raciones < minR));
  };
  const protPorSemana = useMemo(() => proteinaGKgPorSemana(program, diets, pesoActual), [program, diets, pesoActual]);
  const propuestasPeso = useMemo(
    () => evaluarReglasDePeso(program, weeklyRealWeightKg(pesos, program.startDate, n), hoy)
      .filter(x => !ignoradas.has(`${x.regla.id}_${x.semana}`)),
    [program, pesos, n, hoy, ignoradas],
  );

  const guardar = (p: NutritionProgram) => { setPila(prev => [...prev.slice(-19), program]); onGuardar(p); };
  const deshacer = () => {
    const prev = pila[pila.length - 1];
    if (!prev) return;
    setPila(pila.slice(0, -1));
    onGuardar(prev);
  };

  if (n === 0) return null;

  const fase = faseDeLaSemana(program, semana);
  const dietaBase = fase ? diets.find(d => d.id === fase.fase.dietId) : undefined;
  const esMant = mant.includes(semana);
  const dietaSemana = dietaBase ? aplicarAjustes(dietaBase, ajustesDeLaSemana(program, semana), { mantenimiento: esMant }) : undefined;
  const slots = dietaSemana ? resolveSlots(dietaSemana.meals) : [];
  const empiezan = new Set((program.cambiosSemana ?? []).map(c => c.semana));

  const ajustar = (slot: number, cat: MacroAjustable, delta: number) =>
    guardar({ ...program, cambiosSemana: programarAjuste(program, semana, solo, { slot, cat, delta }) });
  const marcarMant = (semanas: number[], activar: boolean) => {
    const lista = Array.from(new Set<number>(activar ? [...mant, ...semanas] : mant.filter(s => !semanas.includes(s)))).sort((a, b) => a - b);
    guardar({ ...program, semanasMantenimiento: lista.length > 0 ? lista : undefined });
  };
  const quitar = (semanas: number[]) => guardar({
    ...program,
    cambiosSemana: quitarCambiosNutricion(program, semanas),
    semanasMantenimiento: mant.filter(s => !semanas.includes(s)).length > 0 ? mant.filter(s => !semanas.includes(s)) : undefined,
  });

  // Colores de la banda de fases: alternos, para ver dónde empieza cada una.
  const fases = program.phases.map((f, i) => ({ f, i, semanas: f.weeks }));
  const selOrd = [...sel].sort((a, b) => a - b);

  // Lo programado, para la lista de abajo.
  const programado: { semana: number; texto: string; quitar: () => void; tono: 'cambio' | 'esp' }[] = [
    ...(program.cambiosSemana ?? []).flatMap(c => c.ajustes.map(a => ({
      semana: c.semana, tono: 'cambio' as const,
      texto: `${c.solo ? 'Solo' : 'Desde'} S${c.semana} · ${describirAjuste(a)}`,
      quitar: () => guardar({ ...program, cambiosSemana: programarAjuste(program, c.semana, !!c.solo, { ...a, delta: -a.delta }) }),
    }))),
    ...mant.map(s => ({ semana: s, tono: 'esp' as const, texto: `Solo S${s} · Mantenimiento: +1 hidrato en cada comida`, quitar: () => marcarMant([s], false) })),
    ...(program.comidasLibres ?? []).map((c, i) => ({
      semana: c.desde, tono: 'cambio' as const,
      texto: `Desde S${c.desde}${c.hasta ? ` hasta S${c.hasta}` : ''} · ${SLOT_LABEL[c.slot] ?? 'Comida'} del ${NOMBRE_DIA[c.dia]} libre`,
      quitar: () => guardar({ ...program, comidasLibres: (program.comidasLibres ?? []).filter((_, j) => j !== i) }),
    })),
    ...(program.suplementos ?? []).map(x => ({
      semana: x.desde ?? 1, tono: 'cambio' as const,
      texto: `${x.desde ? `Desde S${x.desde}` : 'Todo el programa'}${x.hasta ? ` hasta S${x.hasta}` : ''} · ${[x.nombre, x.dosis, x.momento].filter(Boolean).join(' · ')}`,
      quitar: () => guardar({ ...program, suplementos: (program.suplementos ?? []).filter(y => y.id !== x.id) }),
    })),
    ...(program.pasosPorSemana ?? []).map(x => ({
      semana: x.semana, tono: 'cambio' as const,
      texto: `Desde S${x.semana} · ${x.pasos.toLocaleString('es-ES')} pasos al día`,
      quitar: () => {
        const lista = (program.pasosPorSemana ?? []).filter(y => y.semana !== x.semana);
        guardar({ ...program, pasosPorSemana: lista.length > 0 ? lista : undefined });
      },
    })),
    ...(program.ciclado ? [{
      semana: program.ciclado.desde, tono: 'cambio' as const,
      texto: `Desde S${program.ciclado.desde} · Entreno ${program.ciclado.entreno > 0 ? '+' : ''}${program.ciclado.entreno} HC, descanso ${program.ciclado.descanso > 0 ? '+' : ''}${program.ciclado.descanso} HC`,
      quitar: () => { const { ciclado: _c, ...resto } = program; guardar(resto as NutritionProgram); },
    }] : []),
  ].sort((a, b) => a.semana - b.semana);

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 space-y-3">
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
        <p className="font-sans font-bold text-body-s text-ink flex items-center gap-2">
          <Icon name="calendar_month" size="s" className="text-accent-ink" />
          Semanas de la periodización
        </p>
        <p className="font-mono text-caption text-ink-3">{n} semanas · barras = kcal/día</p>
        <div className="ml-auto flex items-center gap-2">
          {pila.length > 0 && <Button size="s" variant="ghost" icon="undo" onClick={deshacer}>Deshacer</Button>}
          <Button size="s" variant="ghost" icon="trending_up" onClick={() => setProgAbierto(true)}>Progresiones</Button>
          <button
            type="button"
            aria-pressed={varias}
            onClick={() => { setVarias(v => !v); setSel(new Set(varias ? [] : [semana])); }}
            className={`inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1.5 font-mono text-caption font-bold uppercase tracking-wider transition-colors ${
              varias ? 'border-accent text-accent-ink bg-accent/12' : 'border-hairline text-ink-2 hover:text-ink hover:border-strong'}`}
          >
            <Icon name="done_all" size="s" />Varias semanas
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-max space-y-1">
          {/* Banda de fases */}
          <div className="flex gap-1.5">
            {fases.map(({ f, i, semanas }) => (
              <div key={f.id} style={{ width: `calc(${semanas} * 3.5rem + ${semanas - 1} * 0.375rem)` }}
                className={`rounded-control px-2 py-1 font-mono text-caption font-bold truncate ${i % 2 === 0 ? 'bg-accent/12 text-accent-ink' : 'bg-inset text-ink-2'}`}
                title={`${f.name} · ${f.weeks} semanas`}>
                {f.name}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Semanas de la periodización">
            {Array.from({ length: n }, (_, k) => k + 1).map(s => {
              const activa = varias ? sel.has(s) : semana === s;
              const k = kcal[s];
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={activa}
                  title={`Semana ${s}${k ? ` · ${k.toLocaleString('es-ES')} kcal/día` : ''}${protPorSemana[s] != null ? ` · ${protPorSemana[s]!.toLocaleString('es-ES')} g/kg de proteína${protPorSemana[s]! < protMin ? ' (por debajo del mínimo)' : ''}` : ''}${mant.includes(s) ? ' · Mantenimiento' : ''}${s === hoy ? ' · esta semana' : ''}`}
                  onClick={() => {
                    if (!varias) { setSemana(s); return; }
                    setSel(prev => { const x = new Set(prev); if (x.has(s)) x.delete(s); else x.add(s); return x; });
                  }}
                  className={`relative w-14 flex flex-col items-center gap-1 rounded-control border px-1 pt-1.5 pb-1 transition-colors ${
                    activa ? `bg-accent/12 border-accent ${varias ? 'border-dashed' : ''}` : 'bg-bg border-hairline hover:border-strong'}`}
                >
                  <span className="absolute top-1 right-1 flex gap-0.5" aria-hidden>
                    {empiezan.has(s) && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    {protPorSemana[s] != null && protPorSemana[s]! < protMin && <span className="w-1.5 h-1.5 rounded-full bg-danger" />}
                    {noLlega(s) && <span className="w-1.5 h-1.5 rounded-full bg-warning" />}
                  </span>
                  <span className={`font-mono text-caption font-bold ${s === hoy ? 'text-accent-ink underline' : 'text-ink'}`}>S{s}</span>
                  <span className="relative w-5 h-[30px] flex items-end justify-center" aria-hidden>
                    <span className={`absolute bottom-0 w-full rounded-t-[4px] ${mant.includes(s) ? 'bg-info/60' : activa ? 'bg-accent' : 'bg-strong'}`}
                      style={{ height: k ? Math.max(4, Math.round(30 * (k - min) / Math.max(1, max - min))) : 3 }} />
                  </span>
                  <span className="font-mono text-[10px] leading-none text-ink-3 tabular-nums">{k ? k.toLocaleString('es-ES') : '—'}</span>
                  {mant.includes(s) && <span className="font-mono text-[9px] leading-[11px] font-bold text-info border border-info rounded-[5px] px-0.5">M</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {semanaDelMenu !== undefined && kcal[hoy] != null && (semanaDelMenu === 0
        ? (ajustesDeLaSemana(program, hoy).length > 0 || mant.includes(hoy))
        : kcal[semanaDelMenu] !== kcal[hoy]) && (
        <div className="flex items-start gap-2 rounded-surface border border-info/40 bg-info/8 px-4 py-3">
          <Icon name="restaurant" size="s" className="text-info mt-0.5" />
          <p className="font-sans text-label text-ink">
            {semanaDelMenu === 0
              ? 'El menú semanal publicado no tiene en cuenta los ajustes por semana.'
              : `El menú semanal publicado es de la semana ${semanaDelMenu} y esta semana la dieta cambia (${kcal[semanaDelMenu]?.toLocaleString('es-ES')} → ${kcal[hoy]?.toLocaleString('es-ES')} kcal).`}
            {' '}Regenéralo desde «Menú semanal» eligiendo la semana {hoy}.
          </p>
        </div>
      )}

      {propuestasPeso.map(x => (
        <div key={`${x.regla.id}_${x.semana}`} className="flex items-start gap-3 flex-wrap rounded-surface border border-warning/40 bg-warning/8 px-4 py-3">
          <Icon name="lightbulb" size="s" className="text-warning mt-0.5" />
          <p className="flex-1 min-w-[14rem] font-sans text-label text-ink"><span className="font-bold">Regla por peso:</span> {x.texto}</p>
          <div className="flex gap-2">
            <Button size="s" icon="done_all" onClick={() => guardar({ ...program, cambiosSemana: programarAjuste(program, x.semana, false, x.ajuste) })}>Aplicar</Button>
            <Button size="s" variant="ghost" onClick={() => setIgnoradas(prev => new Set(prev).add(`${x.regla.id}_${x.semana}`))}>Ahora no</Button>
          </div>
        </div>
      ))}

      {varias ? (
        <div className="flex items-center gap-3 flex-wrap rounded-surface border border-accent-line bg-accent/8 px-4 py-3">
          <p className="font-sans font-bold text-body-s text-ink">
            {sel.size === 0 ? 'Elige semanas en la barra' : `${sel.size} semana${sel.size === 1 ? '' : 's'}: ${selOrd.map(s => `S${s}`).join(', ')}`}
          </p>
          <div className="ml-auto flex gap-2 flex-wrap">
            <Button size="s" icon="balance" disabled={sel.size === 0} onClick={() => marcarMant(selOrd, true)}>Marcar mantenimiento</Button>
            <Button size="s" variant="ghost" disabled={sel.size === 0} onClick={() => marcarMant(selOrd, false)}>Quitar mantenimiento</Button>
            <Button size="s" variant="ghost" icon="refresh" disabled={sel.size === 0} onClick={() => quitar(selOrd)}>Quitar cambios</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-surface border border-accent-line bg-accent/8 px-4 py-3 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-sans font-extrabold text-title-s text-accent-ink">Semana {semana}</p>
            {fase && (
              <p className="font-mono text-caption text-ink-2">
                {fase.fase.name} · semana {fase.semanaEnFase} de {fase.fase.weeks}
                {dietaSemana ? ` · ${kcalDeDieta(dietaSemana).toLocaleString('es-ES')} kcal/día` : ''}
                {protPorSemana[semana] != null ? ` · ${protPorSemana[semana]!.toLocaleString('es-ES')} g/kg de proteína` : ''}
              </p>
            )}
            <SegmentedControl
              className="shrink-0 min-w-[13rem]"
              label="Alcance del ajuste"
              value={solo ? 'solo' : 'desde'}
              onChange={v => setSolo(v === 'solo')}
              options={[{ value: 'desde', label: `Desde S${semana}` }, { value: 'solo', label: `Solo S${semana}` }]}
            />
            <div className="ml-auto flex gap-2 flex-wrap">
              <button
                type="button"
                aria-pressed={esMant}
                onClick={() => marcarMant([semana], !esMant)}
                className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 font-sans text-label font-bold transition-colors ${
                  esMant ? 'border-info text-info bg-info/10' : 'border-hairline text-ink-2 hover:text-ink hover:border-strong'}`}
              >
                <Icon name="balance" size="s" />{esMant ? 'Mantenimiento activado' : 'Semana de mantenimiento'}
              </button>
              <Button size="s" variant="ghost" icon="refresh" onClick={() => quitar([semana])}>Quitar cambios</Button>
            </div>
          </div>

          {habitos[semana] && (minA != null || minR != null) && (
            <p className={`font-sans text-caption ${noLlega(semana) ? 'text-warning' : 'text-ink-2'}`}>
              Apuntado ({habitos[semana]!.dias} {habitos[semana]!.dias === 1 ? 'día' : 'días'}):
              {minA != null && habitos[semana]!.aguaL != null ? ` agua ${habitos[semana]!.aguaL!.toLocaleString('es-ES')} L/día de ${minA.toLocaleString('es-ES')}` : ''}
              {minR != null && habitos[semana]!.raciones != null ? ` · verdura y fruta ${habitos[semana]!.raciones!.toLocaleString('es-ES')} de ${minR}` : ''}
            </p>
          )}
          {protPorSemana[semana] != null && protPorSemana[semana]! < protMin && (
            <p className="flex items-center gap-1.5 font-sans text-caption text-danger">
              <Icon name="warning" size="s" />
              Proteína por debajo de {protMin.toLocaleString('es-ES')} g/kg con su peso actual ({pesoActual?.toLocaleString('es-ES')} kg): súbela antes de recortar más.
            </p>
          )}
          {!dietaSemana ? (
            <p className="font-sans text-label text-ink-3">Esta fase no tiene dieta enlazada: enlázale una al editar la periodización.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-separate border-spacing-y-1">
                <thead>
                  <tr className="font-mono text-caption text-ink-3 uppercase tracking-wider">
                    <th className="text-left font-normal px-2">Comida · {dietaSemana.name}</th>
                    {MACROS.map(m => <th key={m.cat} className="font-normal w-28">{m.label}</th>)}
                    <th className="font-normal w-20 text-right px-2">kcal</th>
                  </tr>
                </thead>
                <tbody>
                  {dietaSemana.meals.map((meal, i) => {
                    const slot = slots[i];
                    const baseMeal = dietaBase?.meals[i];
                    const cant = (m: typeof meal | undefined, cat: MacroAjustable) => (m ? macrosDeComida(m)[cat] : 0);
                    const kcalComida = kcalDeComida(meal);
                    return (
                      <tr key={meal.id} className="bg-surface">
                        <td className="px-2 py-1.5 rounded-l-control">
                          <p className="font-sans font-bold text-label text-ink">{meal.name || SLOT_LABEL[slot]}</p>
                          <p className="font-sans text-caption text-ink-3 truncate max-w-[16rem]">{meal.items.map(it => it.foodLabel).join(' · ') || 'Sin alimentos'}</p>
                        </td>
                        {MACROS.map(m => {
                          const v = cant(meal, m.cat);
                          const cambiado = Math.abs(v - cant(baseMeal, m.cat)) > 0.001;
                          return (
                            <td key={m.cat} className="px-1">
                              <div className={`mx-auto w-24 h-8 rounded-control flex items-center justify-between px-1 ${cambiado ? 'ring-1 ring-accent-line bg-accent/8' : 'bg-inset'}`}>
                                <button type="button" aria-label={`Menos ${m.label} en ${meal.name}`} onClick={() => ajustar(slot, m.cat, -1)}
                                  className="w-6 h-6 rounded-control bg-surface text-ink-2 font-mono font-bold">−</button>
                                <span className="font-mono text-body-s font-bold tabular-nums text-ink">{v.toLocaleString('es-ES')}</span>
                                <button type="button" aria-label={`Más ${m.label} en ${meal.name}`} onClick={() => ajustar(slot, m.cat, 1)}
                                  className="w-6 h-6 rounded-control bg-accent/14 text-accent-ink font-mono font-bold">+</button>
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-2 text-right font-mono text-label text-ink-2 tabular-nums rounded-r-control">{kcalComida.toLocaleString('es-ES')}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="px-2 font-mono text-caption text-ink-2 uppercase tracking-wider">Cupo del día</td>
                    {MACROS.map(m => (
                      <td key={m.cat} className="text-center font-mono text-label font-bold text-ink tabular-nums">{macrosDeCupo(dietaSemana.budget)[m.cat].toLocaleString('es-ES')}</td>
                    ))}
                    <td className="px-2 text-right font-mono text-label font-bold text-ink tabular-nums">{kcalDeDieta(dietaSemana).toLocaleString('es-ES')}</td>
                  </tr>
                </tbody>
              </table>
              <p className="font-sans text-caption text-ink-3 mt-1">
                Cada ± es un intercambio (unas 100 kcal) y se reparte en los alimentos de esa comida. Vale para cualquier dieta que el atleta tenga ese día.
                {esMant && ' Semana de mantenimiento: ya incluye +1 hidrato en cada comida.'}
              </p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-control border border-hairline bg-surface p-3 space-y-2">
              <p className="font-sans font-bold text-label text-ink">Días de entreno y descanso</p>
              <p className="font-sans text-caption text-ink-3">
                Hidratos según si ese día tiene sesión asignada. Van a la comida pegada al entreno si la dieta la marca.
                {program.ciclado && ` Ahora: desde S${program.ciclado.desde}, entreno ${program.ciclado.entreno > 0 ? '+' : ''}${program.ciclado.entreno}, descanso ${program.ciclado.descanso > 0 ? '+' : ''}${program.ciclado.descanso}.`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Select label="Día de entreno" value={ciclo.entreno} onChange={v => setCiclo({ ...ciclo, entreno: v })}
                  options={[-3, -2, -1, 0, 1, 2, 3, 4].map(k => ({ value: String(k), label: `${k > 0 ? '+' : ''}${k} HC` }))} />
                <Select label="Día de descanso" value={ciclo.descanso} onChange={v => setCiclo({ ...ciclo, descanso: v })}
                  options={[-4, -3, -2, -1, 0, 1, 2].map(k => ({ value: String(k), label: `${k > 0 ? '+' : ''}${k} HC` }))} />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="s" icon="fitness_center" onClick={() => guardar({ ...program, ciclado: { desde: semana, entreno: Number(ciclo.entreno), descanso: Number(ciclo.descanso) } })}>
                  Aplicar desde S{semana}
                </Button>
                {program.ciclado && (
                  <Button size="s" variant="ghost" onClick={() => { const { ciclado: _c, ...resto } = program; guardar(resto as NutritionProgram); }}>Quitar</Button>
                )}
              </div>
            </div>
            <div className="rounded-control border border-hairline bg-surface p-3 space-y-2">
              <p className="font-sans font-bold text-label text-ink">Pasos</p>
              <p className="font-sans text-caption text-ink-3">
                {(program.pasosPorSemana ?? []).length > 0
                  ? (program.pasosPorSemana ?? []).map(x => `S${x.semana}: ${x.pasos.toLocaleString('es-ES')}`).join(' · ')
                  : 'Sin cambios por semana: manda el objetivo fijo de su configuración.'}
              </p>
              <div className="flex gap-2 items-end flex-wrap">
                <input id="pasos-semana" aria-label="Pasos al día" inputMode="numeric" placeholder="10000" value={pasos}
                  onChange={e => setPasos(e.target.value.replace(/\D/g, ''))}
                  className="h-9 w-28 bg-inset border border-hairline rounded-control px-2 font-mono text-label text-ink focus:outline-none focus:ring-1 focus:ring-accent" />
                <Button size="s" icon="add" disabled={!pasos} onClick={() => {
                  const lista = [...(program.pasosPorSemana ?? []).filter(x => x.semana !== semana), { semana, pasos: Number(pasos) }].sort((a, b) => a.semana - b.semana);
                  guardar({ ...program, pasosPorSemana: lista });
                  setPasos('');
                }}>Desde S{semana}</Button>
              </div>
            </div>
            <div className="rounded-control border border-hairline bg-surface p-3 space-y-2">
              <p className="font-sans font-bold text-label text-ink">Reglas por peso</p>
              <p className="font-sans text-caption text-ink-3">Cuando se cumplen te lo propone aquí arriba; nunca se aplican solas.</p>
              {(program.reglasPeso ?? []).map(r => (
                <div key={r.id} className="flex items-center gap-2 font-sans text-caption text-ink-2">
                  <span className="flex-1">
                    Si {r.semanas} semanas {r.tipo === 'bajar' ? 'baja' : 'sube'} menos de {r.ritmoMinimo.toLocaleString('es-ES')} kg/sem → {r.tipo === 'bajar' ? '−' : '+'}{r.cantidad} {r.cat}
                  </span>
                  <button type="button" aria-label="Quitar regla" onClick={() => {
                    const resto = (program.reglasPeso ?? []).filter(x => x.id !== r.id);
                    guardar({ ...program, reglasPeso: resto.length > 0 ? resto : undefined });
                  }} className="p-1 text-ink-3 hover:text-danger"><Icon name="close" size="s" /></button>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2">
                <Select label="Fase" value={regla.tipo} onChange={v => setRegla({ ...regla, tipo: v })}
                  options={[{ value: 'bajar', label: 'Bajar peso' }, { value: 'subir', label: 'Subir peso' }]} />
                <Select label="Menos de" value={regla.ritmo} onChange={v => setRegla({ ...regla, ritmo: v })}
                  options={['0.1', '0.2', '0.3', '0.4', '0.5', '0.7'].map(v => ({ value: v, label: `${v.replace('.', ',')} kg/sem` }))} />
                <Select label="Durante" value={regla.semanas} onChange={v => setRegla({ ...regla, semanas: v })}
                  options={['1', '2', '3'].map(v => ({ value: v, label: `${v} semana${v === '1' ? '' : 's'}` }))} />
                <Select label="Ajustar" value={regla.cat} onChange={v => setRegla({ ...regla, cat: v })}
                  options={MACROS.map(m => ({ value: m.cat, label: m.label }))} />
                <Select label="Intercambios" value={regla.cantidad} onChange={v => setRegla({ ...regla, cantidad: v })}
                  options={['1', '2', '3'].map(v => ({ value: v, label: v }))} />
              </div>
              <Button size="s" icon="add" onClick={() => {
                const nueva: ReglaDePeso = {
                  id: `rp_${Date.now()}`, tipo: regla.tipo as 'bajar' | 'subir', ritmoMinimo: Number(regla.ritmo),
                  semanas: Number(regla.semanas), cat: regla.cat as MacroAjustable, cantidad: Number(regla.cantidad),
                };
                guardar({ ...program, reglasPeso: [...(program.reglasPeso ?? []), nueva] });
              }}>Añadir regla</Button>
            </div>
            <div className="rounded-control border border-hairline bg-surface p-3 space-y-2">
              <p className="font-sans font-bold text-label text-ink">Mínimos del día</p>
              <p className="font-sans text-caption text-ink-3">El atleta los apunta en su día; aquí ves si llega. Proteína mínima: {protMin.toLocaleString('es-ES')} g/kg.</p>
              <div className="grid grid-cols-3 gap-2 items-end">
                <label className="flex flex-col gap-1 font-mono text-caption text-ink-2 uppercase tracking-wider">Agua (L)
                  <input id="min-agua" inputMode="decimal" value={minimos.agua} onChange={e => setMinimos({ ...minimos, agua: e.target.value.replace(',', '.') })}
                    className="h-9 bg-inset border border-hairline rounded-control px-2 font-mono text-label text-ink normal-case focus:outline-none focus:ring-1 focus:ring-accent" />
                </label>
                <label className="flex flex-col gap-1 font-mono text-caption text-ink-2 uppercase tracking-wider">Verdura y fruta
                  <input id="min-raciones" inputMode="numeric" value={minimos.raciones} onChange={e => setMinimos({ ...minimos, raciones: e.target.value.replace(/\D/g, '') })}
                    className="h-9 bg-inset border border-hairline rounded-control px-2 font-mono text-label text-ink normal-case focus:outline-none focus:ring-1 focus:ring-accent" />
                </label>
                <Select label="Proteína mín." value={String(protMin)} onChange={v => guardar({ ...program, proteinaMinGKg: Number(v) })}
                  options={['1.4', '1.6', '1.8', '2', '2.2'].map(v => ({ value: v, label: `${v.replace('.', ',')} g/kg` }))} />
              </div>
              <Button size="s" icon="done_all" onClick={() => {
                const aguaL = Number(minimos.agua) || undefined;
                const raciones = Number(minimos.raciones) || undefined;
                guardar({ ...program, minimos: aguaL || raciones ? { ...(aguaL ? { aguaL } : {}), ...(raciones ? { raciones } : {}) } : undefined });
              }}>Guardar mínimos</Button>
            </div>
            <div className="rounded-control border border-hairline bg-surface p-3 space-y-2">
              <p className="font-sans font-bold text-label text-ink">Comida libre</p>
              <div className="grid grid-cols-3 gap-2">
                <Select label="Día" value={libre.dia} onChange={v => setLibre({ ...libre, dia: v as WeekDay })}
                  options={DIAS.map(d => ({ value: d, label: NOMBRE_DIA[d] }))} />
                <Select label="Comida" value={libre.slot} onChange={v => setLibre({ ...libre, slot: v })}
                  options={[1, 2, 3, 4, 5].map(sl => ({ value: String(sl), label: SLOT_LABEL[sl] }))} />
                <Select label="Hasta" value={libre.hasta} onChange={v => setLibre({ ...libre, hasta: v })}
                  options={[{ value: '', label: 'Final' }, ...Array.from({ length: n - semana + 1 }, (_, k) => ({ value: String(semana + k), label: `S${semana + k}` }))]} />
              </div>
              <Button size="s" icon="add" onClick={() => guardar({
                ...program,
                comidasLibres: [...(program.comidasLibres ?? []), { dia: libre.dia, slot: Number(libre.slot), desde: semana, ...(libre.hasta ? { hasta: Number(libre.hasta) } : {}) }],
              })}>Añadir desde S{semana}</Button>
            </div>
            <div className="rounded-control border border-hairline bg-surface p-3 space-y-2">
              <p className="font-sans font-bold text-label text-ink">Suplementación</p>
              {suplementosDeLaSemana(program, semana).length > 0 && (
                <p className="font-sans text-caption text-ink-2">Esta semana: {suplementosDeLaSemana(program, semana).map(x => x.nombre).join(', ')}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input id="sup-nombre" aria-label="Suplemento" placeholder="Creatina" value={sup.nombre} onChange={e => setSup({ ...sup, nombre: e.target.value })}
                  className="h-9 bg-inset border border-hairline rounded-control px-2 font-sans text-label text-ink focus:outline-none focus:ring-1 focus:ring-accent" />
                <input id="sup-dosis" aria-label="Dosis" placeholder="5 g" value={sup.dosis} onChange={e => setSup({ ...sup, dosis: e.target.value })}
                  className="h-9 bg-inset border border-hairline rounded-control px-2 font-sans text-label text-ink focus:outline-none focus:ring-1 focus:ring-accent" />
                <input id="sup-momento" aria-label="Cuándo" placeholder="Con el desayuno" value={sup.momento} onChange={e => setSup({ ...sup, momento: e.target.value })}
                  className="h-9 bg-inset border border-hairline rounded-control px-2 font-sans text-label text-ink focus:outline-none focus:ring-1 focus:ring-accent" />
                <Select label="" value={sup.hasta} onChange={v => setSup({ ...sup, hasta: v })}
                  options={[{ value: '', label: 'Hasta el final' }, ...Array.from({ length: n - semana + 1 }, (_, k) => ({ value: String(semana + k), label: `Hasta S${semana + k}` }))]} />
              </div>
              <Button size="s" icon="add" disabled={!sup.nombre.trim()} onClick={() => {
                const nuevo: Suplemento = {
                  id: `sup_${Date.now()}`, nombre: sup.nombre.trim(), desde: semana,
                  ...(sup.dosis.trim() ? { dosis: sup.dosis.trim() } : {}),
                  ...(sup.momento.trim() ? { momento: sup.momento.trim() } : {}),
                  ...(sup.hasta ? { hasta: Number(sup.hasta) } : {}),
                };
                guardar({ ...program, suplementos: [...(program.suplementos ?? []), nuevo] });
                setSup({ nombre: '', dosis: '', momento: '', hasta: '' });
              }}>Añadir desde S{semana}</Button>
            </div>
          </div>
        </div>
      )}

      {programado.length > 0 && (
        <details className="rounded-control border border-hairline px-3 py-2 group/prog">
          <summary className="cursor-pointer list-none flex items-center gap-2 font-sans font-bold text-label text-ink">
            <Icon name="event_note" size="s" className="text-accent-ink" />
            Programado en la periodización · {programado.length}
            <Icon name="expand_more" size="s" className="ml-auto text-ink-3 transition-transform group-open/prog:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-0.5">
            {programado.map((e, i) => (
              <li key={i} className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-inset">
                <button type="button" onClick={() => { setVarias(false); setSemana(e.semana); }}
                  className={`flex-1 text-left font-sans text-label ${e.tono === 'esp' ? 'text-info' : 'text-ink-2'}`}>{e.texto}</button>
                <button type="button" onClick={e.quitar} aria-label="Quitar esto" title="Quitar esto" className="p-1 text-ink-3 hover:text-danger">
                  <Icon name="close" size="s" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Sheet open={progAbierto} onClose={() => setProgAbierto(false)} title="Progresiones de nutrición">
        <div className="space-y-5">
          <p className="font-sans text-label text-ink-2">Se programan como cambios por semana desde la semana {semana}. Después puedes retocarlas semana a semana o deshacerlas.</p>
          <section className="space-y-2">
            <p className="font-sans font-bold text-body-s text-ink">Salida de déficit</p>
            <p className="font-sans text-caption text-ink-3">+1 intercambio de hidratos cada semana hasta llegar al objetivo{mantenimientoKcal ? ` (su mantenimiento estimado ronda las ${mantenimientoKcal.toLocaleString('es-ES')} kcal)` : ''}.</p>
            <div className="flex gap-2 items-end flex-wrap">
              <label className="flex flex-col gap-1 font-mono text-caption text-ink-2 uppercase tracking-wider">Objetivo kcal
                <input id="salida-kcal" inputMode="numeric" value={salida} onChange={e => setSalida(e.target.value.replace(/\D/g, ''))}
                  className="h-9 w-28 bg-inset border border-hairline rounded-control px-2 font-mono text-label text-ink normal-case focus:outline-none focus:ring-1 focus:ring-accent" />
              </label>
              <Button size="s" icon="trending_up" disabled={!salida} onClick={() => { guardar(salidaDeDeficit(program, diets, semana, Number(salida))); setProgAbierto(false); }}>
                Programar desde S{semana}
              </Button>
            </div>
          </section>
          <section className="space-y-2">
            <p className="font-sans font-bold text-body-s text-ink">Descanso de dieta</p>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Una semana de mantenimiento cada" value={descanso.cada} onChange={v => setDescanso({ ...descanso, cada: v })}
                options={['4', '5', '6', '8', '10', '12'].map(v => ({ value: v, label: `${v} semanas` }))} />
              <Select label="Hasta" value={descanso.hasta || String(n)} onChange={v => setDescanso({ ...descanso, hasta: v })}
                options={Array.from({ length: n - semana + 1 }, (_, k) => ({ value: String(semana + k), label: `S${semana + k}` }))} />
            </div>
            <Button size="s" icon="balance" onClick={() => { guardar(descansosDeDieta(program, Number(descanso.cada), semana, Number(descanso.hasta || n))); setProgAbierto(false); }}>
              Programar descansos
            </Button>
          </section>
          <section className="space-y-2">
            <p className="font-sans font-bold text-body-s text-ink">Bajada progresiva</p>
            <div className="grid grid-cols-3 gap-3">
              <Select label="−1 intercambio de" value={bajada.cat} onChange={v => setBajada({ ...bajada, cat: v })}
                options={MACROS.filter(m => m.cat !== 'PROT').map(m => ({ value: m.cat, label: m.label }))} />
              <Select label="Cada" value={bajada.cada} onChange={v => setBajada({ ...bajada, cada: v })}
                options={['1', '2', '3', '4'].map(v => ({ value: v, label: v === '1' ? 'semana' : `${v} semanas` }))} />
              <label className="flex flex-col gap-1 font-mono text-caption text-ink-2 uppercase tracking-wider">Sin bajar de (kcal)
                <input id="bajada-suelo" inputMode="numeric" value={bajada.suelo} onChange={e => setBajada({ ...bajada, suelo: e.target.value.replace(/\D/g, '') })}
                  className="h-9 bg-inset border border-hairline rounded-control px-2 font-mono text-label text-ink normal-case focus:outline-none focus:ring-1 focus:ring-accent" />
              </label>
            </div>
            <Button size="s" icon="trending_down" disabled={!bajada.suelo} onClick={() => {
              guardar(bajadaProgresiva(program, diets, semana, Number(bajada.cada), bajada.cat as MacroAjustable, Number(bajada.suelo)));
              setProgAbierto(false);
            }}>Programar desde S{semana}</Button>
          </section>
        </div>
      </Sheet>
    </div>
  );
}

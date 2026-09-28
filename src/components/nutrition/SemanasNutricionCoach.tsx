import React, { useMemo, useState } from 'react';
import { Icon, Button, SegmentedControl, Select } from '../ui';
import type { Diet, NutritionProgram, MacroAjustable, WeekDay, Suplemento } from '../../types';
import { SLOT_LABEL, resolveSlots } from '../../utils/mealDistribution';
import {
  totalSemanas, faseDeLaSemana, ajustesDeLaSemana, aplicarAjustes, kcalDeDieta, kcalDeComida, macrosDeComida, macrosDeCupo, kcalPorSemana, programarAjuste,
  quitarCambiosNutricion, describirAjuste, semanaDelPrograma, NOMBRE_DIA, suplementosDeLaSemana,
} from '../../utils/semanasNutricion';
import { hoyIsoLocal } from '../../utils/trainingWeek';

const MACROS: { cat: MacroAjustable; label: string }[] = [
  { cat: 'HC', label: 'Hidratos' }, { cat: 'PROT', label: 'Proteína' }, { cat: 'GRASA', label: 'Grasa' },
];
const DIAS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Barra de semanas de la periodización nutricional: cada semana con su fase y
 *  sus kcal/día, y en la semana elegida la dieta de su fase con los ajustes
 *  que se programen (desde esa semana o solo esa), mantenimiento, comidas
 *  libres y suplementación. Todo se guarda en el NutritionProgram. */
export default function SemanasNutricionCoach({ program, diets, onGuardar }: {
  program: NutritionProgram;
  diets: Diet[];
  onGuardar: (p: NutritionProgram) => void;
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

  const kcal = useMemo(() => kcalPorSemana(program, diets), [program, diets]);
  const max = Math.max(1, ...kcal.map(k => k ?? 0));
  const min = Math.min(...kcal.filter((k): k is number => k != null), max) * 0.85;
  const mant = program.semanasMantenimiento ?? [];

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
                  title={`Semana ${s}${k ? ` · ${k.toLocaleString('es-ES')} kcal/día` : ''}${mant.includes(s) ? ' · Mantenimiento' : ''}${s === hoy ? ' · esta semana' : ''}`}
                  onClick={() => {
                    if (!varias) { setSemana(s); return; }
                    setSel(prev => { const x = new Set(prev); if (x.has(s)) x.delete(s); else x.add(s); return x; });
                  }}
                  className={`relative w-14 flex flex-col items-center gap-1 rounded-control border px-1 pt-1.5 pb-1 transition-colors ${
                    activa ? `bg-accent/12 border-accent ${varias ? 'border-dashed' : ''}` : 'bg-bg border-hairline hover:border-strong'}`}
                >
                  {empiezan.has(s) && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />}
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
    </div>
  );
}

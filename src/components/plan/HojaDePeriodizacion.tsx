import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Diet, NutritionPhase, NutritionProgram, OnboardingData, PlantillaPeriodizacion } from '../../types';
import { getNutritionProgram, saveNutritionProgram, createDiet } from '../../dbService';
import { getPlantillasPeriodizacion, savePlantillasPeriodizacion } from '../../db/coachSettings';
import { useAthleteWeight } from '../../hooks/useAthleteWeight';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { estimateMaintenanceKcal } from '../../utils/energyCalc';
import { OBJETIVO_LABEL, OBJETIVOS_ORDEN, type ObjetivoCorporalTipo } from '../../utils/verificacionObjetivo';
import { phaseTypeDeObjetivo } from '../../utils/objetivoDeFase';
import { resolvePhaseTargetKcal } from '../../utils/nutritionPeriodization';
import { semanasDelPlan } from '../../utils/seguimientoPlan';
import { computePhaseStartDate } from '../../utils/fasesNutricion';
import { programarAjuste, ajusteEnGramos, semanaDelPrograma } from '../../utils/semanasNutricion';
import {
  encadenarFases, fasesParaGuardar, kcalParaElRitmo, macrosPorKg, dietaDesdeMacros, avisoAcelerada, escalonesDeFase,
  confirmarTodosLosEscalones, filasSemanaASemana, fasesDesdePlantilla, plantillaDesdeFases, PLANTILLAS_POR_DEFECTO, ritmoPorDefecto,
  RITMOS, ACELERADA, PROTEINA_MIN_G_KG, semanaInicialDeFase, type Escalon,
} from '../../utils/hojaDePeriodizacion';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import { mensajeDeErrorFirestore } from '../../utils/erroresFirestore';
import NutritionPeriodizationPanel from '../NutritionPeriodizationPanel';
import { Icon, Button, EmptyState, Skeleton } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Plan › Objetivo › Plan — la hoja de periodización (30-10-2026)

   Versión «hoja de control» que eligió Dani entre tres. Las fases, desde el
   30-10 una tarjeta por fase (variante A, «la ecuación»): lo que fija
   (objetivo, ritmo, semanas, kcal, macros por kg, pasos, dieta) agrupado
   por para qué sirve, y la cuenta a la vista: mantenimiento + pasos − lo que
   come = déficit → kg. Escalones, para qué y cardio en el detalle; la barra
   de semanas de siempre (ciclado, reglas, mínimos, comidas libres,
   suplementos) y la tabla de las N semanas con kcal y pasos tocables.
   Nada se guarda hasta «Guardar y publicar». Motor: utils/hojaDePeriodizacion.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteEmail: string;
  athleteName?: string;
  diets: Diet[];
  onboarding: OnboardingData | null;
  currentWeightKg?: number;
  stepGoal: number;
  kcalPerStep: number;
  onDietsChanged?: () => void;
}

const kg = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const miles = (n: number | null | undefined) => n == null ? '—' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const num = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : null; };

const CELDA = 'w-full bg-raised border border-control-line text-ink font-mono text-label rounded-control px-1.5 py-1 text-right focus:outline-none focus:border-accent';
const CELDA_S = CELDA.replace('w-full ', '');
const CAMPO = 'w-full bg-raised border border-control-line text-ink font-mono text-body font-semibold rounded-field px-3 py-2 focus:outline-none focus:border-accent';

export default function HojaDePeriodizacion({ athleteEmail, athleteName, diets, onboarding, currentWeightKg, stepGoal, kcalPerStep, onDietsChanged }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const programKey = ['nutritionProgram', athleteEmail] as const;
  const { data: program = null, isPending } = useQuery({ queryKey: programKey, queryFn: () => getNutritionProgram(athleteEmail) });
  const { data: plantillasGuardadas = null } = useQuery({ queryKey: ['plantillasPeriodizacion'], queryFn: getPlantillasPeriodizacion });
  const plantillas = plantillasGuardadas ?? PLANTILLAS_POR_DEFECTO;
  const { logs: pesos } = useAthleteWeight(athleteEmail);
  const hoy = hoyIsoLocal();

  const [form, setForm] = useState<NutritionProgram | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuPlantillas, setMenuPlantillas] = useState(false);
  useEffect(() => { if (!isPending) setForm(program ? { ...program, phases: program.phases.map(p => ({ ...p })) } : null); }, [program, isPending]);
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(program);

  const pesoInicio = currentWeightKg ?? onboarding?.weightKg ?? null;
  const mantenimiento = onboarding ? estimateMaintenanceKcal(onboarding, pesoInicio ?? undefined) : null;
  const pasosKcal = (pasos: number | null | undefined) => Math.round((pasos ?? stepGoal) * kcalPerStep);
  const proteinaMin = form?.proteinaMinGKg ?? PROTEINA_MIN_G_KG;

  const cadena = useMemo(() => form && pesoInicio != null ? encadenarFases(pesoInicio, form.phases) : [], [form, pesoInicio]);
  const semanas = useMemo(() => form && form.phases.length ? semanasDelPlan({ program: form, diets, pesos, registros: [], pasos: [], pasosBase: stepGoal, hoy }) : [], [form, diets, pesos, stepGoal, hoy]);
  const filas = useMemo(() => form ? filasSemanaASemana(form, diets, stepGoal) : [], [form, diets, stepGoal]);
  const totalSem = form?.phases.reduce((n, f) => n + f.weeks, 0) ?? 0;
  const pesoFinal = cadena.at(-1)?.pesoFinal ?? null;
  const semanaHoy = form ? semanaDelPrograma(form, hoy) : 0;

  const setFase = (idx: number, cambios: Partial<NutritionPhase>) =>
    setForm(f => f ? { ...f, phases: f.phases.map((p, i) => i === idx ? { ...p, ...cambios } : p) } : f);

  const kcalInicioSugerida = (idx: number): number | null => {
    const f = form?.phases[idx]; const c = cadena[idx];
    if (!f || !c || mantenimiento == null || c.ritmoKgSem == null) return null;
    const media = kcalParaElRitmo({ mantenimientoKcal: mantenimiento, pasosKcal: pasosKcal(f.pasos), ritmoKgSem: c.ritmoKgSem });
    const tramos = f.escalon ? Math.ceil(f.weeks / Math.max(1, f.escalon.cadaSemanas)) : 1;
    return Math.round((media - (f.escalon?.kcal ?? 0) * (tramos - 1) / 2) / 10) * 10;
  };

  const macrosDe = (f: NutritionPhase, idx: number) => {
    const c = cadena[idx];
    if (!c || f.proteinaGKg == null || f.grasaGKg == null || f.targetKcal == null) return null;
    return macrosPorKg({ pesoKg: c.pesoInicio, proteinaGKg: f.proteinaGKg, grasaGKg: f.grasaGKg, kcal: f.targetKcal });
  };

  const nuevaFase = (): NutritionPhase => ({ id: `phase_${Date.now()}`, name: `Fase ${(form?.phases.length ?? 0) + 1}`, weeks: 4, dietId: '', modo: 'ritmo', objetivo: 'deficit', ritmoPctSem: ritmoPorDefecto('deficit'), phaseType: 'deficit', proteinaGKg: 2, grasaGKg: 0.8, pasos: stepGoal });

  const crear = () => setForm({ athleteId: athleteEmail, startDate: hoy, phases: [nuevaFase()] });

  const aplicarPlantilla = async (pl: PlantillaPeriodizacion) => {
    setMenuPlantillas(false);
    if (form && form.phases.length > 0 && !await confirm(`¿Sustituir las ${form.phases.length} fases por la plantilla «${pl.nombre}»? No se guarda nada hasta que publiques.`)) return;
    const fases = fasesDesdePlantilla(pl).map(f => ({ ...f, phaseType: f.objetivo ? phaseTypeDeObjetivo(f.objetivo) : undefined, pasos: f.pasos ?? stepGoal }));
    setForm(f => ({ athleteId: athleteEmail, startDate: f?.startDate ?? hoy, ...(f ?? {}), phases: fases }));
  };

  const guardarComoPlantilla = async () => {
    if (!form) return;
    setMenuPlantillas(false);
    const nombre = window.prompt('Nombre de la plantilla', `${athleteName?.split(' ')[0] ?? 'Plan'} · ${totalSem} sem`);
    if (!nombre) return;
    const lista = [...plantillas.filter(p => p.nombre !== nombre), plantillaDesdeFases(nombre, form.phases)];
    try { await savePlantillasPeriodizacion(lista); queryClient.setQueryData(['plantillasPeriodizacion'], lista); showToast(`Plantilla «${nombre}» guardada`, 'success'); }
    catch (err) { showToast(mensajeDeErrorFirestore(err, 'guardar la plantilla')); }
  };

  const guardar = async () => {
    if (!form || pesoInicio == null) return;
    setSaving(true);
    try {
      let dietas = diets;
      const phases: NutritionPhase[] = [];
      for (const [i, f] of fasesParaGuardar(pesoInicio, form.phases).entries()) {
        let fase = { ...f };
        const m = macrosDe(fase, i);
        if (!fase.dietId && m) {
          // Sin dieta: se crea la base de la fase con sus macros. Las comidas las monta el coach o el generador.
          const nueva = await createDiet(dietaDesdeMacros(athleteEmail, fase.name, m));
          dietas = [...dietas, nueva];
          fase = { ...fase, dietId: nueva.id, targetKcal: m.kcal };
        }
        phases.push(fase);
      }
      let nuevo: NutritionProgram = { ...(program ?? {}), ...form, athleteId: athleteEmail, phases };
      nuevo = confirmarTodosLosEscalones(nuevo, dietas, stepGoal);
      await saveNutritionProgram(nuevo);
      queryClient.setQueryData(programKey, nuevo);
      queryClient.invalidateQueries({ queryKey: ['nutritionProgram', athleteEmail] });
      onDietsChanged?.();
      showToast('Periodización guardada y publicada', 'success');
    } catch (err) {
      console.error('guardar periodización failed:', err);
      showToast(mensajeDeErrorFirestore(err, 'guardar la periodización'));
    } finally { setSaving(false); }
  };

  // Semana a semana: tocar kcal o pasos de UNA semana.
  const tocarKcal = (semana: number, kcalActual: number | null, valor: number | null) => {
    if (!form || kcalActual == null || valor == null) return;
    const gramos = Math.round((valor - kcalActual) / 4 / 5) * 5;
    if (gramos === 0) return;
    setForm({ ...form, cambiosSemana: programarAjuste(form, semana, true, ajusteEnGramos('HC', gramos)) });
  };
  const tocarPasos = (semana: number, valor: number | null) => {
    if (!form || valor == null) return;
    const lista = (form.pasosPorSemana ?? []).filter(p => p.semana !== semana);
    setForm({ ...form, pasosPorSemana: [...lista, { semana, pasos: valor }].sort((a, b) => a.semana - b.semana) });
  };

  if (isPending) return <Skeleton className="h-64 w-full rounded-canvas" />;
  if (!form) {
    return (
      <div className="space-y-3">
        <EmptyState icon="timeline" title="Sin periodización" description="Elige una plantilla o crea las fases a mano. El atleta las verá en su Road map." />
        <div className="flex flex-wrap gap-2 justify-center">
          {plantillas.map(pl => <span key={pl.id}><Button size="s" variant="ghost" onClick={() => aplicarPlantilla(pl)}>{pl.nombre}</Button></span>)}
          <Button size="s" onClick={crear}>Desde cero</Button>
        </div>
      </div>
    );
  }

  const objetivoPlan = form.phases[0]?.objetivo ? OBJETIVO_LABEL[form.phases[0].objetivo] : 'Plan';

  return (
    <div className="space-y-4">
      <ConfirmDialog />
      {/* ── Cabecera ── */}
      <section className="bg-surface border border-hairline rounded-surface p-4 space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[16rem]">
            <p className="font-mono text-caption uppercase tracking-widest text-accent-ink">Objetivo · {objetivoPlan}</p>
            <p className="font-sans text-title-m font-bold text-ink">
              {kg(pesoInicio)} → {kg(pesoFinal)} kg · {totalSem} semanas
              {form.startDate && totalSem > 0 && <span className="text-ink-3 font-normal"> · {fechaCorta(form.startDate)} → {fechaCorta(addDays(form.startDate, totalSem * 7 - 1))}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 relative">
            <label className="flex items-center gap-2 font-mono text-caption text-ink-3 uppercase">Inicio
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className={`${CELDA} w-auto text-left`} />
            </label>
            <Button size="s" variant="ghost" icon="dashboard_customize" onClick={() => setMenuPlantillas(v => !v)}>Plantilla</Button>
            {menuPlantillas && (
              <div className="absolute right-0 top-10 z-10 bg-surface border border-hairline rounded-field shadow-lg p-1 min-w-[16rem]">
                {plantillas.map(pl => <button key={pl.id} type="button" onClick={() => aplicarPlantilla(pl)} className="block w-full text-left px-3 py-2 rounded-control font-sans text-label text-ink hover:bg-raised">{pl.nombre} <span className="font-mono text-caption text-ink-3">· {pl.fases.length} fases · {pl.fases.reduce((n, f) => n + f.weeks, 0)} sem</span></button>)}
                <button type="button" onClick={guardarComoPlantilla} className="block w-full text-left px-3 py-2 rounded-control font-sans text-label text-accent-ink hover:bg-raised border-t border-hairline mt-1">+ Guardar estas fases como plantilla</button>
              </div>
            )}
            <Button size="s" variant="ghost" onClick={() => setForm({ ...form, phases: [...form.phases, nuevaFase()] })}>+ Fase</Button>
            {dirty && <Button size="s" variant="ghost" onClick={() => setForm(program ? { ...program, phases: program.phases.map(p => ({ ...p })) } : null)}>Deshacer</Button>}
            <Button size="s" onClick={guardar} loading={saving} disabled={!dirty || form.phases.length === 0 || pesoInicio == null}>Guardar y publicar</Button>
          </div>
        </div>
        {/* Mantenimiento y pasos ya no van aquí: bajan a cada fase, que es donde cuentan (la cuenta de «Fases de comida»). */}
        <div className="grid grid-cols-2 gap-2">
          <Dato etiqueta="Proteína mín." valor="" nota="se aplica a todas las fases" editable={<><input aria-label="Proteína mínima en g/kg" className={`${CELDA_S} w-16 text-left font-sans text-title-s font-bold`} defaultValue={String(proteinaMin).replace('.', ',')} onBlur={e => { const n = num(e.target.value); if (n) setForm({ ...form, proteinaMinGKg: n }); }} /><span className="font-mono text-caption text-ink-3">g/kg</span></>} />
          <Dato etiqueta="Acelerada" valor={`≤ ${ACELERADA.maxSemanas} sem`} nota={`proteína ${ACELERADA.proteinaGKg[0]}-${ACELERADA.proteinaGKg[1]} g/kg · luego salida`} />
        </div>
        {pesoInicio == null && <p className="font-sans text-caption text-warning">Sin peso del atleta no se puede calcular nada: que registre un peso o ponlo en su alta.</p>}
      </section>

      {/* ── Fases de comida: una tarjeta por fase con la cuenta a la vista ── */}
      <section className="bg-surface border border-hairline rounded-surface p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="font-sans text-title-s font-bold text-ink flex items-center gap-2 whitespace-nowrap"><Icon name="nutrition" size="m" className="text-accent-ink" />Fases de comida</p>
          <p className="font-mono text-caption text-ink-3">las casillas con borde se tocan · lo demás sale solo</p>
        </div>
        {form.phases.map((f, idx) => {
          const c = cadena[idx];
          const m = macrosDe(f, idx);
          const dieta = diets.find(d => d.id === f.dietId);
          // La dieta enlazada pone las kcal si la fase no fija las suyas: la cuenta tiene que salir igual.
          const kcalFase = f.targetKcal ?? (dieta ? resolvePhaseTargetKcal(f, dieta).kcal ?? null : null);
          const pasosFase = pasosKcal(f.pasos);
          const balance = mantenimiento != null && kcalFase != null ? kcalFase - mantenimiento - pasosFase : null;
          const esc = escalonesDeFase(form, diets, idx, stepGoal);
          const aviso = avisoAcelerada(f);
          const abiertaEsta = abierta === f.id;
          const inicio = semanaInicialDeFase(form, idx);
          const enCurso = semanaHoy >= inicio && semanaHoy < inicio + f.weeks;
          const hasta = addDays(computePhaseStartDate(form, idx), f.weeks * 7 - 1);
          // Fases fijadas por peso final (las de antes de la hoja) no traen %: se deduce del ritmo en kg para no enseñar un 0 falso.
          const ritmoPct = f.ritmoPctSem ?? (c?.ritmoKgSem != null && c.pesoInicio ? Math.round(c.ritmoKgSem / c.pesoInicio * 10000) / 100 : null);
          const signo = f.objetivo === 'volumen' || f.objetivo === 'salida_deficit' ? 1 : -1;
          const sugerida = kcalInicioSugerida(idx);
          const pocaProteina = f.proteinaGKg != null && f.proteinaGKg < proteinaMin;
          return (
            <div key={f.id} className={`rounded-field border p-3 sm:p-4 space-y-4 ${enCurso ? 'border-accent-line' : 'border-hairline'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Icon name="nutrition" size="m" className="text-accent-ink shrink-0" />
                <input aria-label="Nombre de la fase" className="min-w-[9rem] flex-1 bg-transparent border-b border-transparent hover:border-control-line focus:border-accent font-sans text-title-s font-bold text-ink focus:outline-none" value={f.name} onChange={e => setFase(idx, { name: e.target.value })} />
                {enCurso && <span className="shrink-0 rounded-chip bg-accent text-on-accent font-mono text-caption font-bold uppercase px-2 py-0.5">En curso · S{semanaHoy}</span>}
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" aria-label="Subir" disabled={idx === 0} onClick={() => setForm(mover(form, idx, -1))} className="p-1 text-ink-3 hover:text-ink disabled:opacity-30"><Icon name="arrow_upward" size="s" /></button>
                  <button type="button" aria-label="Bajar" disabled={idx === form.phases.length - 1} onClick={() => setForm(mover(form, idx, 1))} className="p-1 text-ink-3 hover:text-ink disabled:opacity-30"><Icon name="arrow_downward" size="s" /></button>
                  <button type="button" aria-label="Borrar fase" onClick={() => setForm({ ...form, phases: form.phases.filter((_, i) => i !== idx) })} className="p-1 text-ink-3 hover:text-danger"><Icon name="delete" size="s" /></button>
                </div>
              </div>

              {/* Hacia dónde y en cuánto */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Campo etiqueta="Objetivo">
                  <select aria-label="Objetivo" value={f.objetivo ?? ''} onChange={e => { const o = (e.target.value || undefined) as ObjetivoCorporalTipo | undefined; setFase(idx, { objetivo: o, phaseType: o ? phaseTypeDeObjetivo(o) : undefined, ritmoPctSem: ritmoPorDefecto(o), modo: 'ritmo' }); }} className={`${CAMPO} font-sans font-bold`}>
                    <option value="">—</option>
                    {OBJETIVOS_ORDEN.map(o => <option key={o} value={o}>{OBJETIVO_LABEL[o]}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Semanas">
                  <ConUnidad unidad={`S${inicio}–S${inicio + f.weeks - 1}`}><input aria-label="Semanas" className={CAMPO} inputMode="numeric" value={f.weeks} onChange={e => { const n = num(e.target.value); if (n != null) setFase(idx, { weeks: Math.max(1, Math.round(n)) }); }} /></ConUnidad>
                </Campo>
                <Campo etiqueta="Ritmo" className="col-span-2 sm:col-span-1">
                  <ConUnidad unidad="%/sem"><input aria-label="Ritmo en % por semana" className={CAMPO} value={ritmoPct?.toLocaleString('es-ES') ?? ''} placeholder="0" onChange={e => { const n = num(e.target.value); if (n != null) setFase(idx, { ritmoPctSem: n, modo: 'ritmo' }); }} /></ConUnidad>
                  <div className="flex gap-1">
                    {(['suave', 'normal', 'rapido'] as const).map(k => (
                      <button key={k} type="button" onClick={() => setFase(idx, { ritmoPctSem: RITMOS[k] * signo, modo: 'ritmo' })} className={`rounded-chip border px-2 py-0.5 font-mono text-caption font-bold uppercase ${ritmoPct === RITMOS[k] * signo ? 'bg-accent border-accent text-on-accent' : 'border-strong text-ink-2 hover:text-ink'}`}>{k === 'rapido' ? 'rápido' : k}</button>
                    ))}
                  </div>
                </Campo>
              </div>

              <div className="border-t border-hairline" />

              {/* La cuenta: gasta (mantenimiento + pasos) − come = déficit → kg */}
              <div className="space-y-2">
                <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Cuánto come y qué le da · kcal al día</p>
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-x-1.5 gap-y-2 items-stretch">
                  <Termino etiqueta="Mantenimiento" valor={mantenimiento != null ? miles(mantenimiento) : '—'} nota="Mifflin + actividad" />
                  <Operador>+</Operador>
                  <Termino etiqueta="Pasos" valor={miles(pasosFase)} nota={`${miles(f.pasos ?? stepGoal)} × ${kcalPerStep.toLocaleString('es-ES')}`} />
                  <Operador>−</Operador>
                  <div className="rounded-field border border-control-line focus-within:border-accent bg-raised px-2.5 py-2 min-w-0">
                    <p className="font-mono text-caption uppercase tracking-wide text-ink-3">Come ✎</p>
                    <input aria-label="kcal al día al inicio de la fase" className="w-full bg-transparent font-sans text-title-m font-bold text-ink focus:outline-none" inputMode="numeric" value={f.targetKcal ?? ''} placeholder={kcalFase != null ? String(kcalFase) : '—'} onChange={e => setFase(idx, { targetKcal: num(e.target.value) ?? undefined })} />
                    {sugerida != null && sugerida !== f.targetKcal
                      ? <button type="button" onClick={() => setFase(idx, { targetKcal: sugerida })} className="font-mono text-caption text-accent-ink hover:underline whitespace-nowrap">sugerir {miles(sugerida)}</button>
                      : <p className="font-mono text-caption text-ink-3">al inicio de la fase</p>}
                  </div>
                  <Operador>=</Operador>
                  <div className="rounded-field border border-accent-line bg-accent-bg px-2.5 py-2 min-w-0">
                    <p className="font-mono text-caption uppercase tracking-wide text-ink-3">{balance != null && balance > 0 ? 'Superávit' : 'Déficit'}</p>
                    <p className="font-sans text-title-m font-bold text-accent-ink">{balance != null ? `${balance > 0 ? '+' : balance < 0 ? '−' : ''}${miles(Math.abs(balance))}` : '—'}</p>
                    <p className="font-mono text-caption text-ink-3">kcal al día</p>
                  </div>
                </div>
                {c && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-field bg-inset px-3 py-2.5 font-sans text-label font-semibold text-ink">
                    <Icon name={c.ritmoKgSem == null || c.ritmoKgSem === 0 ? 'trending_flat' : c.ritmoKgSem < 0 ? 'trending_down' : 'trending_up'} size="m" className="text-accent-ink" />
                    {c.ritmoKgSem != null && <span>{c.ritmoKgSem > 0 ? '+' : c.ritmoKgSem < 0 ? '−' : ''}{Math.abs(c.ritmoKgSem).toLocaleString('es-ES')} kg/sem</span>}
                    <span>{kg(c.pesoInicio)} → <b>{kg(c.pesoFinal)} kg</b> el {fechaCorta(hasta)}</span>
                    {enCurso && (
                      <span className="flex items-center gap-2 flex-1 min-w-[8rem]">
                        <span className="relative h-1.5 flex-1 rounded-full bg-track overflow-hidden"><span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.round((semanaHoy - inicio + 1) / f.weeks * 100)}%` }} /></span>
                        <span className="font-mono text-caption text-ink-3">{semanaHoy - inicio + 1}/{f.weeks}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-hairline" />

              {/* Macros por kg; los hidratos son lo que queda */}
              <div className="space-y-2">
                <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Macros por kg · los hidratos son el resto</p>
                <div className="grid grid-cols-3 gap-3">
                  <Campo etiqueta="Proteína">
                    <ConUnidad unidad="g/kg"><input aria-label="Proteína en g/kg" className={`${CAMPO} ${pocaProteina ? 'border-warning text-warning' : ''}`} value={f.proteinaGKg?.toLocaleString('es-ES') ?? ''} onChange={e => setFase(idx, { proteinaGKg: num(e.target.value) ?? undefined })} /></ConUnidad>
                    {m && <span className={`font-mono text-caption ${pocaProteina ? 'text-warning' : 'text-success'}`}>{m.p} g · {pocaProteina ? `por debajo de ${proteinaMin.toLocaleString('es-ES')}` : `≥ ${proteinaMin.toLocaleString('es-ES')} ✓`}</span>}
                  </Campo>
                  <Campo etiqueta="Grasa">
                    <ConUnidad unidad="g/kg"><input aria-label="Grasa en g/kg" className={CAMPO} value={f.grasaGKg?.toLocaleString('es-ES') ?? ''} onChange={e => setFase(idx, { grasaGKg: num(e.target.value) ?? undefined })} /></ConUnidad>
                    {m && <span className="font-mono text-caption text-ink-3">{m.g} g</span>}
                  </Campo>
                  <Campo etiqueta="Hidratos">
                    <p className="rounded-field border border-dashed border-control-line px-3 py-2 font-mono text-body font-semibold text-accent-ink">{m ? `${m.hc} g` : '—'}</p>
                    <span className="font-mono text-caption text-ink-3">sale solo</span>
                  </Campo>
                </div>
              </div>

              <div className="border-t border-hairline" />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Campo etiqueta="Pasos al día">
                  <input aria-label="Pasos al día" className={CAMPO} inputMode="numeric" value={f.pasos ?? ''} placeholder={String(stepGoal)} onChange={e => setFase(idx, { pasos: num(e.target.value) ?? undefined })} />
                </Campo>
                <Campo etiqueta="Escalones">
                  <button type="button" onClick={() => setAbierta(f.id)} className={`${CAMPO} text-left font-sans font-bold ${f.escalon ? '' : 'text-ink-3'}`}>{f.escalon ? `${esc.length} · ${esc.filter(x => x.confirmado).length} ✓` : '+ Añadir'}</button>
                </Campo>
                <Campo etiqueta="Dieta" className="col-span-2 sm:col-span-1">
                  <select aria-label="Dieta" value={f.dietId} onChange={e => setFase(idx, { dietId: e.target.value })} className={`${CAMPO} font-sans font-bold`}>
                    <option value="">{m ? 'crear con sus macros' : 'sin dieta'}</option>
                    {diets.filter(d => !d.selfManaged && !d.menuTemplate).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Campo>
              </div>

              {aviso && <p className="font-sans text-caption text-warning">{aviso}</p>}
              <button type="button" onClick={() => setAbierta(abiertaEsta ? null : f.id)} className="flex items-center gap-1 font-mono text-caption text-ink-3 hover:text-ink">
                <Icon name={abiertaEsta ? 'expand_more' : 'chevron_right'} size="s" />Escalones, para qué es la fase y cardio
              </button>
              {abiertaEsta && <div className="rounded-field bg-raised/60 p-3"><DetalleFase f={f} idx={idx} form={form} cadena={c} macros={m} escalones={esc} setFase={setFase} dieta={dieta} /></div>}
            </div>
          );
        })}
      </section>

      {/* ── Lo de siempre semana a semana: ciclado, reglas, mínimos, comidas libres, suplementos ── */}
      {program && !dirty && (
        <NutritionPeriodizationPanel athleteEmail={athleteEmail} athleteName={athleteName} diets={diets} onboarding={onboarding} currentWeightKg={currentWeightKg} stepGoal={stepGoal} kcalPerStep={kcalPerStep} onDietsChanged={onDietsChanged} parte="semanas" />
      )}

      {/* ── Semana a semana ── */}
      {form.phases.length > 0 && (
        <section className="bg-surface border border-hairline rounded-surface p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-sans text-title-s font-bold text-ink flex items-center gap-2"><Icon name="calendar_view_week" size="m" className="text-accent-ink" />Semana a semana</p>
            <p className="font-mono text-caption text-ink-3">kcal y pasos se pueden tocar semana a semana · el resto sale de las fases</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse font-mono text-label">
              <thead><tr className="text-caption uppercase tracking-wider text-ink-3">
                {['Sem', 'Fechas', 'Fase', 'kcal', 'Pasos', 'Cardio', 'Peso esp.', 'Real'].map((h, i) => <th key={h} className={`border-b border-hairline px-1.5 py-1.5 font-medium ${i <= 2 ? 'text-left' : 'text-right'}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filas.map(fila => {
                  const s = semanas[fila.semana - 1];
                  const esHoy = fila.semana === semanaHoy;
                  const desde = computePhaseStartDate(form, fila.faseIdx);
                  const inicio = semanaInicialDeFase(form, fila.faseIdx);
                  const d0 = addDays(desde, (fila.semana - inicio) * 7);
                  return (
                    <tr key={fila.semana} className={`border-b border-hairline ${esHoy ? 'bg-accent-bg/30' : s?.futura ? 'text-ink-3' : ''}`}>
                      <td className="px-1.5 py-1 font-bold text-ink">S{fila.semana}</td>
                      <td className="px-1.5 py-1 text-ink-3">{fechaCorta(d0)} – {fechaCorta(addDays(d0, 6))}</td>
                      <td className="px-1.5 py-1">{fila.fase.name}</td>
                      <td className="px-1.5 py-1 text-right"><input className={`${CELDA} w-16`} inputMode="numeric" defaultValue={fila.kcal ?? ''} key={`k${fila.semana}_${fila.kcal}`} onBlur={e => tocarKcal(fila.semana, fila.kcal, num(e.target.value))} /></td>
                      <td className="px-1.5 py-1 text-right"><input className={`${CELDA} w-16`} inputMode="numeric" defaultValue={fila.pasos ?? ''} key={`p${fila.semana}_${fila.pasos}`} onBlur={e => tocarPasos(fila.semana, num(e.target.value))} /></td>
                      <td className="px-1.5 py-1 text-right text-ink-2">{fila.fase.cardio?.sesiones ? `${fila.fase.cardio.sesiones}× ${fila.fase.cardio.zona ?? ''} ${fila.fase.cardio.minutos ? `${fila.fase.cardio.minutos}′` : ''}`.trim() : '—'}</td>
                      <td className="px-1.5 py-1 text-right">{kg(s?.esperado)}</td>
                      <td className={`px-1.5 py-1 text-right ${s?.estado === 'por-encima' ? 'text-warning' : s?.estado === 'en-plan' ? 'text-success' : ''}`}>{kg(s?.real)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function mover(form: NutritionProgram, idx: number, dir: -1 | 1): NutritionProgram {
  const phases = [...form.phases]; const j = idx + dir;
  if (j < 0 || j >= phases.length) return form;
  [phases[idx], phases[j]] = [phases[j], phases[idx]];
  return { ...form, phases };
}

function Dato({ etiqueta, valor, nota, editable }: { etiqueta: string; valor: string; nota?: string; editable?: React.ReactNode }) {
  return (
    <div className="rounded-field border border-hairline bg-raised px-3 py-2">
      <p className="font-mono text-caption uppercase tracking-widest text-ink-3">{etiqueta}</p>
      <div className="flex items-baseline gap-2"><p className="font-sans text-title-s font-bold text-ink">{valor}</p>{editable}</div>
      {nota && <p className="font-mono text-caption text-ink-3 truncate">{nota}</p>}
    </div>
  );
}

function Campo({ etiqueta, className = '', children }: { etiqueta: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <p className="font-mono text-caption uppercase tracking-widest text-ink-3">{etiqueta}</p>
      {children}
    </div>
  );
}

function ConUnidad({ unidad, children }: { unidad: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-caption text-ink-3">{unidad}</span>
    </div>
  );
}

function Termino({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota: string }) {
  return (
    <div className="rounded-field border border-hairline bg-raised px-2.5 py-2 min-w-0">
      <p className="font-mono text-caption uppercase tracking-wide text-ink-3 truncate">{etiqueta}</p>
      <p className="font-sans text-title-m font-bold text-ink">{valor}</p>
      <p className="font-mono text-caption text-ink-3">{nota}</p>
    </div>
  );
}

// En móvil la cuenta va en rejilla de 2 y los signos sobran.
function Operador({ children }: { children: React.ReactNode }) {
  return <span aria-hidden="true" className="hidden sm:flex items-center font-mono text-title-s text-ink-3">{children}</span>;
}

function DetalleFase({ f, idx, form, cadena, macros, escalones, setFase, dieta }: {
  f: NutritionPhase; idx: number; form: NutritionProgram; cadena?: ReturnType<typeof encadenarFases>[number]; macros: ReturnType<typeof macrosPorKg> | null;
  escalones: Escalon[]; setFase: (idx: number, c: Partial<NutritionPhase>) => void; dieta?: Diet;
}) {
  const desde = computePhaseStartDate(form, idx);
  const hasta = addDays(desde, f.weeks * 7 - 1);
  const kcalFin = escalones.at(-1)?.kcal ?? f.targetKcal;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="space-y-2">
        <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Fechas y números</p>
        <p className="font-mono text-label text-ink-2">{fechaCorta(desde)} → {fechaCorta(hasta)} · semanas {semanaInicialDeFase(form, idx)}-{semanaInicialDeFase(form, idx) + f.weeks - 1}</p>
        {cadena && <p className="font-mono text-label text-ink-2">Peso {kg(cadena.pesoInicio)} → <b className="text-ink">{kg(cadena.pesoFinal)}</b> kg · {cadena.ritmoKgSem != null ? `${cadena.ritmoKgSem.toLocaleString('es-ES')} kg/sem` : ''} · {f.ritmoPctSem != null ? `${f.ritmoPctSem.toLocaleString('es-ES')} %/sem` : ''}</p>}
        <p className="font-mono text-label text-ink-2">kcal {miles(f.targetKcal)} al inicio → <b className="text-ink">{miles(kcalFin)}</b> al final{macros ? ` · P ${macros.p} g · G ${macros.g} g · HC ${macros.hc} g` : ''}</p>
        <p className="font-mono text-label text-ink-2">Dieta: {dieta ? <b className="text-ink">{dieta.name}</b> : macros ? <span className="text-accent-ink">se crea «{f.name}» con esos macros al publicar</span> : <span className="text-warning">sin dieta ni macros</span>}</p>
      </div>
      <div className="space-y-2">
        <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Escalones · cada N semanas</p>
        <div className="flex flex-wrap items-center gap-2 font-mono text-label text-ink-2">
          cada <input className={`${CELDA_S} w-10`} inputMode="numeric" value={f.escalon?.cadaSemanas ?? ''} placeholder="—" onChange={e => { const n = num(e.target.value); setFase(idx, { escalon: n ? { ...(f.escalon ?? { kcal: 0 }), cadaSemanas: Math.max(1, Math.round(n)) } : undefined }); }} /> sem
          <input className={`${CELDA_S} w-14`} inputMode="numeric" value={f.escalon?.kcal ?? ''} placeholder="±kcal" onChange={e => setFase(idx, { escalon: { ...(f.escalon ?? { cadaSemanas: 3 }), kcal: num(e.target.value) ?? 0 } })} /> kcal
          <input className={`${CELDA_S} w-14`} inputMode="numeric" value={f.escalon?.pasos ?? ''} placeholder="±pasos" onChange={e => setFase(idx, { escalon: { ...(f.escalon ?? { cadaSemanas: 3, kcal: 0 }), pasos: num(e.target.value) ?? undefined } })} /> pasos
        </div>
        {f.escalon && (
          <ul className="space-y-1">
            {escalones.map(e => (
              <li key={e.desde} className="flex justify-between gap-2 font-mono text-label rounded-control bg-surface border border-hairline px-2 py-1">
                <span className="text-ink">S{e.desde}-S{e.hasta}</span><span className="text-ink-2">{miles(e.kcal)} kcal{e.pasos != null ? ` · ${miles(e.pasos)} pasos` : ''}</span>
                <span className={`text-caption ${e.confirmado ? 'text-success' : 'text-ink-3'}`}>{e.confirmado ? '✓ programado' : 'se programa al publicar'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-2">
        <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Para el atleta</p>
        <input className={`${CELDA} text-left font-sans`} placeholder="Para qué es esta fase, con tus palabras (lo lee en su Road map)" value={f.paraQue ?? ''} onChange={e => setFase(idx, { paraQue: e.target.value })} />
        <div className="flex flex-wrap items-center gap-2 font-mono text-label text-ink-2">Cardio
          <input className={`${CELDA_S} w-10`} inputMode="numeric" value={f.cardio?.sesiones ?? ''} placeholder="0" onChange={e => setFase(idx, { cardio: { ...(f.cardio ?? { sesiones: 0 }), sesiones: num(e.target.value) ?? 0 } })} /> ×
          <input className={`${CELDA_S} w-12`} inputMode="numeric" value={f.cardio?.minutos ?? ''} placeholder="min" onChange={e => setFase(idx, { cardio: { ...(f.cardio ?? { sesiones: 0 }), minutos: num(e.target.value) ?? undefined } })} /> min
          <input className={`${CELDA_S} w-28 text-left`} placeholder="zona 2" value={f.cardio?.zona ?? ''} onChange={e => setFase(idx, { cardio: { ...(f.cardio ?? { sesiones: 0 }), zona: e.target.value || undefined } })} />
        </div>
        <p className="font-sans text-caption text-ink-3">Ciclado entreno/descanso, reglas por peso, mínimos, comidas libres y suplementos: en «Semanas de la periodización», debajo, una vez publicado.</p>
      </div>
    </div>
  );
}

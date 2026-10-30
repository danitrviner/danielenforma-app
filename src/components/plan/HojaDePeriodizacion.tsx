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

   Versión «hoja de control» que eligió Dani entre tres: una fila por fase
   con todo lo que fija (objetivo, ritmo, semanas, macros por kg, pasos,
   cardio, escalones, dieta) y lo que sale solo (peso al final, kcal,
   gramos, déficit); una fila de detalle desplegable con el resto; la barra
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
const CELDA_RO = 'font-mono text-label text-ink-2 text-right px-1.5';
const CELDA_S = CELDA.replace('w-full ', '');

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Dato etiqueta="Mantenimiento" valor={mantenimiento != null ? miles(mantenimiento) : '—'} nota="estimado (Mifflin + actividad)" />
          <Dato etiqueta="Pasos → kcal" valor={`+${miles(pasosKcal(form.phases[0]?.pasos))}`} nota={`${miles(form.phases[0]?.pasos ?? stepGoal)} × ${kcalPerStep}`} />
          <Dato etiqueta="Proteína mín." valor="" nota="g/kg · doctrina §7" editable={<input className={`${CELDA} w-16 text-left font-sans text-title-s font-bold`} defaultValue={String(proteinaMin).replace('.', ',')} onBlur={e => { const n = num(e.target.value); if (n) setForm({ ...form, proteinaMinGKg: n }); }} />} />
          <Dato etiqueta="Acelerada" valor={`≤ ${ACELERADA.maxSemanas} sem`} nota={`proteína ${ACELERADA.proteinaGKg[0]}-${ACELERADA.proteinaGKg[1]} g/kg · luego salida`} />
        </div>
        {pesoInicio == null && <p className="font-sans text-caption text-warning">Sin peso del atleta no se puede calcular nada: que registre un peso o ponlo en su alta.</p>}
      </section>

      {/* ── Fases de comida ── */}
      <section className="bg-surface border border-hairline rounded-surface p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-sans text-title-s font-bold text-ink flex items-center gap-2"><Icon name="nutrition" size="m" className="text-accent-ink" />Fases de comida</p>
          <p className="font-mono text-caption text-ink-3">cada casilla con borde se edita · lo demás sale solo · ▸ abre el detalle</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse font-mono text-label">
            <thead><tr className="text-caption uppercase tracking-wider text-ink-3">
              {['', 'Fase', 'Objetivo', 'Sem', 'Ritmo %/sem', 'Peso', 'kcal inicio', 'Déficit/día', 'P · G g/kg', 'Pasos', 'Escalones', 'Dieta', ''].map((h, i) => (
                <th key={i} className={`border-b border-hairline px-1.5 py-1.5 font-medium ${i <= 2 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {form.phases.map((f, idx) => {
                const c = cadena[idx];
                const m = macrosDe(f, idx);
                const deficit = mantenimiento != null && f.targetKcal != null ? f.targetKcal - mantenimiento - pasosKcal(f.pasos) : null;
                const esc = escalonesDeFase(form, diets, idx, stepGoal);
                const dieta = diets.find(d => d.id === f.dietId);
                const aviso = avisoAcelerada(f);
                const abiertaEsta = abierta === f.id;
                const inicio = semanaInicialDeFase(form, idx);
                const enCurso = semanaHoy >= inicio && semanaHoy < inicio + f.weeks;
                return (
                  <React.Fragment key={f.id}>
                    <tr className={`border-b border-hairline ${enCurso ? 'bg-accent-bg/30' : ''}`}>
                      <td className="px-1 py-1.5"><button type="button" aria-label={abiertaEsta ? 'Cerrar detalle' : 'Abrir detalle'} onClick={() => setAbierta(abiertaEsta ? null : f.id)} className="text-ink-3 hover:text-ink"><Icon name={abiertaEsta ? 'expand_more' : 'chevron_right'} size="s" /></button></td>
                      <td className="px-1.5 py-1.5"><input className={`${CELDA} text-left w-40 font-sans font-bold`} value={f.name} onChange={e => setFase(idx, { name: e.target.value })} /></td>
                      <td className="px-1.5 py-1.5">
                        <select value={f.objetivo ?? ''} onChange={e => { const o = (e.target.value || undefined) as ObjetivoCorporalTipo | undefined; setFase(idx, { objetivo: o, phaseType: o ? phaseTypeDeObjetivo(o) : undefined, ritmoPctSem: ritmoPorDefecto(o), modo: 'ritmo' }); }} className={`${CELDA} text-left w-40`}>
                          <option value="">—</option>
                          {OBJETIVOS_ORDEN.map(o => <option key={o} value={o}>{OBJETIVO_LABEL[o]}</option>)}
                        </select>
                      </td>
                      <td className="px-1.5 py-1.5"><input className={`${CELDA} w-12`} inputMode="numeric" value={f.weeks} onChange={e => { const n = num(e.target.value); if (n != null) setFase(idx, { weeks: Math.max(1, Math.round(n)) }); }} /></td>
                      <td className="px-1.5 py-1.5">
                        <input className={`${CELDA} w-16`} value={(f.ritmoPctSem ?? 0).toLocaleString('es-ES')} onChange={e => { const n = num(e.target.value); if (n != null) setFase(idx, { ritmoPctSem: n, modo: 'ritmo' }); }} />
                        <div className="flex gap-1 justify-end mt-0.5">
                          {(['suave', 'normal', 'rapido'] as const).map(k => (
                            <button key={k} type="button" onClick={() => setFase(idx, { ritmoPctSem: RITMOS[k] * (f.objetivo === 'volumen' || f.objetivo === 'salida_deficit' ? 1 : -1), modo: 'ritmo' })} className="font-mono text-[10px] uppercase text-ink-3 hover:text-accent-ink">{k}</button>
                          ))}
                        </div>
                      </td>
                      <td className={CELDA_RO}>{c ? <><span className="text-ink-3">{kg(c.pesoInicio)} →</span> <b className="text-ink">{kg(c.pesoFinal)}</b><div className="text-caption text-ink-3">{c.ritmoKgSem != null ? `${c.ritmoKgSem > 0 ? '+' : ''}${c.ritmoKgSem.toLocaleString('es-ES')} kg/sem` : ''}</div></> : '—'}</td>
                      <td className="px-1.5 py-1.5">
                        <input className={`${CELDA} w-16`} inputMode="numeric" value={f.targetKcal ?? ''} placeholder={dieta ? String(resolvePhaseTargetKcal(f, dieta).kcal ?? '') : ''} onChange={e => setFase(idx, { targetKcal: num(e.target.value) ?? undefined })} />
                        {kcalInicioSugerida(idx) != null && kcalInicioSugerida(idx) !== f.targetKcal && (
                          <button type="button" onClick={() => setFase(idx, { targetKcal: kcalInicioSugerida(idx)! })} className="block ml-auto mt-0.5 font-mono text-[10px] uppercase text-accent-ink">sugerir {miles(kcalInicioSugerida(idx))}</button>
                        )}
                      </td>
                      <td className={`${CELDA_RO} ${deficit != null && deficit < 0 ? 'text-accent-ink' : ''}`}>{deficit != null ? `${deficit > 0 ? '+' : ''}${miles(deficit)}` : '—'}</td>
                      <td className="px-1.5 py-1.5">
                        <div className="flex gap-1 justify-end items-center">
                          <input className={`${CELDA} w-11 ${f.proteinaGKg != null && f.proteinaGKg < proteinaMin ? 'border-warning text-warning' : ''}`} value={f.proteinaGKg?.toLocaleString('es-ES') ?? ''} onChange={e => setFase(idx, { proteinaGKg: num(e.target.value) ?? undefined })} />
                          <span className="text-ink-3">·</span>
                          <input className={`${CELDA} w-11`} value={f.grasaGKg?.toLocaleString('es-ES') ?? ''} onChange={e => setFase(idx, { grasaGKg: num(e.target.value) ?? undefined })} />
                        </div>
                        {m && <div className="text-caption text-ink-3 text-right mt-0.5 whitespace-nowrap">{m.p} · {m.g} · HC {m.hc} g</div>}
                      </td>
                      <td className="px-1.5 py-1.5"><input className={`${CELDA} w-16`} inputMode="numeric" value={f.pasos ?? ''} placeholder={String(stepGoal)} onChange={e => setFase(idx, { pasos: num(e.target.value) ?? undefined })} /></td>
                      <td className={CELDA_RO}>{f.escalon ? `${esc.length} · ${esc.filter(x => x.confirmado).length} ✓` : <span className="text-ink-3">—</span>}</td>
                      <td className="px-1.5 py-1.5">
                        <select value={f.dietId} onChange={e => setFase(idx, { dietId: e.target.value })} className={`${CELDA} text-left w-32`}>
                          <option value="">{m ? 'crear con sus macros' : 'sin dieta'}</option>
                          {diets.filter(d => !d.selfManaged && !d.menuTemplate).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1.5 text-right whitespace-nowrap">
                        <button type="button" aria-label="Subir" disabled={idx === 0} onClick={() => setForm(mover(form, idx, -1))} className="text-ink-3 hover:text-ink disabled:opacity-30"><Icon name="arrow_upward" size="s" /></button>
                        <button type="button" aria-label="Bajar" disabled={idx === form.phases.length - 1} onClick={() => setForm(mover(form, idx, 1))} className="text-ink-3 hover:text-ink disabled:opacity-30"><Icon name="arrow_downward" size="s" /></button>
                        <button type="button" aria-label="Borrar fase" onClick={() => setForm({ ...form, phases: form.phases.filter((_, i) => i !== idx) })} className="text-ink-3 hover:text-danger ml-1"><Icon name="delete" size="s" /></button>
                      </td>
                    </tr>
                    {(aviso || abiertaEsta) && (
                      <tr className="border-b border-hairline bg-raised/60">
                        <td colSpan={13} className="px-3 py-3">
                          {aviso && <p className="font-sans text-caption text-warning mb-2">{aviso}</p>}
                          {abiertaEsta && <DetalleFase f={f} idx={idx} form={form} cadena={c} macros={m} escalones={esc} setFase={setFase} dieta={dieta} />}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
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

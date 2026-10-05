import React, { useMemo, useState } from 'react';
import { Icon, Button, Select, Sheet, Dialog, SegmentedControl, Input, Stepper } from '../ui';
import { MUSCLE_LABELS, type Mesocycle, type MuscleGroup, type WorkoutExercise, type WorkoutLog, type WorkoutSetGroup } from '../../types';
import { resolverEjercicioDelMeso } from '../../utils/progression';
import { syncAggregateFromGroups } from '../../utils/setGroups';
import {
  programarCambio, quitarCambiosDeSemana, tieneCambiosEn, rirDescendente, subirSeries, seriesDe, type EjercicioDelDia,
} from '../../utils/semanasDelBloque';
import {
  claveEjercicioClave, describirCelda, prescritoEn, cambiaEn, realDeLaSemana,
} from '../../utils/planificadorProgresion';
import type { AvisoDeSemana } from './BarraDeSemanas';

export interface DiaPlanificable {
  /** Clave del grupo en MesocycleManager (workoutIds unidos). */
  clave: string;
  name: string;
  dayIndex?: number;
  workoutIds: string[];
  exercises: WorkoutExercise[];
}

interface Props {
  dias: DiaPlanificable[];
  vueltas: number;
  meso: Mesocycle;
  cicloDias: number;
  logs?: WorkoutLog[];
  semanaActual?: number;
  nombreDe: (id: string) => string;
  grupoDe: (we: WorkoutExercise) => MuscleGroup | undefined;
  /** Avisos de volumen (MEV/MRV) del bloque entero con los ejercicios dados. */
  avisosDe: (ejercicios: EjercicioDelDia[]) => Record<number, AvisoDeSemana[]>;
  onCancelar: () => void;
  onAceptar: (dias: { clave: string; exercises: WorkoutExercise[] }[], seleccion: string[]) => void;
}

const DESCANSOS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const fmtDescanso = (s: number) => s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
const kg = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`;
const mismo = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * «Planificar progresión»: el coach elige unos pocos ejercicios de todo el
 * bloque (los básicos de Empuje A, B, C…) y los programa semana a semana en
 * una tabla, sin recorrer los días uno por uno. Nada se guarda hasta
 * «Aceptar cambios»; entonces se escriben las mismas reglas por semana que
 * usa la barra de semanas, así que el atleta, el calendario y los informes
 * lo leen como siempre.
 */
export default function PlanificadorProgresion(p: Props) {
  const clavesValidas = useMemo(
    () => new Set(p.dias.flatMap(d => d.exercises.map(we => claveEjercicioClave(d, we.exerciseId)))),
    [p.dias],
  );
  const recordadas = (p.meso.ejerciciosClave ?? []).filter(k => clavesValidas.has(k));

  const [paso, setPaso] = useState<'elegir' | 'tabla'>(recordadas.length > 0 ? 'tabla' : 'elegir');
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(recordadas));
  const [borrador, setBorrador] = useState<Record<string, WorkoutExercise[]>>(
    () => Object.fromEntries(p.dias.map(d => [d.clave, d.exercises])),
  );
  const [editando, setEditando] = useState<{ clave: string; exIdx: number; semana: number } | null>(null);
  const [progresiones, setProgresiones] = useState(false);
  const [descartar, setDescartar] = useState(false);

  const descargas = p.meso.semanasDescarga ?? [];
  const tests = p.meso.semanasTest ?? [];
  const semanas = Array.from({ length: p.vueltas + 1 }, (_, i) => i);

  const diasCambiados = p.dias.filter(d => !mismo(borrador[d.clave], d.exercises));
  const ejerciciosCambiados = p.dias.reduce(
    (n, d) => n + (borrador[d.clave] ?? []).filter((we, i) => !mismo(we, d.exercises[i])).length, 0);

  const filas = p.dias.flatMap(d => (borrador[d.clave] ?? []).map((we, exIdx) => ({ d, exIdx, we }))
    .filter(f => seleccion.has(claveEjercicioClave(f.d, f.we.exerciseId))));

  const modificar = (clave: string, exIdx: number, fn: (we: WorkoutExercise) => WorkoutExercise) =>
    setBorrador(prev => ({ ...prev, [clave]: prev[clave].map((w, i) => i === exIdx ? fn(w) : w) }));

  const avisos = p.avisosDe(p.dias.flatMap(d => (borrador[d.clave] ?? []).map(we => ({ we, dia: d.name }))));

  const aceptar = () => p.onAceptar(
    diasCambiados.map(d => ({ clave: d.clave, exercises: borrador[d.clave] })),
    [...seleccion],
  );
  const cancelar = () => { if (ejerciciosCambiados > 0) setDescartar(true); else p.onCancelar(); };

  const dialogoDescartar = (
    <Dialog open={descartar} onClose={() => setDescartar(false)} size="s" title="¿Descartar los cambios?"
      footer={<>
        <Button variant="ghost" onClick={() => setDescartar(false)}>Seguir editando</Button>
        <Button variant="danger" onClick={p.onCancelar}>Descartar</Button>
      </>}>
      <p className="font-sans text-label text-ink-2">
        Tienes {ejerciciosCambiados} ejercicio{ejerciciosCambiados === 1 ? '' : 's'} con cambios sin guardar. Si sales ahora se pierden.
      </p>
    </Dialog>
  );

  // ── Paso 1: elegir ejercicios ─────────────────────────────────────────────
  if (paso === 'elegir') {
    return (
      <>
        <SelectorDeEjercicios
          dias={p.dias}
          seleccion={seleccion}
          onSeleccion={setSeleccion}
          nombreDe={p.nombreDe}
          grupoDe={p.grupoDe}
          onCancelar={cancelar}
          onContinuar={() => setPaso('tabla')}
        />
        {dialogoDescartar}
      </>
    );
  }

  // ── Paso 2: tabla semana a semana ─────────────────────────────────────────
  const celdaEditada = editando ? borrador[editando.clave]?.[editando.exIdx] : undefined;
  const totales = semanas.map(s => filas.reduce((n, f) => n + seriesDe(s === 0 ? f.we : resolverEjercicioDelMeso(f.we, p.meso, s)), 0));
  const semanasConAviso = Object.keys(avisos).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-hairline rounded-surface px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
          <Icon name="tune" size="s" className="text-accent-ink" />
          <p className="font-sans font-bold text-body-s text-ink">Planificar progresión</p>
          <p className="font-mono text-caption text-ink-3">{filas.length} ejercicio{filas.length === 1 ? '' : 's'} · {p.vueltas} semanas de ciclo</p>
          <div className="ml-auto flex flex-wrap gap-2 [&_button]:whitespace-nowrap">
            <Button size="s" variant="ghost" icon="checklist" onClick={() => setPaso('elegir')}>Cambiar ejercicios</Button>
            <Button size="s" variant="ghost" icon="trending_up" disabled={filas.length === 0} onClick={() => setProgresiones(true)}>Progresiones</Button>
          </div>
        </div>
        <p className="font-sans text-caption text-ink-2">
          Toca una casilla para cambiar esa semana. Lo que cambies se mantiene las semanas siguientes hasta que cambies otra cosa.
          En las semanas ya hechas ves debajo lo que hizo: <span className="text-success font-bold">verde</span> si cumplió, <span className="text-warning font-bold">ámbar</span> si se quedó corto.
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="bg-surface border border-dashed border-hairline rounded-surface px-4 py-8 text-center space-y-3">
          <p className="font-sans text-label text-ink-2">No has elegido ningún ejercicio.</p>
          <Button size="s" icon="checklist" onClick={() => setPaso('elegir')}>Elegir ejercicios</Button>
        </div>
      ) : (
        <div className="bg-surface border border-hairline rounded-surface overflow-x-auto">
          <table className="border-separate border-spacing-0 min-w-full">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-[1] bg-surface border-b border-r border-hairline px-3 py-2 text-left font-mono text-caption font-bold uppercase tracking-wider text-ink-3 min-w-[8.5rem] sm:min-w-[12rem]">
                  Ejercicio
                </th>
                {semanas.map(s => {
                  const aviso = avisos[s]?.some(a => a.tono === 'peligro') ? 'peligro' : avisos[s]?.length ? 'aviso' : null;
                  return (
                    <th key={s} scope="col" title={avisos[s]?.map(a => a.texto).join(' · ')}
                      className={`border-b border-hairline px-1.5 py-2 text-center min-w-[6.75rem] ${s === p.semanaActual ? 'bg-accent/8' : ''}`}>
                      <span className="inline-flex items-center gap-1">
                        <span className={`font-mono text-caption font-bold ${s === p.semanaActual ? 'rounded-[5px] bg-accent px-1 text-on-accent' : 'text-ink'}`}>
                          {s === 0 ? 'Base' : `S${s}`}
                        </span>
                        {descargas.includes(s) && <span className="font-mono text-[9px] leading-[11px] font-bold text-info border border-info rounded-[5px] px-0.5" title="Descarga: la mitad de series">D</span>}
                        {tests.includes(s) && <span className="font-mono text-[9px] leading-[11px] font-bold text-warning border border-warning rounded-[5px] px-0.5" title="Semana de test">T</span>}
                        {aviso && <span className={`w-1.5 h-1.5 rounded-full ${aviso === 'peligro' ? 'bg-danger' : 'bg-warning'}`} aria-hidden />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filas.map(({ d, exIdx, we }) => {
                const conCambios = (we.weeklyProgression ?? []).some(r => r.cambios);
                return (
                  <tr key={`${d.clave}#${exIdx}`}>
                    <th scope="row" className="sticky left-0 z-[1] bg-surface border-b border-r border-hairline px-3 py-2 text-left align-top">
                      <p className="font-sans font-bold text-label text-ink leading-snug">{p.nombreDe(we.exerciseId)}</p>
                      <p className="font-sans text-caption text-ink-3">
                        {[d.name, p.grupoDe(we) ? MUSCLE_LABELS[p.grupoDe(we)!] : null].filter(Boolean).join(' · ')}
                      </p>
                      {conCambios && (
                        <button type="button" onClick={() => modificar(d.clave, exIdx, w => {
                          const reglas = (w.weeklyProgression ?? []).filter(r => !r.cambios);
                          const { weeklyProgression: _v, ...resto } = w;
                          return reglas.length > 0 ? { ...resto, weeklyProgression: reglas } : resto;
                        })} className="mt-1 inline-flex items-center gap-1 font-sans text-caption font-bold text-ink-3 hover:text-danger">
                          <Icon name="refresh" size="s" />Quitar cambios
                        </button>
                      )}
                    </th>
                    {semanas.map(s => {
                      const r = prescritoEn(we, s);
                      const c = describirCelda(r);
                      const cambia = cambiaEn(we, s);
                      const propio = s > 0 && tieneCambiosEn(we, s);
                      const solo = s > 0 && (we.weeklyProgression ?? []).some(x => x.cambios && x.atWeek === s && x.soloEstaSemana);
                      const otro = s > 0 && r.exerciseId !== we.exerciseId;
                      const real = s > 0 && p.logs ? realDeLaSemana(p.logs, p.meso, p.cicloDias, d.workoutIds, we, s) : null;
                      const enDescarga = descargas.includes(s);
                      return (
                        <td key={s} className={`border-b border-hairline p-1 align-top ${s === p.semanaActual ? 'bg-accent/8' : ''}`}>
                          <button
                            type="button"
                            onClick={() => setEditando({ clave: d.clave, exIdx, semana: s })}
                            title={[
                              s === 0 ? 'Base del bloque' : `Semana ${s}`,
                              `${c.esquema} · ${c.rir} · descanso ${fmtDescanso(r.restSeconds)}`,
                              solo ? 'Solo esta semana' : null,
                              real ? `Hecho el ${real.fecha}: ${real.hechas}/${real.pautadas} series${real.mejor ? ` · mejor serie ${kg(real.mejor.weight)} × ${real.mejor.repsDone}` : ''}` : null,
                              real?.novedadesVistas === true ? 'Leyó el aviso de cambios' : real?.novedadesVistas === false ? 'No leyó el aviso de cambios' : null,
                            ].filter(Boolean).join('\n')}
                            className={`relative w-full rounded-control border px-2 py-1.5 text-left transition-colors ${
                              cambia ? 'border-accent bg-accent/12' : 'border-hairline bg-bg hover:border-strong'}`}
                          >
                            {propio && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />}
                            {otro && <span className="block font-sans text-caption font-bold text-accent-ink truncate">{p.nombreDe(r.exerciseId)}</span>}
                            <span className={`block font-mono text-label font-bold tabular-nums ${cambia || s === 0 ? 'text-ink' : 'text-ink-2'}`}>{c.esquema}</span>
                            <span className="block font-mono text-caption text-ink-3 tabular-nums">
                              {c.rir}{solo ? ' · solo' : ''}
                            </span>
                            {enDescarga && (
                              <span className="block font-mono text-caption text-info tabular-nums">hace {seriesDe(resolverEjercicioDelMeso(we, p.meso, s))}</span>
                            )}
                            {real && (
                              <span className={`mt-1 flex items-center gap-1 border-t border-hairline pt-1 font-mono text-caption tabular-nums ${real.cumple ? 'text-success' : 'text-warning'}`}>
                                {real.mejor ? `${real.mejor.weight.toLocaleString('es-ES')}×${real.mejor.repsDone}` : 'sin series'}
                                <span className="text-ink-3">{real.hechas}/{real.pautadas}</span>
                                {real.novedadesVistas && <Icon name="visibility" size="s" className="text-ink-3" />}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <th scope="row" className="sticky left-0 z-[1] bg-surface border-r border-hairline px-3 py-2 text-left font-mono text-caption font-bold uppercase tracking-wider text-ink-3">
                  Series de la selección
                </th>
                {totales.map((t, s) => (
                  <td key={s} className={`px-2 py-2 text-center font-mono text-label font-bold tabular-nums ${
                    s > 0 && t !== totales[s - 1] ? 'text-accent-ink' : 'text-ink-2'} ${s === p.semanaActual ? 'bg-accent/8' : ''}`}>
                    {t}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {semanasConAviso.length > 0 && (
        <div className="bg-surface border border-hairline rounded-surface px-4 py-2.5 space-y-1">
          {semanasConAviso.flatMap(s => avisos[s].map((a, i) => (
            <p key={`${s}-${i}`} className={`flex items-center gap-1.5 font-sans text-caption ${a.tono === 'peligro' ? 'text-danger' : 'text-warning'}`}>
              <Icon name="warning" size="s" /><span className="font-mono font-bold">S{s}</span> {a.texto}
            </p>
          )))}
        </div>
      )}

      <div className="sticky bottom-0 z-[2] flex items-center gap-3 flex-wrap rounded-surface border border-accent-line bg-surface px-4 py-3 shadow-lg">
        <p className="font-sans font-bold text-body-s text-ink">
          {ejerciciosCambiados > 0
            ? `${ejerciciosCambiados} ejercicio${ejerciciosCambiados === 1 ? '' : 's'} con cambios sin guardar`
            : 'Sin cambios'}
        </p>
        <div className="ml-auto flex gap-2">
          <Button size="s" variant="ghost" onClick={cancelar}>Cancelar</Button>
          <Button size="s" icon="done" onClick={aceptar}>Aceptar cambios</Button>
        </div>
      </div>

      <Sheet open={editando !== null && !!celdaEditada} onClose={() => setEditando(null)} size="m"
        title={editando && celdaEditada ? `${p.nombreDe(celdaEditada.exerciseId)} · ${editando.semana === 0 ? 'Base' : `Semana ${editando.semana}`}` : ''}>
        {editando && celdaEditada && (
          <EditorDeCelda
            key={`${editando.clave}#${editando.exIdx}#${editando.semana}`}
            we={celdaEditada}
            semana={editando.semana}
            vueltas={p.vueltas}
            descarga={descargas.includes(editando.semana)}
            onAplicar={(editado, solo) => {
              const { clave, exIdx, semana } = editando;
              modificar(clave, exIdx, w => semana === 0
                ? { ...editado, weeklyProgression: w.weeklyProgression }
                : withReglas(w, programarCambio(w, semana, solo, editado)));
              setEditando(null);
            }}
            onQuitar={() => {
              const { clave, exIdx, semana } = editando;
              modificar(clave, exIdx, w => withReglas(w, quitarCambiosDeSemana(w, semana)));
              setEditando(null);
            }}
          />
        )}
      </Sheet>

      <ProgresionesDeLaSeleccion
        open={progresiones}
        onClose={() => setProgresiones(false)}
        vueltas={p.vueltas}
        cuantos={filas.length}
        onAplicar={fn => {
          setBorrador(prev => {
            const next = { ...prev };
            for (const { d, exIdx } of filas) {
              next[d.clave] = next[d.clave].map((w, i) => i === exIdx ? withReglas(w, fn(w, descargas)) : w);
            }
            return next;
          });
          setProgresiones(false);
        }}
      />

      {dialogoDescartar}
    </div>
  );
}

function withReglas(we: WorkoutExercise, reglas: WorkoutExercise['weeklyProgression']): WorkoutExercise {
  const { weeklyProgression: _v, ...resto } = we;
  return reglas && reglas.length > 0 ? { ...resto, weeklyProgression: reglas } : resto;
}

// ── Selector de ejercicios ──────────────────────────────────────────────────

function SelectorDeEjercicios({ dias, seleccion, onSeleccion, nombreDe, grupoDe, onCancelar, onContinuar }: {
  dias: DiaPlanificable[];
  seleccion: Set<string>;
  onSeleccion: (s: Set<string>) => void;
  nombreDe: (id: string) => string;
  grupoDe: (we: WorkoutExercise) => MuscleGroup | undefined;
  onCancelar: () => void;
  onContinuar: () => void;
}) {
  const [filtro, setFiltro] = useState<MuscleGroup | ''>('');
  const grupos = [...new Set(dias.flatMap(d => d.exercises.map(grupoDe)).filter((g): g is MuscleGroup => !!g))];
  const alternar = (claves: string[], marcar: boolean) => {
    const n = new Set(seleccion);
    for (const k of claves) { if (marcar) n.add(k); else n.delete(k); }
    onSeleccion(n);
  };
  const chip = (activo: boolean) => `rounded-chip border px-2.5 py-1 font-sans text-caption font-bold transition-colors ${
    activo ? 'border-accent text-accent-ink bg-accent/12' : 'border-hairline text-ink-2 hover:text-ink hover:border-strong'}`;

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-hairline rounded-surface px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Icon name="checklist" size="s" className="text-accent-ink" />
          <p className="font-sans font-bold text-body-s text-ink">Elige los ejercicios que quieres progresar</p>
        </div>
        <p className="font-sans text-caption text-ink-2">
          Solo esos saldrán en la tabla semana a semana. La próxima vez que entres ya estarán marcados.
        </p>
        {grupos.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por grupo muscular">
            <button type="button" aria-pressed={filtro === ''} onClick={() => setFiltro('')} className={chip(filtro === '')}>Todos</button>
            {grupos.map(g => (
              <button key={g} type="button" aria-pressed={filtro === g} onClick={() => setFiltro(filtro === g ? '' : g)} className={chip(filtro === g)}>
                {MUSCLE_LABELS[g]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
        {dias.map(d => {
          const visibles = d.exercises.filter(we => !filtro || grupoDe(we) === filtro);
          if (visibles.length === 0) return null;
          const claves = [...new Set(visibles.map(we => claveEjercicioClave(d, we.exerciseId)))];
          const todos = claves.every(k => seleccion.has(k));
          return (
            <section key={d.clave} className="bg-surface border border-hairline rounded-surface overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-bg border-b border-hairline">
                <p className="font-sans font-bold text-body-s text-ink truncate flex-1">{d.name}</p>
                <button type="button" onClick={() => alternar(claves, !todos)} className="font-sans text-caption font-bold text-accent-ink hover:text-ink">
                  {todos ? 'Ninguno' : 'Todos'}
                </button>
              </div>
              <ul className="p-1.5 space-y-0.5">
                {visibles.map((we, i) => {
                  const k = claveEjercicioClave(d, we.exerciseId);
                  const marcado = seleccion.has(k);
                  const c = describirCelda(we);
                  return (
                    <li key={`${we.exerciseId}-${i}`}>
                      <button type="button" role="checkbox" aria-checked={marcado} onClick={() => alternar([k], !marcado)}
                        className={`w-full flex items-center gap-2.5 rounded-control px-2 py-2 text-left transition-colors ${marcado ? 'bg-accent/8' : 'hover:bg-inset'}`}>
                        <Icon name={marcado ? 'check_box' : 'check_box_outline_blank'} size="s" className={marcado ? 'text-accent-ink' : 'text-ink-3'} filled={marcado} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-sans font-bold text-label text-ink truncate">{nombreDe(we.exerciseId)}</span>
                          <span className="block font-sans text-caption text-ink-3">
                            {[grupoDe(we) ? MUSCLE_LABELS[grupoDe(we)!] : null, `${c.esquema} · ${c.rir}`].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-[2] flex items-center gap-3 flex-wrap rounded-surface border border-accent-line bg-surface px-4 py-3 shadow-lg">
        <p className="font-sans font-bold text-body-s text-ink">
          {seleccion.size === 0 ? 'Ningún ejercicio elegido' : `${seleccion.size} ejercicio${seleccion.size === 1 ? '' : 's'} elegido${seleccion.size === 1 ? '' : 's'}`}
        </p>
        <div className="ml-auto flex gap-2">
          <Button size="s" variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button size="s" iconTrailing="arrow_forward" disabled={seleccion.size === 0} onClick={onContinuar}>Continuar</Button>
        </div>
      </div>
    </div>
  );
}

// ── Editor de una casilla ───────────────────────────────────────────────────

function EditorDeCelda({ we, semana, vueltas, descarga, onAplicar, onQuitar }: {
  /** El ejercicio de la base, con sus reglas. */
  we: WorkoutExercise;
  semana: number;
  vueltas: number;
  descarga: boolean;
  onAplicar: (editado: WorkoutExercise, solo: boolean) => void;
  onQuitar: () => void;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip.tsx). */
  key?: React.Key;
}) {
  const inicial = prescritoEn(we, semana);
  const [f, setF] = useState<WorkoutExercise>(inicial);
  const [solo, setSolo] = useState(() => (we.weeklyProgression ?? []).some(r => r.cambios && r.atWeek === semana && r.soloEstaSemana));
  const conBloques = (f.setGroups?.length ?? 0) > 0;
  const tieneCambio = semana > 0 && tieneCambiosEn(we, semana);
  const descansos = DESCANSOS.includes(f.restSeconds) ? DESCANSOS : [...DESCANSOS, f.restSeconds].sort((a, b) => a - b);
  const rirOpciones = [0, 1, 2, 3, 4, 5].map(n => ({ value: String(n), label: `RIR ${n}` }));
  const setBloque = (i: number, patch: Partial<WorkoutSetGroup>) =>
    setF(prev => syncAggregateFromGroups({ ...prev, setGroups: prev.setGroups!.map((g, j) => j === i ? { ...g, ...patch } : g) }));

  return (
    <div className="space-y-4">
      {semana > 0 && (
        <div className="space-y-1.5">
          <SegmentedControl
            label="Hasta cuándo"
            value={solo ? 'solo' : 'desde'}
            onChange={v => setSolo(v === 'solo')}
            options={[
              { value: 'desde', label: semana < vueltas ? `Desde S${semana}` : `S${semana}` },
              ...(semana < vueltas ? [{ value: 'solo', label: `Solo S${semana}` }] : []),
            ]}
          />
          <p className="font-sans text-caption text-ink-3">
            {solo
              ? `Vale solo para la semana ${semana}; la ${semana + 1} vuelve a lo anterior.`
              : `Se mantiene desde la semana ${semana} hasta que cambies otra cosa.`}
            {descarga && ' Es semana de descarga: el atleta hará la mitad de series de lo que pongas.'}
          </p>
        </div>
      )}

      {conBloques ? (
        <div className="space-y-3">
          {f.setGroups!.map((g, i) => (
            <div key={i} className="rounded-control border border-hairline bg-raised px-3 py-2.5 space-y-2">
              <p className="font-sans font-bold text-label text-ink">{g.label || `Bloque ${i + 1}`}</p>
              <div className="flex items-end gap-3 flex-wrap">
                <CampoSeries value={g.sets} max={10} onChange={v => setBloque(i, { sets: v })} />
                <Input label="Reps" value={g.reps} onChange={v => setBloque(i, { reps: v })} className="w-24" />
                <Select label="RIR" value={String(g.rir)} options={rirOpciones} onChange={v => setBloque(i, { rir: Number(v) })} className="w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-end gap-3 flex-wrap">
          <CampoSeries value={f.sets} max={12} onChange={v => setF(prev => ({ ...prev, sets: v }))} />
          <Input label="Reps" value={f.reps} onChange={v => setF(prev => ({ ...prev, reps: v }))} className="w-24" />
          <Select label="RIR" value={String(f.rir)} options={rirOpciones} onChange={v => setF(prev => ({ ...prev, rir: Number(v) }))} className="w-28" />
        </div>
      )}
      <Select label="Descanso" value={String(f.restSeconds)} className="w-40"
        options={descansos.map(s => ({ value: String(s), label: fmtDescanso(s) }))}
        onChange={v => setF(prev => ({ ...prev, restSeconds: Number(v) }))} />

      <div className="flex items-center gap-2 flex-wrap pt-1">
        {tieneCambio && <Button size="s" variant="ghost" icon="refresh" onClick={onQuitar}>Quitar cambios de S{semana}</Button>}
        <Button size="s" icon="done" className="ml-auto" onClick={() => onAplicar(f, solo)}>Aplicar</Button>
      </div>
    </div>
  );
}

/** El Stepper solo lleva etiqueta accesible: aquí hace falta verla, al lado
 *  de «Reps» y «RIR». */
function CampoSeries({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3" aria-hidden>Series</span>
      <Stepper dense label="Series" value={value} min={1} max={max} onChange={onChange} />
    </div>
  );
}

// ── Progresiones en un clic, solo para la selección ─────────────────────────

function ProgresionesDeLaSeleccion({ open, onClose, vueltas, cuantos, onAplicar }: {
  open: boolean;
  onClose: () => void;
  vueltas: number;
  cuantos: number;
  onAplicar: (fn: (we: WorkoutExercise, descargas: number[]) => WorkoutExercise['weeklyProgression']) => void;
}) {
  const [rirDesde, setRirDesde] = useState('3');
  const [rirHasta, setRirHasta] = useState('0');
  const [seriesCada, setSeriesCada] = useState('2');
  const [seriesHasta, setSeriesHasta] = useState(String(Math.max(2, vueltas - 1)));
  const rir = [0, 1, 2, 3, 4, 5].map(n => ({ value: String(n), label: `RIR ${n}` }));
  return (
    <Sheet open={open} onClose={onClose} title="Progresiones a la selección">
      <div className="space-y-5">
        <p className="font-sans text-label text-ink-2">
          Se aplican solo a los {cuantos} ejercicios de la tabla. Luego puedes retocar cualquier casilla. No se guarda nada hasta que aceptes.
        </p>
        <section className="space-y-2">
          <p className="font-sans font-bold text-body-s text-ink">RIR que baja a lo largo del bloque</p>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Primera semana" value={rirDesde} onChange={setRirDesde} options={rir} />
            <Select label="Última semana" value={rirHasta} onChange={setRirHasta} options={rir} />
          </div>
          <p className="font-sans text-caption text-ink-3">Se reparte entre las semanas que no son de descarga.</p>
          <Button size="s" icon="trending_down" onClick={() => onAplicar((we, descargas) => rirDescendente(we, vueltas, Number(rirDesde), Number(rirHasta), descargas))}>
            Aplicar RIR
          </Button>
        </section>
        <section className="space-y-2">
          <p className="font-sans font-bold text-body-s text-ink">Subir series</p>
          <div className="grid grid-cols-2 gap-3">
            <Select label="+1 serie cada" value={seriesCada} onChange={setSeriesCada} options={[1, 2, 3, 4].map(n => ({ value: String(n), label: n === 1 ? 'semana' : `${n} semanas` }))} />
            <Select label="Hasta la semana" value={seriesHasta} onChange={setSeriesHasta}
              options={Array.from({ length: Math.max(1, vueltas - 1) }, (_, i) => ({ value: String(i + 2), label: `S${i + 2}` }))} />
          </div>
          <p className="font-sans text-caption text-ink-3">Con bloques (top set + back-off), la serie va al último bloque.</p>
          <Button size="s" icon="add" onClick={() => onAplicar(we => subirSeries(we, Number(seriesCada), Number(seriesHasta)))}>Aplicar series</Button>
        </section>
      </div>
    </Sheet>
  );
}

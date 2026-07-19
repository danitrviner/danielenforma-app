import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, OnboardingTemplate, OnboardingTemplateQuestion, OnboardingSection, Recipe } from '../types';
import { getAllUsersAdmin, updateUserProfile, getOnboardingTemplate, saveOnboardingTemplate } from '../dbService';
import { db, doc, writeBatch } from '../firebase';
import QuestionnaireManagerScreen from './QuestionnaireManagerScreen';
import Skeleton from './Skeleton';

const OWNER_EMAIL = 'danitrviner@gmail.com';

type SettingsTab = 'roles' | 'cuestionarios' | 'ficha' | 'biblioteca';

// ── Default template questions ────────────────────────────────────────────────

function genId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
}

export const DEFAULT_TEMPLATE_QUESTIONS: Omit<OnboardingTemplateQuestion, 'id'>[] = [
  // ENTRENAMIENTO
  { label: 'Años entrenando',                                            section: 'entrenamiento', type: 'numeric', unit: 'años'      },
  { label: 'Días disponibles por semana',                                section: 'entrenamiento', type: 'numeric', unit: 'días/sem'   },
  { label: 'Tiempo por sesión',                                          section: 'entrenamiento', type: 'numeric', unit: 'min'        },
  { label: 'Dónde entrena',                                              section: 'entrenamiento', type: 'choice',  options: ['Casa', 'Gym', 'Mixto'] },
  { label: 'Experiencia con básicos (sentadilla / peso muerto / press)', section: 'entrenamiento', type: 'scale',   scaleMin: 1, scaleMax: 10 },
  { label: 'Limitaciones de movilidad',                                  section: 'entrenamiento', type: 'text'    },
  { label: 'Lesiones por articulación',                                  section: 'entrenamiento', type: 'text'    },
  { label: 'Pasos por día aproximados',                                  section: 'entrenamiento', type: 'numeric', unit: 'pasos/día'  },
  { label: 'Preferencia de cardio',                                      section: 'entrenamiento', type: 'choice',  options: ['HIIT', 'LISS', 'Mixto', 'Ninguna'] },
  // NUTRICIÓN
  { label: 'Comidas por día',                                            section: 'nutricion', type: 'numeric', unit: 'comidas'        },
  { label: 'Horario habitual de comidas',                                section: 'nutricion', type: 'text'                            },
  { label: 'Quién cocina / nivel de cocina',                             section: 'nutricion', type: 'choice',  options: ['Yo cocino', 'Cocinamos en casa', 'Poco / delivery', 'Prep semanal'] },
  { label: 'Consumo de agua por día',                                    section: 'nutricion', type: 'numeric', unit: 'litros/día'     },
  { label: 'Alcohol por semana',                                         section: 'nutricion', type: 'numeric', unit: 'unidades/sem'   },
  { label: 'Frecuencia comer fuera',                                     section: 'nutricion', type: 'choice',  options: ['Nunca / raramente', '1-2 veces/sem', '3-4 veces/sem', 'Diario'] },
  { label: 'Suplementos actuales',                                       section: 'nutricion', type: 'text'                            },
  { label: 'Relación con la comida / atracones',                         section: 'nutricion', type: 'scale',   scaleMin: 1, scaleMax: 10 },
  { label: 'Intolerancias alimentarias',                                 section: 'nutricion', type: 'text'                            },
  // DESCANSO
  { label: 'Horas de sueño',                                            section: 'descanso', type: 'numeric', unit: 'h/noche'         },
  { label: 'Calidad de sueño',                                          section: 'descanso', type: 'scale',   scaleMin: 1, scaleMax: 10 },
  { label: 'Hora de acostarse y levantarse',                             section: 'descanso', type: 'text'                             },
  { label: 'Nivel de estrés',                                           section: 'descanso', type: 'scale',   scaleMin: 1, scaleMax: 10 },
  { label: 'Energía diaria',                                            section: 'descanso', type: 'scale',   scaleMin: 1, scaleMax: 10 },
  { label: 'Tipo de trabajo',                                           section: 'descanso', type: 'choice',  options: ['Sedentario', 'Mixto', 'Activo / de pie', 'Trabajo físico'] },
  { label: 'Dolores o molestias recurrentes',                           section: 'descanso', type: 'text'                             },
  { label: 'Recuperación percibida entre sesiones',                     section: 'descanso', type: 'scale',   scaleMin: 1, scaleMax: 10 },
];

function makeDefaultTemplate(coachEmail: string): OnboardingTemplate {
  return {
    coachEmail,
    questions: DEFAULT_TEMPLATE_QUESTIONS.map(q => ({ ...q, id: genId() })),
  };
}

// ── Section metadata ──────────────────────────────────────────────────────────

const SECTION_META: Record<OnboardingSection, { icon: string; label: string }> = {
  entrenamiento: { icon: 'fitness_center', label: 'Entrenamiento'              },
  nutricion:     { icon: 'restaurant',     label: 'Nutrición'                  },
  descanso:      { icon: 'bedtime',        label: 'Descanso / Recuperación'    },
};

const TYPE_LABEL: Record<OnboardingTemplateQuestion['type'], string> = {
  numeric: 'Numérico', scale: 'Escala', choice: 'Opción', text: 'Texto libre',
};

const MINI = 'bg-[#0e0e0e] border border-white/7 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]/70 w-full';

// ── Template editor component ─────────────────────────────────────────────────

function OnboardingTemplateEditor({ coachEmail }: { coachEmail: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['onboardingTemplate', coachEmail] as const;
  const { data: fetchedTemplate, isPending: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const tpl = await getOnboardingTemplate(coachEmail);
        return tpl ?? makeDefaultTemplate(coachEmail);
      } catch {
        return makeDefaultTemplate(coachEmail);
      }
    },
  });
  const [template, setTemplate] = useState<OnboardingTemplate | null>(null);
  const [saving, setSaving]     = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [optionInput, setOptionInput] = useState('');
  const [dirty, setDirty]       = useState(false);

  // Seeds the local editing buffer once the fetch resolves. Guarded to only
  // fire while `template` is still unset, so a background refetch (react-query
  // may re-fetch on window refocus once the 60s staleTime elapses) can't
  // silently clobber an in-progress edit — the old effect only ever ran once
  // per mount anyway, since it had no refetch mechanism at all.
  useEffect(() => {
    if (fetchedTemplate && template === null) setTemplate(fetchedTemplate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedTemplate]);

  const questions = template?.questions ?? [];

  const updateQ = (id: string, patch: Partial<OnboardingTemplateQuestion>) => {
    setTemplate(prev => prev ? {
      ...prev,
      questions: prev.questions.map(q => q.id === id ? { ...q, ...patch } : q),
    } : prev);
    setDirty(true);
  };

  const deleteQ = (id: string) => {
    setTemplate(prev => prev ? { ...prev, questions: prev.questions.filter(q => q.id !== id) } : prev);
    setDirty(true);
    if (editingId === id) setEditingId(null);
  };

  const addQ = (section: OnboardingSection) => {
    const newQ: OnboardingTemplateQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      label: '', section, type: 'text',
    };
    setTemplate(prev => prev ? { ...prev, questions: [...prev.questions, newQ] } : prev);
    setEditingId(newQ.id);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    try {
      await saveOnboardingTemplate(coachEmail, template);
      queryClient.setQueryData(queryKey, template);
      setDirty(false);
    } catch (err) {
      console.error(err);
    } finally { setSaving(false); }
  };

  const handleReset = () => {
    setTemplate(makeDefaultTemplate(coachEmail));
    setDirty(true);
    setEditingId(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-mono text-[10px] text-[#555] uppercase tracking-widest">Plantilla de ficha de iniciación</p>
          <p className="font-mono text-[9px] text-[#444] mt-0.5">
            Define las preguntas que el coach rellena para cada atleta. Los atletas no ven esto.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleReset}
            className="px-3 py-1.5 font-mono text-[10px] uppercase border border-white/7 text-[#c6c9ab] hover:text-white rounded-lg transition-all">
            Restaurar por defecto
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !dirty}
            className="px-3 py-1.5 font-sans text-[10px] uppercase bg-[#fbcb1a] text-black font-bold rounded-lg hover:bg-[#d4a800] disabled:opacity-50 transition-all">
            {saving ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </div>
      </div>

      {/* Section editors */}
      {(['entrenamiento', 'nutricion', 'descanso'] as OnboardingSection[]).map(section => {
        const meta = SECTION_META[section];
        const qs   = questions.filter(q => q.section === section);
        return (
          <div key={section} className="bg-[#0e0e0e] border border-white/7 rounded-xl p-5 space-y-4">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[#fbcb1a] flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">{meta.icon}</span>
              {meta.label}
              <span className="ml-auto font-mono text-[9px] text-[#555] normal-case font-normal">{qs.length} pregunta{qs.length !== 1 ? 's' : ''}</span>
            </h4>

            {qs.length === 0 && (
              <p className="font-mono text-[9px] text-[#555] italic">Sin preguntas en esta sección.</p>
            )}

            <div className="space-y-3">
              {qs.map(q => (
                <div key={q.id} className={`border rounded-lg transition-all ${editingId === q.id ? 'border-[#fbcb1a]/30 bg-[#111]' : 'border-[#1e1e1e] bg-[#0a0a0a]'}`}>
                  {editingId === q.id ? (
                    /* Inline editor */
                    <div className="p-3 space-y-2">
                      <input value={q.label} placeholder="Etiqueta de la pregunta"
                        onChange={e => updateQ(q.id, { label: e.target.value })}
                        className={MINI} />
                      <div className="flex gap-1.5 flex-wrap">
                        {(['numeric', 'scale', 'text', 'choice'] as const).map(t => (
                          <button key={t} type="button"
                            onClick={() => updateQ(q.id, { type: t })}
                            className={`px-2.5 py-1 rounded font-mono text-[9px] font-bold uppercase border transition-all ${
                              q.type === t ? 'bg-[#fbcb1a] text-black border-transparent' : 'text-[#c6c9ab] border-white/7 hover:text-white'
                            }`}>
                            {TYPE_LABEL[t]}
                          </button>
                        ))}
                      </div>
                      {q.type === 'numeric' && (
                        <input value={q.unit ?? ''} placeholder="Unidad (ej: kg, min, pasos/día)"
                          onChange={e => updateQ(q.id, { unit: e.target.value || undefined })}
                          className={MINI} />
                      )}
                      {q.type === 'scale' && (
                        <div className="flex gap-2">
                          <input type="number" value={q.scaleMin ?? 1} placeholder="Min"
                            onChange={e => updateQ(q.id, { scaleMin: Number(e.target.value) })}
                            className="w-20 bg-[#0e0e0e] border border-white/7 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none" />
                          <input type="number" value={q.scaleMax ?? 10} placeholder="Max"
                            onChange={e => updateQ(q.id, { scaleMax: Number(e.target.value) })}
                            className="w-20 bg-[#0e0e0e] border border-white/7 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none" />
                        </div>
                      )}
                      {q.type === 'choice' && (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap gap-1">
                            {(q.options ?? []).map(opt => (
                              <span key={opt} className="flex items-center gap-1 bg-[#2a2a2a] text-white px-2 py-0.5 rounded-full text-[9px] font-mono">
                                {opt}
                                <button type="button"
                                  onClick={() => updateQ(q.id, { options: (q.options ?? []).filter(o => o !== opt) })}
                                  className="text-[#c6c9ab] hover:text-red-400">
                                  <span className="material-symbols-outlined" style={{ fontSize: '9px' }}>close</span>
                                </button>
                              </span>
                            ))}
                          </div>
                          <input value={optionInput} placeholder="Nueva opción + Enter"
                            onChange={e => setOptionInput(e.target.value)}
                            onKeyDown={e => {
                              if ((e.key === 'Enter' || e.key === ',') && optionInput.trim()) {
                                e.preventDefault();
                                updateQ(q.id, { options: [...(q.options ?? []), optionInput.trim()] });
                                setOptionInput('');
                              }
                            }}
                            className={MINI} />
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 bg-[#fbcb1a] text-black font-sans text-[9px] font-bold uppercase rounded hover:bg-[#d4a800]">
                          ✓ Listo
                        </button>
                        <button type="button" onClick={() => deleteQ(q.id)}
                          className="px-2.5 py-1 font-mono text-[10px] uppercase text-red-400 border border-red-500/30 rounded hover:bg-red-500/10">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Compact view */
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border flex-shrink-0 ${
                        q.type === 'numeric' ? 'text-[#ffa500] border-[#ffa500]/20 bg-[#ffa500]/5' :
                        q.type === 'scale'   ? 'text-[#00eefc] border-[#00eefc]/20 bg-[#00eefc]/5' :
                        q.type === 'choice'  ? 'text-[#fbcb1a] border-[#fbcb1a]/20 bg-[#fbcb1a]/5' :
                                               'text-[#c6c9ab] border-[#3a3a3a] bg-[#1e1e1b]'
                      }`}>{TYPE_LABEL[q.type]}</span>
                      <span className="flex-1 text-sm text-white font-mono truncate min-w-0">
                        {q.label || <em className="text-[#555]">sin etiqueta</em>}
                      </span>
                      {q.unit && <span className="text-[9px] text-[#555] font-mono flex-shrink-0">{q.unit}</span>}
                      <button type="button" onClick={() => { setEditingId(q.id); setOptionInput(''); }}
                        className="p-1 text-[#c6c9ab] hover:text-[#00eefc] transition-colors flex-shrink-0">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>edit</span>
                      </button>
                      <button type="button" onClick={() => deleteQ(q.id)}
                        className="p-1 text-[#3a3a3a] hover:text-red-400 transition-colors flex-shrink-0">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button type="button" onClick={() => addQ(section)}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-[#c6c9ab] hover:text-[#fbcb1a] border border-dashed border-white/7 hover:border-[#fbcb1a]/30 px-3 py-2 rounded-lg w-full justify-center transition-all">
              <span className="material-symbols-outlined text-sm">add</span>
              Añadir pregunta
            </button>
          </div>
        );
      })}

      {dirty && (
        <div className="flex justify-end">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-4 py-2 font-sans text-xs uppercase bg-[#fbcb1a] text-black font-bold rounded-lg hover:bg-[#d4a800] disabled:opacity-50 transition-all">
            {saving ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Indya import panel ────────────────────────────────────────────────────────

interface IndyaMacros {
  carbohydrate?: { grams: number };
  protein?:      { grams: number };
  fat?:          { grams: number };
}
interface IndyaRawRecipe {
  id: string;
  name: string;
  image?: string;
  ingredients?: Array<{ name: string; quantity: number }>;
  steps?: Array<{ position: number; description: string }>;
  macros?: IndyaMacros;
  kcal?: number;
  weight?: number;
  cookingTime?: number;
  difficulty?: number;
  tupper?: boolean;
  intakeTypes?: number[];
  categoria?: string;
}

function roundQ(x: number): number { return Math.round(x / 0.25) * 0.25; }

function mapIndyaRecipe(r: IndyaRawRecipe): Omit<Recipe, 'id'> {
  const exchanges = {
    HC:    roundQ((r.macros?.carbohydrate?.grams ?? 0) / 25),
    PROT:  roundQ((r.macros?.protein?.grams     ?? 0) / 25),
    GRASA: roundQ((r.macros?.fat?.grams         ?? 0) / 11),
  };
  const out: Record<string, unknown> = {
    ownerId:     'indya',
    name:        r.name,
    categories:  r.categoria ? [r.categoria] : [],
    ingredients: [],
    extras:      [],
    steps:       [],
    exchanges,
  };
  if (r.image)               out.image           = r.image;
  if (r.ingredients?.length) out.ingredientsText = r.ingredients.map(i => ({ name: i.name, quantity: i.quantity }));
  if (r.steps?.length)       out.stepsText       = r.steps.map(s => ({ position: s.position, description: s.description }));
  if (r.macros)              out.macros          = { carb: r.macros.carbohydrate?.grams ?? 0, prot: r.macros.protein?.grams ?? 0, fat: r.macros.fat?.grams ?? 0 };
  if (r.kcal        != null) out.kcal            = r.kcal;
  if (r.weight      != null) out.weight          = r.weight;
  if (r.cookingTime != null) out.cookingTime     = r.cookingTime;
  if (r.difficulty  != null) out.difficulty      = r.difficulty;
  if (r.tupper      != null) out.tupper          = r.tupper;
  if (r.intakeTypes?.length) out.intakeTypes     = r.intakeTypes;
  if (r.categoria)           out.categoria       = r.categoria;
  return out as unknown as Omit<Recipe, 'id'>;
}

const IMPORT_BATCH = 499;
type ImportStatus = 'idle' | 'loading' | 'writing' | 'done' | 'error';

function IndyaImportPanel() {
  const [status,  setStatus]  = useState<ImportStatus>('idle');
  const [done,    setDone]    = useState(0);
  const [total,   setTotal]   = useState(0);
  const [phase,   setPhase]   = useState('');
  const [error,   setError]   = useState('');
  const [elapsed, setElapsed] = useState(0);

  const startImport = async () => {
    const t0 = Date.now();
    setStatus('loading');
    setDone(0);
    setTotal(0);
    setError('');

    try {
      setPhase('Leyendo índice…');
      const idxRes = await fetch('/indya/00_indice.json');
      const idx = await idxRes.json();
      const files: Array<{ archivo?: string; file?: string }> = idx.archivos ?? idx.files ?? [];

      const all: Array<{ id: string; data: Omit<Recipe, 'id'> }> = [];
      for (let fi = 0; fi < files.length; fi++) {
        const entry = files[fi];
        const fileName = entry.archivo ?? entry.file ?? String(entry);
        setPhase(`Leyendo archivo ${fi + 1} / ${files.length}: ${fileName}`);
        const res = await fetch(`/indya/${fileName}`);
        const raw = await res.json();
        const recs: IndyaRawRecipe[] = raw.recipes ?? raw.recetas ?? [];
        for (const r of recs) all.push({ id: r.id, data: mapIndyaRecipe(r) });
      }

      setTotal(all.length);
      setStatus('writing');

      const totalBatches = Math.ceil(all.length / IMPORT_BATCH);
      let written = 0;
      for (let bi = 0; bi < totalBatches; bi++) {
        const chunk = all.slice(bi * IMPORT_BATCH, (bi + 1) * IMPORT_BATCH);
        setPhase(`Batch ${bi + 1} / ${totalBatches} — ${chunk.length} recetas…`);
        const batch = writeBatch(db);
        for (const { id, data } of chunk) {
          batch.set(doc(db, 'recipes', id), data, { merge: true });
        }
        await batch.commit();
        written += chunk.length;
        setDone(written);
      }

      setElapsed(Math.round((Date.now() - t0) / 1000));
      setStatus('done');
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  };

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="bg-[#0e0e0e] border border-white/7 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#00eefc] flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">library_books</span>
          Importar biblioteca Indya
        </h3>
        <p className="font-mono text-[9px] text-[#555] mt-1">
          8 850 recetas · idempotente · lotes de {IMPORT_BATCH} · UPSERT por UUID
        </p>
      </div>

      {status === 'idle' && (
        <button
          onClick={startImport}
          className="px-4 py-2 bg-[#00eefc]/10 border border-[#00eefc]/30 text-[#00eefc] hover:bg-[#00eefc]/20 font-mono text-xs uppercase tracking-wider rounded-lg transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">upload</span>
          Importar / Reimportar
        </button>
      )}

      {(status === 'loading' || status === 'writing') && (
        <div className="space-y-3">
          <p className="font-mono text-[10px] text-[#c6c9ab] animate-pulse">{phase}</p>
          {total > 0 && (
            <>
              <div className="w-full h-2.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00eefc] transition-all duration-300 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[9px] text-[#555]">
                <span>{done.toLocaleString('es')} / {total.toLocaleString('es')} recetas</span>
                <span>{pct}%</span>
              </div>
            </>
          )}
        </div>
      )}

      {status === 'done' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[#fbcb1a] font-mono text-xs font-bold">
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            {done.toLocaleString('es')} recetas importadas en {elapsed}s
          </div>
          <button
            onClick={startImport}
            className="px-3 py-1.5 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-[10px] uppercase rounded-lg transition-all"
          >
            Reimportar
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3">
          <p className="font-mono text-[10px] text-red-400 bg-red-500/5 border border-red-500/20 rounded p-3 break-all">
            {error}
          </p>
          <button
            onClick={startImport}
            className="px-3 py-1.5 border border-[#00eefc]/30 text-[#00eefc] hover:bg-[#00eefc]/10 font-mono text-[10px] uppercase rounded-lg transition-all"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  currentUserId:    string;
  currentUserEmail: string;
}

export default function CoachesScreen({ currentUserId, currentUserEmail }: Props) {
  const queryClient = useQueryClient();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('roles');
  const isOwnerOrDev = currentUserEmail.toLowerCase() === OWNER_EMAIL || import.meta.env.DEV;
  const usersQueryKey = ['allUsersAdmin'] as const;
  const { data: users = [], isPending: loading } = useQuery({
    queryKey: usersQueryKey,
    queryFn: getAllUsersAdmin,
  });
  const [updating, setUpdating] = useState<string | null>(null);

  const handleToggleRole = async (user: UserProfile) => {
    if (user.email.toLowerCase() === OWNER_EMAIL) return;
    if (user.userId === currentUserId) return;
    const newRole: 'coach' | 'client' = user.role === 'coach' ? 'client' : 'coach';
    setUpdating(user.userId);
    try {
      await updateUserProfile(user.userId, { role: newRole });
      queryClient.setQueryData<UserProfile[]>(usersQueryKey, prev =>
        prev?.map(u => u.userId === user.userId ? { ...u, role: newRole } : u));
    } catch (err) { console.error('Failed to update role:', err); }
    finally { setUpdating(null); }
  };

  const sortedUsers = [...users].sort((a, b) => {
    if (a.email.toLowerCase() === OWNER_EMAIL) return -1;
    if (b.email.toLowerCase() === OWNER_EMAIL) return 1;
    if (a.role === 'coach' && b.role !== 'coach') return -1;
    if (b.role === 'coach' && a.role !== 'coach') return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <div className="space-y-6">
      {/* Settings tabs */}
      <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1 w-fit flex-wrap">
        {([
          { id: 'roles',         label: 'Entrenadores',  icon: 'manage_accounts' },
          { id: 'cuestionarios', label: 'Cuestionarios', icon: 'quiz'            },
          { id: 'ficha',         label: 'Ficha',         icon: 'assignment'      },
          ...(isOwnerOrDev ? [{ id: 'biblioteca' as SettingsTab, label: 'Biblioteca', icon: 'library_books' }] : []),
        ] as { id: SettingsTab; label: string; icon: string }[]).map(t => (
          <button key={t.id} onClick={() => setSettingsTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-xs font-bold uppercase tracking-wider transition-all ${
              settingsTab === t.id ? 'bg-[#fbcb1a] text-black shadow-lg' : 'text-[#c6c9ab] hover:text-white'
            }`}>
            <span className="material-symbols-outlined text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {settingsTab === 'cuestionarios' && (
        <QuestionnaireManagerScreen coachId={currentUserId} />
      )}

      {settingsTab === 'ficha' && (
        <OnboardingTemplateEditor coachEmail={currentUserEmail} />
      )}

      {settingsTab === 'biblioteca' && isOwnerOrDev && (
        <IndyaImportPanel />
      )}

      {settingsTab === 'roles' && (<>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : sortedUsers.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/7 rounded-2xl">
            <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">group</span>
            <p className="text-[#c6c9ab] text-sm">Sin usuarios registrados todavía.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedUsers.map(user => {
              const isOwner   = user.email.toLowerCase() === OWNER_EMAIL;
              const isSelf    = user.userId === currentUserId;
              const isCoach   = user.role === 'coach';
              const canToggle = !isOwner && !isSelf;
              return (
                <div key={user.userId}
                  className={`bg-[#181816] border rounded-2xl p-4 flex items-center gap-4 ${isOwner ? 'border-[#fbcb1a]/30' : 'border-white/7'}`}>
                  <img src={user.avatarUrl} alt={user.displayName}
                    className="w-10 h-10 rounded-full object-cover border border-white/7 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-sans font-semibold text-white text-sm truncate">{user.displayName}</span>
                      {isOwner && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#fbcb1a]/15 text-[#fbcb1a] uppercase font-bold border border-[#fbcb1a]/25">PROPIETARIO</span>}
                      {isSelf && !isOwner && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#00eefc]/10 text-[#00eefc] uppercase border border-[#00eefc]/20">TÚ</span>}
                    </div>
                    <span className="font-mono text-xs text-[#c6c9ab] truncate block">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold border ${
                      isCoach ? 'bg-[#fbcb1a]/10 text-[#fbcb1a] border-[#fbcb1a]/20' : 'bg-[#2a2a2a] text-[#c6c9ab] border-[#3a3a3a]'
                    }`}>{isCoach ? 'Coach' : 'Atleta'}</span>
                    {canToggle && (
                      <button onClick={() => handleToggleRole(user)} disabled={updating === user.userId}
                        className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 border ${
                          isCoach ? 'border-red-500/40 text-red-400 hover:bg-red-500/10' : 'border-[#00eefc]/40 text-[#00eefc] hover:bg-[#00eefc]/10'
                        }`}>
                        {updating === user.userId
                          ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                          : isCoach ? 'Revocar' : 'Hacer Coach'
                        }
                      </button>
                    )}
                    {isOwner && <span className="text-[10px] font-mono text-[#c6c9ab] italic">Permanente</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 space-y-1">
          <p className="font-mono text-xs text-[#c6c9ab]">
            <span className="text-[#fbcb1a] font-bold">Colección Firestore:</span>{' '}
            <code className="text-white">user_profiles</code> · Doc ID: UID de Firebase Auth · Campo:{' '}
            <code className="text-white">role: 'coach' | 'client'</code>
          </p>
          <p className="font-mono text-xs text-[#c6c9ab]">
            Las reglas del servidor deben impedir que un cliente se auto-asigne <code className="text-white">coach</code>{' '}
            y que nadie modifique la cuenta propietaria.
          </p>
        </div>
      </>)}
    </div>
  );
}

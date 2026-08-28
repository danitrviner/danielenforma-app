import React, { useEffect, useMemo, useState } from 'react';
import { Roadmap, WeeklyChallenge, ChallengeTemplate, ChallengeKind, CardioSession } from '../../types';
import {
  getWeeklyChallenge, saveWeeklyChallenge, getWeeklyChallengesForAthlete,
  getChallengeTemplates, saveChallengeTemplate, deleteChallengeTemplate,
  getCardioSessionsSince,
} from '../../dbService';
import { isoWeekKey, isoWeekBounds, evaluateChallengeProgress, ChallengeData } from '../../utils/weeklyChallenge';
import { buildChallengeMemory } from '../../utils/challengeMemory';
import { addDays, getWeekStart } from '../../utils/trainingWeek';
import ChallengeOptionsPanel from './ChallengeOptionsPanel';
import { Icon } from '../ui';

const KIND_LABEL: Record<ChallengeKind, string> = {
  pasos_media: 'Media de pasos', pasos_total: 'Pasos totales', carga_ejercicio: 'Carga en un ejercicio',
  reps_ejercicio: 'Repeticiones a mismo peso', adherencia_dieta: 'Adherencia a la dieta',
  peso_objetivo: 'Peso objetivo', entrenos_completados: 'Entrenos completados',
  series_grupo: 'Series de un grupo muscular', cardio_zona2: 'Minutos en Zona 2',
  racha_registro: 'Racha de registro (hábito)',
  custom: 'Custom (sin métrica automática)',
};

interface Props {
  athleteEmail: string;
  challengeData: ChallengeData;
  roadmap: Roadmap;
  onSaveRoadmap: (updated: Roadmap) => Promise<void>;
}

interface AssignForm {
  target: 'esta' | 'siguiente';
  templateId: string;
  title: string;
  description: string;
  kind: ChallengeKind;
  unit: string;
  target_: number;
}

function emptyForm(): AssignForm {
  return { target: 'esta', templateId: '', title: '', description: '', kind: 'custom', unit: '', target_: 0 };
}

export default function ChallengeManager({ athleteEmail, challengeData, roadmap, onSaveRoadmap }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [current, setCurrent] = useState<WeeklyChallenge | null>(null);
  const [next, setNext] = useState<WeeklyChallenge | null>(null);
  const [previous, setPrevious] = useState<WeeklyChallenge | null>(null);
  const [history, setHistory] = useState<WeeklyChallenge[]>([]);
  const [templates, setTemplates] = useState<ChallengeTemplate[]>([]);
  const [cardioSessions, setCardioSessions] = useState<CardioSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [form, setForm] = useState<AssignForm>(emptyForm());
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tplForm, setTplForm] = useState({ title: '', description: '', kind: 'custom' as ChallengeKind, unit: '', defaultTarget: 0 });
  const [saving, setSaving] = useState(false);

  const nextWeekDay = addDays(today, 7);
  const prevWeekDay = addDays(getWeekStart(today), -7);
  const currentKey = isoWeekKey(today);
  const nextKey = isoWeekKey(nextWeekDay);
  const prevKey = isoWeekKey(prevWeekDay);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [curr, nxt, prev, hist, tpls, cardio] = await Promise.all([
        getWeeklyChallenge(athleteEmail, currentKey),
        getWeeklyChallenge(athleteEmail, nextKey),
        getWeeklyChallenge(athleteEmail, prevKey),
        getWeeklyChallengesForAthlete(athleteEmail),
        getChallengeTemplates(),
        // Ventana corta: el motor solo necesita 4 semanas de Zona 2.
        getCardioSessionsSince(athleteEmail, addDays(today, -35)).catch(() => [] as CardioSession[]),
      ]);
      if (cancelled) return;
      setCurrent(curr);
      setNext(nxt);
      setPrevious(prev);
      setHistory(hist);
      setTemplates(tpls);
      setCardioSessions(cardio);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteEmail]);

  function applyTemplate(templateId: string) {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) { setForm(f => ({ ...f, templateId })); return; }
    setForm(f => ({
      ...f, templateId, title: tpl.title, description: tpl.description, kind: tpl.kind, unit: tpl.unit,
      target_: tpl.defaultTarget ?? 0,
    }));
  }

  async function assign() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const day = form.target === 'esta' ? today : nextWeekDay;
      const { weekStart, weekEnd } = isoWeekBounds(day);
      const isoWeek = isoWeekKey(day);
      const challenge: WeeklyChallenge = {
        id: `${athleteEmail}_${isoWeek}`,
        athleteId: athleteEmail,
        isoWeek, weekStart, weekEnd,
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim(),
        origin: 'coach',
        templateId: form.templateId || undefined,
        metric: { unit: form.unit || 'unidades', target: form.target_ },
        status: 'activo',
        createdAt: new Date().toISOString(),
      };
      await saveWeeklyChallenge(challenge);
      if (form.target === 'esta') setCurrent(challenge); else setNext(challenge);
      setHistory(h => [challenge, ...h.filter(c => c.id !== challenge.id)]);
      setForm(emptyForm());
      setShowAssign(false);
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate() {
    if (!tplForm.title.trim()) return;
    setSaving(true);
    try {
      const tpl: ChallengeTemplate = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId: 'coach',
        kind: tplForm.kind, title: tplForm.title.trim(), description: tplForm.description.trim(),
        unit: tplForm.unit, defaultTarget: tplForm.defaultTarget || undefined,
      };
      await saveChallengeTemplate(tpl);
      setTemplates(t => [...t, tpl]);
      setTplForm({ title: '', description: '', kind: 'custom', unit: '', defaultTarget: 0 });
      setShowTemplateForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(id: string) {
    setTemplates(t => t.filter(x => x.id !== id));
    await deleteChallengeTemplate(id);
  }

  // El historial y el cardio los carga este panel, así que se inyectan en los
  // datos que bajan al generador: sin ellos el motor rotaría sobre una sola
  // semana y no podría proponer retos de Zona 2.
  const enrichedData: ChallengeData = useMemo(
    () => ({ ...challengeData, history, cardioSessions }),
    [challengeData, history, cardioSessions],
  );

  // Cómo le está funcionando el sistema a este atleta. Un motor de retos sin
  // este número es fe ciega: si gana el 100% los retos son de adorno y si gana
  // el 20% ha dejado de leerlos.
  const memory = useMemo(() => buildChallengeMemory(history, currentKey), [history, currentKey]);

  if (loading) {
    return <p className="text-label text-ink-2 font-sans animate-pulse py-4">Cargando retos...</p>;
  }

  const currentProgress = current ? evaluateChallengeProgress(current, enrichedData, today) : null;
  const overwritingAuto = current?.origin === 'auto' && (current.progressValue ?? 0) > 0 && form.target === 'esta';
  const winPct = Math.round(memory.winRate * 100);
  // La diana del motor es ~65%: se afloja tras un fallo y se aprieta tras un
  // éxito holgado. Fuera de la banda 45-85% conviene que el coach mire.
  const dianaOk = memory.resolvedCount < 4 || (winPct >= 45 && winPct <= 85);

  return (
    <div className="space-y-5">
      {/* Salud del motor de retos */}
      {memory.resolvedCount > 0 && (
        <div className="bg-raised border border-hairline rounded-surface p-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Conseguidos</p>
            <p className="font-sans font-bold text-body-s" style={{ color: dianaOk ? 'var(--color-success)' : 'var(--color-warning)' }}>
              {memory.wonCount} de {memory.resolvedCount} · {winPct}%
            </p>
          </div>
          <div>
            <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Racha</p>
            <p className="font-sans font-bold text-body-s text-white">
              {memory.winStreak === 0 ? '—' : `${memory.winStreak} seguido${memory.winStreak === 1 ? '' : 's'}`}
            </p>
          </div>
          <p className="text-caption text-ink-3 font-sans flex-1 min-w-[12rem]">
            {memory.resolvedCount < 4
              ? 'Todavía pocos retos resueltos: el motor los está mandando suaves a propósito.'
              : dianaOk
                ? 'En la diana (45-85%). El listón se autorregula solo.'
                : winPct > 85
                  ? 'Se los está comiendo todos — el motor ya está subiendo el listón, pero puedes forzarlo asignando una opción "ambiciosa".'
                  : 'Está fallando demasiados. El motor ya está aflojando; revisa si el problema es el reto o el registro de datos.'}
          </p>
        </div>
      )}

      {/* Reto actual */}
      <div className="bg-surface border border-hairline rounded-surface p-4">
        <p className="font-sans text-caption uppercase tracking-widest text-ink-2 mb-2">Reto de esta semana</p>
        {current ? (
          <>
            <div className="flex items-center justify-between">
              <p className="font-sans font-bold text-white text-body-s">{current.title}</p>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {current.difficulty && (
                  <span className="font-mono text-caption uppercase px-2 rounded-full bg-white/5 text-ink-2">{current.difficulty}</span>
                )}
                <span className={`font-mono text-caption uppercase px-2 rounded-full ${
                  current.origin === 'coach' ? 'bg-data/15 text-data' : 'bg-white/5 text-ink-2'
                }`}>{current.origin === 'coach' ? 'asignado' : 'automático'}</span>
              </div>
            </div>
            <p className="text-label text-ink-2 font-sans mt-1">{current.description}</p>
            {currentProgress && (
              <div className="mt-2">
                <div className="h-2 rounded-full bg-bg overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, currentProgress.pct)}%` }} />
                </div>
                <p className="font-mono text-caption text-ink-2 mt-1">
                  {Math.round(currentProgress.progressValue)} / {current.metric.target} {current.metric.unit} · {current.status}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-label text-ink-3 font-sans">Sin reto todavía — se generará uno automático cuando el atleta abra su Roadmap.</p>
        )}
        {next && (
          <p className="font-sans text-caption text-ink-2 mt-3 pt-3 border-t border-hairline">
            Semana que viene: <span className="text-white">{next.title}</span> ({next.origin === 'coach' ? 'asignado' : 'automático'})
          </p>
        )}
      </div>

      {/* Opciones sugeridas */}
      <ChallengeOptionsPanel
        athleteEmail={athleteEmail}
        challengeData={enrichedData}
        roadmap={roadmap}
        onSaveRoadmap={onSaveRoadmap}
        previousKind={previous?.kind}
        currentChallenge={current}
        nextChallenge={next}
        onAssigned={(target, challenge) => {
          if (target === 'esta') setCurrent(challenge); else setNext(challenge);
          setHistory(h => [challenge, ...h.filter(c => c.id !== challenge.id)]);
        }}
      />

      {/* Asignar (custom) */}
      <div>
        <button
          onClick={() => setShowAssign(v => !v)}
          className="flex items-center gap-1 font-mono text-caption text-ink-2 hover:text-accent transition-colors border border-hairline px-3 py-2 rounded-control"
        >
          <Icon name={showAssign ? 'close' : 'add'} size="s" />
          {showAssign ? 'Cancelar' : 'Asignar reto'}
        </button>

        {showAssign && (
          <div className="bg-raised border border-hairline rounded-surface p-3 mt-2 space-y-2">
            <div className="flex gap-2">
              <select
                value={form.target}
                onChange={e => setForm(f => ({ ...f, target: e.target.value as AssignForm['target'] }))}
                className="bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
              >
                <option value="esta">Esta semana</option>
                <option value="siguiente">Semana que viene</option>
              </select>
              <select
                value={form.templateId}
                onChange={e => applyTemplate(e.target.value)}
                className="flex-1 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
              >
                <option value="">Custom (sin plantilla)</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Título del reto"
              className="w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
            />
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descripción"
              rows={2}
              className="w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent resize-none"
            />
            <div className="flex gap-2">
              <select
                value={form.kind}
                onChange={e => setForm(f => ({ ...f, kind: e.target.value as ChallengeKind }))}
                className="bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
              >
                {(Object.keys(KIND_LABEL) as ChallengeKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <input
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="unidad (kg, pasos...)"
                className="w-32 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
              />
              <input
                type="number"
                value={form.target_}
                onChange={e => setForm(f => ({ ...f, target_: Number(e.target.value) }))}
                placeholder="objetivo"
                className="w-24 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
              />
            </div>
            {overwritingAuto && (
              <p className="font-sans text-caption text-orange-400">
                Ya hay un reto automático en curso con progreso — se sobrescribirá.
              </p>
            )}
            <button
              onClick={assign}
              disabled={saving || !form.title.trim()}
              className="w-full py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? 'Asignando...' : 'Asignar reto'}
            </button>
          </div>
        )}
      </div>

      {/* Biblioteca de plantillas */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="font-mono text-caption uppercase tracking-widest text-ink-2">Biblioteca de retos</p>
          <button onClick={() => setShowTemplateForm(v => !v)} className="font-mono text-caption text-data hover:underline">
            {showTemplateForm ? 'Cancelar' : '+ Nueva plantilla'}
          </button>
        </div>
        {showTemplateForm && (
          <div className="bg-raised border border-hairline rounded-surface p-3 mb-2 space-y-2">
            <input
              value={tplForm.title}
              onChange={e => setTplForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Título"
              className="w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
            />
            <textarea
              value={tplForm.description}
              onChange={e => setTplForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descripción"
              rows={2}
              className="w-full bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent resize-none"
            />
            <div className="flex gap-2">
              <select
                value={tplForm.kind}
                onChange={e => setTplForm(f => ({ ...f, kind: e.target.value as ChallengeKind }))}
                className="bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
              >
                {(Object.keys(KIND_LABEL) as ChallengeKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <input
                value={tplForm.unit}
                onChange={e => setTplForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="unidad"
                className="w-24 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
              />
              <input
                type="number"
                value={tplForm.defaultTarget}
                onChange={e => setTplForm(f => ({ ...f, defaultTarget: Number(e.target.value) }))}
                placeholder="objetivo por defecto"
                className="w-28 bg-bg border border-hairline rounded-control p-2 text-title-s text-white focus:outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={saveTemplate}
              disabled={saving || !tplForm.title.trim()}
              className="w-full py-2 bg-data text-black font-sans font-bold text-label uppercase rounded-control hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              Guardar plantilla
            </button>
          </div>
        )}
        {templates.length === 0 ? (
          <p className="text-label text-ink-3 font-sans">Sin plantillas todavía.</p>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-center justify-between bg-surface border border-hairline rounded-surface p-3">
                <div>
                  <p className="text-label text-white font-sans font-bold">{t.title}</p>
                  <p className="text-caption text-ink-2 font-sans">{KIND_LABEL[t.kind]}</p>
                </div>
                <button onClick={() => removeTemplate(t.id)} className="text-ink-2 hover:text-red-400">
                  <Icon name="delete" size="s" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial */}
      {history.length > 0 && (
        <div>
          <p className="font-mono text-caption uppercase tracking-widest text-ink-2 mb-2">Historial</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.slice(0, 20).map(h => (
              <div key={h.id} className="flex items-center justify-between bg-surface border border-hairline rounded-surface p-3">
                <div className="min-w-0">
                  <p className="text-label text-white font-sans truncate">{h.title}</p>
                  <p className="text-caption text-ink-2 font-mono">{h.isoWeek}</p>
                </div>
                <span className={`font-mono text-caption uppercase px-2 rounded-full flex-shrink-0 ${
                  h.status === 'conseguido' ? 'bg-emerald-500/15 text-emerald-400' : h.status === 'fallido' ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-ink-2'
                }`}>{h.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

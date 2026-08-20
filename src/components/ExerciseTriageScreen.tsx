import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Exercise, MuscleGroup, MUSCLE_ORDER, MUSCLE_LABELS } from '../types';
import { getExercises, getWorkouts, updateExercise, deleteExercise, seedExercisesIfEmpty } from '../dbService';
import { useToast } from '../hooks/useToast';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { getOrigen, ordenarParaRevision, tieneInglesSinTraducir } from '../utils/ejerciciosOrigen';
import { haptics } from '../services/haptics';
import { ScreenSkeleton, Button, Icon, ProgressBar, EmptyState, SegmentedControl, Dialog } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Revisión del catálogo de ejercicios

   El catálogo son 1.721 ejercicios y solo 40 se escribieron a mano; los otros
   1.681 se importaron de un banco de vídeos y se tradujeron con un diccionario
   palabra por palabra. El resultado: nombres desordenados, inglés colado entre
   corchetes y ejercicios que no trabajan lo que su nombre dice. Ninguna curva
   de fuerza asignada, 285 sin grupo muscular.

   Esta pantalla existe porque revisar eso desde el diálogo de edición normal
   (abrir ficha, editar, guardar, cerrar, buscar la siguiente) son 30-40 s por
   ejercicio: más de quince horas. Aquí el objetivo es que una ficha se resuelva
   sin abrir ni cerrar nada, en un par de gestos.

   Tres decisiones que dan forma a todo lo demás:

   1. **El vídeo manda.** Es lo único que dice si el ejercicio trabaja lo que
      pone. Va grande, arriba, en bucle y sin sonido — no detrás de un clic.
   2. **El original en inglés siempre visible.** Sin él no se puede saber si un
      nombre raro es mala traducción o un ejercicio genuinamente raro.
   3. **La curva la decide el coach, sin sugerencia automática.** Decisión suya
      y deliberada: es criterio de entrenador, no un dato que rellenar.

   Teclado y táctil a la vez, porque la revisión se hace a ratos en el
   ordenador y a ratos en el móvil. En el ordenador todo se resuelve sin ratón;
   en el móvil los botones son la interfaz y no se muestra ningún atajo.
   ═══════════════════════════════════════════════════════════════════════════ */

interface ExerciseTriageScreenProps {
  onClose?: () => void;
}

type Curva = NonNullable<Exercise['strengthCurve']>;
type Prioridad = NonNullable<Exercise['prioridad']>;

const CURVAS: { valor: Curva; label: string; tecla: string; ayuda: string }[] = [
  { valor: 'estiramiento', label: 'Estiramiento', tecla: '1', ayuda: 'Pico de tensión con el músculo alargado' },
  { valor: 'campana',      label: 'Campana',      tecla: '2', ayuda: 'Pico a mitad del recorrido' },
  { valor: 'acortamiento', label: 'Acortamiento', tecla: '3', ayuda: 'Pico en contracción máxima' },
];

const PRIORIDADES: { valor: Prioridad; label: string; tecla: string }[] = [
  { valor: 'alta',   label: 'La uso',    tecla: 'Q' },
  { valor: 'normal', label: 'Normal',    tecla: 'W' },
  { valor: 'baja',   label: 'Al fondo',  tecla: 'E' },
];

const MODOS = [
  { value: 'cribado', label: 'Cribado' },
  { value: 'clasificar', label: 'Clasificar' },
];
const MODO_KEY = 'triage-modo';

const exercisesQueryKey = ['exercises'] as const;

export default function ExerciseTriageScreen({ onClose }: ExerciseTriageScreenProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: exercises = [], isPending: loadingEx } = useQuery({
    queryKey: exercisesQueryKey,
    queryFn: async () => { await seedExercisesIfEmpty(); return getExercises(); },
  });
  // Las rutinas solo se usan para ordenar: los ejercicios que ya prescribe van
  // primero. Si fallan, la revisión sigue funcionando en orden por grupo.
  const { data: workouts = [] } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });

  const usados = useMemo(() => {
    const s = new Set<string>();
    workouts.forEach(w => w.exercises?.forEach(we => we.exerciseId && s.add(we.exerciseId)));
    return s;
  }, [workouts]);

  // El orden se congela al cargar: si se recalculara con cada guardado, marcar
  // un ejercicio lo movería de sitio bajo el dedo y perderías dónde ibas.
  const [ordenados, setOrdenados] = useState<Exercise[] | null>(null);
  useEffect(() => {
    if (ordenados || exercises.length === 0) return;
    setOrdenados(ordenarParaRevision(exercises, usados, MUSCLE_ORDER));
  }, [exercises, usados, ordenados]);

  // Cribado primero, clasificar después: son dos pasadas distintas y mezclar
  // los campos de una en la otra es lo que hacía la pantalla lenta de recorrer.
  // Se recuerda entre sesiones porque el cribado de 1.721 ejercicios no se
  // termina en una sentada.
  const [modo, setModo] = useState<'cribado' | 'clasificar'>(
    () => (localStorage.getItem(MODO_KEY) as 'cribado' | 'clasificar' | null) ?? 'cribado',
  );
  useEffect(() => { localStorage.setItem(MODO_KEY, modo); }, [modo]);

  const lista = ordenados ?? [];
  const [indice, setIndice] = useState(0);
  const [arrancado, setArrancado] = useState(false);

  // Arranca en el primero sin revisar — la revisión son muchas sesiones y
  // volver a empezar por el principio cada vez la haría imposible.
  useEffect(() => {
    if (arrancado || lista.length === 0) return;
    const i = lista.findIndex(e => !e.revisado);
    setIndice(i === -1 ? 0 : i);
    setArrancado(true);
  }, [lista, arrancado]);

  // Los cambios se aplican sobre una copia local para que la ficha responda al
  // instante; Firestore se escribe detrás. Si la escritura falla se avisa y se
  // revierte, en vez de dejarte creyendo que quedó guardado.
  const [cambios, setCambios] = useState<Record<string, Partial<Exercise>>>({});
  const actual: Exercise | undefined = lista[indice]
    ? { ...lista[indice], ...cambios[lista[indice].id] }
    : undefined;

  const origen = actual ? getOrigen(actual.id) : null;

  const revisadosCount = useMemo(
    () => lista.filter(e => (cambios[e.id]?.revisado ?? e.revisado)).length,
    [lista, cambios],
  );

  // Marcar "sobra" no borra nada — es la papelera. Vaciarla es un gesto
  // aparte y con confirmación, porque es lo único de esta pantalla que no
  // se puede deshacer con Ctrl+Z de Firestore.
  const marcados = useMemo(
    () => lista.filter(e => (cambios[e.id]?.descartado ?? e.descartado)),
    [lista, cambios],
  );
  const marcadosBorrables = useMemo(() => marcados.filter(e => !usados.has(e.id)), [marcados, usados]);
  const marcadosBloqueados = marcados.length - marcadosBorrables.length;

  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const vaciarPapelera = useCallback(async () => {
    setBorrando(true);
    try {
      const idsBorrados = new Set<string>();
      let fallos = 0;
      for (const e of marcadosBorrables) {
        try {
          await deleteExercise(e.id);
          idsBorrados.add(e.id);
        } catch (err) {
          fallos += 1;
          console.warn('No se pudo borrar', e.id, err);
        }
      }
      setOrdenados(prev => (prev ? prev.filter(e => !idsBorrados.has(e.id)) : prev));
      setIndice(i => Math.max(0, Math.min(i, lista.length - idsBorrados.size - 1)));
      queryClient.invalidateQueries({ queryKey: exercisesQueryKey });
      setConfirmandoBorrado(false);
      if (fallos > 0) {
        showToast(`Borrados ${idsBorrados.size}, ${fallos} fallaron — reintenta con esos.`, 'error');
      } else {
        showToast(`${idsBorrados.size} ejercicios borrados.`, 'success');
      }
    } finally {
      setBorrando(false);
    }
  }, [marcadosBorrables, lista.length, queryClient, showToast]);

  const guardar = useCallback(async (id: string, updates: Partial<Exercise>) => {
    haptics.light();
    setCambios(c => ({ ...c, [id]: { ...c[id], ...updates } }));
    try {
      await updateExercise(id, updates);
      queryClient.invalidateQueries({ queryKey: exercisesQueryKey });
    } catch (err) {
      setCambios(c => {
        const copia = { ...c };
        const previo = { ...copia[id] };
        Object.keys(updates).forEach(k => delete previo[k as keyof Exercise]);
        copia[id] = previo;
        return copia;
      });
      showToast(mensajeDeErrorFirestore(err, 'guardar el ejercicio'), 'error');
    }
  }, [queryClient, showToast]);

  const irA = useCallback((i: number) => {
    setIndice(Math.max(0, Math.min(lista.length - 1, i)));
    setEditandoNombre(false);
  }, [lista.length]);

  // "Siguiente" marca revisado: si has mirado el vídeo y pasas, has revisado.
  // Pedir un gesto aparte para confirmarlo sería duplicar el trabajo 1.721
  // veces.
  const siguiente = useCallback(() => {
    if (!actual) return;
    if (!actual.revisado) {
      guardar(actual.id, { revisado: true, revisadoAt: new Date().toISOString() });
    }
    irA(indice + 1);
  }, [actual, guardar, indice, irA]);

  const [editandoNombre, setEditandoNombre] = useState(false);
  const [borradorNombre, setBorradorNombre] = useState('');
  const inputNombreRef = useRef<HTMLInputElement>(null);

  // Notas: texto libre, se guarda al salir del campo (no en cada tecla) para
  // no machacar Firestore mientras el coach todavía está escribiendo.
  const [borradorNota, setBorradorNota] = useState(actual?.notasRevision ?? '');
  useEffect(() => { setBorradorNota(actual?.notasRevision ?? ''); }, [actual?.id]);
  const guardarNota = useCallback(() => {
    if (!actual) return;
    const limpio = borradorNota.trim();
    if (limpio !== (actual.notasRevision ?? '')) {
      guardar(actual.id, { notasRevision: limpio || undefined });
    }
  }, [actual, borradorNota, guardar]);

  const abrirNombre = useCallback(() => {
    if (!actual) return;
    setBorradorNombre(actual.name);
    setEditandoNombre(true);
    setTimeout(() => inputNombreRef.current?.select(), 0);
  }, [actual]);

  const confirmarNombre = useCallback(() => {
    if (!actual) return;
    const limpio = borradorNombre.trim();
    if (limpio && limpio !== actual.name) guardar(actual.id, { name: limpio });
    setEditandoNombre(false);
  }, [actual, borradorNombre, guardar]);

  // ─── Teclado ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (!actual) return;
      const enCampo = e.target instanceof HTMLElement
        && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (enCampo) {
        if (e.key === 'Escape') { setEditandoNombre(false); (e.target as HTMLElement).blur(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === '1' || k === '2' || k === '3') {
        const curva = CURVAS[Number(k) - 1].valor;
        guardar(actual.id, { strengthCurve: actual.strengthCurve === curva ? undefined : curva });
      } else if (k === 'q' || k === 'w' || k === 'e') {
        const prio = PRIORIDADES[{ q: 0, w: 1, e: 2 }[k as 'q' | 'w' | 'e']].valor;
        guardar(actual.id, { prioridad: prio });
      } else if (k === 'x') {
        guardar(actual.id, { descartado: !actual.descartado });
      } else if (k === 'h') {
        guardar(actual.id, { casa: !actual.casa });
      } else if (k === 'n') {
        e.preventDefault();
        abrirNombre();
      } else if (k === 'enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        siguiente();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        irA(indice - 1);
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [actual, guardar, siguiente, irA, indice, abrirNombre]);

  if (loadingEx || !ordenados) return <ScreenSkeleton />;

  if (lista.length === 0) {
    return (
      <EmptyState
        icon="fitness_center"
        title="No hay ejercicios que revisar"
        description="El catálogo está vacío."
      />
    );
  }

  if (!actual) {
    return (
      <div className="p-6 text-center space-y-4">
        <EmptyState
          icon="task_alt"
          title="Catálogo revisado"
          description={`Has pasado por los ${lista.length} ejercicios.`}
        />
        <Button variant="secondary" onClick={() => irA(0)}>Volver al principio</Button>
      </div>
    );
  }

  const pct = Math.round((revisadosCount / lista.length) * 100);
  const grupoLabel = actual.muscleGroup ? MUSCLE_LABELS[actual.muscleGroup] : 'Sin grupo';
  const sospechoso = tieneInglesSinTraducir(actual);

  return (
    <div className="flex flex-col gap-4 pb-28 md:pb-6">
      {/* Progreso */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption font-sans uppercase tracking-wide text-ink-3">
              {indice + 1} de {lista.length} · {grupoLabel}
              {usados.has(actual.id) && ' · la usas'}
            </p>
            <p className="text-caption font-sans text-ink-3">
              {revisadosCount} revisados ({pct}%)
            </p>
          </div>
          {onClose && (
            <Button variant="ghost" size="s" onClick={onClose} aria-label="Salir de la revisión">
              <Icon name="close" />
            </Button>
          )}
        </div>
        <ProgressBar value={pct} label={`Revisión del catálogo, ${revisadosCount} de ${lista.length}`} />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SegmentedControl
            label="Modo de revisión"
            options={MODOS}
            value={modo}
            onChange={v => setModo(v as 'cribado' | 'clasificar')}
          />
          {marcados.length > 0 && (
            <Button variant="ghost" size="s" onClick={() => setConfirmandoBorrado(true)}>
              <Icon name="delete" size="s" />
              Sobran {marcados.length}
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={confirmandoBorrado}
        onClose={() => setConfirmandoBorrado(false)}
        title="Borrar los marcados"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirmandoBorrado(false)} disabled={borrando}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={vaciarPapelera} disabled={borrando || marcadosBorrables.length === 0}>
              {borrando ? 'Borrando…' : `Borrar ${marcadosBorrables.length}`}
            </Button>
          </>
        )}
      >
        <p className="font-sans text-body-s text-ink">
          Vas a borrar {marcadosBorrables.length} ejercicios de Firestore, para siempre — no se
          puede deshacer.
        </p>
        {marcadosBloqueados > 0 && (
          <p className="font-sans text-body-s text-ink-3 mt-2">
            {marcadosBloqueados} más están marcados pero se usan en alguna rutina, así que no se
            borran — quítalos de la rutina primero si de verdad sobran.
          </p>
        )}
      </Dialog>

      {/* Vídeo — lo que decide si el ejercicio trabaja lo que dice */}
      <div className="rounded-surface overflow-hidden bg-surface aspect-video flex items-center justify-center">
        {actual.videoUrl ? (
          <video
            key={actual.id}
            src={actual.videoUrl}
            className="w-full h-full object-contain"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <div className="text-center text-ink-3 p-6">
            <Icon name="videocam_off" />
            <p className="text-caption font-sans mt-2">Sin vídeo</p>
          </div>
        )}
      </div>

      {/* Original en inglés — la referencia contra la que juzgas el nombre */}
      {origen && (
        <div className="rounded-surface bg-surface px-4 py-3">
          <p className="text-caption font-sans uppercase tracking-wide text-ink-3">
            Original · {origen.categoria}
          </p>
          <p className="font-sans text-body text-ink">{origen.nombreOriginal}</p>
        </div>
      )}

      {/* Nombre actual, editable en el sitio */}
      <div>
        {editandoNombre ? (
          // Input crudo y no la primitiva `Input` del DS: aquí hace falta ref
          // (para seleccionar el texto al abrir), onBlur y onKeyDown, y la
          // primitiva no los expone. Se copian sus clases para que el campo se
          // vea idéntico — incluidos los 16 px que evitan el zoom de iOS.
          <label className="block">
            <span className="text-caption font-sans uppercase tracking-wide text-ink-3">Nombre</span>
            <input
              ref={inputNombreRef}
              value={borradorNombre}
              onChange={e => setBorradorNombre(e.target.value)}
              onBlur={confirmarNombre}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmarNombre(); } }}
              autoFocus
              className="h-[54px] w-full rounded-field border border-hairline bg-field px-4 font-sans text-title-s text-ink transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-inset focus:ring-accent"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={abrirNombre}
            className="w-full text-left rounded-surface px-4 py-3 bg-surface hover:bg-raised transition-colors"
          >
            <span className="text-caption font-sans uppercase tracking-wide text-ink-3">
              Nombre {sospechoso && '· revisar, lleva inglés sin traducir'}
            </span>
            <span className="flex items-center gap-2">
              <span className={`font-sans text-body-s ${sospechoso ? 'text-warning' : 'text-ink'}`}>
                {actual.name}
              </span>
              <Icon name="edit" size="s" />
            </span>
          </button>
        )}
      </div>

      {modo === 'clasificar' && (
        <>
          {/* Grupo muscular */}
          <fieldset>
            <legend className="text-caption font-sans uppercase tracking-wide text-ink-3 mb-2">
              Grupo muscular
            </legend>
            <div className="flex flex-wrap gap-2">
              {MUSCLE_ORDER.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => guardar(actual.id, { muscleGroup: g, primaryFocus: MUSCLE_LABELS[g] })}
                  aria-pressed={actual.muscleGroup === g}
                  className={`min-h-[44px] px-3 rounded-control text-caption font-sans transition-colors ${
                    actual.muscleGroup === g
                      ? 'bg-accent text-on-accent font-bold'
                      : 'bg-surface text-ink-3 hover:text-ink'
                  }`}
                >
                  {MUSCLE_LABELS[g]}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Curva — sin sugerencia automática, es criterio del entrenador */}
          <fieldset>
            <legend className="text-caption font-sans uppercase tracking-wide text-ink-3 mb-2">
              Curva de fuerza
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {CURVAS.map(c => (
                <button
                  key={c.valor}
                  type="button"
                  title={c.ayuda}
                  onClick={() => guardar(actual.id, {
                    strengthCurve: actual.strengthCurve === c.valor ? undefined : c.valor,
                  })}
                  aria-pressed={actual.strengthCurve === c.valor}
                  className={`min-h-[56px] px-2 rounded-control font-sans text-caption transition-colors ${
                    actual.strengthCurve === c.valor
                      ? 'bg-accent text-on-accent font-bold'
                      : 'bg-surface text-ink-3 hover:text-ink'
                  }`}
                >
                  {c.label}
                  <span className="hidden md:block text-caption opacity-60">{c.tecla}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Prioridad */}
          <fieldset>
            <legend className="text-caption font-sans uppercase tracking-wide text-ink-3 mb-2">
              Prioridad
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {PRIORIDADES.map(p => (
                <button
                  key={p.valor}
                  type="button"
                  onClick={() => guardar(actual.id, { prioridad: p.valor })}
                  aria-pressed={actual.prioridad === p.valor}
                  className={`min-h-[56px] px-2 rounded-control font-sans text-caption transition-colors ${
                    actual.prioridad === p.valor
                      ? 'bg-accent text-on-accent font-bold'
                      : 'bg-surface text-ink-3 hover:text-ink'
                  }`}
                >
                  {p.label}
                  <span className="hidden md:block text-caption opacity-60">{p.tecla}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {/* Descartar y casa — disponibles en los dos modos: la papelera y el
          filtro de "se puede hacer en casa" no dependen de haber clasificado. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => guardar(actual.id, { descartado: !actual.descartado })}
          aria-pressed={!!actual.descartado}
          className={`min-h-[44px] rounded-control font-sans text-caption transition-colors ${
            actual.descartado
              ? 'bg-danger/15 text-danger font-bold'
              : 'bg-surface text-ink-3 hover:text-ink'
          }`}
        >
          {actual.descartado ? 'Marcado como que sobra' : 'Este sobra'}
          <span className="hidden md:inline text-caption opacity-60"> · X</span>
        </button>
        <button
          type="button"
          onClick={() => guardar(actual.id, { casa: !actual.casa })}
          aria-pressed={!!actual.casa}
          className={`min-h-[44px] rounded-control font-sans text-caption transition-colors ${
            actual.casa
              ? 'bg-accent text-on-accent font-bold'
              : 'bg-surface text-ink-3 hover:text-ink'
          }`}
        >
          {actual.casa ? 'Vale para casa' : 'Se puede hacer en casa'}
          <span className="hidden md:inline text-caption opacity-60"> · H</span>
        </button>
      </div>

      {/* Notas — texto libre del coach, solo visible para él */}
      <label className="block">
        <span className="text-caption font-sans uppercase tracking-wide text-ink-3">
          Notas
        </span>
        <textarea
          key={actual.id}
          value={borradorNota}
          onChange={e => setBorradorNota(e.target.value)}
          onBlur={guardarNota}
          placeholder="Dudas, grabar de otro ángulo, confirmar con fisio…"
          rows={2}
          className="mt-1 w-full rounded-field border border-hairline bg-field px-4 py-3 font-sans text-body-s text-ink transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-inset focus:ring-accent resize-none"
        />
      </label>

      {/* Navegación — fija abajo en móvil, donde llega el pulgar */}
      <div className="fixed md:static bottom-0 inset-x-0 md:inset-auto p-4 md:p-0 bg-bg/95 md:bg-transparent backdrop-blur md:backdrop-blur-none border-t md:border-0 border-hairline flex gap-3">
        <Button variant="secondary" onClick={() => irA(indice - 1)} disabled={indice === 0}>
          <Icon name="arrow_back" />
        </Button>
        <Button variant="primary" onClick={siguiente} className="flex-1">
          {actual.revisado ? 'Siguiente' : 'Revisado y siguiente'}
        </Button>
      </div>

      <p className="hidden md:block text-caption font-sans text-ink-3">
        Teclado: {modo === 'clasificar' && '1/2/3 curva · Q/W/E prioridad · '}
        N nombre · X sobra · H casa · Enter siguiente · ← atrás
      </p>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import {
  Exercise, Maquina, MaquinaPropia, MuscleGroup, MUSCLE_LABELS, MUSCLE_ORDER, Mesocycle, WorkoutLog,
} from '../../types';
import { ordenarCandidatos } from '../../utils/seleccionEjercicios';
import {
  Draft, alternarEnDraft, moverEnDraft, ejerciciosSugeridos, historialDeEjercicio, idsDelDraft,
} from '../../utils/draftEjercicios';
import { parseVideoUrl } from '../../utils/embedPlayerControl';
import { coincideBusqueda } from '../../utils/busqueda';
import { Icon, Sparkline, Chip } from '../ui';
import { atributosFiltrables, MATERIALES } from '../../utils/atributosEjercicio';
import { useFichaDeEjercicio } from '../useFichaDeEjercicio';

/* ═══════════════════════════════════════════════════════════════════════════
   Draft de ejercicios (pestaña entre «Volumen» y «Distribución»)

   Por cada grupo con series, el coach arma su lista corta: tarjetas con el
   frame del vídeo, el nombre y lo que el atleta lleva hecho con cada ejercicio.
   Pulsar una tarjeta de «Candidatos» la sube a «Elegidos»; pulsar una elegida
   la devuelve. Más tarde, «Generar rutinas» solo elige entre las elegidas.

   Las máquinas que el atleta marcó en el alta salen en cada grupo, y cada
   ejercicio elegido se puede relacionar con una, por si el atleta duda de qué
   aparato es.
   ═══════════════════════════════════════════════════════════════════════════ */

const CANDIDATOS_VISIBLES = 12;

interface Props {
  groups: Mesocycle['groups'];
  draft: Draft | undefined;
  draftMaquinas: Record<string, string> | undefined;
  exercises: Exercise[];
  logs: WorkoutLog[];
  rutinasDelCoach: Parameters<typeof ordenarCandidatos>[0]['rutinasDelCoach'];
  material: string[];
  vetados: string[];
  maquinas: Maquina[];
  maquinasPropias: MaquinaPropia[];
  onChange: (draft: Draft, draftMaquinas: Record<string, string> | undefined) => void;
  /** Con él, la ficha deja además corregir la clasificación muscular del ejercicio (E-04). */
  coachId?: string;
}

/**
 * Imagen o primer frame del ejercicio. Sin un campo de miniatura propio, un
 * vídeo directo se pinta con `preload="metadata"` y `#t=0.1`, que enseña el
 * primer frame sin descargar el clip; los de YouTube usan su propia imagen.
 */
function Miniatura({ ex, className = '' }: { ex: Exercise; className?: string }) {
  const base = `bg-inset object-cover ${className}`;
  if (ex.imageUrl) return <img src={ex.imageUrl} alt="" loading="lazy" className={base} />;
  const url = ex.videoUrl?.trim();
  if (url) {
    const embed = parseVideoUrl(url);
    if (embed?.provider === 'youtube') {
      return <img src={`https://img.youtube.com/vi/${embed.id}/hqdefault.jpg`} alt="" loading="lazy" className={base} />;
    }
    if (!embed) {
      return <video src={`${url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden className={base} />;
    }
  }
  return (
    <div className={`${base} flex items-center justify-center text-ink-3`}>
      <Icon name="fitness_center" size="m" />
    </div>
  );
}

type TarjetaProps = {
  ex: Exercise;
  elegido: boolean;
  compatible: boolean;
  historial: ReturnType<typeof historialDeEjercicio>;
  maquinasDelGrupo: { id: string; nombre: string; fotoUrl: string }[];
  maquinaId?: string;
  onToggle: () => void;
  onMove?: (delta: -1 | 1) => void;
  onMaquina?: (id: string | undefined) => void;
  onFicha?: () => void;
};

const Tarjeta: React.FC<TarjetaProps> = ({
  ex, elegido, compatible, historial, maquinasDelGrupo, maquinaId, onToggle, onMove, onMaquina, onFicha,
}) => {
  const maquina = maquinasDelGrupo.find(m => m.id === maquinaId);
  return (
    <li className={`rounded-surface border overflow-hidden flex flex-col bg-surface ${
      elegido ? 'border-accent-line' : 'border-hairline'
    }`}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={elegido}
        aria-label={`${elegido ? 'Quitar del draft' : 'Añadir al draft'}: ${ex.name}`}
        className="text-left flex flex-col"
      >
        <Miniatura ex={ex} className="w-full aspect-video" />
        <span className="block px-2.5 pt-2 font-sans text-label font-bold text-ink leading-snug line-clamp-2">
          {ex.name}
        </span>
      </button>

      <div className="px-2.5 pb-2.5 pt-1.5 flex flex-col gap-1.5 flex-1">
        {historial.mejor ? (
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-caption text-ink-2 truncate">
                {historial.mejor.peso} kg × {historial.mejor.reps}
                {historial.deltaKg != null && historial.deltaKg !== 0 && (
                  <span className={historial.deltaKg > 0 ? 'text-success' : 'text-warning'}>
                    {' '}{historial.deltaKg > 0 ? '+' : ''}{historial.deltaKg}
                  </span>
                )}
              </p>
              <p className="font-mono text-caption text-ink-3">e1RM {historial.mejor.e1rm}</p>
            </div>
            {historial.tendencia.length > 1 && (
              <Sparkline values={historial.tendencia} label={`Peso máximo por sesión de ${ex.name}`} />
            )}
          </div>
        ) : (
          <p className="font-mono text-caption text-ink-3">Sin historial con este atleta</p>
        )}

        <div className="flex flex-wrap gap-1">
          {historial.bloquesSeguidos >= 3 && (
            <span className="font-mono text-caption text-warning">
              {historial.bloquesSeguidos} bloques seguidos · valorar rotar
            </span>
          )}
          {historial.bloquesSeguidos > 0 && historial.bloquesSeguidos < 3 && (
            <span className="font-mono text-caption text-ink-3">
              {historial.bloquesSeguidos === 1 ? 'En el último bloque' : `En los últimos ${historial.bloquesSeguidos} bloques`}
            </span>
          )}
          {!compatible && <span className="font-mono text-caption text-warning">Sin material compatible</span>}
        </div>

        {onFicha && (
          <button
            type="button"
            onClick={onFicha}
            aria-label={`Ver la ficha de ${ex.name}`}
            className="self-start font-mono text-caption text-ink-3 hover:text-accent-ink underline decoration-dotted"
          >
            Ficha
          </button>
        )}

        {elegido && (
          <div className="mt-auto flex items-center gap-1.5 pt-1.5 border-t border-hairline">
            {maquinasDelGrupo.length > 0 && onMaquina && (
              <label className="flex-1 min-w-0 flex items-center gap-1.5">
                {maquina && (
                  <img src={maquina.fotoUrl} alt="" className="h-7 w-7 rounded-control object-cover bg-inset flex-shrink-0" />
                )}
                <select
                  value={maquinaId ?? ''}
                  onChange={e => onMaquina(e.target.value || undefined)}
                  aria-label={`Máquina para ${ex.name}`}
                  className="min-w-0 flex-1 bg-bg border border-hairline rounded-control px-1.5 py-1 text-caption font-sans text-ink-2 focus:outline-none focus:border-accent"
                >
                  <option value="">Sin máquina</option>
                  {maquinasDelGrupo.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </label>
            )}
            {onMove && (
              <span className="flex flex-shrink-0 ml-auto">
                <button type="button" onClick={() => onMove(-1)} aria-label="Subir" className="p-1 text-ink-3 hover:text-accent-ink">
                  <Icon name="arrow_back" size="s" />
                </button>
                <button type="button" onClick={() => onMove(1)} aria-label="Bajar" className="p-1 text-ink-3 hover:text-accent-ink">
                  <Icon name="arrow_forward" size="s" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
};

type GrupoProps = Omit<Props, 'groups' | 'maquinas' | 'maquinasPropias' | 'coachId'> & {
  onFicha?: (ex: Exercise) => void;
  grupo: MuscleGroup;
  series: number;
  maquinasDelGrupo: { id: string; nombre: string; fotoUrl: string }[];
};

const GrupoDraft: React.FC<GrupoProps> = ({
  grupo, series, draft, draftMaquinas, exercises, logs, rutinasDelCoach, material, vetados,
  maquinasDelGrupo, onChange, onFicha,
}) => {
  const [verTodos, setVerTodos] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  // Filtros por atributo (E-03): solo se ofrecen si casi todo el catálogo tiene el dato.
  const filtrables = useMemo(() => atributosFiltrables(exercises), [exercises]);
  const [materialFiltro, setMaterialFiltro] = useState<string | null>(null);
  const [lateralidad, setLateralidad] = useState<'uni' | 'bi' | null>(null);
  const [conGoma, setConGoma] = useState(false);
  const ids = idsDelDraft(draft, grupo);
  const sugeridos = ejerciciosSugeridos(series);

  const candidatos = useMemo(
    () => ordenarCandidatos({
      grupo, trozos: [], catalogo: exercises, rutinasDelCoach, materialDelAtleta: material, logsDelAtleta: logs, vetados,
    }),
    [grupo, exercises, rutinasDelCoach, material, logs, vetados],
  );
  const porId = useMemo(() => new Map(candidatos.map(c => [c.ejercicio.id, c])), [candidatos]);

  const elegidos = ids.map(id => porId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  const libres = candidatos.filter(c => !ids.includes(c.ejercicio.id));
  const termino = busqueda.trim();
  const pasaAtributos = (e: Exercise) =>
    (!materialFiltro || (e.equipment ?? []).includes(materialFiltro)) &&
    (!lateralidad || e.lateralidad === lateralidad) &&
    (!conGoma || e.goma === true);
  const hayFiltroDeAtributo = !!materialFiltro || !!lateralidad || conGoma;
  const porAtributos = hayFiltroDeAtributo ? libres.filter(c => pasaAtributos(c.ejercicio)) : libres;
  const filtrados = termino ? porAtributos.filter(c => coincideBusqueda(c.ejercicio.name, termino)) : porAtributos;
  const visibles = verTodos || termino || hayFiltroDeAtributo ? filtrados : filtrados.slice(0, CANDIDATOS_VISIBLES);

  const cambiar = (d: Draft, maq = draftMaquinas) => onChange(d, maq);
  const alternar = (id: string) => {
    const nuevo = alternarEnDraft(draft, grupo, id);
    // Al quitarlo del draft, su máquina deja de tener sentido.
    let maq = draftMaquinas;
    if (!idsDelDraft(nuevo, grupo).includes(id) && maq && id in maq) {
      const { [id]: _quitada, ...resto } = maq;
      maq = Object.keys(resto).length ? resto : undefined;
    }
    cambiar(nuevo, maq);
  };
  const asignarMaquina = (exerciseId: string, maquinaId: string | undefined) => {
    const siguiente = { ...(draftMaquinas ?? {}) };
    if (maquinaId) siguiente[exerciseId] = maquinaId; else delete siguiente[exerciseId];
    cambiar(draft ?? {}, Object.keys(siguiente).length ? siguiente : undefined);
  };

  const corto = ids.length > 0 && ids.length < sugeridos;

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 space-y-4" aria-label={MUSCLE_LABELS[grupo]}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-sans font-bold text-title-s text-ink">{MUSCLE_LABELS[grupo]}</h3>
        <p className="font-mono text-caption text-ink-2">
          {series} series por ciclo · mínimo {sugeridos} {sugeridos === 1 ? 'ejercicio' : 'ejercicios'}
        </p>
      </header>

      {maquinasDelGrupo.length > 0 && (
        <div>
          <p className="font-mono text-caption text-ink-3 mb-1.5">Máquinas que tiene el atleta</p>
          <ul className="m-0 p-0 list-none flex gap-2 overflow-x-auto pb-1">
            {maquinasDelGrupo.map(m => (
              <li key={m.id} className="flex-shrink-0 w-20">
                <img src={m.fotoUrl} alt="" loading="lazy" className="w-20 h-14 rounded-control object-cover bg-inset border border-hairline" />
                <span className="block mt-1 font-mono text-caption text-ink-2 leading-tight line-clamp-2">{m.nombre}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="font-mono text-caption uppercase tracking-wider text-accent-ink mb-2">
          Elegidos · {ids.length}
        </p>
        {elegidos.length === 0 ? (
          <p className="font-sans text-label text-ink-3">
            Sin elegir: «Generar rutinas» usará toda la biblioteca de {MUSCLE_LABELS[grupo].toLowerCase()}.
          </p>
        ) : (
          <ul className="m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {elegidos.map(c => (
              <Tarjeta
                key={c.ejercicio.id}
                ex={c.ejercicio}
                elegido
                compatible={c.compatible}
                historial={historialDeEjercicio(logs, c.ejercicio.id)}
                maquinasDelGrupo={maquinasDelGrupo}
                maquinaId={draftMaquinas?.[c.ejercicio.id]}
                onToggle={() => alternar(c.ejercicio.id)}
                onMove={delta => cambiar(moverEnDraft(draft, grupo, c.ejercicio.id, delta))}
                onMaquina={m => asignarMaquina(c.ejercicio.id, m)}
                onFicha={onFicha && (() => onFicha(c.ejercicio))}
              />
            ))}
          </ul>
        )}
        {corto && (
          <p className="mt-2 font-mono text-caption text-warning">
            Con {ids.length} {ids.length === 1 ? 'ejercicio' : 'ejercicios'} se repetirán entre sesiones: para {series} series
            conviene tener al menos {sugeridos}.
          </p>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-2">
            Candidatos · {filtrados.length}
          </p>
          <input
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar ejercicio"
            aria-label={`Buscar ejercicio de ${MUSCLE_LABELS[grupo].toLowerCase()}`}
            className="w-44 bg-bg border border-hairline rounded-control px-2.5 py-1.5 text-label font-sans text-ink focus:outline-none focus:border-accent"
          />
        </div>
        {(filtrables.equipment || filtrables.lateralidad || filtrables.goma) && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar candidatos por material y variante">
            {filtrables.equipment && MATERIALES.map(m => (
              <Chip key={m} selected={materialFiltro === m} onClick={() => setMaterialFiltro(materialFiltro === m ? null : m)} className="capitalize">{m}</Chip>
            ))}
            {filtrables.lateralidad && (
              <>
                <Chip selected={lateralidad === 'uni'} onClick={() => setLateralidad(lateralidad === 'uni' ? null : 'uni')}>Unilateral</Chip>
                <Chip selected={lateralidad === 'bi'} onClick={() => setLateralidad(lateralidad === 'bi' ? null : 'bi')}>Bilateral</Chip>
              </>
            )}
            {filtrables.goma && <Chip selected={conGoma} onClick={() => setConGoma(v => !v)}>Con goma</Chip>}
            {hayFiltroDeAtributo && (
              <button type="button" onClick={() => { setMaterialFiltro(null); setLateralidad(null); setConGoma(false); }} className="font-mono text-caption text-accent-ink px-2">Limpiar</button>
            )}
          </div>
        )}
        {visibles.length === 0 ? (
          <p className="font-sans text-label text-ink-3">No hay más ejercicios{termino ? ' con ese nombre' : hayFiltroDeAtributo ? ' con esos filtros' : ''}.</p>
        ) : (
          <ul className="m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibles.map(c => (
              <Tarjeta
                key={c.ejercicio.id}
                ex={c.ejercicio}
                elegido={false}
                compatible={c.compatible}
                historial={historialDeEjercicio(logs, c.ejercicio.id)}
                maquinasDelGrupo={maquinasDelGrupo}
                onToggle={() => alternar(c.ejercicio.id)}
                onFicha={onFicha && (() => onFicha(c.ejercicio))}
              />
            ))}
          </ul>
        )}
        {!termino && filtrados.length > CANDIDATOS_VISIBLES && (
          <button
            type="button"
            onClick={() => setVerTodos(v => !v)}
            className="mt-3 font-mono text-caption text-accent-ink hover:underline"
          >
            {verTodos ? 'Ver menos' : `Ver los ${filtrados.length - CANDIDATOS_VISIBLES} restantes`}
          </button>
        )}
      </div>
    </section>
  );
};

export default function DraftEjercicios({
  groups, maquinas, maquinasPropias, coachId, ...resto
}: Props) {
  const { abrirFicha, hojas } = useFichaDeEjercicio(coachId);
  const gruposConSeries = MUSCLE_ORDER.filter(g => (groups[g]?.series ?? 0) > 0);

  const maquinasDe = (g: MuscleGroup) => [
    ...maquinas.filter(m => m.categoria === g).map(m => ({ id: m.id, nombre: m.nombreMostrado, fotoUrl: m.fotoUrl })),
    // Las propias no tienen grupo: salen en todos, que es mejor que esconderlas.
    ...maquinasPropias.map(m => ({ id: m.id, nombre: m.nombre, fotoUrl: m.fotoUrl })),
  ];

  if (gruposConSeries.length === 0) {
    return (
      <p className="font-sans text-label text-ink-2 py-6">
        Pon series a algún grupo en «Volumen» y aquí podrás elegir sus ejercicios.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-sans text-label text-ink-2">
        Elige por grupo los ejercicios que quieres usar. Al generar las rutinas solo se escogerá entre ellos; un grupo
        sin elegir usa toda la biblioteca.
      </p>
      {gruposConSeries.map(g => (
        <GrupoDraft
          key={g}
          grupo={g}
          series={groups[g].series}
          maquinasDelGrupo={maquinasDe(g)}
          onFicha={abrirFicha}
          {...resto}
        />
      ))}
      {hojas}
    </div>
  );
}

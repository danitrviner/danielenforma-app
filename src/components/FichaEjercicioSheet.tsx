import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Exercise, MuscleGroup } from '../types';
import { getEstadoCatalogo } from '../dbService';
import { gimnasioQueryKey } from '../features/gimnasio/MiGimnasioPanel';
import { useMotorCdg } from '../hooks/useMotorCdg';
import { fichaPorSerie, SERIE_DE_REFERENCIA } from '../utils/cdg/fichaEjercicio';
import { MUSCLE_LABELS, MARCA_LABELS } from '../types';
import { Sheet, PanelLateral, useAnchoMinimo } from './ui';
import ClasificacionEnFicha from './ClasificacionEnFicha';

/* ═══════════════════════════════════════════════════════════════════════════
   Ficha de un ejercicio (E-05, solo coach)

   Qué aporta UNA serie del ejercicio según el catálogo CDG: estímulo (IEM),
   fatiga (IF), la articulación más cargada y el reparto por músculo. Serie de
   referencia fija: 8-12 repeticiones a RIR 1. No son totales de sesión.
   En escritorio va en un panel a la derecha que no tapa la lista (12-a); en
   móvil, en la hoja de abajo. La clasificación se corrige aquí mismo (12-b).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  ejercicio: Exercise;
  onClose: () => void;
  /** Con él se puede corregir la clasificación muscular (E-04) dentro de la ficha. */
  coachId?: string;
  /** Tras guardar una clasificación nueva, el ejercicio actualizado. */
  onGuardado?: (nuevo: Exercise) => void;
  /** Dentro de un mesociclo: el atleta, para enseñar las máquinas que tiene. */
  athleteEmail?: string;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip). */
  key?: React.Key;
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string; key?: React.Key }) {
  return (
    <div className="rounded-control bg-raised px-3 py-2.5 min-w-0">
      <p className="font-sans text-label text-ink-2">{titulo}</p>
      <p className="font-sans text-title-l font-bold text-ink tabular-nums">{valor}</p>
      <p className="font-sans text-body-s text-ink-2 truncate">{detalle}</p>
    </div>
  );
}

export default function FichaEjercicioSheet({ ejercicio, onClose, coachId, onGuardado, athleteEmail }: Props) {
  const escritorio = useAnchoMinimo(1024);
  const { motor, cargando, noSubido, error } = useMotorCdg();
  const ficha = useMemo(() => (motor ? fichaPorSerie(motor, ejercicio.cdgNombre) : null), [motor, ejercicio.cdgNombre]);
  const referencia = `RIR ${SERIE_DE_REFERENCIA.rir} · ${SERIE_DE_REFERENCIA.reps.replace('-', '–')} reps`;
  const maximo = ficha?.musculos[0]?.valor ?? 0;

  const contenido = (
      <div className="space-y-4">
        <div>
          <p className="font-sans text-body font-bold text-ink">{ejercicio.name}</p>
          <p className="font-sans text-body-s text-ink-2">
            {ejercicio.cdgNombre
              ? <>Vinculado a CDG: «{ejercicio.cdgNombre}»</>
              : ejercicio.cdgSinEquivalente ? 'Sin equivalente en CDG (revisado)' : 'Sin vínculo con CDG'}
          </p>
        </div>

        {cargando && <p className="font-sans text-body-s text-ink-3">Cargando el catálogo CDG…</p>}
        {error && <p className="font-sans text-body-s text-danger">No se pudo leer el catálogo CDG: {error.message}</p>}
        {noSubido && <p className="font-sans text-body-s text-ink-3">El catálogo CDG aún no está en Firestore.</p>}

        {ficha && !ficha.encontrado && (
          <p className="font-sans text-body-s text-warning">
            {ejercicio.cdgNombre
              ? 'Su nombre CDG no está en el catálogo: cuenta 0 en IF, IEM y estrés articular.'
              : 'Sin vínculo con CDG: cuenta 0 en IF, IEM y estrés articular.'}
          </p>
        )}

        {ficha?.encontrado && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Tarjeta titulo="IEM por serie" valor={n1(ficha.IEMTotal)} detalle={referencia} />
              <Tarjeta titulo="IF por serie" valor={n1(ficha.IF)} detalle={referencia} />
              <Tarjeta
                titulo="Estrés articular"
                valor={ficha.articulacion ? n1(ficha.articulacion.valor) : '0'}
                detalle={ficha.articulacion ? ficha.articulacion.nombre : 'sin carga articular'}
              />
            </div>

            <div>
              <p className="font-sans text-label text-ink-2 mb-2">Reparto del estímulo (IEM por músculo)</p>
              {ficha.musculos.length === 0 ? (
                <p className="font-sans text-body-s text-ink-3">Ningún músculo recibe estímulo apreciable.</p>
              ) : (
                <ul className="space-y-1.5">
                  {ficha.musculos.slice(0, 6).map(m => (
                    <li key={m.nombre} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 font-sans text-body-s leading-tight text-ink">{m.nombre}</span>
                      <span className="relative h-2 flex-1 rounded-chip bg-raised" role="img" aria-label={`${n1(m.valor)} de IEM`}>
                        <span className="absolute inset-y-0 left-0 rounded-chip bg-accent" style={{ width: `${Math.max(4, (m.valor / maximo) * 100)}%` }} />
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-body-s text-ink tabular-nums">{n1(m.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="font-sans text-body-s text-ink-3 mt-2">
                Valores del catálogo CDG para una serie. No son totales de sesión ni de semana.
              </p>
            </div>
          </>
        )}

        <div className="pt-3 border-t border-hairline space-y-2">
          <p className="font-sans text-label text-ink-2">Clasificación en En Forma</p>
          {coachId ? (
            <ClasificacionEnFicha ejercicio={ejercicio} coachId={coachId} onGuardado={nuevo => onGuardado?.(nuevo)} />
          ) : (
            <p className="font-sans text-body-s text-ink">
              Principal: <b>{ejercicio.muscleGroup ? MUSCLE_LABELS[ejercicio.muscleGroup] : 'Sin asignar'}</b>
              {' · '}Secundarios: {(ejercicio.secondaryMuscleGroups ?? []).length
                ? ejercicio.secondaryMuscleGroups!.map(g => MUSCLE_LABELS[g]).join(', ')
                : 'ninguno'}
            </p>
          )}
        </div>

        {athleteEmail && <MaquinasDelAtleta athleteEmail={athleteEmail} grupo={ejercicio.muscleGroup} />}
      </div>
  );

  return escritorio
    ? <PanelLateral open onClose={onClose} title="Ficha del ejercicio">{contenido}</PanelLateral>
    : <Sheet open onClose={onClose} title="Ficha del ejercicio">{contenido}</Sheet>;
}

/* Máquinas del gimnasio del atleta para el grupo del ejercicio (29-10): lo que
   el coach mira al decidir si este ejercicio le vale o hay que cambiarlo. Las
   máquinas propias no tienen grupo, así que van aparte y enteras. Comparte la
   caché con «Equipamiento» del Hub: si ya se abrió, no hay lectura nueva. */
function MaquinasDelAtleta({ athleteEmail, grupo }: { athleteEmail: string; grupo?: MuscleGroup }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: gimnasioQueryKey(athleteEmail),
    queryFn: () => getEstadoCatalogo(athleteEmail),
  });

  const { delGrupo, propias, revisadas } = useMemo(() => {
    if (!data) return { delGrupo: [], propias: [], revisadas: 0 };
    const tiene = new Set(data.gimnasio.maquinas.filter(d => d.tengo).map(d => d.maquinaId));
    return {
      delGrupo: data.catalogo
        .filter(m => tiene.has(m.id) && m.categoria === grupo)
        .sort((a, b) => a.nombreMostrado.localeCompare(b.nombreMostrado)),
      propias: data.gimnasio.maquinasPropias,
      revisadas: data.gimnasio.progresoCatalogo.revisadas,
    };
  }, [data, grupo]);

  return (
    <div className="pt-3 border-t border-hairline space-y-2">
      <p className="font-sans text-label text-ink-2">
        Máquinas de su gimnasio{grupo ? ` · ${MUSCLE_LABELS[grupo]}` : ''}
      </p>
      {isLoading ? (
        <p className="font-sans text-body-s text-ink-3">Cargando su gimnasio…</p>
      ) : isError ? (
        <p className="font-sans text-body-s text-danger">No se pudo leer su gimnasio.</p>
      ) : revisadas === 0 && propias.length === 0 ? (
        <p className="font-sans text-body-s text-ink-3">Aún no ha marcado qué máquinas tiene.</p>
      ) : (
        <>
          {!grupo ? (
            <p className="font-sans text-body-s text-ink-3">El ejercicio no tiene grupo principal: no se puede filtrar.</p>
          ) : delGrupo.length === 0 ? (
            <p className="font-sans text-body-s text-warning">No tiene ninguna máquina de {MUSCLE_LABELS[grupo].toLowerCase()}: tira de peso libre o polea.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {delGrupo.map(m => (
                <li key={m.id} className="flex items-center gap-2 rounded-control bg-raised p-1.5 min-w-0">
                  <img src={m.fotoUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded-control object-cover bg-inset" loading="lazy" />
                  <span className="min-w-0">
                    <span className="block font-sans text-body-s font-bold text-ink leading-tight line-clamp-2">{m.nombreMostrado}</span>
                    <span className="block font-mono text-caption text-ink-3 truncate">{MARCA_LABELS[m.marca] ?? m.marca}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {propias.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-caption text-ink-3 uppercase tracking-wider">Propias · {propias.length}</p>
              <ul className="grid grid-cols-2 gap-2">
                {propias.map(p => (
                  <li key={p.id} className="flex items-center gap-2 rounded-control bg-raised p-1.5 min-w-0">
                    <img src={p.fotoUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded-control object-cover bg-inset" loading="lazy" />
                    <span className="min-w-0 font-sans text-body-s font-bold text-ink leading-tight line-clamp-2">{p.nombre}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import type { Mesocycle, Workout, WorkoutAssignment } from '../../types';
import { Badge, BadgeTone, Button, Icon } from '../ui';
import { nombreDeMeso } from '../../utils/nombresMeso';
import { fechaCorta } from '../../utils/trainingWeek';
import {
  vistaDelAtleta, estadoDelMeso, sesionesQueEstorban, type EstadoDelMeso, type SesionesQueEstorban, type VistaDelAtleta,
} from '../../utils/bloqueDelAtleta';

/* ═══════════════════════════════════════════════════════════════════════════
   «El atleta ve ahora» + estado del bloque (Mesociclo, coach) — 28-10

   Dani nunca sabía si el cliente ya estaba viendo el bloque nuevo o el
   anterior, ni si lo que acababa de tocar le había llegado. Esto lo dice con
   la misma cuenta que hace la app del atleta (`utils/bloqueDelAtleta`):
   · qué vuelta tiene el atleta en pantalla hoy;
   · en qué estado está el bloque que se edita (borrador, programado, en
     curso, terminado) y desde cuándo se verá;
   · qué sesiones de otros bloques se le cruzan, con un botón para quitarlas;
   · si se cambiaron las fechas del bloque y sus sesiones siguen en las viejas.
   ═══════════════════════════════════════════════════════════════════════════ */

const dia = (iso: string) => fechaCorta(iso, { dia: true });
const sesionesTxt = (n: number) => `${n} ${n === 1 ? 'sesión' : 'sesiones'}`;

/** Una línea: lo que tiene el atleta hoy en su pantalla de Rutinas. */
export function textoDeLaVista(v: VistaDelAtleta): { titulo: string; detalle: string } {
  if (!v.bloque) return { titulo: 'Nada', detalle: 'No tiene sesiones asignadas.' };
  const rango = `${dia(v.bloque.inicio)} → ${dia(v.bloque.fin)} · ${sesionesTxt(v.sesiones)}`;
  if (!v.meso) return { titulo: 'Sesiones sueltas, sin bloque', detalle: rango };
  return { titulo: `${nombreDeMeso(v.meso)} · semana ${v.semana} de ${v.semanasTotal}`, detalle: rango };
}

export function LoQueVeElAtleta({ assignments, mesos, hoy, workouts }: {
  assignments: WorkoutAssignment[];
  mesos: Mesocycle[];
  hoy: string;
  workouts?: Workout[];
}) {
  const v = vistaDelAtleta(assignments, mesos, hoy, workouts);
  const { titulo, detalle } = textoDeLaVista(v);
  return (
    <div className="flex items-start gap-3 rounded-surface border border-hairline bg-surface px-4 py-3" data-testid="lo-que-ve-el-atleta">
      <Icon name="visibility" size="s" className="mt-0.5 text-accent-ink flex-shrink-0" />
      <div className="min-w-0">
        <p className="font-mono text-caption uppercase tracking-wider text-ink-2">El atleta ve ahora</p>
        <p className="font-sans font-bold text-body-s text-ink">{titulo}</p>
        <p className="font-mono text-caption text-ink-2">{detalle}</p>
        {v.otras > 0 && (
          <p className="font-sans text-caption text-warning mt-1">
            Esos días tiene {sesionesTxt(v.otras)} más de otro bloque: su calendario cuenta {v.sesiones + v.otras}.
          </p>
        )}
      </div>
    </div>
  );
}

/** El chip de estado de un bloque, para la lista y la cabecera del editor. */
export function chipDeEstado(e: EstadoDelMeso): { texto: string; tono: BadgeTone } {
  switch (e.tipo) {
    case 'borrador': return { texto: 'Borrador · no asignado', tono: 'neutral' };
    case 'programado': return { texto: `Programado · empieza el ${dia(e.desde)}`, tono: 'info' };
    case 'en_curso': return e.visible
      ? { texto: e.semana ? `En curso · semana ${e.semana} · lo ve el atleta` : 'En curso · lo ve el atleta', tono: 'success' }
      : { texto: 'En curso · el atleta ve otro bloque', tono: 'warning' };
    case 'terminado': return { texto: `Terminado el ${dia(e.hasta)}`, tono: 'neutral' };
  }
}

/** Qué significa el estado para el atleta, en una frase. */
function explicacion(e: EstadoDelMeso, meso: Mesocycle, v: VistaDelAtleta): string {
  const otro = v.meso && v.meso.id !== meso.id ? `${nombreDeMeso(v.meso)}, semana ${v.semana}` : null;
  switch (e.tipo) {
    case 'borrador':
      return 'El atleta no ve nada de este bloque: lo que cambies aquí no le llega hasta que lo asignes.';
    case 'programado':
      if (e.visible) return `Ya le sale como su próxima semana; empieza el ${dia(e.desde)}.`;
      return otro
        ? `Lo verá desde el ${dia(e.desde)}. Hasta entonces sigue con ${otro}.`
        : `Lo verá desde el ${dia(e.desde)}.`;
    case 'en_curso':
      if (e.visible) return 'Lo que cambies en sus rutinas lo verá la próxima vez que abra la app. Lo ya entrenado no cambia.';
      return otro
        ? `Sus fechas incluyen hoy, pero en pantalla tiene ${otro}. Quita las sesiones que se cruzan (abajo) para que vea este.`
        : 'Sus fechas incluyen hoy, pero esta semana no tiene sesiones de este bloque.';
    case 'terminado':
      return e.visible
        ? 'Ya terminó, pero sigue siendo lo último que tiene: no hay otro bloque asignado después.'
        : 'Ya terminó. Lo que cambies aquí no le llega al atleta.';
  }
}

function nombreDelGrupo(g: SesionesQueEstorban, workouts: Workout[]): string {
  if (g.meso) return nombreDeMeso(g.meso);
  if (!g.mesocycleId) return 'Sesiones sueltas, sin bloque';
  const rutina = workouts.find(w => w.id === g.asignaciones[0].workoutId)?.name;
  return rutina ? `Un bloque borrado («${rutina}»…)` : 'Un bloque borrado';
}

function FilaDeEstorbo({ g, workouts, onQuitar }: {
  key?: React.Key;
  g: SesionesQueEstorban;
  workouts: Workout[];
  onQuitar?: (g: SesionesQueEstorban) => Promise<void>;
}) {
  const [paso, setPaso] = useState<'idle' | 'confirmar' | 'trabajando'>('idle');
  const n = g.asignaciones.length;
  const desde = g.asignaciones[0].date;
  const hasta = g.asignaciones[n - 1].date;
  const quitar = async () => {
    if (!onQuitar) return;
    setPaso('trabajando');
    try { await onQuitar(g); } finally { setPaso('idle'); }
  };
  return (
    <li className="flex items-center gap-3 flex-wrap py-2">
      <div className="min-w-0 flex-1">
        <p className="font-sans font-bold text-label text-ink">{nombreDelGrupo(g, workouts)}</p>
        <p className="font-mono text-caption text-ink-2">
          {sesionesTxt(n)} pendientes · {desde === hasta ? dia(desde) : `${dia(desde)} → ${dia(hasta)}`}
        </p>
      </div>
      {onQuitar && (paso === 'confirmar' ? (
        <div className="flex gap-2">
          <Button size="s" variant="ghost" onClick={() => setPaso('idle')}>No</Button>
          <Button size="s" variant="danger" onClick={quitar}>Quitar {sesionesTxt(n)}</Button>
        </div>
      ) : (
        <Button size="s" variant="secondary" icon="event_busy" disabled={paso === 'trabajando'} onClick={() => setPaso('confirmar')}>
          {paso === 'trabajando' ? 'Quitando…' : 'Quitarlas'}
        </Button>
      ))}
    </li>
  );
}

export default function EstadoDelBloque({ meso, mesos, assignments, hoy, workouts = [], onQuitar, fechasMovidas }: {
  meso: Mesocycle;
  mesos: Mesocycle[];
  assignments: WorkoutAssignment[];
  hoy: string;
  workouts?: Workout[];
  /** Quita del calendario del atleta las sesiones pendientes de un grupo. */
  onQuitar?: (g: SesionesQueEstorban) => Promise<void>;
  /** Se cambiaron fecha de inicio o semanas y sus sesiones siguen en los días de antes. */
  fechasMovidas?: { onMover: () => void; trabajando: boolean };
}) {
  const vista = vistaDelAtleta(assignments, mesos, hoy, workouts);
  const estado = estadoDelMeso(meso, assignments, mesos, hoy);
  const chip = chipDeEstado(estado);
  // Lo de otros bloques solo estorba si este está asignado: en un borrador
  // todavía no hay nada que se cruce en la pantalla del atleta.
  const estorbos = estado.tipo === 'borrador' || estado.tipo === 'terminado' ? [] : sesionesQueEstorban(meso, assignments, mesos, hoy);

  return (
    <div className="space-y-3" data-testid="estado-del-bloque">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={chip.tono}>{chip.texto}</Badge>
        <p className="font-sans text-caption text-ink-2">{explicacion(estado, meso, vista)}</p>
      </div>

      <LoQueVeElAtleta assignments={assignments} mesos={mesos} hoy={hoy} workouts={workouts} />

      {fechasMovidas && (
        <div className="flex items-center gap-3 flex-wrap rounded-surface border border-warning/40 bg-warning/10 px-4 py-3">
          <Icon name="event_repeat" size="s" className="text-warning flex-shrink-0" />
          <p className="font-sans text-label text-ink flex-1 min-w-[12rem]">
            Has cambiado las fechas del bloque, pero sus sesiones siguen en los días de antes.
            Los días ya entrenados no se mueven.
          </p>
          <Button size="s" icon="event_available" disabled={fechasMovidas.trabajando} onClick={fechasMovidas.onMover}>
            {fechasMovidas.trabajando ? 'Moviendo…' : 'Mover sus sesiones'}
          </Button>
        </div>
      )}

      {estorbos.length > 0 && (
        <div className="rounded-surface border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="font-sans font-bold text-label text-ink flex items-center gap-2">
            <Icon name="warning" size="s" className="text-warning" />
            Se le cruzan sesiones de otros bloques
          </p>
          <p className="font-sans text-caption text-ink-2 mt-0.5">
            Le salen en el calendario y en «Semana completa» además de las de este bloque. Quitar solo borra las
            pendientes desde esta semana; lo entrenado y las semanas pasadas se quedan.
          </p>
          <ul className="divide-y divide-hairline mt-1">
            {estorbos.map(g => <FilaDeEstorbo key={g.mesocycleId ?? 'sueltas'} g={g} workouts={workouts} onQuitar={onQuitar} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

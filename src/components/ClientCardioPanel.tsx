import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile } from '../types';
import { getCardioAssignmentsForAthlete, getCardioSessionsForAthlete, getCardioProfile, updateCardioAssignment, deleteCardioAssignment } from '../dbService';
import { ZONE_ORDER, ZONE_LABEL, ZONE_COLOR } from '../utils/cardioZones';
import {
  resolverAsignacionCardio, semanaDelPrograma, prescripcionDeSemana, previaDelPrograma, protocoloVo2max,
} from '../utils/cardioProgression';
import { isoWeekKey } from '../utils/challengeOptions';
import { hoyIsoLocal } from '../utils/trainingWeek';
import { useConfirm } from '../hooks/useConfirm';
import { Badge, Button, Card, EmptyState, Icon, Sheet, Skeleton } from './ui';
import CardioPrescriptionForm from './cardio/CardioPrescriptionForm';

/* ═══════════════════════════════════════════════════════════════════════════
   Cardio del atleta, desde el lado del coach

   Dani, 26-08: «habría que añadir un apartado dentro del coach para revisar
   qué tiene programado de cardio; igual que sale el entrenamiento, que salga
   el cardio con toda la información de lo que va haciendo — ahora mismo creo
   que no se puede ver de ninguna de las maneras desde el lado del coach».
   Y el mismo día, después: «desde el apartado de cardio de Plan tenemos que
   ser capaces de poder configurar y programar sesiones de cardio específicas».

   Empezó de solo lectura ("prescribir se sigue haciendo en Biblioteca, un
   único sitio donde se escribe") — pero eso obligaba a salir de la ficha del
   atleta para prescribirle nada, que es justo la fricción que se quería
   quitar. Ahora el formulario (`cardio/CardioPrescriptionForm`) es un
   componente COMPARTIDO con Biblioteca › Cardio › Prescripción: sigue
   habiendo un único sitio donde vive la LÓGICA de crear una prescripción,
   pero se puede abrir desde aquí con el atleta ya fijado.

   Lo puntual (`CardioAssignment.date`) se separa de lo recurrente/programa en
   dos listas: una sesión para el jueves no es "lo que tiene programado en
   general", es una cita suelta — mezclarlas habría hecho ilegible la vista en
   cuanto hubiera dos o tres.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
}

const TIPO_LABEL: Record<string, string> = {
  zona2: 'Zona 2', intervalos: 'Intervalos', libre: 'Libre',
};

function hhmm(sec: number): string {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export default function ClientCardioPanel({ athlete }: Props) {
  const hoyIso = hoyIsoLocal();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirm();
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);
  const assignmentsKey = ['cardioAssignments', athlete.email] as const;

  const { data: assignments = [], isPending: cargandoAsignaciones } = useQuery({
    queryKey: assignmentsKey,
    queryFn: () => getCardioAssignmentsForAthlete(athlete.email),
  });
  const { data: sessions = [], isPending: cargandoSesiones } = useQuery({
    queryKey: ['cardioSessions', athlete.email],
    queryFn: () => getCardioSessionsForAthlete(athlete.email),
  });
  const { data: cardioProfile = null } = useQuery({
    queryKey: ['cardioProfile', athlete.email],
    queryFn: () => getCardioProfile(athlete.email),
  });

  if (cargandoAsignaciones || cargandoSesiones) {
    return <div className="space-y-3"><Skeleton className="h-32 w-full rounded-surface" /><Skeleton className="h-64 w-full rounded-surface" /></div>;
  }

  const refrescarAsignaciones = () => queryClient.invalidateQueries({ queryKey: assignmentsKey });

  const desactivar = async (id: string) => {
    if (!await confirm('¿Desactivar esta prescripción? Deja de verla el atleta.')) return;
    await updateCardioAssignment(id, { active: false });
    refrescarAsignaciones();
  };

  const eliminarPuntual = async (id: string) => {
    if (!await confirm('¿Quitar esta sesión programada?')) return;
    await deleteCardioAssignment(id);
    refrescarAsignaciones();
  };

  const activas = assignments.filter(a => a.active);
  const recurrentes = activas.filter(a => !a.date);
  // Puntuales de hoy en adelante — una ya pasada no es "lo que viene", y no
  // hace falta limpiarla a mano: pickActiveZona2Assignment/pickActiveIntervalAssignment
  // ya la ignoran fuera de su día.
  const puntualesProximas = activas.filter(a => a.date && a.date >= hoyIso).sort((a, b) => a.date!.localeCompare(b.date!));
  const sesionesRecientes = [...sessions].sort((a, b) => b.date.localeCompare(a.date));

  // Por cada recurrente hay que recorrer TODO el historial de sesiones
  // (resolverAsignacionCardio → semanaDelPrograma). Sin memoizar, esto se
  // repetía en cada render del panel — incluido abrir/cerrar el Sheet de
  // "Programar cardio", que no cambia nada de esto — y para un atleta con
  // meses de cardio son cientos de sesiones recorridas varias veces por nada.
  // Deps sobre `assignments`/`sessions` (las referencias estables de
  // react-query), no sobre `recurrentes`: al ser un `.filter()` nuevo en cada
  // render, usarlo como dep habría invalidado el memo igual de siempre.
  const filasRecurrentes = useMemo(() => assignments.filter(a => a.active && !a.date).map(a => {
    const resuelta = resolverAsignacionCardio(a, sessions, hoyIso);
    const semana = a.program ? semanaDelPrograma(a.program, a.id, sessions, hoyIso) : null;
    const prescripcion = a.program && semana ? prescripcionDeSemana(a.program, semana) : null;
    const hechasEstaSemana = sessions.filter(s => s.assignmentId === a.id && isoWeekKey(s.date) === isoWeekKey(hoyIso)).length;
    return { a, resuelta, semana, prescripcion, hechasEstaSemana, objetivo: resuelta?.timesPerWeek ?? 0 };
  }), [assignments, sessions, hoyIso]);

  // Últimas 6 semanas ISO: minutos y número de sesiones. Es la respuesta a "¿lo
  // está haciendo?", que es lo primero que mira un coach antes de tocar nada.
  const semanas = new Map<string, { minutos: number; sesiones: number }>();
  for (const s of sesionesRecientes) {
    const k = isoWeekKey(s.date);
    const prev = semanas.get(k) ?? { minutos: 0, sesiones: 0 };
    semanas.set(k, { minutos: prev.minutos + Math.round(s.durationSec / 60), sesiones: prev.sesiones + 1 });
  }
  const ultimasSemanas = [...semanas.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 6);

  return (
    <div className="space-y-6">
      <ConfirmDialog />

      <Button variant="primary" size="s" icon="add" onClick={() => setMostrandoFormulario(true)} fullWidth>
        Programar cardio
      </Button>

      {mostrandoFormulario && (
        <Sheet open onClose={() => setMostrandoFormulario(false)} title={`Programar cardio · ${athlete.displayName}`}>
          <div className="p-4">
            <CardioPrescriptionForm
              athleteEmail={athlete.email}
              onCreated={() => { refrescarAsignaciones(); setMostrandoFormulario(false); }}
            />
          </div>
        </Sheet>
      )}

      {/* ── Sesiones puntuales próximas ───────────────────────────────────── */}
      {puntualesProximas.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
            <Icon name="event" size="m" className="text-accent" />
            Sesiones puntuales programadas
          </h3>
          {puntualesProximas.map(a => (
            <Card key={a.id} className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-sans font-bold text-body-s text-ink">
                  {fechaCorta(a.date!)}{a.date === hoyIso ? ' · hoy' : ''} — {TIPO_LABEL[a.type] ?? a.type}
                </p>
                <p className="font-mono text-caption text-ink-2 mt-0.5">
                  {a.type === 'intervalos'
                    ? `${a.intervals?.length ?? 0} bloques · ${hhmm(a.targetDurationSec ?? 0)}`
                    : a.type === 'zona2'
                      ? `${hhmm(a.targetDurationSec ?? 0)} en ${(a.targetZone ?? 'z2').toUpperCase()}`
                      : 'Cardio libre'}
                </p>
              </div>
              <Button variant="ghost" size="s" icon="delete" onClick={() => eliminarPuntual(a.id)}>Quitar</Button>
            </Card>
          ))}
        </section>
      )}

      {/* ── Qué tiene programado ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
          <Icon name="assignment" size="m" className="text-accent" />
          Cardio recurrente
        </h3>

        {recurrentes.length === 0 ? (
          <Card>
            <EmptyState
              icon="monitor_heart"
              title="Sin cardio recurrente"
              description="Prescríbelo con el botón de arriba."
            />
          </Card>
        ) : (
          filasRecurrentes.map(({ a, resuelta, semana, prescripcion, hechasEstaSemana, objetivo }) => {
            return (
              <Card key={a.id} className="space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-sans font-bold text-body-s text-ink">
                      {a.program?.kind === 'vo2max'
                        ? `VO₂máx · ${protocoloVo2max(a.program.protocolId).label}`
                        : a.program?.kind === 'zona2'
                          ? 'Zona 2 progresiva'
                          : TIPO_LABEL[a.type] ?? a.type}
                    </p>
                    <p className="font-mono text-caption text-ink-2 mt-0.5">
                      Prescrito el {fechaCorta(a.createdAt.slice(0, 10))}
                      {a.program ? ` · empezó el ${fechaCorta(a.program.startDate)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {semana != null && (
                      <Badge tone={prescripcion?.esDescarga ? 'info' : 'accent'}>
                        Semana {semana}{prescripcion?.esDescarga ? ' · descarga' : ''}
                      </Badge>
                    )}
                    <Button variant="ghost" size="s" icon="pause_circle" onClick={() => desactivar(a.id)}>Desactivar</Button>
                  </div>
                </div>

                <div className="bg-raised rounded-surface p-3 space-y-1">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Esta semana le toca</p>
                  <p className="font-sans text-body-s text-ink">
                    {prescripcion?.resumen
                      ?? (a.type === 'intervalos'
                        ? `${a.intervals?.length ?? 0} bloques · ${hhmm(resuelta?.targetDurationSec ?? 0)}`
                        : `${hhmm(resuelta?.targetDurationSec ?? 0)} en ${(a.targetZone ?? 'z2').toUpperCase()}`)}
                  </p>
                  {objetivo > 0 && (
                    <p className="font-mono text-caption text-ink-2">
                      {hechasEstaSemana}/{objetivo} sesiones hechas esta semana
                    </p>
                  )}
                </div>

                {/* La progresión completa: lo que el coach necesita para saber
                    si el atleta llega a donde tenía que llegar. */}
                {a.program && semana != null && (
                  <details className="group">
                    <summary className="cursor-pointer font-sans text-caption text-accent list-none flex items-center gap-1">
                      <Icon name="expand_more" size="s" className="group-open:rotate-180 transition-transform" />
                      Ver las próximas semanas
                    </summary>
                    <div className="pt-2 space-y-1">
                      {previaDelPrograma(a.program, semana, 6).map(s => (
                        <div key={s.semana} className="flex items-baseline gap-3 py-1 border-b border-hairline last:border-0">
                          <span className="font-mono text-caption text-ink-3 w-16 flex-shrink-0">SEM {String(s.semana).padStart(2, '0')}</span>
                          <span className="flex-1 font-sans text-caption text-ink">{s.resumen}</span>
                          {s.esDescarga && <span className="font-mono text-caption text-ink-2 uppercase">descarga</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </Card>
            );
          })
        )}
      </section>

      {/* ── Sus zonas ────────────────────────────────────────────────────── */}
      {cardioProfile?.zones && (
        <section className="space-y-3">
          <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
            <Icon name="speed" size="m" className="text-accent" />
            Sus zonas
          </h3>
          <Card className="space-y-2">
            <p className="font-mono text-caption text-ink-2">
              FCmax {cardioProfile.maxHR ?? '—'} · FC reposo {cardioProfile.restingHR ?? '—'}
              {cardioProfile.lthr ? ` · LTHR ${cardioProfile.lthr}` : ''}
              {' · '}{cardioProfile.method === 'lthr' ? 'Friel (LTHR)' : 'Karvonen (%FC reserva)'}
            </p>
            {ZONE_ORDER.map(z => (
              <div key={z} className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ZONE_COLOR[z] }} />
                <span className="flex-1 font-sans text-caption text-ink-2">{ZONE_LABEL[z]}</span>
                <span className="font-mono text-caption text-ink tabular-nums">
                  {cardioProfile.zones[z].min}–{cardioProfile.zones[z].max} ppm
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* ── Qué está haciendo de verdad ──────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
          <Icon name="history" size="m" className="text-accent" />
          Lo que va haciendo
        </h3>

        {ultimasSemanas.length > 0 && (
          <Card className="space-y-1">
            <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Por semana</p>
            {ultimasSemanas.map(([semana, v]) => (
              <div key={semana} className="flex items-center justify-between gap-3 py-1 border-b border-hairline last:border-0">
                <span className="font-mono text-caption text-ink-3">{semana}</span>
                <span className="font-mono text-caption text-ink tabular-nums">
                  {v.sesiones} sesion{v.sesiones !== 1 ? 'es' : ''} · {v.minutos} min
                </span>
              </div>
            ))}
          </Card>
        )}

        {sesionesRecientes.length === 0 ? (
          <Card>
            <EmptyState
              icon="monitor_heart"
              title="Todavía no ha registrado cardio"
              description="Aquí aparecerán sus sesiones en cuanto haga la primera."
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {sesionesRecientes.slice(0, 15).map(s => {
              const totalZonas = ZONE_ORDER.reduce((sum, z) => sum + s.timeInZoneSec[z], 0);
              return (
                <Card key={s.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-sans font-bold text-body-s text-ink">
                        {s.title || TIPO_LABEL[s.type] || s.type}
                        {s.manual && <span className="font-mono text-caption text-ink-2"> · a mano</span>}
                      </p>
                      <p className="font-mono text-caption text-ink-2">{fechaCorta(s.date)} · {hhmm(s.durationSec)}</p>
                    </div>
                    <div className="text-right font-mono text-caption text-ink-2">
                      {s.avgHR ? <span className="text-ink">{s.avgHR} ppm med</span> : null}
                      {s.maxHR ? <span> · {s.maxHR} máx</span> : null}
                      {s.trimp ? <span className="block">TRIMP {Math.round(s.trimp)}</span> : null}
                    </div>
                  </div>

                  {/* Barra de reparto por zona: de un vistazo se ve si la
                      sesión de Zona 2 se le fue a Z3, que es el error más
                      común y el que anula el estímulo que se buscaba. */}
                  {totalZonas > 0 && (
                    <div className="flex h-2 rounded-full overflow-hidden bg-raised">
                      {ZONE_ORDER.map(z => {
                        const pct = (s.timeInZoneSec[z] / totalZonas) * 100;
                        return pct > 0 ? <span key={z} style={{ width: `${pct}%`, background: ZONE_COLOR[z] }} /> : null;
                      })}
                    </div>
                  )}
                  {s.notes && <p className="font-sans text-caption text-ink-2 italic">«{s.notes}»</p>}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

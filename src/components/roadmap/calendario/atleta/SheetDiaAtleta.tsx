import React from 'react';
import { WorkoutLog, ProgressPhoto, CoachDayNote } from '../../../../types';
import { DiaCalendario, BandaEntreno, BandaNutricion } from '../../../../utils/roadmapCalendar';
import { ejerciciosDelDia, DatosSemana } from '../../../../utils/semanaCalendario';
import { PlanEvent } from '../../../../utils/planEvents';
import { Sheet, Icon } from '../../../ui';
import { estiloDeEstado, mezcla } from '../paleta';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00');
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function Metrica({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-cell rounded-field px-3 py-2.5 flex flex-col gap-1">
      <span className="font-mono text-caption uppercase tracking-wider text-ink-4">{label}</span>
      <span className="font-mono text-title-s sm:text-title-m font-semibold text-white">{valor}</span>
    </div>
  );
}

function BarraMacro({ letra, color, pct, texto }: { letra: string; color: string; pct: number; texto: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-label text-ink-3" style={{ width: 20 }}>{letra}</span>
      <div className="flex-1 rounded-full overflow-hidden bg-cell" style={{ height: 6 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 3, background: color }} />
      </div>
      <span className="font-mono text-label text-ink-2">{texto}</span>
    </div>
  );
}

function Tarjeta({ icono, color, titulo, extra, children }: {
  icono: string; color: string; titulo: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-inset border border-hairline rounded-field p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={icono} size="m" style={{ color }} />
          <span className="font-sans font-bold text-body-s sm:text-title-s text-white truncate">{titulo}</span>
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sheet de Día del atleta — el mismo día que ve el coach, SIN los botones de
   programar (hito, destacar, mover entreno, nota, «programar aquí») ni los
   atajos a los editores del coach. En su lugar lleva la lista de ejercicios
   del día, que en el sheet del coach no está porque él la tiene en su editor.

   Una sola columna hasta `sm`: el del coach es una rejilla 1.35fr/1fr fija,
   que en un móvil deja las barras de macros en 90 px de ancho.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  fecha: string;
  dia: DiaCalendario | null;
  bandaEntreno: BandaEntreno | null;
  bandaNutricion: BandaNutricion | null;
  datosSemana: DatosSemana;
  coachDayNotes: CoachDayNote[];
  workoutLogs: WorkoutLog[];
  progressPhotos: ProgressPhoto[];
  volumeEvent: PlanEvent | null;
  onClose: () => void;
}

export default function SheetDiaAtleta({
  fecha, dia, bandaEntreno, bandaNutricion, datosSemana, coachDayNotes, workoutLogs, progressPhotos, volumeEvent, onClose,
}: Props) {
  const esFuturo = dia?.esFuturo ?? true;
  const estilo = dia ? estiloDeEstado(dia.estado) : estiloDeEstado('sin-datos');
  const semana = bandaEntreno
    ? Math.floor((new Date(fecha + 'T00:00:00').getTime() - new Date(bandaEntreno.inicio + 'T00:00:00').getTime()) / 86400000 / 7) + 1
    : null;

  const notaCoach = (coachDayNotes ?? []).find(n => n.date === fecha);
  const logDelDia = (workoutLogs ?? []).find(l => l.date === fecha);
  const fotoDelDia = (progressPhotos ?? []).find(p => p.date === fecha);
  const ejercicios = ejerciciosDelDia(fecha, datosSemana);

  return (
    <Sheet open onClose={onClose} label={fechaLarga(fecha)} size="xl">
      <div className="space-y-4">
        <div className="flex flex-col gap-2 pb-3.5 border-b border-hairline">
          <p className="font-sans font-extrabold text-title-m sm:text-title-l text-white" style={{ letterSpacing: '-0.02em' }}>{fechaLarga(fecha)}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-mono text-caption uppercase tracking-wider px-2.5 py-1 rounded-control"
              style={{ color: esFuturo ? 'var(--color-ink-2)' : estilo.color, background: esFuturo ? 'var(--color-inset)' : estilo.fondo }}
            >
              {esFuturo ? 'Planificado' : estilo.label}
            </span>
            {bandaEntreno && semana !== null && (
              <span className="font-mono text-caption text-ink-3">SEMANA {semana} DE {bandaEntreno.semanas} · {bandaEntreno.nombre.toUpperCase()}</span>
            )}
          </div>
        </div>

        {!dia && (
          <p className="text-ink-3 text-label font-sans py-4">Este día queda fuera de tu planificación — todavía no hay nada programado.</p>
        )}

        {dia && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Tarjeta icono="fitness_center" color="var(--color-phase-fuerza)" titulo={dia.entreno.esDescanso ? 'Descanso' : (dia.entreno.nombreRutina ?? 'Sin entreno')}>
              {dia.entreno.esDescanso && <p className="text-label text-ink-3 font-sans">Hoy toca descansar. Cuenta igual que entrenar.</p>}
              {!dia.entreno.esDescanso && !dia.entreno.nombreRutina && <p className="text-label text-ink-4 font-sans">No hay sesión asignada este día.</p>}
              {!dia.entreno.esDescanso && dia.entreno.nombreRutina && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Metrica label="Series" valor={`${dia.entreno.seriesHechas ?? 0}/${dia.entreno.seriesTotal ?? '—'}`} />
                    <Metrica label="RIR medio" valor={dia.entreno.rirMedio !== undefined ? String(dia.entreno.rirMedio) : '—'} />
                    <Metrica label="Tonelaje" valor={dia.entreno.tonelaje !== undefined ? `${dia.entreno.tonelaje} kg` : '—'} />
                  </div>
                  {ejercicios.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-3.5">
                      {ejercicios.map(ej => (
                        <div key={ej.exerciseId} className="flex items-baseline justify-between gap-2 min-w-0">
                          <span className="font-sans text-label text-ink-2 truncate">{ej.nombre}</span>
                          <span className="font-mono text-caption text-ink-4 flex-shrink-0">
                            {ej.seriesHechas !== undefined ? `${ej.seriesHechas}/${ej.series}` : ej.series}×{ej.reps} · RIR {ej.rir}
                            {ej.pesoMedio !== undefined && ` · ${ej.pesoMedio} kg`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {volumeEvent && (
                    <p className="flex items-center gap-1.5 mt-3 text-caption font-sans" style={{ color: 'var(--color-phase-fuerza)' }}>
                      <Icon name="trending_up" size="s" />{volumeEvent.title}
                    </p>
                  )}
                </>
              )}
            </Tarjeta>

            <Tarjeta
              icono="restaurant" color="var(--color-success)" titulo="Nutrición"
              extra={dia.nutricion.adherenciaPct !== undefined ? (
                <span
                  className="font-mono text-caption px-2.5 py-1 rounded-control flex-shrink-0"
                  style={{
                    color: dia.nutricion.adherenciaPct >= 85 ? 'var(--color-success)' : 'var(--color-warning)',
                    background: dia.nutricion.adherenciaPct >= 85 ? 'rgba(62,207,142,0.14)' : 'rgba(253,186,116,0.14)',
                  }}
                >
                  {dia.nutricion.adherenciaPct}%
                </span>
              ) : undefined}
            >
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-mono text-title-m sm:text-title-l font-semibold text-white">
                  {esFuturo ? (dia.nutricion.kcalObjetivo ?? '—') : (dia.nutricion.kcal ?? '—')}
                </span>
                <span className="text-label text-ink-3 font-sans">/ {dia.nutricion.kcalObjetivo ?? '—'} kcal{esFuturo ? ' de objetivo' : ''}</span>
              </div>
              {!bandaNutricion && <p className="text-caption text-ink-4 font-sans">Sin fase de dieta activa este día.</p>}
              {bandaNutricion && dia.nutricion.macros && (
                <div className="flex flex-col gap-2 mb-3">
                  <BarraMacro letra="P" color="var(--color-success)" pct={(dia.nutricion.macros.p.hecho / (dia.nutricion.macros.p.objetivo || 1)) * 100} texto={`${dia.nutricion.macros.p.hecho} / ${dia.nutricion.macros.p.objetivo} g`} />
                  <BarraMacro letra="C" color="var(--color-phase-fuerza)" pct={(dia.nutricion.macros.c.hecho / (dia.nutricion.macros.c.objetivo || 1)) * 100} texto={`${dia.nutricion.macros.c.hecho} / ${dia.nutricion.macros.c.objetivo} g`} />
                  <BarraMacro letra="G" color="var(--color-cat-cardio)" pct={(dia.nutricion.macros.g.hecho / (dia.nutricion.macros.g.objetivo || 1)) * 100} texto={`${dia.nutricion.macros.g.hecho} / ${dia.nutricion.macros.g.objetivo} g`} />
                </div>
              )}
              {bandaNutricion && (
                <p className="text-label text-ink-3 font-sans">
                  {dia.nutricion.comidasHechas !== undefined && dia.nutricion.comidasTotal !== undefined
                    ? `${dia.nutricion.comidasHechas} de ${dia.nutricion.comidasTotal} comidas marcadas`
                    : (dia.nutricion.comidasTotal !== undefined ? `${dia.nutricion.comidasTotal} comidas en el plan` : 'Sin datos de comidas')}
                </p>
              )}
              {dia.refeed && (
                <div
                  className="flex items-start gap-2 mt-3 px-3 py-2 rounded-field"
                  style={{ background: mezcla('var(--color-refeed)', 10), border: `1px solid ${mezcla('var(--color-refeed)', 28)}` }}
                >
                  <Icon name="local_fire_department" size="s" style={{ color: 'var(--color-refeed)', marginTop: 1, flexShrink: 0 }} />
                  <div className="min-w-0">
                    <p className="font-sans font-semibold text-label" style={{ color: 'var(--color-refeed)' }}>Día de recarga</p>
                    {dia.refeed.note && <p className="text-caption text-ink-2 font-sans mt-0.5">{dia.refeed.note}</p>}
                  </div>
                </div>
              )}
            </Tarjeta>

            <Tarjeta icono="directions_run" color="var(--color-cat-cardio)" titulo="Cardio">
              {!dia.entreno.cardio && <p className="text-label text-ink-4 font-sans">Sin cardio este día.</p>}
              {dia.entreno.cardio && (
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-caption uppercase tracking-wider text-ink-4">Tipo</span>
                    <span className="font-sans text-body-s text-white">{dia.entreno.cardio.tipo === 'zona2' ? 'Zona 2' : 'VO₂ máx'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-caption uppercase tracking-wider text-ink-4">Tiempo</span>
                    <span className="font-mono text-title-s font-semibold text-white">{dia.entreno.cardio.minutos} min</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-caption uppercase tracking-wider text-ink-4">FC media</span>
                    <span className="font-mono text-title-s font-semibold text-white">{dia.entreno.cardio.fcMedia ?? '—'}</span>
                  </div>
                </div>
              )}
            </Tarjeta>

            <Tarjeta icono="monitor_weight" color="var(--color-ink-2)" titulo="Registros del día">
              <div className="flex flex-wrap gap-2">
                <span
                  className="text-label px-3 py-1.5 rounded-control font-sans"
                  style={{ color: dia.puntos.peso ? 'var(--color-success)' : 'var(--color-ink-4)', background: 'var(--color-cell)' }}
                >
                  {dia.puntos.peso ? 'Peso anotado' : 'Sin peso'}
                </span>
                <span
                  className="text-label px-3 py-1.5 rounded-control font-sans"
                  style={{ color: fotoDelDia ? 'var(--color-accent)' : 'var(--color-ink-4)', background: fotoDelDia ? 'rgba(255,199,44,0.10)' : 'var(--color-cell)' }}
                >
                  {fotoDelDia ? 'Foto de progreso' : 'Sin foto'}
                </span>
              </div>
            </Tarjeta>

            {dia.hitos.length > 0 && (
              <div className="sm:col-span-2">
                <Tarjeta icono="flag" color="var(--color-accent)" titulo="Fechas clave">
                  <div className="flex flex-col gap-2">
                    {dia.hitos.map(h => (
                      <div key={h.id} className="flex items-center gap-2.5">
                        <Icon name={h.icono} size="s" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                        <span className="font-sans text-label text-ink-2">{h.titulo}</span>
                        {h.completado && <span className="font-mono text-caption text-success">hecho</span>}
                      </div>
                    ))}
                  </div>
                </Tarjeta>
              </div>
            )}

            <div className="sm:col-span-2">
              <Tarjeta icono="sticky_note_2" color="var(--color-accent)" titulo="Notas">
                {notaCoach && (
                  <div className="flex gap-3 items-start mb-3">
                    <span className="flex items-center justify-center flex-shrink-0 font-mono text-caption text-accent rounded-field" style={{ width: 30, height: 30, background: 'rgba(255,199,44,0.14)' }}>C</span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-label font-semibold text-ink-2 font-sans">Tu entrenador</span>
                      <span className="text-body-s text-white font-sans leading-relaxed" style={{ textWrap: 'pretty' }}>{notaCoach.text}</span>
                    </span>
                  </div>
                )}
                {logDelDia?.note && (
                  <div className="flex gap-3 items-start">
                    <span className="flex items-center justify-center flex-shrink-0 font-mono text-caption text-ink-2 rounded-field" style={{ width: 30, height: 30, background: 'var(--color-track)' }}>TÚ</span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-label font-semibold text-ink-2 font-sans">Lo que anotaste</span>
                      <span className="text-body-s text-white font-sans leading-relaxed" style={{ textWrap: 'pretty' }}>{logDelDia.note}</span>
                    </span>
                  </div>
                )}
                {!notaCoach && !logDelDia?.note && <p className="text-caption text-ink-4 font-sans">Sin notas este día.</p>}
              </Tarjeta>
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-x-4 gap-y-2">
              {[
                { clave: 'entreno', fase: dia.faseEntreno, vacio: 'Sin bloque de entreno' },
                { clave: 'nutri', fase: dia.faseNutricion, vacio: 'Sin fase de dieta' },
              ].map(({ clave, fase, vacio }) => (
                <span key={clave} className="flex items-center gap-2 min-w-0">
                  <span className="rounded-full flex-shrink-0" style={{ width: 16, height: 6, background: fase?.color ?? 'var(--color-ink-5)' }} />
                  <span className="font-sans text-label truncate" style={{ color: fase ? mezcla(fase.color, 78) : 'var(--color-ink-5)' }}>
                    {fase?.nombre ?? vacio}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

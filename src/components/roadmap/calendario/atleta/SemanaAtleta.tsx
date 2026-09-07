import React from 'react';
import { CoachDayNote } from '../../../../types';
import { DiaCalendario, BandaEntreno, BandaNutricion, bandaEnFecha } from '../../../../utils/roadmapCalendar';
import { ejerciciosDelDia, diasDeLaSemana, rotuloDeSemana, DatosSemana } from '../../../../utils/semanaCalendario';
import { PlanEvent } from '../../../../utils/planEvents';
import { estiloDeEstado, mezcla, COLOR_CAT_CARDIO } from '../paleta';
import { Icon } from '../../../ui';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/* ═══════════════════════════════════════════════════════════════════════════
   Nivel Semana del atleta.

   El del coach son siete columnas de 300 px de alto: en un móvil cada columna
   mide 45 px y el nombre del ejercicio no entra. Aquí la semana es una AGENDA
   VERTICAL —una tarjeta por día, a todo el ancho— y por eso puede enseñar más
   que la del coach, no menos: el nombre completo de la rutina, cada ejercicio
   con sus series/reps/RIR, la nutrición del día, el cardio, la recarga, los
   hitos y la nota del entrenador. En pantalla ancha se reparte en dos
   columnas; el orden sigue siendo lunes → domingo.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  inicio: string;
  hoy: string;
  indice: Map<string, DiaCalendario>;
  bandasEntreno: BandaEntreno[];
  bandasNutricion: BandaNutricion[];
  datosSemana: DatosSemana;
  coachDayNotes: CoachDayNote[];
  volumeEvents: PlanEvent[];
  sel: string | null;
  onPrev: () => void;
  onNext: () => void;
  onVolverAlMes: () => void;
  onAbrirDia: (fecha: string) => void;
}

function Bloque({ icono, color, titulo, children }: { icono: string; color: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="pt-2.5 mt-2.5 border-t border-hairline first:border-0 first:pt-0 first:mt-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon name={icono} style={{ fontSize: 13, color }} />
        <span className="font-mono text-caption uppercase tracking-wider text-ink-4">{titulo}</span>
      </div>
      {children}
    </div>
  );
}

export default function SemanaAtleta({
  inicio, hoy, indice, bandasEntreno, bandasNutricion, datosSemana, coachDayNotes,
  volumeEvents, sel, onPrev, onNext, onVolverAlMes, onAbrirDia,
}: Props) {
  const dias = diasDeLaSemana(inicio);
  const banda = bandaEnFecha<BandaEntreno>(bandasEntreno, inicio) ?? bandaEnFecha<BandaEntreno>(bandasEntreno, dias[6]);
  const semanaDelBloque = banda
    ? Math.floor((new Date(inicio + 'T00:00:00').getTime() - new Date(banda.inicio + 'T00:00:00').getTime()) / 86400000 / 7) + 1
    : null;

  return (
    <div className="space-y-3.5" style={{ animation: 'fade-up 260ms cubic-bezier(0.2,0.8,0.2,1) both' }}>
      <div className="bg-surface border border-hairline rounded-surface px-3 sm:px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <button type="button" onClick={onVolverAlMes} className="flex items-center gap-1 text-label text-ink-3 hover:text-white transition-colors flex-shrink-0">
            <Icon name="calendar_month" size="s" />Mes
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Igual que en el Mes: 32 px a la vista, 44 al dedo. */}
            <button type="button" onClick={onPrev} aria-label="Semana anterior" className="relative w-8 h-8 rounded-control bg-inset flex items-center justify-center text-ink-2 after:absolute after:content-[''] after:-inset-[6px]">
              <Icon name="chevron_left" size="s" />
            </button>
            <span className="font-sans font-extrabold text-title-s sm:text-title-l text-white text-center truncate" style={{ letterSpacing: '-0.02em', minWidth: 130 }}>
              {rotuloDeSemana(inicio)}
            </span>
            <button type="button" onClick={onNext} aria-label="Semana siguiente" className="relative w-8 h-8 rounded-control bg-inset flex items-center justify-center text-ink-2 after:absolute after:content-[''] after:-inset-[6px]">
              <Icon name="chevron_right" size="s" />
            </button>
          </div>
          <span className="w-8 flex-shrink-0" />
        </div>

        {banda && semanaDelBloque !== null && (
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-7 h-7 rounded-control flex items-center justify-center flex-shrink-0" style={{ background: mezcla(banda.color, 12) }}>
              <Icon name={banda.icono} size="s" style={{ color: banda.color }} />
            </span>
            <span className="font-mono text-caption uppercase tracking-wider text-ink-3 truncate">
              Semana {semanaDelBloque} de {banda.semanas} · {banda.nombre}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-start">
          {dias.map((fecha, i) => {
            const dia = indice.get(fecha);
            const esHoy = fecha === hoy;
            const esFuturo = dia?.esFuturo ?? fecha >= hoy;
            const estilo = dia ? estiloDeEstado(dia.estado) : estiloDeEstado('sin-datos');
            const ejercicios = ejerciciosDelDia(fecha, datosSemana);
            const nota = coachDayNotes.find(n => n.date === fecha);
            const volEvent = volumeEvents.find(e => e.date === fecha);
            const bandaNutri = bandaEnFecha<BandaNutricion>(bandasNutricion, fecha);

            return (
              <div
                key={fecha}
                data-fecha={fecha}
                className="relative flex flex-col text-left w-full transition-colors overflow-hidden"
                style={{
                  padding: '11px 13px 12px',
                  borderRadius: 16,
                  background: sel === fecha ? 'rgba(255,199,44,0.09)' : (esFuturo ? 'transparent' : 'var(--color-cell)'),
                  border: `1px ${esFuturo && !esHoy && sel !== fecha ? 'dashed' : 'solid'} ${
                    sel === fecha ? 'var(--color-accent)'
                      : esHoy ? 'rgba(255,199,44,0.55)'
                        : esFuturo ? 'rgba(245,245,244,0.13)' : 'rgba(255,255,255,0.06)'}`,
                  transitionDuration: '160ms',
                }}
              >
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-hairline w-full">
                  <button
                    type="button"
                    onClick={() => onAbrirDia(fecha)}
                    aria-label={`Ver el detalle del ${DIAS[i].toLowerCase()} ${Number(fecha.slice(8, 10))}`}
                    className="flex items-baseline gap-2 min-w-0 text-left after:absolute after:content-[''] after:inset-0 after:rounded-[16px] after:z-[1]"
                  >
                    <span className="font-sans font-bold text-body-s" style={{ color: esHoy ? 'var(--color-accent)' : 'var(--color-ink)' }}>
                      {DIAS[i]}
                    </span>
                    <span className="font-mono text-label" style={{ color: 'var(--color-ink-4)' }}>{Number(fecha.slice(8, 10))}</span>
                    {esHoy && <span className="font-mono text-[9px] tracking-wider text-accent px-1.5 py-0.5 rounded-[8px]" style={{ background: 'rgba(255,199,44,0.12)' }}>HOY</span>}
                  </button>
                  <span
                    className="flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-control"
                    style={{ background: esFuturo ? 'var(--color-inset)' : estilo.fondo }}
                  >
                    <Icon name={estilo.icono} style={{ fontSize: 12, color: esFuturo ? 'var(--color-ink-3)' : estilo.color }} />
                    <span className="font-mono text-caption" style={{ color: esFuturo ? 'var(--color-ink-3)' : estilo.color }}>
                      {esFuturo ? 'Planificado' : estilo.label}
                    </span>
                  </span>
                </div>

                <div className="w-full min-w-0 pt-2.5">
                  <Bloque icono="fitness_center" color="var(--color-phase-fuerza)" titulo="Entreno">
                    {dia?.entreno.esDescanso && <p className="text-label text-ink-4 font-sans">Descanso</p>}
                    {!dia?.entreno.esDescanso && ejercicios.length === 0 && (
                      <p className="text-label text-ink-5 font-sans">{dia?.entreno.nombreRutina ?? 'Sin entreno'}</p>
                    )}
                    {ejercicios.length > 0 && (
                      <>
                        <p className="font-sans text-body-s font-semibold text-white mb-1.5">{dia?.entreno.nombreRutina}</p>
                        <div className="flex flex-col gap-1">
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
                      </>
                    )}
                    {volEvent && (
                      <p className="flex items-center gap-1 mt-1.5 text-caption font-sans" style={{ color: 'var(--color-phase-fuerza)' }}>
                        <Icon name="trending_up" style={{ fontSize: 12 }} />{volEvent.title}
                      </p>
                    )}
                  </Bloque>

                  {bandaNutri && dia && (
                    <Bloque icono="restaurant" color="var(--color-success)" titulo="Nutrición">
                      <p className="font-mono text-label text-ink-2">
                        {esFuturo ? `${dia.nutricion.kcalObjetivo ?? '—'} kcal de objetivo` : `${dia.nutricion.kcal ?? '—'} / ${dia.nutricion.kcalObjetivo ?? '—'} kcal`}
                      </p>
                      {!esFuturo && dia.nutricion.adherenciaPct !== undefined && (
                        <p className="font-mono text-caption" style={{ color: dia.nutricion.adherenciaPct >= 85 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                          {dia.nutricion.adherenciaPct}% de adherencia
                        </p>
                      )}
                    </Bloque>
                  )}

                  {dia?.entreno.cardio && (
                    <Bloque icono="directions_run" color={COLOR_CAT_CARDIO} titulo="Cardio">
                      <p className="font-mono text-label text-ink-2">
                        {dia.entreno.cardio.tipo === 'zona2' ? 'Zona 2' : 'VO₂'} · {dia.entreno.cardio.minutos} min
                        {dia.entreno.cardio.fcMedia ? ` · ${dia.entreno.cardio.fcMedia} bpm` : ''}
                      </p>
                    </Bloque>
                  )}

                  {dia?.refeed && (
                    <Bloque icono="local_fire_department" color="var(--color-refeed)" titulo="Recarga">
                      <p className="font-sans text-label text-ink-2 leading-snug">{dia.refeed.note || 'Día de recarga'}</p>
                    </Bloque>
                  )}

                  {dia && dia.hitos.length > 0 && (
                    <Bloque icono="flag" color="var(--color-accent)" titulo="Fechas clave">
                      <div className="flex flex-col gap-1">
                        {dia.hitos.map(h => (
                          <p key={h.id} className="font-sans text-label text-ink-2 leading-snug">{h.titulo}</p>
                        ))}
                      </div>
                    </Bloque>
                  )}

                  {nota && (
                    <Bloque icono="sticky_note_2" color="var(--color-accent)" titulo="Nota de tu entrenador">
                      <p className="font-sans text-label text-ink-2 leading-snug" style={{ textWrap: 'pretty' }}>{nota.text}</p>
                    </Bloque>
                  )}
                </div>

                {dia && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-2.5 border-t border-hairline w-full">
                    {[
                      { clave: 'entreno', fase: dia.faseEntreno, vacio: 'Sin bloque' },
                      { clave: 'nutri', fase: dia.faseNutricion, vacio: 'Sin fase de dieta' },
                    ].map(({ clave, fase, vacio }) => (
                      <span key={clave} className="flex items-center gap-1.5 min-w-0">
                        <span className="rounded-full flex-shrink-0" style={{ width: 14, height: 6, background: fase?.color ?? 'var(--color-ink-5)', opacity: esFuturo ? 0.65 : 1 }} />
                        <span className="font-sans text-caption truncate" style={{ color: fase ? mezcla(fase.color, 78) : 'var(--color-ink-5)' }}>
                          {fase?.nombre ?? vacio}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { DiaCalendario } from '../../../utils/roadmapCalendar';
import { Filtro } from './RoadmapCalendario';
import { estiloDeEstado, COLOR_CAT_ENTRENO, COLOR_CAT_NUTRICION, COLOR_CAT_CARDIO, COLOR_CAT_PESO, mezcla } from './paleta';
import { Icon } from '../../ui';

interface Props {
  fecha: string;
  dia: DiaCalendario | undefined;
  filter: Filtro;
  hoy: string;
  selected: boolean;
  onOpen: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  dragOver?: boolean;
  /** Marcador de subida de volumen ese día (Bloque F→H, absorbido del timeline). */
  marcadorVolumen?: { titulo: string; cumplida: boolean } | null;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Badge). */
  key?: React.Key;
}

function Linea({ texto, color, mono }: { texto: string; color: string; mono?: boolean }) {
  return (
    <div
      className={`truncate ${mono ? 'font-mono text-caption' : 'font-sans text-[11.5px] font-semibold'}`}
      style={{ color, letterSpacing: mono ? '0.01em' : undefined }}
    >
      {texto}
    </div>
  );
}

export default function CeldaDia({ fecha, dia, filter, hoy, selected, onOpen, draggable, onDragStart, onDragOver, onDrop, dragOver, marcadorVolumen }: Props) {
  const numero = Number(fecha.slice(8, 10));
  const esHoy = fecha === hoy;
  const esFuturo = dia?.esFuturo ?? fecha >= hoy;
  const estilo = dia ? estiloDeEstado(dia.estado) : estiloDeEstado('sin-datos');
  const detallado = filter !== 'Todo';

  let fondo = 'transparent';
  let borde = 'rgba(245,245,244,0.13)';
  let bordeStyle: 'solid' | 'dashed' = 'dashed';
  if (!esFuturo) { fondo = 'var(--color-cell)'; borde = 'rgba(255,255,255,0.06)'; bordeStyle = 'solid'; }
  if (dia?.destacado) { fondo = mezcla(dia.destacado.color, 6); borde = mezcla(dia.destacado.color, 40); bordeStyle = 'solid'; }
  if (esHoy) { borde = 'rgba(255,199,44,0.55)'; bordeStyle = 'solid'; }
  if (selected) { fondo = 'rgba(255,199,44,0.09)'; borde = 'var(--color-accent)'; bordeStyle = 'solid'; }
  if (dragOver) { borde = 'var(--color-accent)'; bordeStyle = 'solid'; }

  return (
    <div
      role="button"
      tabIndex={0}
      data-fecha={fecha}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex flex-col cursor-pointer transition-colors overflow-hidden"
      style={{
        minHeight: (detallado ? 132 : 104) + (dia?.destacado ? 22 : 0),
        padding: '10px 11px 8px', borderRadius: 16, background: fondo,
        border: `1px ${bordeStyle} ${borde}`,
        boxShadow: dia?.destacado ? `0 0 22px -10px ${dia.destacado.color}` : undefined,
        transitionDuration: '160ms',
      }}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-label" style={{ color: esHoy ? 'var(--color-accent)' : 'var(--color-ink-3)', fontWeight: esHoy ? 600 : 400 }}>{numero}</span>
          {detallado && dia && (
            <span
              className="flex items-center justify-center"
              style={{ width: 20, height: 20, borderRadius: 10, background: estilo.fondo, border: `1px ${esFuturo ? 'dashed' : 'solid'} ${estilo.color}` }}
            >
              <Icon name={estilo.icono} style={{ fontSize: 12, color: estilo.color }} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {marcadorVolumen && (
            <Icon
              name="trending_up"
              style={{ fontSize: 14, color: marcadorVolumen.cumplida ? 'var(--color-phase-fuerza)' : 'var(--color-ink-4)' }}
              label={marcadorVolumen.titulo}
            />
          )}
          {dia && dia.hitos.length > 0 && <Icon name={dia.hitos[0].icono} style={{ fontSize: 15, color: 'var(--color-accent)' }} />}
        </div>
      </div>

      {detallado ? (
        <div className="flex-1 flex flex-col justify-center gap-1 mt-1.5 min-w-0">
          {filter === 'Entrenos' && dia && (
            dia.entreno.esDescanso ? <Linea texto="Descanso" color="var(--color-ink-4)" /> : (
              <>
                <Linea texto={dia.entreno.nombreRutina ?? '—'} color={esFuturo ? 'var(--color-ink-2)' : 'var(--color-ink)'} />
                <Linea texto={`${dia.entreno.seriesHechas ?? 0} / ${dia.entreno.seriesTotal ?? '—'} series`} color="var(--color-ink-2)" mono />
                <Linea
                  texto={esFuturo ? 'Previsto' : (dia.estado === 'skipped' ? 'No hecho' : (dia.entreno.rirMedio !== undefined ? `RIR ${dia.entreno.rirMedio}` : '—'))}
                  color={dia.estado === 'skipped' ? 'var(--color-danger)' : 'var(--color-ink-4)'} mono
                />
                {dia.entreno.cardio
                  ? <Linea texto={`${dia.entreno.cardio.tipo === 'zona2' ? 'Z2' : 'VO₂'} ${dia.entreno.cardio.minutos} min${dia.entreno.cardio.fcMedia ? ` · ${dia.entreno.cardio.fcMedia} bpm` : ''}`} color="var(--color-cat-cardio)" mono />
                  : <Linea texto="Sin cardio" color="var(--color-ink-5)" mono />}
              </>
            )
          )}
          {filter === 'Nutrición' && dia && dia.faseNutricion && (
            <>
              <Linea texto={esFuturo ? `Objetivo ${dia.nutricion.kcalObjetivo ?? '—'}` : `${dia.nutricion.kcal ?? '—'} kcal`} color={esFuturo ? 'var(--color-ink-2)' : 'var(--color-ink)'} mono />
              <Linea texto={esFuturo ? `${dia.nutricion.comidasTotal ?? '—'} comidas plan` : `de ${dia.nutricion.kcalObjetivo ?? '—'} kcal`} color="var(--color-ink-4)" mono />
              <Linea
                texto={esFuturo ? '—' : (dia.nutricion.adherenciaPct !== undefined ? `Adherencia ${dia.nutricion.adherenciaPct}%` : '—')}
                color={esFuturo ? 'var(--color-ink-5)' : (dia.nutricion.adherenciaPct !== undefined && dia.nutricion.adherenciaPct >= 85 ? 'var(--color-success)' : 'var(--color-warning)')} mono
              />
            </>
          )}
          {filter === 'Hitos' && (
            dia && dia.hitos.length > 0
              ? <><Linea texto={dia.hitos[0].titulo} color="var(--color-accent)" />
                  <Linea texto={dia.hitos[0].completado ? 'Completado' : 'Programado'} color="var(--color-ink-3)" mono /></>
              : <Linea texto="—" color="var(--color-ink-5)" mono />
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5">
          <div
            className="flex items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: 17, background: estilo.fondo, border: `1.5px ${esFuturo ? 'dashed' : 'solid'} ${estilo.color}` }}
          >
            <Icon name={estilo.icono} style={{ fontSize: 17, color: estilo.color }} />
          </div>
          <div className="flex items-center gap-1" style={{ height: 6 }}>
            {dia?.puntos.entreno && <span style={{ width: 6, height: 6, borderRadius: 3, background: COLOR_CAT_ENTRENO }} />}
            {dia?.puntos.nutricion && <span style={{ width: 6, height: 6, borderRadius: 3, background: COLOR_CAT_NUTRICION }} />}
            {dia?.puntos.cardio && <span style={{ width: 6, height: 6, borderRadius: 3, background: COLOR_CAT_CARDIO }} />}
            {dia?.puntos.peso && <span style={{ width: 6, height: 6, borderRadius: 3, background: COLOR_CAT_PESO }} />}
          </div>
        </div>
      )}

      {dia?.destacado && (
        <div
          className="flex items-center gap-1 mt-1.5 px-[7px] py-1 rounded-[9px] font-bold overflow-hidden"
          style={{ background: mezcla(dia.destacado.color, 12), color: dia.destacado.color, fontSize: 10 }}
        >
          <Icon name={dia.destacado.icono} style={{ fontSize: 12, flexShrink: 0 }} />
          <span className="truncate">{dia.destacado.etiqueta}</span>
        </div>
      )}

      {/* En el Mes no cabe el nombre de la fase (en el Nivel Semana sí, y ahí
          va escrito). Aquí se engorda la rayita y se sube la opacidad del
          futuro: a 3px y 42% no se distinguían los colores. El tooltip dice
          los nombres en vez del genérico "fase de entreno · de nutrición". */}
      {dia && (
        <div
          className="flex gap-0.5 mt-2 rounded-[3px] overflow-hidden"
          style={{ height: 6 }}
          title={`${dia.faseEntreno?.nombre ?? 'Sin bloque'} · ${dia.faseNutricion?.nombre ?? 'sin fase de nutrición'}`}
        >
          <div style={{ flex: 1, background: dia.faseEntreno?.color ?? 'var(--color-ink-5)', opacity: esFuturo ? 0.6 : 1 }} />
          <div style={{ flex: 1, background: dia.faseNutricion?.color ?? 'var(--color-ink-5)', opacity: esFuturo ? 0.6 : 1 }} />
        </div>
      )}
    </div>
  );
}

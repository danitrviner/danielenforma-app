import React from 'react';
import { DiaCalendario, BandaEntreno, BandaNutricion, recortarAlMes, hitosDelMes, adherenciaDelMes } from '../../../../utils/roadmapCalendar';
import { addDays } from '../../../../utils/trainingWeek';
import { estiloDeEstado, mezcla, COLOR_CAT_ENTRENO, COLOR_CAT_NUTRICION, COLOR_CAT_CARDIO, COLOR_CAT_PESO } from '../paleta';
import { Icon } from '../../../ui';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function fmtCorta(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${Number(d)} ${MESES_CORTO[Number(m) - 1]}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Nivel Mes del atleta.

   Es el mismo mes del coach —mismas fases, mismos estados de día, mismo
   índice— con dos diferencias que vienen de que aquí se MIRA en vez de
   programar:

   1. La celda no tiene modo "detallado". En el coach, los filtros meten tres
      renglones de texto dentro de cada día; en un móvil de 375 px una columna
      mide ~44 px y ahí no cabe ni "Descanso". El detalle del día vive en el
      Nivel Semana (una tarjeta por día, a lo ancho) y en el sheet — no se
      pierde nada, se mueve al sitio donde sí se lee.
   2. Nada se arrastra, nada se edita: el plan lo pone el coach.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  anio: number;
  mes: number;
  hoy: string;
  indice: Map<string, DiaCalendario>;
  bandasEntreno: BandaEntreno[];
  bandasNutricion: BandaNutricion[];
  sel: string | null;
  onPrevMes: () => void;
  onNextMes: () => void;
  onVolverAlAno: () => void;
  onAbrirDia: (fecha: string) => void;
  onAbrirSemana: (inicio: string) => void;
  /** Lunes de cada semana del mes, en orden — lo calcula el contenedor. */
  semanas: { inicio: string; fin: string; etiqueta: string }[];
}

function CarrilFase({ icono, label, segmentos }: {
  icono: string; label: string; segmentos: ReturnType<typeof recortarAlMes<BandaEntreno | BandaNutricion>>;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center justify-center flex-shrink-0 w-6 h-6 rounded-control bg-inset" title={label}>
        <Icon name={icono} size="s" style={{ color: 'var(--color-ink-3)' }} />
      </span>
      <div className="flex-1 relative" style={{ height: 30 }}>
        {segmentos.length === 0 && (
          <span className="absolute inset-0 flex items-center font-sans text-caption text-ink-5">Sin {label.toLowerCase()} este mes</span>
        )}
        {segmentos.map(s => (
          <div
            key={s.banda.id}
            title={`${s.banda.nombre} · ${s.banda.inicio} — ${s.banda.fin}`}
            style={{
              position: 'absolute', top: 0, bottom: 0, left: `${s.leftPct}%`, width: `calc(${s.widthPct}% - 3px)`,
              display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', overflow: 'hidden',
              background: mezcla(s.banda.color, 9), border: `1px solid ${mezcla(s.banda.color, 20)}`,
              borderRadius: `${s.entraAntes ? 4 : 10}px ${s.sigueDespues ? 4 : 10}px ${s.sigueDespues ? 4 : 10}px ${s.entraAntes ? 4 : 10}px`,
            }}
          >
            <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: s.banda.color }} />
            {s.widthPct > 22 && (
              <span className="font-sans text-[11px] font-semibold text-ink truncate">{s.banda.nombre}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CeldaDiaAtleta({ fecha, dia, hoy, sel, onAbrir }: {
  fecha: string; dia: DiaCalendario | undefined; hoy: string; sel: string | null; onAbrir: () => void;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver CeldaDia). */
  key?: React.Key;
}) {
  const esHoy = fecha === hoy;
  const seleccionado = sel === fecha;
  const esFuturo = dia?.esFuturo ?? fecha >= hoy;
  const estilo = dia ? estiloDeEstado(dia.estado) : estiloDeEstado('sin-datos');

  let fondo = 'transparent';
  let borde = 'rgba(245,245,244,0.13)';
  let bordeStyle: 'solid' | 'dashed' = 'dashed';
  if (!esFuturo) { fondo = 'var(--color-cell)'; borde = 'rgba(255,255,255,0.06)'; bordeStyle = 'solid'; }
  if (dia?.destacado) { fondo = mezcla(dia.destacado.color, 6); borde = mezcla(dia.destacado.color, 40); bordeStyle = 'solid'; }
  if (esHoy) { borde = 'rgba(255,199,44,0.55)'; bordeStyle = 'solid'; }
  if (seleccionado) { fondo = 'rgba(255,199,44,0.09)'; borde = 'var(--color-accent)'; bordeStyle = 'solid'; }

  // Los puntitos de categoría son color puro: quien no los ve necesita
  // oírlos. El nombre accesible del botón los dice, junto con el hito, para
  // que el lector de pantalla cuente lo mismo que ve el ojo y no solo la
  // fecha y el estado.
  const registrado: { color: string; nombre: string }[] = [
    dia?.puntos.entreno && { color: COLOR_CAT_ENTRENO, nombre: 'entreno' },
    dia?.puntos.nutricion && { color: COLOR_CAT_NUTRICION, nombre: 'dieta en objetivo' },
    dia?.puntos.cardio && { color: COLOR_CAT_CARDIO, nombre: 'cardio' },
    dia?.puntos.peso && { color: COLOR_CAT_PESO, nombre: 'peso' },
  ].filter(Boolean) as { color: string; nombre: string }[];

  const etiqueta = [
    fecha,
    dia ? (esFuturo ? 'planificado' : estilo.label.toLowerCase()) : null,
    registrado.length > 0 ? `registrado: ${registrado.map(r => r.nombre).join(', ')}` : null,
    dia && dia.hitos.length > 0 ? `fecha clave: ${dia.hitos.map(h => h.titulo).join(', ')}` : null,
    dia?.faseEntreno ? `bloque ${dia.faseEntreno.nombre}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      data-fecha={fecha}
      onClick={onAbrir}
      aria-label={etiqueta}
      className="flex flex-col items-center justify-between min-h-[54px] sm:min-h-[78px] px-1 pt-1.5 pb-1 overflow-hidden transition-[border-color,background-color,transform] active:scale-[.96]"
      style={{ borderRadius: 12, background: fondo, border: `1px ${bordeStyle} ${borde}`, transitionDuration: '160ms' }}
    >
      <span className="flex items-center gap-0.5 self-stretch justify-center relative">
        <span
          className="font-mono text-[11px] sm:text-label"
          style={{ color: esHoy ? 'var(--color-accent)' : 'var(--color-ink-3)', fontWeight: esHoy ? 600 : 400 }}
        >
          {Number(fecha.slice(8, 10))}
        </span>
        {dia && dia.hitos.length > 0 && (
          <Icon name={dia.hitos[0].icono} style={{ fontSize: 12, color: 'var(--color-accent)', position: 'absolute', right: 0, top: 0 }} />
        )}
      </span>

      <span
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 20, height: 20, borderRadius: 10, background: estilo.fondo,
          border: `1.5px ${esFuturo ? 'dashed' : 'solid'} ${estilo.color}`,
        }}
      >
        <Icon name={estilo.icono} style={{ fontSize: 12, color: estilo.color }} />
      </span>

      <span className="flex items-center gap-[3px]" style={{ height: 5 }}>
        {registrado.map(r => <span key={r.nombre} style={{ width: 4, height: 4, borderRadius: 2, background: r.color }} />)}
      </span>

      {dia && (
        <span className="flex gap-0.5 self-stretch rounded-[2px] overflow-hidden" style={{ height: 4 }}>
          <span style={{ flex: 1, background: dia.faseEntreno?.color ?? 'var(--color-ink-5)', opacity: esFuturo ? 0.6 : 1 }} />
          <span style={{ flex: 1, background: dia.faseNutricion?.color ?? 'var(--color-ink-5)', opacity: esFuturo ? 0.6 : 1 }} />
        </span>
      )}
    </button>
  );
}

export default function MesAtleta({
  anio, mes, hoy, indice, bandasEntreno, bandasNutricion, sel,
  onPrevMes, onNextMes, onVolverAlAno, onAbrirDia, onAbrirSemana, semanas,
}: Props) {
  // Memoizados porque este componente re-renderiza en CADA toque de celda
  // (el día seleccionado vive en el padre), y recortar bandas o recorrer el
  // índice del mes entero no depende de qué día esté abierto.
  const laneTrain = React.useMemo(() => recortarAlMes(bandasEntreno, anio, mes), [bandasEntreno, anio, mes]);
  const laneNutri = React.useMemo(() => recortarAlMes(bandasNutricion, anio, mes), [bandasNutricion, anio, mes]);
  const hitos = React.useMemo(() => hitosDelMes(indice, anio, mes, 99), [indice, anio, mes]);
  const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
  const adherencia = React.useMemo(
    () => (prefijo <= hoy.slice(0, 7) ? adherenciaDelMes(indice, anio, mes) : null),
    [prefijo, hoy, indice, anio, mes],
  );

  return (
    <div className="space-y-3.5" style={{ animation: 'fade-up 260ms cubic-bezier(0.2,0.8,0.2,1) both' }}>
      <div className="bg-surface border border-hairline rounded-surface px-3 sm:px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <button type="button" onClick={onVolverAlAno} className="flex items-center gap-1 text-label text-ink-3 hover:text-white transition-colors flex-shrink-0">
            <Icon name="grid_view" size="s" />Año
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            {/* El cuadrado visible sigue siendo de 32 px; el `after` estira la
                zona de toque a 44x44 sin mover nada de sitio (el hueco entre
                botones es mayor que el desbordamiento, así que no se pisan). */}
            <button type="button" onClick={onPrevMes} disabled={mes === 0} aria-label="Mes anterior" className="relative w-8 h-8 rounded-control bg-inset flex items-center justify-center text-ink-2 disabled:opacity-30 after:absolute after:content-[''] after:-inset-[6px]">
              <Icon name="chevron_left" size="s" />
            </button>
            <span className="font-sans font-extrabold text-title-s sm:text-title-l text-white text-center truncate" style={{ letterSpacing: '-0.02em', minWidth: 110 }}>
              {MESES[mes]}
            </span>
            <button type="button" onClick={onNextMes} disabled={mes === 11} aria-label="Mes siguiente" className="relative w-8 h-8 rounded-control bg-inset flex items-center justify-center text-ink-2 disabled:opacity-30 after:absolute after:content-[''] after:-inset-[6px]">
              <Icon name="chevron_right" size="s" />
            </button>
          </div>
          <span className="font-mono text-label flex-shrink-0" style={{ color: adherencia === null ? 'var(--color-ink-5)' : adherencia >= 80 ? 'var(--color-success)' : 'var(--color-warning)' }}>
            {adherencia === null ? 'plan' : `${adherencia}%`}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 bg-raised border border-hairline rounded-field px-2.5 py-2.5 mb-4">
          <CarrilFase icono="fitness_center" label="Entreno" segmentos={laneTrain} />
          <CarrilFase icono="restaurant" label="Nutrición" segmentos={laneNutri} />
        </div>

        <div className="grid gap-1 sm:gap-2 mb-1.5 grid-cols-[repeat(7,minmax(0,1fr))] sm:grid-cols-[repeat(7,minmax(0,1fr))_36px]">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="font-mono text-caption tracking-widest text-ink-4 text-center">{d}</div>
          ))}
          <div className="hidden sm:block" />
        </div>

        <div className="flex flex-col gap-1 sm:gap-2">
          {semanas.map(semana => (
            <div key={semana.inicio} className="grid gap-1 sm:gap-2 grid-cols-[repeat(7,minmax(0,1fr))] sm:grid-cols-[repeat(7,minmax(0,1fr))_36px]">
              {Array.from({ length: 7 }, (_, i) => addDays(semana.inicio, i)).map(fecha => (
                fecha.slice(0, 7) !== prefijo
                  ? <div key={fecha} />
                  : <CeldaDiaAtleta key={fecha} fecha={fecha} dia={indice.get(fecha)} hoy={hoy} sel={sel} onAbrir={() => onAbrirDia(fecha)} />
              ))}
              {/* Atajo al Nivel Semana: en el coach este mismo hueco abre el hub
                  de programar; aquí abre la semana a lo ancho, que es donde el
                  atleta ve sus ejercicios sin tener que entrar día a día. */}
              <button
                type="button"
                onClick={() => onAbrirSemana(semana.inicio)}
                title={`Ver la semana del ${semana.etiqueta}`}
                aria-label={`Ver la semana del ${semana.etiqueta}`}
                className="hidden sm:flex relative w-9 self-center h-10 rounded-control bg-inset border border-hairline items-center justify-center text-ink-3 hover:text-accent hover:border-accent-line transition-colors active:scale-[.96] after:absolute after:content-[''] after:-inset-x-[4px]"
              >
                <Icon name="chevron_right" size="s" />
              </button>
            </div>
          ))}
        </div>

        <p className="flex items-center gap-1.5 mt-3.5 text-caption text-ink-4 font-sans">
          <Icon name="touch_app" size="s" />Toca un día para ver su detalle
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="bg-surface border border-hairline rounded-surface px-4 sm:px-5 py-4">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-3 mb-3">Fechas clave de {MESES[mes].toLowerCase()}</p>
          {hitos.length === 0 && <p className="text-caption text-ink-4 font-sans">Ninguna este mes.</p>}
          <div className="flex flex-col gap-2.5">
            {hitos.map(({ fecha, hito }) => (
              <button key={hito.id} type="button" onClick={() => onAbrirDia(fecha)} className="flex items-center gap-2.5 text-left">
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 12, background: 'rgba(255,199,44,0.12)' }}>
                  <Icon name={hito.icono} size="s" style={{ color: 'var(--color-accent)' }} />
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-label font-semibold font-sans text-white truncate">{hito.titulo}</span>
                  <span className="font-mono text-caption text-ink-4">{fmtCorta(fecha)}{hito.completado ? ' · hecho' : ''}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-hairline rounded-surface px-4 sm:px-5 py-4">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-3 mb-3">Cómo leer el calendario</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {[
              { c: 'var(--color-success)', bg: 'rgba(62,207,142,0.18)', icon: 'check', l: 'Entreno hecho' },
              { c: 'var(--color-warning)', bg: 'rgba(253,186,116,0.15)', icon: 'remove', l: 'A medias' },
              { c: 'var(--color-danger)', bg: 'rgba(255,90,78,0.14)', icon: 'close', l: 'Saltado' },
              { c: 'var(--color-ink-3)', bg: 'transparent', icon: 'bedtime', l: 'Descanso' },
              { c: 'var(--color-ink-4)', bg: 'transparent', icon: 'schedule', l: 'Por venir' },
            ].map(s => (
              <div key={s.l} className="flex items-center gap-2 text-label font-sans text-ink-2">
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 20, height: 20, borderRadius: 10, border: `1.5px ${s.icon === 'schedule' ? 'dashed' : 'solid'} ${s.c}`, background: s.bg }}>
                  <Icon name={s.icon} style={{ fontSize: 12, color: s.c }} />
                </span>
                {s.l}
              </div>
            ))}
          </div>
          <div className="h-px bg-hairline my-3.5" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {[
              { c: COLOR_CAT_ENTRENO, l: 'Entreno' },
              { c: COLOR_CAT_NUTRICION, l: 'Dieta en objetivo' },
              { c: COLOR_CAT_CARDIO, l: 'Cardio' },
              { c: COLOR_CAT_PESO, l: 'Peso anotado' },
            ].map(s => (
              <div key={s.l} className="flex items-center gap-2 text-label font-sans text-ink-2">
                <span style={{ width: 8, height: 8, borderRadius: 4, background: s.c, flexShrink: 0 }} />{s.l}
              </div>
            ))}
          </div>
          <div className="h-px bg-hairline my-3.5" />
          <div className="flex items-center gap-2 text-label font-sans text-ink-2">
            <span className="flex gap-0.5 flex-shrink-0 rounded-[2px] overflow-hidden" style={{ width: 22, height: 4 }}>
              <span style={{ flex: 1, background: 'var(--color-phase-hiper)' }} />
              <span style={{ flex: 1, background: 'var(--color-phase-defi)' }} />
            </span>
            La rayita de abajo: fase de entreno · de dieta
          </div>
        </div>
      </div>
    </div>
  );
}

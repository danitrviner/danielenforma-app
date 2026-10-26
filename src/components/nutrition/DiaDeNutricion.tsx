import React from 'react';
import { Icon } from '../ui';
import { addDays } from '../../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Diario de nutrición del atleta (Dani, 26-10-2026)

   Una sola pantalla, en kcal y gramos: arriba la semana de lunes a domingo y
   la tarjeta del día (comido · quedan · objetivo y las tres macros). Las
   comidas, debajo, con el diseño del antiguo panel de intercambios.
   ═══════════════════════════════════════════════════════════════════════════ */

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Lunes de la semana de `fecha` (YYYY-MM-DD). */
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  return addDays(fecha, -dow);
}

function IconoMas() {
  // «more_horiz» no está en el subconjunto de iconos: el vertical, girado.
  return <Icon name="more_vert" size="m" style={{ transform: 'rotate(90deg)' }} />;
}

/* ── Semana de lunes a domingo ─────────────────────────────────────────── */

function AnilloDia({ pct, activo }: { pct: number | null; activo: boolean }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="absolute inset-0">
      <circle cx="20" cy="20" r={r} fill="none" stroke={activo ? 'var(--color-ink-3)' : 'var(--color-ink-4)'} strokeWidth="2" strokeDasharray={pct === null ? '3 3.3' : undefined} />
      {pct !== null && pct > 0 && (
        <circle
          cx="20" cy="20" r={r} fill="none" stroke={pct > 105 ? 'var(--color-danger)' : 'var(--color-accent)'} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={`${Math.min(1, pct / 100) * c} ${c}`} transform="rotate(-90 20 20)"
        />
      )}
    </svg>
  );
}

export function SemanaDelDiario({ fecha, maxFecha, pctPorFecha, onIrAlDia }: {
  fecha: string;
  maxFecha: string;
  /** % del objetivo cubierto por día; sin dato, el anillo sale punteado. */
  pctPorFecha: (fecha: string) => number | null;
  onIrAlDia: (fecha: string) => void;
}) {
  const lunes = lunesDe(fecha);
  return (
    <div className="grid grid-cols-7 gap-1">
      {DIAS.map((d, i) => {
        const dia = addDays(lunes, i);
        const activo = dia === fecha;
        const num = Number(dia.slice(8));
        return (
          <button
            key={dia}
            type="button"
            disabled={dia > maxFecha}
            onClick={() => onIrAlDia(dia)}
            aria-label={`${NOMBRES[i]} ${num}`}
            aria-pressed={activo}
            className={`flex flex-col items-center gap-1.5 rounded-surface py-2 transition-colors disabled:opacity-30 ${activo ? 'bg-surface' : ''}`}
          >
            <span className={`font-sans text-body-s ${activo ? 'font-bold text-ink' : 'text-ink-2'}`}>{d}</span>
            <span className="relative flex h-10 w-10 items-center justify-center">
              <AnilloDia pct={pctPorFecha(dia)} activo={activo} />
              <span className={`font-mono text-body font-bold ${activo ? 'text-ink' : 'text-ink-2'}`}>{num}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Tarjeta del día ───────────────────────────────────────────────────── */

/** Arco de 270° con lo que queda del día. */
function Arco({ quedan, pct, texto }: { quedan: number; pct: number; texto: string }) {
  const r = 52;
  const largo = 2 * Math.PI * r * 0.75;
  const lleno = Math.max(0, Math.min(1, pct)) * largo;
  const pasado = quedan < 0;
  return (
    <div className="relative h-[124px] w-[124px] flex-none">
      <svg width="124" height="124" viewBox="0 0 124 124" aria-hidden>
        <circle cx="62" cy="62" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${largo} 999`} transform="rotate(135 62 62)" />
        {lleno > 0 && (
          <circle cx="62" cy="62" r={r} fill="none" stroke={pasado ? 'var(--color-danger)' : 'var(--color-accent)'} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${lleno} 999`} transform="rotate(135 62 62)" />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono text-title-l font-bold leading-none ${pasado ? 'text-danger' : 'text-ink'}`}>{texto}</span>
        <span className="mt-1 font-sans text-body-s text-ink-2">{pasado ? 'de más' : 'quedan'}</span>
      </div>
    </div>
  );
}

export interface MacroDelDia {
  etiqueta: string;
  comido: number;
  objetivo: number;
  color: string;
}

export function TarjetaDelDia(p: {
  etiquetaDia: string;
  puedeAvanzar: boolean;
  onDiaAnterior: () => void;
  onDiaSiguiente: () => void;
  onHoy: () => void;
  onMasOpciones: () => void;
  comido: number;
  objetivo: number;
  /** Cómo se escriben las cifras de esta pestaña (kcal enteras o intercambios con decimales). */
  fmt: (n: number) => string;
  /** «comido» / «comidos»: el plural depende de la unidad. */
  etiquetaComido: string;
  /** Línea pequeña bajo el arco (la unidad). */
  pie?: string;
  macros: MacroDelDia[];
  fmtMacro: (comido: number, objetivo: number) => string;
  /** El día cerrado dentro del presupuesto. */
  cerrado?: boolean;
  /** Avisos debajo de las macros (estimaciones, productos sin datos). */
  nota?: React.ReactNode;
}) {
  const quedan = p.objetivo - p.comido;
  return (
    <div className="overflow-hidden rounded-canvas bg-surface">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span aria-hidden className="h-10 w-10" />
        <div className="flex items-center gap-1">
          <button type="button" onClick={p.onDiaAnterior} aria-label="Día anterior" className="flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink">
            <Icon name="chevron_left" size="m" />
          </button>
          <button type="button" onClick={p.onHoy} className="min-w-[88px] font-sans text-title-s font-bold text-ink">{p.etiquetaDia}</button>
          <button type="button" onClick={p.onDiaSiguiente} disabled={!p.puedeAvanzar} aria-label="Día siguiente" className="flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink disabled:opacity-30">
            <Icon name="chevron_right" size="m" />
          </button>
        </div>
        <button type="button" onClick={p.onMasOpciones} aria-label="Más opciones del día" className="flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink">
          <IconoMas />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="w-20 text-center">
          <span className="block font-mono text-title-m font-bold text-ink">{p.fmt(p.comido)}</span>
          <span className="font-sans text-body-s text-ink-2">{p.etiquetaComido}</span>
        </div>
        <Arco quedan={quedan} pct={p.objetivo > 0 ? p.comido / p.objetivo : 0} texto={p.fmt(Math.abs(quedan))} />
        <div className="w-20 text-center">
          <span className="block font-mono text-title-m font-bold text-ink">{p.fmt(p.objetivo)}</span>
          <span className="font-sans text-body-s text-ink-2">objetivo</span>
        </div>
      </div>
      <p className="px-4 pb-3 text-center font-mono text-caption text-ink-3">
        {p.cerrado ? <span className="font-bold text-accent-ink">Día cerrado en presupuesto</span> : p.pie}
      </p>

      <div className="grid grid-cols-3 gap-4 border-t border-hairline px-4 py-4">
        {p.macros.map(m => {
          const pasado = m.objetivo > 0 && m.comido > m.objetivo;
          return (
            <div key={m.etiqueta} className="min-w-0 text-center">
              <span className="block font-sans text-body-s font-bold text-ink">{m.etiqueta}</span>
              <span className={`block font-mono text-caption ${pasado ? 'text-danger' : 'text-ink-2'}`}>{p.fmtMacro(m.comido, m.objetivo)}</span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-hairline">
                <span className="block h-full rounded-full" style={{ width: `${m.objetivo > 0 ? Math.min(100, (m.comido / m.objetivo) * 100) : 0}%`, background: pasado ? 'var(--color-danger)' : m.color }} />
              </span>
            </div>
          );
        })}
      </div>
      {p.nota && <div className="border-t border-hairline px-4 py-2.5 font-sans text-caption text-ink-3">{p.nota}</div>}
    </div>
  );
}

/* ── Cabecera de cada comida ───────────────────────────────────────────── */

export interface MacroDeComida {
  etiqueta: string;
  comido: number;
  objetivo: number;
  color: string;
}

/** Etiqueta de una macro de la comida: punto de color y «HC 4/5». */
export function EtiquetaMacro({ m, fmt }: { m: MacroDeComida; fmt: (comido: number, objetivo: number) => string }) {
  const ok = m.objetivo > 0 && Math.round(m.comido * 100) >= Math.round(m.objetivo * 100);
  const pasado = m.objetivo > 0 && m.comido > m.objetivo + 0.001;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-raised px-2 py-0.5 font-mono text-caption font-semibold ${pasado ? 'text-danger' : ok ? 'text-ink' : 'text-ink-2'}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.etiqueta} {fmt(m.comido, m.objetivo)}
    </span>
  );
}

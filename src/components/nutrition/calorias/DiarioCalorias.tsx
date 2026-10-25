import React, { useState } from 'react';
import { Icon, Sheet } from '../../ui';
import MealItemSwipeRow from '../MealItemSwipeRow';
import type { LineaDiario } from '../../../utils/diarioCalorias';
import { addDays } from '../../../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Diario en «Calorías y macros» (Dani, 25-10-2026)

   La pantalla «Nutrition» que enseñó Dani: Diario | Plan arriba, la semana de
   lunes a domingo, la tarjeta del día (comido · quedan · objetivo y las tres
   barras de macros) y las comidas como filas con su «+».

   Cada comida empieza vacía: solo sale lo que el atleta apunta, escanea o
   busca. El plan del coach se mira en «Plan» y desde ahí se copia.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ComidaDiario {
  id: string;
  nombre: string;
  kcalObjetivo: number;
  lineas: LineaDiario[];
}

export interface ComidaPlan {
  nombre: string;
  kcal: number;
  filas: { nombre: string; detalle: string }[];
}

interface Props {
  fecha: string;
  hoy: string;
  maxFecha: string;
  onIrAlDia: (fecha: string) => void;
  /** kcal apuntadas por día (para los anillos de la semana). */
  kcalPorFecha: Record<string, number>;
  kcalObjetivo: number;
  comido: { kcal: number; p: number; hc: number; g: number };
  objetivos: { p: number; hc: number; g: number };
  aproximado: boolean;
  incompletos: number;
  comidas: ComidaDiario[];
  plan: ComidaPlan[] | null;
  onCopiarPlan: (indice: number) => void;
  onAnadir: (mealId: string) => void;
  onAbrirLinea: (mealId: string, linea: LineaDiario) => void;
  onQuitarLinea: (mealId: string, idxs: number[]) => void;
  onCopiarAyer: (mealId: string) => void;
  onGuardarComoComida: (mealId: string) => void;
  onVaciar: (mealId: string) => void;
  onReparto: () => void;
  onVerIntercambios: () => void;
  onAnadirComida: () => void;
}

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Lunes de la semana de `fecha` (YYYY-MM-DD). */
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  return addDays(fecha, -dow);
}

const num = (n: number) => Math.round(n).toLocaleString('es-ES');

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

/** Arco de 270° con lo que queda del día. */
function ArcoKcal({ quedan, pct }: { quedan: number; pct: number }) {
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
        <span className={`font-mono text-title-l font-bold leading-none ${pasado ? 'text-danger' : 'text-ink'}`}>{num(Math.abs(quedan))}</span>
        <span className="mt-1 font-sans text-body-s text-ink-2">{pasado ? 'de más' : 'quedan'}</span>
      </div>
    </div>
  );
}

function OpcionMenu({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-control px-2 py-3.5 text-left hover:bg-raised">
      <Icon name={icon} size="m" className="text-ink-2" />
      <span className="font-sans text-body text-ink">{label}</span>
    </button>
  );
}

function IconoMas() {
  // «more_horiz» no está en el subconjunto de iconos: el vertical, girado.
  return <Icon name="more_vert" size="m" style={{ transform: 'rotate(90deg)' }} />;
}

export default function DiarioCalorias(p: Props) {
  const [vista, setVista] = useState<'diario' | 'plan'>('diario');
  const [menuDia, setMenuDia] = useState(false);
  const [menuComida, setMenuComida] = useState<string | null>(null);

  const lunes = lunesDe(p.fecha);
  const semana = DIAS.map((d, i) => {
    const fecha = addDays(lunes, i);
    const kcal = p.kcalPorFecha[fecha];
    return { fecha, d, num: Number(fecha.slice(8)), pct: kcal && p.kcalObjetivo > 0 ? (kcal / p.kcalObjetivo) * 100 : null };
  });
  const etiquetaDia = p.fecha === p.hoy ? 'Hoy'
    : p.fecha === addDays(p.hoy, -1) ? 'Ayer'
    : p.fecha === addDays(p.hoy, 1) ? 'Mañana'
    : `${NOMBRES[(new Date(`${p.fecha}T12:00:00`).getDay() + 6) % 7]} ${Number(p.fecha.slice(8))}`;

  const quedan = p.kcalObjetivo - p.comido.kcal;
  const comidaMenu = p.comidas.find(c => c.id === menuComida);

  return (
    <div className="space-y-4">
      {/* Diario | Plan */}
      <div className="flex items-center justify-between">
        <div role="tablist" aria-label="Qué ver" className="inline-flex rounded-full border border-hairline bg-surface p-1">
          {(['diario', 'plan'] as const).map(v => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={`rounded-full px-4 py-1.5 font-sans text-body transition-colors ${vista === v ? 'bg-raised font-bold text-ink' : 'text-ink-2'}`}
            >
              {v === 'diario' ? 'Diario' : 'Plan'}
            </button>
          ))}
        </div>
        <button type="button" onClick={p.onVerIntercambios} className="font-sans text-body-s text-ink-2 hover:text-accent-ink">
          Ver en intercambios
        </button>
      </div>

      {/* Semana de lunes a domingo */}
      <div className="grid grid-cols-7 gap-1">
        {semana.map(d => {
          const activo = d.fecha === p.fecha;
          const fuera = d.fecha > p.maxFecha;
          return (
            <button
              key={d.fecha}
              type="button"
              disabled={fuera}
              onClick={() => p.onIrAlDia(d.fecha)}
              aria-label={`${NOMBRES[DIAS.indexOf(d.d)]} ${d.num}`}
              aria-pressed={activo}
              className={`flex flex-col items-center gap-1.5 rounded-surface py-2 transition-colors disabled:opacity-30 ${activo ? 'bg-surface' : ''}`}
            >
              <span className={`font-sans text-body-s ${activo ? 'font-bold text-ink' : 'text-ink-2'}`}>{d.d}</span>
              <span className="relative flex h-10 w-10 items-center justify-center">
                <AnilloDia pct={d.pct} activo={activo} />
                <span className={`font-mono text-body font-bold ${activo ? 'text-ink' : 'text-ink-2'}`}>{d.num}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Tarjeta del día */}
      <div className="overflow-hidden rounded-canvas bg-surface">
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
          <button type="button" onClick={p.onReparto} aria-label="Reparto de calorías por comida" className="flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink">
            <Icon name="bar_chart" size="m" />
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => p.onIrAlDia(addDays(p.fecha, -1))} aria-label="Día anterior" className="flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink">
              <Icon name="chevron_left" size="m" />
            </button>
            <button type="button" onClick={() => p.onIrAlDia(p.hoy)} className="min-w-[88px] font-sans text-title-s font-bold text-ink">{etiquetaDia}</button>
            <button type="button" onClick={() => p.onIrAlDia(addDays(p.fecha, 1))} disabled={p.fecha >= p.maxFecha} aria-label="Día siguiente" className="flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink disabled:opacity-30">
              <Icon name="chevron_right" size="m" />
            </button>
          </div>
          <button type="button" onClick={() => setMenuDia(true)} aria-label="Más opciones del día" className="flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink">
            <IconoMas />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <div className="w-20 text-center">
            <span className="block font-mono text-title-m font-bold text-ink">{num(p.comido.kcal)}</span>
            <span className="font-sans text-body-s text-ink-2">comido</span>
          </div>
          <ArcoKcal quedan={quedan} pct={p.kcalObjetivo > 0 ? p.comido.kcal / p.kcalObjetivo : 0} />
          <div className="w-20 text-center">
            <span className="block font-mono text-title-m font-bold text-ink">{num(p.kcalObjetivo)}</span>
            <span className="font-sans text-body-s text-ink-2">objetivo</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-hairline px-4 py-4">
          {([
            ['Hidratos', p.comido.hc, p.objetivos.hc, 'var(--color-macro-hc)'],
            ['Grasa', p.comido.g, p.objetivos.g, 'var(--color-macro-grasa)'],
            ['Proteína', p.comido.p, p.objetivos.p, 'var(--color-macro-prot)'],
          ] as const).map(([etq, comido, objetivo, color]) => {
            const pasado = objetivo > 0 && comido > objetivo;
            return (
              <div key={etq} className="min-w-0 text-center">
                <span className="block font-sans text-body-s font-bold text-ink">{etq}</span>
                <span className={`block font-mono text-caption ${pasado ? 'text-danger' : 'text-ink-2'}`}>{num(comido)}/{num(objetivo)} g</span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-hairline">
                  <span className="block h-full rounded-full" style={{ width: `${objetivo > 0 ? Math.min(100, (comido / objetivo) * 100) : 0}%`, background: pasado ? 'var(--color-danger)' : color }} />
                </span>
              </div>
            );
          })}
        </div>
        {(p.aproximado || p.incompletos > 0) && (
          <p className="border-t border-hairline px-4 py-2.5 font-sans text-caption text-ink-3">
            {p.aproximado && 'Algunos alimentos del banco se cuentan por su equivalencia: el total es aproximado. '}
            {p.incompletos > 0 && `${p.incompletos} ${p.incompletos === 1 ? 'producto no declara' : 'productos no declaran'} sus nutrientes y no ${p.incompletos === 1 ? 'suma' : 'suman'}.`}
          </p>
        )}
      </div>

      {vista === 'diario' ? (
        <div className="space-y-3">
          {p.comidas.map(c => {
            const kcal = Math.round(c.lineas.reduce((s, l) => s + (l.kcal ?? 0), 0));
            return (
              <div key={c.id} className="overflow-hidden rounded-canvas bg-surface">
                <div className="flex items-center gap-3 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => p.onAnadir(c.id)}
                    aria-label={`Añadir a ${c.nombre}`}
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-raised text-accent-ink transition-transform active:scale-90"
                  >
                    <Icon name="add" size="m" />
                  </button>
                  <button type="button" onClick={() => p.onAnadir(c.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-sans text-title-s font-bold text-ink">{c.nombre}</span>
                    <span className="block font-mono text-caption text-ink-2">{num(kcal)} / {num(c.kcalObjetivo)} kcal</span>
                  </button>
                  <button type="button" onClick={() => setMenuComida(c.id)} aria-label={`Opciones de ${c.nombre}`} className="flex h-10 w-10 flex-none items-center justify-center text-ink-2 hover:text-ink">
                    <IconoMas />
                  </button>
                </div>
                {c.lineas.length > 0 && (
                  <div className="border-t border-hairline">
                    {c.lineas.map((l, i) => {
                      const cabeceraReceta = l.receta && c.lineas[i - 1]?.receta?.id !== l.receta.id;
                      return (
                        <React.Fragment key={l.clave}>
                          {cabeceraReceta && (
                            <div className="flex items-center gap-2 bg-raised/50 px-4 py-1.5">
                              <Icon name="skillet" size="s" className="text-ink-3" />
                              <span className="truncate font-sans text-body-s font-bold text-ink-2">{l.receta!.nombre}</span>
                            </div>
                          )}
                          <MealItemSwipeRow onDelete={() => p.onQuitarLinea(c.id, l.idxs)}>
                            <button
                              type="button"
                              onClick={() => p.onAbrirLinea(c.id, l)}
                              className={`flex w-full items-center gap-3 border-b border-hairline bg-surface py-3 pr-4 text-left last:border-b-0 hover:bg-raised/60 ${l.receta ? 'pl-8' : 'pl-4'}`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block font-sans text-body font-bold leading-snug text-ink">{l.nombre}</span>
                                <span className="block font-sans text-body-s text-ink-2">
                                  {[l.marca, l.gramos ? `${l.gramos} g` : l.tipo === 'plato' ? '1 ración' : null].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                              <span className="flex-none font-mono text-body font-bold text-ink">
                                {l.kcal === null ? <span className="font-sans text-caption font-normal text-ink-3">sin datos</span> : num(l.kcal)}
                              </span>
                            </button>
                          </MealItemSwipeRow>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={p.onAnadirComida}
            className="w-full rounded-canvas border border-dashed border-hairline py-3 font-sans text-body-s font-bold text-ink-2 hover:border-accent/40 hover:text-accent-ink"
          >
            + Añadir comida
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!p.plan || p.plan.every(m => m.filas.length === 0) ? (
            <div className="rounded-canvas bg-surface px-4 py-6 text-center">
              <p className="font-sans text-body font-bold text-ink">Sin plan de comidas para este día</p>
              <p className="mt-1 font-sans text-body-s text-ink-2">Tu entrenador te ha pautado las calorías: los alimentos los eliges tú desde el Diario.</p>
            </div>
          ) : p.plan.map((m, i) => (
            <div key={i} className="overflow-hidden rounded-canvas bg-surface">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <span className="block truncate font-sans text-title-s font-bold text-ink">{m.nombre}</span>
                  <span className="block font-mono text-caption text-ink-2">≈ {num(m.kcal)} kcal</span>
                </div>
                {m.filas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => p.onCopiarPlan(i)}
                    className="flex flex-none items-center gap-1 rounded-full bg-raised px-3 py-2 font-sans text-body-s font-bold text-accent-ink"
                  >
                    <Icon name="content_copy" size="s" />
                    Al diario
                  </button>
                )}
              </div>
              {m.filas.length > 0 && (
                <ul className="border-t border-hairline">
                  {m.filas.map((f, j) => (
                    <li key={j} className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0">
                      <span className="min-w-0 font-sans text-body font-bold leading-snug text-ink">{f.nombre}</span>
                      <span className="flex-none font-mono text-body-s text-ink-2">{f.detalle}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {menuDia && (
        <Sheet open onClose={() => setMenuDia(false)} title="Opciones del día" size="s">
          <div className="space-y-1 pb-2">
            <OpcionMenu icon="bar_chart" label="Reparto de calorías por comida" onClick={() => { setMenuDia(false); p.onReparto(); }} />
            <OpcionMenu icon="swap_vert" label="Ver el día en intercambios" onClick={() => { setMenuDia(false); p.onVerIntercambios(); }} />
          </div>
        </Sheet>
      )}

      {comidaMenu && (
        <Sheet open onClose={() => setMenuComida(null)} title={comidaMenu.nombre} size="s">
          <div className="space-y-1 pb-2">
            <OpcionMenu icon="history" label="Copiar de ayer" onClick={() => { setMenuComida(null); p.onCopiarAyer(comidaMenu.id); }} />
            {comidaMenu.lineas.length > 0 && (
              <OpcionMenu icon="bookmark_add" label="Guardar como comida" onClick={() => { setMenuComida(null); p.onGuardarComoComida(comidaMenu.id); }} />
            )}
            {comidaMenu.lineas.length > 0 && (
              <OpcionMenu icon="delete" label="Vaciar esta comida" onClick={() => { setMenuComida(null); p.onVaciar(comidaMenu.id); }} />
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}

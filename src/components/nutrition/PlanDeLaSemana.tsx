import { useMemo, useState } from 'react';
import type { GrupoDelPlan, Macros, PlatoDelPlan, Recipe } from '../../types';
import type { AlimentoCatalogo } from '../../utils/catalogoAlimentos';
import { Sheet, Button, Input, Icon, Chip, Stepper } from '../ui';
import { coincideBusqueda } from '../../utils/busqueda';
import { macrosDeReceta } from '../../utils/macrosDeReceta';
import { redondearMacros } from '../../utils/macros';
import {
  GRUPOS_DEL_PLAN, MAX_VECES, balanceDelPlan, macrosDeAlimento, macrosDelPlato,
  type BalanceDelPlan, type EstadoMacro,
} from '../../utils/planSemanal';

/* ═══════════════════════════════════════════════════════════════════════════
   Mi semana — el plan de quien cocina en tandas (utils/planSemanal.ts)

   Una lista de lo que vas a comer esta semana con cuántas veces, y arriba si
   cuadra con tu objetivo de los siete días. No hay nada que marcar como comido.
   Tres bloques (táperes, cada día, sueltas), cada uno con su +: la variante
   que eligió Dani el 30-10-2026 entre esta y una lista con el resumen abajo.
   ═══════════════════════════════════════════════════════════════════════════ */

const MACROS = [
  { k: 'p', etiqueta: 'Proteína', color: 'var(--color-macro-prot-fill)' },
  { k: 'hc', etiqueta: 'Hidratos', color: 'var(--color-macro-hc-fill)' },
  { k: 'g', etiqueta: 'Grasa', color: 'var(--color-macro-grasa-fill)' },
] as const;

/** Siempre con punto de miles («9.874»): `toLocaleString('es-ES')` no lo pone en cuatro cifras. */
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const nuevoId = () => `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function textoMacros(m: Macros): string {
  return `${num(m.kcal)} kcal · P ${num(m.p)} · HC ${num(m.hc)} · G ${num(m.g)}`;
}

/** «Faltan 320 g de hidratos · Sobran 40 g de grasa». */
function fraseBalance(b: BalanceDelPlan): string {
  if (b.cuadra) return 'Tu semana cuadra con tu objetivo.';
  const partes = MACROS.flatMap(m => {
    const e = b.estado[m.k];
    if (e === 'ok') return [];
    const g = Math.abs(b.diferencia[m.k]);
    return [`${e === 'falta' ? 'Faltan' : 'Sobran'} ${num(g)} g de ${m.etiqueta.toLowerCase()}`];
  });
  return partes.join(' · ');
}

const COLOR_ESTADO: Record<EstadoMacro, string> = { ok: 'text-ink-2', falta: 'text-ink-2', sobra: 'text-danger' };

/* ── Resumen ───────────────────────────────────────────────────────────── */

function Resumen({ b, dias }: { b: BalanceDelPlan; dias: number }) {
  return (
    <section aria-label="Tu semana" className="space-y-3 rounded-canvas bg-surface px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-sans text-title-s font-bold text-ink">Tu semana</p>
        <span className="font-mono text-caption text-ink-3">{dias} {dias === 1 ? 'día' : 'días'} con dieta</span>
      </div>
      <p className={`font-sans text-body-s ${b.cuadra ? 'font-bold text-accent-ink' : 'text-ink'}`}>
        {fraseBalance(b) || 'Añade lo que vas a comer esta semana y te digo si cuadra.'}
      </p>
      <div className="space-y-2.5">
        {MACROS.map(m => (
          <div key={m.k}>
            <div className="flex items-baseline justify-between">
              <span className="font-sans text-body-s text-ink">{m.etiqueta}</span>
              <span className={`font-mono text-caption ${COLOR_ESTADO[b.estado[m.k]]}`}>{num(b.total[m.k])} de {num(b.objetivo[m.k])} g</span>
            </div>
            <Barra puesto={b.total[m.k]} objetivo={b.objetivo[m.k]} color={m.color} sobra={b.estado[m.k] === 'sobra'} />
          </div>
        ))}
      </div>
      <p className="border-t border-hairline pt-2.5 font-mono text-caption text-ink-3">
        {num(b.total.kcal)} de {num(b.objetivo.kcal)} kcal · al día, {textoMacros(b.mediaPorDia)}
      </p>
    </section>
  );
}

function Barra({ puesto, objetivo, color, sobra }: { puesto: number; objetivo: number; color: string; sobra: boolean }) {
  return (
    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-hairline">
      <span className="block h-full rounded-full transition-[width] duration-(--duration-bar) ease-brand"
        style={{ width: `${objetivo > 0 ? Math.min(100, (puesto / objetivo) * 100) : 0}%`, background: sobra ? 'var(--color-danger)' : color }} />
    </span>
  );
}

/* ── Fila de un plato ──────────────────────────────────────────────────── */

function FilaPlato({ plato, onVeces, onQuitar }: {
  plato: PlatoDelPlan; onVeces: (v: number) => void; onQuitar: () => void;
  key?: string;
}) {
  const racion = plato.gramos ? `${num(plato.gramos)} g` : '1 ración';
  const boton = 'flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-raised text-ink-2 disabled:opacity-30';
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-sans text-body-s font-bold text-ink">{plato.nombre}</p>
        <button type="button" onClick={onQuitar} aria-label={`Quitar ${plato.nombre}`} className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center text-ink-3 hover:text-danger">
          <Icon name="close" size="s" />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <p className="min-w-0 flex-1 font-mono text-caption text-ink-3">
          {racion} · {num(plato.macros.kcal)} kcal
          <span className="block text-ink-2">Semana: {num(macrosDelPlato(plato).kcal)} kcal</span>
        </p>
        <div className="flex shrink-0 items-center gap-2" role="group" aria-label={`Veces en la semana de ${plato.nombre}`}>
          <button type="button" className={boton} disabled={plato.veces <= 1} onClick={() => onVeces(plato.veces - 1)} aria-label="Una vez menos">
            <Icon name="remove" size="s" />
          </button>
          <span className="w-9 text-center font-mono text-body-s font-bold text-ink" aria-live="polite">×{plato.veces}</span>
          <button type="button" className={boton} disabled={plato.veces >= MAX_VECES} onClick={() => onVeces(plato.veces + 1)} aria-label="Una vez más">
            <Icon name="add" size="s" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Añadir ────────────────────────────────────────────────────────────── */

type Candidato =
  | { tipo: 'alimento'; id: string; nombre: string; alimento: AlimentoCatalogo }
  | { tipo: 'receta'; id: string; nombre: string; receta: Recipe };

const MAX_RESULTADOS = 30;

function AnadirAlPlan({ grupoInicial, catalogo, recetas, onAnadir, onClose }: {
  grupoInicial: GrupoDelPlan; catalogo: AlimentoCatalogo[]; recetas: Recipe[];
  onAnadir: (p: PlatoDelPlan) => void; onClose: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [elegido, setElegido] = useState<Candidato | null>(null);
  const [grupo, setGrupo] = useState<GrupoDelPlan>(grupoInicial);
  const [veces, setVeces] = useState(GRUPOS_DEL_PLAN.find(g => g.id === grupoInicial)!.vecesPorDefecto);
  const [gramosTxt, setGramosTxt] = useState('100');

  const resultados = useMemo((): Candidato[] => {
    if (busca.trim().length < 2) return [];
    const recs: Candidato[] = recetas.filter(r => coincideBusqueda(r.name, busca)).slice(0, MAX_RESULTADOS)
      .map(r => ({ tipo: 'receta', id: r.id, nombre: r.name, receta: r }));
    const alis: Candidato[] = catalogo.filter(a => coincideBusqueda(a.nombre, busca)).slice(0, MAX_RESULTADOS)
      .map(a => ({ tipo: 'alimento', id: a.id, nombre: a.estado ? `${a.nombre} (${a.estado})` : a.nombre, alimento: a }));
    return [...alis, ...recs].slice(0, MAX_RESULTADOS);
  }, [busca, catalogo, recetas]);

  const gramos = parseFloat(gramosTxt.replace(',', '.'));
  const gramosOk = Number.isFinite(gramos) && gramos > 0 && gramos <= 3000;
  const racion: Macros | null = !elegido ? null
    : elegido.tipo === 'receta' ? redondearMacros(macrosDeReceta(elegido.receta))
      : gramosOk ? redondearMacros(macrosDeAlimento(elegido.alimento.porCien, gramos)) : null;

  const elegir = (c: Candidato) => {
    setElegido(c);
    if (c.tipo === 'alimento') setGramosTxt(String(c.alimento.unidad?.gramos ?? 100));
  };
  const cambiarGrupo = (g: GrupoDelPlan) => {
    setGrupo(g);
    setVeces(GRUPOS_DEL_PLAN.find(x => x.id === g)!.vecesPorDefecto);
  };
  const confirmar = () => {
    if (!elegido || !racion) return;
    onAnadir({
      id: nuevoId(), nombre: elegido.nombre, origen: { tipo: elegido.tipo, id: elegido.id },
      ...(elegido.tipo === 'alimento' ? { gramos } : {}), macros: racion, veces, grupo,
    });
  };

  return (
    <Sheet open onClose={onClose} title={elegido ? elegido.nombre : 'Añadir a tu semana'} alto="completo"
      footer={elegido ? (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setElegido(null)}>Atrás</Button>
          <Button variant="primary" onClick={confirmar} disabled={!racion} fullWidth>Añadir ×{veces}</Button>
        </div>
      ) : undefined}>
      {!elegido ? (
        <div className="space-y-3 pt-2">
          <Input value={busca} onChange={setBusca} placeholder="Arroz, pechuga, lentejas…" icon="search" label="Buscar alimento o receta" />
          {busca.trim().length < 2 ? (
            <p className="font-sans text-body-s text-ink-3">Escribe al menos dos letras.</p>
          ) : resultados.length === 0 ? (
            <p className="font-sans text-body-s text-ink-3">No hay nada con ese nombre.</p>
          ) : (
            <ul className="divide-y divide-hairline overflow-hidden rounded-surface bg-surface">
              {resultados.map(c => {
                const m = c.tipo === 'receta' ? macrosDeReceta(c.receta) : macrosDeAlimento(c.alimento.porCien, 100);
                return (
                  <li key={`${c.tipo}_${c.id}`}>
                    <button type="button" onClick={() => elegir(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised">
                      <Icon name={c.tipo === 'receta' ? 'restaurant' : 'nutrition'} size="s" className="text-ink-3" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-sans text-body-s text-ink">{c.nombre}</span>
                        <span className="block font-mono text-caption text-ink-3">{c.tipo === 'receta' ? '1 ración' : '100 g'}: {textoMacros(m)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <p className="font-sans text-caption uppercase tracking-wider text-ink-2">¿Dónde va?</p>
            <div className="flex flex-wrap gap-2">
              {GRUPOS_DEL_PLAN.map(g => <Chip key={g.id} selected={grupo === g.id} onClick={() => cambiarGrupo(g.id)}>{g.titulo}</Chip>)}
            </div>
            <p className="font-sans text-caption text-ink-3">{GRUPOS_DEL_PLAN.find(g => g.id === grupo)!.ayuda}</p>
          </div>
          {elegido.tipo === 'alimento' && (
            <Input label="Gramos por vez" value={gramosTxt} onChange={setGramosTxt} inputMode="decimal" placeholder="100" />
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="font-sans text-body-s text-ink">Veces en la semana</p>
            <Stepper value={veces} onChange={setVeces} min={1} max={MAX_VECES} format={v => `×${v}`} label="Veces en la semana" />
          </div>
          {racion && (
            <div className="rounded-surface bg-surface p-4">
              <p className="font-mono text-caption text-ink-3">Cada vez: {textoMacros(racion)}</p>
              <p className="pt-1 font-mono text-body-s text-ink">En la semana: {textoMacros(macrosDelPlato({ macros: racion, veces }))}</p>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ── Pantalla ──────────────────────────────────────────────────────────── */

export default function PlanDeLaSemana({ objetivo, dias, platos, onCambiar, catalogo, recetas, etiquetaSemana }: {
  objetivo: Macros;
  dias: number;
  platos: PlatoDelPlan[];
  onCambiar: (platos: PlatoDelPlan[]) => void;
  catalogo: AlimentoCatalogo[];
  recetas: Recipe[];
  /** «Semana del 27 oct». */
  etiquetaSemana?: string;
}) {
  const [anadiendo, setAnadiendo] = useState<GrupoDelPlan | null>(null);
  const b = useMemo(() => balanceDelPlan(platos, objetivo, dias), [platos, objetivo, dias]);
  const cambiar = (id: string, veces: number) => onCambiar(platos.map(p => (p.id === id ? { ...p, veces } : p)));
  const quitar = (id: string) => onCambiar(platos.filter(p => p.id !== id));

  if (dias === 0) {
    return (
      <div className="rounded-canvas bg-surface px-4 py-6 text-center font-sans text-body-s text-ink-2">
        Tu coach aún no te ha puesto dieta esta semana: sin objetivo no hay nada que cuadrar.
      </div>
    );
  }

  const hoja = anadiendo && (
    <AnadirAlPlan grupoInicial={anadiendo} catalogo={catalogo} recetas={recetas} onClose={() => setAnadiendo(null)}
      onAnadir={p => { onCambiar([...platos, p]); setAnadiendo(null); }} />
  );
  const intro = (
    <p className="px-1 font-sans text-caption text-ink-3">
      {etiquetaSemana ? `${etiquetaSemana}. ` : ''}Apunta lo que vas a comer esta semana y cuántas veces. No hace falta marcar nada cada día: damos por hecho que lo cumples.
    </p>
  );

  return (
    <div className="space-y-4">
      <Resumen b={b} dias={dias} />
      {intro}
      {GRUPOS_DEL_PLAN.map(g => {
        const delGrupo = platos.filter(p => p.grupo === g.id);
        return (
          <section key={g.id} aria-label={g.titulo} className="overflow-hidden rounded-canvas bg-surface">
            <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-sans text-body-s font-bold text-ink">{g.titulo}</p>
                <p className="font-sans text-caption text-ink-3">{g.ayuda}</p>
              </div>
              <button type="button" onClick={() => setAnadiendo(g.id)} aria-label={`Añadir a ${g.titulo}`}
                className="flex h-10 w-10 items-center justify-center rounded-control bg-accent text-on-accent">
                <Icon name="add" size="m" />
              </button>
            </div>
            {delGrupo.length === 0 ? (
              <p className="px-4 py-3 font-sans text-caption text-ink-3">Nada todavía.</p>
            ) : (
              <div className="divide-y divide-hairline">
                {delGrupo.map(p => <FilaPlato key={p.id} plato={p} onVeces={v => cambiar(p.id, v)} onQuitar={() => quitar(p.id)} />)}
              </div>
            )}
          </section>
        );
      })}
      {hoja}
    </div>
  );
}

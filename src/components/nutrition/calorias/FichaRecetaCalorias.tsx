import React, { useMemo, useState } from 'react';
import type { DietItem, DietMode, Macros, Recipe } from '../../../types';
import type { AlimentoCatalogo } from '../../../utils/catalogoAlimentos';
import { Sheet, Icon, Button } from '../../ui';
import { minutosDeReceta } from '../../../utils/tiempoDeReceta';
import { macrosDeReceta } from '../../../utils/macrosDeReceta';
import { macrosDeLineas } from '../../../utils/macrosLegado';
import { escalarMacros } from '../../../utils/macros';
import { recetaDesglosada } from '../../../utils/recetaDesglosada';
import { MARGEN_KCAL, acotarRacion, racionQueCabe, ingredientesDeFicha, conRetoques } from '../../../utils/usarReceta';

/* ═══════════════════════════════════════════════════════════════════════════
   Ficha de una receta ANTES de apuntarla en el diario (11-2026)

   Dani: «cuando le doy a la receta me la vuelca automáticamente, no me enseña
   la receta ni la preparación, ni me deja modificar las cantidades y calorías».
   Tocar una receta en «Usar receta» abre esta ficha: lo que ocupa de la comida,
   la ración de un toque, cada ingrediente con sus gramos (menos aceite, más
   arroz) y la preparación. Se apunta al confirmar, tal cual se ve.

   De las tres versiones que se le enseñaron (12-11-2026) eligió esta, la de
   ingrediente a ingrediente.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FichaRecetaProps {
  /** La receta completa; null mientras se baja. */
  receta: Recipe | null;
  /** Para el título mientras carga. */
  nombre: string;
  cargando?: boolean;
  catalogo: AlimentoCatalogo[];
  enabledModes: DietMode[];
  nuevoLineaId: () => string;
  /** «Cena», «Desayuno»… */
  nombreComida: string;
  /** Lo que le toca a esta comida de lo que queda del día. */
  hueco: Macros;
  onAnadir: (items: DietItem[], escala: number) => void;
  onClose: () => void;
  // El repo no tiene `@types/react`: TS no excluye `key` de las props (ver Badge.tsx).
  key?: React.Key;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-ES');
const kc = (n: number) => Math.round(n).toLocaleString('es-ES');
const racionTxt = (n: number) => `×${String(Math.round(n * 100) / 100).replace('.', ',')}`;

const RACIONES = [0.5, 1, 1.5, 2];

/** Paso de gramos de un ingrediente según lo que pesa (5 g de aceite no son 5 g de arroz). */
function pasoDe(gramos: number): number {
  if (gramos < 30) return 1;
  if (gramos < 100) return 5;
  if (gramos < 300) return 10;
  return 25;
}

export default function FichaRecetaCalorias({
  receta, nombre, cargando = false, catalogo, enabledModes, nuevoLineaId, nombreComida, hueco, onAnadir, onClose,
}: FichaRecetaProps) {
  const [escala, setEscala] = useState(1);
  /** Retoque de cada ingrediente sobre la ración elegida (1 = sin tocar). */
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [verPasos, setVerPasos] = useState(false);

  const base = useMemo(() => (receta ? macrosDeReceta(receta) : null), [receta]);

  // Lo que se va a apuntar, tal cual: mismas líneas que luego salen en la comida.
  const desglose = useMemo(
    () => (receta ? recetaDesglosada(receta, { catalogo, nuevoLineaId, enabledModes, factor: escala }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `nuevoLineaId` cambia en cada render y no afecta al resultado
    [receta, catalogo, enabledModes, escala],
  );
  const items = useMemo(() => (desglose ? conRetoques(desglose.items, ratios) : []), [desglose, ratios]);
  const ingsBase = useMemo(() => ingredientesDeFicha(desglose?.items ?? []), [desglose]);
  const ings = useMemo(() => ingredientesDeFicha(items), [items]);

  const m: Macros = useMemo(() => {
    const deLineas = macrosDeLineas(items);
    if (deLineas.kcal > 0) return deLineas;
    return base ? escalarMacros(base, escala) : { kcal: 0, p: 0, hc: 0, g: 0 };
  }, [items, base, escala]);

  /* Lo que la receta lleva y no se apunta (sal, especias, agua): no suma, pero
     hace falta para cocinarla. */
  const sinContar = useMemo(() => {
    const apuntados = new Set(ings.map(i => i.nombre.toLowerCase()));
    return (receta?.ingredientsText ?? []).map(i => i.name).filter(n => n && !apuntados.has(n.toLowerCase()));
  }, [receta, ings]);

  const pasos = receta?.stepsText?.length
    ? receta.stepsText.map(s => ({ texto: s.description, sub: (s.items ?? []).map(x => x.description.trim()) }))
    : (receta?.steps ?? []).map(s => ({ texto: s, sub: [] as string[] }));

  if (cargando || !receta) {
    return (
      <Sheet open onClose={onClose} title={nombre} size="m">
        <div className="flex items-center justify-center py-10">
          {cargando
            ? <Icon name="progress_activity" size="l" className="animate-spin text-accent-ink" />
            : <p className="font-sans text-body-s text-ink-2">No se pudo cargar la receta.</p>}
        </div>
      </Sheet>
    );
  }

  const hayHueco = hueco.kcal > 0;
  const queda = hueco.kcal - m.kcal;
  const cabe = queda >= -MARGEN_KCAL;
  const racionJusta = base && hayHueco ? racionQueCabe(base.kcal, hueco.kcal) : null;
  const comida = nombreComida.toLowerCase();
  const minutos = minutosDeReceta(receta);
  const meta = [minutos != null && `~${minutos} min`, receta.tupper && 'apto tupper'].filter(Boolean).join(' · ');
  const listo = items.length > 0;
  const pctCupo = hayHueco ? Math.min(100, Math.round((m.kcal / hueco.kcal) * 100)) : 0;
  const retocada = Object.values(ratios).some(r => r !== 1);

  const cambiarEscala = (n: number) => { setEscala(acotarRacion(n)); setRatios({}); };
  const retocar = (n: number, gramosNuevos: number) => {
    const deBase = ingsBase[n]?.gramos;
    if (!deBase || !(gramosNuevos > 0)) return;
    setRatios(prev => ({ ...prev, [n]: gramosNuevos / deBase }));
  };

  const chipDeRacion = (r: number, texto: string) => {
    const elegida = escala === r && !retocada;
    return (
      <button key={r} type="button" aria-pressed={elegida} onClick={() => cambiarEscala(r)}
        className={`min-h-11 rounded-surface border px-4 font-mono text-body-s font-bold transition-colors duration-(--duration-state) ${elegida ? 'border-accent-press bg-accent text-on-accent' : 'border-hairline bg-field text-ink hover:border-accent/40'}`}>
        {texto}
      </button>
    );
  };

  return (
    <Sheet
      open onClose={onClose} label={receta.name} size="m"
      footer={(
        <Button variant="primary" size="l" fullWidth onClick={() => { if (listo) onAnadir(items, escala); }} disabled={!listo}>
          Añadir a {comida} · {kc(m.kcal)} kcal
        </Button>
      )}
    >
      <div className="space-y-5 pb-4">
        <div className="pt-1">
          <h2 className="font-sans text-title-m font-bold leading-tight text-ink">{receta.name}</h2>
          {meta && <p className="mt-0.5 font-sans text-body-s text-ink-2">{meta}</p>}
        </div>

        {/* Lo que ocupa de la comida, en vivo. */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-title-m font-bold text-ink">{kc(m.kcal)} <span className="font-sans text-body-s font-normal text-ink-2">kcal</span></span>
            {hayHueco && (
              <span className={`text-right font-sans text-caption ${cabe ? 'text-ink-2' : 'text-accent-ink'}`}>
                {cabe ? `de ${kc(hueco.kcal)} para ${comida}` : `${kc(-queda)} más de lo que queda para ${comida}`}
              </span>
            )}
          </div>
          {hayHueco && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-hairline" role="img" aria-label={`${pctCupo}% de lo que queda para ${comida}`}>
              <div className={`h-full rounded-full transition-[width] duration-(--duration-bar) ease-(--ease-brand) motion-reduce:transition-none ${cabe ? 'bg-success' : 'bg-accent'}`} style={{ width: `${pctCupo}%` }} />
            </div>
          )}
          <p className="mt-2 font-mono text-caption text-ink-2">
            <span style={{ color: 'var(--color-macro-prot)' }}>P {fmt(m.p)} g</span>{' · '}
            <span style={{ color: 'var(--color-macro-hc)' }}>HC {fmt(m.hc)} g</span>{' · '}
            <span style={{ color: 'var(--color-macro-grasa)' }}>G {fmt(m.g)} g</span>
          </p>
        </div>

        {/* Ración entera, de un toque. La que cabe en la comida va señalada. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Raciones">
          {RACIONES.map(r => chipDeRacion(r, `${racionTxt(r)}${racionJusta === r && !cabe ? ' · cabe' : ''}`))}
          {racionJusta != null && !RACIONES.includes(racionJusta) && chipDeRacion(racionJusta, `${racionTxt(racionJusta)} · lo que queda`)}
        </div>

        <div className="border-t border-hairline pt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="font-sans text-body-s font-semibold text-ink">Ingredientes</span>
            {retocada && (
              <button type="button" onClick={() => setRatios({})} className="font-sans text-body-s text-accent-ink">Deshacer cambios</button>
            )}
          </div>
          <ul>
            {ings.map((ing, n) => {
              const paso = ing.gramos !== undefined ? pasoDe(ingsBase[n]?.gramos ?? ing.gramos) : 0;
              const tocado = ratios[n] !== undefined && ratios[n] !== 1;
              return (
                <li key={n} className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-body-s text-ink">{ing.nombre}</span>
                    {ing.kcal != null && <span className="block font-mono text-caption text-ink-3">{kc(ing.kcal)} kcal</span>}
                  </div>
                  {ing.gramos !== undefined && (
                    <div className="flex flex-none items-center gap-1.5" role="group" aria-label={`Gramos de ${ing.nombre}`}>
                      <button type="button" onClick={() => retocar(n, ing.gramos! - paso)} disabled={ing.gramos - paso <= 0} aria-label={`Menos ${ing.nombre}`}
                        className="flex h-10 w-10 items-center justify-center rounded-field border border-control-line bg-field text-ink-2 hover:text-ink disabled:opacity-30">
                        <Icon name="remove" size="s" />
                      </button>
                      <span className={`w-16 text-center font-mono text-body-s font-bold ${tocado ? 'text-accent-ink' : 'text-ink'}`}>{ing.gramos} g</span>
                      <button type="button" onClick={() => retocar(n, ing.gramos! + paso)} aria-label={`Más ${ing.nombre}`}
                        className="flex h-10 w-10 items-center justify-center rounded-field border border-control-line bg-field text-ink-2 hover:text-ink">
                        <Icon name="add" size="s" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {sinContar.length > 0 && (
            <p className="mt-2 font-sans text-caption text-ink-3">También lleva: {sinContar.join(', ').toLowerCase()}.</p>
          )}
        </div>

        <div className="border-t border-hairline pt-4">
          <button type="button" onClick={() => setVerPasos(v => !v)} aria-expanded={verPasos} className="flex w-full items-center justify-between">
            <span className="font-sans text-body-s font-semibold text-ink">Preparación</span>
            <span className="flex items-center gap-1 font-sans text-body-s text-accent-ink">
              {verPasos ? 'Ocultar' : 'Ver'}
              <Icon name="expand_more" size="s" className={`transition-transform duration-(--duration-base) ease-(--ease-brand) motion-reduce:transition-none ${verPasos ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {verPasos && (
            <div className="pt-3">
              {pasos.length > 0 ? (
                <ol className="space-y-3">
                  {pasos.map((p, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-bg font-mono text-caption font-bold text-accent-ink">{i + 1}</span>
                      <span className="min-w-0 font-sans text-body-s text-ink-2">
                        {p.texto}
                        {p.sub.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {p.sub.map((s, k) => <li key={k} className="flex gap-2"><span aria-hidden="true" className="text-ink-3">·</span><span>{s}</span></li>)}
                          </ul>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="font-sans text-body-s text-ink-3">Esta receta no trae los pasos.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

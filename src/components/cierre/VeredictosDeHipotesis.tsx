import React, { useEffect, useMemo, useState } from 'react';
import type { CierreDeHipotesis, Mesocycle, VeredictoDeHipotesis } from '../../types';
import {
  fichaEnLinea, lecturaDeVeredicto, type LecturaDeVeredicto, type TonoDeLectura, type VeredictosDelCierre,
} from '../../utils/hipotesisDeBloque/veredictosDelCierre';
import { cierreParaGuardar, type VeredictoCalculado } from '../../utils/hipotesisDeBloque/veredicto';
import { PALANCAS } from '../../utils/hipotesisDeBloque/palancas';
import type { ZonaIem } from '../../utils/cdg/zonas';
import { fechaCorta } from '../../utils/trainingWeek';
import { Badge, Button, Icon } from '../ui';
import type { BadgeTone } from '../ui';
import { Seccion } from './piezas';

/* ═══════════════════════════════════════════════════════════════════════════
   «Qué pasó con cada hipótesis» — Revisión › Cierre de bloque (17-11-2026).

   Una ficha por zona con estrella (maqueta A, la de fichas): el sello de la
   lectura, PROCESO (¿se hizo?), RESULTADO (¿sirvió?) y LÍMITES con sus cifras,
   y el recuadro «Bloque siguiente» con lo que propone el motor y un campo
   donde el coach escribe su decisión.

   La app lee; el coach firma. «Guardar veredictos» escribe el cierre en el
   mesociclo (`Mesocycle.cierreDeHipotesis`); una vez firmado se enseña lo
   guardado, con su fecha, y se puede corregir y volver a guardar.

   Todas las cifras vienen de `utils/hipotesisDeBloque` (veredicto.ts y
   veredictosDelCierre.ts): aquí no se calcula nada.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  meso: Mesocycle;
  /** Lo que calcula el cierre ahora mismo (`CierreCompleto.hipotesis`). */
  calculo: VeredictosDelCierre;
  /** El cierre ya firmado, si lo hay. */
  firmado?: CierreDeHipotesis;
  /** La ficha de cierre del método con los datos de ahora (lo que se guardará). */
  ficha: NonNullable<CierreDeHipotesis['ficha']>;
  /** Duración media de las sesiones del bloque, en minutos. */
  duracionMediaMin?: number | null;
  /** «Pectoral: responde a volumen (2 de 2)…», de todos sus bloques firmados. */
  mapa?: string;
  enCurso: boolean;
  guardando?: boolean;
  onGuardar?: (cierre: CierreDeHipotesis) => void;
  /** Sin controles: ni campo de decisión ni botón de guardar (modo presentación, o una pantalla que solo enseña). */
  presentando?: boolean;
  /** Una línea al pie, para decir dónde se firma cuando esta pantalla no deja. */
  nota?: string;
  /** Sin `@types/react` en el repo, TS no excluye la key por su cuenta (ver Chip). */
  key?: React.Key;
}

const TONO_SELLO: Record<TonoDeLectura, BadgeTone> = { bien: 'success', atencion: 'warning', neutro: 'neutral' };
const TONO_TEXTO: Record<TonoDeLectura, string> = { bien: 'text-success', atencion: 'text-warning', neutro: 'text-ink-2' };

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2">
      <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] pt-px">{etiqueta}</span>
      <p className="font-sans text-label text-ink leading-relaxed">{children}</p>
    </div>
  );
}

function FichaDeZona({ l, palanca, decision, onDecision, soloLectura }: {
  l: LecturaDeVeredicto; palanca: string; decision: string; onDecision: (t: string) => void; soloLectura: boolean; key?: React.Key;
}) {
  const id = `decision-${l.zona}`;
  return (
    <article className="rounded-control border border-hairline bg-bg p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="flex items-center gap-1.5 font-sans text-title-s font-bold text-ink">
          <Icon name="star" size="s" filled className="text-accent-ink" />
          {l.nombre}
          <span className="font-mono text-caption font-normal text-ink-3">· {palanca}</span>
        </p>
        <Badge tone={TONO_SELLO[l.sello.tono]}>{l.sello.texto}</Badge>
      </div>
      <Fila etiqueta="Proceso"><b className={TONO_TEXTO[l.proceso.tono]}>{l.proceso.estado}</b> {l.proceso.texto}</Fila>
      <Fila etiqueta="Resultado"><b className={TONO_TEXTO[l.resultado.tono]}>{l.resultado.estado}</b> {l.resultado.texto}</Fila>
      <Fila etiqueta="Límites"><span className={l.limites.pasado ? 'text-warning font-bold' : undefined}>{l.limites.texto}</span></Fila>
      <div className="rounded-control border-l-2 border-accent bg-accent/10 px-3 py-2 space-y-1.5">
        <p className="font-mono text-caption text-accent-ink uppercase tracking-[.08em]">Bloque siguiente</p>
        {l.siguiente && <p className="font-sans text-label text-ink leading-relaxed">{l.siguiente}</p>}
        {soloLectura ? (
          decision.trim() && <p className="font-sans text-label text-ink leading-relaxed"><b>Decisión:</b> {decision}</p>
        ) : (
          <>
            <label htmlFor={id} className="sr-only">Tu decisión para {l.nombre}</label>
            <input
              id={id}
              type="text"
              value={decision}
              onChange={e => onDecision(e.target.value)}
              maxLength={200}
              placeholder="Tu decisión, si no es esa"
              className="w-full font-sans text-label text-ink bg-bg border border-control-line rounded-control px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </>
        )}
      </div>
    </article>
  );
}

const mismasCifras = (a: VeredictoDeHipotesis, b: VeredictoDeHipotesis) =>
  a.lectura === b.lectura && a.iemMedio === b.iemMedio && a.rmPct === b.rmPct && a.palanca === b.palanca;

export default function VeredictosDeHipotesis({
  meso, calculo, firmado, ficha, duracionMediaMin, mapa, enCurso, guardando = false, onGuardar, presentando = false, nota,
}: Props) {
  const calculados = calculo.veredictos;
  // Lo que se enseña: firmado, lo guardado; sin firmar, lo que calcula el motor.
  const base: readonly (VeredictoDeHipotesis | VeredictoCalculado)[] = firmado?.veredictos ?? calculados;
  const calculadoDe = useMemo(() => new Map(calculados.map(v => [v.zona, v])), [calculados]);

  const [decisiones, setDecisiones] = useState<Record<string, string>>({});
  // Otro bloque u otro cierre firmado: se parte de sus decisiones guardadas.
  useEffect(() => {
    setDecisiones(Object.fromEntries((firmado?.veredictos ?? []).map(v => [v.zona, v.decision ?? ''])));
  }, [meso.id, firmado]);

  if (base.length === 0 && !calculo.sinMotor) return null;

  // Para volver a guardar se usan las cifras de ahora; si no se pueden recalcular, las firmadas.
  const paraGuardar: readonly VeredictoDeHipotesis[] = calculados.length > 0 ? calculados : firmado?.veredictos ?? [];
  const haCambiado = !!firmado && calculados.length > 0
    && (firmado.veredictos.length !== calculados.length || firmado.veredictos.some(v => { const c = calculadoDe.get(v.zona); return !c || !mismasCifras(v, c); }));
  const decisionesTocadas = !!firmado && firmado.veredictos.some(v => (decisiones[v.zona] ?? '').trim() !== (v.decision ?? '').trim());
  const puedeGuardar = paraGuardar.length > 0 && (!firmado || haCambiado || decisionesTocadas);

  const guardar = () => onGuardar?.(cierreParaGuardar({
    veredictos: paraGuardar, firmadoEn: new Date().toISOString(), decisiones, ficha,
  }));

  const lineaDeFicha = fichaEnLinea(firmado && !haCambiado ? firmado.ficha ?? {} : ficha);

  return (
    <Seccion
      titulo="Qué pasó con cada hipótesis"
      icon="science"
      extra={firmado
        ? <Badge tone="success" icon="check">Firmado el {fechaCorta(firmado.firmadoEn.slice(0, 10))}</Badge>
        : base.length > 0 && <Badge tone="neutral">Sin firmar</Badge>}
    >
      {calculo.sinMotor && base.length === 0 ? (
        <p className="font-sans text-caption text-ink-3">
          Este bloque tiene hipótesis en {calculo.estrellas.length} {calculo.estrellas.length === 1 ? 'zona' : 'zonas'}, pero el veredicto
          necesita el catálogo CDG (solo se carga en la vista del entrenador): sin él no se puede medir si el estímulo previsto se dio.
        </p>
      ) : (
        <>
          {enCurso && !firmado && (
            <p className="font-sans text-caption text-warning">
              El bloque aún no ha terminado: la lectura es con lo registrado hasta hoy y puede cambiar.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {base.map(v => {
              const c = calculadoDe.get(v.zona);
              // Lo guardado manda en la lectura; los límites y la propuesta, del cálculo si sigue diciendo lo mismo.
              const extras = firmado && c && mismasCifras(v, c) ? c : !firmado ? c : undefined;
              const h = meso.hipotesis?.[v.zona];
              const zona = v.zona as ZonaIem;
              const l = lecturaDeVeredicto({ ...v, ...(extras ?? {}) }, extras ? {
                techo: h?.iemTecho,
                iemFinal: calculo.estado?.porZona[zona]?.iemFinal,
                semanasFrenadas: calculo.semanasFrenadasPorZona[zona],
                duracionMediaMin,
              } : { techo: h?.iemTecho });
              return (
                <FichaDeZona
                  key={v.zona}
                  l={l}
                  palanca={PALANCAS[v.palanca].etiqueta}
                  decision={decisiones[v.zona] ?? ''}
                  onDecision={t => setDecisiones(d => ({ ...d, [v.zona]: t }))}
                  soloLectura={presentando}
                />
              );
            })}
          </div>
          {haCambiado && !presentando && (
            <p className="font-sans text-caption text-warning">
              Los datos del bloque han cambiado desde que firmaste. Se enseña lo firmado; al guardar otra vez se actualizan las cifras.
            </p>
          )}
          {lineaDeFicha && (
            <p className="font-mono text-caption text-ink-3">
              <span className="uppercase tracking-[.08em]">Ficha de cierre</span> · {lineaDeFicha}
            </p>
          )}
          {mapa && (
            <p className="font-sans text-caption text-ink-2"><b className="text-ink">Qué le funciona:</b> {mapa}</p>
          )}
          {nota && <p className="font-mono text-caption text-ink-3">{nota}</p>}
          {!presentando && (
            <div className="flex items-center justify-end gap-3 flex-wrap pt-1">
              <p className="font-mono text-caption text-ink-3">
                {firmado ? 'Puedes corregir tu decisión y volver a guardar.' : 'La app lee; tú firmas. De lo firmado sale la propuesta del bloque siguiente.'}
              </p>
              <Button size="s" variant={firmado ? 'secondary' : 'primary'} icon="save" onClick={guardar} disabled={!puedeGuardar} loading={guardando} loadingLabel="Guardando">
                Guardar veredictos
              </Button>
            </div>
          )}
        </>
      )}
    </Seccion>
  );
}

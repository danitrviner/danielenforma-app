import React, { useState } from 'react';
import {
  MUSCLE_LABELS, type ExperienceLevel, type HipotesisDeZona, type Mesocycle, type PalancaDeHipotesis,
} from '../../types';
import type { Velocidad } from '../../utils/cdg/agujetas';
import type { ZonaIem } from '../../utils/cdg/zonas';
import {
  BLOQUES_PARA_JUZGAR_A_UN_AVANZADO, CANSANCIO_LIMITE, RM_ESPERADO_AVANZADO_PCT, RM_RUIDO_PCT,
} from '../../utils/hipotesisDeBloque/cifras';
import type { EstadoDelBloque } from '../../utils/hipotesisDeBloque/estadoDelBloqueAnterior';
import type { MapaDeRespuesta } from '../../utils/hipotesisDeBloque/mapaDeRespuesta';
import { objetivoDelMesoParaElAtleta } from '../../utils/hipotesisDeBloque/objetivoParaElAtleta';
import { PALANCAS } from '../../utils/hipotesisDeBloque/palancas';
import type { PropuestaDeHipotesis } from '../../utils/hipotesisDeBloque/proponerHipotesis';
import { TIPOS_DE_BLOQUE, enLista, nombreCortoDeZona } from '../../utils/hipotesisDeBloque/tiposDeBloque';
import {
  PRIORIDAD, camposAlConfirmar, hayCambiosSinGuardar, hipotesisEnPantalla, restoPorNivel, seriesDeZona,
} from '../../utils/hipotesisDelMeso';
import { nombreDeMeso } from '../../utils/nombresMeso';
import { Badge, Button, Chip, Icon, Skeleton } from '../ui';
import {
  CHIP_DE_PALANCA, ORDEN_DE_CHIPS, conCifra, conLimite, conPalanca, fmtCifra, leerCifra, modoDeLaZona, pctDeSubida,
  textoDeModo, type CifraEditable,
} from './hipotesisDelEditor';

/* ═══════════════════════════════════════════════════════════════════════════
   Fichas «Hipótesis del bloque» (17-11-2026) — versión A de la maqueta

   Encima de las pestañas del mesociclo, una ficha por zona con estrella,
   escrita como frase: a qué se apuesta (palanca), cómo se sabrá si se HIZO
   (proceso: IEM medio del bloque), si SIRVIÓ (resultado: RM estimado) y los
   límites que no se pasan. Las cifras con borde continuo se editan; las de
   borde discontinuo son la foto del bloque anterior y no se tocan.

   Lo que se ve es lo guardado y, para una estrella recién puesta, la
   propuesta del motor (marcada «Propuesta» hasta que el coach confirma).
   Cualquier edición confirma: escribe `hipotesis` y, a juego, el techo en
   `cdgObjetivosIem` y el modo por zona, que es lo que lee el protocolo
   semanal (`camposAlConfirmar`).

   Debajo, los demás grupos con su nivel, el mapa de respuesta del atleta si
   ya tiene cierres firmados y la frase que verá él. Presentación pura: los
   datos los trae `useHipotesisDelBloque`.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  meso: Mesocycle;
  /** Lo que propone el motor para las estrellas del bloque (`propuestaDelMeso`). */
  propuesta: PropuestaDeHipotesis;
  mesoAnterior: Mesocycle | null;
  anterior: EstadoDelBloque | null;
  cargando?: boolean;
  /** Por qué no hay cifras de proceso; `null` si las hay. */
  motivoSinCifras: string | null;
  mapa: MapaDeRespuesta | null;
  /** Nombres de los ejercicios de cada zona en las rutinas del bloque. */
  ejerciciosDeZona?: (zona: ZonaIem) => string[];
  /** Minutos de los que dispone el atleta por sesión (del alta). */
  minutosDeSesion?: number;
  nivel?: ExperienceLevel;
  nombreAtleta?: string;
  onCambiar: (cambios: Partial<Mesocycle>) => void;
}

const CAJA = 'mx-1 inline-block w-14 rounded-control border px-1.5 py-0.5 text-center font-mono text-caption leading-normal tabular-nums align-baseline';

/** Una cifra de la ficha que el coach puede cambiar. Se guarda al salir del campo. */
function Cifra({ valor, etiqueta, onGuardar }: { valor: number | undefined; etiqueta: string; onGuardar: (v: number | null) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const guardar = () => {
    if (texto === null) return;
    const v = leerCifra(texto);
    setTexto(null);
    if (v !== (valor ?? null)) onGuardar(v);
  };
  return (
    <input
      type="text" inputMode="decimal" aria-label={etiqueta} placeholder="—"
      value={texto ?? fmtCifra(valor)}
      onChange={e => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`${CAJA} bg-raised border-control-line text-ink focus:outline-none focus:border-accent`}
    />
  );
}

/** Una cifra del bloque anterior: es una foto, no se edita. */
function Foto({ valor }: { valor: number | undefined }) {
  return <span className={`${CAJA} border-dashed border-strong text-ink-2`} title="Del bloque anterior: no se edita">{fmtCifra(valor) || '—'}</span>;
}

function Fila({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[84px_1fr] gap-x-3 gap-y-1">
      <span className="font-mono text-caption text-ink-3 uppercase tracking-wider sm:pt-1">{titulo}</span>
      <div className="font-sans text-body-s text-ink-2 leading-loose min-w-0">{children}</div>
    </div>
  );
}

function Ficha({ zona, h, propuesta, meso, mesoAnterior, anterior, porQue, motivoSinCifras, ejercicios, minutosDeSesion, nivel, onEditar }: {
  key?: React.Key;
  zona: ZonaIem;
  h: HipotesisDeZona;
  propuesta: boolean;
  meso: Mesocycle;
  mesoAnterior: Mesocycle | null;
  anterior: EstadoDelBloque | null;
  porQue?: string;
  motivoSinCifras: string | null;
  ejercicios: string[];
  minutosDeSesion?: number;
  nivel?: ExperienceLevel;
  onEditar: (h: HipotesisDeZona) => void;
}) {
  const [limite, setLimite] = useState<string | null>(null);
  const nombre = nombreCortoDeZona(zona);
  const cifra = (campo: CifraEditable, etiqueta: string) => (
    <Cifra valor={h[campo]} etiqueta={`${nombre}: ${etiqueta}`} onGuardar={v => onEditar(conCifra(h, campo, v))} />
  );
  const cambiarPalanca = (p: PalancaDeHipotesis) => onEditar(conPalanca(h, p, {
    estado: anterior?.porZona[zona] ?? undefined,
    velocidad: meso.cdgVelocidad as Velocidad | undefined,
    semana1Reducida: !!meso.semana1Reducida,
  }));
  const conCifras = h.iemFinalAnterior != null;
  const subida = pctDeSubida(h);
  const seriesAntes = mesoAnterior ? seriesDeZona(mesoAnterior.groups, zona) : null;
  const seriesAhora = seriesDeZona(meso.groups, zona);
  const porDebajo = h.iemArranque != null && h.iemFinalAnterior != null && h.iemArranque < h.iemFinalAnterior;

  return (
    <div className="bg-bg border border-hairline rounded-surface p-4 space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="star" size="m" filled className="text-accent-ink flex-shrink-0" />
          <h4 className="font-sans font-bold text-title-s text-ink truncate">{nombre}</h4>
          {propuesta && <Badge tone="accent">Propuesta</Badge>}
        </div>
        {/* Sin confirmar, el modo que tendrá: la estrella lo pone al confirmar. */}
        <span className="font-mono text-caption text-ink-3">
          {textoDeModo(propuesta ? TIPOS_DE_BLOQUE[meso.tipoBloque ?? 'desarrollo'].modoConEstrella : modoDeLaZona(meso, zona))}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Palanca de ${nombre}`}>
        {ORDEN_DE_CHIPS.map(p => (
          <span key={p} title={PALANCAS[p].apuesta}>
            <Chip selected={h.palanca === p} onClick={() => cambiarPalanca(p)}>{CHIP_DE_PALANCA[p]}</Chip>
          </span>
        ))}
      </div>
      {porQue && <p className="font-sans text-caption text-ink-3 leading-snug">{porQue}</p>}

      <Fila titulo="Proceso">
        {conCifras && h.palanca === 'recuperar' ? (
          <>
            Venía de un IEM medio de<Foto valor={h.iemMedioAnterior} />. Este bloque baja a{cifra('iemArranque', 'IEM de arranque')}
            (la mitad de donde acabó:<Foto valor={h.iemFinalAnterior} />) y no pasa de{cifra('iemTecho', 'techo de IEM')}.{' '}
            {seriesAntes != null && (seriesAntes > 0 || seriesAhora > 0) && <>Series: {seriesAntes} → {seriesAhora} por semana.</>}
          </>
        ) : conCifras ? (
          <>
            IEM medio del bloque: <Foto valor={h.iemMedioAnterior} /> el anterior →{cifra('iemMedioObjetivo', 'IEM medio objetivo')}o más.{' '}
            Arranca en{cifra('iemArranque', 'IEM de arranque')}
            ({porDebajo ? 'algo por debajo de donde acabó:' : 'donde acabó:'}<Foto valor={h.iemFinalAnterior} />){' '}
            {subida != null && subida > 0 ? 'y sube por escalones hasta un techo de' : 'con un techo de'}{cifra('iemTecho', 'techo de IEM')}
            {subida != null && subida !== 0 && (
              <span className={`font-mono text-caption font-bold ${subida > 0 ? 'text-success' : 'text-ink-3'}`}>{subida > 0 ? '+' : '−'}{Math.abs(subida)} %</span>
            )}
            .{' '}
            {seriesAntes != null && (seriesAntes > 0 || seriesAhora > 0) && <>Series: {seriesAntes} → {seriesAhora} por semana.</>}
          </>
        ) : (
          <span className="text-ink-3">
            Sin cifras de proceso. {motivoSinCifras ?? 'Aún no se ha calculado cómo acabó el bloque anterior.'}{' '}
            {seriesAhora > 0 && <>Series: {seriesAhora} por semana.</>}
          </span>
        )}
      </Fila>

      <Fila titulo="Resultado">
        {h.palanca === 'recuperar' && !(h.rmObjetivoPct && h.rmObjetivoPct > 0) ? 'RM estimado medio: no perderlo (' : 'RM estimado medio +'}
        {cifra('rmObjetivoPct', 'objetivo de RM en %')}%{h.palanca === 'recuperar' && !(h.rmObjetivoPct && h.rmObjetivoPct > 0) ? ')' : ''}{' '}
        {ejercicios.length > 0 ? `en ${enLista(ejercicios.map(e => e.toLowerCase()))}` : 'en los ejercicios de la zona (aún sin rutinas)'},
        mediana de las 2 primeras semanas contra las 2 últimas. Por debajo del {RM_RUIDO_PCT} % es ruido. El perímetro se apunta como tendencia: no decide.
        {nivel === 'avanzado' && (
          <> En un avanzado lo normal es +{RM_ESPERADO_AVANZADO_PCT.min}-{RM_ESPERADO_AVANZADO_PCT.max} % por bloque: se juzga sumando {BLOQUES_PARA_JUZGAR_A_UN_AVANZADO} bloques seguidos.</>
        )}
      </Fila>

      <Fila titulo="Límites">
        Cansancio al salir por debajo de {CANSANCIO_LIMITE} ·{' '}
        <input
          type="text" aria-label={`${nombre}: límite propio`} placeholder="límite propio (p. ej. hombro sin molestias)" maxLength={80}
          value={limite ?? h.limite ?? ''}
          onChange={e => setLimite(e.target.value)}
          onBlur={() => { if (limite !== null && limite.trim() !== (h.limite ?? '')) onEditar(conLimite(h, limite)); setLimite(null); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="inline-block w-full sm:w-64 max-w-full bg-raised border border-control-line rounded-control px-2 py-0.5 font-sans text-caption text-ink focus:outline-none focus:border-accent placeholder:text-ink-3 align-baseline"
        />{' '}
        · sesión dentro de {minutosDeSesion ? `${minutosDeSesion} min` : 'el tiempo del atleta'}.
      </Fila>
    </div>
  );
}

export default function FichasDeHipotesis({
  meso, propuesta, mesoAnterior, anterior, cargando, motivoSinCifras, mapa, ejerciciosDeZona, minutosDeSesion, nivel, nombreAtleta, onCambiar,
}: Props) {
  const tipo = meso.tipoBloque ?? 'desarrollo';
  const enPantalla = hipotesisEnPantalla(meso, propuesta);
  const zonas = Object.keys(enPantalla) as ZonaIem[];
  const sinConfirmar = hayCambiosSinGuardar(meso, enPantalla);
  const guardar = (nuevas: Partial<Record<ZonaIem, HipotesisDeZona>>) => onCambiar(camposAlConfirmar(meso, nuevas));
  const resto = restoPorNivel(meso.groups, mesoAnterior?.groups);
  const fraseDelAtleta = objetivoDelMesoParaElAtleta({ weeks: meso.weeks, tipoBloque: meso.tipoBloque, hipotesis: enPantalla }, nivel);
  const avisos = [...new Set(propuesta.avisos)];

  return (
    <section className="bg-surface border border-hairline rounded-surface p-5 space-y-4" aria-label="Hipótesis del bloque">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon name="science" size="m" className="text-accent-ink" />
          <h3 className="font-sans font-bold text-title-s text-ink">Hipótesis del bloque</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-caption text-ink-3">
            {mesoAnterior ? `propuestas desde ${nombreDeMeso(mesoAnterior)} · tú confirmas` : 'sin bloque anterior · tú confirmas'}
          </span>
          {mesoAnterior && zonas.length > 0 && (
            <Button size="s" variant="secondary" icon="history" disabled={cargando} onClick={() => guardar(propuesta.hipotesis)}>
              Proponer desde el bloque anterior
            </Button>
          )}
          {sinConfirmar && (
            <Button size="s" icon="check" disabled={cargando} onClick={() => guardar(enPantalla)}>
              {zonas.length > 0 ? 'Confirmar hipótesis' : 'Quitar hipótesis'}
            </Button>
          )}
        </div>
      </div>

      {avisos.map(a => (
        <div key={a} className="flex items-start gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-surface">
          <Icon name="warning" size="s" className="text-warning flex-shrink-0 mt-px" />
          <p className="font-sans text-caption text-warning leading-relaxed">{a}</p>
        </div>
      ))}

      {cargando && zonas.length > 0 ? (
        <Skeleton className="h-40 w-full rounded-surface" />
      ) : zonas.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {zonas.map(z => (
            <Ficha
              key={z} zona={z} h={enPantalla[z]!} propuesta={!meso.hipotesis?.[z]}
              meso={meso} mesoAnterior={mesoAnterior} anterior={anterior}
              porQue={propuesta.porQue[z]} motivoSinCifras={motivoSinCifras}
              ejercicios={ejerciciosDeZona?.(z) ?? []} minutosDeSesion={minutosDeSesion} nivel={nivel}
              onEditar={h => guardar({ ...enPantalla, [z]: h })}
            />
          ))}
        </div>
      ) : (
        <p className="font-sans text-body-s text-ink-3 leading-relaxed">
          {TIPOS_DE_BLOQUE[tipo].maxEstrellas === 0
            ? `«${TIPOS_DE_BLOQUE[tipo].etiqueta}» no prioriza ninguna zona: no lleva hipótesis por zona.`
            : `Ninguna zona lleva estrella todavía. Marca con ⭐ Especializar en la pestaña Volumen ${TIPOS_DE_BLOQUE[tipo].maxEstrellas === 1 ? 'la zona' : `las zonas (hasta ${TIPOS_DE_BLOQUE[tipo].maxEstrellas})`} que este bloque prioriza y aquí saldrá su ficha.`}
        </p>
      )}

      {/* Los demás grupos, a la vista: no llevan hipótesis pero el coach tiene
          que ver de un vistazo qué se hace con cada uno. */}
      {resto.length > 0 && (
        <div className="space-y-1.5">
          <span className="block font-mono text-caption text-ink-3 uppercase tracking-wider">El resto, sin hipótesis</span>
          <table className="w-full border-collapse">
            <tbody>
              {resto.map(nivelDelResto => {
                const p = PRIORIDAD[nivelDelResto.prioridad];
                return (
                  <tr key={nivelDelResto.prioridad} className="border-t border-hairline align-top">
                    <th scope="row" className="py-1.5 pr-3 text-left font-sans text-caption font-medium text-ink-2 whitespace-nowrap w-px">
                      {p.icono} {p.etiqueta}
                      <span className="block font-mono text-ink-3 font-normal">{p.queHace}</span>
                    </th>
                    <td className="py-1.5 font-sans text-caption text-ink-2 leading-relaxed">
                      {nivelDelResto.grupos.map((g, i) => (
                        <span key={g.grupo}>
                          {i > 0 && ' · '}
                          {MUSCLE_LABELS[g.grupo]}
                          {nivelDelResto.prioridad !== 'ignorar' && (
                            <span className="font-mono text-ink-3"> {g.antes != null && g.antes !== g.series ? `${g.antes} → ${g.series}` : g.series}</span>
                          )}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mapa && (
        <div className="flex items-start gap-2">
          <Icon name="history" size="s" className="text-ink-3 flex-shrink-0 mt-0.5" />
          <p className="font-sans text-caption text-ink-2 leading-relaxed">
            <span className="font-mono text-ink-3 uppercase tracking-wider">Lo que ya sabemos de {nombreAtleta ?? 'el atleta'} · </span>
            {mapa.frase}
          </p>
        </div>
      )}

      <div className="rounded-surface border border-dashed border-hairline px-3 py-2.5">
        <span className="block font-mono text-caption text-ink-3 uppercase tracking-wider">Lo que ve {nombreAtleta ?? 'el atleta'} en su bloque</span>
        <p className="font-sans text-body-s text-ink-2 leading-relaxed">«{fraseDelAtleta}»</p>
      </div>
    </section>
  );
}

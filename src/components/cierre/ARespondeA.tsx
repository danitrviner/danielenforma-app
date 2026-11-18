import React from 'react';
import type { IndicioDeRespuesta, PuntoDePartida } from '../../utils/hipotesisDeBloque/respuestaADosis';
import { PIE_DE_INDICIOS, SIN_INDICIOS } from '../../utils/hipotesisDeBloque/respuestaADosis';
import { fechaCorta } from '../../utils/trainingWeek';
import { Badge, Button, Icon } from '../ui';
import { Seccion } from './piezas';

/* ═══════════════════════════════════════════════════════════════════════════
   «A qué responde» — Revisión › Cierre de bloque, debajo de los veredictos
   (18-11-2026).

   Los indicios de si al atleta le va mejor con más volumen, más frecuencia o
   más cerca del fallo (`utils/hipotesisDeBloque/respuestaADosis.ts`): cada
   uno con su grado («Indicio» o «Se repite»), la frase y, entre paréntesis,
   los casos con sus cifras. Un pie fijo recuerda que con pocos bloques son
   pistas. En un primer bloque la sección es el «Punto de partida»: 3-4 frases
   y, debajo, lo que haya entre zonas.

   La foto de cada bloque se guarda al firmar los veredictos. Un bloque sin
   estrellas (el primero, uno de mantenimiento) no tiene veredictos que
   firmar: aquí sale un botón para guardar solo su foto.

   Aquí no se calcula nada.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  indicios: readonly IndicioDeRespuesta[];
  /** Solo en un primer bloque. */
  punto?: PuntoDePartida | null;
  presentando?: boolean;
  /** Sin veredictos que firmar: guardar solo la foto del bloque. */
  onGuardarFoto?: () => void;
  guardando?: boolean;
  /** Fecha (ISO) en que se guardó la foto, si ya está guardada. */
  fotoGuardadaEn?: string | null;
  /** Sin `@types/react` en el repo, TS no excluye la key por su cuenta (ver Chip). */
  key?: React.Key;
}

function Indicio({ i }: { i: IndicioDeRespuesta; key?: React.Key }) {
  const repite = i.grado === 'se_repite';
  return (
    <li className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
      <Badge tone={repite ? 'success' : 'neutral'} className="shrink-0 self-start sm:mt-px">{repite ? 'Se repite' : 'Indicio'}</Badge>
      <p className="font-sans text-label text-ink leading-relaxed">
        {i.frase} <span className="font-sans text-caption text-ink-3">({i.casosTexto})</span>
      </p>
    </li>
  );
}

export default function ARespondeA({ indicios, punto, presentando = false, onGuardarFoto, guardando = false, fotoGuardadaEn }: Props) {
  const esPrimer = !!punto;
  const vacio = indicios.length === 0 && !esPrimer;
  return (
    <Seccion
      titulo={esPrimer ? 'Punto de partida' : 'A qué responde'}
      icon={esPrimer ? 'flag' : 'insights'}
      extra={fotoGuardadaEn ? <Badge tone="success" icon="check">Foto guardada el {fechaCorta(fotoGuardadaEn.slice(0, 10))}</Badge> : undefined}
    >
      {punto && (
        <ul className="space-y-2">
          {punto.frases.map(f => (
            <li key={f} className="flex items-start gap-2">
              <Icon name="arrow_forward" size="s" className="text-ink-3 mt-0.5 shrink-0" />
              <span className="font-sans text-label text-ink leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
      )}
      {vacio ? (
        <p className="font-sans text-caption text-ink-3">{SIN_INDICIOS}</p>
      ) : (
        <>
          {indicios.length > 0 && <ul className="space-y-2">{indicios.map(i => <Indicio key={i.id} i={i} />)}</ul>}
          <p className="font-mono text-caption text-ink-3">{PIE_DE_INDICIOS}</p>
        </>
      )}
      {!presentando && onGuardarFoto && !fotoGuardadaEn && (
        <div className="flex items-center justify-end gap-3 flex-wrap pt-1">
          <p className="font-mono text-caption text-ink-3">Este bloque no tiene veredictos que firmar: guarda su foto para compararla con los siguientes.</p>
          <Button size="s" variant="secondary" icon="save" onClick={onGuardarFoto} loading={guardando} loadingLabel="Guardando">
            Guardar la foto del bloque
          </Button>
        </div>
      )}
    </Seccion>
  );
}

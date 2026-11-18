import React, { useState } from 'react';
import { MUSCLE_LABELS, type Mesocycle, type TipoDeBloque } from '../../types';
import { ORDEN_DE_TIPOS, TIPOS_DE_BLOQUE, estrellasDe, objetivoDerivado } from '../../utils/hipotesisDeBloque/tiposDeBloque';
import { recomendacionDeMantener } from '../../utils/hipotesisDelMeso';
import { Button, Chip, Input } from '../ui';
import { elegirTipoDeBloque, resumenDelTipo } from './hipotesisDelEditor';

/* ═══════════════════════════════════════════════════════════════════════════
   Tipo de bloque, en la cabecera del mesociclo (17-11-2026)

   Sustituye al campo de texto «Objetivo» y al desplegable «Tipo (calendario)»:
   cuatro chips y, debajo, para qué sirve el elegido y lo que ha rellenado. Un
   tipo es un preset EDITABLE: elegirlo pone semanas, velocidad y modo por
   zona sin pisar lo que el coach ya tocó (`aplicarTipoDeBloque`), y escribe
   `objective` y `phaseType` derivados, que el calendario y las plantillas
   siguen leyendo.

   Un bloque anterior a los tipos se ve con su objetivo de siempre, editable
   como antes, y los chips sin marcar para cuando el coach quiera elegir.

   18-11-2026 (decisiones de Dani):
    · Elegir Especialización o Mantenimiento NO cambia los grupos sin estrella
      («prefiero que me lo recomiende, no que lo haga ella»). Debajo del tipo
      sale la recomendación de bajarlos a mantener, con lo que quedaría cada
      uno, y un botón que lo hace; entra en el Deshacer del editor. Si ya
      están en mantener o ignorados, no sale.
    · Los avisos de estrellas son informativos: el tipo se aplica igual.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  meso: Mesocycle;
  onCambiar: (cambios: Partial<Mesocycle>) => void;
  /** Aceptar «Bajarlos a mantener»: lo escribe quien monta el editor, que es
   *  quien lo apunta en su Deshacer. Sin él no sale la recomendación. */
  onBajarAMantener?: () => void;
  /** Deshace eso mismo. Solo llega mientras sea lo último que se hizo en el bloque. */
  onDeshacerMantener?: () => void;
}

export default function TipoDeBloqueSelector({ meso, onCambiar, onBajarAMantener, onDeshacerMantener }: Props) {
  // Lo que se respetó o hay que decidir tras el último cambio de tipo. Es de
  // esta pulsación, no del bloque: no se guarda.
  const [nota, setNota] = useState<{ para: string; respetados: string[]; avisos: string[] } | null>(null);
  const tipo = meso.tipoBloque;
  const notaVigente = nota && nota.para === `${meso.id}:${tipo}` ? nota : null;

  const elegir = (t: TipoDeBloque) => {
    if (t === tipo) return;
    const r = elegirTipoDeBloque(meso, t);
    setNota({ para: `${meso.id}:${t}`, respetados: r.respetados, avisos: r.avisos });
    onCambiar(r.cambios);
  };

  const derivado = tipo ? objetivoDerivado(tipo, estrellasDe(meso)) : null;
  const mantener = onBajarAMantener ? recomendacionDeMantener(meso) : null;

  return (
    <div className="space-y-2">
      <span className="block font-mono text-caption text-ink-2 uppercase">Tipo de bloque</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de bloque">
        {ORDEN_DE_TIPOS.map(t => (
          <Chip key={t} selected={tipo === t} onClick={() => elegir(t)}>{TIPOS_DE_BLOQUE[t].etiqueta}</Chip>
        ))}
      </div>

      {tipo ? (
        <div className="space-y-1">
          <p className="font-sans text-caption text-ink-2 leading-relaxed">
            {TIPOS_DE_BLOQUE[tipo].paraQue}{' '}
            <span className="text-ink-3">Ha rellenado lo de abajo y todo se puede tocar: {resumenDelTipo(tipo, meso)}.</span>
          </p>
          {notaVigente && notaVigente.respetados.length > 0 && (
            <p className="font-sans text-caption text-ink-3">
              Se deja como lo tenías: {notaVigente.respetados.join(', ')}.
            </p>
          )}
          {notaVigente?.avisos.map(a => (
            <p key={a} className="font-sans text-caption text-warning leading-snug">{a}</p>
          ))}
          {/* El resto, a mantener: se recomienda, no se hace solo. */}
          {mantener ? (
            <div className="flex items-start justify-between gap-3 flex-wrap rounded-control border border-hairline bg-bg px-3 py-2">
              <p className="font-sans text-caption text-ink-2 leading-relaxed min-w-0 flex-1">
                {mantener.texto}{' '}
                <span className="font-mono text-ink-3">
                  {mantener.grupos.map(g => `${MUSCLE_LABELS[g.grupo]} ${g.series} → ${g.mitad}`).join(' · ')}
                </span>
              </p>
              <Button size="s" variant="secondary" onClick={onBajarAMantener}>{mantener.accion}</Button>
            </div>
          ) : onDeshacerMantener && (
            <p className="font-sans text-caption text-ink-3">
              Hecho: lo que no lleva estrella está en mantener, con la mitad de sus series.{' '}
              <button type="button" className="underline" onClick={onDeshacerMantener}>Deshacer</button>
            </p>
          )}
          {/* El objetivo ya no se escribe: sale del tipo y de las estrellas. Si
              el bloque traía uno propio de antes, se conserva y se dice. */}
          <p className="font-mono text-caption text-ink-3">
            En el calendario: {meso.objective?.trim() || derivado}
            {meso.objective?.trim() && meso.objective !== derivado && (
              <>
                {' '}·{' '}
                <button type="button" className="underline" onClick={() => onCambiar({ objective: derivado ?? '' })}>
                  usar «{derivado}»
                </button>
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-sans text-caption text-ink-3 leading-relaxed">
            Este bloque es anterior a los tipos: conserva su objetivo de siempre. Elige un tipo cuando quieras fijar sus hipótesis; no cambia lo que ya tengas puesto.
          </p>
          <Input
            label="Objetivo"
            value={meso.objective}
            onChange={v => onCambiar({ objective: v })}
            placeholder="Ej. Hipertrofia tren superior, puesta en forma general…"
          />
        </div>
      )}
    </div>
  );
}

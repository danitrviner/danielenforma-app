import React, { useState } from 'react';
import type { Mesocycle, TipoDeBloque } from '../../types';
import { ORDEN_DE_TIPOS, TIPOS_DE_BLOQUE, estrellasDe, objetivoDerivado } from '../../utils/hipotesisDeBloque/tiposDeBloque';
import { Chip, Input } from '../ui';
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
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  meso: Mesocycle;
  onCambiar: (cambios: Partial<Mesocycle>) => void;
}

export default function TipoDeBloqueSelector({ meso, onCambiar }: Props) {
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

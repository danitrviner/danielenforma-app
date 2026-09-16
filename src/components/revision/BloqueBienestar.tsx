import React from 'react';
import { MUSCLE_LABELS } from '../../types';
import { BienestarDeLaVentana } from '../../utils/revisionCoach';
import { DOMS_CRONICO_UMBRAL } from '../../utils/domsCronico';
import { Sparkline, Icon, Collapsible } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque — Cómo ha llegado: sueño, estrés y agujetas que no se van.

   Es la explicación de los otros bloques. Cuando el volumen está puesto, la
   dieta cuadra y aun así no sube nada, la respuesta suele estar aquí: duerme
   seis horas, arrastra un estrés de 8 y lleva cinco semanas con el pecho a 8
   de 10. Sin esto, el coach se queda tocando series a ciegas.

   Todo sale de los cuestionarios que el atleta ya contesta — no hay nada nuevo
   que pedirle. El titular es el IRP (sueño × (10 − estrés − DOMS crónico) / 10)
   y nunca se enseña solo: al lado va de dónde viene y cuánto ha cambiado desde
   antes de esta ventana, porque un «4,1» suelto no significa nada.

   Si falta un componente el IRP no se calcula — se dice qué falta. Un índice
   con un trozo inventado engaña más que no enseñar ninguno.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  bienestar: BienestarDeLaVentana;
  todoAbierto?: boolean;
}

/** Los últimos 8 puntos, que es lo que pinta la primitiva Sparkline. */
function ultimos8(puntos: { value: number }[]): number[] {
  return puntos.slice(-8).map(p => p.value);
}

function unDecimal(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

export default function BloqueBienestar({ bienestar, todoAbierto = false }: Props) {
  const { irp, irpAlInicio, historial, sueño, estres, domsCronico } = bienestar;

  if (irp.valor == null && sueño.length === 0 && estres.length === 0) {
    return (
      <p className="font-sans text-label text-ink-3">
        Todavía no ha contestado ningún cuestionario con preguntas de sueño, estrés o agujetas.
        En cuanto lo haga —o en cuanto le asignes uno que las lleve— este bloque se llena solo.
      </p>
    );
  }

  const cambio = irp.valor != null && irpAlInicio != null ? irp.valor - irpAlInicio : null;

  return (
    <div className="space-y-4">
      {/* ── El titular ──────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block">
            Disposición para entrenar
          </span>
          {irp.valor != null ? (
            <span className="flex items-baseline gap-2">
              <span className="font-sans font-bold text-title-l text-ink tabular-nums">
                {unDecimal(irp.valor)}
              </span>
              {cambio != null && Math.abs(cambio) >= 0.1 && (
                <span className={`font-mono text-label tabular-nums ${cambio > 0 ? 'text-success' : 'text-danger'}`}>
                  {cambio > 0 ? '+' : '−'}{unDecimal(Math.abs(cambio))} desde antes de esta ventana
                </span>
              )}
            </span>
          ) : (
            <span className="font-sans text-label text-ink-2">
              No se puede calcular: falta {[
                irp.horasSueño == null && 'el sueño',
                irp.estres == null && 'el estrés',
                irp.domsCronico == null && 'las agujetas',
              ].filter(Boolean).join(' y ')}.
            </span>
          )}
          {/* Un número desnudo no se puede leer en voz alta, y menos si sale
              negativo: «−0,6» parece un fallo de la app cuando en realidad es
              la alarma más clara que da el índice —estrés y agujetas suman más
              de 10, o sea que ahora mismo no hay margen para meterle carga—.
              Aquí se dice con palabras y se enseña la cuenta. */}
          {irp.valor != null && (
            <span className="block font-mono text-caption text-ink-3 mt-1">
              {irp.horasSueño != null && irp.estres != null && irp.domsCronico != null && (
                <>
                  {unDecimal(irp.horasSueño)} h de sueño × (10 − {unDecimal(irp.estres)} de estrés
                  {' '}− {unDecimal(irp.domsCronico)} de agujetas) ÷ 10
                </>
              )}
            </span>
          )}
        </div>
        {historial.length > 1 && (
          <Sparkline values={ultimos8(historial)} label="Evolución de la disposición para entrenar" />
        )}
      </div>

      {irp.valor != null && irp.valor <= 0 && (
        <p className="font-sans text-label text-danger leading-relaxed">
          El estrés y las agujetas crónicas suman 10 o más entre los dos: por mucho que duerma, el
          índice se va a cero o por debajo. No es un fallo de cuenta, es la señal de que ahora mismo
          no hay margen para subirle carga — primero baja volumen o arregla el descanso.
        </p>
      )}

      {/* ── De qué se compone ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <Componente
          label="Sueño"
          valor={irp.horasSueño != null ? `${unDecimal(irp.horasSueño)} h` : '—'}
          serie={ultimos8(sueño)}
          etiquetaSerie="Evolución del sueño"
        />
        <Componente
          label="Estrés"
          valor={irp.estres != null ? `${unDecimal(irp.estres)}/10` : '—'}
          serie={ultimos8(estres)}
          etiquetaSerie="Evolución del estrés"
        />
        <Componente
          label="Agujetas"
          valor={irp.domsCronico != null ? `${unDecimal(irp.domsCronico)}/10` : '—'}
          serie={[]}
          etiquetaSerie=""
        />
      </div>

      {/* ── Lo que no se le va ──────────────────────────────────────────── */}
      {domsCronico.length > 0 && (
        <div className="border border-warning/30 bg-warning/10 rounded-surface p-4 space-y-2">
          <span className="font-mono text-caption text-warning uppercase tracking-[.08em] flex items-center gap-1.5">
            <Icon name="warning" size="s" />
            Agujetas que no se van
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {domsCronico.map(d => (
              <span key={d.grupo} className="font-sans text-label text-ink">
                {MUSCLE_LABELS[d.grupo]}
                <span className="font-mono text-caption text-ink-2 ml-1.5 tabular-nums">
                  {unDecimal(d.media)}/10
                </span>
              </span>
            ))}
          </div>
          <p className="font-mono text-caption text-ink-3 leading-relaxed">
            Media de {DOMS_CRONICO_UMBRAL}/10 o más sostenida en sus últimas tres respuestas. No es
            la agujeta de después de un entreno duro: es dolor que llega a la siguiente sesión, y suele
            querer decir que ese grupo está por encima de lo que recupera.
          </p>
        </div>
      )}

      <Collapsible
        key={`bienestar-detalle-${todoAbierto}`}
        defaultOpen={todoAbierto}
        trigger={<span className="font-sans font-bold text-label text-ink">Cómo se calcula</span>}
      >
        <p className="font-mono text-caption text-ink-3 leading-relaxed">
          Sueño × (10 − estrés − agujetas crónicas) ÷ 10, con sueño y estrés suavizados (EWMA) para
          que una mala semana suelta no lo tumbe. No tiene unidades ni escala absoluta: sirve para
          compararlo consigo mismo, no contra otro atleta ni contra un valor «normal».
        </p>
      </Collapsible>
    </div>
  );
}

function Componente({ label, valor, serie, etiquetaSerie }: {
  label: string; valor: string; serie: number[]; etiquetaSerie: string;
}) {
  return (
    <div className="bg-raised border border-hairline rounded-surface p-3">
      <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.08em]">{label}</span>
      <span className="block font-sans font-bold text-title-s text-ink mt-0.5 tabular-nums">{valor}</span>
      {serie.length > 1 && <Sparkline values={serie} label={etiquetaSerie} className="mt-2" />}
    </div>
  );
}

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { OnboardingData } from '../types';
import { updateOnboarding } from '../dbService';
import { registrarConsentimiento } from '../ai/consentimientoIA';
import { useToast } from '../hooks/useToast';
import { Dialog, Button, Icon } from './ui';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';

/* ═══════════════════════════════════════════════════════════════════════════
   Solicitud de consentimiento para el análisis con IA · `A-2`

   Por qué existe este componente y no solo una casilla en el alta: los atletas
   que ya están dentro terminaron su alta hace meses y no van a volver a verla
   nunca. Sin esto, el día que se despliegue el consentimiento el asistente del
   coach se apagaría para TODOS los clientes actuales y no habría forma de
   encenderlo, porque nadie tendría manera de decir que sí.

   Tres decisiones de fondo, que son las que hacen que esto sea un
   consentimiento y no un formalismo:

   · **No hay opción por defecto.** Dos botones del mismo peso visual. Ni
     casilla premarcada ni un «Aceptar» grande al lado de un «ahora no» gris:
     eso es justo lo que el RGPD llama consentimiento no libre.
   · **Se puede decir que no, y el no se guarda.** Y no se vuelve a preguntar.
     Un «no» que reaparece cada semana no es una elección, es desgaste.
   · **Se dice qué datos y a dónde**, con nombre y apellidos del tercero, sin
     eufemismos tipo «para mejorar tu experiencia».

   No se puede cerrar con la X ni con Escape a propósito: no es un aviso, es una
   pregunta, y «lo cierro sin mirar» dejaría al atleta creyendo que ha
   contestado algo. Se le deja salir con «Ahora no», que no guarda nada y
   vuelve a aparecer, que es distinto de rechazar.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  onboarding: OnboardingData;
  /** Se llama tras guardar, con la respuesta. */
  onRespondido?: (aceptado: boolean) => void;
  /** Cerrar sin contestar («Ahora no»). Si no se pasa, no se ofrece salida. */
  onAhoraNo?: () => void;
}

export default function SolicitudConsentimientoIA({ onboarding, onRespondido, onAhoraNo }: Props) {
  const [guardando, setGuardando] = useState<'si' | 'no' | null>(null);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const responder = async (aceptado: boolean) => {
    setGuardando(aceptado ? 'si' : 'no');
    try {
      const consentimientoIA = registrarConsentimiento(aceptado, new Date().toISOString());
      await updateOnboarding({ ...onboarding, consentimientoIA });
      queryClient.setQueryData<OnboardingData | null>(
        ['onboarding', onboarding.athleteId],
        prev => (prev ? { ...prev, consentimientoIA } : prev),
      );
      showToast(aceptado ? 'Gracias, guardado.' : 'Guardado. Tus datos no se analizarán con IA.');
      onRespondido?.(aceptado);
    } catch (err) {
      console.error('No se pudo guardar el consentimiento de IA:', err);
      showToast(mensajeDeErrorFirestore(err));
      setGuardando(null);
    }
  };

  return (
    <Dialog
      open
      onClose={onAhoraNo ?? (() => {})}
      title="¿Podemos analizar tus datos con IA?"
      size="m"
      footer={
        <div className="flex flex-col gap-2 w-full">
          {/* Mismo tamaño y misma jerarquía: la decisión es del atleta. */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="l"
              className="flex-1"
              loading={guardando === 'no'}
              disabled={guardando !== null}
              onClick={() => responder(false)}
            >
              No, gracias
            </Button>
            <Button
              variant="primary"
              size="l"
              className="flex-1"
              loading={guardando === 'si'}
              disabled={guardando !== null}
              onClick={() => responder(true)}
            >
              Sí, acepto
            </Button>
          </div>
          {onAhoraNo && (
            <Button variant="ghost" size="s" fullWidth disabled={guardando !== null} onClick={onAhoraNo}>
              Ahora no
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 text-body-s font-sans text-ink-2">
        <p>
          Tu entrenador puede usar un asistente de inteligencia artificial para <strong className="text-ink">revisar
          tu evolución</strong> (entrenos, dieta y revisiones) cuando prepara tus ajustes. Los planes
          los decide y los firma él.
        </p>

        <div className="rounded-surface border border-hairline bg-raised p-4 space-y-3">
          <p className="font-bold text-ink flex items-center gap-2">
            <Icon name="database" size="s" className="text-accent" />
            Qué se enviaría
          </p>
          <ul className="space-y-1 list-disc pl-5">
            <li>Tu ficha: edad, sexo, peso, altura y objetivo.</li>
            <li>Tus <strong className="text-ink">lesiones, alergias y medicación</strong>, si las has indicado.</li>
            <li>Tus entrenamientos, tu dieta y tus revisiones, con lo que escribes en ellas.</li>
            <li>Tus series de sueño, estrés y dolor.</li>
          </ul>
          <p className="font-bold text-ink flex items-center gap-2 pt-1">
            <Icon name="send" size="s" className="text-accent" />
            A dónde
          </p>
          <p>
            A <strong className="text-ink">Anthropic PBC</strong>, la empresa que provee el modelo.
            No usan estos datos para entrenar sus modelos. <strong className="text-ink">No se envía
            tu nombre completo</strong>: solo tu nombre de pila y la inicial de tu apellido.
          </p>
        </div>

        <p>
          Son datos de salud, así que hace falta que lo autorices tú. Puedes decir que no y seguir
          usando la app exactamente igual: tu entrenador seguirá preparándotelo todo a mano.
          Si cambias de idea, puedes cambiarlo en <strong className="text-ink">Perfil → Ajustes</strong>.
        </p>
      </div>
    </Dialog>
  );
}

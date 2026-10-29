import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { OnboardingData } from '../types';
import { updateOnboarding } from '../dbService';
import { registrarConsentimiento } from '../ai/consentimientoIA';
import { useToast } from '../hooks/useToast';
import { Dialog, Button } from './ui';
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
      showToast(aceptado ? 'Gracias, guardado.' : 'Guardado. Tus datos no se analizarán con el asistente.');
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
      title="¿Puede tu entrenador apoyarse en herramientas digitales?"
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
        {/* Discreto a propósito (Dani, 29-10): aquí lo imprescindible; el
            detalle de qué datos, qué proveedor y en qué condiciones está en la
            Política de privacidad, que es el documento que manda. */}
        <p>
          Tu entrenador puede apoyarse en herramientas digitales para <strong className="text-ink">preparar
          y revisar tu plan</strong> (entrenos, dieta y revisiones). Los planes los decide y los firma él.
        </p>
        <p>
          Como entre tus datos hay información de salud, hace falta que lo autorices tú. Puedes decir
          que no y seguir usando la app exactamente igual. Si cambias de idea, está en{' '}
          <strong className="text-ink">Perfil → Ajustes</strong>; el detalle, en la{' '}
          <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-ink">Política de privacidad</a>.
        </p>
      </div>
    </Dialog>
  );
}

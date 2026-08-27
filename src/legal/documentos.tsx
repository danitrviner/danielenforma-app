import React from 'react';
import { OPCION_IA, OPCION_IMAGENES, type IdDocumentoLegal } from './aceptacion';

/* ═══════════════════════════════════════════════════════════════════════════
   El texto del muro legal

   Es un resumen fiel de las páginas publicadas en `/terminos` y `/privacidad`,
   no un sustituto: cada paso enlaza al documento completo, que es el que
   manda. El resumen existe porque nadie lee catorce pantallas dentro de un
   móvil, y un consentimiento que nadie ha leído es exactamente el que la AEPD
   tumba.

   Va en `text-caption` (11 px) a propósito: tiene que estar entero delante de
   los ojos sin que el paso parezca un contrato de hipoteca. Lo que NO se hace
   es esconderlo: no hay acordeones cerrados, no hay «ver más», y el botón de
   continuar no se enciende hasta que el texto se ha desplazado hasta el final.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CasillaLegal {
  id: string;
  etiqueta: React.ReactNode;
  /** Las obligatorias bloquean el paso; las opcionales solo se registran. */
  obligatoria: boolean;
  /** Aclaración en letra aún más pequeña bajo la casilla. */
  detalle?: React.ReactNode;
}

export interface ContenidoLegal {
  id: IdDocumentoLegal;
  titulo: string;
  /** Enlace al documento completo, que es el que tiene valor legal. */
  url?: string;
  cuerpo: React.ReactNode;
  casillas: CasillaLegal[];
  /** Texto del botón que cierra el paso. */
  accion: string;
}

const P = 'text-caption font-sans text-ink-2 leading-relaxed';
const H = 'text-caption font-sans font-bold text-ink uppercase tracking-wider mt-3';
const UL = 'text-caption font-sans text-ink-2 leading-relaxed list-disc pl-4 space-y-0.5';

export const CONTENIDO_LEGAL: Record<IdDocumentoLegal, ContenidoLegal> = {
  /* ── 1. Términos de uso ─────────────────────────────────────────────────── */
  terminos: {
    id: 'terminos',
    titulo: 'Términos de uso',
    url: '/terminos',
    accion: 'Acepto y continúo',
    cuerpo: (
      <>
        <p className={P}>
          En Forma es la herramienta con la que tu entrenador te entrega y sigue tu plan de
          entrenamiento y nutrición. Es un complemento del servicio contratado, no el servicio en sí.
        </p>

        <p className={H}>Tu cuenta</p>
        <p className={P}>
          No hay registro abierto: la cuenta la crea tu entrenador al contratar. Es personal e
          intransferible y respondes de lo que ocurra bajo ella, así que guarda tu contraseña y avisa
          si crees que alguien ha entrado.
        </p>

        <p className={H}>Aviso sobre tu salud</p>
        <p className={P}>
          <strong className="text-ink">El contenido de esta app no es asesoramiento médico ni
          sustituye la consulta con un profesional sanitario.</strong> Los planes, las pautas de
          alimentación y las calorías son orientativos y se calculan con lo que tú declaras. Antes de
          empezar —y especialmente si tienes alguna patología, estás embarazada, tomas medicación o
          arrastras una lesión— consulta a tu médico. Si durante un entreno sientes dolor, mareo o
          malestar, para y busca atención médica. Entrenas bajo tu propia responsabilidad: el
          entrenador no responde de lesiones derivadas de ejecutar mal un ejercicio, de ocultar
          información relevante sobre tu salud o de no seguir sus indicaciones.
        </p>

        <p className={H}>Lo que te comprometes a hacer</p>
        <ul className={UL}>
          <li>Dar información <strong className="text-ink">veraz</strong> sobre tu salud, lesiones y medicación: de eso depende que tu plan sea seguro.</li>
          <li>No compartir tu cuenta ni ceder tu acceso.</li>
          <li>No copiar, revender ni redistribuir planes, rutinas, menús ni contenido de la academia.</li>
          <li>No subir contenido ilegal ni que vulnere derechos de otras personas.</li>
        </ul>

        <p className={H}>Lo que subes, los pagos y la baja</p>
        <p className={P}>
          Tus fotos, vídeos y textos siguen siendo tuyos: autorizas al entrenador a verlos y usarlos
          solo para seguir tu progreso y corregirte. El servicio se contrata y se paga fuera de la
          app —aquí no hay precios ni cobros—. Puedes eliminar tu cuenta cuando quieras desde
          Perfil → Ajustes, aunque eso no cancela el servicio contratado: para darte de baja, habla
          con el entrenador. Se aplica la legislación española.
        </p>
      </>
    ),
    casillas: [
      { id: 'terminos', obligatoria: true, etiqueta: <>He leído y acepto los <strong className="text-ink">Términos de uso</strong>.</> },
      {
        id: 'salud',
        obligatoria: true,
        etiqueta: <>Entiendo que esto no es asesoramiento médico y que entreno bajo mi responsabilidad.</>,
      },
    ],
  },

  /* ── 2. Privacidad y datos de salud ─────────────────────────────────────── */
  privacidad: {
    id: 'privacidad',
    titulo: 'Privacidad y datos de salud',
    url: '/privacidad',
    accion: 'Acepto y continúo',
    cuerpo: (
      <>
        <p className={P}>
          Responsable del tratamiento: tu entrenador, Daniel Briz Morales, NIF 73004250L,
          Calle Viena 1, 50003 Zaragoza.
          Contacto: <span className="text-ink">danitrviner@gmail.com</span>. La app{' '}
          <strong className="text-ink">no recoge nada por su cuenta</strong>: no hay analítica, ni
          publicidad, ni seguimiento entre aplicaciones, ni acceso a tu ubicación, tu agenda o tus
          contactos.
        </p>

        <p className={H}>Qué datos y para qué</p>
        <ul className={UL}>
          <li><strong className="text-ink">Identificación:</strong> nombre, correo e identificador interno.</li>
          <li><strong className="text-ink">Salud:</strong> sexo, fecha de nacimiento, altura, peso y su evolución, medidas, lesiones, alergias, medicación que declares y frecuencia cardíaca de tu banda de pulso.</li>
          <li><strong className="text-ink">Actividad y nutrición:</strong> entrenos, series, cargas, cardio, menús y adherencia.</li>
          <li><strong className="text-ink">Imágenes:</strong> fotos de progreso y vídeos de ejercicios que subas para que te corrijan.</li>
          <li><strong className="text-ink">Facturación:</strong> importes, fechas y datos fiscales para emitir factura.</li>
        </ul>
        <p className={P}>
          Se usan para prestarte el servicio (ejecución del contrato), para emitir facturas
          (obligación legal) y para mantener la seguridad de la app (interés legítimo). Los datos de
          salud son categoría especial del art. 9 del RGPD y se tratan{' '}
          <strong className="text-ink">solo con tu consentimiento explícito</strong>, que es lo que
          se te pide aquí abajo.
        </p>

        <p className={H}>Con quién se comparten</p>
        <p className={P}>
          No se venden, no se ceden con fines comerciales y no se usan para publicidad. Solo
          intervienen los proveedores necesarios para que la app funcione, como encargados del
          tratamiento: Google Ireland (Firebase, base de datos y acceso, en la UE) y Vercel Inc.
          (alojamiento web, EE. UU. con cláusulas contractuales tipo).
        </p>

        <p className={H}>Cuánto se guardan y qué puedes hacer</p>
        <p className={P}>
          Mientras seas cliente. Si eliminas tu cuenta se borra todo de inmediato, salvo los
          registros de facturación, que se conservan anonimizados el plazo que exige la normativa
          fiscal. Puedes ejercer acceso, rectificación, supresión, oposición, limitación y
          portabilidad, y retirar tu consentimiento cuando quieras, escribiendo desde tu correo de
          registro; se responde en un máximo de un mes. Borrar la cuenta no necesita que escribas a
          nadie: está en Perfil → Ajustes. Si crees que no se te ha atendido bien, puedes reclamar
          ante la Agencia Española de Protección de Datos (aepd.es).
        </p>
      </>
    ),
    casillas: [
      {
        id: 'privacidad',
        obligatoria: true,
        etiqueta: <>He leído la <strong className="text-ink">Política de privacidad</strong>.</>,
      },
      {
        id: 'salud9',
        obligatoria: true,
        etiqueta: <>Consiento que se traten mis <strong className="text-ink">datos de salud</strong> para diseñar y ajustar mi plan.</>,
        detalle: <>Peso, medidas, lesiones, alergias y medicación. Sin esto no se puede preparar un plan seguro. Revocable en cualquier momento.</>,
      },
    ],
  },

  /* ── 3. Opcionales ──────────────────────────────────────────────────────────
     Sin titular. Son dos finalidades distintas del servicio contratado, así que
     van aparte y desmarcadas (art. 7.2 y considerando 32 del RGPD: nada
     premarcado, y decir que no no puede costar nada). Que el paso sea discreto
     no autoriza a ser ambiguo: se dice el tercero con su nombre, el país y qué
     sale de aquí. */
  ajustes: {
    id: 'ajustes',
    titulo: 'Un par de permisos opcionales',
    accion: 'Guardar y empezar',
    cuerpo: (
      <>
        <p className={P}>
          Ninguno de los dos hace falta para usar la app. Si los dejas sin marcar, todo funciona
          exactamente igual. Puedes cambiarlos cuando quieras en Perfil → Ajustes.
        </p>
      </>
    ),
    casillas: [
      {
        id: OPCION_IA,
        obligatoria: false,
        etiqueta: <>Permitir que mi entrenador use herramientas de análisis automático al revisar mi evolución.</>,
        detalle: (
          <>
            Cuando las usa, se envían tu ficha, tus entrenos, tu dieta y tus revisiones —incluidas
            lesiones, alergias y medicación— a Anthropic PBC (EE. UU., con cláusulas contractuales
            tipo), que las trata como encargado y no las emplea para entrenar sus modelos. No viaja
            tu nombre completo: solo tu nombre de pila y la inicial del apellido. Los planes los
            decide y los firma tu entrenador. Si lo dejas sin marcar, los prepara a mano y no se
            envía nada.
          </>
        ),
      },
      {
        id: OPCION_IMAGENES,
        obligatoria: false,
        etiqueta: <>Permitir el uso de mis fotos y resultados con fines promocionales.</>,
        detalle: <>Antes y después, testimonios o publicaciones en redes. Sin esto, tus fotos solo las ve tu entrenador.</>,
      },
    ],
  },
};

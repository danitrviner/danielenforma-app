/* ═══════════════════════════════════════════════════════════════════════════
   Aceptación de los documentos legales · muro previo al alta

   Qué faltaba. La app tenía las páginas legales publicadas (`/terminos`,
   `/privacidad`) y un enlace a ellas en Perfil, pero **nadie las había
   aceptado nunca**. Un enlace no es un consentimiento: el art. 7.1 del RGPD
   exige poder *demostrar* que la persona consintió, y la guía 5.1.1(i) de
   Apple pide consentimiento expreso para la recogida de datos —con más razón
   siendo datos de salud (art. 9), que necesitan consentimiento *explícito*.

   Este módulo es solo la lógica: qué documentos hay, en qué versión, cuáles
   ha aceptado ya esta persona y cuáles hay que volver a enseñarle. La
   pantalla es `components/AceptacionLegalGate.tsx` y el texto,
   `legal/documentos.tsx`.

   ── Tres decisiones ─────────────────────────────────────────────────────────

   **La versión manda.** Cada documento lleva número. Si el texto cambia de
   forma relevante —otro proveedor, otra finalidad, otro responsable— se sube
   el número y el documento vuelve a aparecer. Un consentimiento vale para lo
   que se consintió, no para lo que venga después.

   **Se falla cerrado, pero solo en lo obligatorio.** Sin registro de los dos
   documentos no se entra a la app. La única casilla opcional —el análisis
   asistido— no bloquea nada: se pregunta una vez, se guarda la respuesta
   —sea cual sea— y no se vuelve a insistir.

   **Un "no" se guarda.** Igual que en `ai/consentimientoIA.ts`: sin guardar
   el "no" no hay forma de distinguir «dijo que no» de «aún no se lo hemos
   preguntado», y esa diferencia decide si se le vuelve a preguntar.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { UserProfile } from '../types';
import { VERSION_CONSENTIMIENTO_IA, type ConsentimientoIA } from '../ai/consentimientoIA';

/** Id de cada documento del muro. Es la clave con la que se guarda: no se
 *  renombra nunca sin migrar los registros ya escritos. */
export type IdDocumentoLegal = 'terminos' | 'privacidad';

/** Id de la única casilla opcional, que viaja dentro del documento `terminos`.
 *  Decisión de Dani (27-08): no quería una pantalla dedicada al asunto. Que
 *  comparta paso con los términos NO significa que se acepte con ellos: es una
 *  casilla suelta, desmarcada, que no bloquea el botón. Meterla DENTRO de la
 *  aceptación de los términos invalidaría el consentimiento (art. 7.2 y 7.4:
 *  tiene que ser separable, y decir que no no puede costar el servicio). */
export const OPCION_IA = 'analisisIA';

export interface MetaDocumentoLegal {
  id: IdDocumentoLegal;
  version: number;
  /** Si es `true`, sin aceptarlo no se entra. */
  obligatorio: boolean;
}

/* Los dos son obligatorios. La casilla opcional del análisis asistido vive
   dentro de `terminos`, así que si cambia lo que se le cuenta sobre ese
   tratamiento hay que subir la versión de `terminos`: arrastra a volver a
   enseñar el documento entero, que es el precio de no tener paso propio. */
export const DOCUMENTOS_LEGALES: readonly MetaDocumentoLegal[] = [
  { id: 'terminos',   version: 1, obligatorio: true },
  { id: 'privacidad', version: 1, obligatorio: true },
];

export interface RegistroAceptacion {
  version: number;
  /** ISO. Es parte de la prueba del consentimiento, no un adorno. */
  fecha: string;
  /** Solo en documentos con casillas opcionales: id de la casilla → respuesta. */
  opciones?: Record<string, boolean>;
}

export type AceptacionesLegales = Partial<Record<IdDocumentoLegal, RegistroAceptacion>>;

function alDia(registro: RegistroAceptacion | undefined, meta: MetaDocumentoLegal): boolean {
  return !!registro && registro.version >= meta.version;
}

/** Documentos que hay que enseñarle, en orden. Vacío = puede pasar. */
export function documentosPendientes(legal: AceptacionesLegales | undefined): MetaDocumentoLegal[] {
  return DOCUMENTOS_LEGALES.filter(meta => !alDia(legal?.[meta.id], meta));
}

/** ¿Se le planta el muro delante? El coach nunca: es el responsable del
 *  tratamiento, no el interesado. */
export function debeAceptarLegal(profile: Pick<UserProfile, 'role' | 'legal'> | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === 'coach') return false;
  return documentosPendientes(profile.legal).length > 0;
}

/** ¿Le falta algo *obligatorio*? Es lo que decide si se le deja cerrar. */
export function faltaAlgoObligatorio(legal: AceptacionesLegales | undefined): boolean {
  return documentosPendientes(legal).some(d => d.obligatorio);
}

export function registrarAceptacion(
  meta: MetaDocumentoLegal,
  ahora: string,
  opciones?: Record<string, boolean>,
): RegistroAceptacion {
  return opciones
    ? { version: meta.version, fecha: ahora, opciones }
    : { version: meta.version, fecha: ahora };
}

/** Lectura de la casilla del análisis asistido. Sin registro devuelve
 *  `undefined` —«no ha contestado»—, que NO es lo mismo que `false`. */
export function decisionIA(legal: AceptacionesLegales | undefined): boolean | undefined {
  const opciones = legal?.terminos?.opciones;
  if (!opciones || typeof opciones[OPCION_IA] !== 'boolean') return undefined;
  return opciones[OPCION_IA];
}

/** El mismo dato, en el formato que espera el documento de onboarding, que es
 *  de donde lo leen las herramientas del asistente (`ai/tools.ts`). */
export function consentimientoIADesdeLegal(
  legal: AceptacionesLegales | undefined,
): ConsentimientoIA | undefined {
  const registro = legal?.terminos;
  const aceptado = decisionIA(legal);
  if (!registro || aceptado === undefined) return undefined;
  return { aceptado, fecha: registro.fecha, version: VERSION_CONSENTIMIENTO_IA };
}

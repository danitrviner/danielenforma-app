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
   documentos obligatorios no se entra a la app. Los ajustes opcionales
   (el análisis asistido, el uso promocional de imágenes) no bloquean nada:
   se preguntan una vez, se guarda la respuesta —sea cual sea— y no se
   vuelve a insistir.

   **Un "no" se guarda.** Igual que en `ai/consentimientoIA.ts`: sin guardar
   el "no" no hay forma de distinguir «dijo que no» de «aún no se lo hemos
   preguntado», y esa diferencia decide si se le vuelve a preguntar.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { UserProfile } from '../types';
import { VERSION_CONSENTIMIENTO_IA, type ConsentimientoIA } from '../ai/consentimientoIA';

/** Id de cada documento del muro. Es la clave con la que se guarda: no se
 *  renombra nunca sin migrar los registros ya escritos. */
export type IdDocumentoLegal = 'terminos' | 'privacidad' | 'ajustes';

/** Ids de las casillas opcionales del documento `ajustes`. */
export const OPCION_IA = 'analisisIA';
export const OPCION_IMAGENES = 'usoImagenes';

export interface MetaDocumentoLegal {
  id: IdDocumentoLegal;
  version: number;
  /** Si es `true`, sin aceptarlo no se entra. */
  obligatorio: boolean;
}

/* La versión de `ajustes` va atada a la del consentimiento de IA: es la
   casilla que de verdad tiene consecuencias legales dentro de ese paso, y así
   subir una obliga a volver a preguntar la otra. */
export const DOCUMENTOS_LEGALES: readonly MetaDocumentoLegal[] = [
  { id: 'terminos',   version: 1,                          obligatorio: true },
  { id: 'privacidad', version: 1,                          obligatorio: true },
  { id: 'ajustes',    version: VERSION_CONSENTIMIENTO_IA,  obligatorio: false },
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
  const opciones = legal?.ajustes?.opciones;
  if (!opciones || typeof opciones[OPCION_IA] !== 'boolean') return undefined;
  return opciones[OPCION_IA];
}

/** El mismo dato, en el formato que espera el documento de onboarding, que es
 *  de donde lo leen las herramientas del asistente (`ai/tools.ts`). */
export function consentimientoIADesdeLegal(
  legal: AceptacionesLegales | undefined,
): ConsentimientoIA | undefined {
  const registro = legal?.ajustes;
  const aceptado = decisionIA(legal);
  if (!registro || aceptado === undefined) return undefined;
  return { aceptado, fecha: registro.fecha, version: VERSION_CONSENTIMIENTO_IA };
}

/** ¿Autorizó usar sus fotos y resultados para promoción? Por defecto NO: es
 *  una finalidad distinta del servicio y se pide aparte (art. 7.2 RGPD). */
export function permiteUsoDeImagenes(legal: AceptacionesLegales | undefined): boolean {
  return legal?.ajustes?.opciones?.[OPCION_IMAGENES] === true;
}

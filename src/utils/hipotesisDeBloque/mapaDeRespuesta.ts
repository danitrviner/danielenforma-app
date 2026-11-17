import type { LecturaDeHipotesis, MuscleGroup, PalancaDeHipotesis } from '../../types.js';
import { ZONAS_IEM, esZonaIem, type ZonaIem } from '../cdg/zonas.js';
import { BLOQUES_EN_MANTENER_PARA_CANDIDATA, NO_RESPONDE_PARA_SOLTAR_ESTRELLA } from './cifras.js';
import { ordenarBloques, seguidosAlFinal, veredictosDeLaZona, type BloqueConCierre } from './historial.js';
import { PALANCAS } from './palancas.js';
import { nombreCortoDeZona } from './tiposDeBloque.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El mapa de respuesta del atleta (17-11-2026)

   Qué le funciona a cada zona, sacado de los cierres firmados de todos sus
   bloques (`Mesocycle.cierreDeHipotesis`): cuántas veces se confirmó, no
   respondió o respondió con menos cada palanca. Es lo que convierte un cierre
   en algo que sirve para el bloque siguiente y no solo para el informe.

   Las hipótesis «sin probar» se cuentan aparte: no dicen nada de la zona (no
   se hizo lo previsto, o no se pudo medir), así que no entran en el «2 de 2».

   Las de «mejora, menos de lo buscado» (`mejora_parcial`, auditoría de cifras
   del 17-11-2026) también van aparte: ni a favor ni en contra. No entran en
   el «2 de 2», pero la frase las dice («más 1 con mejora menor de la
   buscada»), y no cuentan como «no responde» para soltar la estrella.

   Y la rotación de estrellas: una zona que no responde dos bloques seguidos
   suelta la estrella (dos «mejora parcial» seguidos NO: rompen la racha), y la recogen lo que pide el atleta o las zonas que
   llevan dos bloques o más en mantener.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CuentaDePalanca {
  confirmada: number;
  /** Se hizo y mejoró más que el ruido sin llegar al objetivo: ni a favor ni en contra. */
  mejora_parcial: number;
  no_responde: number;
  responde_con_menos: number;
  sin_probar: number;
  /** Veces que la palanca dio una respuesta clara (todo menos «sin probar» y «mejora parcial»). */
  probadas: number;
}

export interface RespuestaDeZona {
  zona: ZonaIem;
  nombre: string;
  porPalanca: Partial<Record<PalancaDeHipotesis, CuentaDePalanca>>;
  ultima: { lectura: LecturaDeHipotesis; palanca: PalancaDeHipotesis; mesocycleId: string; firmadoEn: string } | null;
  /** «No responde» seguidos hasta el último veredicto. */
  noRespondeSeguidos: number;
  /** «Pectoral: responde a volumen (2 de 2)». */
  frase: string;
}

export interface MapaDeRespuesta {
  /** Solo las zonas con algún veredicto, en el orden de `ZONAS_IEM`. */
  zonas: RespuestaDeZona[];
  /** Todas las frases seguidas: «Pectoral: … Deltoides: …». */
  frase: string;
}

const cuentaVacia = (): CuentaDePalanca => ({ confirmada: 0, mejora_parcial: 0, no_responde: 0, responde_con_menos: 0, sin_probar: 0, probadas: 0 });

const bloquesTexto = (n: number) => `${n} ${n === 1 ? 'bloque' : 'bloques'}`;

/** La frase de una palanca: «responde a volumen (2 de 2)». */
function fraseDePalanca(p: PalancaDeHipotesis, c: CuentaDePalanca): string {
  const etiqueta = PALANCAS[p].etiqueta;
  if (c.probadas === 0) {
    // Solo mejoras parciales: se dice tal cual, sin darla por buena ni por mala.
    if (c.mejora_parcial > 0) return `mejora con ${etiqueta}, menos de lo buscado (${bloquesTexto(c.mejora_parcial)})`;
    return `${etiqueta} sin probar (${bloquesTexto(c.sin_probar)})`;
  }
  const aparte = c.mejora_parcial > 0 ? `, más ${c.mejora_parcial} con mejora menor de la buscada` : '';
  if (c.confirmada > 0) return `responde a ${etiqueta} (${c.confirmada} de ${c.probadas}${aparte})`;
  if (c.responde_con_menos > 0) return `responde a ${etiqueta} con menos estímulo (${c.responde_con_menos} de ${c.probadas}${aparte})`;
  return `no responde a ${etiqueta} (${c.no_responde} de ${c.probadas}${aparte})`;
}

export function mapaDeRespuesta(bloques: readonly BloqueConCierre[]): MapaDeRespuesta {
  const zonas: RespuestaDeZona[] = [];
  for (const z of ZONAS_IEM) {
    const veredictos = veredictosDeLaZona(bloques, z.clave);
    if (veredictos.length === 0) continue;
    const porPalanca: RespuestaDeZona['porPalanca'] = {};
    for (const { veredicto: v } of veredictos) {
      const c = (porPalanca[v.palanca] ??= cuentaVacia());
      c[v.lectura]++;
      if (v.lectura !== 'sin_probar' && v.lectura !== 'mejora_parcial') c.probadas++;
    }
    const u = veredictos[veredictos.length - 1];
    const nombre = nombreCortoDeZona(z.clave);
    // En el orden en que se probaron las palancas.
    const orden = [...new Set(veredictos.map(v => v.veredicto.palanca))];
    zonas.push({
      zona: z.clave, nombre, porPalanca,
      ultima: { lectura: u.veredicto.lectura, palanca: u.veredicto.palanca, mesocycleId: u.mesocycleId, firmadoEn: u.firmadoEn },
      noRespondeSeguidos: seguidosAlFinal(veredictos.map(v => v.veredicto), 'no_responde'),
      frase: `${nombre}: ${orden.map(p => fraseDePalanca(p, porPalanca[p]!)).join('; ')}.`,
    });
  }
  return { zonas, frase: zonas.map(z => z.frase).join(' ') };
}

/** Las zonas del método en las que caen unos grupos musculares de la app
 *  (lo que el atleta marca en «¿qué grupos quieres priorizar?»). */
export function zonasDeGrupos(grupos: readonly (MuscleGroup | string)[]): ZonaIem[] {
  const pedidos = new Set<string>(grupos);
  return ZONAS_IEM.filter(z => (z.grupos as readonly string[]).some(g => pedidos.has(g))).map(z => z.clave);
}

/**
 * Bloques seguidos, contando desde el último, en los que la zona estuvo en
 * mantener: bloques del sistema de hipótesis (con tipo o con alguna estrella)
 * en los que esa zona no llevó estrella.
 */
export function bloquesEnMantener(bloques: readonly BloqueConCierre[], zona: ZonaIem): number {
  const orden = ordenarBloques(bloques);
  let n = 0;
  for (let i = orden.length - 1; i >= 0; i--) {
    const b = orden[i];
    const conSistema = b.tipoBloque != null || Object.keys(b.hipotesis ?? {}).length > 0 || (b.cierreDeHipotesis?.veredictos.length ?? 0) > 0;
    const conEstrella = b.hipotesis?.[zona] != null || !!b.cierreDeHipotesis?.veredictos.some(v => v.zona === zona);
    if (!conSistema || conEstrella) break;
    n++;
  }
  return n;
}

export type MotivoDeCandidata = 'lo_pide_el_atleta' | 'en_mantener';

export interface RotacionDeEstrellas {
  /** Zonas que deberían soltar la estrella. */
  soltar: Array<{ zona: ZonaIem; nombre: string; noRespondeSeguidos: number; texto: string }>;
  /** Zonas que podrían recibirla: primero las que pide el atleta. */
  candidatas: Array<{ zona: ZonaIem; nombre: string; motivos: MotivoDeCandidata[]; bloquesEnMantener: number; texto: string }>;
}

export function rotacionDeEstrellas(o: {
  /** Los bloques del atleta hasta el que se acaba de cerrar, en cualquier orden. */
  bloques: readonly BloqueConCierre[];
  /** Zonas que pide el atleta (`zonasDeGrupos` sobre `meso_end.priority_groups`). */
  pideElAtleta?: readonly ZonaIem[];
}): RotacionDeEstrellas {
  const mapa = mapaDeRespuesta(o.bloques);
  const soltar = mapa.zonas
    .filter(z => z.noRespondeSeguidos >= NO_RESPONDE_PARA_SOLTAR_ESTRELLA)
    .map(z => ({
      zona: z.zona, nombre: z.nombre, noRespondeSeguidos: z.noRespondeSeguidos,
      texto: `${z.nombre}: ${z.noRespondeSeguidos} bloques seguidos sin responder. Suelta la estrella y pasa a mantener.`,
    }));
  const sueltan = new Set(soltar.map(s => s.zona));
  // Las que llevaban estrella en el último bloque no son candidatas: ya la tienen.
  const ultimo = ordenarBloques(o.bloques).pop();
  const conEstrella = new Set<string>([
    ...Object.keys(ultimo?.hipotesis ?? {}).filter(esZonaIem),
    ...(ultimo?.cierreDeHipotesis?.veredictos.map(v => v.zona) ?? []),
  ]);
  const pide = new Set(o.pideElAtleta ?? []);

  const candidatas: RotacionDeEstrellas['candidatas'] = [];
  for (const z of ZONAS_IEM) {
    if (sueltan.has(z.clave) || conEstrella.has(z.clave)) continue;
    const enMantener = bloquesEnMantener(o.bloques, z.clave);
    const motivos: MotivoDeCandidata[] = [
      ...(pide.has(z.clave) ? ['lo_pide_el_atleta' as const] : []),
      ...(enMantener >= BLOQUES_EN_MANTENER_PARA_CANDIDATA ? ['en_mantener' as const] : []),
    ];
    if (motivos.length === 0) continue;
    const nombre = nombreCortoDeZona(z.clave);
    const partes = [
      ...(pide.has(z.clave) ? ['la pide el atleta'] : []),
      ...(enMantener >= BLOQUES_EN_MANTENER_PARA_CANDIDATA ? [`lleva ${enMantener} bloques en mantener`] : []),
    ];
    candidatas.push({ zona: z.clave, nombre, motivos, bloquesEnMantener: enMantener, texto: `${nombre}: ${partes.join(' y ')}.` });
  }
  candidatas.sort((a, b) => b.motivos.length - a.motivos.length
    || Number(b.motivos.includes('lo_pide_el_atleta')) - Number(a.motivos.includes('lo_pide_el_atleta'))
    || b.bloquesEnMantener - a.bloquesEnMantener);
  return { soltar, candidatas };
}

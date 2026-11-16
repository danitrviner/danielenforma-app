import { LIMITES_POR_DEFECTO, type LimitesDeReajuste } from './reajusteDelAtleta.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Nivel de libertad del atleta en su menú (11-2026, Dani)

   Todo lo que el atleta puede mover en «Mi menú» (cambiar de plato, la ración,
   meter caprichos) necesita límites, y no pueden ser doce interruptores por
   cliente: es UN mando de tres posiciones que pone el coach. Cada fila se puede
   retocar suelta para un cliente («Flexible, pero la ración como en Guiado»).

   Vive en `athleteRecipeRules/{email}.libertad`: lo escribe el coach y el
   atleta solo lo lee. Sin nada guardado, «Flexible».

   Lógica pura: sin Firestore ni React.
   ═══════════════════════════════════════════════════════════════════════════ */

export type NivelDeLibertad = 'guiado' | 'flexible' | 'libre';
export type FilaDeLibertad = 'plato' | 'racion' | 'caprichos' | 'proteina';

export interface LibertadDelAtleta {
  nivel: NivelDeLibertad;
  /** Filas que para este cliente van como en OTRO nivel. */
  retoques?: Partial<Record<FilaDeLibertad, NivelDeLibertad>>;
}

export const LIBERTAD_POR_DEFECTO: LibertadDelAtleta = { nivel: 'flexible' };

export const NIVELES: { id: NivelDeLibertad; titulo: string; para: string }[] = [
  { id: 'guiado', titulo: 'Guiado', para: 'Para quien empieza o necesita que el plan mande' },
  { id: 'flexible', titulo: 'Flexible', para: 'Mueve su día y el menú se recoloca solo' },
  { id: 'libre', titulo: 'Libre', para: 'Para quien ya se organiza bien por su cuenta' },
];

export const FILAS: { id: FilaDeLibertad; titulo: string }[] = [
  { id: 'plato', titulo: 'Cambiar plato' },
  { id: 'racion', titulo: 'Ración' },
  { id: 'caprichos', titulo: 'Caprichos' },
  { id: 'proteina', titulo: 'Proteína mínima' },
];

/** Lo que el atleta puede hacer, ya resuelto. */
export interface Permisos {
  /** Puede elegir un plato que descuadra el día (el resto se recoloca). */
  platoConReajuste: boolean;
  /** Cuánto puede alejarse la ración de lo pautado. Infinity = sin tope. */
  pasoDeRacion: number;
  /** Caprichos que mete él cada semana. 0 = solo los que pone el coach. */
  caprichosPorSemana: number;
  /** Parte de la proteína del día que el reajuste no toca. */
  proteinaMinPct: number;
}

const VALORES: { [F in FilaDeLibertad]: Record<NivelDeLibertad, { texto: string; aplica: Partial<Permisos> }> } = {
  plato: {
    guiado: { texto: 'Solo equivalentes', aplica: { platoConReajuste: false } },
    flexible: { texto: 'Con reajuste', aplica: { platoConReajuste: true } },
    libre: { texto: 'Con reajuste', aplica: { platoConReajuste: true } },
  },
  racion: {
    guiado: { texto: '± 0,25', aplica: { pasoDeRacion: 0.25 } },
    flexible: { texto: '± 0,5', aplica: { pasoDeRacion: 0.5 } },
    libre: { texto: 'Sin tope', aplica: { pasoDeRacion: Infinity } },
  },
  caprichos: {
    guiado: { texto: 'Los que pones tú', aplica: { caprichosPorSemana: 0 } },
    flexible: { texto: '2 por semana', aplica: { caprichosPorSemana: 2 } },
    libre: { texto: 'Sin tope', aplica: { caprichosPorSemana: Infinity } },
  },
  proteina: {
    guiado: { texto: '95 %', aplica: { proteinaMinPct: 0.95 } },
    flexible: { texto: '90 %', aplica: { proteinaMinPct: 0.9 } },
    libre: { texto: '85 %', aplica: { proteinaMinPct: 0.85 } },
  },
};

const esNivel = (n: unknown): n is NivelDeLibertad => n === 'guiado' || n === 'flexible' || n === 'libre';

/** Lo guardado, saneado: un dato viejo o roto vale como «Flexible». */
export function libertadVigente(l: LibertadDelAtleta | null | undefined): LibertadDelAtleta {
  if (!l || !esNivel(l.nivel)) return LIBERTAD_POR_DEFECTO;
  const retoques: LibertadDelAtleta['retoques'] = {};
  for (const { id } of FILAS) {
    const r = l.retoques?.[id];
    if (esNivel(r) && r !== l.nivel) retoques[id] = r;
  }
  return Object.keys(retoques).length > 0 ? { nivel: l.nivel, retoques } : { nivel: l.nivel };
}

/** A qué nivel va una fila para este cliente (el suyo, o el retocado). */
export function nivelDeFila(l: LibertadDelAtleta | null | undefined, fila: FilaDeLibertad): NivelDeLibertad {
  const v = libertadVigente(l);
  return v.retoques?.[fila] ?? v.nivel;
}

export function textoDeCelda(fila: FilaDeLibertad, nivel: NivelDeLibertad): string {
  return VALORES[fila][nivel].texto;
}

export function permisosDe(l: LibertadDelAtleta | null | undefined): Permisos {
  const p = {} as Permisos;
  for (const { id } of FILAS) Object.assign(p, VALORES[id][nivelDeFila(l, id)].aplica);
  return p;
}

/** Los límites del reajuste del día para este cliente. */
export function limitesDe(l: LibertadDelAtleta | null | undefined): LimitesDeReajuste {
  return { ...LIMITES_POR_DEFECTO, proteinaMinPct: permisosDe(l).proteinaMinPct };
}

/** Cambiar de nivel borra los retoques: se parte de limpio. */
export function conNivel(nivel: NivelDeLibertad): LibertadDelAtleta {
  return { nivel };
}

/** Una fila suelta a otro nivel; si coincide con el del cliente, se quita el retoque. */
export function conRetoque(l: LibertadDelAtleta | null | undefined, fila: FilaDeLibertad, nivel: NivelDeLibertad): LibertadDelAtleta {
  const v = libertadVigente(l);
  return libertadVigente({ nivel: v.nivel, retoques: { ...v.retoques, [fila]: nivel } });
}

/** Raciones entre las que elige el atleta: las posibles del plato que no se
 *  alejan de lo pautado más de lo que le deja su nivel. La que ya tiene se
 *  conserva siempre (pudo ponerla con otro nivel). */
export function racionesPermitidas(posibles: readonly number[], pautada: number, actual: number, paso: number): number[] {
  return posibles.filter(r => r === actual || Math.abs(r - pautada) <= paso + 1e-9);
}

/** «Flexible» · «Flexible · 1 retoque». */
export function resumenDeLibertad(l: LibertadDelAtleta | null | undefined): string {
  const v = libertadVigente(l);
  const n = Object.keys(v.retoques ?? {}).length;
  const titulo = NIVELES.find(x => x.id === v.nivel)!.titulo;
  return n === 0 ? titulo : `${titulo} · ${n} retoque${n === 1 ? '' : 's'}`;
}

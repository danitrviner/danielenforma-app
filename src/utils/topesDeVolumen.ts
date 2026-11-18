/* ═══════════════════════════════════════════════════════════════════════════
   Topes de volumen (18-11-2026)

   Constantes sin ninguna importación, a propósito. Vivían en
   `volumeSuggestion.ts`, y `programacion.ts` las leía al cargarse
   (`const SERIES_POR_SESION_Y_GRUPO = SERIES_POR_SESION`). Cuando el sugeridor
   pasó a importar el motor de hipótesis, que acaba importando
   `programacion.ts`, se cerró un ciclo: en la web compilada `programacion.ts`
   se evaluaba antes que el sugeridor y la constante se leía antes de existir
   («Cannot access 'pn' before initialization»), con lo que se caían el
   entreno, el perfil, los clientes y el editor del mesociclo en producción.
   Un archivo hoja, sin importar nada, no puede entrar en un ciclo.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Techo de series por sesión del sugeridor (Dani, 23-08). Ver el porqué en volumeSuggestion.ts. */
export const SERIES_POR_DIA_TOPE = 23;

/** Series por sesión y grupo que tiene sentido acumular sin caer en trabajo basura. */
export const SERIES_POR_SESION = 8;

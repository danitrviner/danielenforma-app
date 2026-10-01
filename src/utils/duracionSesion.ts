/* ═══════════════════════════════════════════════════════════════════════════
   Duración de la sesión · cálculo puro

   El cronómetro general del entreno (cabecera del player) es un reloj de
   pared, igual que el descanso entre series (WorkoutSessionPlayer.tsx,
   `restTimer`): se guarda el INSTANTE de inicio y lo transcurrido se calcula
   contra `Date.now()`, nunca acumulando ticks de un `setInterval` — así no
   importa que la pantalla se apague o que iOS congele la app entre series.

   Se separa del componente para poder testearlo sin montar el player, mismo
   criterio que `utils/setPrefill.ts`.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Segundos entre el inicio de la sesión y "ahora". Nunca negativo: un reloj
 *  desincronizado (o un `ahoraMs` leído antes de aplicar un toque del
 *  bloqueo) no debe enseñar una duración negativa. */
export function segundosTranscurridos(iniciadaEnMs: number, ahoraMs: number): number {
  return Math.max(0, Math.floor((ahoraMs - iniciadaEnMs) / 1000));
}

/** `m:ss` por debajo de la hora, `h:mm:ss` a partir de ella — mismo criterio
 *  de formato que el anillo de descanso (RestRing.tsx) y el cronómetro de
 *  cardio (cardioLiveMetrics.ts): minutos/horas sin cero por delante,
 *  segundos siempre a dos cifras. */
export function formatearDuracion(totalSegundos: number): string {
  const seg = Math.max(0, Math.round(totalSegundos));
  const horas = Math.floor(seg / 3600);
  const minutos = Math.floor((seg % 3600) / 60);
  const segundosRestantes = seg % 60;
  const ss = String(segundosRestantes).padStart(2, '0');
  if (horas > 0) {
    return `${horas}:${String(minutos).padStart(2, '0')}:${ss}`;
  }
  return `${minutos}:${ss}`;
}

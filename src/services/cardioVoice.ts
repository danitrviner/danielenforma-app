// Web Speech API: funciona igual en navegador y dentro del WebView de
// Capacitor (usa el TTS nativo del sistema operativo por debajo, sin plugin
// nativo adicional) — a diferencia de BLE, no requiere Capacitor.isNativePlatform().
// Coaching por voz de la sesión en vivo (§4bis.2 del análisis FITIV / F3 del plan).

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

export function isVoiceAvailable(): boolean {
  return synth() !== null;
}

/** Interrumpe cualquier frase en curso y dice la nueva — nunca se encolan avisos. */
export function speak(text: string): void {
  const s = synth();
  if (!s) return;
  s.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1.05;
  s.speak(utterance);
}

export function cancelSpeech(): void {
  synth()?.cancel();
}

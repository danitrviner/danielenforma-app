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

// F8 del plan de réplica FITIV: toggle "Entrenamiento por voz" de la hoja de
// ajustes en vivo. Vive aquí y no en el llamador — un solo interruptor, no
// uno por cada punto que hoy llama a speak()/speakUrgent().
let voiceEnabled = true;

export function setVoiceEnabled(value: boolean): void {
  voiceEnabled = value;
  if (!value) cancelSpeech();
}

// Cola de frases pendientes (§F1, bug 4): antes `speak()` cancelaba cualquier
// frase en curso, así que el aviso de cambio de bloque y la alerta de salir
// de zona se pisaban entre sí — el que llegaba segundo se comía al primero.
// Ahora se encolan y se dicen en orden; `speakUrgent()` sigue existiendo
// para lo que de verdad no puede esperar (el cambio de bloque de un HIIT).
//
// `generation` evita una carrera real de la Web Speech API: `cancel()` no
// corta la utterance en el acto, dispara su `onend`/`onerror` de forma
// asíncrona — así que tras un `speakUrgent()` puede llegar el `onend` de la
// frase VIEJA después de que ya hayamos arrancado la NUEVA, y esa llamada
// desincronizaría `speaking`. Cada utterance lleva su generación; solo se
// atiende el evento si sigue siendo la generación vigente.
const queue: string[] = [];
let speaking = false;
let generation = 0;

function speakNext(myGeneration: number): void {
  if (myGeneration !== generation) return; // superada por un cancel/urgent posterior
  const s = synth();
  const text = queue.shift();
  if (!s || text === undefined) { speaking = false; return; }
  speaking = true;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1.05;
  utterance.onend = () => speakNext(myGeneration);
  utterance.onerror = () => speakNext(myGeneration);
  s.speak(utterance);
}

/** Encola la frase — se dice en cuanto termina la anterior, sin pisarla. */
export function speak(text: string): void {
  if (!synth() || !voiceEnabled) return;
  queue.push(text);
  if (!speaking) speakNext(generation);
}

/** Para lo que no puede esperar (cambio de bloque): vacía la cola, corta lo que se esté diciendo y habla ya. */
export function speakUrgent(text: string): void {
  if (!voiceEnabled) return;
  const s = synth();
  if (!s) return;
  generation += 1; // invalida el onend/onerror de lo que estuviera sonando
  queue.length = 0;
  s.cancel();
  queue.push(text);
  speakNext(generation);
}

export function cancelSpeech(): void {
  generation += 1;
  queue.length = 0;
  speaking = false;
  synth()?.cancel();
}

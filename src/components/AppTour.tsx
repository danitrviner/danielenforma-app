import React, { useState } from 'react';

// Tour de bienvenida del atleta: nada más completar el onboarding, un recorrido
// paso a paso por los apartados de la app para que sepa qué es cada cosa y qué
// tiene que ir rellenando. Se dispara con la flag localStorage
// `enforma_tour_pending_<email>` (la pone el wizard) y se borra al terminar.

interface Props {
  email: string;
  onClose: () => void;
}

export function isTourPending(email: string): boolean {
  return localStorage.getItem(`enforma_tour_pending_${email}`) === '1';
}

const STEPS: { icon: string; title: string; text: string; hint?: string }[] = [
  {
    icon: 'bolt',
    title: 'Inicio',
    text: 'Tu panel de cada día: nivel, racha, tareas pendientes y lo próximo que toca. Si alguna vez no sabes qué hacer, empieza aquí.',
    hint: 'Las tareas pendientes te marcan el camino: entrena, registra y revisa.',
  },
  {
    icon: 'fitness_center',
    title: 'Entrenamiento',
    text: 'Aquí verás los entrenamientos que tu coach te asigne. Al terminar cada sesión, registra el peso y las repeticiones de cada serie — es lo que usa tu coach para progresarte.',
    hint: 'Registrar cada sesión es la clave: sin datos no hay progresión.',
  },
  {
    icon: 'restaurant',
    title: 'Nutrición',
    text: 'Tu dieta funciona por intercambios: cada comida tiene raciones que vas marcando según comes. Puedes cambiar alimentos por equivalentes cuando quieras.',
    hint: 'Marca lo que comes cada día para que tu coach vea tu adherencia real.',
  },
  {
    icon: 'edit_note',
    title: 'Check-in',
    text: 'Una vez por semana: tu peso, cómo te has sentido y cómo ha ido la semana. Tu coach lo revisa y te responde con feedback personal.',
    hint: 'El check-in semanal es tu momento de contacto directo con el coach.',
  },
  {
    icon: 'map',
    title: 'Road map',
    text: 'Tu plan a largo plazo: las fases que vas a atravesar, tus retos semanales y tu progreso de nivel. Aquí ves el camino completo, no solo la semana.',
  },
  {
    icon: 'celebration',
    title: '¡A por ello!',
    text: 'Tu coach recibirá tus datos y te preparará el plan. Mientras tanto, explora la app — y si tienes dudas, escríbele directamente.',
  },
];

export default function AppTour({ email, onClose }: Props) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const close = () => {
    localStorage.removeItem(`enforma_tour_pending_${email}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-[#111110] border border-[#fbcb1a]/25 rounded-3xl w-full max-w-sm p-7 space-y-5 shadow-2xl" key={step}>
        <div className="flex items-center justify-between">
          <div className="w-14 h-14 rounded-2xl bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
          </div>
          <button onClick={close} className="text-[#c6c9ab]/60 hover:text-white font-mono text-[10px] uppercase tracking-wider">
            Saltar
          </button>
        </div>

        <div className="space-y-2 animate-[fadeSlideIn_.3s_ease]">
          <h3 className="font-sans font-black text-xl text-white">{s.title}</h3>
          <p className="text-sm text-[#c6c9ab] leading-relaxed">{s.text}</p>
          {s.hint && (
            <p className="text-xs text-[#fbcb1a] bg-[#fbcb1a]/5 border border-[#fbcb1a]/20 rounded-xl px-3 py-2 flex items-start gap-2">
              <span className="material-symbols-outlined text-sm mt-0.5">lightbulb</span>
              {s.hint}
            </p>
          )}
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`rounded-full transition-all ${i === step ? 'w-5 h-1.5 bg-[#fbcb1a]' : 'w-1.5 h-1.5 bg-white/20'}`} />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep(v => v - 1)}
              className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-[#c6c9ab] text-xs font-bold uppercase tracking-wide">
              Atrás
            </button>
          )}
          <button
            onClick={() => last ? close() : setStep(v => v + 1)}
            className="flex-1 py-3 rounded-xl bg-[#fbcb1a] text-black text-xs font-black uppercase tracking-widest transition-all active:scale-[.98]"
          >
            {last ? 'Empezar a usar la app' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}

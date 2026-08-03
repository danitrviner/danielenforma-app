import React, { useEffect, useState } from 'react';

// Vuelta a la calma de 2 min tras terminar el entreno (§5.6 del análisis) —
// con banda BLE no hay otra forma de medir el Heart Rate Recovery, porque la
// sesión en sí termina justo donde el atleta la para. Saltable en cualquier
// momento: lo que ya se haya grabado se usa igual (min 1 sin min 2, por ej.).

const COOLDOWN_SEC = 120;

interface Props {
  bpm: number | null;
  onDone: () => void;
}

export default function CooldownPrompt({ bpm, onDone }: Props) {
  const [remaining, setRemaining] = useState(COOLDOWN_SEC);

  useEffect(() => {
    if (remaining <= 0) { onDone(); return; }
    const t = window.setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => window.clearTimeout(t);
  }, [remaining, onDone]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <p className="text-caption font-mono uppercase text-ink-2 tracking-wider">Vuelta a la calma</p>
          <p className="font-sans font-black text-6xl text-white tabular-nums mt-2">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
          <p className="text-label font-mono text-ink-2 mt-2">Deja la banda puesta para medir tu recuperación cardíaca</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-danger text-title-m">favorite</span>
          <p className="font-sans font-bold text-title-l text-white tabular-nums">{bpm ?? '--'}</p>
        </div>

        <button onClick={onDone}
          className="w-full py-3 border border-hairline text-ink-2 font-sans font-bold text-label uppercase rounded-control hover:text-white hover:border-strong transition-all">
          Saltar y guardar ya
        </button>
      </div>
    </div>
  );
}

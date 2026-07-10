import React from 'react';

export interface Achievement {
  id: string;
  icon: string;
  color: string;
  title: string;
  date: string; // YYYY-MM-DD, para ordenar
}

interface Props {
  achievements: Achievement[];
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// Tira horizontal de celebraciones recientes: retos conseguidos, niveles
// alcanzados, fases completadas e hitos del roadmap. Refuerzo social/visual
// del progreso ya hecho — "celebrar cada logro" es parte de la metodología.
export default function RecentAchievements({ achievements }: Props) {
  if (achievements.length === 0) return null;
  const sorted = [...achievements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab] px-1">Logros recientes</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
        {sorted.map(a => (
          <div
            key={a.id}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 w-[84px] rounded-2xl border p-3 text-center"
            style={{ backgroundColor: '#121212', borderColor: `${a.color}33` }}
          >
            <span
              className="material-symbols-outlined text-xl w-9 h-9 rounded-full flex items-center justify-center"
              style={{ color: a.color, backgroundColor: `${a.color}1a` }}
            >
              {a.icon}
            </span>
            <p className="text-white text-[10px] font-sans font-bold leading-tight line-clamp-2">{a.title}</p>
            <p className="text-[#c6c9ab] text-[8px] font-mono">{fmtDate(a.date)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

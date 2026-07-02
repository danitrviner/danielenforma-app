import React, { useState } from 'react';
import { UserProfile, WeightCheckIn } from '../types';
import PhotosScreen from './PhotosScreen';

interface HomeScreenProps {
  profile: UserProfile;
  checkins: WeightCheckIn[];
}

type HomeTab = 'progreso' | 'fotos';

export default function HomeScreen({ profile, checkins }: HomeScreenProps) {
  const [activeTab, setActiveTab] = useState<HomeTab>('progreso');

  const currentWeight = checkins[0]?.weight || profile.actualWeight;
  const initialWeight = profile.initialWeight;
  const difference = parseFloat((currentWeight - initialWeight).toFixed(1));
  const diffSign = difference > 0 ? `+${difference}` : `${difference}`;

  const chartHeight = 160;
  const chartWidth = 500;
  const verticalPadding = 20;
  const horizontalPadding = 35;

  const sortedCheckins = [...checkins].reverse();
  const minWeight = Math.min(...checkins.map(c => c.weight), initialWeight) - 1;
  const maxWeight = Math.max(...checkins.map(c => c.weight), initialWeight) + 1;
  const weightRange = maxWeight - minWeight;

  const points = sortedCheckins.map((item, index) => {
    const x = horizontalPadding + (index / Math.max(1, sortedCheckins.length - 1)) * (chartWidth - horizontalPadding * 2);
    const y = chartHeight - verticalPadding - ((item.weight - minWeight) / (weightRange || 1)) * (chartHeight - verticalPadding * 2);
    return { x, y, item };
  });

  const pathD = points.length > 0
    ? `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`
    : '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Inicio</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Evolución de peso y fotos de progreso.</p>
      </div>

      {/* Sub-tab selector */}
      <div className="flex bg-[#121212] border border-[#2a2a2a] p-1 rounded-lg gap-1 w-full sm:w-fit">
        {([
          { id: 'progreso', label: 'Progreso', icon: 'trending_down' },
          { id: 'fotos',    label: 'Fotos',    icon: 'photo_camera'  },
        ] as { id: HomeTab; label: string; icon: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
              activeTab === tab.id
                ? 'bg-[#e2ff00] text-black shadow-lg shadow-[#e2ff00]/10'
                : 'text-[#c6c9ab] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'fotos' && <PhotosScreen profile={profile} />}

      {activeTab === 'progreso' && (
        <div className="space-y-6">
          {/* Weight summary + SVG chart */}
          <section className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-5 relative overflow-hidden">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col">
                <span className="font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-1">ACTUAL</span>
                <span className="font-sans font-black text-2xl md:text-3xl text-white">
                  {currentWeight} <span className="text-sm font-normal text-[#c6c9ab]">kg</span>
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-1">INICIAL</span>
                <span className="font-sans font-semibold text-2xl md:text-3xl text-white/95">
                  {initialWeight} <span className="text-sm font-normal text-[#c6c9ab]">kg</span>
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-1">DIF. TOTAL</span>
                <div className={`flex items-center gap-1 font-sans font-black text-2xl md:text-3xl ${difference <= 0 ? 'text-[#00eefc]' : 'text-red-400'}`}>
                  <span className="material-symbols-outlined text-sm font-bold">
                    {difference <= 0 ? 'arrow_downward' : 'arrow_upward'}
                  </span>
                  <span>{diffSign} <span className="text-sm font-normal">kg</span></span>
                </div>
              </div>
            </div>

            <div className="w-full bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg p-3 relative overflow-hidden">
              <div className="absolute top-2 left-3 font-mono text-[10px] text-[#c6c9ab]/60 uppercase">Evolución de Peso (kg)</div>
              <div className="w-full overflow-x-auto hide-scrollbar">
                <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="min-w-[450px]">
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const y = verticalPadding + ratio * (chartHeight - verticalPadding * 2);
                    const wVal = (maxWeight - ratio * weightRange).toFixed(1);
                    return (
                      <g key={i}>
                        <line x1={horizontalPadding} y1={y} x2={chartWidth - horizontalPadding} y2={y} stroke="#2a2a2a" strokeDasharray="3,3" />
                        <text x={horizontalPadding - 8} y={y + 4} fill="#c6c9ab" fontSize="10" fontFamily="monospace" textAnchor="end">{wVal}</text>
                      </g>
                    );
                  })}
                  {points.length > 1 && (
                    <>
                      <defs>
                        <linearGradient id="homeChartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00eefc" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="#00eefc" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <path
                        d={`${pathD} L ${points[points.length - 1].x} ${chartHeight - verticalPadding} L ${points[0].x} ${chartHeight - verticalPadding} Z`}
                        fill="url(#homeChartGradient)"
                      />
                      <path d={pathD} fill="none" stroke="#00eefc" strokeWidth="2.5" strokeLinecap="round" />
                    </>
                  )}
                  {points.map((p, i) => {
                    const isLast = i === points.length - 1;
                    return (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r={isLast ? '5' : '4'} fill={isLast ? '#e2ff00' : '#00eefc'} />
                        <text x={p.x} y={p.y - 10} fill="#ffffff" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">{p.item.weight}</text>
                        <text x={p.x} y={chartHeight - 4} fill="#c6c9ab" fontSize="8" fontFamily="monospace" textAnchor="middle">{p.item.dateStr}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 bg-[#1e1e1e] p-3 rounded-lg border border-[#2a2a2a]">
              <span className="font-sans text-xs text-[#c6c9ab] flex-shrink-0">Tendencia últimos 7 días</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-mono text-white text-sm font-semibold">{currentWeight} kg</span>
                <span className="text-[#00eefc] text-xs font-mono">
                  ({difference <= 0 ? 'Progreso positivo' : 'Fase de volumen'})
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

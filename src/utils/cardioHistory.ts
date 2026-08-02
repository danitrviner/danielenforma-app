// Filtros y comparativas del historial de cardio — §6 y §4bis.4(bloque 4)
// del análisis FITIV. Lógica pura, sin React, para poder testearla aparte.

import { CardioSession, CardioSessionType } from '../types';

export type DateRangeFilter = 'all' | 'week' | 'month' | 'year';

export function isWithinRange(dateStr: string, range: DateRangeFilter, today: Date = new Date()): boolean {
  if (range === 'all') return true;
  const date = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
  if (range === 'week') return diffDays >= 0 && diffDays < 7;
  if (range === 'month') return diffDays >= 0 && diffDays < 30;
  return diffDays >= 0 && diffDays < 365; // 'year'
}

export interface SessionFilters {
  range?: DateRangeFilter;
  type?: CardioSessionType;
  tag?: string;
}

export function filterSessions(sessions: CardioSession[], filters: SessionFilters, today?: Date): CardioSession[] {
  return sessions.filter(s => {
    if (filters.range && filters.range !== 'all' && !isWithinRange(s.date, filters.range, today)) return false;
    if (filters.type && s.type !== filters.type) return false;
    if (filters.tag && !(s.tags ?? []).includes(filters.tag)) return false;
    return true;
  });
}

/** Todas las etiquetas usadas, ordenadas — para poblar el filtro (§6: "Tags libres multivalor"). */
export function allTags(sessions: CardioSession[]): string[] {
  const set = new Set<string>();
  for (const s of sessions) for (const t of s.tags ?? []) set.add(t);
  return [...set].sort();
}

export interface SessionComparison {
  count: number;
  durationSec?: number;
  avgHR?: number;
  caloriesKcal?: number;
}

/**
 * "VS. Promedio de los últimos 30 días" del informe post-entreno de FITIV
 * (§4bis.4, bloque 4) — media del mismo `type` en los 30 días previos a esta
 * sesión, excluyéndola a ella misma.
 */
export function compare30DayAverage(session: CardioSession, allSessions: CardioSession[]): SessionComparison {
  const sessionDate = new Date(session.date + 'T00:00:00');
  const cutoff = new Date(sessionDate);
  cutoff.setDate(cutoff.getDate() - 30);

  const peers = allSessions.filter(s => {
    if (s.id === session.id || s.type !== session.type) return false;
    const d = new Date(s.date + 'T00:00:00');
    return d >= cutoff && d < sessionDate;
  });
  if (peers.length === 0) return { count: 0 };

  const avg = (pick: (s: CardioSession) => number | undefined): number | undefined => {
    const values = peers.map(pick).filter((v): v is number => v !== undefined);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  };

  return {
    count: peers.length,
    durationSec: avg(s => s.durationSec),
    avgHR: avg(s => s.avgHR),
    caloriesKcal: avg(s => s.caloriesActiveKcal ?? s.caloriesKcal),
  };
}

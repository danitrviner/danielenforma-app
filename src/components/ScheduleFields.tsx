import React from 'react';
import { QScheduleType } from '../types';

// Controlled repetition-schedule picker (tipo de repetición + días/intervalo/
// día del mes + fecha de inicio). Extracted out of ClientHub's questionnaire
// assignment UI so photo check-in assignment can reuse it instead of
// duplicating the same ~80 lines of markup.

interface Props {
  schedType: QScheduleType;
  onSchedTypeChange: (t: QScheduleType) => void;
  weekdays: number[];
  onWeekdaysChange: (d: number[]) => void;
  intervalDays: number;
  onIntervalDaysChange: (n: number) => void;
  dayOfMonth: number;
  onDayOfMonthChange: (n: number) => void;
  startDate: string;
  onStartDateChange: (s: string) => void;
}

export default function ScheduleFields({
  schedType, onSchedTypeChange,
  weekdays, onWeekdaysChange,
  intervalDays, onIntervalDaysChange,
  dayOfMonth, onDayOfMonthChange,
  startDate, onStartDateChange,
}: Props) {
  return (
    <div className="space-y-3">
      <select
        value={schedType}
        onChange={e => { onSchedTypeChange(e.target.value as QScheduleType); onWeekdaysChange([]); }}
        className="bg-bg border border-hairline rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="once">Una vez</option>
        <option value="weekdays">Días de la semana</option>
        <option value="interval">Cada N días</option>
        <option value="monthly">Día del mes</option>
      </select>

      {schedType === 'weekdays' && (
        <div className="space-y-1">
          <p className="font-mono text-[9px] text-ink-2 uppercase">Días activos</p>
          <div className="flex gap-1.5 flex-wrap">
            {(['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const).map((label, i) => {
              const dayNum = i === 6 ? 0 : i + 1; // Mon=1..Sat=6, Sun=0
              const active = weekdays.includes(dayNum);
              return (
                <button
                  key={label}
                  onClick={() => onWeekdaysChange(active ? weekdays.filter(d => d !== dayNum) : [...weekdays, dayNum])}
                  className={`w-9 h-9 rounded-lg font-mono text-xs font-bold border transition-all ${
                    active
                      ? 'bg-accent border-accent text-black'
                      : 'bg-raised border-hairline text-ink-2 hover:border-hairline'
                  }`}
                >{label}</button>
              );
            })}
          </div>
        </div>
      )}

      {schedType === 'interval' && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink-2">Cada</span>
          <input
            type="number"
            value={intervalDays}
            min={1}
            onChange={e => onIntervalDaysChange(Math.max(1, Number(e.target.value)))}
            className="w-20 bg-bg border border-hairline rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="font-mono text-xs text-ink-2">días</span>
        </div>
      )}

      {schedType === 'monthly' && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink-2">Día</span>
          <input
            type="number"
            value={dayOfMonth}
            min={1} max={28}
            onChange={e => onDayOfMonthChange(Math.min(28, Math.max(1, Number(e.target.value))))}
            className="w-20 bg-bg border border-hairline rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="font-mono text-xs text-ink-2">de cada mes</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-ink-2">Desde</span>
        <input
          type="date"
          value={startDate}
          onChange={e => onStartDateChange(e.target.value)}
          className="bg-bg border border-hairline rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </div>
  );
}

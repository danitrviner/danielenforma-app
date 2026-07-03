import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppNotification } from '../types';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../dbService';

interface Props {
  recipientEmail: string;
  onNavigate: (tab: string) => void;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

const TYPE_ICON: Record<AppNotification['type'], string> = {
  checkin_submitted:       'fitness_center',
  questionnaire_submitted: 'quiz',
  nutrition_phase_change:  'restaurant',
  plan_expiring:           'calendar_today',
  checkin_late:            'warning',
};

export default function NotificationBell({ recipientEmail, onNavigate }: Props) {
  const [notifs, setNotifs]   = useState<AppNotification[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await getNotifications(recipientEmail);
      setNotifs(data.slice(0, 40));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [recipientEmail]);

  useEffect(() => { load(); }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unread = notifs.filter(n => !n.read).length;

  const handleClickNotif = async (n: AppNotification) => {
    if (!n.read) {
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      markNotificationRead(n.id, recipientEmail).catch(console.error);
    }
    if (n.link) {
      onNavigate(n.link);
      setOpen(false);
    }
  };

  const handleMarkAll = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    markAllNotificationsRead(recipientEmail).catch(console.error);
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        className="relative p-1 text-[#fbcb1a] hover:opacity-80 transition-opacity"
        title="Notificaciones"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>notifications</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[min(320px,calc(100vw-1rem))] bg-[#131313] border border-white/7 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/7">
            <h3 className="font-sans font-bold text-white text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[#fbcb1a] text-base">notifications</span>
              Notificaciones
              {unread > 0 && (
                <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-mono font-bold">
                  {unread} nueva{unread !== 1 ? 's' : ''}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button type="button" onClick={handleMarkAll}
                  className="text-[9px] font-mono text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors uppercase">
                  Leer todas
                </button>
              )}
              <button type="button" onClick={() => { load(); }}
                className="p-1 text-[#555] hover:text-[#c6c9ab] transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>refresh</span>
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-[#1e1e1e]">
            {loading ? (
              <p className="text-center py-6 font-mono text-xs text-[#555] animate-pulse">Cargando…</p>
            ) : notifs.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2 text-[#555]">
                <span className="material-symbols-outlined text-3xl">notifications_off</span>
                <p className="font-mono text-xs">Sin notificaciones</p>
              </div>
            ) : (
              notifs.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClickNotif(n)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#1e1e1b] ${
                    !n.read ? 'bg-[#181a18]' : ''
                  }`}
                >
                  {/* Icon */}
                  <span
                    className={`material-symbols-outlined text-base mt-0.5 flex-shrink-0 ${
                      !n.read ? 'text-[#fbcb1a]' : 'text-[#555]'
                    }`}
                    style={{ fontVariationSettings: !n.read ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {TYPE_ICON[n.type] ?? 'info'}
                  </span>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-sans leading-snug ${!n.read ? 'font-bold text-white' : 'font-medium text-[#c6c9ab]'}`}>
                      {n.title}
                    </p>
                    <p className="text-[10px] font-mono text-[#555] mt-0.5 truncate">{n.body}</p>
                    <p className="text-[9px] font-mono text-[#3a3a3a] mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#fbcb1a] flex-shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

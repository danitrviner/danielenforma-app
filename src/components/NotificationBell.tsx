import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppNotification } from '../types';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../dbService';
import { Icon, EmptyState } from './ui';

interface Props {
  recipientEmail: string;
  onNavigate: (tab: string) => void;
  /** Tipos silenciados en Ajustes › Notificaciones (F3.13e) — se filtran aquí,
   * en la lectura, no en la escritura (ver la nota en UserProfile.notificationPrefs). */
  mutedTypes?: Set<AppNotification['type']>;
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
  report_sent:             'analytics',
  weekly_challenge_new:    'flag',
  weekly_challenge_won:    'emoji_events',
  plan_phase_change:       'route',
  level_up:                'military_tech',
  hrtest_pending:          'monitor_heart',
  hrtest_approved:         'favorite',
  academy_access_granted:  'school',
  lesson_completed:        'play_lesson',
};

export default function NotificationBell({ recipientEmail, onNavigate, mutedTypes }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['notifications', recipientEmail];
  const { data: allNotifs = [], isPending: loading, refetch } = useQuery({
    queryKey,
    queryFn: async () => (await getNotifications(recipientEmail)).slice(0, 40),
  });
  const notifs = mutedTypes?.size ? allNotifs.filter(n => !mutedTypes.has(n.type)) : allNotifs;
  const [open, setOpen]       = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
      queryClient.setQueryData<AppNotification[]>(queryKey, prev =>
        prev?.map(x => x.id === n.id ? { ...x, read: true } : x));
      markNotificationRead(n.id, recipientEmail).catch(console.error);
    }
    if (n.link) {
      onNavigate(n.link);
      setOpen(false);
    }
  };

  const handleMarkAll = async () => {
    queryClient.setQueryData<AppNotification[]>(queryKey, prev =>
      prev?.map(n => ({ ...n, read: true })));
    markAllNotificationsRead(recipientEmail).catch(console.error);
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (!open) refetch(); }}
        className="relative p-1 text-accent hover:opacity-80 transition-opacity"
        title="Notificaciones"
      >
        <Icon name="notifications" size="l" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-caption font-mono font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[min(320px,calc(100vw-1rem))] bg-bg border border-hairline rounded-surface shadow-e2 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <h3 className="font-sans font-bold text-white text-title-s flex items-center gap-2">
              <Icon name="notifications" size="m" className="text-accent" />
              Notificaciones
              {unread > 0 && (
                <span className="text-caption bg-red-500/20 text-red-400 border border-red-500/30 px-2 rounded-control font-mono font-bold">
                  {unread} nueva{unread !== 1 ? 's' : ''}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button type="button" onClick={handleMarkAll}
                  className="text-caption font-sans text-ink-2 hover:text-accent transition-colors uppercase">
                  Leer todas
                </button>
              )}
              <button type="button" onClick={() => { refetch(); }}
                className="p-1 text-ink-3 hover:text-ink-2 transition-colors">
                <Icon name="refresh" size="s" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-hairline">
            {loading ? (
              <p className="text-center py-6 font-mono text-label text-ink-3 animate-pulse">Cargando…</p>
            ) : notifs.length === 0 ? (
              <EmptyState icon="notifications_off" title="Sin notificaciones" />
            ) : (
              notifs.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClickNotif(n)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-raised ${
                    !n.read ? 'bg-surface' : ''
                  }`}
                >
                  {/* Icon */}
                  <Icon
                    name={TYPE_ICON[n.type] ?? 'info'}
                    size="m"
                    filled={!n.read}
                    className={`flex-shrink-0 ${!n.read ? 'text-accent' : 'text-ink-3'}`}
                  />

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-label font-sans leading-snug ${!n.read ? 'font-bold text-white' : 'font-medium text-ink-2'}`}>
                      {n.title}
                    </p>
                    <p className="text-caption font-mono text-ink-3 truncate">{n.body}</p>
                    <p className="text-caption font-mono text-ink-3 ">{timeAgo(n.createdAt)}</p>
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 mt-2" />
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

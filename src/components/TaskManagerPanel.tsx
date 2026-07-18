import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskItem, TaskType } from '../types';
import { getTasksForAthlete, createTask, updateTask } from '../dbService';
import Skeleton from './Skeleton';

interface Props {
  athleteEmail: string;
}

const TYPE_LABEL: Record<Extract<TaskType, 'manual' | 'foto' | 'otro'>, string> = {
  manual: 'Tarea', foto: 'Solicitud de fotos', otro: 'Otro',
};

function tasksQueryKey(athleteEmail: string) {
  return ['tasks', athleteEmail] as const;
}

export default function TaskManagerPanel({ athleteEmail }: Props) {
  const queryClient = useQueryClient();
  const queryKey = tasksQueryKey(athleteEmail);
  const { data: tasks = [], isPending: loading } = useQuery({
    queryKey,
    queryFn: () => getTasksForAthlete(athleteEmail),
  });
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('manual');
  const [dueDate, setDueDate] = useState('');

  const createMutation = useMutation({
    mutationFn: () => createTask({
      athleteId: athleteEmail, type, title: title.trim(),
      dueDate: dueDate || undefined, status: 'pending',
      createdBy: 'coach', createdAt: new Date().toISOString(),
    }),
    onSuccess: task => {
      queryClient.setQueryData<TaskItem[]>(queryKey, prev => [...(prev ?? []), task]);
      setTitle(''); setDueDate(''); setType('manual'); setShowForm(false);
    },
    onError: err => console.error(err),
  });

  const toggleMutation = useMutation({
    mutationFn: (task: TaskItem) => {
      const nextStatus = task.status === 'pending' ? 'done' : 'pending';
      return updateTask(task.id, { status: nextStatus });
    },
    // Optimistic update, same as the previous setTasks-before-await — the
    // toggle should feel instant, and there's nothing meaningful to roll
    // back to on failure beyond what console.error already surfaces.
    onMutate: async task => {
      const nextStatus = task.status === 'pending' ? 'done' : 'pending';
      queryClient.setQueryData<TaskItem[]>(queryKey, prev =>
        prev?.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
    },
    onError: err => console.error(err),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate();
  };

  const handleToggle = (task: TaskItem) => toggleMutation.mutate(task);

  const pending = tasks.filter(t => t.status === 'pending');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a] text-base">checklist</span>
          Tareas del atleta
        </h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 font-mono text-[10px] text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors border border-white/7 px-2.5 py-1.5 rounded-lg"
        >
          <span className="material-symbols-outlined text-sm">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancelar' : 'Nueva tarea'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-[#1e1e1b] border border-white/7 rounded-xl p-3 mb-3 space-y-2">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título de la tarea"
            className="w-full bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
            required
          />
          <div className="flex gap-2">
            <select
              value={type}
              onChange={e => setType(e.target.value as TaskType)}
              className="bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
            >
              {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map(k => (
                <option key={k} value={k}>{TYPE_LABEL[k]}</option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="flex-1 bg-[#0e0e0e] border border-white/7 rounded p-2 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
            />
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50 shadow-sm"
          >
            {createMutation.isPending ? 'Guardando...' : 'Crear tarea'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-[#555] font-mono py-2">Sin tareas asignadas.</p>
      ) : (
        <div className="space-y-2">
          {[...pending, ...done].map(t => (
            <button
              key={t.id}
              onClick={() => handleToggle(t)}
              className={`w-full flex items-center gap-3 border rounded-lg p-3 text-left transition-all ${
                t.status === 'done' ? 'bg-[#161616] border-white/50 opacity-60' : 'bg-[#1e1e1e] border-white/7 hover:border-[#fbcb1a]/40'
              }`}
            >
              <span className={`material-symbols-outlined flex-shrink-0 ${t.status === 'done' ? 'text-emerald-400' : 'text-[#c6c9ab]'}`}>
                {t.status === 'done' ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-sans text-sm truncate ${t.status === 'done' ? 'line-through text-[#c6c9ab]' : 'text-white'}`}>{t.title}</p>
                {t.dueDate && <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">Vence: {t.dueDate}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

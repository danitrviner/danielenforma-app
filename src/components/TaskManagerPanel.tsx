import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskItem, TaskType } from '../types';
import { getTasksForAthlete, createTask, updateTask } from '../dbService';
import Skeleton from './Skeleton';
import { ListRow, Button } from './ui';

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
    <div className="bg-surface border border-hairline rounded-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-accent text-title-s">checklist</span>
          Tareas del atleta
        </h3>
        <Button variant="secondary" size="s" onClick={() => setShowForm(v => !v)} icon={showForm ? 'close' : 'add'}>
          {showForm ? 'Cancelar' : 'Nueva tarea'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-raised border border-hairline rounded-surface p-3 mb-3 space-y-2">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título de la tarea"
            className="w-full bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent"
            required
          />
          <div className="flex gap-2">
            <select
              value={type}
              onChange={e => setType(e.target.value as TaskType)}
              className="bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent"
            >
              {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map(k => (
                <option key={k} value={k}>{TYPE_LABEL[k]}</option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="flex-1 bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent"
            />
          </div>
          <Button type="submit" disabled={createMutation.isPending} fullWidth>
            {createMutation.isPending ? 'Guardando...' : 'Crear tarea'}
          </Button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-label text-ink-3 font-sans py-2">Sin tareas asignadas.</p>
      ) : (
        <div className="space-y-2">
          {[...pending, ...done].map(t => (
            <ListRow
              key={t.id}
              onClick={() => handleToggle(t)}
              className={`border rounded-control ${
                t.status === 'done' ? 'bg-surface border-hairline opacity-60' : 'bg-raised border-hairline'
              }`}
              leading={
                <span className={`material-symbols-outlined flex-shrink-0 ${t.status === 'done' ? 'text-emerald-400' : 'text-ink-2'}`}>
                  {t.status === 'done' ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              }
              title={t.title}
              subtitle={t.dueDate ? `Vence: ${t.dueDate}` : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

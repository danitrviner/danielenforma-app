import React, { useEffect, useState } from 'react';
import { TaskItem, TaskType } from '../types';
import { getTasksForAthlete, createTask, updateTask } from '../dbService';

interface Props {
  athleteEmail: string;
}

const TYPE_LABEL: Record<Extract<TaskType, 'manual' | 'foto' | 'otro'>, string> = {
  manual: 'Tarea', foto: 'Solicitud de fotos', otro: 'Otro',
};

export default function TaskManagerPanel({ athleteEmail }: Props) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('manual');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTasksForAthlete(athleteEmail).then(setTasks).catch(console.error).finally(() => setLoading(false));
  }, [athleteEmail]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const task = await createTask({
        athleteId: athleteEmail, type, title: title.trim(),
        dueDate: dueDate || undefined, status: 'pending',
        createdBy: 'coach', createdAt: new Date().toISOString(),
      });
      setTasks(prev => [...prev, task]);
      setTitle(''); setDueDate(''); setType('manual'); setShowForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (task: TaskItem) => {
    const nextStatus = task.status === 'pending' ? 'done' : 'pending';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
    try { await updateTask(task.id, { status: nextStatus }); } catch (err) { console.error(err); }
  };

  const pending = tasks.filter(t => t.status === 'pending');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div className="bg-[#181816] border border-white/7 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-sans font-bold text-sm text-white flex items-center gap-2">
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
        <form onSubmit={handleCreate} className="bg-[#1e1e1b] border border-white/7 rounded-lg p-3 mb-3 space-y-2">
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
            disabled={saving}
            className="w-full py-2 bg-[#fbcb1a] text-black font-mono font-bold text-xs uppercase rounded hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Crear tarea'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-[#c6c9ab] font-mono animate-pulse py-2">Cargando tareas...</p>
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

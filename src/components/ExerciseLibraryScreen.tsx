import React, { useState, useEffect, useCallback } from 'react';
import { Exercise } from '../types';
import { getExercises, createExercise, updateExercise, deleteExercise, seedExercisesIfEmpty } from '../dbService';

interface ExerciseLibraryScreenProps {
  coachId: string;
}

type ExerciseType = Exercise['type'];
type ExerciseLevel = Exercise['level'];

const MUSCLE_GROUPS = ['pecho', 'espalda', 'hombros', 'bíceps', 'tríceps', 'core', 'piernas', 'glúteos', 'cuerpo completo', 'cardio'];
const TYPES: ExerciseType[] = ['fuerza', 'cardio', 'estiramiento', 'pliometría'];
const LEVELS: ExerciseLevel[] = ['principiante', 'intermedio', 'avanzado'];

const TYPE_STYLES: Record<ExerciseType, string> = {
  fuerza:       'bg-[#00eefc]/10 text-[#00eefc] border border-[#00eefc]/20',
  cardio:       'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  estiramiento: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  pliometría:   'bg-[#e2ff00]/10 text-[#e2ff00] border border-[#e2ff00]/20',
};

const LEVEL_STYLES: Record<ExerciseLevel, string> = {
  principiante: 'bg-emerald-500/10 text-emerald-300',
  intermedio:   'bg-amber-500/10 text-amber-300',
  avanzado:     'bg-red-500/10 text-red-300',
};

const EMPTY_FORM: Omit<Exercise, 'id'> = {
  ownerId: '',
  name: '',
  primaryFocus: 'piernas',
  type: 'fuerza',
  level: 'principiante',
  videoUrl: '',
  imageUrl: '',
  instructions: '',
  isCustom: true,
};

export default function ExerciseLibraryScreen({ coachId }: ExerciseLibraryScreenProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterFocus, setFilterFocus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterLevel, setFilterLevel] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Exercise, 'id'>>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const loadExercises = useCallback(async () => {
    setLoading(true);
    try {
      await seedExercisesIfEmpty();
      const list = await getExercises();
      setExercises(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadExercises(); }, [loadExercises]);

  const filtered = exercises.filter(ex => {
    if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterFocus && ex.primaryFocus !== filterFocus) return false;
    if (filterType && ex.type !== filterType) return false;
    if (filterLevel && ex.level !== filterLevel) return false;
    return true;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, ownerId: coachId });
    setShowForm(true);
  };

  const openEdit = (ex: Exercise) => {
    setEditingId(ex.id);
    setForm({ ownerId: ex.ownerId, name: ex.name, primaryFocus: ex.primaryFocus, type: ex.type, level: ex.level, videoUrl: ex.videoUrl || '', imageUrl: ex.imageUrl || '', instructions: ex.instructions || '', isCustom: ex.isCustom });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      if (editingId) {
        await updateExercise(editingId, form);
        setExercises(prev => prev.map(ex => ex.id === editingId ? { ...ex, ...form } : ex));
        flash('Ejercicio actualizado.');
      } else {
        const newEx = await createExercise({ ...form, ownerId: coachId, isCustom: true });
        setExercises(prev => [...prev, newEx]);
        flash('Ejercicio creado.');
      }
      setShowForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteExercise(id);
      setExercises(prev => prev.filter(ex => ex.id !== id));
      setDeleteConfirm(null);
      flash('Ejercicio eliminado.');
    } catch (err) {
      console.error(err);
    }
  };

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const canEdit = (ex: Exercise) => ex.isCustom && ex.ownerId === coachId;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-[#2a2a2a]/60 gap-4">
        <div>
          <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Biblioteca de Ejercicios</h1>
          <p className="text-[#c6c9ab] text-sm mt-1">
            {exercises.length} ejercicios en la base de datos · {exercises.filter(e => e.isCustom).length} personalizados
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 h-[42px] px-5 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-[#bad200] active:scale-95 transition-all shadow-md shadow-[#e2ff00]/10 self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Añadir ejercicio
        </button>
      </header>

      {successMsg && (
        <div className="bg-[#e2ff00]/10 border border-[#e2ff00]/25 text-white p-3 rounded-xl text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[#e2ff00] text-base">check_circle</span>
          {successMsg}
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#c6c9ab] text-base pointer-events-none">search</span>
          <input
            type="text"
            placeholder="Buscar ejercicio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#c6c9ab]/50 focus:outline-none focus:ring-1 focus:ring-[#e2ff00] transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterFocus}
            onChange={e => setFilterFocus(e.target.value)}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
          >
            <option value="">Todos los músculos</option>
            {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
          </select>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
          >
            <option value="">Todos los tipos</option>
            {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>

          <select
            value={filterLevel}
            onChange={e => setFilterLevel(e.target.value)}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
          >
            <option value="">Todos los niveles</option>
            {LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
          </select>

          {(filterFocus || filterType || filterLevel || search) && (
            <button
              onClick={() => { setFilterFocus(''); setFilterType(''); setFilterLevel(''); setSearch(''); }}
              className="text-[#c6c9ab] hover:text-white text-xs font-mono flex items-center gap-1 px-3 py-2.5 border border-[#2a2a2a] rounded-lg hover:border-[#3a3a3a] transition-all"
            >
              <span className="material-symbols-outlined text-sm">close</span>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* RESULTS COUNT */}
      {!loading && (
        <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-widest">
          Mostrando {filtered.length} de {exercises.length} ejercicios
        </p>
      )}

      {/* TABLE */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-[#c6c9ab]">
            <span className="material-symbols-outlined text-2xl animate-spin text-[#e2ff00]">refresh</span>
            <span className="font-mono text-xs uppercase tracking-widest">Cargando ejercicios...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#121212] border border-dashed border-[#2a2a2a] rounded-xl p-16 text-center">
          <span className="material-symbols-outlined text-4xl text-[#e2ff00]/40 block mb-3">fitness_center</span>
          <p className="text-white font-bold text-sm">Sin resultados</p>
          <p className="text-[#c6c9ab] text-xs mt-1">Ajusta los filtros o añade un nuevo ejercicio.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-[#121212] border border-[#2a2a2a] rounded-xl overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                    <th className="p-4 pl-6 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Ejercicio</th>
                    <th className="p-4 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Músculo</th>
                    <th className="p-4 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Tipo</th>
                    <th className="p-4 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Nivel</th>
                    <th className="p-4 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Origen</th>
                    <th className="p-4 pr-6 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ex, i) => (
                    <tr key={ex.id} className={`border-b border-[#2a2a2a]/30 hover:bg-[#1e1e1e] transition-colors ${i % 2 === 0 ? '' : 'bg-[#131313]'}`}>
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          {ex.imageUrl ? (
                            <img src={ex.imageUrl} alt={ex.name} className="w-9 h-9 rounded-lg object-cover border border-[#2a2a2a] flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-base text-[#c6c9ab]">fitness_center</span>
                            </div>
                          )}
                          <div>
                            <span className="font-sans font-bold text-sm text-white block">{ex.name}</span>
                            {ex.videoUrl && (
                              <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-[#00eefc]/70 hover:text-[#00eefc] flex items-center gap-0.5 transition-colors">
                                <span className="material-symbols-outlined text-[10px]">play_circle</span>
                                Ver video
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-mono text-xs text-[#e5e2e1] capitalize">{ex.primaryFocus}</span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold capitalize ${TYPE_STYLES[ex.type]}`}>{ex.type}</span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold capitalize ${LEVEL_STYLES[ex.level]}`}>{ex.level}</span>
                      </td>
                      <td className="p-4">
                        {ex.isCustom ? (
                          <span className="text-[9px] font-mono bg-violet-500/10 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded uppercase">Personalizado</span>
                        ) : (
                          <span className="text-[9px] font-mono text-[#c6c9ab]/60 uppercase">Sistema</span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        {canEdit(ex) ? (
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => openEdit(ex)}
                              className="text-[#c6c9ab] hover:text-[#e2ff00] p-1.5 rounded hover:bg-[#e2ff00]/10 transition-all"
                              title="Editar"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(ex.id)}
                              className="text-[#c6c9ab] hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-all"
                              title="Eliminar"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[#2a2a2a] font-mono text-[9px] uppercase">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(ex => (
              <div key={ex.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {ex.imageUrl ? (
                      <img src={ex.imageUrl} alt={ex.name} className="w-10 h-10 rounded-lg object-cover border border-[#2a2a2a] flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-base text-[#c6c9ab]">fitness_center</span>
                      </div>
                    )}
                    <div>
                      <p className="font-sans font-bold text-sm text-white">{ex.name}</p>
                      <p className="font-mono text-[10px] text-[#c6c9ab] capitalize">{ex.primaryFocus}</p>
                    </div>
                  </div>
                  {canEdit(ex) && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(ex)} className="text-[#c6c9ab] hover:text-[#e2ff00] p-1.5 rounded transition-all">
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button onClick={() => setDeleteConfirm(ex.id)} className="text-[#c6c9ab] hover:text-red-400 p-1.5 rounded transition-all">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold capitalize ${TYPE_STYLES[ex.type]}`}>{ex.type}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold capitalize ${LEVEL_STYLES[ex.level]}`}>{ex.level}</span>
                  {ex.videoUrl && (
                    <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-[#00eefc]/70 flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-xs">play_circle</span>
                      Video
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-red-400 text-2xl">warning</span>
              <h3 className="font-sans font-bold text-white text-lg">¿Eliminar ejercicio?</h3>
            </div>
            <p className="text-sm text-[#c6c9ab]">Esta acción no se puede deshacer. El ejercicio se eliminará de la biblioteca.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-[#2a2a2a] text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-lg transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 bg-red-500/80 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase rounded-lg transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#191919] border border-[#2a2a2a] rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">
                {editingId ? 'Editar ejercicio' : 'Nuevo ejercicio'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-[#c6c9ab] hover:text-white p-1 rounded transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Nombre *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ej. Press inclinado con mancuernas"
                  className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-4 py-3 text-sm text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#e2ff00] transition-all"
                />
              </div>

              {/* Muscle group, type, level — 3 cols */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Grupo muscular *</label>
                  <select
                    value={form.primaryFocus}
                    onChange={e => setForm(f => ({ ...f, primaryFocus: e.target.value }))}
                    className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
                  >
                    {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Tipo *</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as ExerciseType }))}
                    className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
                  >
                    {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Nivel *</label>
                  <select
                    value={form.level}
                    onChange={e => setForm(f => ({ ...f, level: e.target.value as ExerciseLevel }))}
                    className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#e2ff00] cursor-pointer"
                  >
                    {LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              {/* Image URL */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">URL de imagen (opcional)</label>
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-4 py-3 text-sm text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#e2ff00] transition-all"
                />
              </div>

              {/* Video URL */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">URL de vídeo YouTube (opcional)</label>
                <input
                  type="url"
                  value={form.videoUrl}
                  onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
                  placeholder="https://youtube.com/..."
                  className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-4 py-3 text-sm text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#e2ff00] transition-all"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Instrucciones (opcional)</label>
                <textarea
                  value={form.instructions}
                  onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="Descripción técnica del ejercicio, puntos clave de ejecución..."
                  rows={3}
                  className="w-full bg-[#121212] border border-[#2a2a2a] rounded-lg px-4 py-3 text-sm text-white placeholder-[#c6c9ab]/40 focus:outline-none focus:ring-1 focus:ring-[#e2ff00] transition-all resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border border-[#2a2a2a] text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !form.name.trim()}
                  className="flex-1 py-3 bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-[#bad200] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                      Guardando...
                    </>
                  ) : (
                    <>{editingId ? 'Guardar cambios' : 'Crear ejercicio'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

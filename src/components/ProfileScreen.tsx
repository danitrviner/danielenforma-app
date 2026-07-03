import React, { useState, useEffect } from 'react';
import { UserProfile, Questionnaire, QuestionnaireResponse, OnboardingData } from '../types';
import { updateUserProfile, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, getOnboarding } from '../dbService';
import { signOut, auth } from '../firebase';
import BodyweightPanel from './BodyweightPanel';
import QuestionnaireChartsPanel from './QuestionnaireChartsPanel';
import FoodPreferencesPanel from './FoodPreferencesPanel';
import OnboardingForm from './OnboardingForm';
import CoachesScreen from './CoachesScreen';

interface ProfileScreenProps {
  profile: UserProfile;
  isCoach: boolean;
  onRefreshProfile: () => void;
  onLogOut: () => void;
}

export default function ProfileScreen({ profile, isCoach, onRefreshProfile, onLogOut }: ProfileScreenProps) {
  const [showCoaches, setShowCoaches] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [targetWeight, setTargetWeight] = useState(profile.targetWeight.toString());
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  // Questionnaire data for charts
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [responses, setResponses]           = useState<QuestionnaireResponse[]>([]);

  // Food preferences + ficha editing
  const [onboarding,    setOnboarding]    = useState<OnboardingData | null>(null);
  const [editingFicha,  setEditingFicha]  = useState(false);

  const streakDays = profile.currentStreak;
  const maxStreakDays = profile.maxStreak;

  useEffect(() => {
    getOnboarding(profile.email).then(ob => { if (ob) setOnboarding(ob); }).catch(console.error);
  }, [profile.email]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAssignmentsForAthlete(profile.email),
      getResponsesForAthlete(profile.email),
    ]).then(async ([aList, rList]) => {
      if (cancelled) return;
      setResponses(rList);
      const ids = [...new Set(aList.filter(a => a.active).map(a => a.questionnaireId))];
      const qList: Questionnaire[] = [];
      await Promise.all(ids.map(async id => {
        const q = await getQuestionnaireById(id);
        if (q) qList.push(q);
      }));
      if (!cancelled) setQuestionnaires(qList);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [profile.email]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onLogOut();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName) return;

    setLoading(true);
    setSuccess('');
    try {
      await updateUserProfile(profile.userId, {
        displayName,
        targetWeight: parseFloat(targetWeight) || profile.targetWeight,
        avatarUrl
      });
      setSuccess('¡Perfil atleta actualizado correctamente!');
      onRefreshProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Mi Perfil</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Tu gamificación, evolución de peso, gráficas y configuración de ficha.</p>
      </div>

      {success && (
        <div className="bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 text-white p-3.5 rounded-lg text-xs font-bold text-center">
          {success}
        </div>
      )}

      {/* ── Entrenadores (coach only) ───────────────────────────────────────────── */}
      {isCoach && (
        showCoaches ? (
          <div className="bg-[#181816] border border-white/7 p-4 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#fbcb1a] text-base">groups</span>
                Entrenadores
              </h3>
              <button
                onClick={() => setShowCoaches(false)}
                className="text-[#c6c9ab] hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <CoachesScreen currentUserId={profile.userId} currentUserEmail={profile.email} />
          </div>
        ) : (
          <button
            onClick={() => setShowCoaches(true)}
            className="w-full bg-[#181816] border border-white/7 p-4 rounded-2xl flex items-center justify-between gap-4 hover:border-[#3a3a3a] transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#fbcb1a] text-base">groups</span>
              <span className="font-sans font-bold text-sm text-white">Entrenadores</span>
            </div>
            <span className="material-symbols-outlined text-[#c6c9ab] text-sm">chevron_right</span>
          </button>
        )
      )}

      {/* ── Gamification card ─────────────────────────────────────────────────── */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 relative overflow-hidden flex flex-col gap-5">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#fbcb1a]/5 blur-3xl rounded-full pointer-events-none"></div>

        {/* Avatar + XP */}
        <div className="flex items-center gap-4">
          <div className="relative inline-block flex-shrink-0">
            <div className="w-16 h-16 rounded-full border-2 border-[#fbcb1a] overflow-hidden shadow-lg">
              <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-[#fbcb1a] text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight whitespace-nowrap shadow">Lv {profile.level}</div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-sans font-bold text-lg text-white">{profile.displayName}</h3>
            <p className="font-mono text-[10px] text-[#c6c9ab] truncate">{profile.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-2 bg-[#1e1e1e] rounded-full overflow-hidden">
                <div className="h-full bg-[#00eefc]" style={{ width: `${Math.min(100, (profile.xp / 400) * 100)}%` }}></div>
              </div>
              <span className="font-mono text-[11px] text-[#c6c9ab] flex-shrink-0">{profile.xp}/400 XP</span>
            </div>
          </div>
        </div>

        {/* Streak */}
        <div className="flex justify-between items-center bg-[#1e1e1e] p-4 rounded-lg border border-white/7">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔥</span>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">Racha Actual</span>
              <span className="font-sans font-bold text-lg text-white">{streakDays} Días</span>
            </div>
          </div>
          <div className="text-right flex flex-col">
            <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">Racha Máxima</span>
            <span className="font-mono font-bold text-white text-sm">{maxStreakDays} Días</span>
          </div>
        </div>

        {/* Iron Calendar */}
        <div>
          <span className="font-mono text-[10px] text-[#c6c9ab] uppercase block mb-3">Iron Calendar (Apego de entrenos)</span>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 14 }).map((_, idx) => {
              const isActive = idx < Math.min(14, streakDays % 14 || 6);
              return (
                <div
                  key={idx}
                  className={`aspect-square rounded border transition-all ${isActive ? 'bg-[#fbcb1a] border-transparent shadow-[0_0_6px_rgba(226,255,0,0.3)]' : 'bg-[#1e1e1e] border-white/7'}`}
                  title={isActive ? 'Entrenamiento registrado' : 'Próximo entreno'}
                />
              );
            })}
          </div>
        </div>

        {/* Badges */}
        <div>
          <span className="font-mono text-[10px] text-[#c6c9ab] uppercase block mb-3">Insignias Desbloqueadas</span>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 bg-[#201f1f] text-white rounded-full text-xs border border-white/7 flex items-center gap-1.5">
              <span>🏅</span> Primera semana
            </span>
            <span className="px-3 py-1.5 bg-[#201f1f] text-white rounded-full text-xs border border-white/7 flex items-center gap-1.5">
              <span className="text-[#fbcb1a]">⚡</span> 10 días de racha
            </span>
            <span className="px-3 py-1.5 bg-[#201f1f] text-white rounded-full text-xs border border-white/7 flex items-center gap-1.5">
              <span className="text-[#00eefc]">⭐</span> Nivel {profile.level}
            </span>
          </div>
        </div>

        {/* Level metrics */}
        <div className="grid grid-cols-3 gap-3 bg-[#1c1b1b] p-3 rounded-lg border border-white/7 text-center font-mono">
          <div>
            <span className="block text-[9px] text-[#c6c9ab] uppercase">Racha</span>
            <span className="block text-sm font-bold text-white mt-0.5">{profile.currentStreak} días</span>
          </div>
          <div>
            <span className="block text-[9px] text-[#c6c9ab] uppercase">Nivel</span>
            <span className="block text-sm font-bold text-[#fbcb1a] mt-0.5">{profile.level} (Élite)</span>
          </div>
          <div>
            <span className="block text-[9px] text-[#c6c9ab] uppercase">Meta</span>
            <span className="block text-sm font-bold text-[#00eefc] mt-0.5">{profile.targetWeight} kg</span>
          </div>
        </div>
      </div>

      {/* ── Bodyweight panel ──────────────────────────────────────────────────── */}
      <div className="bg-[#181816] border border-white/7 p-4 sm:p-6 rounded-2xl">
        <BodyweightPanel athleteEmail={profile.email} />
      </div>

      {/* ── Questionnaire charts ──────────────────────────────────────────────── */}
      {questionnaires.length > 0 && responses.length > 0 && (
        <div className="bg-[#181816] border border-white/7 p-4 sm:p-6 rounded-2xl">
          <QuestionnaireChartsPanel questionnaires={questionnaires} responses={responses} />
        </div>
      )}

      {/* ── Ficha de iniciación (solo atleta — el coach no rellena ficha propia) ── */}
      {!isCoach && (
        editingFicha ? (
          <div className="bg-[#181816] border border-white/7 p-4 rounded-2xl">
            <OnboardingForm
              athleteEmail={profile.email}
              initialData={onboarding}
              onSaved={data => { setOnboarding(data); setEditingFicha(false); }}
              onCancel={() => setEditingFicha(false)}
            />
          </div>
        ) : (
          <div className="bg-[#181816] border border-white/7 p-4 rounded-2xl flex items-center justify-between gap-4">
            <div>
              <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#fbcb1a] text-base">assignment_ind</span>
                {onboarding ? 'Mi ficha de iniciación' : 'Ficha de iniciación'}
              </h3>
              <p className="font-mono text-[10px] text-[#555] mt-1">
                {onboarding
                  ? `Actualizada el ${new Date(onboarding.completedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : 'Completa tu ficha para que tu entrenador personalice tu plan.'}
              </p>
            </div>
            <button
              onClick={() => setEditingFicha(true)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">edit_note</span>
              {onboarding ? 'Editar' : 'Completar'}
            </button>
          </div>
        )
      )}

      {/* ── Food preferences ──────────────────────────────────────────────────── */}
      {!isCoach && onboarding && !editingFicha && (
        <div className="bg-[#181816] border border-white/7 p-4 rounded-2xl">
          <h3 className="font-sans font-bold text-base text-white flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[#fbcb1a] text-base">restaurant</span>
            Preferencias alimentarias
          </h3>
          <FoodPreferencesPanel
            athleteEmail={profile.email}
            initialLiked={onboarding.likedFoods}
            initialDisliked={onboarding.dislikedFoods}
            allergies={onboarding.allergies}
            onSaved={(liked, disliked) =>
              setOnboarding(prev => prev ? { ...prev, likedFoods: liked, dislikedFoods: disliked } : null)
            }
          />
        </div>
      )}

      {/* ── Edit profile form ─────────────────────────────────────────────────── */}
      <form onSubmit={handleUpdate} className="bg-[#181816] border border-white/7 p-4 rounded-2xl space-y-4">
        <h3 className="font-sans font-bold text-base text-[#fbcb1a] uppercase tracking-wide border-b border-white/7 pb-2">Editar Marca de Ficha</h3>

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Nombre deportivo</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-[#1c1b1b] border border-white/7 rounded p-2.5 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
            required
          />
        </div>

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Meta de Peso Personal (kg)</label>
          <input
            type="number"
            step="0.1"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            className="w-full bg-[#1c1b1b] border border-white/7 rounded p-2.5 text-xs text-white focus:outline-none focus:border-[#fbcb1a]"
          />
        </div>

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Avatar Imagen URL</label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="w-full bg-[#1c1b1b] border border-white/7 rounded p-2.5 text-xs text-mono text-white focus:outline-none focus:border-[#fbcb1a]"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-white hover:bg-opacity-95 text-black font-semibold text-xs font-mono rounded uppercase tracking-wider transition-colors active:scale-95"
        >
          {loading ? 'Sincronizando...' : 'Guardar Cambios Deportivos'}
        </button>
      </form>

      {/* ── Sign out ──────────────────────────────────────────────────────────── */}
      <div className="pt-2">
        <button
          onClick={handleSignOut}
          className="w-full py-3 bg-red-500/10 hover:bg-red-500/15 border border-red-500/35 text-red-200 text-xs font-mono font-bold tracking-widest uppercase rounded flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Cerrar Sesión Activa
        </button>
      </div>
    </div>
  );
}

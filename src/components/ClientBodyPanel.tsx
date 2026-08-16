import React, { useState } from 'react';
import {
  UserProfile, ProgressPhoto, PhotoView, PhotoAssignment, QSchedule, QScheduleType,
  Questionnaire, QuestionnaireResponse,
} from '../types';
import { assignPhotoCheckIn, deactivatePhotoAssignment } from '../dbService';
import { scheduleLabel } from '../utils/scheduleEngine';
import { useToast } from '../hooks/useToast';
import { Skeleton } from './ui';
import ScheduleFields from './ScheduleFields';
import BodyweightPanel from './BodyweightPanel';
import BodyMeasurementsPanel from './BodyMeasurementsPanel';
import QuestionnaireChartsPanel from './QuestionnaireChartsPanel';
import PhotoCompareCurtain from './progress/PhotoCompareCurtain';

/* ═══════════════════════════════════════════════════════════════════════════
   ClientBodyPanel (reorganización del Hub — pestaña "Cuerpo", zona "Atleta")

   Cómo está el cuerpo del cliente, no quién es ni qué ha revisado el coach:
   fotos de progreso (+ asignar el próximo check-in de fotos), peso, perímetros
   y las gráficas de evolución de cuestionarios. Antes estas cuatro cosas
   vivían dispersas dentro de Revisiones, mezcladas con el hilo de check-ins.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  athletePhotos: ProgressPhoto[];
  loadingPhotos: boolean;
  athletePhotoAssignments: PhotoAssignment[];
  setAthletePhotoAssignments: React.Dispatch<React.SetStateAction<PhotoAssignment[]>>;
  athleteQResponses: QuestionnaireResponse[];
  coachQuestionnaires: Questionnaire[];
}

export default function ClientBodyPanel({
  athlete, athletePhotos, loadingPhotos, athletePhotoAssignments, setAthletePhotoAssignments,
  athleteQResponses, coachQuestionnaires,
}: Props) {
  const { showToast } = useToast();

  const [selectedView, setSelectedView] = useState<PhotoView>('front');

  const [assignPhotoViews, setAssignPhotoViews]         = useState<PhotoView[]>(['front']);
  const [assignPhotoSchedType, setAssignPhotoSchedType] = useState<QScheduleType>('once');
  const [assignPhotoWeekdays, setAssignPhotoWeekdays]   = useState<number[]>([]);
  const [assignPhotoIntervalDays, setAssignPhotoIntervalDays] = useState(7);
  const [assignPhotoDayOfMonth, setAssignPhotoDayOfMonth]     = useState(1);
  const [assignPhotoStartDate, setAssignPhotoStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigningPhoto, setAssigningPhoto] = useState(false);

  const handleAssignPhotoCheckIn = async () => {
    if (assignPhotoViews.length === 0) return;
    if (assignPhotoSchedType === 'weekdays' && assignPhotoWeekdays.length === 0) return;
    setAssigningPhoto(true);
    try {
      const schedule: QSchedule = { type: assignPhotoSchedType };
      if (assignPhotoSchedType === 'weekdays')  schedule.weekdays     = assignPhotoWeekdays;
      if (assignPhotoSchedType === 'interval')  schedule.intervalDays = assignPhotoIntervalDays;
      if (assignPhotoSchedType === 'monthly')   schedule.dayOfMonth   = assignPhotoDayOfMonth;
      const a = await assignPhotoCheckIn({
        athleteId: athlete.email,
        schedule,
        startDate: assignPhotoStartDate,
        views: assignPhotoViews,
        active: true,
        createdAt: new Date().toISOString(),
      });
      setAthletePhotoAssignments(prev => [...prev, a]);
      setAssignPhotoViews(['front']);
      setAssignPhotoSchedType('once');
      setAssignPhotoWeekdays([]);
    } catch (err) { console.error(err); showToast('No se pudo asignar el check-in de fotos.'); }
    finally { setAssigningPhoto(false); }
  };

  const handleDeactivatePhoto = async (id: string) => {
    await deactivatePhotoAssignment(id).catch(err => { console.error(err); showToast('No se pudo desactivar el check-in de fotos.'); });
    setAthletePhotoAssignments(prev => prev.map(a => a.id === id ? { ...a, active: false } : a));
  };

  const viewPhotos = athletePhotos
    .filter(p => p.view === selectedView)
    .sort((a, b) => a.date.localeCompare(b.date));
  const baseline = viewPhotos[0];
  const latest   = viewPhotos[viewPhotos.length - 1];
  const fmtDate  = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });

  return (
    <div className="space-y-6">
      {/* ── Fotos de progreso ─────────────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
        <div className="p-4 border-b border-hairline flex items-center justify-between bg-raised">
          <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-body-s">photo_camera</span>
            Historial Fotográfico
            {athletePhotos.length > 0 && (
              <span className="font-mono text-caption text-ink-2">({athletePhotos.length} fotos)</span>
            )}
          </h3>
          <div className="flex bg-raised rounded-control ">
            {([
              { id: 'front', label: 'Frente'   },
              { id: 'side',  label: 'Lateral'  },
              { id: 'back',  label: 'Espalda'  },
            ] as { id: PhotoView; label: string }[]).map(v => (
              <button
                key={v.id}
                onClick={() => setSelectedView(v.id)}
                className={`px-3 py-1 rounded-control font-sans text-caption font-bold uppercase transition-all tracking-wider ${selectedView === v.id ? 'bg-accent text-black' : 'text-ink-2 hover:text-white'}`}
              >{v.label}</button>
            ))}
          </div>
        </div>
        {loadingPhotos ? (
          <div className="p-3 grid grid-cols-3 gap-2">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="aspect-square w-full" />
          </div>
        ) : viewPhotos.length === 0 ? (
          <div className="p-10 text-center">
            <span className="material-symbols-outlined text-display text-ink-3 block mb-2">photo_camera</span>
            <p className="font-sans text-label text-ink-2">Sin fotos todavía.</p>
          </div>
        ) : (
          <div className="p-3 bg-bg/90">
            {viewPhotos.length === 1 ? (
              <div className="relative rounded-surface overflow-hidden border border-accent/20 group max-w-[240px] mx-auto">
                <div className="absolute top-2 left-2 z-10 bg-accent text-black px-3 rounded-control font-sans text-caption font-bold">
                  Actual · {fmtDate(latest.date)}
                </div>
                <img className="w-full h-[280px] object-cover object-top group-hover:scale-105 transition-all duration-500" src={latest.url} alt="Actual" />
              </div>
            ) : (
              <PhotoCompareCurtain
                antes={baseline}
                ahora={latest}
                badge={`${Math.max(1, Math.round((new Date(latest.date).getTime() - new Date(baseline.date).getTime()) / (7 * 86_400_000)))} SEMANAS`}
                height={280}
              />
            )}
            {viewPhotos.length > 2 && (
              <p className="text-center font-mono text-caption text-ink-2 mt-2">
                {viewPhotos.length} fotos — mostrando baseline y más reciente
              </p>
            )}
          </div>
        )}

        {/* ── Asignar fotos de check-in ── */}
        <div className="p-4 border-t border-hairline space-y-4">
          <h4 className="font-sans font-bold text-body-s text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-body-s">edit_calendar</span>
            Asignar fotos de check-in
          </h4>

          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {([
                { id: 'front', label: 'Frente' },
                { id: 'side',  label: 'Lateral' },
                { id: 'back',  label: 'Espalda' },
              ] as { id: PhotoView; label: string }[]).map(v => {
                const active = assignPhotoViews.includes(v.id);
                return (
                  <button
                    key={v.id}
                    onClick={() => setAssignPhotoViews(prev => active ? prev.filter(x => x !== v.id) : [...prev, v.id])}
                    className={`px-3 py-2 rounded-control font-sans text-caption font-bold uppercase tracking-wider border transition-all ${
                      active
                        ? 'bg-accent border-accent text-black'
                        : 'bg-raised border-hairline text-ink-2 hover:border-hairline'
                    }`}
                  >{v.label}</button>
                );
              })}
            </div>

            <ScheduleFields
              schedType={assignPhotoSchedType}
              onSchedTypeChange={setAssignPhotoSchedType}
              weekdays={assignPhotoWeekdays}
              onWeekdaysChange={setAssignPhotoWeekdays}
              intervalDays={assignPhotoIntervalDays}
              onIntervalDaysChange={setAssignPhotoIntervalDays}
              dayOfMonth={assignPhotoDayOfMonth}
              onDayOfMonthChange={setAssignPhotoDayOfMonth}
              startDate={assignPhotoStartDate}
              onStartDateChange={setAssignPhotoStartDate}
            />

            <button
              onClick={handleAssignPhotoCheckIn}
              disabled={assignPhotoViews.length === 0 || assigningPhoto || (assignPhotoSchedType === 'weekdays' && assignPhotoWeekdays.length === 0)}
              className="px-4 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40"
            >
              {assigningPhoto ? '…' : 'Asignar'}
            </button>
          </div>

          {athletePhotoAssignments.filter(a => a.active).length > 0 && (
            <div className="space-y-2 pt-2 border-t border-hairline">
              <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Asignados activos</p>
              {athletePhotoAssignments.filter(a => a.active).map(a => {
                const schedLabel = scheduleLabel(a.schedule);
                const viewsLabel = a.views.map(v => v === 'front' ? 'Frente' : v === 'side' ? 'Lateral' : 'Espalda').join(', ');
                return (
                  <div key={a.id} className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-3 py-2">
                    <span className="material-symbols-outlined text-accent text-body-s">photo_camera</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans font-bold text-white text-label truncate">{viewsLabel}</p>
                      <p className="font-mono text-caption text-ink-2">{schedLabel} · desde {a.startDate}</p>
                    </div>
                    <button onClick={() => handleDeactivatePhoto(a.id)} className="text-ink-2 hover:text-red-400 transition-colors" title="Desactivar">
                      <span className="material-symbols-outlined text-body-s">close</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Peso corporal ────────────────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface p-5">
        <BodyweightPanel athleteEmail={athlete.email} readOnly />
      </div>

      {/* ── Mediciones (perímetros) ──────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-accent text-body-s">straighten</span>
          Mediciones
        </h3>
        <BodyMeasurementsPanel athleteEmail={athlete.email} />
      </div>

      {/* ── Gráficas de evolución ────────────────────────────────────── */}
      {athleteQResponses.length > 0 && coachQuestionnaires.length > 0 && (
        <div className="bg-surface border border-hairline rounded-surface p-5">
          <QuestionnaireChartsPanel
            questionnaires={coachQuestionnaires}
            responses={athleteQResponses}
          />
        </div>
      )}
    </div>
  );
}

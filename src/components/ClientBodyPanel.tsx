import React, { useMemo } from 'react';
import {
  UserProfile, ProgressPhoto, PhotoAssignment,
  Questionnaire, QuestionnaireResponse, BodyweightLog,
} from '../types';
import { deactivatePhotoAssignment } from '../dbService';
import { scheduleLabel } from '../utils/scheduleEngine';
import { leerSexo } from '../utils/athleteProfileSignals';
import { computeIRP } from '../utils/readinessIndex';
import { useToast } from '../hooks/useToast';
import { Skeleton } from './ui';
import BodyweightPanel from './BodyweightPanel';
import BodyMeasurementsPanel from './BodyMeasurementsPanel';
import QuestionnaireChartsPanel from './QuestionnaireChartsPanel';
import ComparadorFotos from './revision/ComparadorFotos';

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
  bodyweightLogs?: BodyweightLog[];
}

export default function ClientBodyPanel({
  athlete, athletePhotos, loadingPhotos, athletePhotoAssignments, setAthletePhotoAssignments,
  athleteQResponses, coachQuestionnaires, bodyweightLogs = [],
}: Props) {
  const { showToast } = useToast();

  const irp = useMemo(
    () => computeIRP({ responses: athleteQResponses, questionnaires: coachQuestionnaires }),
    [athleteQResponses, coachQuestionnaires],
  );

  const handleDeactivatePhoto = async (id: string) => {
    await deactivatePhotoAssignment(id).catch(err => { console.error(err); showToast('No se pudo desactivar el check-in de fotos.'); });
    setAthletePhotoAssignments(prev => prev.map(a => a.id === id ? { ...a, active: false } : a));
  };

  return (
    <div className="pantalla space-y-6">
      {/* ── Fotos de progreso ─────────────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
        <div className="p-4 border-b border-hairline flex items-center justify-between bg-raised">
          <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
            <span className="material-symbols-outlined text-accent-ink text-body-s">photo_camera</span>
            Historial Fotográfico
            {athletePhotos.length > 0 && (
              <span className="font-mono text-caption text-ink-2">({athletePhotos.length} fotos)</span>
            )}
          </h3>
        </div>
        {loadingPhotos ? (
          <div className="p-3 grid grid-cols-3 gap-2">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="aspect-square w-full" />
          </div>
        ) : (
          <div className="p-3 bg-bg/90">
            <ComparadorFotos photos={athletePhotos} athleteEmail={athlete.email} bodyweightLogs={bodyweightLogs} />
          </div>
        )}

        {/* ── Fotos de check-in asignadas ──────────────────────────────
            Ya no se asignan a mano: por defecto el sistema pide las 3
            vistas cada semana sin que el coach tenga que activarlo (ver
            CheckInScreen.tsx / PendingTasksPanel.tsx). Esto es solo el
            estado actual, con la opción de desactivarlo para este cliente. */}
        {athletePhotoAssignments.filter(a => a.active).length > 0 && (
          <div className="p-4 border-t border-hairline space-y-2">
            <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Fotos de check-in asignadas</p>
            {athletePhotoAssignments.filter(a => a.active).map(a => {
              const schedLabel = scheduleLabel(a.schedule);
              const viewsLabel = a.views.map(v => v === 'front' ? 'Frente' : v === 'side' ? 'Lateral' : 'Espalda').join(', ');
              return (
                <div key={a.id} className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-3 py-2">
                  <span className="material-symbols-outlined text-accent-ink text-body-s">photo_camera</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-bold text-ink text-label truncate">{viewsLabel}</p>
                    <p className="font-mono text-caption text-ink-2">{schedLabel} · desde {a.startDate}</p>
                  </div>
                  <button onClick={() => handleDeactivatePhoto(a.id)} className="text-ink-2 hover:text-danger transition-colors" title="Desactivar">
                    <span className="material-symbols-outlined text-body-s">close</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Peso corporal ────────────────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface p-5">
        <BodyweightPanel athleteEmail={athlete.email} readOnly />
      </div>

      {/* ── Mediciones (perímetros) ──────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
        <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ink text-body-s">straighten</span>
          Mediciones
        </h3>
        <BodyMeasurementsPanel
          athleteEmail={athlete.email}
          sexo={leerSexo(athleteQResponses, coachQuestionnaires)}
          pesoKg={athlete.actualWeight || null}
        />
      </div>

      {/* ── Readiness (IRP) ──────────────────────────────────────────── */}
      {irp.valor != null && (
        <div className="bg-surface border border-hairline rounded-surface p-5 space-y-2">
          <h3 className="font-sans font-bold text-title-s text-ink flex items-center gap-2">
            <span className="material-symbols-outlined text-accent-ink text-body-s">battery_charging_full</span>
            Readiness (IRP)
          </h3>
          <p className={`font-mono font-black text-display leading-none ${irp.valor < 0 ? 'text-danger' : irp.valor < 3 ? 'text-warning' : 'text-ink'}`}>
            {irp.valor}
          </p>
          <p className="font-mono text-caption text-ink-2">
            Sueño {irp.horasSueño}h · Estrés {irp.estres}/10 · DOMS crónico {irp.domsCronico}/10 (tendencia suavizada)
          </p>
          <p className="font-mono text-caption text-ink-3">
            IRP = Sueño × (10 − Estrés − DOMS crónico) / 10. Bajo o negativo indica poca capacidad de recuperación
            esta semana — no es diagnóstico, es una señal para revisar volumen/intensidad con el cliente.
          </p>
        </div>
      )}

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

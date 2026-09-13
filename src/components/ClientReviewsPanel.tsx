import React, { useState } from 'react';
import {
  UserProfile, WeightCheckIn, Questionnaire, QuestionnaireAssignment,
  QuestionnaireResponse,
} from '../types';
import TaskManagerPanel from './TaskManagerPanel';
import ReceivedReviewsPanel from './ReceivedReviewsPanel';
import AssignedQuestionnairesPanel from './AssignedQuestionnairesPanel';
import { SegmentedControl } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   ClientReviewsPanel (reorganización del Hub — pestaña "Revisiones", zona "Hoy")

   Antes mezclaba cuatro cosas que no se consultan en el mismo momento: la
   ficha del atleta (→ ClientFichaPanel), su cuerpo/fotos (→ ClientBodyPanel),
   lo que el atleta HA ENVIADO (check-ins + respuestas) y lo que el coach LE
   ASIGNA (cuestionarios, tareas). Las dos últimas SÍ son "revisar" de verdad,
   así que se quedan aquí — separadas por un SegmentedControl "Recibidas" /
   "Asignadas", el mismo par que Check-Ins/Assigned de HubFit.

   Este fichero ya solo reparte: cada mitad vive en su componente
   (ReceivedReviewsPanel / AssignedQuestionnairesPanel), que es lo que permitió
   rehacer las dos sin que la una arrastrara a la otra.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  coachId: string;
  athleteCheckins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
  athleteQResponses: QuestionnaireResponse[];
  setAthleteQResponses: React.Dispatch<React.SetStateAction<QuestionnaireResponse[]>>;
  coachQuestionnaires: Questionnaire[];
  setCoachQuestionnaires: React.Dispatch<React.SetStateAction<Questionnaire[]>>;
  athleteQAssignments: QuestionnaireAssignment[];
  setAthleteQAssignments: React.Dispatch<React.SetStateAction<QuestionnaireAssignment[]>>;
}

export default function ClientReviewsPanel({
  athlete, coachId, athleteCheckins, onRefreshCheckIns,
  athleteQResponses, setAthleteQResponses,
  coachQuestionnaires, setCoachQuestionnaires,
  athleteQAssignments, setAthleteQAssignments,
}: Props) {
  const [view, setView] = useState<'recibidas' | 'asignadas'>('recibidas');

  return (
    <div className="space-y-6">
      <SegmentedControl
        label="Vista de revisiones"
        options={[
          { value: 'recibidas', label: 'Recibidas' },
          { value: 'asignadas', label: 'Asignadas' },
        ]}
        value={view}
        onChange={v => setView(v as 'recibidas' | 'asignadas')}
      />

      {view === 'recibidas' && (
        <ReceivedReviewsPanel
          athleteCheckins={athleteCheckins}
          onRefreshCheckIns={onRefreshCheckIns}
          athleteQResponses={athleteQResponses}
          setAthleteQResponses={setAthleteQResponses}
          coachQuestionnaires={coachQuestionnaires}
        />
      )}

      {view === 'asignadas' && (
        <div className="space-y-6">
          {/* Primero lo que el atleta TIENE puesto; las tareas sueltas debajo.
              Antes iba al revés y los cuestionarios quedaban al fondo, detrás
              del formulario para dar de alta uno nuevo. */}
          <AssignedQuestionnairesPanel
            athlete={athlete}
            coachId={coachId}
            coachQuestionnaires={coachQuestionnaires}
            setCoachQuestionnaires={setCoachQuestionnaires}
            athleteQAssignments={athleteQAssignments}
            setAthleteQAssignments={setAthleteQAssignments}
            athleteQResponses={athleteQResponses}
          />
          <TaskManagerPanel athleteEmail={athlete.email} />
        </div>
      )}
    </div>
  );
}

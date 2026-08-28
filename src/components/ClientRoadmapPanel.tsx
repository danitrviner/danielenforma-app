import React from 'react';
import CoachRoadmapView from './CoachRoadmapView';
import { DestinoPlan } from './roadmap/calendario/RoadmapCalendario';

interface Props {
  athleteEmail: string;
  coachId: string;
  /** Saltar a otra pestaña del cliente desde el calendario del roadmap
   *  ("Editar series", "Editar intercambios y macros", "Editar cardio"). */
  onGoToTab?: (tab: DestinoPlan) => void;
}

export default function ClientRoadmapPanel({ athleteEmail, coachId, onGoToTab }: Props) {
  return <CoachRoadmapView athleteEmail={athleteEmail} coachId={coachId} onGoToClientTab={onGoToTab} />;
}

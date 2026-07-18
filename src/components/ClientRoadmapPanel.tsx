import React from 'react';
import CoachRoadmapView from './CoachRoadmapView';

interface Props {
  athleteEmail: string;
}

export default function ClientRoadmapPanel({ athleteEmail }: Props) {
  return <CoachRoadmapView athleteEmail={athleteEmail} />;
}

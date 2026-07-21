import { getRoadmap, saveRoadmap } from '../dbService';

// Añade un hito puntual al roadmap del atleta (carril 'general', ya
// existente y sin rediseñar RoadmapTimeline) — deduplicado por id fijo, así
// que llamarlo varias veces para el mismo evento (ej. reabrir la pantalla)
// no genera duplicados. §13 del plan: "hitos de academia/cardio como
// eventos del roadmap".
export async function addRoadmapMilestone(athleteId: string, id: string, title: string): Promise<void> {
  const roadmap = await getRoadmap(athleteId);
  if (roadmap.items.some(i => i.id === id)) return;
  const today = new Date().toISOString().slice(0, 10);
  await saveRoadmap({
    ...roadmap,
    items: [...roadmap.items, {
      id, title, type: 'hito', lane: 'general', status: 'logrado',
      startDate: today, targetDate: today,
    }],
  });
}

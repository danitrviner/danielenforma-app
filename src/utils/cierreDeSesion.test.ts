import { describe, it, expect, vi } from 'vitest';

// El módulo importa `../firebase`, que al cargarse inicializa la app real.
vi.mock('../firebase', () => ({
  db: {},
  terminate: async () => {},
  clearIndexedDbPersistence: async () => {},
}));

const { debeBorrarse } = await import('./cierreDeSesion');

/* Las claves de abajo NO son inventadas: salen de recorrer el repo con
   `grep` sobre las llamadas a localStorage. Si mañana se añade un dominio
   nuevo con su propia clave, lo que este test protege es que siga cayendo
   dentro del barrido por prefijo en vez de sobrevivir al cierre de sesión. */

const DATOS_DE_SALUD = [
  'enforma_bodyMeasurements_v1',
  'enforma_bodyweight_v1',
  'enforma_checkins',
  'enforma_workout_logs',
  'enforma_onboarding_v1',
  'enforma_diets_v1',
  'enforma_progress_photos_v1',
  'enforma_hrv_readings_v1',
  'enforma_cardio_sessions_v1',
];

const DATOS_DEL_COACH = [
  'enforma_coach_reports_v1',
  'enforma_coach_notes_v1',
  'enforma_ai_chats_v1',
  'enforma_knowledge_v1',
];

const SIN_PREFIJO_ENFORMA = [
  'questionnaires_v1',
  'questionnaireResponses_v1',
  'questionnaireAssignments_v1',
  'questionnaireDraft_abc_2026-08-12',
  'photoAssignments_v1',
];

const POR_USUARIO = [
  'enforma_profile_uid123',
  'enforma_nutri_config_ana@ejemplo.com',
  'enforma_recipe_favorites_ana@ejemplo.com',
  'enforma_borrador_alta_v1_ana@ejemplo.com',
  'enforma_sesion_en_curso_v1_ana@ejemplo.com_a1',
];

describe('debeBorrarse — nada del usuario anterior puede sobrevivir', () => {
  it.each(DATOS_DE_SALUD)('borra %s', clave => {
    expect(debeBorrarse(clave)).toBe(true);
  });

  it.each(DATOS_DEL_COACH)('borra %s', clave => {
    expect(debeBorrarse(clave)).toBe(true);
  });

  it.each(SIN_PREFIJO_ENFORMA)('borra %s, que no lleva el prefijo enforma_', clave => {
    // Cuatro dominios guardan con su propio prefijo. Un barrido que solo mirara
    // `enforma_` los dejaría enteros, incluidos los cuestionarios de salud.
    expect(debeBorrarse(clave)).toBe(true);
  });

  it.each(POR_USUARIO)('borra %s aunque ya vaya por usuario', clave => {
    // Ir por usuario evita que se MEZCLEN los datos de dos personas, pero no
    // evita que los de la primera sigan ahí después de cerrar sesión.
    expect(debeBorrarse(clave)).toBe(true);
  });
});

describe('debeBorrarse — lo que sobrevive, y por qué', () => {
  it('conserva la marca de migración: no es dato personal y perderla cuesta una lectura de colección', () => {
    expect(debeBorrarse('enforma_migration_muscleGroup_v1')).toBe(false);
  });

  it('conserva la preferencia de columnas del coach: es del dispositivo, no de la persona', () => {
    expect(debeBorrarse('enforma_clients_grid_cols')).toBe(false);
  });

  it('no toca claves de otras aplicaciones del mismo navegador', () => {
    expect(debeBorrarse('firebase:authUser:xyz')).toBe(false);
    expect(debeBorrarse('theme')).toBe(false);
    expect(debeBorrarse('otra-app_enforma_algo')).toBe(false); // el prefijo va al principio
  });
});

import { describe, it, expect } from 'vitest';
import { debeBorrarse } from './cierreDeSesion';

/* Equivocarse en este filtro tiene dos formas, y las dos son malas:
   · de menos → quedan datos de salud del usuario anterior en el dispositivo
   · de más   → se borra algo que hacía falta y la app rehace trabajo caro
   Por eso se prueban las dos direcciones con las claves reales de la app. */

describe('debeBorrarse', () => {
  it('borra las copias locales de datos del atleta', () => {
    const datosDeUsuario = [
      'enforma_checkins',
      'enforma_workout_logs',
      'enforma_bodyweight_v1',
      'enforma_progress_photos_v1_atleta@enforma.com',
      'enforma_onboarding_v1',
      'enforma_borrador_alta_v1',
      'enforma_sesion_en_curso_v1',
      'enforma_diets_v1',
      'enforma_coach_reports_v1',
      'enforma_ai_chats_v1',
      'enforma_profile_abc123',
      'enforma_use_local_fallback',
    ];
    for (const k of datosDeUsuario) {
      expect(debeBorrarse(k), `${k} debería borrarse`).toBe(true);
    }
  });

  it('borra también los prefijos que no empiezan por enforma_', () => {
    // Estos dos los escriben módulos que no siguieron la convención; si el
    // filtro solo mirara `enforma_`, se quedarían en el dispositivo.
    expect(debeBorrarse('questionnaireResponses_v1')).toBe(true);
    expect(debeBorrarse('photoAssignments_v1')).toBe(true);
  });

  it('conserva lo que no es dato personal y cuesta rehacer', () => {
    expect(debeBorrarse('enforma_migration_muscleGroup_v1')).toBe(false);
    expect(debeBorrarse('enforma_clients_grid_cols')).toBe(false);
  });

  it('no toca claves de terceros ni del propio navegador', () => {
    const ajenas = [
      'firebase:authUser:AIzaSy...:[DEFAULT]',
      'theme',
      'i18nextLng',
      'REACT_QUERY_OFFLINE_CACHE',
      '',
    ];
    for (const k of ajenas) {
      expect(debeBorrarse(k), `${k} no es nuestra`).toBe(false);
    }
  });

  it('un prefijo parecido pero distinto no cuela', () => {
    // "enforma" sin la barra baja no es una clave nuestra: si algún día alguien
    // usa "enformaOtraCosa" para algo ajeno a la sesión, no se debe borrar.
    expect(debeBorrarse('enformaOtraCosa')).toBe(false);
  });
});

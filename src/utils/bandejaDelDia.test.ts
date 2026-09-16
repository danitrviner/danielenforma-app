import { describe, it, expect } from 'vitest';
import {
  construirBandejaDelDia, contarPorUrgencia, EntradaBandeja,
  DIAS_SIN_ENTRAR, DIAS_SIN_CHECKIN, DIAS_DE_GRACIA_SETUP,
} from './bandejaDelDia';
import { addDays } from './trainingWeek';
import type { Mesocycle, UserProfile, WeightCheckIn, WorkoutAssignment } from '../types';

const HOY = '2026-09-16';

function atleta(p: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'u1', email: 'ana@x.com', displayName: 'Ana Ruiz', role: 'client',
    planPublishedAt: '2026-08-01', lastLoginAt: `${HOY}T08:00:00.000Z`,
    ...p,
  } as UserProfile;
}

function checkin(fecha: string, p: Partial<WeightCheckIn> = {}): WeightCheckIn {
  return {
    id: `c_${fecha}`, userId: 'u1', email: 'ana@x.com',
    timestamp: new Date(`${fecha}T18:00:00`), dateStr: fecha,
    weight: 80, mood: '😊', adherence: 'Sí', notes: '',
    approved: true, coachFeedback: 'ok',
    ...p,
  } as WeightCheckIn;
}

const UNA_ASIGNACION = new Map<string, WorkoutAssignment[]>([
  ['ana@x.com', [{ id: 'as1', athleteId: 'ana@x.com', workoutId: 'w', date: HOY, status: 'pending' }] as WorkoutAssignment[]],
]);

function entrada(p: Partial<EntradaBandeja> = {}): EntradaBandeja {
  return {
    atletas: [atleta()],
    checkins: [checkin('2026-09-14')],
    asignacionesPorEmail: UNA_ASIGNACION,
    mesociclos: [],
    hoy: HOY,
    ...p,
  };
}

const ids = (e: EntradaBandeja) => construirBandejaDelDia(e).map(s => s.categoria);

describe('construirBandejaDelDia · un atleta al día no sale', () => {
  it('sin nada que hacer, la bandeja está vacía', () => {
    expect(construirBandejaDelDia(entrada())).toEqual([]);
  });
});

describe('lo que le tiene parado', () => {
  it('sin entrenamientos asignados bloquea', () => {
    const s = construirBandejaDelDia(entrada({ asignacionesPorEmail: new Map() }));
    expect(s[0]).toMatchObject({ urgencia: 'bloqueado', categoria: 'plan' });
  });

  it('con plan montado pero SIN publicar también bloquea: el atleta no lo ve', () => {
    const s = construirBandejaDelDia(entrada({ atletas: [atleta({ planPublishedAt: undefined })] }));
    expect(s[0]).toMatchObject({ urgencia: 'bloqueado' });
    expect(s[0].texto).toContain('sin publicar');
  });

  it('no avisa de las dos cosas a la vez: si no hay entrenos, publicar no aplica', () => {
    const s = construirBandejaDelDia(entrada({
      atletas: [atleta({ planPublishedAt: undefined })],
      asignacionesPorEmail: new Map(),
    }));
    expect(s.filter(x => x.categoria === 'plan')).toHaveLength(1);
  });
});

describe('lo que hay que contestar hoy', () => {
  it('un check-in de alguien que NO está en la lista de atletas sale igual', () => {
    // Baja del CRM, cuenta anonimizada o correo sin perfil: antes la bandeja
    // recorría atletas y estos se perdían, mientras la campana los contaba.
    const r = construirBandejaDelDia(entrada({
      atletas: [],
      checkins: [checkin('2026-09-14', { approved: false, coachFeedback: '' })],
      asignacionesPorEmail: new Map(),
    }));
    const huerfano = r.find(s => s.categoria === 'revision');
    expect(huerfano).toBeTruthy();
    expect(huerfano!.texto).toContain('no está en tu lista');
    expect(huerfano!.destino).toBe('/reviews');
  });


  it('cuenta los check-ins sin contestar', () => {
    const s = construirBandejaDelDia(entrada({
      checkins: [checkin('2026-09-14', { approved: false, coachFeedback: '' }), checkin('2026-09-15', { approved: false, coachFeedback: '' })],
    }));
    const r = s.find(x => x.categoria === 'revision')!;
    expect(r.urgencia).toBe('hoy');
    expect(r.texto).toBe('2 revisiones pendientes');
  });

  it('un check-in contestado pero sin aprobar sigue contando', () => {
    const s = construirBandejaDelDia(entrada({
      checkins: [checkin('2026-09-14', { approved: false, coachFeedback: 'te contesto' })],
    }));
    expect(s.find(x => x.categoria === 'revision')!.texto).toBe('1 revisión pendiente');
  });

  it('las propuestas del asistente y los pagos entran como «hoy»', () => {
    const s = construirBandejaDelDia(entrada({
      propuestasPorEmail: new Map([['ana@x.com', 3]]),
      pagosVencidos: [{ nombre: 'Ana Ruiz', texto: 'Pago vencido · Mensual', destino: '/crm/clientes/c1' }],
    }));
    expect(s.filter(x => x.urgencia === 'hoy').map(x => x.categoria).sort())
      .toEqual(['pago', 'propuesta']);
  });
});

describe('lo que no avisa por su cuenta', () => {
  it('lleva días sin abrir la app', () => {
    const s = construirBandejaDelDia(entrada({
      atletas: [atleta({ lastLoginAt: `${addDays(HOY, -(DIAS_SIN_ENTRAR + 2))}T10:00:00.000Z` })],
    }));
    const a = s.find(x => x.categoria === 'ausencia')!;
    expect(a.texto).toBe(`Lleva ${DIAS_SIN_ENTRAR + 2} días sin abrir la app`);
    expect(a.urgencia).toBe('pronto');
  });

  it('justo en el umbral ya avisa, un día antes no', () => {
    const justo = atleta({ lastLoginAt: `${addDays(HOY, -DIAS_SIN_ENTRAR)}T10:00:00.000Z` });
    const antes = atleta({ lastLoginAt: `${addDays(HOY, -(DIAS_SIN_ENTRAR - 1))}T10:00:00.000Z` });
    expect(ids(entrada({ atletas: [justo] }))).toContain('ausencia');
    expect(ids(entrada({ atletas: [antes] }))).not.toContain('ausencia');
  });

  it('días sin mandar check-in', () => {
    const viejo = addDays(HOY, -(DIAS_SIN_CHECKIN + 1));
    const s = construirBandejaDelDia(entrada({ checkins: [checkin(viejo)] }));
    expect(s.find(x => x.categoria === 'ausencia')!.texto).toContain('sin mandar check-in');
  });

  it('un atleta que nunca mandó ninguno no genera ese aviso (no hay desde cuándo contar)', () => {
    expect(ids(entrada({ checkins: [] }))).not.toContain('ausencia');
  });
});

describe('el bloque que se acaba', () => {
  const meso = (startDate: string, weeks = 4): Mesocycle =>
    ({ id: 'm1', athleteId: 'ana@x.com', number: 1, name: 'B1', weeks, startDate } as Mesocycle);

  it('avisa dentro de la última semana', () => {
    // Termina dentro de 3 días.
    const s = construirBandejaDelDia(entrada({
      mesociclos: [meso(addDays(HOY, -(4 * 7 - 4)))],
    }));
    expect(s.find(x => x.categoria === 'renovacion')!.texto).toBe('El bloque termina en 3 días');
  });

  it('no avisa si aún queda más de una semana', () => {
    expect(ids(entrada({ mesociclos: [meso(HOY)] }))).not.toContain('renovacion');
  });

  it('el día que termina lo dice sin números raros', () => {
    const s = construirBandejaDelDia(entrada({ mesociclos: [meso(addDays(HOY, -(4 * 7 - 1)))] }));
    expect(s.find(x => x.categoria === 'renovacion')!.texto).toBe('El bloque termina hoy');
  });

  it('un bloque de OTRO atleta no cuenta', () => {
    const deOtro = { ...meso(addDays(HOY, -(4 * 7 - 4))), athleteId: 'otro@x.com' } as Mesocycle;
    expect(ids(entrada({ mesociclos: [deOtro] }))).not.toContain('renovacion');
  });
});

describe('el montaje a medias', () => {
  const conSetup = (pct: number, planStartDate: string) =>
    atleta({ planStartDate, setupSummary: { pct, attention: 0, updatedAt: '' } });

  it('avisa de un montaje bajo con semanas de vida', () => {
    const s = construirBandejaDelDia(entrada({ atletas: [conSetup(55, addDays(HOY, -30))] }));
    expect(s.find(x => x.categoria === 'setup')!.texto).toContain('55 %');
  });

  it('un cliente recién dado de alta NO sale: está al 20 % porque acaba de entrar', () => {
    const recien = conSetup(20, addDays(HOY, -(DIAS_DE_GRACIA_SETUP - 1)));
    expect(ids(entrada({ atletas: [recien] }))).not.toContain('setup');
  });

  it('un montaje completo tampoco', () => {
    expect(ids(entrada({ atletas: [conSetup(100, addDays(HOY, -60))] }))).not.toContain('setup');
  });
});

describe('el orden y los contadores', () => {
  it('primero lo que le tiene parado, luego lo de hoy, luego los avisos', () => {
    const s = construirBandejaDelDia(entrada({
      atletas: [atleta({ planPublishedAt: undefined, lastLoginAt: `${addDays(HOY, -20)}T10:00:00.000Z` })],
      checkins: [checkin('2026-09-14', { approved: false, coachFeedback: '' })],
    }));
    expect(s.map(x => x.urgencia)).toEqual(['bloqueado', 'hoy', 'pronto']);
  });

  it('con varios atletas, dentro de cada urgencia ordena por nombre', () => {
    const s = construirBandejaDelDia(entrada({
      atletas: [
        atleta({ userId: 'u2', email: 'z@x.com', displayName: 'Zoe', planPublishedAt: undefined }),
        atleta({ userId: 'u3', email: 'b@x.com', displayName: 'Beto', planPublishedAt: undefined }),
      ],
      asignacionesPorEmail: new Map([
        ['z@x.com', UNA_ASIGNACION.get('ana@x.com')!],
        ['b@x.com', UNA_ASIGNACION.get('ana@x.com')!],
      ]),
      checkins: [],
    }));
    expect(s.map(x => x.athleteName)).toEqual(['Beto', 'Zoe']);
  });

  it('los contadores cuadran con la lista', () => {
    const s = construirBandejaDelDia(entrada({
      atletas: [atleta({ planPublishedAt: undefined })],
      checkins: [checkin('2026-09-14', { approved: false, coachFeedback: '' })],
    }));
    expect(contarPorUrgencia(s)).toEqual({ bloqueado: 1, hoy: 1, pronto: 0 });
  });

  it('cada señal lleva su destino y su id único', () => {
    const s = construirBandejaDelDia(entrada({ atletas: [atleta({ planPublishedAt: undefined })] }));
    expect(s.every(x => !!x.destino)).toBe(true);
    expect(new Set(s.map(x => x.id)).size).toBe(s.length);
  });
});

describe('los cobros vencidos', () => {
  it('entran con su propio destino al CRM, no a una pestaña del atleta', () => {
    const s = construirBandejaDelDia(entrada({
      pagosVencidos: [{ nombre: 'Quien Sea', texto: 'Pago vencido · Mensual', destino: '/crm/clientes/c9' }],
    }));
    const pago = s.find(x => x.categoria === 'pago')!;
    expect(pago.destino).toBe('/crm/clientes/c9');
    expect(pago.athleteEmail).toBe('');
  });

  it('un cobro de alguien que NO es atleta de la app sale igual', () => {
    // El CRM tiene contactos sin cuenta: si se casaran por email se perderían.
    const s = construirBandejaDelDia(entrada({
      atletas: [],
      checkins: [],
      pagosVencidos: [{ nombre: 'Contacto Suelto', texto: 'Pago vencido', destino: '/crm/clientes/c9' }],
    }));
    expect(s).toHaveLength(1);
    expect(s[0].athleteName).toBe('Contacto Suelto');
  });
});

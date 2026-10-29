import { describe, it, expect } from 'vitest';
import {
  construirBandejaDelDia, contarPorUrgencia, EntradaBandeja,
  DIAS_SIN_ENTRAR, DIAS_SIN_CHECKIN, DIAS_DE_GRACIA_SETUP,
} from './bandejaDelDia';
import { addDays } from './trainingWeek';
import type { Mesocycle, NutritionProgram, UserProfile, WeightCheckIn, WorkoutAssignment } from '../types';

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

  it('un check-in aprobado sin texto ya no está pendiente (26-10-2026)', () => {
    const s = construirBandejaDelDia(entrada({
      checkins: [checkin('2026-09-14', { approved: true, coachFeedback: '' })],
    }));
    expect(s.find(x => x.categoria === 'revision')).toBeUndefined();
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
    // Desde el 28-10 es «para hoy»: la pantalla no enseña `pronto`, así que
    // como aviso con antelación no lo veía nadie.
    expect(a.urgencia).toBe('hoy');
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
      // El check-in viejo sin contestar es «hoy»; el último check-in de hace
      // 20 días es el aviso con antelación («pronto»).
      checkins: [checkin(addDays(HOY, -20), { approved: false, coachFeedback: '' })],
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

describe('las señales de acompañamiento (28-10)', () => {
  const senales = (p: Partial<NonNullable<UserProfile['senales']>> = {}) => ({
    calculadoEn: HOY, ultimoRegistro: HOY, registros14d: 10, perdidas14d: 0, ultimaRespuesta: null, tieneCuestionarios: true, ...p,
  });
  const ausencias = (e: Partial<EntradaBandeja>) => construirBandejaDelDia(entrada(e)).filter(s => s.categoria === 'ausencia');

  it('3 días sin registrar nada: para hoy, con plantilla de WhatsApp', () => {
    const s = ausencias({ atletas: [atleta({ senales: senales({ ultimoRegistro: addDays(HOY, -3) }) })] });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ urgencia: 'hoy', texto: '3 días sin registrar nada', contacto: { motivo: 'sin_registrar', dias: 3 } });
  });

  it('2 días sin registrar todavía no es señal', () => {
    expect(ausencias({ atletas: [atleta({ senales: senales({ ultimoRegistro: addDays(HOY, -2) }) })] })).toHaveLength(0);
  });

  it('3 sesiones perdidas en 14 días aunque registre otras cosas', () => {
    const s = ausencias({ atletas: [atleta({ senales: senales({ perdidas14d: 3 }) })] });
    expect(s[0]).toMatchObject({ texto: '3 sesiones perdidas en 14 días', contacto: { motivo: 'perdidas', perdidas: 3 } });
  });

  it('dos semanas sin contestar la revisión', () => {
    const s = ausencias({ atletas: [atleta({ senales: senales({ ultimaRespuesta: addDays(HOY, -15) }) })] });
    expect(s[0]).toMatchObject({ contacto: { motivo: 'sin_revision', dias: 15 } });
  });

  it('sin señales del latido cae al último login, pero ya como «para hoy»', () => {
    const s = ausencias({ atletas: [atleta({ senales: undefined, lastLoginAt: `${addDays(HOY, -8)}T08:00:00.000Z` })] });
    expect(s[0]).toMatchObject({ urgencia: 'hoy', contacto: { motivo: 'sin_registrar', dias: 8 } });
  });

  it('un atleta sin plan publicado no se está apagando: está sin empezar', () => {
    const s = construirBandejaDelDia(entrada({
      atletas: [atleta({ planPublishedAt: undefined, createdAt: `${addDays(HOY, -5)}T08:00:00.000Z`, senales: senales({ ultimoRegistro: null }) })],
      asignacionesPorEmail: new Map(),
    }));
    expect(s.filter(x => x.categoria === 'ausencia')).toHaveLength(0);
    const alta = s.find(x => x.id.endsWith('alta_parada'));
    expect(alta).toMatchObject({ urgencia: 'hoy', texto: 'Alta sin terminar desde hace 5 días', contacto: { motivo: 'alta_parada' } });
  });

  it('un contacto reciente por ese motivo calla la señal; uno viejo no', () => {
    const atletas = [atleta({ senales: senales({ ultimoRegistro: addDays(HOY, -4) }) })];
    const contacto = (fecha: string) => ({ id: 'c', athleteId: 'ana@x.com', fecha, motivo: 'sin_registrar', canal: 'whatsapp' as const, createdAt: '' });
    expect(ausencias({ atletas, contactos: [contacto(addDays(HOY, -1))] })).toHaveLength(0);
    expect(ausencias({ atletas, contactos: [contacto(addDays(HOY, -3))] })).toHaveLength(1);
  });

  it('una revisión enviada hace más de 24 h sin respuesta del coach', () => {
    const r = (dia: string, contestada = false) => ({
      id: `r_${dia}`, questionnaireId: 'q', assignmentId: 'a', athleteId: 'ana@x.com', submittedAt: `${dia}T10:00:00.000Z`, answers: [],
      respuestaCoach: contestada ? { texto: 'ok', enviadaEn: `${dia}T12:00:00.000Z` } : undefined,
    });
    const s = construirBandejaDelDia(entrada({ respuestas: [r(addDays(HOY, -3)), r(addDays(HOY, -3)), r(addDays(HOY, -1)), r(addDays(HOY, -6), true)] }))
      .filter(x => x.id.endsWith('sin_respuesta'));
    expect(s).toHaveLength(1);
    expect(s[0].texto).toMatch(/sin contestar · 3 días · y 1 más/);
    expect(s[0].contacto).toMatchObject({ motivo: 'sin_respuesta', fechaRevision: addDays(HOY, -3) });
    // «vista» no basta: el atleta no lo ve.
    const vista = construirBandejaDelDia(entrada({ respuestas: [{ ...r(addDays(HOY, -3)), reviewedAt: `${HOY}T08:00:00.000Z` }] }))
      .filter(x => x.id.endsWith('sin_respuesta'));
    expect(vista).toHaveLength(1);
  });

  it('una revisión de hoy todavía no es «sin contestar»', () => {
    const s = construirBandejaDelDia(entrada({ respuestas: [{ id: 'r', questionnaireId: 'q', assignmentId: 'a', athleteId: 'ana@x.com', submittedAt: `${HOY}T09:00:00.000Z`, answers: [] }] }))
      .filter(x => x.id.endsWith('sin_respuesta'));
    expect(s).toHaveLength(0);
  });

  it('bloque terminado sin siguiente: le tiene parado', () => {
    const meso = (startDate: string, weeks: number): Mesocycle => ({ id: `m_${startDate}`, athleteId: 'ana@x.com', startDate, weeks } as Mesocycle);
    const terminado = construirBandejaDelDia(entrada({ mesociclos: [meso(addDays(HOY, -8 * 7), 6)] }))
      .find(x => x.id.endsWith('bloque_sin_siguiente'));
    expect(terminado).toMatchObject({ urgencia: 'bloqueado', categoria: 'plan', contacto: { motivo: 'bloque_terminado' } });
    const conSiguiente = construirBandejaDelDia(entrada({ mesociclos: [meso(addDays(HOY, -8 * 7), 6), meso(addDays(HOY, 3), 8)] }))
      .find(x => x.id.endsWith('bloque_sin_siguiente'));
    expect(conSiguiente).toBeUndefined();
  });
});

describe('los mensajes por firmar (29-10)', () => {
  it('un borrador del latido es una señal para hoy hacia la pestaña de revisión', () => {
    const s = construirBandejaDelDia(entrada({ borradoresPorEmail: new Map([['ana@x.com', 2]]) }))
      .find(x => x.id.endsWith('borradores'));
    expect(s).toMatchObject({ urgencia: 'hoy', categoria: 'revision', texto: '2 mensajes por firmar' });
    expect(s!.destino).toMatch(/\/revision$/);
  });
});

describe('la primera semana (29-10)', () => {
  const senales = (ultimoRegistro: string | null) => ({
    calculadoEn: HOY, ultimoRegistro, registros14d: ultimoRegistro ? 1 : 0, perdidas14d: 0, ultimaRespuesta: null, tieneCuestionarios: true,
  });
  it('día 2 con algo registrado: dile que lo has visto', () => {
    const s = construirBandejaDelDia(entrada({ atletas: [atleta({ planPublishedAt: `${addDays(HOY, -1)}T10:00:00.000Z`, senales: senales(HOY) })] }))
      .find(x => x.id.includes('primera_'));
    expect(s).toMatchObject({ urgencia: 'hoy', categoria: 'setup', contacto: { motivo: 'primera_sesion', dias: 2 } });
  });
  it('día 3 sin registrar: escríbele, y no cuenta además como «apagándose»', () => {
    const s = construirBandejaDelDia(entrada({ atletas: [atleta({ planPublishedAt: `${addDays(HOY, -2)}T10:00:00.000Z`, senales: senales(addDays(HOY, -10)) })] }));
    expect(s.find(x => x.id.includes('primera_'))).toMatchObject({ contacto: { motivo: 'dia3_sin_registro', dias: 3 } });
    expect(s.filter(x => x.categoria === 'ausencia')).toHaveLength(0);
  });
});

describe('el primer mes (29-10)', () => {
  it('entre el día 28 y el 31 del plan recuerda grabar el hito', () => {
    const s = construirBandejaDelDia(entrada({ atletas: [atleta({ planPublishedAt: `${addDays(HOY, -27)}T10:00:00.000Z` })] })).find(x => x.id.endsWith('primer_mes'));
    expect(s).toMatchObject({ urgencia: 'hoy', texto: 'Primer mes cumplido (día 28): grábale un hito' });
    expect(construirBandejaDelDia(entrada({ atletas: [atleta({ planPublishedAt: `${addDays(HOY, -40)}T10:00:00.000Z` })] })).find(x => x.id.endsWith('primer_mes'))).toBeUndefined();
  });
});

describe('pausa o baja (29-10)', () => {
  const senales = { calculadoEn: HOY, ultimoRegistro: addDays(HOY, -16), registros14d: 0, perdidas14d: 2, ultimaRespuesta: null, tieneCuestionarios: true };
  const contacto = (fecha: string, motivo: string) => ({ id: `c_${fecha}`, athleteId: 'ana@x.com', fecha, motivo, canal: 'whatsapp' as const, createdAt: '' });
  it('dos semanas callado tras dos mensajes: decidir en el CRM', () => {
    const s = construirBandejaDelDia(entrada({ atletas: [atleta({ senales })], contactos: [contacto(addDays(HOY, -12), 'sin_registrar'), contacto(addDays(HOY, -5), 'sin_registrar')] }))
      .find(x => x.id.endsWith('pausa_o_baja'));
    expect(s).toMatchObject({ urgencia: 'hoy', categoria: 'renovacion', texto: '16 días callado tras 2 mensajes: ¿pausa o baja?' });
  });
  it('con un solo mensaje todavía no', () => {
    expect(construirBandejaDelDia(entrada({ atletas: [atleta({ senales })], contactos: [contacto(addDays(HOY, -5), 'sin_registrar')] })).find(x => x.id.endsWith('pausa_o_baja'))).toBeUndefined();
  });
});

describe('los últimos días del plan (tanda 8)', () => {
  it('con el plan a diez días o menos pide el siguiente paso', () => {
    const s = construirBandejaDelDia(entrada({ atletas: [atleta({ planStartDate: addDays(HOY, -83), planDurationMonths: 3 })] })).find(x => x.id.endsWith('plan_vence'));
    expect(s).toMatchObject({ urgencia: 'hoy', categoria: 'renovacion' });
    expect(s!.texto).toMatch(/^El plan termina en \d+ días: escríbele el siguiente paso$/);
    expect(construirBandejaDelDia(entrada({ atletas: [atleta({ planStartDate: addDays(HOY, -30), planDurationMonths: 3 })] })).find(x => x.id.endsWith('plan_vence'))).toBeUndefined();
  });
});

describe('sin fases ni peso meta (29-10, tarde)', () => {
  const programa = (phases: { targetWeight?: number }[]) => new Map([['ana@x.com', { athleteId: 'ana@x.com', startDate: '2026-08-01', phases } as unknown as NutritionProgram]]);
  const ids = (e: Partial<EntradaBandeja>) => construirBandejaDelDia(entrada({ checkins: [], ...e })).map(s => s.id);

  it('sin el mapa de programas no se calcula', () => {
    expect(ids({})).not.toContain('plan_ana@x.com_sin_fases');
  });
  it('con plan publicado hace una semana y sin programa: «sin fases», a Plan › Objetivo', () => {
    const s = construirBandejaDelDia(entrada({ checkins: [], programasPorEmail: new Map() })).find(x => x.id === 'plan_ana@x.com_sin_fases')!;
    expect(s).toMatchObject({ urgencia: 'hoy', categoria: 'plan', destino: '/clients/ana%40x.com/objetivo' });
  });
  it('con fases pero ninguna con peso meta: «sin peso meta»', () => {
    expect(ids({ programasPorEmail: programa([{}, {}]) })).toContain('plan_ana@x.com_sin_peso_meta');
  });
  it('con una fase con peso meta, nada; y los primeros 7 días con plan tampoco', () => {
    expect(ids({ programasPorEmail: programa([{ targetWeight: 80 }]) }).filter(i => /sin_fases|sin_peso_meta/.test(i))).toEqual([]);
    expect(ids({ atletas: [atleta({ planPublishedAt: addDays(HOY, -3) })], programasPorEmail: new Map() })).not.toContain('plan_ana@x.com_sin_fases');
  });
});

import { describe, it, expect } from 'vitest';
import { diaDePlan, fechaPrometidaPorDefecto, listaPrimeraSemana, senalPrimeraSemana, textoBienvenida, preguntasDelAltaParaWhatsApp } from './primeraSemana';

const HOY = '2026-10-29';
const perfil = (publicado: string | null, ultimoRegistro: string | null = null) => ({
  planPublishedAt: publicado ? `${publicado}T10:00:00.000Z` : undefined,
  senales: ultimoRegistro === null ? undefined : { calculadoEn: HOY, ultimoRegistro, registros14d: 1, perdidas14d: 0, ultimaRespuesta: null, tieneCuestionarios: true },
});

describe('diaDePlan y fecha prometida', () => {
  it('el día de publicación es el día 1', () => {
    expect(diaDePlan(perfil(HOY), HOY)).toBe(1);
    expect(diaDePlan(perfil('2026-10-27'), HOY)).toBe(3);
    expect(diaDePlan(perfil(null), HOY)).toBeNull();
  });
  it('por defecto, dos días tras el alta, nunca en el pasado', () => {
    expect(fechaPrometidaPorDefecto('2026-10-28T09:00:00.000Z', HOY)).toBe('2026-10-30');
    expect(fechaPrometidaPorDefecto('2026-10-01T09:00:00.000Z', HOY)).toBe(HOY);
  });
});

describe('listaPrimeraSemana', () => {
  it('solo durante los primeros 14 días con plan', () => {
    expect(listaPrimeraSemana({ profile: perfil(null), assignments: [], pesos: [], respuestas: [], hoy: HOY })).toBeNull();
    expect(listaPrimeraSemana({ profile: perfil('2026-10-01'), assignments: [], pesos: [], respuestas: [], hoy: HOY })).toBeNull();
  });
  it('marca lo hecho desde que tiene plan, no lo anterior', () => {
    const l = listaPrimeraSemana({
      profile: perfil('2026-10-27'),
      assignments: [{ date: '2026-10-20', status: 'completed' }, { date: '2026-10-28', status: 'completed' }],
      pesos: [{ date: '2026-10-10' }],
      respuestas: [{ submittedAt: '2026-10-28T18:00:00.000Z' }],
      hoy: HOY,
    })!;
    expect(l.map(i => [i.id, i.hecho])).toEqual([['sesion', true], ['peso', false], ['revision', true]]);
  });
});

describe('senalPrimeraSemana', () => {
  it('día 1-2 con algo registrado: dile que lo has visto', () => {
    expect(senalPrimeraSemana({ profile: perfil('2026-10-28', HOY), hoy: HOY })).toMatchObject({ dia: 2, motivo: 'primera_sesion' });
  });
  it('día 3 sin registrar: escríbele', () => {
    expect(senalPrimeraSemana({ profile: perfil('2026-10-27', '2026-10-20'), hoy: HOY })).toMatchObject({ dia: 3, motivo: 'dia3_sin_registro' });
    expect(senalPrimeraSemana({ profile: perfil('2026-10-27'), hoy: HOY })).toMatchObject({ dia: 3, motivo: 'dia3_sin_registro' });
  });
  it('día 3 registrando: nada que hacer; fuera de la semana, nada', () => {
    expect(senalPrimeraSemana({ profile: perfil('2026-10-27', '2026-10-28'), hoy: HOY })).toBeNull();
    expect(senalPrimeraSemana({ profile: perfil('2026-10-10'), hoy: HOY })).toBeNull();
  });
});

describe('textos', () => {
  it('bienvenida con nombre y días', () => {
    expect(textoBienvenida({ nombre: 'javier vergara', diasPorSemana: 4 })).toMatch(/^Bienvenido, Javier\. Ya tienes tu plan: 4 días de entreno/);
    expect(textoBienvenida({ nombre: '' })).toMatch(/^Ya tienes tu plan: tus entrenos/);
  });
  it('preguntas del alta: solo las abiertas, sin paréntesis, máximo cuatro', () => {
    const t = preguntasDelAltaParaWhatsApp('Ana', [
      { title: 'Confirmar material del gimnasio (he asumido gym completo)', done: false },
      { title: 'Días reales por semana', done: false },
      { title: 'Ya resuelta', done: true },
    ]);
    expect(t).toBe('Ana, para dejarte el plan bien montado me falta saber: 1) Confirmar material del gimnasio 2) Días reales por semana. Con eso lo cierro.');
    expect(preguntasDelAltaParaWhatsApp('Ana', [{ title: 'x', done: true }])).toBeNull();
  });
});

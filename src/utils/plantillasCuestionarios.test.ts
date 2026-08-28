import { describe, expect, it } from 'vitest';
import { PLANTILLAS, expandirPlantilla, planificarAsignaciones, totalOcurrencias, rangoDelBloque } from './plantillasCuestionarios';

const tpl = (clave: string) => PLANTILLAS.find(p => p.clave === clave)!;

describe('rangoDelBloque', () => {
  it('calcula el fin como inicio + semanas×7 días, inclusive', () => {
    expect(rangoDelBloque({ startDate: '2026-07-27', weeks: 6 })).toEqual({ inicio: '2026-07-27', fin: '2026-09-06' });
  });
});

describe('expandirPlantilla', () => {
  it('Hipertrofia · 6 sem sobre un bloque real de 6 semanas produce ocurrencias > 0 y ninguna fuera de rango', () => {
    const { inicio, fin } = rangoDelBloque({ startDate: '2026-07-27', weeks: 6 });
    const ocurrencias = expandirPlantilla(tpl('Hipertrofia · 6 sem'), inicio, fin);
    expect(ocurrencias.length).toBeGreaterThan(0);
    expect(ocurrencias.every(o => o.fecha >= inicio && o.fecha <= fin)).toBe(true);
  });

  it('una fila "evento" (sin patrón de calendario) no genera ninguna ocurrencia', () => {
    const { inicio, fin } = rangoDelBloque({ startDate: '2026-01-01', weeks: 7 });
    const ocurrencias = expandirPlantilla(tpl('Fuerza · 7 sem'), inicio, fin);
    expect(ocurrencias.some(o => o.fila.schedule.kind === 'evento')).toBe(false);
  });

  it('"día 1 y día 42" da exactamente esas dos fechas', () => {
    const { inicio, fin } = rangoDelBloque({ startDate: '2026-01-01', weeks: 6 }); // 42 días exactos
    const ocurrencias = expandirPlantilla(tpl('Hipertrofia · 6 sem'), inicio, fin)
      .filter(o => o.fila.etiqueta === 'Foto + medidas');
    expect(ocurrencias.map(o => o.fecha)).toEqual(['2026-01-01', '2026-02-11']);
  });

  it('"viernes de semanas 2, 4 y 6" da exactamente 3 fechas espaciadas 14 días', () => {
    const { inicio, fin } = rangoDelBloque({ startDate: '2026-01-05', weeks: 6 }); // lunes
    const ocurrencias = expandirPlantilla(tpl('Hipertrofia · 6 sem'), inicio, fin)
      .filter(o => o.fila.etiqueta === 'Agujetas tras pierna');
    expect(ocurrencias).toHaveLength(3);
    expect(ocurrencias.every(o => new Date(o.fecha + 'T00:00:00').getDay() === 5)).toBe(true);
    expect(new Date(ocurrencias[1].fecha).getTime() - new Date(ocurrencias[0].fecha).getTime()).toBe(14 * 86400000);
  });

  it('las 4 plantillas expanden sin lanzar y con al menos 1 ocurrencia sobre su bloque sugerido', () => {
    for (const p of PLANTILLAS) {
      const { inicio, fin } = rangoDelBloque({ startDate: '2026-01-05', weeks: p.semanasSugeridas });
      expect(expandirPlantilla(p, inicio, fin).length).toBeGreaterThan(0);
    }
  });
});

describe('totalOcurrencias', () => {
  it('coincide con el nº de filas devueltas por expandirPlantilla', () => {
    const { inicio, fin } = rangoDelBloque({ startDate: '2026-07-27', weeks: 6 });
    expect(totalOcurrencias(tpl('Hipertrofia · 6 sem'), inicio, fin)).toBe(expandirPlantilla(tpl('Hipertrofia · 6 sem'), inicio, fin).length);
  });
});

describe('planificarAsignaciones', () => {
  it('crea una asignación por fila expresable, ninguna para las de tipo "evento"', () => {
    const plantilla = tpl('Hipertrofia · 6 sem');
    const filasExpresables = plantilla.filas.filter(f => f.schedule.kind !== 'evento');
    const idsFalsos = new Map(filasExpresables.map(f => [f.cuestionarioTitulo, `id_${f.cuestionarioTitulo}`]));
    const asignaciones = planificarAsignaciones(plantilla, '2026-07-27', idsFalsos);
    // "Foto + medidas" (2 días) genera 2 asignaciones 'once' — el resto, 1 cada una.
    const nombresUnicos = new Set(filasExpresables.map(f => f.etiqueta));
    expect(new Set(asignaciones.map(a => a.fila.etiqueta))).toEqual(nombresUnicos);
    expect(asignaciones.filter(a => a.fila.etiqueta === 'Foto + medidas')).toHaveLength(2);
  });

  it('sin el id real del cuestionario, la fila se omite en vez de crear una asignación huérfana', () => {
    const plantilla = tpl('Descarga · 2 sem');
    const asignaciones = planificarAsignaciones(plantilla, '2026-11-02', new Map()); // mapa vacío
    expect(asignaciones).toHaveLength(0);
  });
});

describe('PLANTILLAS', () => {
  it('toda fila que no sea "evento" apunta a un título de cuestionario real (no vacío)', () => {
    for (const p of PLANTILLAS) {
      for (const f of p.filas) {
        if (f.schedule.kind === 'evento') { expect(f.cuestionarioTitulo).toBe(''); continue; }
        expect(f.cuestionarioTitulo.length).toBeGreaterThan(0);
      }
    }
  });
});

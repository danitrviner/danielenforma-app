import { describe, it, expect } from 'vitest';
import { BandaEntreno } from './roadmapCalendar';
import { construirCamino } from './caminoDelPlan';

// El fin se calcula en fecha LOCAL, no con `toISOString()`: en Madrid la
// medianoche local es el día anterior en UTC, así que la versión con
// `toISOString()` fabricaba bloques con un día de menos y las pruebas de
// borde pasaban por el motivo equivocado.
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function banda(id: string, inicio: string, semanas: number): BandaEntreno {
  const fin = new Date(inicio + 'T00:00:00');
  fin.setDate(fin.getDate() + semanas * 7 - 1);
  return {
    id, nombre: `Bloque ${id}`, tipo: 'hipertrofia', color: '#fff', icono: 'bolt',
    inicio, fin: isoLocal(fin), numero: 1, semanas,
  };
}

describe('construirCamino', () => {
  it('sin bandas no hay camino', () => {
    expect(construirCamino([], '2026-09-07')).toBeNull();
  });

  it('marca recorrido / actual / por recorrer', () => {
    const camino = construirCamino(
      [banda('a', '2026-01-05', 4), banda('b', '2026-02-02', 4), banda('c', '2026-03-02', 4)],
      '2026-02-09',
    )!;
    expect(camino.tramos.map(t => t.estado)).toEqual(['recorrido', 'actual', 'por-recorrer']);
    expect(camino.actual?.id).toBe('b');
    expect(camino.siguiente?.id).toBe('c');
    // 2026-02-09 es el lunes de la segunda semana del bloque b.
    expect(camino.actual?.semanaEnCurso).toBe(2);
  });

  it('el orden de entrada no importa', () => {
    const camino = construirCamino([banda('b', '2026-02-02', 4), banda('a', '2026-01-05', 4)], '2026-01-06')!;
    expect(camino.tramos.map(t => t.id)).toEqual(['a', 'b']);
    expect(camino.inicio).toBe('2026-01-05');
  });

  it('el total va de la primera a la última fecha, con huecos incluidos', () => {
    // Dos bloques de 4 semanas separados por 2 semanas de hueco = 10 semanas
    // de camino, no 8: si no, la barra se queda corta y el atleta ve que le
    // «faltan 0 semanas» dos semanas antes de tiempo.
    const camino = construirCamino([banda('a', '2026-01-05', 4), banda('b', '2026-02-16', 4)], '2026-01-05')!;
    expect(camino.semanasTotales).toBe(10);
  });

  it('antes de empezar el plan no cuenta semanas recorridas', () => {
    const camino = construirCamino([banda('a', '2026-06-01', 4)], '2026-05-20')!;
    expect(camino.aunNoEmpieza).toBe(true);
    expect(camino.semanasRecorridas).toBe(0);
    expect(camino.progresoPct).toBe(0);
    expect(camino.actual).toBeNull();
  });

  it('terminado el plan, todo recorrido y sin días restantes', () => {
    const camino = construirCamino([banda('a', '2026-01-05', 4)], '2026-05-20')!;
    expect(camino.tramos.every(t => t.estado === 'recorrido')).toBe(true);
    expect(camino.progresoPct).toBe(100);
    expect(camino.semanasRecorridas).toBe(camino.semanasTotales);
    expect(camino.diasRestantes).toBe(0);
  });
  it('el último día del bloque sigue siendo «actual», no «recorrido»', () => {
    // Borde de off-by-one: `hoy > b.fin` es lo que separa un estado del otro.
    // Cambiarlo por `>=` dejaría al atleta viendo «plan completado» el mismo
    // día en que todavía le queda la sesión por hacer.
    const b = banda('a', '2026-01-05', 4); // termina el 2026-02-01
    const enElFin = construirCamino([b], b.fin)!;
    expect(enElFin.tramos[0].estado).toBe('actual');
    expect(enElFin.tramos[0].progresoPct).toBe(100);
    const alDiaSiguiente = construirCamino([b], '2026-02-02')!;
    expect(alDiaSiguiente.tramos[0].estado).toBe('recorrido');
  });

  it('en el hueco entre dos bloques no hay bloque actual, pero el plan ya ha empezado', () => {
    // 'a' termina el 2026-02-01 y 'b' empieza el 2026-02-16: el 2026-02-09 el
    // atleta está DENTRO del plan y fuera de todo bloque. La cabecera no puede
    // decir «aún no empiezas» ni «plan completado».
    const camino = construirCamino([banda('a', '2026-01-05', 4), banda('b', '2026-02-16', 4)], '2026-02-09')!;
    expect(camino.actual).toBeNull();
    expect(camino.aunNoEmpieza).toBe(false);
    expect(camino.siguiente?.id).toBe('b');
    expect(camino.diasRestantes).toBeGreaterThan(0);
  });

  it('con bloques solapados manda el que empezó antes', () => {
    // El coach puede crear un mesociclo nuevo sin acortar el anterior. Los dos
    // salen como 'actual' en `tramos`, pero la cabecera enseña uno: el viejo.
    const camino = construirCamino([banda('a', '2026-01-05', 8), banda('b', '2026-02-02', 4)], '2026-02-09')!;
    expect(camino.tramos.filter(t => t.estado === 'actual').map(t => t.id)).toEqual(['a', 'b']);
    expect(camino.actual?.id).toBe('a');
  });

  it('un bloque de un solo día no divide por cero', () => {
    const unDia: BandaEntreno = { ...banda('a', '2026-03-10', 1), fin: '2026-03-10', semanas: 1 };
    const camino = construirCamino([unDia], '2026-03-10')!;
    expect(camino.tramos[0].progresoPct).toBe(100);
    expect(camino.progresoPct).toBe(100);
    expect(camino.semanasTotales).toBe(1);
  });

  it('el cambio de horario no roba ni regala un día', () => {
    // Última semana de marzo en Europa: el domingo dura 23 h. Sin el
    // `Math.round` de `diasEntre`, esta semana contaría como 6 días y el
    // progreso del bloque saldría corto justo la semana del cambio.
    const primavera = construirCamino([banda('a', '2026-03-23', 1)], '2026-03-29')!;
    expect(primavera.tramos[0].progresoPct).toBe(100);
    expect(primavera.semanasTotales).toBe(1);
    // Última semana de octubre: el domingo dura 25 h.
    const otono = construirCamino([banda('b', '2026-10-19', 1)], '2026-10-25')!;
    expect(otono.tramos[0].progresoPct).toBe(100);
    expect(otono.semanasTotales).toBe(1);
  });
});

import { describe, expect, it } from 'vitest'
import catalogoPrueba from './__fixtures__/catalogoPrueba.json'
import { crearMotor, expandirCatalogo, type CdgCatalogoCompacto } from './index'
import {
  semanasRealizadasDelMeso, cargaAgudaCronicaDelMeso, sesionesProgramadasDeLaSemana, rendimientoDelCiclo, type SemanaSeguimiento, semanaPorDefecto,
  semanasAnterioresAlBloque, semanaSinSesiones, tecnicaPautadaEnElBloque } from './integracion'
import type { WorkoutExercise, WorkoutLog } from '../../types'

const motor = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto))
const BULG = 'Sentadilla búlgara con mancuernas (dominante rodilla) - Cuádriceps, aductores, glúteo'
const nombreCdgDe = (id: string) => (id === 'bulg' ? BULG : undefined)
const meso = { id: 'm1', startDate: '2026-01-05', semanasDescarga: undefined as number[] | undefined } // lunes
const sesionDeWorkout = (w: string) => ({ w0: 0, w1: 1 } as Record<string, number>)[w]

const log = (date: string, workoutId: string, kg: number, reps = 10, rir = 2): WorkoutLog => ({
  id: `${date}-${workoutId}`, athleteId: 'a@a.com', workoutId, assignmentId: 'x', mesocycleId: 'm1',
  date, completedAt: date, entries: [{ exerciseId: 'bulg', sets: [{ weight: kg, repsDone: reps, rir }, { weight: kg, repsDone: reps, rir }] }]
} as unknown as WorkoutLog)

const base = { meso, cicloDias: 7, vueltas: 8, sesionDeWorkout, nombreCdgDe, motor }

describe('semanasRealizadasDelMeso', () => {
  it('agrupa por semana de ciclo y por Workout.dayIndex, y calcula Gestión y rendimiento al vuelo', () => {
    const logs = [log('2026-01-05', 'w0', 20), log('2026-01-06', 'w1', 20), log('2026-01-12', 'w0', 25)]
    const { semanas, descartados } = semanasRealizadasDelMeso({ ...base, logs })
    expect(semanas.map(s => s.semana)).toEqual([1, 2])
    expect(semanas[0].logs).toBe(2)
    expect(semanas[0].realizada[0]).toHaveLength(1) // sesión 1
    expect(semanas[0].realizada[1]).toHaveLength(1) // sesión 2
    expect(semanas[0].gestion.at(-1)?.sesion).toBe('Total')
    expect(semanas[0].gestion.at(-1)!.IF).toBeGreaterThan(0)
    expect(semanas[1].rendimiento[0].rm).toBeGreaterThan(semanas[0].rendimiento[0].rm)
    expect(descartados).toEqual({ sinSesion: 0, fueraDeSemana: 0 })
  })

  it('cuenta lo que no puede colocar en vez de perderlo en silencio', () => {
    const logs = [log('2026-01-05', 'sin-dia', 20), log('2025-12-01', 'w0', 20), { ...log('2026-01-05', 'w0', 20), mesocycleId: 'otro' } as WorkoutLog]
    const { semanas, descartados } = semanasRealizadasDelMeso({ ...base, logs })
    expect(semanas).toHaveLength(0)
    expect(descartados).toEqual({ sinSesion: 1, fueraDeSemana: 1 })
  })

  it('serie a peso corporal (0 kg) no cuenta, como en la hoja', () => {
    const { semanas } = semanasRealizadasDelMeso({ ...base, logs: [log('2026-01-05', 'w0', 0)] })
    expect(semanas).toHaveLength(1) // la sesión existe…
    expect(semanas[0].realizada.flat()).toHaveLength(0) // …pero sin series contables
    expect(semanas[0].calculo.IF.every(v => v === 0)).toBe(true)
  })
})

describe('cargaAgudaCronicaDelMeso', () => {
  const grupos = [{ dayIndex: 0, exercises: [{ exerciseId: 'bulg', order: 0, sets: 3, reps: '10', restSeconds: 90, rir: 2 } as WorkoutExercise] }]
  const semana = (n: number): SemanaSeguimiento => {
    const { semanas } = semanasRealizadasDelMeso({ ...base, logs: [log(`2026-01-${String(5 + (n - 1) * 7).padStart(2, '0')}`, 'w0', 20)] })
    return { ...semanas[0], semana: n }
  }

  it('con menos de 6 semanas no hay cálculo y lo dice', () => {
    const r = cargaAgudaCronicaDelMeso({ motor, semanas: [semana(1), semana(2)], grupos, meso, vueltas: 8, nombreCdgDe })
    expect(r.disponible).toBe(false)
    expect('motivo' in r && r.motivo).toContain('hay 2')
  })

  it('con 6 semanas compara lo programado de la siguiente con la media de las 6', () => {
    const semanas = [1, 2, 3, 4, 5, 6].map(semana)
    const r = cargaAgudaCronicaDelMeso({ motor, semanas, grupos, meso, vueltas: 8, nombreCdgDe, umbrales: { superior: 1.1 } })
    expect(r.disponible).toBe(true)
    if (r.disponible) {
      expect(r.semanaReferencia).toBe(7)
      expect(r.semanasUsadas).toEqual([6, 5, 4, 3, 2, 1])
      expect(r.ac.IF[7]).toBeGreaterThan(0)
      expect(r.avisos.sesionesIF).toHaveLength(8)
    }
  })

  it('la semana en curso no entra en la crónica aunque tenga sesiones', () => {
    const semanas = [1, 2, 3, 4, 5, 6, 7].map(semana)
    const r = cargaAgudaCronicaDelMeso({ motor, semanas, grupos, meso, vueltas: 8, nombreCdgDe, semanaEnCurso: 7 })
    expect(r.disponible).toBe(true)
    if (r.disponible) {
      expect(r.semanaReferencia).toBe(8)
      expect(r.semanasUsadas).toEqual([6, 5, 4, 3, 2, 1])
    }
  })

  it('con semana de referencia elegida, la crónica son las realizadas antes de esa semana', () => {
    const semanas = [1, 2, 3, 4, 5, 6].map(semana)
    const r = cargaAgudaCronicaDelMeso({ motor, semanas, grupos, meso, vueltas: 8, nombreCdgDe, semanaReferencia: 4 })
    expect(r.disponible).toBe(true)
    if (r.disponible) {
      expect(r.semanaReferencia).toBe(4)
      expect(r.semanasUsadas).toEqual([3, 2, 1])
      expect(r.fiable).toBe(false)
    }
  })

  it('F15 · las semanas de descarga y de puente no entran en la crónica', () => {
    const semanas = [1, 2, 3, 4, 5, 6, 7, 8].map(semana)
    const r = cargaAgudaCronicaDelMeso({
      motor, semanas, grupos, meso: { ...meso, semanasDescarga: [4], semanasPivot: [7] }, vueltas: 10, nombreCdgDe,
    })
    expect(r.disponible).toBe(true)
    if (r.disponible) {
      expect(r.semanaReferencia).toBe(9)
      expect(r.semanasUsadas).toEqual([8, 6, 5, 3, 2, 1])
      expect(r.semanasRecortadas).toEqual([4, 7])
      expect(r.referenciaRecortada).toBeNull()
    }
  })

  it('F15 · si al quitarlas no quedan tres semanas, lo dice con el motivo', () => {
    const r = cargaAgudaCronicaDelMeso({
      motor, semanas: [1, 2, 3].map(semana), grupos, meso: { ...meso, semanasDescarga: [3] }, vueltas: 8, nombreCdgDe,
    })
    expect(r.disponible).toBe(false)
    expect('motivo' in r && r.motivo).toContain('hay 2')
    expect('motivo' in r && r.motivo).toContain('S3')
  })

  it('F15 · una descarga programada no da el aviso «por debajo»; la misma bajada en semana normal, sí', () => {
    const semanas = [1, 2, 3, 4, 5, 6].map(semana)
    // Semana normal con una sola serie programada: muy por debajo de la media.
    const una = [{ dayIndex: 0, exercises: [{ ...grupos[0].exercises[0], sets: 1 }] }]
    const normal = cargaAgudaCronicaDelMeso({ motor, semanas, grupos: una, meso, vueltas: 8, nombreCdgDe })
    expect(normal.disponible && normal.avisos.sesionesIF[7].fuera).toBe(true)
    expect(normal.disponible && normal.avisos.musculos.length).toBeGreaterThan(0)
    // Lo mismo, pero porque la S7 es de descarga (2 series → 1).
    const dos = [{ dayIndex: 0, exercises: [{ ...grupos[0].exercises[0], sets: 2 }] }]
    const descarga = cargaAgudaCronicaDelMeso({ motor, semanas, grupos: dos, meso: { ...meso, semanasDescarga: [7] }, vueltas: 8, nombreCdgDe })
    expect(descarga.disponible).toBe(true)
    if (descarga.disponible) {
      expect(descarga.referenciaRecortada).toBe('descarga')
      expect(descarga.ac.IF[7]).toBeLessThan(0.8)
      expect(descarga.avisos.sesionesIF[7].fuera).toBe(false)
      expect(descarga.avisos.musculos).toEqual([])
      expect(descarga.avisos.articulaciones).toEqual([])
    }
  })

  it('F15 · un ejercicio que estrena músculo sale como zona nueva, no como ratio 1 callado', () => {
    const CURL = 'Curl de bíceps en polea - Bíceps'
    const conCurl = [{ dayIndex: 0, exercises: [grupos[0].exercises[0], { exerciseId: 'curl', order: 1, sets: 3, reps: '10', restSeconds: 90, rir: 2 } as WorkoutExercise] }]
    const r = cargaAgudaCronicaDelMeso({
      motor, semanas: [1, 2, 3, 4, 5, 6].map(semana), grupos: conCurl, meso, vueltas: 8,
      nombreCdgDe: id => (id === 'curl' ? CURL : nombreCdgDe(id)),
    })
    expect(r.disponible).toBe(true)
    if (r.disponible) {
      const nuevos = r.avisos.nuevos.filter(n => n.tipo === 'musculo').map(n => n.nombre)
      expect(nuevos.length).toBeGreaterThan(0)
      expect(nuevos.every(n => /codo|b[ií]ceps|antebrazo/i.test(n))).toBe(true)
      expect(r.avisos.nuevos.every(n => n.sesion === 'Total de sesiones' && n.aguda > 0)).toBe(true)
      // Lo que ya entrenaba (cuádriceps, glúteo…) no es nuevo.
      expect(nuevos.some(n => /cu[aá]driceps|gl[uú]teo/i.test(n))).toBe(false)
    }
  })

  it('en Base (semana 0) no hay nada que comparar', () => {
    const r = cargaAgudaCronicaDelMeso({ motor, semanas: [1, 2, 3].map(semana), grupos, meso, vueltas: 8, nombreCdgDe, semanaReferencia: 0 })
    expect(r.disponible).toBe(false)
  })

  it('sin semana siguiente en el bloque, lo dice', () => {
    const r = cargaAgudaCronicaDelMeso({ motor, semanas: [semana(8)], grupos, meso, vueltas: 8, nombreCdgDe })
    expect(r.disponible).toBe(false)
  })
})

describe('sesiones programadas y rendimiento del ciclo', () => {
  it('coloca cada día en su hueco 0-6 y resuelve la descarga', () => {
    const we = { exerciseId: 'bulg', order: 0, sets: 4, reps: '10', restSeconds: 90, rir: 2 } as WorkoutExercise
    const s = sesionesProgramadasDeLaSemana([{ dayIndex: 2, exercises: [we] }], { semanasDescarga: [3] }, 3)
    expect(s[2][0].sets).toBe(2)
    expect(s[0]).toEqual([])
  })

  it('mejora del ciclo por ejercicio y por categoría', () => {
    const { semanas } = semanasRealizadasDelMeso({ ...base, logs: [log('2026-01-05', 'w0', 20), log('2026-01-12', 'w0', 30)] })
    // El fixture no trae categoría; el catálogo real sí (Empuje, Tracción, Brazo, Pierna, Cadera…).
    const conCategoria = crearMotor(expandirCatalogo(catalogoPrueba as CdgCatalogoCompacto).map(e => ({ ...e, category: 'Pierna' })))
    const r = rendimientoDelCiclo(conCategoria, semanas)
    expect(r.incrementos[0].incremento).toBeGreaterThan(0)
    expect(r.categorias.map(c => c.categoria)).toEqual(['Pierna'])
  })
})

describe('semanaPorDefecto', () => {
  const sem = (semana: number, logs: number) => ({ semana, logs })
  it('elige la última semana con todas las sesiones del ciclo', () => {
    expect(semanaPorDefecto([sem(1, 4), sem(2, 4), sem(3, 1)], 4)?.semana).toBe(2)
  })
  it('si ninguna está completa, la última', () => {
    expect(semanaPorDefecto([sem(1, 2), sem(2, 1)], 4)?.semana).toBe(2)
  })
  it('sin semanas no hay semana', () => {
    expect(semanaPorDefecto([], 4)).toBeUndefined()
  })
})

describe('F15 · lo realizado lleva las técnicas apuntadas', () => {
  const lunes = (n: number) => `2026-01-${String(5 + (n - 1) * 7).padStart(2, '0')}`
  // 3 series de 10 a RIR 2 y, tras la última, una bajada apuntada con menos kg.
  const conBajada = (date: string, bajada = true): WorkoutLog => ({
    id: date, athleteId: 'a@a.com', workoutId: 'w0', assignmentId: 'x', mesocycleId: 'm1', date, completedAt: date,
    entries: [{ exerciseId: 'bulg', sets: [
      { weight: 20, repsDone: 10, rir: 2 }, { weight: 20, repsDone: 10, rir: 2 }, { weight: 20, repsDone: 10, rir: 2 },
      ...(bajada ? [{ weight: 16, repsDone: 8, rir: 0, segmento: true, segmentoDe: 3 }] : []),
    ] }]
  } as unknown as WorkoutLog)
  const grupos = [{ dayIndex: 0, exercises: [{ exerciseId: 'bulg', order: 0, sets: 3, reps: '10', restSeconds: 90, rir: 2, technique: 'dropset' } as WorkoutExercise] }]
  const total = (n: number[]) => n.reduce((a, b) => a + b, 0)

  it('la serie con bajadas apuntadas cuenta con su técnica: la semana sube frente a la misma sin apuntarlas', () => {
    const con = semanasRealizadasDelMeso({ ...base, grupos, logs: [conBajada(lunes(1))] }).semanas[0]
    const sin = semanasRealizadasDelMeso({ ...base, grupos, logs: [conBajada(lunes(1), false)] }).semanas[0]
    expect(con.realizada[0][0].map(x => x.intensification)).toEqual(['', '', 'Drop 1'])
    expect(sin.realizada[0][0].map(x => x.intensification)).toEqual(['', '', ''])
    expect(total(con.calculo.IF)).toBeGreaterThan(total(sin.calculo.IF))
  })

  it('con la técnica hecha, lo programado y lo realizado dan ratio 1; sin apuntarla, por encima', () => {
    const ratio = (bajada: boolean) => {
      const { semanas } = semanasRealizadasDelMeso({ ...base, grupos, logs: [1, 2, 3, 4, 5, 6].map(n => conBajada(lunes(n), bajada)) })
      const r = cargaAgudaCronicaDelMeso({ motor, semanas, grupos, meso, vueltas: 8, nombreCdgDe })
      return r.disponible ? r.ac.IF[7] : NaN
    }
    expect(ratio(true)).toBeCloseTo(1, 6)
    expect(ratio(false)).toBeGreaterThan(1.05)
  })

  it('la técnica pautada sale de lo programado esa semana, y de otra sesión si no está en la suya', () => {
    expect(tecnicaPautadaEnElBloque(grupos, meso, 1, 0, 'bulg')).toBe('dropset')
    expect(tecnicaPautadaEnElBloque(grupos, meso, 1, 3, 'bulg')).toBe('dropset')
    expect(tecnicaPautadaEnElBloque(grupos, meso, 1, 0, 'otro')).toBeUndefined()
    const sinTecnica = [{ dayIndex: 0, exercises: [{ ...grupos[0].exercises[0], technique: undefined }] }]
    expect(tecnicaPautadaEnElBloque(sinTecnica, meso, 1, 0, 'bulg')).toBeNull()
  })

  it('sin lo programado, la técnica se deduce del peso de la bajada', () => {
    const { semanas } = semanasRealizadasDelMeso({ ...base, logs: [conBajada(lunes(1))] })
    expect(semanas[0].realizada[0][0].at(-1)?.intensification).toBe('Drop 1')
  })
})

describe('F15 · las semanas sin sesiones cuentan como cero dentro del bloque', () => {
  const grupos = [{ dayIndex: 0, exercises: [{ exerciseId: 'bulg', order: 0, sets: 3, reps: '10', restSeconds: 90, rir: 2 } as WorkoutExercise] }]
  const lunes = (n: number) => `2026-01-${String(5 + (n - 1) * 7).padStart(2, '0')}`
  const semana = (n: number): SemanaSeguimiento => ({ ...semanasRealizadasDelMeso({ ...base, logs: [log(lunes(1), 'w0', 20)] }).semanas[0], semana: n })
  const args = { motor, grupos, meso, vueltas: 10, nombreCdgDe }

  it('una semana de vacaciones entre dos realizadas baja la crónica', () => {
    const con = cargaAgudaCronicaDelMeso({ ...args, semanas: [1, 2, 3, 4, 5, 6].map(semana), semanaEnCurso: 7 })
    const hueco = cargaAgudaCronicaDelMeso({ ...args, semanas: [1, 2, 3, 5, 6].map(semana), semanaEnCurso: 7 })
    expect(hueco.disponible && hueco.semanasUsadas).toEqual([6, 5, 4, 3, 2, 1])
    expect(hueco.disponible && hueco.semanasVacias).toEqual([4])
    if (con.disponible && hueco.disponible) {
      expect(hueco.ac.cronica.IF[7]).toBeCloseTo(con.ac.cronica.IF[7] * 5 / 6, 6)
      expect(hueco.ac.IF[7]).toBeGreaterThan(con.ac.IF[7])
    }
  })

  it('sin saber la semana en curso, solo cuentan los huecos anteriores a la última realizada', () => {
    const r = cargaAgudaCronicaDelMeso({ ...args, semanas: [1, 2, 3, 5, 6].map(semana) })
    expect(r.disponible && r.semanaReferencia).toBe(7)
    expect(r.disponible && r.semanasVacias).toEqual([4])
  })

  it('las semanas que aún no han llegado no son ceros; las pasadas, sí', () => {
    const futuras = cargaAgudaCronicaDelMeso({ ...args, semanas: [1, 2, 3].map(semana), semanaReferencia: 6, semanaEnCurso: 4 })
    expect(futuras.disponible && futuras.semanasUsadas).toEqual([3, 2, 1])
    expect(futuras.disponible && futuras.semanasVacias).toEqual([])
    const pasadas = cargaAgudaCronicaDelMeso({ ...args, semanas: [1, 2, 3].map(semana), semanaReferencia: 6, semanaEnCurso: 6 })
    expect(pasadas.disponible && pasadas.semanasUsadas).toEqual([5, 4, 3, 2, 1])
    expect(pasadas.disponible && pasadas.semanasVacias).toEqual([4, 5])
  })

  it('las anteriores a la primera sesión del bloque solo cuentan si el atleta ya tenía registros', () => {
    const nuevo = cargaAgudaCronicaDelMeso({ ...args, semanas: [3, 4, 5].map(semana), semanaEnCurso: 6 })
    expect(nuevo.disponible && nuevo.semanasUsadas).toEqual([5, 4, 3])
    expect(nuevo.disponible && nuevo.semanasVacias).toEqual([])
    const veterano = cargaAgudaCronicaDelMeso({ ...args, semanas: [3, 4, 5].map(semana), semanaEnCurso: 6, semanasAnteriores: [semana(1).calculo] })
    expect(veterano.disponible && veterano.semanasUsadas).toEqual([5, 4, 3, 2, 1])
    expect(veterano.disponible && veterano.semanasVacias).toEqual([1, 2])
    expect(veterano.disponible && veterano.semanasDeOtrosBloques).toBe(1)
  })

  it('una descarga sin sesiones sigue fuera: ni cero ni recortada', () => {
    const r = cargaAgudaCronicaDelMeso({ ...args, meso: { ...meso, semanasDescarga: [4] }, semanas: [1, 2, 3, 5, 6].map(semana), semanaEnCurso: 7 })
    expect(r.disponible && r.semanasUsadas).toEqual([6, 5, 3, 2, 1])
    expect(r.disponible && r.semanasVacias).toEqual([])
  })

  it('en bloques anteriores, el hueco entre dos sesiones del mismo bloque es un cero; el resto se salta', () => {
    const de = (date: string, mesocycleId: string) => ({ ...log(date, 'w0', 20), mesocycleId }) as WorkoutLog
    const comun = { inicio: '2026-01-05', motor, nombreCdgDe }
    // m0 entrenó la semana del 15-12 y la del 29-12: la del 22-12 fue un parón DENTRO del bloque.
    const dentro = semanasAnterioresAlBloque({ ...comun, logs: [de('2025-12-16', 'm0'), de('2025-12-30', 'm0')] })
    expect(dentro).toHaveLength(3)
    expect(dentro[1]).toEqual(semanaSinSesiones(motor))
    expect(dentro[0].IF[0]).toBeGreaterThan(0)
    // Mismas fechas, bloques distintos: el hueco queda ENTRE bloques y no se sabe si entrenaba.
    expect(semanasAnterioresAlBloque({ ...comun, logs: [de('2025-12-16', 'm0'), de('2025-12-30', 'mA')] })).toHaveLength(2)
    // Antes del primer registro y entre el último y el inicio de este bloque: nada.
    expect(semanasAnterioresAlBloque({ ...comun, logs: [de('2025-12-16', 'm0')] })).toHaveLength(1)
  })
})

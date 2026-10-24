import { describe, it, expect } from 'vitest'
import { agujetasVigentes, UMBRALES_PROTOCOLO, contextoDeLaSemana } from './agujetas'

describe('E-09 · agujetas vigentes y umbrales', () => {
  it('solo cuentan las agujetas de los últimos 7 días', () => {
    expect(agujetasVigentes('2026-10-20', '2026-10-23')).toBe(true)
    expect(agujetasVigentes('2026-10-16', '2026-10-23')).toBe(true)
    expect(agujetasVigentes('2026-10-15', '2026-10-23')).toBe(false)
    expect(agujetasVigentes('2026-10-24', '2026-10-23')).toBe(false)
    expect(agujetasVigentes('2026-10-20T18:00:00.000Z', '2026-10-23')).toBe(true)
  })

  it('los umbrales siguen marcados como pendientes de validar y mandan en el contexto', () => {
    expect(UMBRALES_PROTOCOLO.validados).toBe(false)
    expect(contextoDeLaSemana({ estres: UMBRALES_PROTOCOLO.estresMalo }).contexto).toBe('desfavorable')
    expect(contextoDeLaSemana({ estres: UMBRALES_PROTOCOLO.estresMalo - 1 }).contexto).toBe('neutro')
  })
})

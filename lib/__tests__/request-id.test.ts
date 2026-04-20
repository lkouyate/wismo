import { describe, it, expect } from 'vitest'
import { generateRequestId } from '@/lib/request-id'

describe('generateRequestId', () => {
  it('starts with wismo- prefix', () => {
    expect(generateRequestId()).toMatch(/^wismo-/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()))
    expect(ids.size).toBe(100)
  })

  it('contains a timestamp', () => {
    const id = generateRequestId()
    const parts = id.split('-')
    const timestamp = Number(parts[1])
    expect(timestamp).toBeGreaterThan(Date.now() - 5000)
    expect(timestamp).toBeLessThanOrEqual(Date.now())
  })
})

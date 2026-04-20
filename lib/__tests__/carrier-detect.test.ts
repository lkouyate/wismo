import { describe, it, expect } from 'vitest'
import { detectCarrier } from '@/lib/carriers/detect'

describe('detectCarrier', () => {
  it('detects UPS 1Z tracking numbers', () => {
    expect(detectCarrier('1Z999AA10123456784')).toBe('ups')
    expect(detectCarrier('1z999aa10123456784')).toBe('ups') // case insensitive
  })

  it('detects UPS freight', () => {
    expect(detectCarrier('T1234567890')).toBe('ups')
  })

  it('detects FedEx Express (12 digits)', () => {
    expect(detectCarrier('123456789012')).toBe('fedex')
  })

  it('detects FedEx Ground (15 digits)', () => {
    expect(detectCarrier('123456789012345')).toBe('fedex')
  })

  it('detects USPS with ZIP prefix', () => {
    // 420 + 5-digit ZIP + 91 + 20 digits = 30 chars
    expect(detectCarrier('420123459112345678901234567890')).toBe('usps')
  })

  it('detects USPS international', () => {
    expect(detectCarrier('RR123456789US')).toBe('usps')
  })

  it('detects DHL Express (10 digits)', () => {
    expect(detectCarrier('1234567890')).toBe('dhl')
  })

  it('returns unknown for unrecognized formats', () => {
    expect(detectCarrier('ABCXYZ')).toBe('unknown')
    expect(detectCarrier('')).toBe('unknown')
  })

  it('trims whitespace', () => {
    expect(detectCarrier('  1Z999AA10123456784  ')).toBe('ups')
  })
})

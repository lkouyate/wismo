import { describe, it, expect, vi, beforeEach } from 'vitest'

// Import the class directly to create isolated instances
// The module exports shared singletons, so we'll test the pattern via fresh instances
describe('CircuitBreaker', () => {
  // Re-import each time to get the class behavior
  let CircuitBreaker: typeof import('@/lib/circuit-breaker')

  beforeEach(async () => {
    CircuitBreaker = await import('@/lib/circuit-breaker')
  })

  it('passes through calls when closed', async () => {
    const breaker = CircuitBreaker.katanaCircuit
    // Reset state by succeeding
    await breaker.call(() => Promise.resolve('ok'))
    const result = await breaker.call(() => Promise.resolve(42))
    expect(result).toBe(42)
  })

  it('returns null when circuit is open', async () => {
    // We test with the exported instance pattern by creating failures
    // katanaCircuit has threshold=5, so we need 5 failures
    const { katanaCircuit } = CircuitBreaker

    // Force 5 failures to open the circuit
    for (let i = 0; i < 5; i++) {
      try {
        await katanaCircuit.call(() => Promise.reject(new Error('fail')))
      } catch {
        // expected
      }
    }

    // Now the circuit should be open
    expect(katanaCircuit.getState()).toBe('open')
    const result = await katanaCircuit.call(() => Promise.resolve('should not run'))
    expect(result).toBeNull()
  })
})

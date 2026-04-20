/**
 * Circuit breaker to prevent cascading failures when external services are down.
 *
 * States:
 *   CLOSED  → normal operation, requests pass through
 *   OPEN    → service is down, requests fail immediately (skip the call)
 *   HALF_OPEN → testing if service recovered (allow 1 request through)
 *
 * Opens after `threshold` consecutive failures.
 * Stays open for `resetTimeoutMs`, then transitions to half-open.
 */

type CircuitState = 'closed' | 'open' | 'half_open'

interface CircuitBreakerOptions {
  threshold?: number
  resetTimeoutMs?: number
}

class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount = 0
  private lastFailureTime = 0
  private readonly threshold: number
  private readonly resetTimeoutMs: number
  readonly name: string

  constructor(name: string, opts: CircuitBreakerOptions = {}) {
    this.name = name
    this.threshold = opts.threshold ?? 5
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000
  }

  async call<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'half_open'
      } else {
        return null // Skip call — service is down
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      if ((this.state as CircuitState) === 'open') return null // Just opened — return null
      throw err
    }
  }

  private onSuccess() {
    this.failureCount = 0
    this.state = 'closed'
  }

  private onFailure() {
    this.failureCount++
    this.lastFailureTime = Date.now()
    if (this.failureCount >= this.threshold) {
      this.state = 'open'
    }
  }

  getState(): CircuitState { return this.state }
}

// Shared circuit breaker instances per external service
export const katanaCircuit = new CircuitBreaker('katana')
export const upsCircuit = new CircuitBreaker('ups')
export const qboCircuit = new CircuitBreaker('quickbooks')
export const gmailCircuit = new CircuitBreaker('gmail')

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('CSRF', () => {
  beforeEach(() => {
    process.env.CSRF_SECRET = 'test-csrf-secret-key'
  })

  it('generates and validates a token', async () => {
    const { generateCsrfToken, validateCsrfToken } = await import('@/lib/csrf')
    const token = generateCsrfToken()
    expect(validateCsrfToken(token)).toBe(true)
  })

  it('rejects tampered tokens', async () => {
    const { generateCsrfToken, validateCsrfToken } = await import('@/lib/csrf')
    const token = generateCsrfToken()
    const tampered = token.slice(0, -4) + 'xxxx'
    expect(validateCsrfToken(tampered)).toBe(false)
  })

  it('rejects malformed tokens', async () => {
    const { validateCsrfToken } = await import('@/lib/csrf')
    expect(validateCsrfToken('not-a-token')).toBe(false)
    expect(validateCsrfToken('')).toBe(false)
  })

  it('rejects expired tokens', async () => {
    const { generateCsrfToken, validateCsrfToken } = await import('@/lib/csrf')
    const token = generateCsrfToken()
    // Validate with a 0ms max age — should be expired immediately
    expect(validateCsrfToken(token, 0)).toBe(false)
  })
})

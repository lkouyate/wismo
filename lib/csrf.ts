import { randomBytes, createHmac } from 'crypto'

const CSRF_SECRET = process.env.CSRF_SECRET ?? process.env.CRON_SECRET ?? 'wismo-csrf-fallback'

/**
 * Generate a CSRF token (server-side).
 * Token = timestamp.signature
 */
export function generateCsrfToken(): string {
  const timestamp = Date.now().toString(36)
  const nonce = randomBytes(8).toString('hex')
  const payload = `${timestamp}.${nonce}`
  const sig = createHmac('sha256', CSRF_SECRET).update(payload).digest('hex').slice(0, 16)
  return `${payload}.${sig}`
}

/**
 * Validate a CSRF token (server-side).
 * Checks signature and that token is not older than maxAgeMs (default 1 hour).
 */
export function validateCsrfToken(token: string, maxAgeMs = 3600000): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [timestamp, nonce, sig] = parts
  const payload = `${timestamp}.${nonce}`
  const expectedSig = createHmac('sha256', CSRF_SECRET).update(payload).digest('hex').slice(0, 16)
  if (sig !== expectedSig) return false
  const age = Date.now() - parseInt(timestamp, 36)
  return age >= 0 && age < maxAgeMs
}

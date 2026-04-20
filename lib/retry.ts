/**
 * Retry with exponential backoff for transient errors.
 * Permanent errors (400, 401, 403, 404) fail immediately.
 */

const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    // Network errors
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return true
    if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) return true
    if (err.message.includes('fetch failed')) return true
    // HTTP status codes embedded in error messages
    for (const code of TRANSIENT_STATUS_CODES) {
      if (err.message.includes(String(code))) return true
    }
  }
  return false
}

interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  onRetry?: (attempt: number, error: unknown) => void
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, onRetry } = opts
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === maxRetries || !isTransientError(err)) throw err
      const delay = baseDelayMs * Math.pow(4, attempt) // 1s → 4s → 16s
      onRetry?.(attempt + 1, err)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Simple in-memory sliding-window rate limiter.
 * Returns { allowed, retryAfterMs } for a given key.
 *
 * Note: This is per-instance (not shared across serverless cold starts).
 * For distributed rate limiting, swap the Map for Redis/Upstash.
 */

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Clean up stale entries periodically (every 60s)
let lastCleanup = Date.now()
function cleanup(windowMs: number) {
  if (Date.now() - lastCleanup < 60_000) return
  lastCleanup = Date.now()
  const cutoff = Date.now() - windowMs
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff)
    if (entry.timestamps.length === 0) store.delete(key)
  }
}

interface RateLimitOptions {
  windowMs?: number  // Window size in ms (default: 60s)
  maxRequests?: number // Max requests per window (default: 60)
}

export function checkRateLimit(
  key: string,
  opts: RateLimitOptions = {}
): { allowed: boolean; retryAfterMs?: number } {
  const { windowMs = 60_000, maxRequests = 60 } = opts

  cleanup(windowMs)

  const now = Date.now()
  const cutoff = now - windowMs
  const entry = store.get(key) ?? { timestamps: [] }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter(t => t > cutoff)

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0]
    const retryAfterMs = oldestInWindow + windowMs - now
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) }
  }

  entry.timestamps.push(now)
  store.set(key, entry)
  return { allowed: true }
}

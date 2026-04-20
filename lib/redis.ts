/**
 * Upstash Redis client with graceful fallback to in-memory cache.
 *
 * Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable Redis.
 * If not configured, falls back to a process-level Map (per-instance, not distributed).
 */

import { Redis } from '@upstash/redis'

const redisUrl = process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

const redis: Redis | null =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null

// In-memory fallback
const memCache = new Map<string, { value: string; expiresAt: number }>()

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (redis) {
    return redis.get<T>(key)
  }
  const entry = memCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key)
    return null
  }
  return JSON.parse(entry.value) as T
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (redis) {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds })
    return
  }
  memCache.set(key, {
    value: JSON.stringify(value),
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

export async function cacheDel(key: string): Promise<void> {
  if (redis) {
    await redis.del(key)
    return
  }
  memCache.delete(key)
}

/**
 * Sliding-window rate limiter backed by Redis (or in-memory fallback).
 * Returns { allowed, retryAfterMs }.
 */
export async function rateLimitCheck(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  if (!redis) {
    // Fall back to existing in-memory rate limiter
    const { checkRateLimit } = await import('@/lib/rate-limit')
    return checkRateLimit(key, { windowMs, maxRequests })
  }

  const now = Date.now()
  const windowKey = `rl:${key}`
  const windowStart = now - windowMs

  // Use a sorted set: score = timestamp, member = unique id
  const pipeline = redis.pipeline()
  pipeline.zremrangebyscore(windowKey, 0, windowStart)
  pipeline.zcard(windowKey)
  pipeline.zadd(windowKey, { score: now, member: `${now}-${Math.random()}` })
  pipeline.pexpire(windowKey, windowMs)

  const results = await pipeline.exec()
  const count = results[1] as number

  if (count >= maxRequests) {
    return { allowed: false, retryAfterMs: windowMs }
  }
  return { allowed: true }
}

export { redis }

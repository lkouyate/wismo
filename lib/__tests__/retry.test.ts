import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '@/lib/retry'

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(() => Promise.resolve(42))
    expect(result).toBe(42)
  })

  it('retries on transient errors and succeeds', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      if (calls < 3) throw new Error('fetch failed')
      return 'ok'
    }
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('throws immediately on permanent errors (4xx)', async () => {
    const fn = async () => {
      throw new Error('Katana API error 401: Unauthorized')
    }
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow('401')
  })

  it('throws after max retries exhausted', async () => {
    const fn = async () => {
      throw new Error('fetch failed')
    }
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow('fetch failed')
  })

  it('calls onRetry callback', async () => {
    const onRetry = vi.fn()
    let calls = 0
    const fn = async () => {
      calls++
      if (calls < 2) throw new Error('ECONNRESET')
      return 'ok'
    }
    await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, onRetry })
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
  })
})

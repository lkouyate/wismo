import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkBillingAllowed, PLAN_LIMITS, getTrialDaysLeft } from '@/lib/billing'

describe('checkBillingAllowed', () => {
  // ── Free trial ──────────────────────────────────────────────
  it('allows active free trial', () => {
    const result = checkBillingAllowed({
      plan: 'free_trial',
      trialEndsAt: new Date(Date.now() + 7 * 86400000), // 7 days from now
    })
    expect(result.allowed).toBe(true)
  })

  it('blocks expired free trial', () => {
    const result = checkBillingAllowed({
      plan: 'free_trial',
      trialEndsAt: new Date(Date.now() - 86400000), // yesterday
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/trial.*expired/i)
  })

  it('blocks free trial with no expiry date', () => {
    const result = checkBillingAllowed({ plan: 'free_trial' })
    expect(result.allowed).toBe(false)
  })

  it('defaults to free_trial when plan is undefined', () => {
    const result = checkBillingAllowed({
      trialEndsAt: new Date(Date.now() + 86400000),
    })
    expect(result.allowed).toBe(true)
  })

  // ── Paid plan subscription status ───────────────────────────
  it('allows active paid plan under quota', () => {
    const result = checkBillingAllowed({
      plan: 'core',
      subscriptionStatus: 'active',
      queriesThisMonth: 10,
    })
    expect(result.allowed).toBe(true)
  })

  it('blocks canceled subscription', () => {
    const result = checkBillingAllowed({
      plan: 'enhanced',
      subscriptionStatus: 'canceled',
      queriesThisMonth: 0,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/inactive/i)
  })

  it('blocks unpaid subscription', () => {
    const result = checkBillingAllowed({
      plan: 'core',
      subscriptionStatus: 'unpaid',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/inactive/i)
  })

  it('blocks past_due subscription', () => {
    const result = checkBillingAllowed({
      plan: 'full',
      subscriptionStatus: 'past_due',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/payment.*failed/i)
  })

  // ── Quota enforcement ───────────────────────────────────────
  it('blocks when monthly quota reached', () => {
    const result = checkBillingAllowed({
      plan: 'core',
      subscriptionStatus: 'active',
      queriesThisMonth: 500,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/limit.*reached/i)
  })

  it('allows at quota minus one', () => {
    const result = checkBillingAllowed({
      plan: 'core',
      subscriptionStatus: 'active',
      queriesThisMonth: 499,
    })
    expect(result.allowed).toBe(true)
  })

  it('enforces same limit for all paid plans', () => {
    for (const plan of ['core', 'enhanced', 'full']) {
      const result = checkBillingAllowed({
        plan,
        subscriptionStatus: 'active',
        queriesThisMonth: 500,
      })
      expect(result.allowed).toBe(false)
    }
  })

  // ── Firestore timestamp compat ──────────────────────────────
  it('handles Firestore Timestamp-like objects with toDate()', () => {
    const futureDate = new Date(Date.now() + 86400000)
    const result = checkBillingAllowed({
      plan: 'free_trial',
      trialEndsAt: { toDate: () => futureDate },
    })
    expect(result.allowed).toBe(true)
  })

  it('handles Firestore Timestamp-like objects with seconds field', () => {
    const futureSeconds = Math.floor((Date.now() + 86400000) / 1000)
    const result = checkBillingAllowed({
      plan: 'free_trial',
      trialEndsAt: { seconds: futureSeconds },
    })
    expect(result.allowed).toBe(true)
  })
})

describe('getTrialDaysLeft', () => {
  it('returns positive days when trial is active', () => {
    const days = getTrialDaysLeft(new Date(Date.now() + 5 * 86400000))
    expect(days).toBeGreaterThanOrEqual(4)
    expect(days).toBeLessThanOrEqual(6)
  })

  it('returns negative days when trial is expired', () => {
    const days = getTrialDaysLeft(new Date(Date.now() - 3 * 86400000))
    expect(days).toBeLessThan(0)
  })

  it('returns null when no expiry set', () => {
    expect(getTrialDaysLeft(undefined)).toBeNull()
  })
})

describe('PLAN_LIMITS', () => {
  it('free_trial has unlimited (null) limit', () => {
    expect(PLAN_LIMITS.free_trial).toBeNull()
  })

  it('all paid plans have 500 limit', () => {
    expect(PLAN_LIMITS.core).toBe(500)
    expect(PLAN_LIMITS.enhanced).toBe(500)
    expect(PLAN_LIMITS.full).toBe(500)
  })
})

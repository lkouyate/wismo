import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

export const PLAN_LIMITS: Record<string, number | null> = {
  free_trial: null, // unlimited but time-gated
  core: 500,
  enhanced: 500,
  full: 500,
}

interface MfgBillingData {
  plan?: string
  trialEndsAt?: { toDate?: () => Date; seconds?: number } | Date
  subscriptionStatus?: string
  queriesThisMonth?: number
}

function toDate(v: MfgBillingData['trialEndsAt']): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate()
  }
  if (typeof (v as { seconds?: number }).seconds === 'number') {
    return new Date((v as { seconds: number }).seconds * 1000)
  }
  return null
}

export function checkBillingAllowed(mfg: MfgBillingData): { allowed: boolean; reason?: string } {
  const plan = mfg.plan ?? 'free_trial'
  const status = mfg.subscriptionStatus

  // Free trial: check expiry
  if (plan === 'free_trial') {
    const expiry = toDate(mfg.trialEndsAt)
    if (!expiry || expiry < new Date()) {
      return { allowed: false, reason: 'Your free trial has expired. Please upgrade to continue.' }
    }
    return { allowed: true }
  }

  // Paid plans: check subscription status
  if (status === 'canceled' || status === 'unpaid') {
    return { allowed: false, reason: 'Your subscription is inactive. Please update your billing.' }
  }

  if (status === 'past_due') {
    return { allowed: false, reason: 'Your payment failed. Please update your payment method.' }
  }

  // All paid plans: enforce 500 query/month limit
  const limit = PLAN_LIMITS[plan]
  if (limit !== null) {
    const used = mfg.queriesThisMonth ?? 0
    if (used >= limit) {
      return { allowed: false, reason: `Monthly query limit reached (${limit}). Please contact support to increase your limit.` }
    }
  }

  return { allowed: true }
}

export function getTrialDaysLeft(trialEndsAt: MfgBillingData['trialEndsAt']): number | null {
  const expiry = toDate(trialEndsAt)
  if (!expiry) return null
  return Math.ceil((expiry.getTime() - Date.now()) / 86400000)
}

/**
 * Atomically check billing + increment query count in a Firestore transaction.
 * Prevents race conditions where concurrent requests both pass the quota check.
 * Returns { allowed, reason } — if allowed, the counter is already incremented.
 */
export async function checkAndIncrementUsage(uid: string): Promise<{ allowed: boolean; reason?: string }> {
  const mfgRef = adminDb.collection('manufacturers').doc(uid)

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(mfgRef)
    const mfg = snap.data()
    if (!mfg) return { allowed: false, reason: 'Manufacturer not found' }

    const gate = checkBillingAllowed(mfg as MfgBillingData)
    if (!gate.allowed) return gate

    // Atomically increment within the transaction
    tx.update(mfgRef, {
      queriesThisMonth: FieldValue.increment(1),
      queriesTotal: FieldValue.increment(1),
    })

    return { allowed: true }
  })
}

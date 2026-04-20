/**
 * Client-safe billing utilities (no firebase-admin imports).
 * For server-only billing logic, use lib/billing.ts.
 */

export function getTrialDaysLeft(trialEndsAt: { toDate?: () => Date; seconds?: number } | Date | undefined | null): number | null {
  const expiry = toDate(trialEndsAt)
  if (!expiry) return null
  return Math.ceil((expiry.getTime() - Date.now()) / 86400000)
}

function toDate(v: { toDate?: () => Date; seconds?: number } | Date | undefined | null): Date | null {
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

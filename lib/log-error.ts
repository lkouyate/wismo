import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { sendAlert } from '@/lib/alert'

// Patterns that indicate a critical error worth alerting on
const CRITICAL_PATTERNS = [
  /billing/i, /payment/i, /auth.*fail/i, /token.*expired/i,
  /firebase.*unavailable/i, /quota/i, /rate.?limit/i,
]

export async function logError(
  uid: string | null,
  route: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  try {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? (error.stack ?? null) : null
    await adminDb.collection('errorLogs').add({
      uid: uid ?? null,
      route,
      message,
      stack,
      details: details ?? null,
      createdAt: FieldValue.serverTimestamp(),
    })

    // Send Slack alert for critical errors
    const isCritical = CRITICAL_PATTERNS.some(p => p.test(message))
    if (isCritical) {
      sendAlert({
        severity: 'critical',
        title: `Critical error in ${route}`,
        message,
        route,
        uid: uid ?? undefined,
      }).catch(() => {})
    }
  } catch {
    // Never throw from error logger
  }
}

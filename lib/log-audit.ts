import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

export async function logAudit(
  adminEmail: string,
  action: string,
  targetUid?: string | null,
  details?: Record<string, unknown>
) {
  try {
    await adminDb.collection('auditLog').add({
      adminEmail,
      action,
      targetUid: targetUid ?? null,
      details: details ?? null,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch {
    // Never throw from audit logger
  }
}

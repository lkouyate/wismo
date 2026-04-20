import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

type ApiService = 'anthropic' | 'ups' | 'katana'

export async function trackUsage(services: ApiService[]) {
  if (!services.length) return
  try {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const update: Record<string, FirebaseFirestore.FieldValue> = {}
    for (const s of services) update[s] = FieldValue.increment(1)
    await adminDb.doc(`systemStats/${today}`).set(update, { merge: true })
  } catch {
    // Never throw from usage tracker
  }
}

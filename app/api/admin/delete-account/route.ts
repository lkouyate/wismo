import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { logAudit } from '@/lib/log-audit'
import type { CollectionReference } from 'firebase-admin/firestore'

async function deleteCollection(ref: CollectionReference, batchSize = 100) {
  const snap = await ref.limit(batchSize).get()
  if (snap.empty) return
  const batch = adminDb.batch()
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
  await deleteCollection(ref, batchSize)
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    if (!decoded.wismo_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { uid } = await request.json()
    if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 })

    const mfgRef = adminDb.collection('manufacturers').doc(uid)

    // Delete all subcollections
    for (const sub of ['conversations', 'customers', 'escalations', 'processedMessages']) {
      await deleteCollection(mfgRef.collection(sub) as CollectionReference)
    }

    // Delete root doc
    await mfgRef.delete()

    await logAudit(decoded.email ?? 'unknown', 'delete_account', uid)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { logAudit } from '@/lib/log-audit'

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

    const { uid, suspended } = await request.json()
    if (!uid || typeof suspended !== 'boolean') {
      return NextResponse.json({ error: 'Missing uid or suspended' }, { status: 400 })
    }

    await adminDb.collection('manufacturers').doc(uid).update({ adminSuspended: suspended })
    await logAudit(decoded.email ?? 'unknown', suspended ? 'suspend' : 'reactivate', uid)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'
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

    const { action, targetUid, details } = await request.json()
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

    await logAudit(decoded.email ?? 'unknown', action, targetUid, details)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

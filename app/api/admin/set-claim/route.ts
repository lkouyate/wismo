import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  const idToken = authHeader.slice(7)
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)

    const adminEmail = process.env.WISMO_ADMIN_EMAIL
    if (!adminEmail || decoded.email !== adminEmail) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    await adminAuth.setCustomUserClaims(decoded.uid, { wismo_admin: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('set-claim error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

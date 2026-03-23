import { NextRequest, NextResponse } from 'next/server'
import { getKatanaOrder } from '@/lib/katana'
import { adminAuth, adminDb } from '@/lib/firebase-admin'

export async function GET(request: NextRequest) {
  try {
    const idToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const po = request.nextUrl.searchParams.get('po')
    if (!po) return NextResponse.json({ error: 'po parameter required' }, { status: 400 })

    const snap = await adminDb.collection('manufacturers').doc(decoded.uid).get()
    const apiKey = snap.data()?.katanaApiKey
    if (!apiKey) return NextResponse.json({ error: 'Katana not connected' }, { status: 400 })

    const order = await getKatanaOrder(apiKey, po)
    return NextResponse.json({ order })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

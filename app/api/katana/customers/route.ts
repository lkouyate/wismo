import { NextRequest, NextResponse } from 'next/server'
import { getKatanaCustomers } from '@/lib/katana'
import { adminAuth, adminDb } from '@/lib/firebase-admin'

export async function GET(request: NextRequest) {
  try {
    const idToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const snap = await adminDb.collection('manufacturers').doc(decoded.uid).get()
    const apiKey = snap.data()?.katanaApiKey
    if (!apiKey) return NextResponse.json({ error: 'Katana not connected' }, { status: 400 })

    const result = await getKatanaCustomers(apiKey)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

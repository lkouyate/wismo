import { NextRequest, NextResponse } from 'next/server'
import { testKatanaConnection } from '@/lib/katana'
import { adminDb, adminAuth } from '@/lib/firebase-admin'

export async function POST(request: NextRequest) {
  try {
    const { apiKey, idToken } = await request.json()
    if (!apiKey) return NextResponse.json({ error: 'apiKey required' }, { status: 400 })

    // Verify Firebase ID token
    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const result = await testKatanaConnection(apiKey)

    // Save API key and mark connected
    await adminDb.collection('manufacturers').doc(uid).update({
      katanaApiKey: apiKey,
      katanaConnected: true,
      updatedAt: new Date(),
    })

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

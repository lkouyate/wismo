import { NextRequest, NextResponse } from 'next/server'
import { trackUPSShipment } from '@/lib/ups'
import { adminAuth } from '@/lib/firebase-admin'

export async function GET(request: NextRequest) {
  try {
    const idToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await adminAuth.verifyIdToken(idToken)

    const tracking = request.nextUrl.searchParams.get('tracking')
    if (!tracking) return NextResponse.json({ error: 'tracking parameter required' }, { status: 400 })

    const result = await trackUPSShipment(tracking)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

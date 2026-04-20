import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { ensureFreshQBOToken, getQBOInvoiceByPO } from '@/lib/quickbooks'

export async function GET(request: NextRequest) {
  try {
    const idToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const decoded = await adminAuth.verifyIdToken(idToken)
    const snap = await adminDb.collection('manufacturers').doc(decoded.uid).get()
    const mfg = snap.data() as Record<string, unknown>
    if (!mfg?.qboConnected) return NextResponse.json({ error: 'QBO not connected' }, { status: 400 })
    const po = request.nextUrl.searchParams.get('po')
    if (!po) return NextResponse.json({ error: 'po param required' }, { status: 400 })
    const { accessToken } = await ensureFreshQBOToken(mfg, decoded.uid)
    const invoice = await getQBOInvoiceByPO(mfg.qboRealmId as string, accessToken, po)
    return NextResponse.json({ invoice })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

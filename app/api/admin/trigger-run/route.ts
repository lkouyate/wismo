import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { getKatanaOrder } from '@/lib/katana'
import { trackUPSShipment } from '@/lib/ups'
import { extractPONumber, generateWISMOResponse } from '@/lib/anthropic'
import { logError } from '@/lib/log-error'
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

    const { uid, customerEmail, customerCompany, customerMessage } = await request.json()
    if (!uid || !customerMessage) {
      return NextResponse.json({ error: 'Missing uid or customerMessage' }, { status: 400 })
    }

    const snap = await adminDb.collection('manufacturers').doc(uid).get()
    const mfg = snap.data()
    if (!mfg) return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })

    const fromEmail = customerEmail ?? 'test@customer.com'
    const fromCompany = customerCompany ?? 'Test Customer'

    const poNumber = await extractPONumber(customerMessage)

    let orderData = null
    let trackingData = null

    if (poNumber && mfg.katanaApiKey) {
      try {
        orderData = await getKatanaOrder(mfg.katanaApiKey, poNumber)
      } catch { /* ignore */ }
    }

    if (orderData) {
      const order = orderData as Record<string, unknown>
      const trackingNum = order.tracking_number as string | undefined
      if (trackingNum) {
        try {
          trackingData = await trackUPSShipment(trackingNum)
        } catch { /* ignore */ }
      }
    }

    const { response, confidence, dataSources } = await generateWISMOResponse({
      customerEmail: fromEmail,
      customerCompany: fromCompany,
      customerMessage,
      orderData: orderData as Record<string, unknown> | null,
      trackingData,
      responseStyle: mfg.agentSettings?.responseStyle ?? 'professional',
    })

    await logAudit(decoded.email ?? 'unknown', 'trigger_run', uid, { confidence })
    return NextResponse.json({ response, confidence, dataSources, poNumber, orderData, trackingData })
  } catch (err) {
    await logError(null, '/api/admin/trigger-run', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
